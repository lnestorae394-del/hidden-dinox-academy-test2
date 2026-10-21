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
 credential:{cert:x=>x},firestore(){return db},
 auth(){return{async getUserByEmail(e){const u=JSON.parse(fs.readFileSync(STORE,"utf8"))["__auth/"+e];if(!u){const er=new Error("not found");er.code="auth/user-not-found";throw er}return u},
   async createUser(o){const s=JSON.parse(fs.readFileSync(STORE,"utf8"));const u={uid:"emu_"+o.email.replace(/[^a-z0-9]/g,"_"),email:o.email};s["__auth/"+o.email]=u;fs.writeFileSync(STORE,JSON.stringify(s));if(db)db.store.set("__auth/"+o.email,u);return u}}}};`);
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
// --- scripts/test-seed.js: только эмулятор; создаёт тестового пользователя для 142807701 ---
fs.writeFileSync(store, "{}");
const EMU = { HD_TEST_MODE: "1", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", GCLOUD_PROJECT: "demo-hd-academy",
  POCKET_POSTBACK_SECRET: "local-test-secret-not-for-production-0001", TEST_POSTBACK_SECRET: "local-test-deposit-secret-only-0001", POSTBACK_DEFAULT_CURRENCY: "USD", PORT: "3000" };
const refuse = run("test-seed.js", [], { FIREBASE_KEY: KEY });
check("test-seed без HD_TEST_MODE (production-ключ) → отказ, база не тронута", refuse.status === 2 && /только с HD_TEST_MODE/.test(refuse.stderr) && fs.readFileSync(store, "utf8") === "{}", refuse.stderr);
const refuse2 = run("test-seed.js", [], { ...EMU, FIREBASE_KEY: KEY });
check("test-seed в тестовом режиме, но с FIREBASE_KEY → отказ", refuse2.status === 2 && /production-ключ/.test(refuse2.stderr), refuse2.stderr);
const seed = run("test-seed.js", [], EMU);
const st = JSON.parse(fs.readFileSync(store, "utf8"));
const uid = (st["__auth/test142807701@hd.test"] || {}).uid;
check("test-seed: пользователь создан, регистрация 142807701 подтверждена настоящим кодом postback, ID привязан",
  seed.status === 0 && /регистрация: registration_confirmed, этап: deposit/.test(seed.stdout) && st["trader_bindings/142807701"] && st["trader_bindings/142807701"].uid === uid && st["referrals/142807701"].academy.registration.verified === true, [seed.stdout, seed.stderr]);
check("test-seed выводит ссылку на тестовый депозит $69 USD", seed.stdout.includes("http://127.0.0.1:3000/test/deposit?trader_id=142807701&amount=69&currency=USD&test_secret=local-test-deposit-secret-only-0001"), seed.stdout);
const seed2 = run("test-seed.js", [], EMU);
check("повторный запуск test-seed безопасен (тот же пользователь, без ошибок)", seed2.status === 0 && Object.keys(JSON.parse(fs.readFileSync(store, "utf8"))).filter(k => k.startsWith("clicks/")).length === 1, [seed2.stdout, seed2.stderr]);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(out.join("\n")); console.log(`итого: ${out.length - failed} из ${out.length}`);
process.exit(failed ? 1 : 0);
