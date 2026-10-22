"use strict";
/* HIDDEN DINOX ACADEMY — расчёт доступа (чистые функции, без Express и Firebase).

   Доступ открыт только если ВСЕ условия выполнены:
   1) пользователь авторизован (проверяет вызывающий код по ID-токену);
   2) Trader ID привязан к этому UID (users/{uid}.trader_id + trader_bindings/{traderId}.uid);
   3) регистрация у партнёра подтверждена проверенным postback (по trader_id); если в ней известен
      владелец (click_id академии) — это именно этот пользователь;
   4) первый подтверждённый депозит (FTD) в USD не меньше ACCESS_MIN_USD_CENTS.

   Порог $40.00 — внутреннее правило допуска. Пользователю он не показывается
   (в интерфейсе — «Минимальный депозит — $50»). Менять только с разрешения владельца. */

const ACCESS_MIN_USD_CENTS = 4000; // $40.00 включительно

/* Сумма из postback → целые центы. Без чисел с плавающей точкой (39.99 должно остаться 3999).
   Больше двух знаков после точки — отбрасываем (никогда не округляем вверх).
   Всё, что не похоже на неотрицательное десятичное число, — null. */
function parseAmountToCents(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!/^\d{1,9}(\.\d+)?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const cents = Number(int) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

const TRADER_ID_RE = /^\d{5,14}$/; // предположение — сверить с брокером

function isValidTraderId(v) { return typeof v === "string" && TRADER_ID_RE.test(v); }

function maskTraderId(id) {
  if (!id) return null;
  const s = String(id);
  return "••••" + s.slice(-4);
}

/* Подтверждения академии хранятся в referrals/{traderId}.academy (не пересекается со старыми полями). */
function registrationOf(referral) { return referral && referral.academy && referral.academy.registration || null; }
function firstDepositOf(referral) { return referral && referral.academy && referral.academy.first_deposit || null; }

/* user: users/{uid} (+ uid), binding: trader_bindings/{traderId}, referral: referrals/{traderId} */
/* regOwner (необязательно) — владелец регистрации, определённый по click_id академии, если в записи нет uid */
function evaluateAccess({ uid, user, binding, referral, regOwner = null }) {
  const out = {
    stage: "broker",
    traderId: null,
    traderIdMasked: null,
    traderIdLocked: false,
    brokerRegistrationConfirmed: false,
    depositState: "none",          // "none" | "low" | "ok"
    firstDeposit: null,            // { amount, currency } — только подтверждённый USD
    deposits: null,                // { count, totals: { USD: 100.00, … }, unknownCurrencyCount } — все депозиты
    academyAccess: false
  };
  if (!uid || !user || !user.trader_id) return out;

  const traderId = String(user.trader_id);
  // Привязка должна принадлежать именно этому пользователю
  if (!binding || binding.uid !== uid) return out;

  out.traderId = traderId;
  out.traderIdMasked = maskTraderId(traderId);
  out.stage = "deposit";

  // Регистрация засчитывается владельцу привязки; если регистрация знает владельца (click_id академии) — только ему
  const reg = registrationOf(referral);
  const owner = (reg && reg.uid) || regOwner || null;
  const regOk = !!(reg && reg.verified === true && (!owner || owner === uid));
  out.brokerRegistrationConfirmed = regOk;

  const fd = firstDepositOf(referral);
  const fdMine = !!(regOk && fd && fd.verified === true && (!fd.uid || fd.uid === uid));
  // Смена Trader ID блокируется, как только к нему подтверждён первый депозит этого пользователя
  out.traderIdLocked = fdMine;

  const fdUsable = fdMine && fd.currency === "USD" && Number.isSafeInteger(fd.usd_cents) && fd.usd_cents >= 0;
  if (fdUsable) {
    out.firstDeposit = { amount: fd.usd_cents / 100, currency: "USD" };
    out.depositState = fd.usd_cents >= ACCESS_MIN_USD_CENTS ? "ok" : "low";
  }
  // Сумма есть, но регистрация не подтверждена — доступа нет и «ok» не показываем
  if (out.depositState === "ok" && !regOk) out.depositState = "none";

  // Итоги по всем депозитам — независимый показатель, на доступ НЕ влияет.
  // Показываются только владельцу подтверждённой регистрации; валюты не складываются между собой.
  if (regOk && referral.academy) {
    const t = referral.academy.deposit_totals || {};
    const totals = {};
    for (const [cur, v] of Object.entries(t)) {
      if (/^[A-Z]{3}$/.test(cur) && v && Number.isSafeInteger(v.sum_cents)) totals[cur] = v.sum_cents / 100;
    }
    out.deposits = {
      count: Number.isSafeInteger(referral.academy.deposit_count) ? referral.academy.deposit_count : 0,
      totals,
      unknownCurrencyCount: Number.isSafeInteger(t.unknown_currency_count) ? t.unknown_currency_count : 0
    };
  }

  out.academyAccess = regOk && out.depositState === "ok";
  if (out.academyAccess) out.stage = "academy";
  return out;
}

module.exports = { ACCESS_MIN_USD_CENTS, parseAmountToCents, isValidTraderId, maskTraderId, evaluateAccess, registrationOf, firstDepositOf };
