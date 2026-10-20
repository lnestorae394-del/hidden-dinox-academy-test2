"use strict";
/* HIDDEN DINOX ACADEMY — обработка партнёрских postback для академии.

   Работает РЯДОМ со старым обработчиком /postback (старые поля referrals не трогает).
   Подтверждения академии пишутся в referrals/{traderId}.academy только если:
   - источник события проверен (секретный параметр и/или список IP — см. config);
   - click_id выдан нашим сервером конкретному пользователю (коллекция clicks);
   - событие ещё не обрабатывалось (журнал postback_events, транзакция).

   Параметры читаются строго: click_id, trader_id, amount, type, currency.
   Запасные cid / clickid / sub1 / sub2 / sum / payout / profit НЕ используются:
   их смысл не подтверждён (cid — постоянный параметр партнёрской ссылки). */

const crypto = require("crypto");
const { parseAmountToCents } = require("./access");

const TRADER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLICK_RE = /^[A-Za-z0-9_-]{8,128}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const MIN_SECRET_LENGTH = 24;

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const one = v => (Array.isArray(v) ? undefined : v); // повторяющиеся параметры — не принимаем

function readConfig(env) {
  const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
  const rawSecret = env.POCKET_POSTBACK_SECRET || env.POSTBACK_SECRET || "";
  return {
    // Обработка подтверждений академии включается ТОЛЬКО явно (по умолчанию выключена)
    enabled: env.ACADEMY_POSTBACK_ENABLED === "1",
    // Короткий секрет считается ненастроенным (его легко подобрать)
    secret: rawSecret.length >= MIN_SECRET_LENGTH ? rawSecret : "",
    secretTooShort: rawSecret.length > 0 && rawSecret.length < MIN_SECRET_LENGTH,
    secretParam: env.POSTBACK_SECRET_PARAM || "secret",
    allowedIps: list(env.POSTBACK_ALLOWED_IPS),
    // Валюта по умолчанию — ТОЛЬКО если в кабинете подтверждено, что суммы приходят в USD
    defaultCurrency: (env.POSTBACK_DEFAULT_CURRENCY || "").toUpperCase(),
    eventIdParam: env.POSTBACK_EVENT_ID_PARAM || "",
    staticCids: list(env.PARTNER_STATIC_CIDS || "")
  };
}

/* Проверка источника. Без настроенного секрета или IP-списка — событие НЕ доверенное. */
function verifySource(query, ip, cfg) {
  const checks = [];
  if (cfg.secret) checks.push(safeEqual(one(query[cfg.secretParam]) ?? "", cfg.secret));
  if (cfg.allowedIps.length) checks.push(!!ip && cfg.allowedIps.includes(ip));
  return checks.length > 0 && checks.every(Boolean);
}

function classify(query) {
  const type = one(query.type);
  const amountRaw = one(query.amount);
  if (type === "redeposit") return "redeposit";
  if (type === "deposit" || type === "ftd") return "ftd";
  if (type !== undefined && type !== "" && type !== "registration") return "unknown";
  if (type === "registration") return "registration";
  if (amountRaw !== undefined && amountRaw !== "") return "ftd";
  return "registration";
}

function eventKey(kind, fields, cfg, query) {
  const eid = cfg.eventIdParam ? one(query[cfg.eventIdParam]) : undefined;
  if (eid && /^[A-Za-z0-9_.:-]{1,128}$/.test(eid)) return "id_" + eid;
  const h = crypto.createHash("sha256").update(JSON.stringify([kind, fields.click, fields.trader, fields.amountRaw, fields.currency])).digest("hex");
  return "fp_" + h.slice(0, 40);
}

function createAcademyPostback({ db, env = process.env, log = console, now = () => Date.now() }) {
  const cfg = readConfig(env);

  async function handle(query, meta = {}) {
    if (!cfg.enabled) return { status: "disabled" };
    if (!db) return { status: "no_db" };
    const kind = classify(query);
    const click = one(query.click_id);
    const trader = one(query.trader_id);
    const amountRaw = one(query.amount);
    const currencyRaw = one(query.currency);
    const currency = currencyRaw ? String(currencyRaw).toUpperCase() : (cfg.defaultCurrency || null);
    const verified = verifySource(query, meta.ip, cfg);
    const key = eventKey(kind, { click, trader, amountRaw, currency }, cfg, query);

    // Предварительные проверки — без обращений к базе (посторонние запросы не создают записей)
    let pre = null;
    if (!trader || !TRADER_RE.test(trader)) pre = "invalid_trader";
    else if (!click || !CLICK_RE.test(click) || cfg.staticCids.includes(click)) pre = "invalid_click";
    else if (kind === "unknown") pre = "unknown_type";
    else if (!verified) pre = "unverified";
    let cents = null;
    if (!pre && (kind === "ftd" || kind === "redeposit")) { cents = parseAmountToCents(amountRaw); if (cents === null) pre = "invalid_amount"; }
    if (pre) { log.warn && log.warn("academy postback ignored:", pre, kind); return { status: pre }; }

    const evRef = db.collection("postback_events").doc(key);
    const refRef = db.collection("referrals").doc(trader);
    const clickRef = db.collection("clicks").doc(click);
    const result = await db.runTransaction(async tx => {
      // --- все чтения до записей (требование Firestore) ---
      const ev = await tx.get(evRef);
      if (ev.exists) return { status: "duplicate", key };
      const clickDoc = await tx.get(clickRef);
      const refDoc = await tx.get(refRef);

      let status;
      if (!clickDoc.exists) status = "unknown_click"; // click_id не выдан академией (например, старый AI BOOST)
      else {
        const uid = clickDoc.data().uid;
        const academy = (refDoc.exists && refDoc.data().academy) || {};
        const t = now();
        const reg = academy.registration;
        const fd = academy.first_deposit;
        const patch = {};

        if (reg && reg.click_id !== click) status = "conflict_click"; // Trader ID уже подтверждён с другим click_id
        else if (kind === "registration") {
          if (!reg) patch.registration = { verified: true, click_id: click, uid, source: "registration", event_key: key, at: t };
          status = reg ? "registration_exists" : "registration_confirmed";
        } else {
          // Любое проверенное событие с суммой — это депозит клиента (FTD или повторный)
          const cur = currency && CURRENCY_RE.test(currency) ? currency : null;
          if (kind === "ftd" && !fd) {
            patch.first_deposit = {
              verified: true, click_id: click, uid, event_key: key, at: t,
              amount_cents: cents, currency: cur,
              usd_cents: cur === "USD" ? cents : null // неизвестная валюта не считается долларами
            };
            // Проверенный FTD с нашим click_id подтверждает и регистрацию по ссылке
            if (!reg) patch.registration = { verified: true, click_id: click, uid, source: "ftd", event_key: key, at: t };
            status = cur === "USD" ? "ftd_recorded" : "ftd_recorded_unknown_currency";
          } else {
            // FTD уже учтён (второе событие без type) или type=redeposit — первый депозит НЕ меняется
            status = kind === "ftd" ? "ftd_exists_counted_as_deposit" : "redeposit_recorded";
          }
          // Итоги — отдельно по каждой валюте; без валюты — только счётчик, сумма не учитывается
          const totals = academy.deposit_totals || {};
          const nextTotals = {};
          if (cur) {
            const b = totals[cur] || { sum_cents: 0, count: 0 };
            nextTotals[cur] = { sum_cents: b.sum_cents + cents, count: b.count + 1 };
          } else {
            nextTotals.unknown_currency_count = (totals.unknown_currency_count || 0) + 1;
          }
          patch.deposit_totals = nextTotals;
          patch.deposit_count = (academy.deposit_count || 0) + 1;
          tx.create(db.collection("deposit_events").doc(key), {
            trader_id: trader, click_id: click, uid, kind: patch.first_deposit ? "ftd" : (kind === "ftd" ? "deposit_after_ftd" : "redeposit"),
            amount_cents: cents, currency: cur, counted_in_totals: !!cur, at: t
          });
        }
        if (Object.keys(patch).length) tx.set(refRef, { academy: patch }, { merge: true });
      }
      tx.create(evRef, {
        kind, status, verified: true, trader_id: trader, click_id: click,
        amount_raw: amountRaw != null ? String(amountRaw).slice(0, 32) : null,
        currency: currency || null, received_at: now()
      });
      return { status, key };
    });
    log.log && log.log("academy postback:", result.status, kind);
    return result;
  }

  return { handle, config: { enabled: cfg.enabled, secretConfigured: !!cfg.secret, secretTooShort: cfg.secretTooShort, ipListConfigured: cfg.allowedIps.length > 0, secretParam: cfg.secretParam } };
}

module.exports = { createAcademyPostback, readConfig, verifySource, classify, MIN_SECRET_LENGTH };
