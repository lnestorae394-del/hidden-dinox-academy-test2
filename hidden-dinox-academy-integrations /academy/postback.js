"use strict";
/* HIDDEN DINOX ACADEMY — обработка postback от Pocket Partners.

   URL (настраиваются в Pocket Partners):
     регистрация:       /postback?click_id={click_id}&trader_id={trader_id}&secret=…
     первый депозит:    /postback?click_id={click_id}&trader_id={trader_id}&amount={sum}&secret=…
     повторный депозит: /postback?type=redeposit&click_id={click_id}&trader_id={trader_id}&amount={sum}&secret=…

   Секрет — ТОЛЬКО из переменной окружения POCKET_POSTBACK_SECRET (≥ 24 символов).
   Без него сервер отвечает 503 и ничего не записывает (fail-closed).

   Подтверждения пишутся в referrals/{traderId}.academy только если:
   - секрет совпал;
   - click_id выдан нашим сервером конкретному пользователю (коллекция clicks);
   - событие ещё не обрабатывалось (журнал postback_events, транзакция).
   Параметры читаются строго: click_id, trader_id, amount, type, currency.
   cid / sub1 / sum / payout / profit НЕ используются. */

const crypto = require("crypto");
const { parseAmountToCents } = require("./access");
const D = require("./deposits");

const SECRET_PARAM = "secret";
const MIN_SECRET_LENGTH = 24;
const TRADER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLICK_RE = /^[A-Za-z0-9_-]{8,128}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const MACRO_RE = /[{}\[\]%]|^(click_id|trader_id|sum|amount|CLICK_ID|TRADER_ID|SUMDEP)$/; // макрос не подставлен платформой

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const one = v => (Array.isArray(v) ? undefined : v);

/* Код результата → HTTP-статус и понятное сообщение (для логов Pocket Partners и Render) */
const OUTCOMES = {
  registration_confirmed:          [200, "Регистрация подтверждена"],
  registration_exists:             [200, "Регистрация уже была подтверждена ранее"],
  ftd_recorded:                    [200, "Первый депозит записан"],
  ftd_exists_counted_as_deposit:   [200, "Первый депозит уже был; событие учтено как обычный депозит"],
  redeposit_recorded:              [200, "Повторный депозит записан"],
  duplicate:                       [200, "Событие уже обработано ранее (повторная доставка)"],
  not_configured:                  [503, "POCKET_POSTBACK_SECRET не задан или короче 24 символов — postback не принимаются"],
  no_db:                           [503, "Firebase не подключён — событие не записано, повторите позже"],
  db_error:                        [503, "Ошибка Firebase — событие не записано, повторите позже"],
  secret_missing:                  [401, "Нет параметра secret"],
  secret_invalid:                  [403, "Неверный secret"],
  ip_not_allowed:                  [403, "IP-адрес не разрешён"],
  macro_not_substituted:           [400, "Макрос не подставлен платформой (пришло значение вида {click_id})"],
  invalid_trader:                  [400, "Некорректный или отсутствующий trader_id"],
  invalid_click:                   [400, "Некорректный или отсутствующий click_id"],
  invalid_amount:                  [400, "Некорректная или отсутствующая сумма amount"],
  unknown_type:                    [400, "Неизвестный type (поддерживается только redeposit)"],
  unknown_click:                   [422, "click_id не выдан академией — событие не относится к пользователю академии"],
  conflict_click:                  [409, "Этот Trader ID зарегистрирован по другой ссылке / другим пользователем — событие не учтено"],
  trader_mismatch:                 [409, "У пользователя этого click_id привязан другой Trader ID — депозит НЕ учтён (сохранён для повторной проверки)"],
  deposit_pending_registration:    [202, "Депозит сохранён, но НЕ учтён: регистрация этого Trader ID ещё не подтверждена"],
  deposit_pending_currency:        [202, "Депозит сохранён, но НЕ учтён: неизвестна валюта (нужна POSTBACK_DEFAULT_CURRENCY или параметр currency)"]
};
const outcome = (status, extra = {}) => { const [http, message] = OUTCOMES[status] || [500, "Внутренняя ошибка"]; return { status, http, message, ...extra }; };

function readConfig(env) {
  const raw = env.POCKET_POSTBACK_SECRET || "";
  const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
  return {
    secret: raw.length >= MIN_SECRET_LENGTH ? raw : "",
    secretTooShort: raw.length > 0 && raw.length < MIN_SECRET_LENGTH,
    allowedIps: list(env.POSTBACK_ALLOWED_IPS),
    // Валюта по умолчанию — ТОЛЬКО если в Pocket Partners подтверждено, что {sum} всегда в USD
    defaultCurrency: (env.POSTBACK_DEFAULT_CURRENCY || "").toUpperCase(),
    eventIdParam: env.POSTBACK_EVENT_ID_PARAM || "",
    staticCids: list(env.PARTNER_STATIC_CIDS || "987453")
  };
}

function classify(query) {
  const type = one(query.type), amountRaw = one(query.amount);
  if (type === "redeposit") return "redeposit";
  if (type !== undefined && type !== "" && type !== "ftd" && type !== "registration") return "unknown";
  if (type === "registration") return "registration";
  return amountRaw !== undefined && amountRaw !== "" ? "ftd" : "registration";
}

function eventKey(kind, f, cfg, query) {
  const eid = cfg.eventIdParam ? one(query[cfg.eventIdParam]) : undefined;
  if (eid && /^[A-Za-z0-9_.:-]{1,128}$/.test(eid)) return "id_" + eid;
  return "fp_" + crypto.createHash("sha256").update(JSON.stringify([kind, f.click, f.trader, f.amountRaw, f.currency])).digest("hex").slice(0, 40);
}

function createAcademyPostback({ db, env = process.env, log = console, now = () => Date.now() }) {
  const cfg = readConfig(env);

  async function handle(query = {}, meta = {}) {
    // 1) Аутентификация источника — до любых обращений к базе
    if (!cfg.secret) return outcome("not_configured");
    const given = one(query[SECRET_PARAM]);
    if (given === undefined || given === "") return outcome("secret_missing");
    if (!safeEqual(given, cfg.secret)) return outcome("secret_invalid");
    if (cfg.allowedIps.length && !(meta.ip && cfg.allowedIps.includes(meta.ip))) return outcome("ip_not_allowed");

    // 2) Параметры
    const kind = classify(query);
    const click = one(query.click_id), trader = one(query.trader_id), amountRaw = one(query.amount), currencyRaw = one(query.currency);
    for (const v of [click, trader, amountRaw]) if (typeof v === "string" && MACRO_RE.test(v)) return outcome("macro_not_substituted");
    if (!trader || !TRADER_RE.test(trader)) return outcome("invalid_trader");
    if (!click || !CLICK_RE.test(click) || cfg.staticCids.includes(click)) return outcome("invalid_click");
    if (kind === "unknown") return outcome("unknown_type");
    let cents = null;
    if (kind !== "registration") { cents = parseAmountToCents(amountRaw); if (cents === null) return outcome("invalid_amount"); }
    const currency = currencyRaw ? String(currencyRaw).toUpperCase() : (cfg.defaultCurrency || null);
    if (!db) return outcome("no_db");

    // 3) Запись — одна транзакция на событие
    const key = eventKey(kind, { click, trader, amountRaw, currency }, cfg, query);
    const evRef = db.collection("postback_events").doc(key);
    const refRef = db.collection("referrals").doc(trader);
    const clickRef = db.collection("clicks").doc(click);
    let res;
    try {
      res = await db.runTransaction(async tx => {
        // --- все чтения до записей (требование Firestore) ---
        const ev = await tx.get(evRef);
        if (ev.exists) return { status: "duplicate", uid: ev.data().uid || null };
        const clickDoc = await tx.get(clickRef);
        if (!clickDoc.exists) return { status: "unknown_click" }; // ничего не пишем: событие не наше
        const uid = clickDoc.data().uid;
        const refDoc = await tx.get(refRef);
        const userDoc = await tx.get(db.collection("users").doc(uid));
        const ctx = { trader, user: userDoc.exists ? userDoc.data() : null };

        const original = (refDoc.exists && refDoc.data().academy) || {};
        const work = D.clone(original);
        const t = now();
        let status, depositStatus = null, promoted = [];

        if (kind === "registration") {
          const problem = D.ownershipProblem({ reg: work.registration, click, uid, trader, user: null });
          if (problem) status = problem;
          else if (work.registration) status = "registration_exists";
          else {
            work.registration = { verified: true, click_id: click, uid, source: "registration", event_key: key, at: t };
            status = "registration_confirmed";
            promoted = D.promotePending(work, ctx, { currencyOverride: cfg.defaultCurrency || null }); // депозиты, пришедшие раньше регистрации
          }
        } else {
          const cur = currency && CURRENCY_RE.test(currency) ? currency : null;
          const dep = { key, kind, amount_cents: cents, currency: cur, click_id: click, uid, at: t };
          const r = D.applyIncomingDeposit(work, dep, ctx);
          status = r.status; depositStatus = r.depositStatus;
          tx.create(db.collection("deposit_events").doc(key), {
            trader_id: trader, click_id: click, uid, kind, amount_cents: cents, currency: cur,
            status: depositStatus, counted_in_totals: depositStatus === "counted", at: t
          });
        }

        if (JSON.stringify(work) !== JSON.stringify(original)) tx.set(refRef, { academy: work }, { merge: true });
        for (const p of promoted) {
          tx.set(db.collection("deposit_events").doc(p.key), { status: p.depositStatus, counted_in_totals: p.depositStatus === "counted", ...(p.currency ? { currency: p.currency } : {}), promoted_at: t }, { merge: true });
        }
        tx.create(evRef, { kind, status, uid, trader_id: trader, click_id: click, amount_raw: amountRaw != null ? String(amountRaw).slice(0, 32) : null, currency: currency || null, received_at: now() });
        return { status, uid, promoted: promoted.length };
      });
    } catch (e) {
      log.error && log.error("postback: ошибка Firebase:", e && (e.code || e.message));
      return outcome("db_error");
    }
    return outcome(res.status, { kind, key, verified: true, promoted: res.promoted || 0 });
  }

  return { handle, config: { secretConfigured: !!cfg.secret, secretTooShort: cfg.secretTooShort, ipListConfigured: cfg.allowedIps.length > 0, defaultCurrency: cfg.defaultCurrency || null } };
}

module.exports = { createAcademyPostback, readConfig, classify, MIN_SECRET_LENGTH, SECRET_PARAM, OUTCOMES };
