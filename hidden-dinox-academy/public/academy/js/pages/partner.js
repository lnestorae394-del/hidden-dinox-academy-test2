/* HIDDEN DINOX ACADEMY — кабинет партнёра. Все цифры и статусы — только с сервера (/api/referral/me). */
(function () {
  "use strict";
  const el = document.getElementById("pt");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = c => "$" + (c / 100).toFixed(2);
  const dt = ms => (ms ? new Date(ms).toLocaleDateString(lang === "en" ? "en-GB" : lang === "ua" ? "uk-UA" : "ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const ST = { registered: "", trader_confirmed: "", ftd_confirmed: "", access_granted: "ok", qualified: "ok", rewarded: "ok", flagged: "warn" };
  const WS = { pending: "warn", processing: "warn", paid: "ok", rejected: "bad", cancelled: "" };
  let data = null, reqId = null;
  const newReqId = () => "req-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function applyTexts() { document.documentElement.lang = lang === "ua" ? "uk" : lang; document.querySelectorAll("[data-t]").forEach(e => (e.textContent = t(e.dataset.t))); }

  const dtm = ms => (ms ? new Date(ms).toLocaleString(lang === "en" ? "en-GB" : lang === "ua" ? "uk-UA" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  let showForm = false, lastCreated = null;
  function render() {
    const d = data, f = d.flags || { tracking: true, rewards: d.mode !== "off", payouts: false }, bal = d.balance || { available_cents: 0, reserved_cents: 0, paid_cents: 0, earned_cents: 0 };
    const link = location.origin + d.link_path, canWithdraw = f.payouts && !!d.trader_id && bal.available_cents >= d.min_withdraw_cents;
    const why = !f.rewards ? t("ptWhyRewardsOff") : !f.payouts ? t("ptWhyPayoutsOff") : !d.trader_id ? t("ptE_TRADER_REQUIRED") : bal.available_cents < d.min_withdraw_cents ? t("ptWhyMin", { min: money(d.min_withdraw_cents) }) : "";
    const amt = Number(((document.getElementById("amt") || {}).value) || 0);
    el.removeAttribute("aria-busy");
    el.innerHTML = `
      ${d.mode !== "live" ? `<section class="pt-card pt-mode" role="note">${esc(t(d.mode === "off" ? "ptModeOff" : "ptModeTest"))}</section>` : ""}
      <section class="pt-card"><h2>${esc(t("ptBalanceH"))}</h2>
        <div class="pt-stats"><div class="pt-stat"><b>${money(bal.available_cents)}</b><span>${esc(t("ptAvailable"))}</span></div><div class="pt-stat"><b>${money(bal.reserved_cents)}</b><span>${esc(t("ptReserved"))}</span></div><div class="pt-stat"><b>${money(bal.earned_cents)}</b><span>${esc(t("ptEarned"))}</span></div><div class="pt-stat"><b>${money(bal.paid_cents)}</b><span>${esc(t("ptPaid"))}</span></div></div>
        <div style="margin-top:14px"><button class="pt-btn" id="wopen" type="button" ${canWithdraw ? "" : "disabled"}>${esc(t("ptWithdrawBtn"))}</button>${why ? `<p class="pt-muted" style="font-size:13px;margin:8px 0 0">${esc(why)}</p>` : ""}</div>
        ${canWithdraw && showForm ? `<form class="pt-wform" id="wf"><p class="pt-note" role="note">${esc(t("ptWithdrawNotice"))}</p>
          <label class="pt-kv"><span>${esc(t("ptTraderFull"))}</span><input id="wtid" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{5,14}" required placeholder="${esc(t("ptTraderPh"))}"></label><div class="pt-kv"><span>${esc(t("ptAvailable"))}</span><b>${money(bal.available_cents)}</b></div>
          <label class="pt-kv"><span>${esc(t("ptAmount"))}, USD</span><input id="amt" type="number" min="${d.min_withdraw_cents / 100}" max="${bal.available_cents / 100}" step="0.01" inputmode="decimal" value="${amt || d.min_withdraw_cents / 100}"></label>
          <div class="pt-kv"><span>${esc(t("ptAfterReserve"))}</span><b id="after">${money(Math.max(0, bal.available_cents - Math.round((amt || d.min_withdraw_cents / 100) * 100)))}</b></div>
          <button class="pt-btn" id="wbtn">${esc(t("ptConfirmWithdraw"))}</button><p class="pt-err" id="werr" hidden></p></form>` : ""}
        ${lastCreated ? `<p class="pt-ok" role="status">${esc(t("ptCreated", { id: lastCreated }))}</p><p class="pt-note">${esc(t("ptWithdrawNotice"))}</p>` : ""}</section>
      <section class="pt-card"><h2>${esc(t("ptLinkH"))}</h2><div class="pt-link"><input id="lnk" readonly value="${esc(link)}" aria-label="${esc(t("ptLinkH"))}"><button class="pt-btn" id="copy" type="button">${esc(t("ptCopy"))}</button></div><p class="pt-ok" id="copied" hidden>${esc(t("ptCopied"))}</p></section>
      <section class="pt-card"><h2>${esc(t("ptStatsH"))}</h2><div class="pt-stats">${[["invited", "ptInvited"], ["registered", "ptRegistered"], ["trader_confirmed", "ptTrader"], ["ftd_confirmed", "ptFtd"], ["access_granted", "ptAccess"], ["qualified", "ptQualified"], ["rewarded", "ptRewarded"]].map(([k, l]) => `<div class="pt-stat"><b>${esc(d.stats[k] ?? 0)}</b><span>${esc(t(l))}</span></div>`).join("")}</div></section>
      <section class="pt-card"><h2>${esc(t("ptAccrualsH"))}</h2>${d.ledger.filter(e => e.type === "reward" || e.type === "adjustment").length ? `<div class="pt-wrap"><table class="pt-table"><thead><tr><th>${esc(t("ptAmount"))}</th><th>${esc(t("ptBasis"))}</th><th>${esc(t("ptDateTime"))}</th><th>${esc(t("ptStatus"))}</th><th>ID</th></tr></thead><tbody>${d.ledger.filter(e => e.type === "reward" || e.type === "adjustment").map(e => `<tr><td><b>${e.amount_cents > 0 ? "+" : "−"}${money(Math.abs(e.amount_cents))}</b>${e.mode === "test" ? " · test" : ""}</td><td>${esc(e.type === "reward" ? t("ptL_reward") + (e.invitee_trader_masked ? " · Trader ID " + e.invitee_trader_masked : "") : t("ptL_adjustment") + (e.reason ? " · " + e.reason : ""))}</td><td>${dtm(e.created_at)}</td><td><span class="pt-pill ok">${esc(t("ptCredited"))}</span></td><td class="pt-id">${esc(e.id)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pt-muted">${esc(t(f.rewards ? "ptNoAccruals" : "ptWhyRewardsOff"))}</p>`}</section>
      <section class="pt-card"><h2>${esc(t("ptWithdrawalsH"))}</h2>${d.withdrawals.length ? `<div class="pt-wrap"><table class="pt-table"><thead><tr><th>ID</th><th>${esc(t("ptAmount"))}</th><th>Trader ID</th><th>${esc(t("ptCreatedAt"))}</th><th>${esc(t("ptStatus"))}</th><th>${esc(t("ptComment"))}</th><th>${esc(t("ptPaidAt"))}</th><th></th></tr></thead><tbody>${d.withdrawals.map(w => `<tr><td class="pt-id">${esc(w.id)}</td><td>${money(w.amount_cents)}${w.mode === "test" ? " · test" : ""}</td><td>${esc(w.trader_id || "—")}</td><td>${dtm(w.created_at)}</td><td><span class="pt-pill ${WS[w.status] || ""}">${esc(t("ptW_" + w.status))}</span></td><td>${esc(w.admin_comment || "")}</td><td>${dtm(w.paid_at)}</td><td>${w.status === "pending" ? `<button class="pt-btn ghost" data-cancel="${esc(w.id)}" type="button">${esc(t("ptCancel"))}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pt-muted">${esc(t("ptNoWithdrawals"))}</p>`}</section>
      <section class="pt-card"><h2>${esc(t("ptRulesH"))}</h2><ul class="pt-rules">${t("ptRules", { reward: money(d.reward_cents), min: money(d.min_withdraw_cents) }).split("|").map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <section class="pt-card"><h2>${esc(t("ptInvitesH"))}</h2>${d.invites.length ? `<div class="pt-wrap"><table class="pt-table"><thead><tr><th>#</th><th>${esc(t("ptJoined"))}</th><th>${esc(t("ptStatus"))}</th></tr></thead><tbody>${d.invites.map(i => `<tr><td>${i.n}</td><td>${dt(i.joined_at)}</td><td><span class="pt-pill ${ST[i.status] || ""}">${esc(t("ptS_" + i.status))}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="pt-muted">${esc(t("ptNoInvites"))}</p>`}</section>`;
    document.getElementById("copy").onclick = async () => { const i = document.getElementById("lnk"); try { await navigator.clipboard.writeText(i.value); } catch (e) { i.select(); document.execCommand && document.execCommand("copy"); } document.getElementById("copied").hidden = false; };
    const wo = document.getElementById("wopen"); if (wo) wo.onclick = () => { showForm = true; lastCreated = null; render(); };
    const am = document.getElementById("amt"); if (am) am.oninput = () => { document.getElementById("after").textContent = money(Math.max(0, bal.available_cents - Math.round(Number(am.value || 0) * 100))); };
    const wf = document.getElementById("wf");
    if (wf) wf.onsubmit = async e => {
      e.preventDefault(); const b = document.getElementById("wbtn"), er = document.getElementById("werr"); b.disabled = true; er.hidden = true;
      reqId = reqId || newReqId();                                   // одна попытка — один request_id (повторный клик не создаст вторую заявку)
      try { const r = await call("POST", "/api/referral/withdrawals", { amount: Number(document.getElementById("amt").value), trader_id: document.getElementById("wtid").value.trim(), request_id: reqId }); reqId = null; showForm = false; lastCreated = r.withdrawal.id; await load(); }
      catch (x) { er.hidden = false; er.textContent = t("ptE_" + (x && x.code)) !== "ptE_" + (x && x.code) ? t("ptE_" + x.code) : t("ptE_generic"); b.disabled = false; }
    };
    el.querySelectorAll("[data-cancel]").forEach(b => (b.onclick = async () => { b.disabled = true; try { await call("POST", `/api/referral/withdrawals/${encodeURIComponent(b.dataset.cancel)}/cancel`, {}); await load(); } catch (e) { b.disabled = false; } }));
  }
  async function load() {
    try { data = await call("GET", "/api/referral/me"); render(); }
    catch (e) { if (e && e.code === "UNAUTHENTICATED") return location.replace("index.html"); el.removeAttribute("aria-busy"); el.innerHTML = `<p class="pt-err">${esc(t("ptE_generic"))}</p><button class="pt-btn ghost" type="button" onclick="location.reload()">${esc(t("retry"))}</button>`; }
  }
  (async () => { applyTexts(); try { const f = await fb(); if (!f.auth.currentUser) return location.replace("index.html"); } catch (e) { el.innerHTML = `<p class="pt-err">${esc(t("ptE_generic"))}</p>`; return; } load(); })();
})();
