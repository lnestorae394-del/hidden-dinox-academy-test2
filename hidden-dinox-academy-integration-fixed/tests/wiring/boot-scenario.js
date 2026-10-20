"use strict";
/* Запускает настоящий server.js с заглушками зависимостей в отдельной временной папке
   и печатает JSON с наблюдениями. Используется test-mode-wiring.js. */
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hd-boot-"));
const cp = rel => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel)); };
const write = (rel, s) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), s); };
cp("server.js"); for (const f of fs.readdirSync(path.join(ROOT, "academy"))) cp("academy/" + f);
const FAKE_FS = JSON.stringify(path.join(ROOT, "tests/helpers/fake-firestore.js"));
write("public/bot/bot.js", "global.__obs.botsLoaded++; module.exports={};");
write("public/bot/partnerBot.js", "global.__obs.botsLoaded++; module.exports={approveTrader(){ global.__obs.approveCalls++ }};");
write("node_modules/simple-git/index.js", "module.exports=()=>({add:async()=>{},commit:async()=>{},push:async()=>{ global.__obs.gitPush++ }});");
write("node_modules/firebase-admin/index.js", `const {FakeFirestore}=require(${FAKE_FS}); let db=null;
module.exports={initializeApp(o){ global.__obs.initArgs=o&&o.projectId?{projectId:o.projectId}:{credential:!!(o&&o.credential)}; db=new FakeFirestore(); global.__db=db; },
 credential:{cert(x){return {cert:true}}}, firestore(){ return db; }, auth(){ return { verifyIdToken: async()=>{ throw new Error('x') } }; } };`);
write("node_modules/express/index.js", `const stack=[];function express(){const app={stack,use(...a){const p=typeof a[0]==='string'?a.shift():'/';for(const fn of a)stack.push({kind:'use',path:p,fn});return app},get(p,fn){stack.push({kind:'get',path:p,fn});return app},post(p,fn){stack.push({kind:'post',path:p,fn});return app},set(){return app},listen(){return{close(){}}}};global.__app=app;return app}
express.static=(d,o)=>{const f=(q,r,n)=>n();f.__static=d;return f};express.json=()=>(q,r,n)=>n();express.Router=()=>{const r={routes:[],use(){return r},get(p,f){r.routes.push(['get',p,f]);return r},post(p,f){r.routes.push(['post',p,f]);return r}};const f=(q,s,n)=>n();return Object.assign(f,r,{__router:r})};module.exports=express;`);

global.__obs = { botsLoaded: 0, approveCalls: 0, gitPush: 0, gitIntervals: 0, initArgs: null, started: false, error: null };
process.chdir(tmp);
const realSI = global.setInterval, realST = global.setTimeout, log = console.log, warn = console.warn;
global.setInterval = (fn, ms) => { if (ms === 300000) global.__obs.gitIntervals++; return 0; };
global.setTimeout = (f, ms) => (ms > 100 ? 0 : realST(f, ms));
console.log = () => {}; console.warn = () => {};
try { require(path.join(tmp, "server.js")); global.__obs.started = true; }
catch (e) { global.__obs.error = e.code || e.message; }
global.setInterval = realSI;

(async () => {
  if (global.__obs.started && process.argv[2] === "redeposit") {
    // Старая логика: партнёр найден в referrals → в обычном режиме вызывается approveTrader
    await global.__db.collection("referrals").doc("777").set({ trader_id: "777", click_id: "partner-click-1" });
    const h = global.__app.stack.find(l => l.kind === "get" && l.path === "/postback").fn;
    const res = { send() { return res; }, status() { return res; }, json() { return res; } };
    await h({ query: { type: "redeposit", trader_id: "777", click_id: "partner-click-1", amount: "60" }, ip: "127.0.0.1" }, res);
  }
  console.log = log; console.warn = warn;
  process.stdout.write(JSON.stringify(global.__obs));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})();
