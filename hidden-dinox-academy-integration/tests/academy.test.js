"use strict";
/* Тесты серверной логики академии: node --test tests/academy.test.js
   Тестовая Firestore в памяти и тестовая проверка токенов. Реальные postback,
   Firebase, депозиты и выплаты НЕ используются. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./helpers/fake-firestore");
const { fakeReq, fakeRes, fakeVerify } = require("./helpers/http");
const { createAcademyApi } = require("../academy/api");
const { createAcademyPostback } = require("../academy/postback");
const { evaluateAccess, parseAmountToCents, ACCESS_MIN_USD_CENTS } = require("../academy/access");
const { parseServiceAccount } = require("../academy/firebase-init");

const SECRET = "test-secret-0123456789abcdef-XYZ"; // ≥ 24 символов
const quiet = { log() {}, warn() {}, error() {} };

function setup(env = {}) {
  const db = new FakeFirestore();
  let n = 0;
  const api = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet, newClickId: () => "hd_testclick" + String(++n).padStart(4, "0") });
  const pb = createAcademyPostback({ db, env: { POCKET_POSTBACK_SECRET: SECRET, ...env }, log: quiet });
  const call = async (h, uid, body) => { const res = fakeRes(); await api[h](fakeReq({ token: uid && "testtoken-" + uid, body }), res); return res; };
  const post = (q, ip) => pb.handle(q, { ip });
  const reg = (click, trader, extra = {}) => post({ click_id: click, trader_id: trader, secret: SECRET, ...extra });
  const ftd = (click, trader, amount, extra = {}) => post({ click_id: click, trader_id: trader, amount: String(amount), currency: "USD", secret: SECRET, ...extra });
  const redep = (click, trader, amount, extra = {}) => post({ type: "redeposit", click_id: click, trader_id: trader, amount: String(amount), currency: "USD", secret: SECRET, ...extra });
  const bind = (uid, traderId, extra = {}) => call("traderId", uid, { traderId, ...extra });
  const me = async uid => (await call("me", uid)).body;
  const clickOf = async uid => { await call("me", uid); return (await call("click", uid)).body.clickId; };
  // Полный правильный путь: аккаунт → переход по ссылке (click) → postback регистрации → ввод ID
  async function ready(uid, trader) {
    const click = await clickOf(uid);
    assert.equal((await reg(click, trader)).status, "registration_confirmed");
    const r = await bind(uid, trader);
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    return click;
  }
  return { db, api, pb, call, post, reg, ftd, redep, bind, me, clickOf, ready };
}

/* ======================= 1. Postback: аутентификация источника ======================= */
test("postback без настроенного POCKET_POSTBACK_SECRET → 503, ничего не записано", async () => {
  for (const env of [{ POCKET_POSTBACK_SECRET: "" }, { POCKET_POSTBACK_SECRET: "short-secret" }]) {
    const s = setup(env);
    const r = await s.post({ click_id: "hd_testclick0001", trader_id: "10000001", secret: "short-secret" });
    assert.equal(r.status, "not_configured"); assert.equal(r.http, 503);
    assert.equal(s.db.writes, 0);
  }
});

test("postback без secret → 401, с неверным → 403, повторённый параметр → 401; записей нет", async () => {
  const s = setup();
  const click = await s.clickOf("u1"); const before = s.db.writes;
  const a = await s.post({ click_id: click, trader_id: "10000001" });
  const b = await s.post({ click_id: click, trader_id: "10000001", secret: "wrong-secret-0123456789abcdef" });
  const c = await s.post({ click_id: click, trader_id: "10000001", secret: [SECRET, SECRET] });
  assert.deepEqual([a.http, b.http, c.http], [401, 403, 401]);
  assert.equal(s.db.writes, before);
});

test("ограничение по IP (если задано): посторонний IP → 403", async () => {
  const s = setup({ POSTBACK_ALLOWED_IPS: "203.0.113.10" });
  const click = await s.clickOf("u1");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", secret: SECRET }, "198.51.100.7")).http, 403);
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", secret: SECRET }, "203.0.113.10")).http, 200);
});

/* ======================= 2. Postback: параметры ======================= */
test("неподставленный макрос ({click_id}, {trader_id}, {sum}) → 400", async () => {
  const s = setup();
  const click = await s.clickOf("u1");
  for (const q of [{ click_id: "{click_id}", trader_id: "10000001" }, { click_id: click, trader_id: "{trader_id}" }, { click_id: click, trader_id: "10000001", amount: "{sum}" }]) {
    const r = await s.post({ ...q, secret: SECRET });
    assert.equal(r.status, "macro_not_substituted", JSON.stringify(q)); assert.equal(r.http, 400);
  }
});

test("некорректные параметры → 400; статический cid → 400; cid/sub1/payout не используются", async () => {
  const s = setup();
  const click = await s.clickOf("u1");
  const cases = [
    [{ click_id: click }, "invalid_trader"], [{ trader_id: "10000001" }, "invalid_click"],
    [{ click_id: "987453", trader_id: "10000001" }, "invalid_click"], [{ cid: click, trader_id: "10000001" }, "invalid_click"],
    [{ click_id: click, sub1: "10000001" }, "invalid_trader"], [{ click_id: click, trader_id: "10000001", type: "bonus" }, "unknown_type"],
    [{ click_id: click, trader_id: "10000001", type: "redeposit" }, "invalid_amount"], [{ click_id: click, trader_id: "10000001", amount: "40,00" }, "invalid_amount"],
    [{ click_id: click, trader_id: "10000001", amount: "1e3" }, "invalid_amount"], [{ click_id: click, trader_id: "10000001", amount: "-5" }, "invalid_amount"]
  ];
  for (const [q, status] of cases) { const r = await s.post({ ...q, secret: SECRET }); assert.equal(r.status, status, JSON.stringify(q)); assert.equal(r.http, 400); }
  assert.equal(Object.keys(s.db.dump("referrals")).length, 0);
});

test("click_id, не выданный академией (например, старый AI BOOST) → 422, ничего не записано", async () => {
  const s = setup();
  const r = await s.post({ click_id: "legacyclick12345", trader_id: "10000009", amount: "100", currency: "USD", secret: SECRET });
  assert.equal(r.status, "unknown_click"); assert.equal(r.http, 422);
  assert.equal(s.db.dump("referrals")["10000009"], undefined);
  assert.equal(Object.keys(s.db.dump("postback_events")).length, 0);
});

/* ======================= 3. Три вида событий и дубли ======================= */
test("регистрация → 200; повторная доставка → 200 duplicate; без изменений данных", async () => {
  const s = setup();
  const click = await s.clickOf("u1");
  const a = await s.reg(click, "10000001"), b = await s.reg(click, "10000001");
  assert.equal(a.status, "registration_confirmed"); assert.equal(a.http, 200);
  assert.equal(b.status, "duplicate"); assert.equal(b.http, 200);
  assert.equal(s.db.dump("referrals")["10000001"].academy.registration.click_id, click);
});

test("первый депозит и повторный депозит → 200; повторная доставка каждого — duplicate", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  assert.equal((await s.ftd(click, "10000001", "40")).status, "ftd_recorded");
  assert.equal((await s.ftd(click, "10000001", "40")).status, "duplicate");
  assert.equal((await s.redep(click, "10000001", "60")).status, "redeposit_recorded");
  assert.equal((await s.redep(click, "10000001", "60")).status, "duplicate");
  const p = await s.me("u1");
  assert.equal(p.firstDeposit.amount, 40);
  assert.deepEqual(p.deposits, { count: 2, totals: { USD: 100 }, unknownCurrencyCount: 0 });
});

test("Trader ID уже подтверждён с другим click_id → 409", async () => {
  const s = setup();
  const a = await s.clickOf("a"), b = await s.clickOf("b");
  await s.reg(a, "10000001");
  const r = await s.reg(b, "10000001");
  assert.equal(r.status, "conflict_click"); assert.equal(r.http, 409);
});

test("параллельная доставка одного события учитывается один раз", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000001", "40");
  const out = await Promise.all(Array.from({ length: 8 }, () => s.redep(click, "10000001", "60")));
  assert.equal(out.filter(r => r.status === "redeposit_recorded").length, 1);
  assert.deepEqual((await s.me("u1")).deposits, { count: 2, totals: { USD: 100 }, unknownCurrencyCount: 0 });
});

test("параллельные разные депозиты: итог не теряет обновлений", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000001", "40");
  await Promise.all([10, 20, 30, 40, 50].map(a => s.redep(click, "10000001", a, { n: String(a) })));
  assert.deepEqual((await s.me("u1")).deposits, { count: 6, totals: { USD: 190 }, unknownCurrencyCount: 0 });
});

test("ошибка Firebase при postback → 503 (платформа повторит), ничего не записано", async () => {
  const s = setup();
  const click = await s.clickOf("u1");
  s.db.failAll = true;
  const r = await s.reg(click, "10000001");
  s.db.failAll = false;
  assert.equal(r.status, "db_error"); assert.equal(r.http, 503);
  assert.equal(s.db.dump("referrals")["10000001"], undefined);
  assert.equal((await s.reg(click, "10000001")).status, "registration_confirmed"); // повтор после восстановления проходит
});

test("Firebase не подключён → postback 503", async () => {
  const pb = createAcademyPostback({ db: null, env: { POCKET_POSTBACK_SECRET: SECRET }, log: quiet });
  const r = await pb.handle({ click_id: "hd_testclick0001", trader_id: "10000001", secret: SECRET });
  assert.equal(r.status, "no_db"); assert.equal(r.http, 503);
});

/* ======================= 4. Защита Trader ID ======================= */
test("случайный Trader ID (без postback регистрации) отклоняется: 422", async () => {
  const s = setup();
  await s.clickOf("u1");
  const r = await s.bind("u1", "12345678");
  assert.equal(r.statusCode, 422); assert.equal(r.body.error, "TRADER_NOT_CONFIRMED");
  assert.equal(s.db.dump("users").u1.trader_id, null);
  assert.equal(s.db.dump("trader_bindings")["12345678"], undefined);
});

test("подтверждённый Trader ID (регистрация по ссылке этого пользователя) принимается", async () => {
  const s = setup();
  await s.ready("u1", "10000001");
  const p = await s.me("u1");
  assert.equal(p.stage, "deposit"); assert.equal(p.traderId, "10000001"); assert.equal(p.brokerRegistrationConfirmed, true);
});

test("чужой подтверждённый Trader ID отклоняется тем же ответом 422; владелец не затронут", async () => {
  const s = setup();
  const ownerClick = await s.ready("owner", "10000001");
  await s.ftd(ownerClick, "10000001", "60");
  await s.clickOf("eve");
  const r = await s.bind("eve", "10000001");
  assert.equal(r.statusCode, 422); assert.equal(r.body.error, "TRADER_NOT_CONFIRMED");
  assert.equal(s.db.dump("trader_bindings")["10000001"].uid, "owner");
  assert.equal((await s.me("owner")).academyAccess, true);
  assert.equal((await s.me("eve")).academyAccess, false);
});

test("ID, известный только по старой схеме AI BOOST (без подтверждения академии), отклоняется", async () => {
  const s = setup();
  const click = await s.clickOf("u1");
  await s.db.collection("referrals").doc("10000005").set({ trader_id: "10000005", click_id: click, deposit: 500 });
  const r = await s.bind("u1", "10000005");
  assert.equal(r.statusCode, 422);
});

test("пользователь, ни разу не получавший click_id, не может привязать ID", async () => {
  const s = setup();
  const other = await s.clickOf("other"); await s.reg(other, "10000001");
  await s.call("me", "u1");
  assert.equal((await s.bind("u1", "10000001")).statusCode, 422);
});

test("userId / approved / verified / depositAmount из браузера игнорируются", async () => {
  const s = setup();
  const victimClick = await s.ready("victim", "10000001");
  await s.ftd(victimClick, "10000001", "80");
  await s.clickOf("eve");
  const r = await s.bind("eve", "10000001", { userId: "victim", uid: "victim", approved: true, verified: true, depositAmount: 999, academyAccess: true, brokerRegistrationConfirmed: true });
  assert.equal(r.statusCode, 422);
  const u = s.db.dump("users").eve;
  for (const k of ["approved", "verified", "depositAmount", "academyAccess", "brokerRegistrationConfirmed", "userId"]) assert.equal(k in u, false, k);
  assert.equal(s.db.dump("users").victim.trader_id, "10000001");
});

test("смена на неподтверждённый ID отклоняется, текущая привязка сохраняется", async () => {
  const s = setup();
  await s.ready("u1", "10000001");
  assert.equal((await s.bind("u1", "10000002")).statusCode, 422);
  assert.equal(s.db.dump("users").u1.trader_id, "10000001");
  assert.equal(s.db.dump("trader_bindings")["10000001"].uid, "u1");
});

test("после подтверждённого первого депозита смена ID заблокирована (409 ID_LOCKED)", async () => {
  for (const amount of ["30", "60"]) {
    const s = setup();
    const click = await s.ready("u1", "10000001");
    await s.ftd(click, "10000001", amount);
    assert.equal((await s.me("u1")).traderIdLocked, true);
    const r = await s.bind("u1", "10000002");
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, "ID_LOCKED");
  }
});

test("устаревшая привязка другого аккаунта (из прежней версии) уступает подтверждённому владельцу", async () => {
  const s = setup();
  const click = await s.clickOf("owner");
  await s.db.collection("users").doc("squatter").set({ trader_id: "10000001", click_id: "hd_old" });
  await s.db.collection("trader_bindings").doc("10000001").set({ uid: "squatter" });
  await s.reg(click, "10000001");
  assert.equal((await s.bind("owner", "10000001")).statusCode, 200);
  assert.equal(s.db.dump("trader_bindings")["10000001"].uid, "owner");
  assert.equal(s.db.dump("users").squatter.trader_id, null);
  assert.equal((await s.me("squatter")).stage, "broker");
});

test("неверный формат Trader ID → 400", async () => {
  const s = setup();
  for (const bad of ["", "12ab", "123", "1".repeat(20), "../users"]) assert.equal((await s.bind("u1", bad)).statusCode, 400, bad);
});

/* ======================= 5. Депозиты и доступ ======================= */
const cases = [["0.00", false], ["30.00", false], ["39.99", false], ["40.00", true], ["45.00", true], ["49.99", true], ["50.00", true], ["120", true]];
for (const [amount, open] of cases) {
  test(`первый депозит $${amount} → доступ ${open ? "открыт" : "закрыт"}`, async () => {
    const s = setup();
    const click = await s.ready("u1", "10000001");
    assert.equal((await s.ftd(click, "10000001", amount)).status, "ftd_recorded");
    const p = await s.me("u1");
    assert.equal(p.academyAccess, open); assert.equal(p.depositState, open ? "ok" : "low"); assert.equal(p.stage, open ? "academy" : "deposit");
  });
}

test("депозит для неподтверждённого / не своего ID не открывает доступ", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000099", "500"); // другой ID с тем же click — не привязан к пользователю
  assert.equal((await s.me("u1")).academyAccess, false);
  const t = setup();
  const c2 = await t.clickOf("u2");
  await t.ftd(c2, "10000002", "500"); // депозит без привязки ID пользователем
  assert.equal((await t.me("u2")).academyAccess, false);
  assert.equal((await t.me("u2")).stage, "broker");
});

test("первый $35, затем повторный $100: доступ закрыт; FTD $35; итог $135 за 2 депозита", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000001", "35"); await s.redep(click, "10000001", "100");
  const p = await s.me("u1");
  assert.equal(p.academyAccess, false); assert.equal(p.firstDeposit.amount, 35);
  assert.deepEqual(p.deposits, { count: 2, totals: { USD: 135 }, unknownCurrencyCount: 0 });
});

test("второе событие без type после FTD не заменяет первый депозит, учитывается как депозит", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000001", "39.99");
  assert.equal((await s.ftd(click, "10000001", "100")).status, "ftd_exists_counted_as_deposit");
  const p = await s.me("u1");
  assert.equal(p.firstDeposit.amount, 39.99); assert.equal(p.academyAccess, false);
});

test("история депозитов хранится отдельно от итоговой суммы", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000001", "40"); await s.redep(click, "10000001", "60");
  const ev = Object.values(s.db.dump("deposit_events"));
  assert.deepEqual(ev.map(e => [e.kind, e.amount_cents]).sort(), [["ftd", 4000], ["redeposit", 6000]]);
  assert.deepEqual(s.db.dump("referrals")["10000001"].academy.deposit_totals, { USD: { sum_cents: 10000, count: 2 } });
});

test("неизвестная валюта не открывает доступ; разные валюты не складываются", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.ftd(click, "10000001", "500", { currency: "EUR" });
  await s.redep(click, "10000001", "10", { currency: "" });
  const p = await s.me("u1");
  assert.equal(p.academyAccess, false); assert.equal(p.firstDeposit, null);
  assert.deepEqual(p.deposits, { count: 2, totals: { EUR: 500 }, unknownCurrencyCount: 1 });
});

test("без параметра валюты: USD только если явно задан POSTBACK_DEFAULT_CURRENCY", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  await s.post({ click_id: click, trader_id: "10000001", amount: "60", secret: SECRET });
  assert.equal((await s.me("u1")).academyAccess, false);
  const t = setup({ POSTBACK_DEFAULT_CURRENCY: "USD" });
  const c = await t.ready("u1", "10000001");
  await t.post({ click_id: c, trader_id: "10000001", amount: "60", secret: SECRET });
  assert.equal((await t.me("u1")).academyAccess, true);
});

test("payout / profit / sum / commission не считаются депозитом клиента", async () => {
  const s = setup();
  const click = await s.ready("u1", "10000001");
  for (const k of ["payout", "profit", "sum", "commission"]) await s.post({ click_id: click, trader_id: "10000001", [k]: "500", currency: "USD", secret: SECRET, n: k });
  const p = await s.me("u1");
  assert.equal(p.firstDeposit, null); assert.deepEqual(p.deposits, { count: 0, totals: {}, unknownCurrencyCount: 0 });
});

test("в интерфейсе минимум $50; порог $40 пользователю не показывается", () => {
  assert.equal(ACCESS_MIN_USD_CENTS, 4000);
  const fs = require("fs"), base = __dirname + "/../public/academy/";
  assert.match(fs.readFileSync(base + "js/config.js", "utf8"), /minFirstDeposit:\s*50\b/);
  const ui = ["js/i18n-auth.js", "js/i18n-academy.js", "js/config.js", "js/pages/deposit.js", "deposit.html", "broker.html"].map(f => fs.readFileSync(base + f, "utf8")).join("\n");
  assert.doesNotMatch(ui, /\$\s?40\b|40\.00|\b4000\b/);
});

/* ======================= 6. API и сессия ======================= */
test("без токена и с поддельным токеном — 401 на всех защищённых маршрутах", async () => {
  const s = setup();
  for (const h of ["me", "click", "traderId"]) { const r = fakeRes(); await s.api[h](fakeReq({}), r); assert.equal(r.statusCode, 401); }
  const r = fakeRes(); await s.api.me({ headers: { authorization: "Bearer forged-token-xyz" } }, r); assert.equal(r.statusCode, 401);
});

test("пользователь видит только свои данные", async () => {
  const s = setup();
  const c = await s.ready("owner", "10000001"); await s.ftd(c, "10000001", "60");
  const eve = await s.me("eve");
  assert.equal(eve.traderId, null); assert.equal(eve.deposits, null); assert.equal(JSON.stringify(eve).includes("owner"), false);
});

test("click_id устойчив: повторные и одновременные запросы дают один", async () => {
  const s = setup();
  const ids = new Set((await Promise.all([1, 2, 3, 4, 5].map(() => s.call("click", "u1")))).map(r => r.body.clickId));
  assert.equal(ids.size, 1); assert.equal((await s.call("click", "u1")).body.clickId, [...ids][0]);
  assert.equal(Object.keys(s.db.dump("clicks")).length, 1);
});

test("статус после «перезагрузки» и повторного входа берётся из Firebase", async () => {
  const s = setup();
  assert.equal((await s.me("u1")).stage, "broker");
  const click = await s.ready("u1", "10000001");
  assert.equal((await s.me("u1")).stage, "deposit");
  await s.ftd(click, "10000001", "40");
  assert.equal((await s.me("u1")).stage, "academy");
});

test("ошибка Firestore в API → 503, доступ не открывается", async () => {
  const s = setup();
  await s.ready("u1", "10000001");
  s.db.failAll = true;
  const r = await s.call("me", "u1");
  s.db.failAll = false;
  assert.equal(r.statusCode, 503); assert.equal(r.body.academyAccess, undefined);
});

test("сервер без Firebase → API 503 CONFIG_MISSING", async () => {
  const api = createAcademyApi({ db: null, verifyIdToken: null, log: quiet });
  const r = fakeRes(); await api.me(fakeReq({ token: "testtoken-u1" }), r);
  assert.equal(r.statusCode, 503); assert.equal(r.body.error, "CONFIG_MISSING");
});

/* ======================= 7. Расчёт доступа — второй слой ======================= */
test("evaluateAccess: чужая привязка, не-USD, непроверенные записи — доступ закрыт", () => {
  const base = { uid: "u1", user: { trader_id: "10000001", click_id: "c1" }, binding: { uid: "u1" } };
  const ref = (fdOver = {}, regOver = {}) => ({ academy: { registration: { verified: true, click_id: "c1", ...regOver }, first_deposit: { verified: true, click_id: "c1", currency: "USD", usd_cents: 9000, ...fdOver } } });
  assert.equal(evaluateAccess({ ...base, referral: ref() }).academyAccess, true);
  assert.equal(evaluateAccess({ ...base, binding: { uid: "u2" }, referral: ref() }).academyAccess, false);
  for (const cur of ["EUR", null, "usd", ""]) assert.equal(evaluateAccess({ ...base, referral: ref({ currency: cur }) }).academyAccess, false, String(cur));
  assert.equal(evaluateAccess({ ...base, referral: ref({ verified: 1 }) }).academyAccess, false);
  assert.equal(evaluateAccess({ ...base, referral: ref({}, { verified: "true" }) }).academyAccess, false);
  assert.equal(evaluateAccess({ ...base, referral: ref({}, { click_id: "c2" }) }).academyAccess, false);
  assert.equal(evaluateAccess({ ...base, referral: ref({}, { click_id: "c2" }) }).deposits, null);
  assert.equal(parseAmountToCents("39.999"), 3999);
});

test("статический cid из настроек отклоняется, даже если похож на click_id", async () => {
  const s = setup({ PARTNER_STATIC_CIDS: "987453,staticcid12345" });
  await s.db.collection("clicks").doc("staticcid12345").set({ uid: "u1" });
  assert.equal((await s.reg("staticcid12345", "10000001")).status, "invalid_click");
});

/* ======================= 8. Инициализация Firebase ======================= */
test("FIREBASE_KEY: JSON, base64, кавычки, «\\n» в ключе; понятные ошибки; ключ не в тексте ошибки", () => {
  const ok = { type: "service_account", project_id: "ai-boost-10540", private_key: "-----BEGIN PRIVATE KEY-----\\nSECRETDATA\\n-----END PRIVATE KEY-----\\n", client_email: "x@y.iam.gserviceaccount.com" };
  const j = JSON.stringify(ok);
  for (const v of [j, Buffer.from(j).toString("base64"), "'" + j + "'", JSON.stringify(j), "\n " + j + " \n"]) {
    const r = parseServiceAccount(v); assert.equal(r.error, undefined); assert.ok(r.account.private_key.includes("\n"));
  }
  for (const v of ["", j.slice(0, 40), JSON.stringify({ ...ok, private_key: undefined }), JSON.stringify({ ...ok, type: "x" })]) {
    const r = parseServiceAccount(v); assert.ok(r.error); assert.doesNotMatch(r.error, /SECRETDATA/);
  }
});

test("Firebase: ключ другого проекта не принимается", () => {
  const { initFirebase } = require("../academy/firebase-init");
  const key = JSON.stringify({ type: "service_account", project_id: "other-project", private_key: "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----\n", client_email: "a@b" });
  let inited = false;
  const r = initFirebase({ admin: { initializeApp() { inited = true; }, credential: { cert: x => x }, firestore: () => ({}) }, env: { FIREBASE_KEY: key }, log: quiet });
  assert.equal(r.db, null); assert.match(r.reason, /other-project/); assert.equal(inited, false);
});
