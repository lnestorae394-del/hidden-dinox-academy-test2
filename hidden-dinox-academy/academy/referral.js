"use strict";
/* HIDDEN DINOX ACADEMY — реферальная программа и финансовый журнал партнёров.

   РЕЖИМ (переменная окружения REFERRAL_MODE):
     off  (по умолчанию) — атрибуция и статистика работают, денежная часть ОТКЛЮЧЕНА: ни начислений, ни заявок;
     test — начисления и заявки создаются с пометкой mode:"test" (не являются реальными обязательствами);
     live — реальные начисления. Включать только после проверки условий Pocket Partners (мотивированный трафик,
            перераспределение комиссии, способ выплат) и юридической проверки.

   ПРАВИЛА (сервер, браузеру не доверяем):
   - атрибуция: код приглашения сохраняется при регистрации; привязка один раз, не к себе, только к новому аккаунту;
   - вознаграждение REWARD_CENTS одно на приглашённого: только если у приглашённого подтверждена регистрация
     у брокера (Trader ID), подтверждён первый депозит (postback) и фактически выдан доступ к академии (те же
     правила, что для входа в академию), и пройдены антифрод-проверки; ID записи журнала детерминирован → дубли невозможны;
   - журнал ledger неизменяем: каждая операция — отдельная запись с уникальным ID; исправления — компенсирующими записями;
   - заявка на вывод от MIN_WITHDRAW_CENTS резервирует сумму в транзакции; отмена/отклонение освобождают резерв ровно один раз;
   - «выплачено» — только по явному подтверждению администратора с номером платежа. */
const crypto = require("crypto");
const { evaluateAccess, registrationOf } = require("./access");
const R = require("./roles");

const REWARD_CENTS = 1000, MIN_WITHDRAW_CENTS = 5000, CURRENCY = "USD";
const ATTACH_WINDOW_MS = 7 * 86400000;                       // привязать приглашение можно только к аккаунту не старше 7 дней
const CODE_RE = /^[A-Z2-9]{8}$/;
const STATUSES = ["registered", "trader_confirmed", "ftd_confirmed", "access_granted", "qualified", "rewarded", "flagged"];
const W_STATUSES = ["pending", "processing", "paid", "rejected", "cancelled"];
const modeOf = env => (["test", "live"].includes(env.REFERRAL_MODE) ? env.REFERRAL_MODE : "off");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const genCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; const b = crypto.randomBytes(8); for (let i = 0; i < 8; i++) s += A[b[i] % A.length]; return s; };
class RefError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }

function createReferral({ db, env = process.env, now = () => Date.now() }) {
  const col = n => db.collection(n);
  const MODE = modeOf(env);
  const balRef = (uid, mode) => col("partner_balances").doc(`${uid}__${mode}`);

  /* Состояние приглашённого — те же правила, что у доступа в академию (access.js) */
  async function stateOf(uid) {
    const u = await col("users").doc(uid).get(); const user = u.exists ? u.data() : null;
    let binding = null, referral = null, regOwner = null;
    if (user && user.trader_id) {
      const [b, r] = await Promise.all([col("trader_bindings").doc(String(user.trader_id)).get(), col("referrals").doc(String(user.trader_id)).get()]);
      binding = b.exists ? b.data() : null; referral = r.exists ? r.data() : null;
      const reg = referral ? registrationOf(referral) : null;
      if (reg && !reg.uid && typeof reg.click_id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(reg.click_id)) { const c = await col("clicks").doc(reg.click_id).get(); regOwner = c.exists ? c.data().uid : null; }
    }
    return { user, ev: evaluateAccess({ uid, user, binding, referral, regOwner }) };
  }

  async function ensureCode(uid) {
    const uref = col("users").doc(uid);
    for (let i = 0; i < 5; i++) {
      const code = genCode();
      const got = await db.runTransaction(async tx => {
        const u = await tx.get(uref); if (u.exists && u.data().ref_code) return u.data().ref_code;
        const c = await tx.get(col("ref_codes").doc(code)); if (c.exists) return null;        // коллизия — новый код
        tx.create(col("ref_codes").doc(code), { uid, created_at: now() });
        tx.set(uref, { ref_code: code }, { merge: true });
        return code;
      });
      if (got) return got;
    }
    throw new RefError(503, "UNAVAILABLE");
  }

  /* Привязка приглашения к новому аккаунту (идемпотентно) */
  async function attach(inviteeUid, rawCode) {
    const code = String(rawCode || "").toUpperCase();
    if (!CODE_RE.test(code)) throw new RefError(400, "INVALID_CODE");
    return db.runTransaction(async tx => {
      const [c, u, inv] = await Promise.all([tx.get(col("ref_codes").doc(code)), tx.get(col("users").doc(inviteeUid)), tx.get(col("referral_invites").doc(inviteeUid))]);
      if (inv.exists) return { ok: true, already: true };
      if (!c.exists) throw new RefError(404, "INVALID_CODE");
      const referrer = c.data().uid;
      if (referrer === inviteeUid) throw new RefError(409, "SELF_REFERRAL");
      const user = u.exists ? u.data() : null;
      if (!user) throw new RefError(409, "PROFILE_MISSING");
      if (user.referred_by) return { ok: true, already: true };
      if (!(user.created_at && now() - user.created_at <= ATTACH_WINDOW_MS)) throw new RefError(409, "ACCOUNT_TOO_OLD");
      if (R.RANK[R.roleOf(user)] >= R.RANK.team_member) throw new RefError(409, "STAFF_ACCOUNT");
      tx.create(col("referral_invites").doc(inviteeUid), { referrer_uid: referrer, invitee_uid: inviteeUid, code, status: "registered", flags: [], created_at: now(), updated_at: now() });
      tx.set(col("users").doc(inviteeUid), { referred_by: { uid: referrer, code, at: now() } }, { merge: true });
      return { ok: true };
    });
  }

  /* Пересчёт статуса приглашения и (в режиме test/live) единственное начисление */
  async function evaluate(inv) {
    const [st, refState] = await Promise.all([stateOf(inv.invitee_uid), stateOf(inv.referrer_uid)]);
    const ev = st.ev, flags = [];
    if (ev.traderId && refState.ev.traderId && String(ev.traderId) === String(refState.ev.traderId)) flags.push("same_trader_id");
    if (st.user && refState.user && st.user.email && refState.user.email && st.user.email.toLowerCase() === refState.user.email.toLowerCase()) flags.push("same_email");
    if (st.user && st.user.blocked) flags.push("invitee_blocked");
    if (refState.user && refState.user.blocked) flags.push("referrer_blocked");
    if (st.user && R.RANK[R.roleOf(st.user)] >= R.RANK.team_member) flags.push("staff_invitee");
    let status = "registered";
    if (ev.brokerRegistrationConfirmed) status = "trader_confirmed";
    if (ev.firstDeposit && ev.firstDeposit.amount != null) status = "ftd_confirmed";
    if (ev.academyAccess) status = "access_granted";
    if (status === "access_granted") status = flags.length ? "flagged" : "qualified";
    const invRef = col("referral_invites").doc(inv.invitee_uid);
    return db.runTransaction(async tx => {
      const cur = await tx.get(invRef); if (!cur.exists) return null;
      const d = cur.data();
      const rewardMode = MODE === "off" ? null : MODE;
      const entryId = rewardMode ? `reward_${rewardMode}_${inv.invitee_uid}` : null;
      const entry = entryId ? await tx.get(col("ledger").doc(entryId)) : null;
      const bal = rewardMode ? await tx.get(balRef(d.referrer_uid, rewardMode)) : null;
      let newStatus = d.status === "rewarded" ? "rewarded" : status;
      if (rewardMode && status === "qualified" && entry && !entry.exists) {
        const b = bal.exists ? bal.data() : { available_cents: 0, reserved_cents: 0, paid_cents: 0, earned_cents: 0 };
        tx.create(col("ledger").doc(entryId), { uid: d.referrer_uid, type: "reward", amount_cents: REWARD_CENTS, currency: CURRENCY, mode: rewardMode, ref: { invitee_uid: inv.invitee_uid }, reason: "Квалифицированный приглашённый", actor_uid: "system", created_at: now() });
        tx.set(balRef(d.referrer_uid, rewardMode), { uid: d.referrer_uid, mode: rewardMode, currency: CURRENCY, available_cents: b.available_cents + REWARD_CENTS, reserved_cents: b.reserved_cents, paid_cents: b.paid_cents, earned_cents: b.earned_cents + REWARD_CENTS, updated_at: now() }, { merge: true });
        newStatus = "rewarded";
      }
      if (newStatus !== d.status || JSON.stringify(flags) !== JSON.stringify(d.flags || [])) tx.set(invRef, { status: newStatus, flags, updated_at: now(), ...(newStatus === "rewarded" && d.status !== "rewarded" ? { rewarded_at: now(), reward_entry: entryId } : {}) }, { merge: true });
      return { ...d, status: newStatus, flags };
    });
  }
  const invitesOf = async referrerUid => (await col("referral_invites").where("referrer_uid", "==", referrerUid).get()).docs.map(x => x.data());
  async function evaluateAll(referrerUid) { const out = []; for (const inv of (await invitesOf(referrerUid)).slice(0, 300)) { const r = await evaluate(inv); if (r) out.push(r); } return out; }
  async function balances(uid) {
    const out = {};
    for (const m of ["test", "live"]) { const b = await balRef(uid, m).get(); if (b.exists) out[m] = { available_cents: b.data().available_cents, reserved_cents: b.data().reserved_cents, paid_cents: b.data().paid_cents, earned_cents: b.data().earned_cents }; }
    return out;
  }
  const ledgerOf = async uid => (await col("ledger").where("uid", "==", uid).get()).docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => b.created_at - a.created_at);
  const withdrawalsOf = async uid => (await col("withdrawals").where("uid", "==", uid).get()).docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => b.created_at - a.created_at);

  /* Заявка на вывод: идемпотентна по request_id; резерв атомарно */
  async function requestWithdrawal(uid, { amount_cents, request_id }, traderId) {
    if (MODE === "off") throw new RefError(403, "REWARDS_DISABLED");
    if (!Number.isInteger(amount_cents) || amount_cents < MIN_WITHDRAW_CENTS || amount_cents > 10000000) throw new RefError(400, "INVALID_AMOUNT");
    if (typeof request_id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(request_id)) throw new RefError(400, "INVALID_REQUEST_ID");
    if (!traderId) throw new RefError(409, "TRADER_REQUIRED");
    const wid = "wd_" + sha(uid + "|" + request_id).slice(0, 24);
    return db.runTransaction(async tx => {
      const w = await tx.get(col("withdrawals").doc(wid)); if (w.exists) return { id: wid, ...w.data(), duplicate: true };
      const b = await tx.get(balRef(uid, MODE)); const bal = b.exists ? b.data() : null;
      if (!bal || bal.available_cents < amount_cents) throw new RefError(409, "INSUFFICIENT_BALANCE");
      const t = now();
      tx.set(balRef(uid, MODE), { available_cents: bal.available_cents - amount_cents, reserved_cents: bal.reserved_cents + amount_cents, updated_at: t }, { merge: true });
      tx.create(col("ledger").doc(`reserve_${wid}`), { uid, type: "reserve", amount_cents: -amount_cents, currency: CURRENCY, mode: MODE, ref: { withdrawal_id: wid }, reason: "Резерв под заявку на вывод", actor_uid: uid, created_at: t });
      const doc = { uid, trader_id: String(traderId), amount_cents, currency: CURRENCY, mode: MODE, status: "pending", created_at: t, updated_at: t, history: [{ at: t, status: "pending", actor_uid: uid, note: "Заявка создана" }], comments: [] };
      tx.create(col("withdrawals").doc(wid), doc);
      return { id: wid, ...doc };
    });
  }
  /* Смена статуса заявки. Освобождение резерва и выплата — ровно один раз (детерминированные ID записей журнала) */
  async function setWithdrawalStatus(wid, to, { actor_uid, note = "", payment_reference = "", confirm = false, byOwner = false } = {}) {
    if (!W_STATUSES.includes(to)) throw new RefError(400, "INVALID_STATUS");
    return db.runTransaction(async tx => {
      const ref = col("withdrawals").doc(wid); const w = await tx.get(ref); if (!w.exists) throw new RefError(404, "NOT_FOUND");
      const d = w.data();
      if (byOwner && (d.uid !== actor_uid || to !== "cancelled")) throw new RefError(403, "FORBIDDEN");
      const allowed = { pending: ["processing", "rejected", "cancelled"], processing: ["paid", "rejected"] }[d.status] || [];
      if (!allowed.includes(to)) throw new RefError(409, "INVALID_TRANSITION");
      if ((to === "rejected") && !String(note).trim()) throw new RefError(400, "REASON_REQUIRED");
      if (to === "paid" && (confirm !== true || !String(payment_reference).trim())) throw new RefError(400, "PAYMENT_CONFIRMATION_REQUIRED");
      const b = await tx.get(balRef(d.uid, d.mode)); const bal = b.data();
      const t = now();
      if (to === "rejected" || to === "cancelled") {
        const rel = col("ledger").doc(`release_${wid}`); const r = await tx.get(rel); if (r.exists) throw new RefError(409, "ALREADY_RELEASED");
        tx.create(rel, { uid: d.uid, type: "release", amount_cents: d.amount_cents, currency: d.currency, mode: d.mode, ref: { withdrawal_id: wid }, reason: to === "rejected" ? "Заявка отклонена: " + note : "Заявка отменена", actor_uid, created_at: t });
        tx.set(balRef(d.uid, d.mode), { available_cents: bal.available_cents + d.amount_cents, reserved_cents: bal.reserved_cents - d.amount_cents, updated_at: t }, { merge: true });
      }
      if (to === "paid") {
        const pay = col("ledger").doc(`payout_${wid}`); const p = await tx.get(pay); if (p.exists) throw new RefError(409, "ALREADY_PAID");
        tx.create(pay, { uid: d.uid, type: "payout", amount_cents: 0, reserved_change_cents: -d.amount_cents, currency: d.currency, mode: d.mode, ref: { withdrawal_id: wid, payment_reference: String(payment_reference).slice(0, 200) }, reason: "Выплата подтверждена администратором", actor_uid, created_at: t });
        tx.set(balRef(d.uid, d.mode), { reserved_cents: bal.reserved_cents - d.amount_cents, paid_cents: bal.paid_cents + d.amount_cents, updated_at: t }, { merge: true });
      }
      tx.set(ref, { status: to, updated_at: t, history: [...(d.history || []), { at: t, status: to, actor_uid, note: String(note).slice(0, 500), ...(payment_reference ? { payment_reference: String(payment_reference).slice(0, 200) } : {}) }] }, { merge: true });
      return { id: wid, status: to };
    });
  }
  /* Ручная корректировка: обязательная причина, уникальный op_id, без ухода в минус */
  async function adjust(uid, { amount_cents, reason, op_id, mode }, actor_uid) {
    const m = ["test", "live"].includes(mode) ? mode : MODE;
    if (m === "off") throw new RefError(403, "REWARDS_DISABLED");
    if (!Number.isInteger(amount_cents) || amount_cents === 0 || Math.abs(amount_cents) > 1000000) throw new RefError(400, "INVALID_AMOUNT");
    if (!String(reason || "").trim()) throw new RefError(400, "REASON_REQUIRED");
    if (typeof op_id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(op_id)) throw new RefError(400, "INVALID_OP_ID");
    const id = `adj_${m}_${sha(uid + "|" + op_id).slice(0, 24)}`;
    return db.runTransaction(async tx => {
      const e = await tx.get(col("ledger").doc(id)); if (e.exists) return { id, duplicate: true };
      const b = await tx.get(balRef(uid, m)); const bal = b.exists ? b.data() : { available_cents: 0, reserved_cents: 0, paid_cents: 0, earned_cents: 0 };
      if (bal.available_cents + amount_cents < 0) throw new RefError(409, "NEGATIVE_BALANCE");
      tx.create(col("ledger").doc(id), { uid, type: "adjustment", amount_cents, currency: CURRENCY, mode: m, ref: { op_id }, reason: String(reason).slice(0, 500), actor_uid, created_at: now() });
      tx.set(balRef(uid, m), { uid, mode: m, currency: CURRENCY, available_cents: bal.available_cents + amount_cents, reserved_cents: bal.reserved_cents, paid_cents: bal.paid_cents, earned_cents: bal.earned_cents + (amount_cents > 0 ? amount_cents : 0), updated_at: now() }, { merge: true });
      return { id };
    });
  }
  return { MODE, ensureCode, attach, evaluate, evaluateAll, invitesOf, balances, ledgerOf, withdrawalsOf, requestWithdrawal, setWithdrawalStatus, adjust, stateOf };
}

/* Публичное представление приглашения: без email, UID и полного Trader ID */
const publicInvite = (inv, i) => ({ n: i + 1, status: inv.status, flagged: (inv.flags || []).length > 0, joined_at: inv.created_at, rewarded_at: inv.rewarded_at || null });

/* Маршруты кабинета партнёра (/api/referral/*) */
function registerReferralRoutes(router, { db, academyApi, env = process.env, now, log = console }) {
  const ref = createReferral({ db, env, now });
  const lim = new Map(); const limited = (k, n, ms) => { const t = Date.now(), a = (lim.get(k) || []).filter(x => t - x < ms); a.push(t); lim.set(k, a); if (lim.size > 5000) lim.clear(); return a.length > n; };
  const h = fn => async (req, res) => {
    try { const auth = await academyApi.authenticate(req); res.set("Cache-Control", "no-store"); res.json(await fn(req, auth)); }
    catch (e) { const s = e && e.status ? e.status : (e && (e.code === "UNAUTHENTICATED" ? 401 : e.code === "ACCOUNT_BLOCKED" ? 403 : 0)); if (s) return res.status(s).json({ error: e.code }); log.error && log.error("referral error:", e && (e.code || e.message)); res.status(503).json({ error: "UNAVAILABLE" }); }
  };
  router.get("/referral/me", h(async (req, auth) => {
    const code = await ref.ensureCode(auth.uid);
    const invites = await ref.evaluateAll(auth.uid);
    const count = s => invites.filter(i => s.includes(i.status)).length;
    return { mode: ref.MODE, code, link_path: "/academy/?ref=" + code, reward_cents: REWARD_CENTS, min_withdraw_cents: MIN_WITHDRAW_CENTS, currency: CURRENCY,
      stats: { invited: invites.length, trader_confirmed: count(["trader_confirmed", "ftd_confirmed", "access_granted", "qualified", "rewarded", "flagged"]), ftd_confirmed: count(["ftd_confirmed", "access_granted", "qualified", "rewarded", "flagged"]), access_granted: count(["access_granted", "qualified", "rewarded", "flagged"]), rewarded: count(["rewarded"]) },
      invites: invites.sort((a, b) => a.created_at - b.created_at).map(publicInvite),
      balances: await ref.balances(auth.uid),
      ledger: (await ref.ledgerOf(auth.uid)).slice(0, 100).map(e => ({ id: e.id, type: e.type, amount_cents: e.amount_cents, mode: e.mode, reason: e.reason, created_at: e.created_at })),
      withdrawals: (await ref.withdrawalsOf(auth.uid)).map(w => ({ id: w.id, amount_cents: w.amount_cents, currency: w.currency, mode: w.mode, status: w.status, created_at: w.created_at, history: (w.history || []).map(x => ({ at: x.at, status: x.status, note: x.note })) })) };
  }));
  router.post("/referral/attach", h(async (req, auth) => { if (limited("a:" + auth.uid, 10, 60000)) throw new RefError(429, "TOO_MANY"); return ref.attach(auth.uid, req.body && req.body.code); }));
  router.post("/referral/withdrawals", h(async (req, auth) => {
    if (limited("w:" + auth.uid, 5, 60000)) throw new RefError(429, "TOO_MANY");
    const { ev } = await academyApi.stateFor(auth.uid, { user: auth.user });
    const amount = req.body && req.body.amount; const cents = Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
    return { withdrawal: await ref.requestWithdrawal(auth.uid, { amount_cents: cents, request_id: req.body && req.body.request_id }, ev.brokerRegistrationConfirmed ? ev.traderId : null) };
  }));
  router.post("/referral/withdrawals/:id/cancel", h(async (req, auth) => ref.setWithdrawalStatus(String(req.params.id), "cancelled", { actor_uid: auth.uid, byOwner: true })));
  return ref;
}

/* Админка партнёров: обработчики для admin-api (права и аудит — общие) */
function partnerAdmin({ db, env = process.env, now, HttpError, audit }) {
  const ref = createReferral({ db, env, now });
  const col = n => db.collection(n);
  const wrapErr = fn => async (req, actor) => { try { return await fn(req, actor); } catch (e) { if (e instanceof RefError) throw new HttpError(e.status, e.code); throw e; } };
  async function findPartners(q) {
    q = String(q || "").trim(); const uids = new Set();
    if (!q) return [];
    if (/^[A-Za-z0-9]{20,128}$/.test(q)) { const u = await col("users").doc(q).get(); if (u.exists) uids.add(q); }
    if (/^\d{5,14}$/.test(q)) { const b = await col("trader_bindings").doc(q).get(); if (b.exists && b.data().uid) uids.add(b.data().uid); }
    if (/^[A-Za-z2-9]{8}$/.test(q)) { const c = await col("ref_codes").doc(q.toUpperCase()).get(); if (c.exists) uids.add(c.data().uid); }
    const out = [];
    for (const uid of uids) { const u = (await col("users").doc(uid).get()).data() || {}; out.push({ uid, email: u.email || null, ref_code: u.ref_code || null, trader_id_masked: u.trader_id ? "••••" + String(u.trader_id).slice(-4) : null, invited: (await ref.invitesOf(uid)).length }); }
    return out;
  }
  const handlers = {
    partners: wrapErr(async req => ({ mode: ref.MODE, results: await findPartners(req.query && req.query.q) })),
    partner: wrapErr(async req => {
      const uid = String(req.params.uid); const u = await col("users").doc(uid).get(); if (!u.exists) throw new HttpError(404, "NOT_FOUND");
      const st = await ref.stateOf(uid); const ud = u.data();
      const invites = await ref.invitesOf(uid);
      const inv = [];
      for (const i of invites) { const x = (await col("users").doc(i.invitee_uid).get()).data() || {}; inv.push({ invitee_uid: i.invitee_uid, email: x.email || null, trader_id_masked: x.trader_id ? "••••" + String(x.trader_id).slice(-4) : null, status: i.status, flags: i.flags || [], created_at: i.created_at, rewarded_at: i.rewarded_at || null }); }
      return { mode: ref.MODE, uid, email: ud.email || null, ref_code: ud.ref_code || null, trader_id: st.ev.brokerRegistrationConfirmed ? st.ev.traderId : null, academy_access: st.ev.academyAccess,
        invites: inv, balances: await ref.balances(uid), ledger: (await ref.ledgerOf(uid)).slice(0, 300), withdrawals: await ref.withdrawalsOf(uid) };
    }),
    partnerEvaluate: wrapErr(async (req, actor) => { const r = await ref.evaluateAll(String(req.params.uid)); await audit(actor, "partner.evaluate", "user", req.params.uid, { invites: r.length }); return { ok: true, invites: r.length }; }),
    partnerAdjust: wrapErr(async (req, actor) => {
      const b = req.body || {}; const cents = Number.isFinite(b.amount) ? Math.round(b.amount * 100) : NaN;
      const r = await ref.adjust(String(req.params.uid), { amount_cents: cents, reason: b.reason, op_id: b.op_id, mode: b.mode }, actor.uid);
      if (!r.duplicate) await audit(actor, "partner.adjust", "user", req.params.uid, { amount_cents: cents, reason: String(b.reason || "").slice(0, 200), entry: r.id });
      return { ok: true, ...r };
    }),
    withdrawals: wrapErr(async req => {
      const s = req.query && req.query.status; let q = col("withdrawals"); if (W_STATUSES.includes(s)) q = q.where("status", "==", s);
      return { mode: ref.MODE, withdrawals: (await q.get()).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.created_at - a.created_at).slice(0, 300) };
    }),
    withdrawalStatus: wrapErr(async (req, actor) => {
      const b = req.body || {}; const r = await ref.setWithdrawalStatus(String(req.params.id), b.status, { actor_uid: actor.uid, note: b.note || "", payment_reference: b.payment_reference || "", confirm: b.confirm === true });
      await audit(actor, "withdrawal." + b.status, "withdrawal", req.params.id, { note: String(b.note || "").slice(0, 200), payment_reference: String(b.payment_reference || "").slice(0, 100) });
      return { ok: true, ...r };
    }),
    partnerStats: wrapErr(async () => {
      const invs = (await col("referral_invites").get()).docs.map(d => d.data()); const ws = (await col("withdrawals").get()).docs.map(d => d.data());
      const by = {}; for (const s of STATUSES) by[s] = invs.filter(i => i.status === s).length;
      const sum = (arr, f) => arr.reduce((n, x) => n + (f(x) || 0), 0);
      return { mode: ref.MODE, invites_total: invs.length, invites_by_status: by, withdrawals_by_status: Object.fromEntries(W_STATUSES.map(s => [s, ws.filter(w => w.status === s).length])),
        pending_amount_cents: sum(ws.filter(w => ["pending", "processing"].includes(w.status)), w => w.amount_cents), paid_amount_cents: sum(ws.filter(w => w.status === "paid"), w => w.amount_cents) };
    })
  };
  const routes = [["GET", "/partners", "partners", "partners.view"], ["GET", "/partners/stats", "partnerStats", "partners.view"], ["GET", "/partners/:uid", "partner", "partners.view"],
    ["POST", "/partners/:uid/evaluate", "partnerEvaluate", "partners.view", true], ["POST", "/partners/:uid/adjust", "partnerAdjust", "finance.adjust", true],
    ["GET", "/withdrawals", "withdrawals", "partners.view"], ["POST", "/withdrawals/:id/status", "withdrawalStatus", "finance.payouts", true]];
  return { handlers, routes, ref };
}

module.exports = { createReferral, registerReferralRoutes, partnerAdmin, REWARD_CENTS, MIN_WITHDRAW_CENTS, STATUSES, W_STATUSES, modeOf };
