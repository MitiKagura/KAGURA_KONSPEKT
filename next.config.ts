import type { NextConfig } from "next";

/**
 * MathJax динамически загружает расширения и диапазоны шрифтов по вложенным URL.
 * Правила 1–8 сегментов направляют их в защищённый локальный обработчик.
 */
function mathJaxRewrites(prefix: string) {
  return Array.from({ length: 8 }, (_, index) => 8 - index).map((depth) => {
    const source = Array.from({ length: depth }, (_, i) => `:p${i}`).join("/");
    return {
      source: `/${prefix}/${source}`,
      destination: "/api/mathjax",
    };
  });
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      ...mathJaxRewrites("mathjax"),
      ...mathJaxRewrites("mathjax-newcm"),
    ];
  },
};

export default nextConfig;
