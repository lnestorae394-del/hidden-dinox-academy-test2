"use strict";
/* Реферальная программа и финансовый журнал: node --test tests/referral.test.js
   Настоящие обработчики, тестовая Firestore с ограничениями настоящего Firestore, настоящий путь доступа (postback). */
const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./helpers/fake-firestore");
const { fakeVerify, fakeRes, fakeReq } = require("./helpers/http");
const { adminCaller } = require("./helpers/router");
const { createAdminApi } = require("../academy/admin-api");
const { createAcademyApi } = require("../academy/api");
const { createAcademyPostback } = require("../academy/postback");
const { registerReferralRoutes, createReferral } = require("../academy/referral");
const SECRET = "test-postback-secret-0123456789abcdef";
const quiet = { log() {}, warn() {}, error() {} };

function setup(mode = "test") {
  process.env.REFERRAL_MODE = mode;
  const db = new FakeFirestore();
  let t = 1_800_000_000_000; const now = () => t;
  const academyApi = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet, now });
  const adminApi = createAdminApi({ db, verifyIdToken: fakeVerify, log: quiet, now });
  const pb = createAcademyPostback({ db, env: { POCKET_POSTBACK_SECRET: SECRET }, log: quiet, now });
  const routes = [];
  const router = { get: (p, h) => routes.push(["GET", p, h]), post: (p, h) => routes.push(["POST", p, h]), put: (p, h) => routes.push(["PUT", p, h]) };
  registerReferralRoutes(router, { db, academyApi, env: { REFERRAL_MODE: mode }, now, log: quiet });
  const U = async (method, path, { uid, body } = {}) => {
    for (const [m, p, h] of routes) {
      if (m !== method) continue;
      const rx = new RegExp("^" + p.replace(/:[a-z]+/g, "([^/]+)") + "$"); const mm = path.match(rx); if (!mm) continue;
      const params = {}; (p.match(/:[a-z]+/g) || []).forEach((k, i) => (params[k.slice(1)] = decodeURIComponent(mm[i + 1])));
      const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
      await h({ headers: uid ? { authorization: "Bearer testtoken-" + uid } : {}, body: body || {}, params, query: {} }, res); return res;
    }
    throw new Error("no route " + method + " " + path);
  };
  const A = adminCaller(adminApi);
  const user = (uid, extra = {}) => db.collection("users").doc(uid).set({ email: uid + "@test.local", role: "student", created_at: t - 1000, ...extra }, { merge: true });
  async function giveAccess(uid, trader) {          // настоящий путь: регистрация у брокера → привязка Trader ID → FTD $60 через postback
    await academyApi.me(fakeReq({ token: "testtoken-" + uid }), fakeRes());
    await pb.handle({ type: "registration", trader_id: trader, secret: SECRET });
    await academyApi.traderId(fakeReq({ token: "testtoken-" + uid, body: { traderId: trader } }), fakeRes());
    await pb.handle({ type: "ftd", trader_id: trader, amount: "60", currency: "USD", secret: SECRET });
  }
  return { db, U, A, user, giveAccess, advance: ms => { t += ms; }, pb, academyApi, now };
}
async function invite(s, referrer, invitee) {
  await s.user(referrer); await s.user(invitee);
  const me = await s.U("GET", "/referral/me", { uid: referrer });
  const r = await s.U("POST", "/referral/attach", { uid: invitee, body: { code: me.body.code } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); return me.body.code;
}
const ledger = async (db, uid) => (await db.collection("ledger").where("uid", "==", uid).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const bal = async (db, uid, mode = "test") => { const d = await db.collection("partner_balances").doc(`${uid}__${mode}`).get(); return d.exists ? d.data() : null; };

test("атрибуция: код постоянный, привязка один раз, не к себе, только новый аккаунт, неверный код отклонён", async () => {
  const s = setup();
  const code = await invite(s, "refA", "invB");
  assert.equal((await s.U("GET", "/referral/me", { uid: "refA" })).body.code, code);                 // код не меняется
  assert.equal((await s.U("POST", "/referral/attach", { uid: "invB", body: { code } })).body.already, true);
  await s.user("refA2"); const code2 = (await s.U("GET", "/referral/me", { uid: "refA2" })).body.code;
  assert.equal((await s.U("POST", "/referral/attach", { uid: "invB", body: { code: code2 } })).body.already, true);   // переназначить нельзя
  assert.equal((await s.db.collection("referral_invites").doc("invB").get()).data().referrer_uid, "refA");
  assert.equal((await s.U("POST", "/referral/attach", { uid: "refA", body: { code } })).statusCode, 409);          // сам себя
  await s.user("old", { created_at: 1_800_000_000_000 - 8 * 86400000 });
  assert.equal((await s.U("POST", "/referral/attach", { uid: "old", body: { code } })).body.error, "ACCOUNT_TOO_OLD");
  assert.equal((await s.U("POST", "/referral/attach", { uid: "invB", body: { code: "<script>" } })).statusCode, 400);
  assert.equal((await s.U("GET", "/referral/me", {})).statusCode, 401);
});

test("режим off (по умолчанию): статусы считаются, денег нет — ни начислений, ни заявок", async () => {
  const s = setup("off");
  await invite(s, "refA", "invB"); await s.giveAccess("invB", "60000001");
  const me = await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal(me.body.mode, "off"); assert.equal(me.body.invites[0].status, "qualified");
  assert.equal((await ledger(s.db, "refA")).length, 0); assert.deepEqual(me.body.balances, {});
  assert.equal((await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-00000001" } })).body.error, "REWARDS_DISABLED");
});

test("начисление только за подтверждённый FTD и выданный доступ; без депозита — нет", async () => {
  const s = setup();
  await invite(s, "refA", "invB");
  await s.academyApi.me(fakeReq({ token: "testtoken-invB" }), fakeRes());
  await s.pb.handle({ type: "registration", trader_id: "60000002", secret: SECRET });
  await s.academyApi.traderId(fakeReq({ token: "testtoken-invB", body: { traderId: "60000002" } }), fakeRes());
  let me = await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal(me.body.invites[0].status, "trader_confirmed"); assert.equal((await ledger(s.db, "refA")).length, 0);
  await s.pb.handle({ type: "ftd", trader_id: "60000002", amount: "20", currency: "USD", secret: SECRET });      // FTD ниже порога доступа
  me = await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal(me.body.invites[0].status, "ftd_confirmed"); assert.equal((await ledger(s.db, "refA")).length, 0);
  await s.pb.handle({ type: "redeposit", trader_id: "60000002", amount: "500", currency: "USD", secret: SECRET });  // повторный депозит доступа не даёт
  me = await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal(me.body.invites[0].status, "ftd_confirmed"); assert.equal((await ledger(s.db, "refA")).length, 0);
});

test("одно вознаграждение $10 на приглашённого: повторные пересчёты, повторный postback и параллельные запросы не дублируют", async () => {
  const s = setup();
  await invite(s, "refA", "invB"); await s.giveAccess("invB", "60000003");
  await Promise.all([1, 2, 3, 4].map(() => s.U("GET", "/referral/me", { uid: "refA" })));
  await s.pb.handle({ type: "ftd", trader_id: "60000003", amount: "60", currency: "USD", secret: SECRET });       // повторная доставка FTD
  await s.U("GET", "/referral/me", { uid: "refA" });
  const l = await ledger(s.db, "refA");
  assert.deepEqual(l.map(e => [e.type, e.amount_cents, e.mode]), [["reward", 1000, "test"]]);
  assert.equal((await bal(s.db, "refA")).available_cents, 1000);
  const me = await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal(me.body.invites[0].status, "rewarded");
  assert.equal(JSON.stringify(me.body.invites).includes("invB"), false);                                         // чужие данные не раскрываются
});

test("антифрод: тот же Trader ID или тот же email — без вознаграждения (flagged)", async () => {
  const s = setup();
  await invite(s, "refA", "invB"); await s.user("invB", { email: "refA@test.local" }); await s.giveAccess("invB", "60000004");
  const me = await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal(me.body.invites[0].status, "flagged"); assert.equal((await ledger(s.db, "refA")).length, 0);
});

test("заявки на вывод: минимум $50, резерв, идемпотентность, параллельные заявки не уводят в минус", async () => {
  const s = setup(); await s.user("boss", { role: "super_admin" });
  await invite(s, "refA", "invB"); await s.giveAccess("invB", "60000005"); await s.giveAccess("refA", "60000006");
  await s.U("GET", "/referral/me", { uid: "refA" });
  assert.equal((await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 10, request_id: "req-small-01" } })).body.error, "INVALID_AMOUNT");
  assert.equal((await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-00000001" } })).body.error, "INSUFFICIENT_BALANCE");
  const adj = await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: 50, reason: "Тестовая корректировка", op_id: "op-00000001" } });
  assert.equal(adj.statusCode, 200, JSON.stringify(adj.body));
  assert.equal((await bal(s.db, "refA")).available_cents, 6000);
  const [w1, w2, w1dup] = await Promise.all([
    s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-AAAA0001" } }),
    s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-BBBB0002" } }),
    s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-AAAA0001" } })]);
  const ok = [w1, w2].filter(r => r.statusCode === 200), bad = [w1, w2].filter(r => r.statusCode !== 200);
  assert.equal(ok.length, 1); assert.equal(bad[0].body.error, "INSUFFICIENT_BALANCE");
  const b = await bal(s.db, "refA"); assert.deepEqual([b.available_cents, b.reserved_cents], [1000, 5000]);
  assert.equal((await s.db.collection("withdrawals").get()).size, 1);
  if (w1.statusCode === 200) assert.equal(w1dup.body.withdrawal.id, w1.body.withdrawal.id);
});

test("отмена и отклонение освобождают резерв ровно один раз; «выплачено» — только с подтверждением и номером платежа", async () => {
  const s = setup(); await s.user("boss", { role: "super_admin" }); await s.user("adm", { role: "admin" });
  await s.user("refA"); await s.giveAccess("refA", "60000007");
  await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: 150, reason: "Тест", op_id: "op-00000002" } });
  const w = (await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-cancel01" } })).body.withdrawal;
  assert.equal((await s.U("POST", `/referral/withdrawals/${w.id}/cancel`, { uid: "refA" })).statusCode, 200);
  assert.equal((await s.U("POST", `/referral/withdrawals/${w.id}/cancel`, { uid: "refA" })).statusCode, 409);   // второй раз — нет
  await s.user("eve"); assert.equal((await s.U("POST", `/referral/withdrawals/${w.id}/cancel`, { uid: "eve" })).statusCode, 403);
  let b = await bal(s.db, "refA"); assert.deepEqual([b.available_cents, b.reserved_cents], [15000, 0]);
  const w2 = (await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-reject01" } })).body.withdrawal;
  assert.equal((await s.A("POST", `/withdrawals/${w2.id}/status`, { uid: "adm", body: { status: "rejected" } })).body.error, "REASON_REQUIRED");
  assert.equal((await s.A("POST", `/withdrawals/${w2.id}/status`, { uid: "adm", body: { status: "rejected", note: "Не подтверждён аккаунт" } })).statusCode, 200);
  assert.equal((await s.A("POST", `/withdrawals/${w2.id}/status`, { uid: "adm", body: { status: "rejected", note: "ещё раз" } })).statusCode, 409);
  const w3 = (await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 100, request_id: "req-paid0001" } })).body.withdrawal;
  assert.equal((await s.A("POST", `/withdrawals/${w3.id}/status`, { uid: "adm", body: { status: "paid", confirm: true, payment_reference: "X" } })).body.error, "INVALID_TRANSITION");   // сначала processing
  await s.A("POST", `/withdrawals/${w3.id}/status`, { uid: "adm", body: { status: "processing" } });
  assert.equal((await s.A("POST", `/withdrawals/${w3.id}/status`, { uid: "adm", body: { status: "paid" } })).body.error, "PAYMENT_CONFIRMATION_REQUIRED");
  assert.equal((await s.A("POST", `/withdrawals/${w3.id}/status`, { uid: "adm", body: { status: "paid", confirm: true, payment_reference: "PO-TRANSFER-123" } })).statusCode, 200);
  assert.equal((await s.A("POST", `/withdrawals/${w3.id}/status`, { uid: "adm", body: { status: "rejected", note: "поздно" } })).statusCode, 409);
  b = await bal(s.db, "refA"); assert.deepEqual([b.available_cents, b.reserved_cents, b.paid_cents], [5000, 0, 10000]);
  // журнал сходится с балансом: сумма записей = доступно; резерв = резервы − освобождения − выплаты
  const l = await ledger(s.db, "refA");
  assert.equal(l.reduce((n, e) => n + e.amount_cents, 0), b.available_cents);
  assert.equal(-l.filter(e => e.type === "reserve").reduce((n, e) => n + e.amount_cents, 0) - l.filter(e => e.type === "release").reduce((n, e) => n + e.amount_cents, 0) - b.paid_cents, b.reserved_cents);
  const audit = (await s.db.collection("audit_logs").get()).docs.map(d => d.data().action);
  for (const a of ["partner.adjust", "withdrawal.rejected", "withdrawal.processing", "withdrawal.paid"]) assert.ok(audit.includes(a), a);
});

test("корректировки: только super_admin, обязательная причина, без ухода в минус, идемпотентны по op_id", async () => {
  const s = setup(); await s.user("boss", { role: "super_admin" }); await s.user("adm", { role: "admin" }); await s.user("refA");
  assert.equal((await s.A("POST", "/partners/refA/adjust", { uid: "adm", body: { amount: 10, reason: "x", op_id: "op-00000003" } })).statusCode, 403);
  assert.equal((await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: 10, op_id: "op-00000003" } })).body.error, "REASON_REQUIRED");
  assert.equal((await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: -5, reason: "минус", op_id: "op-00000004" } })).body.error, "NEGATIVE_BALANCE");
  await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: 10, reason: "бонус", op_id: "op-00000005" } });
  const again = await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: 10, reason: "бонус", op_id: "op-00000005" } });
  assert.equal(again.body.duplicate, true); assert.equal((await bal(s.db, "refA")).available_cents, 1000);
});

test("админка партнёров: поиск по UID, Trader ID и коду; карточка; ученик без прав — 403", async () => {
  const s = setup(); await s.user("adm", { role: "admin" });
  const code = await invite(s, "refAuidAAAAAAAAAAAAAAAAAA", "invB"); await s.giveAccess("refAuidAAAAAAAAAAAAAAAAAA", "60000008");
  for (const q of ["refAuidAAAAAAAAAAAAAAAAAA", "60000008", code]) {
    const r = await s.A("GET", "/partners", { uid: "adm", query: { q } });
    assert.deepEqual(r.body.results.map(x => x.uid), ["refAuidAAAAAAAAAAAAAAAAAA"], q);
  }
  const p = await s.A("GET", "/partners/refAuidAAAAAAAAAAAAAAAAAA", { uid: "adm" });
  assert.equal(p.body.invites.length, 1); assert.equal(p.body.trader_id, "60000008");
  assert.equal((await s.A("GET", "/partners", { uid: "invB", query: { q: code } })).statusCode, 403);
  const st = await s.A("GET", "/partners/stats", { uid: "adm" }); assert.equal(st.body.invites_total, 1);
});

test("для заявки нужен подтверждённый Trader ID", async () => {
  const s = setup(); await s.user("boss", { role: "super_admin" }); await s.user("refA");
  await s.A("POST", "/partners/refA/adjust", { uid: "boss", body: { amount: 60, reason: "тест", op_id: "op-00000006" } });
  assert.equal((await s.U("POST", "/referral/withdrawals", { uid: "refA", body: { amount: 50, request_id: "req-notrader1" } })).body.error, "TRADER_REQUIRED");
});
