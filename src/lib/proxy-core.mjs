/**
 * Ядро обратного прокси KAGURA•KONSPEKT.
 *
 * Схема работы:
 *   браузер (iframe) → прокси → настоящий сайт → прокси → браузер
 *
 * Прокси делает три вещи:
 *   1. скачивает оригинал от имени сервера;
 *   2. вырезает заголовки запрета встраивания (X-Frame-Options, CSP frame-ancestors);
 *   3. переписывает ссылки в HTML/CSS, чтобы переходы оставались внутри прокси.
 *
 * Модуль намеренно написан на чистом JS: его используют и Next.js-маршрут,
 * и отдельный сервер на порту 2121 — логика одна на оба входа.
 */

/** Заголовки ответа, которые нельзя отдавать браузеру как есть. */
const DROP_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "strict-transport-security",
  "permissions-policy",
  "report-to",
  "nel",
]);

/** Заголовки запроса, которые не пересылаем на целевой сайт. */
const DROP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "origin",
  "referer",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
  "upgrade-insecure-requests",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Адреса, к которым прокси обращаться не должен (защита от SSRF). */
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.local$/i,
  /^metadata\./i,
];

/**
 * Признаки страницы-заглушки с проверкой браузера (reCAPTCHA, Cloudflare,
 * Turnstile). Такие страницы не содержат контента сайта — только челлендж.
 *
 * Прокси НЕ пытается их проходить: это защита от ботов на чужой стороне,
 * и обходить её мы не будем. Кроме того, это технически бесполезно —
 * токен проверки привязан к IP и TLS-отпечатку того, кто её прошёл,
 * поэтому через прокси страница уходила бы в бесконечный цикл.
 * Вместо этого мы честно сообщаем об этом и предлагаем открыть сайт
 * в обычном окне браузера, где пользователь — настоящий посетитель.
 */
const CHALLENGE_TITLES = [
  /checking your browser/i,
  /just a moment/i,
  /attention required/i,
  /verify(ing)? (that )?you are (a )?human/i,
  /один момент/i,
  /проверка браузера/i,
];

export function detectChallenge(html, headers = {}) {
  const get = (name) =>
    typeof headers.get === "function"
      ? headers.get(name) || ""
      : headers[name] || headers[name.toLowerCase()] || "";

  const text = String(html);

  // Объём видимого текста: у страницы-заглушки его почти нет,
  // у обычной страницы — много. Это главный критерий, потому что
  // скрипты Cloudflare встречаются и на нормальных сайтах.
  const visible = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const contentless = visible.length < 600;

  // 1. Cloudflare прямо помечает свои страницы блокировки
  if (get("cf-mitigated")) return "cloudflare";

  // 2. Заголовок страницы-заглушки — самый надёжный признак
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  if (CHALLENGE_TITLES.some((pattern) => pattern.test(title))) {
    return /recaptcha/i.test(title) ? "recaptcha" : "browser-check";
  }

  // 3. Параметры настоящего челленджа Cloudflare (у пассивного скрипта их нет)
  if (/cf_chl_opt|__cf_chl_|\/cdn-cgi\/challenge-platform\/h\//i.test(text)) {
    return "cloudflare";
  }

  // 4. Остальные признаки засчитываем, только если страница пустая.
  //    Иначе пассивный скрипт Cloudflare или обычная форма входа с капчей
  //    ошибочно считались бы проверкой браузера.
  if (!contentless) return null;

  if (/challenges\.cloudflare\.com\/turnstile/i.test(text)) return "turnstile";
  if (/challenge-platform/i.test(text)) return "cloudflare";
  if (/g-recaptcha|grecaptcha\.(enterprise|execute|render)/i.test(text)) {
    return "recaptcha";
  }
  return null;
}

/** true, если ссылку разрешено запрашивать. */
export function isAllowedTarget(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname;
    return !BLOCKED_HOSTS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

/** Строит ссылку на сам прокси для произвольного адреса. */
function toProxyUrl(proxyBase, absoluteUrl) {
  return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
}

/** Переводит относительную ссылку в абсолютную и заворачивает в прокси. */
function rewriteOne(value, pageUrl, proxyBase) {
  const raw = String(value).trim();
  if (!raw) return value;
  // Служебные схемы и якоря оставляем как есть
  if (/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(raw)) return raw;
  // Уже проксированные ссылки повторно не оборачиваем
  if (raw.startsWith(proxyBase)) return raw;
  try {
    const absolute = new URL(raw, pageUrl).toString();
    if (!/^https?:/i.test(absolute)) return raw;
    return toProxyUrl(proxyBase, absolute);
  } catch {
    return raw;
  }
}

/** Переписывает srcset: "a.png 1x, b.png 2x". */
function rewriteSrcset(value, pageUrl, proxyBase) {
  return String(value)
    .split(",")
    .map((part) => {
      const chunk = part.trim();
      if (!chunk) return chunk;
      const spaceIndex = chunk.search(/\s/);
      const link = spaceIndex === -1 ? chunk : chunk.slice(0, spaceIndex);
      const rest = spaceIndex === -1 ? "" : chunk.slice(spaceIndex);
      return rewriteOne(link, pageUrl, proxyBase) + rest;
    })
    .join(", ");
}

/**
 * Заменяет принудительную навигацию на безопасные обёртки.
 * Применяется к содержимому скриптов: именно там сайты делают
 * location.replace("https://...") и ломают показ внутри прокси.
 */
export function neutralizeNavigation(code) {
  const prefix = "(?:window\\.|self\\.|top\\.|parent\\.)?";
  return String(code)
    .replace(
      new RegExp(prefix + "location\\s*\\.\\s*(?:replace|assign)\\s*\\(", "g"),
      "window.__kkNav(",
    )
    .replace(
      new RegExp(prefix + "location\\s*\\.\\s*href\\s*=(?!=)", "g"),
      "window.__kkSetHref=",
    )
    .replace(
      new RegExp("(?:window|self|top|parent)\\s*\\.\\s*location\\s*=(?!=)", "g"),
      "window.__kkSetHref=",
    );
}

/** Переписывает url(...) внутри CSS. */
export function rewriteCss(css, pageUrl, proxyBase) {
  return String(css)
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, link) => {
      const next = rewriteOne(link, pageUrl, proxyBase);
      return `url(${quote}${next}${quote})`;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote, link) => {
      return `@import ${quote}${rewriteOne(link, pageUrl, proxyBase)}${quote}`;
    });
}

/**
 * Скрипт, который внедряется в проксируемую страницу.
 * Он направляет через прокси то, что нельзя переписать заранее:
 * запросы fetch/XMLHttpRequest и открытие новых окон.
 */
function buildRuntime(pageUrl, proxyBase) {
  return `<script data-kagura-proxy="1">(function(){
var BASE=${JSON.stringify(proxyBase)};
var PAGE=${JSON.stringify(pageUrl)};
function wrap(u){
  try{
    if(u==null) return u;
    var s=String(u);
    if(!s || s.indexOf(BASE)===0) return u;
    if(/^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(s)) return u;
    var abs=new URL(s,PAGE).toString();
    if(!/^https?:/i.test(abs)) return u;
    return BASE+"?url="+encodeURIComponent(abs);
  }catch(e){return u;}
}
/* Service Worker в прокси работать не может и лишь плодит ошибки 404 */
try{
  if(navigator.serviceWorker){
    navigator.serviceWorker.register=function(){return Promise.reject(new Error("disabled in proxy"));};
  }
}catch(e){}
var of=window.fetch;
if(of){window.fetch=function(input,init){
  /* credentials обязательны: прокси доступен только вошедшему пользователю */
  var opt=Object.assign({},init||{},{credentials:"include"});
  try{
    if(typeof input==="string"||input instanceof URL) return of(wrap(String(input)),opt);
    if(input&&input.url) return of(new Request(wrap(input.url),input),opt);
  }catch(e){}
  return of(input,opt);
};}
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){
  var a=[].slice.call(arguments); a[1]=wrap(u);
  try{this.withCredentials=true;}catch(e){}
  return xo.apply(this,a);
};
var wo=window.open;
window.open=function(u,n,f){ return wo.call(window,wrap(u),n,f); };

/* Многие сайты принудительно уводят себя на https или на канонический
   домен. Внутри прокси адрес теряет порт приложения, и переход обрывается.
   Переопределить location.replace/href в браузере невозможно, поэтому
   такие вызовы заменяются в самом коде страницы на __kkNav/__kkSetHref. */
function kkNav(u){
  try{
    var abs=new URL(String(u),location.href);
    /* сайт уводит сам на себя, меняя лишь схему или порт — игнорируем */
    if(abs.hostname===location.hostname && abs.pathname===location.pathname) return;
    var t=sameProxy(abs.href)?abs.href:wrap(abs.href);
    if(t) location.assign(t);
  }catch(e){}
}
function sameProxy(u){
  try{ return String(u).indexOf(BASE)===0; }catch(e){ return false; }
}
window.__kkNav=kkNav;
try{
  Object.defineProperty(window,"__kkSetHref",{
    configurable:true,
    get:function(){ return PAGE; },
    set:function(v){ kkNav(v); }
  });
}catch(e){}
})();</script>`;
}

/**
 * Переписывает HTML: ссылки, формы, ресурсы, стили.
 * Также убирает integrity — содержимое меняется, и проверка хеша сломала бы страницу.
 */
export function rewriteHtml(html, pageUrl, proxyBase) {
  let out = String(html);

  // <base href> задаёт основу для относительных ссылок — учитываем и удаляем
  let effectiveBase = pageUrl;
  const baseMatch = out.match(/<base\s[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>/i);
  if (baseMatch) {
    try {
      effectiveBase = new URL(baseMatch[2], pageUrl).toString();
    } catch {
      /* оставляем адрес страницы */
    }
    out = out.replace(baseMatch[0], "");
  }

  // Проверки целостности несовместимы с переписыванием
  out = out.replace(/\s(integrity|nonce)\s*=\s*(['"]).*?\2/gi, "");

  // CSP и правила встраивания могут приходить не только заголовком, но и
  // тегом <meta http-equiv>. Директива upgrade-insecure-requests переводила
  // наши http-ссылки на прокси в https и роняла загрузку на телефоне
  // (ERR_CONNECTION_REFUSED), поэтому такие мета-теги удаляем целиком.
  out = out.replace(
    /<meta[^>]+http-equiv\s*=\s*(['"])\s*(content-security-policy(-report-only)?|x-frame-options)\s*\1[^>]*>/gi,
    "",
  );

  // Атрибуты со ссылками
  out = out.replace(
    /\s(href|src|action|poster|data-src|data-href|formaction)\s*=\s*(['"])(.*?)\2/gi,
    (match, attr, quote, link) =>
      ` ${attr}=${quote}${rewriteOne(link, effectiveBase, proxyBase)}${quote}`,
  );
  out = out.replace(
    /\s(srcset|data-srcset|imagesrcset)\s*=\s*(['"])(.*?)\2/gi,
    (match, attr, quote, value) =>
      ` ${attr}=${quote}${rewriteSrcset(value, effectiveBase, proxyBase)}${quote}`,
  );

  // Встроенные скрипты: гасим принудительные переходы
  out = out.replace(
    /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, code) =>
      attrs.includes("data-kagura-proxy")
        ? match
        : `<script${attrs}>${neutralizeNavigation(code)}</script>`,
  );

  // Инлайновые стили и <style>
  out = out.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/gi,
    (match, attrs, css) =>
      `<style${attrs}>${rewriteCss(css, effectiveBase, proxyBase)}</style>`,
  );
  out = out.replace(
    /\sstyle\s*=\s*(['"])(.*?)\1/gi,
    (match, quote, css) =>
      ` style=${quote}${rewriteCss(css, effectiveBase, proxyBase)}${quote}`,
  );

  // Встраиваем перехватчик запросов как можно раньше
  const runtime = buildRuntime(effectiveBase, proxyBase);
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, (match, attrs) => `<head${attrs}>${runtime}`);
  } else {
    out = runtime + out;
  }
  return out;
}

/**
 * Выполняет проксирование.
 *
 * @param {object} options
 * @param {string} options.target        абсолютный адрес запрашиваемой страницы
 * @param {string} options.proxyBase     базовый адрес самого прокси
 * @param {string} [options.method]      HTTP-метод
 * @param {Headers|Map|object} [options.headers] заголовки исходного запроса
 * @param {ArrayBuffer|Buffer|string|null} [options.body] тело запроса
 * @returns {Promise<{status:number, headers:Record<string,string>, body:Buffer, contentType:string}>}
 */
export async function proxyRequest({
  target,
  proxyBase,
  method = "GET",
  headers = {},
  body = null,
}) {
  if (!isAllowedTarget(target)) {
    throw Object.assign(new Error("Адрес запрещён политикой прокси"), { status: 400 });
  }

  const outgoing = new Headers();
  const source =
    typeof headers.forEach === "function"
      ? headers
      : new Headers(/** @type {Record<string,string>} */ (headers));
  source.forEach((value, key) => {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase()) && !DROP_REQUEST_HEADERS.has(key.toLowerCase())) {
      outgoing.set(key, value);
    }
  });
  outgoing.set("User-Agent", BROWSER_UA);
  outgoing.set("Accept-Encoding", "identity");
  const targetUrl = new URL(target);
  outgoing.set("Referer", targetUrl.origin + "/");

  const response = await fetch(target, {
    method,
    headers: outgoing,
    body: body ?? undefined,
    redirect: "follow",
    // Локальные и приватные адреса уже отсеяны выше
  });

  const contentType = response.headers.get("content-type") || "";
  const finalUrl = response.url || target;

  const out = {};
  response.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (DROP_RESPONSE_HEADERS.has(name)) return;
    if (name === "location") {
      // Переадресация тоже должна остаться внутри прокси
      out.location = rewriteOne(value, finalUrl, proxyBase);
      return;
    }
    if (name === "set-cookie") return; // куки чужого домена нам не нужны
    out[key] = value;
  });

  let payload = Buffer.from(await response.arrayBuffer());
  let challenge = null;
  if (/text\/html/i.test(contentType)) {
    const original = payload.toString("utf8");
    challenge = detectChallenge(original, response.headers);
    payload = Buffer.from(rewriteHtml(original, finalUrl, proxyBase), "utf8");
  } else if (/text\/css/i.test(contentType)) {
    payload = Buffer.from(rewriteCss(payload.toString("utf8"), finalUrl, proxyBase), "utf8");
  } else if (/javascript|ecmascript/i.test(contentType)) {
    // Во внешних скриптах те же принудительные переходы
    payload = Buffer.from(neutralizeNavigation(payload.toString("utf8")), "utf8");
  }

  // Разрешаем встраивание в наш интерфейс
  delete out["x-frame-options"];
  out["content-length"] = String(payload.byteLength);
  out["cache-control"] = "no-store";
  // Заголовок читает интерфейс, чтобы не крутить бесконечную проверку
  if (challenge) out["x-kagura-challenge"] = challenge;

  return {
    status: response.status,
    headers: out,
    body: payload,
    contentType,
    challenge,
  };
}
