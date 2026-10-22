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

  function render() {
    const d = data, mode = d.mode, bal = d.balances[mode] || { available_cents: 0, reserved_cents: 0, paid_cents: 0, earned_cents: 0 };
    const link = location.origin + d.link_path;
    el.removeAttribute("aria-busy");
    el.innerHTML = `
      ${mode !== "live" ? `<section class="pt-card pt-mode" role="note">${esc(t(mode === "off" ? "ptModeOff" : "ptModeTest"))}</section>` : ""}
      <section class="pt-card"><h2>${esc(t("ptLinkH"))}</h2><div class="pt-link"><input id="lnk" readonly value="${esc(link)}" aria-label="${esc(t("ptLinkH"))}"><button class="pt-btn" id="copy" type="button">${esc(t("ptCopy"))}</button></div><p class="pt-ok" id="copied" hidden>${esc(t("ptCopied"))}</p></section>
      <section class="pt-card"><h2>${esc(t("ptStatsH"))}</h2><div class="pt-stats">${[["invited", "ptInvited"], ["trader_confirmed", "ptTrader"], ["ftd_confirmed", "ptFtd"], ["access_granted", "ptAccess"], ["rewarded", "ptRewarded"]].map(([k, l]) => `<div class="pt-stat"><b>${esc(d.stats[k])}</b><span>${esc(t(l))}</span></div>`).join("")}</div></section>
      <section class="pt-card"><h2>${esc(t("ptRulesH"))}</h2><ul class="pt-rules">${t("ptRules", { reward: money(d.reward_cents), min: money(d.min_withdraw_cents) }).split("|").map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>
      <section class="pt-card"><h2>${esc(t("ptInvitesH"))}</h2>${d.invites.length ? `<div class="pt-wrap"><table class="pt-table"><thead><tr><th>#</th><th>${esc(t("ptJoined"))}</th><th>${esc(t("ptStatus"))}</th></tr></thead><tbody>${d.invites.map(i => `<tr><td>${i.n}</td><td>${dt(i.joined_at)}</td><td><span class="pt-pill ${ST[i.status] || ""}">${esc(t("ptS_" + i.status))}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="pt-muted">${esc(t("ptNoInvites"))}</p>`}</section>
      ${mode !== "off" ? `<section class="pt-card"><h2>${esc(t("ptBalanceH"))}</h2><div class="pt-stats"><div class="pt-stat"><b>${money(bal.available_cents)}</b><span>${esc(t("ptAvailable"))}</span></div><div class="pt-stat"><b>${money(bal.reserved_cents)}</b><span>${esc(t("ptReserved"))}</span></div><div class="pt-stat"><b>${money(bal.paid_cents)}</b><span>${esc(t("ptPaid"))}</span></div></div>
        <form class="pt-form" id="wf" style="margin-top:14px"><input id="amt" type="number" min="${d.min_withdraw_cents / 100}" step="1" inputmode="decimal" placeholder="${d.min_withdraw_cents / 100}" aria-label="${esc(t("ptAmount"))}"><button class="pt-btn" id="wbtn" ${bal.available_cents < d.min_withdraw_cents ? "disabled" : ""}>${esc(t("ptWithdraw"))}</button></form>
        <p class="pt-muted" style="font-size:13px;margin:8px 0 0">${esc(t("ptWithdrawNote", { min: money(d.min_withdraw_cents) }))}</p><p class="pt-err" id="werr" hidden></p></section>` : ""}
      ${d.withdrawals.length ? `<section class="pt-card"><h2>${esc(t("ptWithdrawalsH"))}</h2><div class="pt-wrap"><table class="pt-table"><thead><tr><th>${esc(t("ptDate"))}</th><th>${esc(t("ptAmount"))}</th><th>${esc(t("ptStatus"))}</th><th></th></tr></thead><tbody>${d.withdrawals.map(w => `<tr><td>${dt(w.created_at)}</td><td>${money(w.amount_cents)}${w.mode === "test" ? " · test" : ""}</td><td><span class="pt-pill ${WS[w.status] || ""}">${esc(t("ptW_" + w.status))}</span></td><td>${w.status === "pending" ? `<button class="pt-btn ghost" data-cancel="${esc(w.id)}" type="button">${esc(t("ptCancel"))}</button>` : ""}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      ${d.ledger.length ? `<section class="pt-card"><h2>${esc(t("ptHistoryH"))}</h2><div class="pt-wrap"><table class="pt-table"><thead><tr><th>${esc(t("ptDate"))}</th><th>${esc(t("ptOperation"))}</th><th>${esc(t("ptAmount"))}</th></tr></thead><tbody>${d.ledger.map(e => `<tr><td>${dt(e.created_at)}</td><td>${esc(t("ptL_" + e.type))}${e.mode === "test" ? " · test" : ""}</td><td>${e.amount_cents ? (e.amount_cents > 0 ? "+" : "−") + money(Math.abs(e.amount_cents)) : "—"}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
    document.getElementById("copy").onclick = async () => { const i = document.getElementById("lnk"); try { await navigator.clipboard.writeText(i.value); } catch (e) { i.select(); document.execCommand && document.execCommand("copy"); } document.getElementById("copied").hidden = false; };
    const wf = document.getElementById("wf");
    if (wf) wf.onsubmit = async e => {
      e.preventDefault(); const b = document.getElementById("wbtn"), er = document.getElementById("werr"); b.disabled = true; er.hidden = true;
      reqId = reqId || newReqId();                                   // одна попытка — один request_id (повторный клик не создаст вторую заявку)
      try { await call("POST", "/api/referral/withdrawals", { amount: Number(document.getElementById("amt").value), request_id: reqId }); reqId = null; await load(); }
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
