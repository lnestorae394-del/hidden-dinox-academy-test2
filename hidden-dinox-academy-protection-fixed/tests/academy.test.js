"use strict";
/* Тесты серверной логики академии. Запуск: node --test tests/
   Используется тестовая Firestore в памяти и тестовая проверка токенов.
   Реальные postback, Firebase и production-данные НЕ используются. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./helpers/fake-firestore");
const { fakeReq, fakeRes, fakeVerify } = require("./helpers/http");
const { createAcademyApi } = require("../academy/api");
const { createAcademyPostback } = require("../academy/postback");
const { evaluateAccess, parseAmountToCents, ACCESS_MIN_USD_CENTS } = require("../academy/access");

const SECRET = "test-secret-0123456789abcdef-XYZ"; // ≥ 24 символов
const quiet = { log() {}, warn() {}, error() {} };
function setup(env = {}) {
  const db = new FakeFirestore();
  let n = 0;
  const api = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet, newClickId: () => "hd_testclick" + String(++n).padStart(4, "0") });
  const pb = createAcademyPostback({ db, env: { ACADEMY_POSTBACK_ENABLED: "1", POSTBACK_SECRET: SECRET, POSTBACK_DEFAULT_CURRENCY: "", ...env }, log: quiet });
  const call = async (h, uid, body) => { const res = fakeRes(); await api[h](fakeReq({ token: uid && "testtoken-" + uid, body }), res); return res; };
  const post = (q, ip) => pb.handle(q, { ip });
  // Полный путь пользователя до отправки ID
  async function onboard(uid, trader) {
    await call("me", uid);
    const c = await call("click", uid);
    const t = await call("traderId", uid, { traderId: trader });
    assert.equal(t.statusCode, 200);
    return c.body.clickId;
  }
  const reg = (click, trader, extra = {}) => post({ click_id: click, trader_id: trader, hd_key: SECRET, ...extra });
  const ftd = (click, trader, amount, extra = {}) => post({ click_id: click, trader_id: trader, amount: String(amount), currency: "USD", hd_key: SECRET, ...extra });
  const me = async uid => (await call("me", uid)).body;
  return { db, api, pb, call, post, onboard, reg, ftd, me };
}

/* ---------------- Регистрация и сессия ---------------- */
test("новый пользователь: профиль создаётся, этап — брокер, доступа нет", async () => {
  const s = setup();
  const r = await s.call("me", "u1");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.stage, "broker");
  assert.equal(r.body.academyAccess, false);
  assert.ok(s.db.dump("users").u1);
});

test("click_id устойчив: повторные и одновременные запросы возвращают один и тот же", async () => {
  const s = setup();
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => s.call("click", "u1")));
  const ids = new Set(results.map(r => r.body.clickId));
  assert.equal(ids.size, 1);
  const again = await s.call("click", "u1"); // «обновление страницы»
  assert.equal(again.body.clickId, [...ids][0]);
  assert.equal(Object.keys(s.db.dump("clicks")).length, 1);
});

test("после повторного входа этап восстанавливается из сервера", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  assert.equal((await s.me("u1")).stage, "deposit");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "60");
  assert.equal((await s.me("u1")).stage, "academy"); // «новая сессия» — тот же UID
});

test("неподтверждённая регистрация брокера не открывает доступ", async () => {
  const s = setup();
  await s.onboard("u1", "10000001");
  const p = await s.me("u1");
  assert.equal(p.brokerRegistrationConfirmed, false);
  assert.equal(p.academyAccess, false);
});

/* ---------------- Пороги первого депозита ---------------- */
const cases = [["0.00", false], ["30.00", false], ["39.99", false], ["40.00", true], ["45.00", true], ["49.99", true], ["50.00", true], ["120", true]];
for (const [amount, open] of cases) {
  test(`первый депозит $${amount} → доступ ${open ? "открыт" : "закрыт"}`, async () => {
    const s = setup();
    const click = await s.onboard("u1", "10000001");
    assert.equal((await s.reg(click, "10000001")).status, "registration_confirmed");
    assert.equal((await s.ftd(click, "10000001", amount)).status, "ftd_recorded");
    const p = await s.me("u1");
    assert.equal(p.academyAccess, open);
    assert.equal(p.depositState, open ? "ok" : "low");
    assert.equal(p.stage, open ? "academy" : "deposit");
  });
}

test("порог в коде — $40.00, в интерфейсе — $50, сумма $40 пользователю не показывается", () => {
  assert.equal(ACCESS_MIN_USD_CENTS, 4000);
  const fs = require("fs");
  const cfg = fs.readFileSync(__dirname + "/../public/academy/js/config.js", "utf8");
  assert.match(cfg, /minFirstDeposit:\s*50\b/);
  const ui = ["js/i18n-auth.js", "js/i18n-academy.js", "js/config.js", "js/pages/deposit.js", "deposit.html"]
    .map(f => fs.readFileSync(__dirname + "/../public/academy/" + f, "utf8")).join("\n");
  assert.doesNotMatch(ui, /\$\s?40\b|40\.00|\b4000\b/);
});

test("первый $39.99, затем повторный $100 — доступ остаётся закрыт", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "39.99");
  assert.equal((await s.ftd(click, "10000001", "100", { type: "redeposit" })).status, "redeposit_recorded");
  assert.equal((await s.ftd(click, "10000001", "100")).status, "ftd_exists_counted_as_deposit"); // второй «FTD» не заменяет первый
  const p = await s.me("u1");
  assert.equal(p.academyAccess, false);
  assert.equal(p.firstDeposit.amount, 39.99);
});

test("первый $40.00 и затем повторный депозит — доступ не закрывается", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "40.00");
  await s.ftd(click, "10000001", "5", { type: "redeposit" });
  const p = await s.me("u1");
  assert.equal(p.academyAccess, true);
  assert.equal(p.firstDeposit.amount, 40);
});

test("неизвестная или отсутствующая валюта не открывает доступ", async () => {
  for (const extra of [{ currency: "EUR" }, { currency: "" }, { currency: "XXX1" }]) {
    const s = setup();
    const click = await s.onboard("u1", "10000001");
    await s.reg(click, "10000001");
    await s.ftd(click, "10000001", "500", extra);
    const p = await s.me("u1");
    assert.equal(p.academyAccess, false, JSON.stringify(extra));
    assert.equal(p.firstDeposit, null); // сумма не в USD не показывается как подтверждённая
  }
});

test("валюта по умолчанию USD работает только если явно включена в конфигурации", async () => {
  const s = setup({ POSTBACK_DEFAULT_CURRENCY: "USD" });
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  await s.post({ click_id: click, trader_id: "10000001", amount: "40", hd_key: SECRET });
  assert.equal((await s.me("u1")).academyAccess, true);
});

test("неподтверждённая / некорректная сумма не открывает доступ", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  for (const bad of ["40,00", "1e3", "-50", "abc"]) assert.equal((await s.ftd(click, "10000001", bad)).status, "invalid_amount");
  assert.equal((await s.me("u1")).academyAccess, false);
  assert.equal(parseAmountToCents("39.999"), 3999); // лишние знаки отбрасываются, не округляются вверх
});

/* ---------------- Postback и целостность данных ---------------- */
test("повторный postback регистрации не стирает депозит (и старые поля через merge)", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "60");
  // Старый обработчик пишет legacy-поля с merge:true (исправление в server.js)
  await s.db.collection("referrals").doc("10000001").set({ trader_id: "10000001", click_id: click, created: 1 }, { merge: true });
  await s.reg(click, "10000001", { extra: "1" }); // другой отпечаток — не дубликат
  const ref = s.db.dump("referrals")["10000001"];
  assert.equal(ref.academy.first_deposit.usd_cents, 6000);
  assert.equal((await s.me("u1")).academyAccess, true);
});

test("старая запись без merge стёрла бы данные — подтверждает необходимость исправления", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "60");
  await s.db.collection("referrals").doc("10000001").set({ trader_id: "10000001", click_id: click, created: 1 }); // как было в старом коде
  assert.equal(s.db.dump("referrals")["10000001"].academy, undefined);
});

test("повторная доставка FTD не меняет сохранённый первый депозит", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  assert.equal((await s.ftd(click, "10000001", "39.99")).status, "ftd_recorded");
  assert.equal((await s.ftd(click, "10000001", "39.99")).status, "duplicate");
  assert.equal(s.db.dump("referrals")["10000001"].academy.first_deposit.usd_cents, 3999);
});

test("одновременная доставка одного события учитывается ровно один раз", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  const out = await Promise.all(Array.from({ length: 6 }, () => s.ftd(click, "10000001", "45")));
  assert.equal(out.filter(r => r.status === "ftd_recorded").length, 1);
  assert.equal(out.filter(r => r.status === "duplicate").length, 5);
});

test("поддельный postback (без секрета / с неверным секретом) ничего не пишет и не открывает доступ", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  const before = s.db.writes;
  assert.equal((await s.post({ click_id: click, trader_id: "10000001" })).status, "unverified");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", amount: "999", currency: "USD", hd_key: "wrong" })).status, "unverified");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", amount: "999", currency: "USD", hd_key: [SECRET, SECRET] })).status, "unverified");
  assert.equal(s.db.writes, before);
  assert.equal((await s.me("u1")).academyAccess, false);
});

test("по умолчанию обработка выключена; включённая без секрета — всё непроверенное (fail-closed)", async () => {
  const db = new FakeFirestore();
  const q = { click_id: "hd_testclick0001", trader_id: "1", amount: "50", currency: "USD", hd_key: SECRET };
  assert.equal((await createAcademyPostback({ db, env: {}, log: quiet }).handle(q)).status, "disabled");
  assert.equal((await createAcademyPostback({ db, env: { POSTBACK_SECRET: SECRET }, log: quiet }).handle(q)).status, "disabled");
  const on = createAcademyPostback({ db, env: { ACADEMY_POSTBACK_ENABLED: "1" }, log: quiet });
  assert.equal((await on.handle(q)).status, "unverified");
  assert.equal(on.config.secretConfigured, false);
  assert.equal(db.writes, 0);
});

test("ограничение по IP: при заданном списке посторонний IP не проходит", async () => {
  const s = setup({ POSTBACK_ALLOWED_IPS: "203.0.113.10" });
  const click = await s.onboard("u1", "10000001");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", hd_key: SECRET }, "198.51.100.7")).status, "unverified");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", hd_key: SECRET }, "203.0.113.10")).status, "registration_confirmed");
});

test("статический cid и чужие запасные параметры не используются как click_id / сумма", async () => {
  const s = setup();
  await s.onboard("u1", "10000001");
  assert.equal((await s.post({ click_id: "987453", trader_id: "10000001", hd_key: SECRET })).status, "invalid_click");
  assert.equal((await s.post({ cid: "987453", trader_id: "10000001", hd_key: SECRET })).status, "invalid_click");
  const click = (await s.call("click", "u1")).body.clickId;
  await s.reg(click, "10000001");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", payout: "500", currency: "USD", hd_key: SECRET })).status, "registration_exists");
  assert.equal((await s.me("u1")).academyAccess, false);
});

test("click_id, не выданный академией (старый AI BOOST), не создаёт подтверждений", async () => {
  const s = setup();
  assert.equal((await s.post({ click_id: "legacyclick12345", trader_id: "10000009", amount: "100", currency: "USD", hd_key: SECRET })).status, "unknown_click");
  assert.equal(s.db.dump("referrals")["10000009"], undefined);
});

/* ---------------- Trader ID и чужие данные ---------------- */
test("один Trader ID нельзя привязать к двум пользователям", async () => {
  const s = setup();
  await s.onboard("u1", "10000001");
  await s.call("me", "u2"); await s.call("click", "u2");
  const r = await s.call("traderId", "u2", { traderId: "10000001" });
  assert.equal(r.statusCode, 409); assert.equal(r.body.error, "TRADER_TAKEN");
});

test("занятый «захватчиком» ID переходит к владельцу, чья регистрация подтверждена postback", async () => {
  const s = setup();
  const victimClick = (await (async () => { await s.call("me", "victim"); return (await s.call("click", "victim")).body.clickId; })());
  await s.onboard("attacker", "10000001"); // захватчик успел привязать чужой ID
  await s.reg(victimClick, "10000001");     // партнёр подтвердил регистрацию по ссылке жертвы
  assert.equal((await s.me("attacker")).brokerRegistrationConfirmed, false);
  const r = await s.call("traderId", "victim", { traderId: "10000001" });
  assert.equal(r.statusCode, 200);
  assert.equal(s.db.dump("trader_bindings")["10000001"].uid, "victim");
  assert.equal((await s.me("attacker")).stage, "broker");
  await s.ftd(victimClick, "10000001", "50");
  assert.equal((await s.me("victim")).academyAccess, true);
  assert.equal((await s.me("attacker")).academyAccess, false);
});

test("чужая регистрация (другой click_id) не открывает доступ, даже с депозитом", async () => {
  const s = setup();
  const otherClick = (await (async () => { await s.call("me", "other"); return (await s.call("click", "other")).body.clickId; })());
  await s.reg(otherClick, "10000001"); await s.ftd(otherClick, "10000001", "500");
  await s.call("me", "u1"); await s.call("click", "u1");
  const r = await s.call("traderId", "u1", { traderId: "10000001" }); // ID свободен в bindings, но регистрация чужая
  assert.equal(r.statusCode, 200);
  const p = await s.me("u1");
  assert.equal(p.brokerRegistrationConfirmed, false);
  assert.equal(p.academyAccess, false);
  assert.equal(p.firstDeposit, null);
  assert.equal(p.deposits, null); // итоги чужой регистрации не раскрываются
});

test("Trader ID можно сменить до подтверждения депозита; прежняя привязка освобождается", async () => {
  const s = setup();
  await s.onboard("u1", "10000001");
  const r = await s.call("traderId", "u1", { traderId: "10000002" });
  assert.equal(r.statusCode, 200);
  const b = s.db.dump("trader_bindings");
  assert.equal(b["10000001"], undefined);
  assert.equal(b["10000002"].uid, "u1");
});

test("после подтверждённого первого депозита (даже ниже порога) смена Trader ID заблокирована", async () => {
  for (const amount of ["30", "60"]) {
    const s = setup();
    const click = await s.onboard("u1", "10000001");
    await s.reg(click, "10000001"); await s.ftd(click, "10000001", amount);
    assert.equal((await s.me("u1")).traderIdLocked, true);
    const r = await s.call("traderId", "u1", { traderId: "10000002" });
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, "ID_LOCKED");
  }
});

test("неверный формат Trader ID отклоняется", async () => {
  const s = setup();
  for (const bad of ["", "12ab", "123", "1".repeat(20), "../users"]) {
    const r = await s.call("traderId", "u1", { traderId: bad });
    assert.equal(r.statusCode, 400);
  }
});

/* ---------------- Безопасность API ---------------- */
test("без авторизации нельзя получить профиль и статус депозита", async () => {
  const s = setup();
  for (const h of ["me", "click", "traderId"]) {
    const res = fakeRes(); await s.api[h](fakeReq({}), res);
    assert.equal(res.statusCode, 401); assert.equal(res.body.error, "UNAUTHENTICATED");
  }
  const res = fakeRes(); await s.api.me({ headers: { authorization: "Bearer forged-token-xyz" } }, res);
  assert.equal(res.statusCode, 401);
});

test("пользователь видит только свои данные; UID из тела запроса игнорируется", async () => {
  const s = setup();
  const vClick = await s.onboard("victim", "10000001");
  await s.reg(vClick, "10000001"); await s.ftd(vClick, "10000001", "80");
  const r = await s.call("traderId", "eve", { traderId: "10000003", uid: "victim" });
  assert.equal(r.statusCode, 200);
  assert.equal(s.db.dump("users").victim.trader_id, "10000001"); // жертва не изменилась
  const eve = await s.me("eve");
  assert.equal(eve.email, "eve@test.local");
  assert.equal(eve.academyAccess, false);
  assert.equal(JSON.stringify(eve).includes("victim"), false);
});

test("клиент не может установить защищённые поля", async () => {
  const s = setup();
  await s.call("me", "u1");
  await s.call("traderId", "u1", { traderId: "10000001", academyAccess: true, hasDeposit: true, deposit: 999, brokerRegistrationConfirmed: true });
  const u = s.db.dump("users").u1;
  for (const k of ["academyAccess", "hasDeposit", "deposit", "brokerRegistrationConfirmed"]) assert.equal(k in u, false, k);
  assert.equal((await s.me("u1")).academyAccess, false);
});

test("ошибка Firestore: ответ 503, доступ не открывается, частичных записей нет", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  s.db.failAll = true;
  const r = await s.call("me", "u1");
  assert.equal(r.statusCode, 503); assert.equal(r.body.error, "UNAVAILABLE");
  assert.equal(r.body.academyAccess, undefined);
  await assert.rejects(s.reg(click, "10000001"));
  s.db.failAll = false;
  assert.equal(s.db.dump("referrals")["10000001"], undefined);
});

test("отсутствие конфигурации сервера (нет Firebase) не включает небезопасный режим", async () => {
  const api = createAcademyApi({ db: null, verifyIdToken: null, log: quiet });
  const res = fakeRes(); await api.me(fakeReq({ token: "testtoken-u1" }), res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.error, "CONFIG_MISSING");
  const pb = createAcademyPostback({ db: null, env: { ACADEMY_POSTBACK_ENABLED: "1", POSTBACK_SECRET: SECRET }, log: quiet });
  assert.equal((await pb.handle({ click_id: "hd_x1234567", trader_id: "1", hd_key: SECRET })).status, "no_db");
});

test("evaluateAccess: привязка чужого UID не даёт доступа", () => {
  const ev = evaluateAccess({ uid: "u1", user: { trader_id: "1", click_id: "c" }, binding: { uid: "u2" },
    referral: { academy: { registration: { verified: true, click_id: "c" }, first_deposit: { verified: true, click_id: "c", currency: "USD", usd_cents: 9000 } } } });
  assert.equal(ev.academyAccess, false); assert.equal(ev.stage, "broker");
});

/* ---------------- Отдельная проверка второго слоя защиты ---------------- */
test("статический cid из настроек отклоняется, даже если он похож на настоящий click_id", async () => {
  const s = setup({ PARTNER_STATIC_CIDS: "987453,staticcid12345" });
  await s.onboard("u1", "10000001");
  // Предположим, такой документ оказался в clicks (ошибка данных) — cid всё равно не принимается
  await s.db.collection("clicks").doc("staticcid12345").set({ uid: "u1" });
  assert.equal((await s.post({ click_id: "staticcid12345", trader_id: "10000001", hd_key: SECRET })).status, "invalid_click");
  assert.equal(s.db.dump("referrals")["10000001"], undefined);
});

test("расчёт доступа не принимает не-USD, даже если в данных оказалась сумма в usd_cents", () => {
  const ref = cur => ({ academy: {
    registration: { verified: true, click_id: "c1" },
    first_deposit: { verified: true, click_id: "c1", currency: cur, usd_cents: 9000 } } });
  const base = { uid: "u1", user: { trader_id: "10000001", click_id: "c1" }, binding: { uid: "u1" } };
  for (const cur of ["EUR", null, "usd", ""]) {
    const ev = evaluateAccess({ ...base, referral: ref(cur) });
    assert.equal(ev.academyAccess, false, String(cur));
    assert.equal(ev.firstDeposit, null);
  }
  assert.equal(evaluateAccess({ ...base, referral: ref("USD") }).academyAccess, true);
});

test("расчёт доступа не принимает непроверенные записи (verified !== true)", () => {
  const base = { uid: "u1", user: { trader_id: "10000001", click_id: "c1" }, binding: { uid: "u1" } };
  const ev = evaluateAccess({ ...base, referral: { academy: {
    registration: { verified: "true", click_id: "c1" },
    first_deposit: { verified: 1, click_id: "c1", currency: "USD", usd_cents: 9000 } } } });
  assert.equal(ev.academyAccess, false);
});

/* ================= Этап «тестовое окружение»: fail-closed и общая сумма ================= */
const redep = (s, click, trader, amount, extra = {}) => s.post({ type: "redeposit", click_id: click, trader_id: trader, amount: String(amount), currency: "USD", hd_key: SECRET, ...extra });

test("fail-closed: секрет задан, но в запросе отсутствует — событие отклоняется", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  const before = s.db.writes;
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", amount: "500", currency: "USD" })).status, "unverified");
  assert.equal(s.db.writes, before);
});

test("fail-closed: слишком короткий секрет считается ненастроенным, даже если совпадает", async () => {
  const s = setup({ POSTBACK_SECRET: "short-secret" });
  const click = await s.onboard("u1", "10000001");
  assert.equal((await s.post({ click_id: click, trader_id: "10000001", hd_key: "short-secret" })).status, "unverified");
  assert.equal(s.pb.config.secretTooShort, true);
  assert.equal((await s.me("u1")).academyAccess, false);
});

test("fail-closed: флаг включения не равен «1» — обработка выключена", async () => {
  for (const v of ["true", "yes", "0", ""]) {
    const s = setup({ ACADEMY_POSTBACK_ENABLED: v });
    const click = await s.onboard("u1", "10000001");
    assert.equal((await s.reg(click, "10000001")).status, "disabled", v);
  }
});

test("первый $35, затем повторный $100: доступ закрыт, FTD $35, общая сумма $135 за 2 депозита", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "35");
  assert.equal((await redep(s, click, "10000001", "100")).status, "redeposit_recorded");
  const p = await s.me("u1");
  assert.equal(p.academyAccess, false);
  assert.equal(p.firstDeposit.amount, 35);
  assert.deepEqual(p.deposits, { count: 2, totals: { USD: 135 }, unknownCurrencyCount: 0 });
});

test("первый $40, затем повторный $60: FTD остаётся $40, общая сумма $100, два уникальных депозита", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "40.00"); await redep(s, click, "10000001", "60");
  const p = await s.me("u1");
  assert.equal(p.academyAccess, true);
  assert.equal(p.firstDeposit.amount, 40);
  assert.deepEqual(p.deposits, { count: 2, totals: { USD: 100 }, unknownCurrencyCount: 0 });
  const ev = Object.values(s.db.dump("deposit_events"));
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map(e => e.kind).sort(), ["ftd", "redeposit"]);
});

test("повторная доставка одного депозита не меняет общую сумму", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "40");
  assert.equal((await redep(s, click, "10000001", "60")).status, "redeposit_recorded");
  assert.equal((await redep(s, click, "10000001", "60")).status, "duplicate");
  assert.equal((await s.ftd(click, "10000001", "40")).status, "duplicate");
  assert.deepEqual((await s.me("u1")).deposits.totals, { USD: 100 });
});

test("параллельная доставка одного события: учтено один раз", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "40");
  const out = await Promise.all(Array.from({ length: 8 }, () => redep(s, click, "10000001", "60")));
  assert.equal(out.filter(r => r.status === "redeposit_recorded").length, 1);
  const p = await s.me("u1");
  assert.deepEqual(p.deposits, { count: 2, totals: { USD: 100 }, unknownCurrencyCount: 0 });
});

test("параллельные РАЗНЫЕ депозиты: ни одно обновление итога не теряется", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "40");
  await Promise.all([10, 20, 30, 40, 50].map(a => redep(s, click, "10000001", a, { n: String(a) })));
  assert.deepEqual((await s.me("u1")).deposits, { count: 6, totals: { USD: 190 }, unknownCurrencyCount: 0 });
});

test("разные валюты не складываются; без валюты — только счётчик, сумма не учитывается", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001"); await s.ftd(click, "10000001", "40");
  await redep(s, click, "10000001", "10", { currency: "EUR" });
  await redep(s, click, "10000001", "999", { currency: "" });
  const p = await s.me("u1");
  assert.deepEqual(p.deposits, { count: 3, totals: { USD: 40, EUR: 10 }, unknownCurrencyCount: 1 });
  assert.equal(p.firstDeposit.amount, 40);
});

test("payout / profit / sum не учитываются как депозит клиента", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  for (const k of ["payout", "profit", "sum", "commission"]) await s.post({ click_id: click, trader_id: "10000001", [k]: "500", currency: "USD", hd_key: SECRET });
  const p = await s.me("u1");
  assert.deepEqual(p.deposits, { count: 0, totals: {}, unknownCurrencyCount: 0 });
  assert.equal(p.firstDeposit, null);
  assert.equal(Object.keys(s.db.dump("deposit_events")).length, 0);
});

test("повторный депозит с некорректной суммой отклоняется без записи", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  const before = s.db.writes;
  assert.equal((await redep(s, click, "10000001", "60,00")).status, "invalid_amount");
  assert.equal(s.db.writes, before);
});

test("итоги депозитов видит только владелец подтверждённой регистрации", async () => {
  const s = setup();
  const ownerClick = await s.onboard("owner", "10000001");
  await s.reg(ownerClick, "10000001"); await s.ftd(ownerClick, "10000001", "40"); await redep(s, ownerClick, "10000001", "60");
  await s.call("me", "nosy"); await s.call("click", "nosy");
  assert.equal((await s.call("traderId", "nosy", { traderId: "10000001" })).statusCode, 409);
  assert.equal((await s.me("nosy")).deposits, null);
  const fresh = setup(); await fresh.onboard("u1", "10000001");
  assert.equal((await fresh.me("u1")).deposits, null); // регистрация не подтверждена — итогов нет
});

test("клиент не может установить депозит, итоги или доступ через API", async () => {
  const s = setup();
  const click = await s.onboard("u1", "10000001");
  await s.reg(click, "10000001");
  const r = await s.call("traderId", "u1", { traderId: "10000001", deposits: { count: 9, totals: { USD: 9999 } }, firstDeposit: { amount: 999 }, deposit_count: 9, academy: { first_deposit: { usd_cents: 999999 } } });
  assert.equal(r.statusCode, 200);
  const p = await s.me("u1");
  assert.equal(p.academyAccess, false);
  assert.equal(p.firstDeposit, null);
  assert.deepEqual(p.deposits, { count: 0, totals: {}, unknownCurrencyCount: 0 });
  assert.equal(s.db.dump("referrals")["10000001"].academy.first_deposit, undefined);
});
