"use strict";
/* HIDDEN DINOX ACADEMY — защищённые API.
   Пользователь определяется ТОЛЬКО по проверенному Firebase ID-токену (Authorization: Bearer).
   UID из параметров запроса не принимается. Защищённые поля пишет только сервер. */

const crypto = require("crypto");
const { evaluateAccess, isValidTraderId, registrationOf, firstDepositOf } = require("./access");

const ERR = {
  UNAUTHENTICATED: 401, INVALID: 400, TRADER_TAKEN: 409, ID_LOCKED: 409,
  REGISTRATION_NOT_CONFIRMED: 403, TOO_MANY: 429, CONFIG_MISSING: 503, UNAVAILABLE: 503, SERVER_ERROR: 500
};
class ApiError extends Error { constructor(code) { super(code); this.code = code; } }
const send = (res, code, body) => res.status(code).json(body);
const fail = (res, code) => send(res, ERR[code] || 500, { error: code });

/* Простое ограничение частоты (в памяти процесса) */
function rateLimiter({ limit, windowMs, now }) {
  const hits = new Map();
  return key => {
    const t = now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
    arr.push(t); hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    return arr.length <= limit;
  };
}

function createAcademyApi({ db, verifyIdToken, log = console, now = () => Date.now(), newClickId }) {
  const genClick = newClickId || (() => "hd_" + crypto.randomBytes(16).toString("hex"));
  const writeLimit = rateLimiter({ limit: 20, windowMs: 60000, now });

  async function authenticate(req) {
    if (!db || !verifyIdToken) throw new ApiError("CONFIG_MISSING");
    const h = req.headers && (req.headers.authorization || req.headers.Authorization);
    const m = typeof h === "string" && h.match(/^Bearer ([A-Za-z0-9._-]{10,4096})$/);
    if (!m) throw new ApiError("UNAUTHENTICATED");
    let decoded;
    try { decoded = await verifyIdToken(m[1]); } catch (e) { throw new ApiError("UNAUTHENTICATED"); }
    if (!decoded || typeof decoded.uid !== "string" || !decoded.uid) throw new ApiError("UNAUTHENTICATED");
    return { uid: decoded.uid, email: decoded.email || null };
  }

  const refs = uid => ({ user: db.collection("users").doc(uid) });

  async function loadState(uid) {
    const u = await refs(uid).user.get();
    const user = u.exists ? u.data() : null;
    let binding = null, referral = null;
    if (user && user.trader_id) {
      const [b, r] = await Promise.all([
        db.collection("trader_bindings").doc(String(user.trader_id)).get(),
        db.collection("referrals").doc(String(user.trader_id)).get()
      ]);
      binding = b.exists ? b.data() : null;
      referral = r.exists ? r.data() : null;
    }
    return { user, binding, referral };
  }

  function profileBody(auth, user, ev) {
    return {
      email: (user && user.email) || auth.email,
      stage: ev.stage,
      traderId: ev.traderId,
      traderIdMasked: ev.traderIdMasked,
      traderIdLocked: ev.traderIdLocked,
      brokerRegistrationConfirmed: ev.brokerRegistrationConfirmed,
      depositState: ev.depositState,
      firstDeposit: ev.firstDeposit,
      deposits: ev.deposits,
      academyAccess: ev.academyAccess
    };
  }

  function wrap(fn) {
    return async (req, res) => {
      try { await fn(req, res); }
      catch (e) {
        if (e instanceof ApiError) return fail(res, e.code);
        log.error && log.error("academy api error:", e && (e.code || e.message)); // без токенов и тел запросов
        return fail(res, "UNAVAILABLE"); // при любой ошибке доступ не открывается
      }
    };
  }

  /* GET /api/me — профиль, этап, статусы (создаёт users/{uid} при первом обращении) */
  const me = wrap(async (req, res) => {
    const auth = await authenticate(req);
    const userRef = refs(auth.uid).user;
    await db.runTransaction(async tx => {
      const u = await tx.get(userRef);
      if (!u.exists) tx.create(userRef, { email: auth.email, click_id: null, trader_id: null, created_at: now() });
    });
    const { user, binding, referral } = await loadState(auth.uid);
    const ev = evaluateAccess({ uid: auth.uid, user, binding, referral });
    res.set && res.set("Cache-Control", "no-store");
    send(res, 200, profileBody(auth, user, ev));
  });

  /* POST /api/click — устойчивый click_id: создаётся один раз на пользователя */
  const click = wrap(async (req, res) => {
    const auth = await authenticate(req);
    if (!writeLimit("c:" + auth.uid)) throw new ApiError("TOO_MANY");
    const userRef = refs(auth.uid).user;
    const clickId = await db.runTransaction(async tx => {
      const u = await tx.get(userRef);
      if (u.exists && u.data().click_id) return u.data().click_id;
      const id = genClick();
      const cRef = db.collection("clicks").doc(id);
      const c = await tx.get(cRef);
      if (c.exists) throw new Error("click collision");
      tx.create(cRef, { uid: auth.uid, created_at: now() });
      if (u.exists) tx.update(userRef, { click_id: id });
      else tx.create(userRef, { email: auth.email, click_id: id, trader_id: null, created_at: now() });
      return id;
    });
    res.set && res.set("Cache-Control", "no-store");
    send(res, 200, { clickId });
  });

  /* POST /api/trader-id {traderId} — привязка или смена Trader ID */
  const traderId = wrap(async (req, res) => {
    const auth = await authenticate(req);
    if (!writeLimit("t:" + auth.uid)) throw new ApiError("TOO_MANY");
    const body = req.body || {};
    const tid = typeof body.traderId === "string" ? body.traderId.trim() : "";
    if (!isValidTraderId(tid)) throw new ApiError("INVALID");
    const userRef = refs(auth.uid).user;

    await db.runTransaction(async tx => {
      const u = await tx.get(userRef);
      const user = u.exists ? u.data() : { email: auth.email, click_id: null, trader_id: null, created_at: now() };
      const curTid = user.trader_id ? String(user.trader_id) : null;

      const newBRef = db.collection("trader_bindings").doc(tid);
      const newRefRef = db.collection("referrals").doc(tid);
      const reads = [tx.get(newBRef), tx.get(newRefRef)];
      if (curTid && curTid !== tid) {
        reads.push(tx.get(db.collection("trader_bindings").doc(curTid)), tx.get(db.collection("referrals").doc(curTid)));
      }
      const [nb, nr, ob, or] = await Promise.all(reads);

      // КРИТИЧЕСКАЯ ПРОВЕРКА: нельзя привязать произвольный/чужой Trader ID.
      // ID принимается только если Pocket Partners подтвердил регистрацию по click_id,
      // который сервер выдал именно этому Firebase UID. Наличие старого referrals-документа
      // само по себе не является доказательством регистрации.
      if (!u.exists || !user.click_id || !nr.exists) throw new ApiError("REGISTRATION_NOT_CONFIRMED");
      const confirmedReg = registrationOf(nr.data());
      if (!confirmedReg || confirmedReg.verified !== true || confirmedReg.click_id !== user.click_id) {
        throw new ApiError("REGISTRATION_NOT_CONFIRMED");
      }
      if (confirmedReg.uid && confirmedReg.uid !== auth.uid) {
        throw new ApiError("TRADER_TAKEN");
      }

      // Блокировка: к текущему ID уже подтверждён первый депозит этого пользователя
      if (curTid) {
        const curRef = curTid === tid ? nr : or;
        const fd = curRef && curRef.exists ? firstDepositOf(curRef.data()) : null;
        if (fd && fd.verified && user.click_id && fd.click_id === user.click_id) {
          if (curTid === tid) return; // тот же ID — ничего не меняем
          throw new ApiError("ID_LOCKED");
        }
      }
      if (curTid === tid && nb.exists && nb.data().uid === auth.uid) return; // уже привязан

      // Занятость: другой пользователь уже привязал этот ID
      if (nb.exists && nb.data().uid !== auth.uid) {
        // Исключение: регистрация по ссылке подтверждена с click_id ИМЕННО этого пользователя —
        // значит, ID принадлежит ему, а прежняя привязка была ошибочной или захватом.
        const reg = nr.exists ? registrationOf(nr.data()) : null;
        const provenMine = !!(reg && reg.verified && user.click_id && reg.click_id === user.click_id);
        if (!provenMine) throw new ApiError("TRADER_TAKEN");
        const otherRef = db.collection("users").doc(nb.data().uid);
        tx.update(otherRef, { trader_id: null });
      }
      // Освобождаем прежнюю привязку этого пользователя
      if (curTid && curTid !== tid && ob && ob.exists && ob.data().uid === auth.uid) {
        tx.delete(db.collection("trader_bindings").doc(curTid));
      }
      tx.set(newBRef, { uid: auth.uid, bound_at: now() });
      if (u.exists) tx.update(userRef, { trader_id: tid, trader_bound_at: now() });
      else tx.create(userRef, { ...user, trader_id: tid, trader_bound_at: now() });
    });

    const { user, binding, referral } = await loadState(auth.uid);
    const ev = evaluateAccess({ uid: auth.uid, user, binding, referral });
    send(res, 200, profileBody(auth, user, ev));
  });

  return { me, click, traderId, authenticate };
}

/* Подключение к Express: маршруты под /api/ (до общей статики и обработчика ошибок) */
function mountAcademyApi(app, express, deps) {
  const api = createAcademyApi(deps);
  const router = express.Router();
  router.use(express.json({ limit: "4kb" }));
  router.get("/me", api.me);
  router.post("/click", api.click);
  router.post("/trader-id", api.traderId);
  router.use((req, res) => send(res, 404, { error: "NOT_FOUND" }));
  app.use("/api", router);
  return api;
}

module.exports = { createAcademyApi, mountAcademyApi, ApiError };
