"use strict";
/* Проверка подключения академии к настоящему server.js без установки зависимостей.
   Express, firebase-admin, simple-git и боты заменяются заглушками ВО ВРЕМЕННОЙ ПАПКЕ.
   Сам server.js и модули academy/ — настоящие. */
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert/strict");
const ROOT = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hd-wiring-"));
const cp = (rel) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel)); };
cp("server.js"); for (const f of fs.readdirSync(path.join(ROOT, "academy"))) cp("academy/" + f);
const write = (rel, s) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), s); };
write("public/bot/bot.js", "module.exports={};");
write("public/bot/partnerBot.js", "module.exports={approveTrader(){ global.__approved=(global.__approved||0)+1 }};");
write("node_modules/simple-git/index.js", "module.exports=()=>({add:async()=>{},commit:async()=>{},push:async()=>{}});");
write("node_modules/firebase-admin/index.js", "module.exports={initializeApp(){},credential:{cert(){}},firestore(){return null},auth(){return{verifyIdToken:async()=>{throw new Error('x')}}}};");
write("node_modules/express/index.js", `
const stack=[];
function express(){ const app={settings:{},stack,
  use(...a){ const p=typeof a[0]==='string'?a.shift():'/'; for(const fn of a) stack.push({kind:'use',path:p,fn}); return app; },
  get(p,fn){ stack.push({kind:'get',path:p,fn}); return app; },
  post(p,fn){ stack.push({kind:'post',path:p,fn}); return app; },
  set(k,v){ app.settings[k]=v; return app; },
  listen(port,cb){ global.__listening=true; return {close(){}}; } }; global.__app=app; return app; }
express.static=(dir,opts)=>{ const f=(q,r,n)=>n(); f.__static=dir; f.__opts=opts; return f; };
express.json=()=>{ const f=(q,r,n)=>n(); f.__json=true; return f; };
express.Router=()=>{ const r={routes:[],use(...a){r.routes.push(['use',...a]);return r},get(p,f){r.routes.push(['get',p,f]);return r},post(p,f){r.routes.push(['post',p,f]);return r}}; const f=(q,s,n)=>n(); return Object.assign(f,r,{__router:r}); };
module.exports=express;`);

process.chdir(tmp);
delete process.env.FIREBASE_KEY; delete process.env.DEV_KEY;
const logs = []; const origLog = console.log, origWarn = console.warn;
console.log = (...a) => logs.push(a.join(" ")); console.warn = (...a) => logs.push(a.join(" "));
const realSetInterval = global.setInterval, realSetTimeout = global.setTimeout;
global.setInterval = () => 0; global.setTimeout = (f, ms) => (ms > 100 ? 0 : realSetTimeout(f, ms)); // не запускаем фоновые циклы старого сервера
require(path.join(tmp, "server.js"));
global.setInterval = realSetInterval; global.setTimeout = realSetTimeout;
console.log = origLog; console.warn = origWarn;

const app = global.__app, st = app.stack;
const idx = pred => st.findIndex(pred);
const res = () => { const r = { code: 200, body: null, headers: {} }; r.status = c => (r.code = c, r); r.send = b => (r.body = b, r); r.json = b => (r.body = b, r); r.set = (k, v) => (r.headers[k] = v, r); r.sendFile = f => (r.body = "file:" + f, r); r.redirect = u => (r.body = "redirect:" + u, r); return r; };
const results = [];
const check = (name, fn) => { try { fn(); results.push("✔ " + name); } catch (e) { results.push("✘ " + name + " — " + e.message); process.exitCode = 1; } };

const iPublicStatic = idx(l => l.kind === "use" && l.fn.__static === "public");
const iBlock = idx(l => l.kind === "use" && l.path === "/" && !l.fn.__static && !l.fn.__json && !l.fn.__router && l.fn.length === 3);
const iApi = idx(l => l.kind === "use" && l.path === "/api");
const iAcademy = idx(l => l.kind === "use" && l.path === "/academy" && l.fn.__static);
const iPages = idx(l => l.kind === "get" && l.path === "/deposit");
const iErr = idx(l => l.kind === "use" && l.fn.length === 4);

check("server.js загружается с модулями академии и запускает listen", () => assert.ok(global.__listening));
check("блокировка public/bot стоит ДО общей статики", () => { assert.ok(iBlock >= 0 && iBlock < iPublicStatic); });
check("/api подключён до общей статики и до обработчика ошибок", () => { assert.ok(iApi >= 0 && iApi < iPublicStatic && iApi < iErr); });
check("/academy раздаётся отдельной статикой без кеша HTML", () => {
  assert.ok(iAcademy >= 0 && iAcademy < iPublicStatic);
  const h = {}; st[iAcademy].fn.__opts.setHeaders({ setHeader: (k, v) => (h[k] = v) }, "/x/index.html");
  assert.equal(h["Cache-Control"], "no-cache");
});
check("маршруты /api: GET /me, POST /click, POST /trader-id", () => {
  const r = st[iApi].fn.__router.routes.map(x => x[0] + " " + (typeof x[1] === "string" ? x[1] : "*"));
  for (const want of ["get /me", "post /click", "post /trader-id"]) assert.ok(r.includes(want), want);
});
check("старые маршруты на месте (страницы, /check, /check-deposit, /postback, /price, /stats …)", () => {
  for (const p of ["/index", "/login", "/deposit", "/check", "/check-deposit", "/check-approve", "/postback", "/price", "/live", "/stats", "/dev-deposit", "/get-entry", "/setpair"]) assert.ok(st.some(l => l.kind === "get" && l.path === p), p);
});
check("запрос к /bot/bot.js и обходным путям получает 404", () => {
  for (const p of ["/bot/bot.js", "/BOT/partnerBot.js", "/%62ot/bot.js", "/x/../bot/bot.js"]) {
    const r = res(); let passed = false; st[iBlock].fn({ path: p }, r, () => (passed = true));
    assert.equal(passed, false, p); assert.equal(r.code, 404, p);
  }
  const r = res(); let passed = false; st[iBlock].fn({ path: "/academy/index.html" }, r, () => (passed = true)); assert.ok(passed);
});
check("/dev-deposit без заданного DEV_KEY отвечает forbidden (и без ключа, и с ключом)", () => {
  const h = st.find(l => l.kind === "get" && l.path === "/dev-deposit").fn;
  for (const q of [{ trader_id: "1", amount: "999" }, { key: "x", trader_id: "1", amount: "999" }]) { const r = res(); h({ query: q }, r); assert.equal(r.body, "forbidden"); }
});
check("без Firebase /api/me отвечает 503 CONFIG_MISSING", async () => {});

(async () => {
  const meH = st[iApi].fn.__router.routes.find(x => x[0] === "get" && x[1] === "/me")[2];
  const r = res(); await meH({ headers: { authorization: "Bearer " + "a".repeat(40) } }, r);
  check("без Firebase /api/me отвечает 503 CONFIG_MISSING (фактический вызов)", () => { assert.equal(r.code, 503); assert.equal(r.body.error, "CONFIG_MISSING"); });

  const pb = st.find(l => l.kind === "get" && l.path === "/postback").fn;
  const r2 = res(); await pb({ query: { click_id: "abcdef", trader_id: "777" }, ip: "1.2.3.4" }, r2);
  check("старый /postback продолжает отвечать OK после вставки академии", () => assert.equal(r2.body, "OK"));
  check("при старте выводится предупреждение: обработка postback академии выключена", () => assert.ok(logs.some(l => l.includes("обработка postback выключена"))));
  results.splice(results.findIndex(x => x.startsWith("✔ без Firebase /api/me отвечает 503 CONFIG_MISSING") && !x.includes("фактический")), 1);
  console.log(results.join("\n"));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
})();
