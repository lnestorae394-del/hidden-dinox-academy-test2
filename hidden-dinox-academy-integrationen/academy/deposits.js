"use strict";
/* HIDDEN DINOX ACADEMY — правила учёта депозитов (чистые функции, общие для postback и скрипта
   повторной обработки). Работают с копией referrals/{traderId}.academy и возвращают изменения.

   Депозит ЗАСЧИТЫВАЕТСЯ только если одновременно:
   1) для этого Trader ID есть подтверждённая регистрация (registration postback) с ТЕМ ЖЕ click_id;
   2) click_id выдан академией пользователю uid, и регистрация оформлена на этого же uid;
   3) Trader ID не принадлежит другому пользователю (его регистрация — с другим click_id / uid);
   4) у пользователя не привязан ДРУГОЙ Trader ID (users/{uid}.trader_id);
   5) валюта известна (код из 3 букв).
   Нарушение 2–3 — отказ (событие не учитывается и никому ничего не меняет).
   Нарушение 4 — отказ для доступа, но событие сохраняется «в ожидании»: если пользователь законно
   сменит ID на этот (только с его подтверждённой регистрацией), скрипт повторной обработки его засчитает.
   Нет регистрации (1) или нет валюты (5) — депозит сохраняется «в ожидании» (pending) и НЕ учитывается,
   пока условие не выполнится; так не теряется депозит, пришедший раньше регистрации или без валюты. */

const CURRENCY_RE = /^[A-Z]{3}$/;
const clone = v => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));

/* Проверка принадлежности. Возвращает код отказа или null.
   Владение Trader ID доказывает ТОЛЬКО регистрация (registration postback по click_id пользователя).
   Привязка без такой регистрации (возможна в данных прежней версии) считается устаревшей и не учитывается:
   настоящая привязка другого пользователя всегда опирается на его регистрацию → conflict_click. */
function ownershipProblem({ reg, click, uid, trader, user }) {
  if (reg && reg.click_id !== click) return "conflict_click";                       // ID зарегистрирован по другой ссылке / другим пользователем
  if (reg && reg.uid && reg.uid !== uid) return "conflict_click";
  if (user && user.trader_id && String(user.trader_id) !== String(trader)) return "trader_mismatch"; // у пользователя привязан другой ID
  return null;
}

/* Засчитать один депозит в рабочую копию academy (мутирует work). */
function countDeposit(work, dep) {
  const isFirst = dep.kind === "ftd" && !work.first_deposit;
  if (isFirst) {
    work.first_deposit = {
      verified: true, click_id: dep.click_id, uid: dep.uid, event_key: dep.key, at: dep.at,
      amount_cents: dep.amount_cents, currency: dep.currency, usd_cents: dep.currency === "USD" ? dep.amount_cents : null
    };
  }
  work.deposit_totals = work.deposit_totals || {};
  const b = work.deposit_totals[dep.currency] || { sum_cents: 0, count: 0 };
  work.deposit_totals[dep.currency] = { sum_cents: b.sum_cents + dep.amount_cents, count: b.count + 1 };
  work.deposit_count = (work.deposit_count || 0) + 1;
  return isFirst ? "ftd_recorded" : (dep.kind === "ftd" ? "ftd_exists_counted_as_deposit" : "redeposit_recorded");
}

/* Решение по входящему депозиту. Возвращает { status, depositStatus, changed } и мутирует work. */
function applyIncomingDeposit(work, dep, ctx) {
  const problem = ownershipProblem({ reg: work.registration, click: dep.click_id, uid: dep.uid, trader: ctx.trader, user: ctx.user });
  if (problem === "trader_mismatch") {
    work.pending_deposits = work.pending_deposits || {};
    work.pending_deposits[dep.key] = { ...dep, status: "pending", reason: "trader_mismatch" };
    return { status: problem, depositStatus: "pending_trader_mismatch", changed: true };
  }
  if (problem) return { status: problem, depositStatus: "rejected_" + problem, changed: false };
  if (!work.registration || work.registration.verified !== true) {
    work.pending_deposits = work.pending_deposits || {};
    work.pending_deposits[dep.key] = { ...dep, status: "pending", reason: "registration" };
    return { status: "deposit_pending_registration", depositStatus: "pending_registration", changed: true };
  }
  if (!dep.currency || !CURRENCY_RE.test(dep.currency)) {
    work.pending_deposits = work.pending_deposits || {};
    work.pending_deposits[dep.key] = { ...dep, currency: null, status: "pending", reason: "currency" };
    return { status: "deposit_pending_currency", depositStatus: "pending_currency", changed: true };
  }
  return { status: countDeposit(work, dep), depositStatus: "counted", changed: true };
}

/* Обработка отложенных депозитов (после регистрации или при подтверждённой валюте).
   currencyOverride — применяется только к записям без валюты (решение владельца, см. скрипт).
   Возвращает список { key, depositStatus, currency }. Повторный вызов ничего не меняет. */
function promotePending(work, ctx, { currencyOverride = null } = {}) {
  const out = [];
  const pend = work.pending_deposits || {};
  const keys = Object.keys(pend).filter(k => pend[k].status === "pending").sort((a, b) => (pend[a].at || 0) - (pend[b].at || 0));
  for (const k of keys) {
    const d = pend[k];
    const problem = ownershipProblem({ reg: work.registration, click: d.click_id, uid: d.uid, trader: ctx.trader, user: ctx.user });
    if (problem === "trader_mismatch") continue;                                       // ждём, пока пользователь привяжет этот ID
    if (problem) { pend[k] = { ...d, status: "rejected", reject_reason: problem }; out.push({ key: k, depositStatus: "rejected_" + problem }); continue; }
    if (!work.registration || work.registration.verified !== true) continue;          // всё ещё ждём регистрацию
    const cur = d.currency && CURRENCY_RE.test(d.currency) ? d.currency : (currencyOverride && CURRENCY_RE.test(currencyOverride) ? currencyOverride : null);
    if (!cur) { if (d.reason !== "currency") pend[k] = { ...d, reason: "currency" }; continue; } // ждём валюту
    countDeposit(work, { ...d, currency: cur });
    pend[k] = { ...d, currency: cur, status: "counted" };
    out.push({ key: k, depositStatus: "counted", currency: cur });
  }
  return out;
}

/* Данные прежней версии: первый депозит записан без валюты (currency: null, usd_cents: null)
   и учтён только счётчиком unknown_currency_count. Исправляется ТОЛЬКО с явно заданной валютой. */
function fixLegacyNullCurrency(work, legacyEvents, currency) {
  const out = [];
  if (!currency || !CURRENCY_RE.test(currency)) return out;
  for (const ev of legacyEvents) {
    if (ev.currency || ev.counted_in_totals || ev.status) continue;                    // уже исправлено или новая схема
    work.deposit_totals = work.deposit_totals || {};
    const b = work.deposit_totals[currency] || { sum_cents: 0, count: 0 };
    work.deposit_totals[currency] = { sum_cents: b.sum_cents + ev.amount_cents, count: b.count + 1 };
    const u = work.deposit_totals.unknown_currency_count || 0;
    work.deposit_totals.unknown_currency_count = Math.max(0, u - 1);
    const fd = work.first_deposit;
    if (fd && fd.event_key === ev.key && !fd.currency) work.first_deposit = { ...fd, currency, usd_cents: currency === "USD" ? fd.amount_cents : null };
    out.push({ key: ev.key, depositStatus: "counted", currency, legacy: true });
  }
  return out;
}

module.exports = { ownershipProblem, countDeposit, applyIncomingDeposit, promotePending, fixLegacyNullCurrency, clone, CURRENCY_RE };
