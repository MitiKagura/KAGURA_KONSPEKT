import { chromium } from "playwright";
const b=await chromium.launch(); const p=await b.newPage();
await p.goto("http://127.0.0.1:3000/login");
console.log(JSON.stringify(await p.evaluate(()=>{
  const r={};
  try{ const o=location.replace; location.replace=function(){r.calledOverride=true;};
    r.assignable=location.replace!==o; location.replace=o; }catch(e){ r.assignErr=String(e).slice(0,60); }
  try{ const d=Object.getOwnPropertyDescriptor(Location.prototype,"href");
    r.hrefDescriptor=!!d, r.hrefConfigurable=d?.configurable; }catch(e){ r.hrefErr=String(e).slice(0,50); }
  try{ Object.defineProperty(location,"href",{configurable:true,get:()=>"x",set:()=>{}}); r.defineOk=true; }
  catch(e){ r.defineErr=String(e).slice(0,70); }
  return r;
}),null,1));
await b.close();
