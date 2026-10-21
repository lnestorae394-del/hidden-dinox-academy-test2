"use strict";
/* Запуск НАСТОЯЩИХ scripts/reprocess-deposits.js и scripts/audit-firestore.js как процессов.
   firebase-admin заменён на тестовую Firestore, заполненную данными «прошлой версии». */
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hd-cli-"));
const cp = rel => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel)); };
for (const f of fs.readdirSync(path.join(ROOT, "academy"))) cp("academy/" + f);
for (const f of fs.readdirSync(path.join(ROOT, "scripts"))) cp("scripts/" + f);
const store = path.join(tmp, "store.json");
fs.mkdirSync(path.join(tmp, "node_modules/firebase-admin"), { recursive: true });
fs.writeFileSync(path.join(tmp, "node_modules/firebase-admin/index.js"), `
const fs=require("fs");const {FakeFirestore}=require(${JSON.stringify(path.join(ROOT, "tests/helpers/fake-firestore.js"))});
let db=null;const STORE=${JSON.stringify(store)};
module.exports={initializeApp(){db=new FakeFirestore();db.store=new Map(Object.entries(JSON.parse(fs.readFileSync(STORE,"utf8"))));
  const run=db.runTransaction.bind(db);db.runTransaction=async f=>{const r=await run(f);fs.writeFileSync(STORE,JSON.stringify(Object.fromEntries(db.store)));return r};},
 credential:{cert:x=>x},firestore(){return db},auth(){return{}}};`);
// Данные ровно в формате прошлой версии: первый депозит без валюты
fs.writeFileSync(store, JSON.stringify({
  "users/u1": { email: "u1@test", click_id: "hd_click0001", trader_id: "20000001" },
  "clicks/hd_click0001": { uid: "u1" },
  "trader_bindings/20000001": { uid: "u1" },
  "referrals/20000001": { trader_id: "20000001", click_id: "hd_click0001", academy: {
    registration: { verified: true, click_id: "hd_click0001", uid: "u1", source: "registration" },
    first_deposit: { verified: true, click_id: "hd_click0001", uid: "u1", event_key: "fp_old1", at: 1, amount_cents: 5900, currency: null, usd_cents: null },
    deposit_totals: { unknown_currency_count: 1 }, deposit_count: 1 } },
  "deposit_events/fp_old1": { trader_id: "20000001", click_id: "hd_click0001", uid: "u1", kind: "ftd", amount_cents: 5900, currency: null, counted_in_totals: false, at: 1 }
}));
const KEY = JSON.stringify({ type: "service_account", project_id: "ai-boost-10540", private_key: "-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----\\n", client_email: "a@b" });
const run = (script, args, env = { FIREBASE_KEY: KEY }) => spawnSync(process.execPath, [path.join(tmp, "scripts", script), ...args], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", cwd: tmp });
const fd = () => JSON.parse(fs.readFileSync(store, "utf8"))["referrals/20000001"].academy;
const out = []; let failed = 0;
const check = (n, ok, info) => { out.push((ok ? "✔ " : "✘ ") + n + (ok ? "" : " — " + JSON.stringify(info).slice(0, 300))); if (!ok) failed++; };

const noKey = run("reprocess-deposits.js", [], {});
check("скрипт без FIREBASE_KEY: понятная ошибка, код 2", noKey.status === 2 && /Firebase не подключён: FIREBASE_KEY не задан/.test(noKey.stderr), noKey.stderr);
const audit1 = run("audit-firestore.js", []);
check("аудит: только чтение, находит первый депозит без валюты", audit1.status === 0 && JSON.parse(audit1.stdout).needs_reprocessing.first_deposits_without_currency === 1, audit1.stdout);
const dry = run("reprocess-deposits.js", ["--currency", "USD"]);
check("просмотр: показывает изменение, ничего не записывает", dry.status === 0 && /Режим просмотра/.test(dry.stdout) && /изменений будет: 1/.test(dry.stdout) && fd().first_deposit.currency === null, dry.stdout);
const noCur = run("reprocess-deposits.js", ["--apply"]);
check("без --currency записи без валюты не трогаются", noCur.status === 0 && /записано: 0/.test(noCur.stdout) && fd().first_deposit.currency === null, noCur.stdout);
const apply = run("reprocess-deposits.js", ["--currency", "USD", "--apply"]);
check("--currency USD --apply: первый депозит исправлен ($59, USD)", apply.status === 0 && fd().first_deposit.currency === "USD" && fd().first_deposit.usd_cents === 5900, [apply.stdout, fd().first_deposit]);
const again = run("reprocess-deposits.js", ["--currency", "USD", "--apply"]);
check("повторный запуск: 0 изменений, итог без дублей", /записано: 0/.test(again.stdout) && fd().deposit_totals.USD.sum_cents === 5900 && fd().deposit_totals.USD.count === 1, [again.stdout, fd().deposit_totals]);
check("закрытый ключ не выводится скриптами", ![noKey, dry, apply, again, audit1].some(r => /PRIVATE KEY/.test(r.stdout + r.stderr)));
const audit2 = run("audit-firestore.js", []);
check("аудит после исправления: записей без валюты нет", JSON.parse(audit2.stdout).needs_reprocessing.first_deposits_without_currency === 0);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(out.join("\n")); console.log(`итого: ${out.length - failed} из ${out.length}`);
process.exit(failed ? 1 : 0);
