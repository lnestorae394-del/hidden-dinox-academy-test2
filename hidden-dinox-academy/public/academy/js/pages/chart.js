/* Chart Training — страница ученика: график, гипотеза, раскрытие следующих свечей, разбор по критериям, история. */
(function () {
  let LANG = "ru"; try { const x = localStorage.getItem("hd_lang"); if (["ru", "en", "ua"].includes(x)) LANG = x; } catch (e) {}
  document.documentElement.lang = LANG === "ua" ? "uk" : LANG;
  const S = {
    ru: { train: "Тренировка", hist: "История", sim: "Симуляция — не реальные рыночные данные", histData: "Исторические данные", src: "источник",
      q: "Какой сценарий вы считаете более вероятным на следующем участке и почему? Какие элементы структуры его поддерживают и что сделает гипотезу недействительной?",
      hyp: "Гипотеза", up: "Вверх (CALL)", down: "Вниз (PUT)", no_trade: "Нет сделки — условий недостаточно", factors: "Что поддерживает гипотезу",
      f_structure: "Структура (HH/HL или LH/LL)", f_liquidity_sweep: "Снятие ликвидности", f_bos_mss: "BOS / MSS", f_fvg: "FVG / дисбаланс", f_premium_discount: "Premium / Discount", f_no_confirmation: "Нет подтверждения / диапазон",
      inval: "Уровень отмены (щёлкните по графику)", entry: "Вход (учебно, необязательно)", risk: "Риск на сделку, %", expl: "Объяснение", submit: "Зафиксировать ответ",
      needDir: "Выберите гипотезу.", needExpl: "Объясните гипотезу — минимум 10 символов.", invalid: "Проверьте ответ и попробуйте ещё раз.", score: "Баллы", c_direction: "Гипотеза относительно контекста", c_factors: "Найденные факторы", c_invalidation: "Уровень отмены", c_risk: "Риск",
      k_sound: "Обоснованная гипотеза — правила применены верно.", k_sound_not_realized: "Обоснованная гипотеза, которая не реализовалась. Это не ошибка: решение оценивается по правилам, а не по исходу.",
      k_incomplete: "Направление верное, но анализ неполный — см. пропущенные факторы и уровень отмены.", k_rule_error: "Гипотеза противоречит контексту графика — повторите структуру и снятие ликвидности.",
      k_forced_trade: "Здесь условий для сделки недостаточно — разумнее было пропустить.", missed: "Пропущено", extra: "Лишнее", outcome: "Цена после ответа", o_up: "выросла", o_down: "снизилась", o_flat: "почти не изменилась",
      lessons: "Повторить", course: { "smart-money-concepts-binary": "Smart Money Concepts", "risk-management-binary": "Risk Management", "hidden-reaction-system": "Hidden Reaction" }, module: "модуль",
      nextSc: "Следующий сценарий", noHist: "Пока нет тренировок.", open: "Разбор", NO_ACCESS: "Раздел откроется после подтверждения первого депозита.", FEATURE_UNAVAILABLE: "Раздел пока недоступен.",
      NO_SCENARIOS: "Сейчас нет доступных сценариев.", NETWORK: "Нет связи с сервером. Попробуйте ещё раз.", generic: "Не удалось загрузить. Попробуйте позже.", retry: "Повторить", disclaimer: "Учебная тренировка. Не является торговой рекомендацией." },
    en: { train: "Training", hist: "History", sim: "Simulation — not real market data", histData: "Historical data", src: "source",
      q: "Which scenario do you consider more likely for the next part of the chart, and why? What structure supports it, and what would invalidate the hypothesis?",
      hyp: "Hypothesis", up: "Up (CALL)", down: "Down (PUT)", no_trade: "No trade — not enough conditions", factors: "What supports the hypothesis",
      f_structure: "Structure (HH/HL or LH/LL)", f_liquidity_sweep: "Liquidity sweep", f_bos_mss: "BOS / MSS", f_fvg: "FVG / imbalance", f_premium_discount: "Premium / Discount", f_no_confirmation: "No confirmation / range",
      inval: "Invalidation level (click the chart)", entry: "Entry (practice, optional)", risk: "Risk per trade, %", expl: "Explanation", submit: "Lock in the answer",
      needDir: "Choose a hypothesis.", needExpl: "Explain your hypothesis — at least 10 characters.", invalid: "Check your answer and try again.", score: "Score", c_direction: "Hypothesis vs context", c_factors: "Factors found", c_invalidation: "Invalidation level", c_risk: "Risk",
      k_sound: "A well-founded hypothesis — the rules were applied correctly.", k_sound_not_realized: "A well-founded hypothesis that did not play out. That is not a mistake: decisions are judged by the rules, not the outcome.",
      k_incomplete: "The direction is right but the analysis is incomplete — see the missed factors and invalidation.", k_rule_error: "The hypothesis contradicts the chart context — review structure and liquidity sweeps.",
      k_forced_trade: "There were not enough conditions for a trade — skipping was the better decision.", missed: "Missed", extra: "Extra", outcome: "Price after the answer", o_up: "rose", o_down: "fell", o_flat: "barely moved",
      lessons: "Review", course: { "smart-money-concepts-binary": "Smart Money Concepts", "risk-management-binary": "Risk Management", "hidden-reaction-system": "Hidden Reaction" }, module: "module",
      nextSc: "Next scenario", noHist: "No training sessions yet.", open: "Review", NO_ACCESS: "This section opens after your first deposit is confirmed.", FEATURE_UNAVAILABLE: "This section is not available yet.",
      NO_SCENARIOS: "No scenarios are available right now.", NETWORK: "No connection to the server. Please try again.", generic: "Could not load. Please try later.", retry: "Retry", disclaimer: "Educational practice. Not trading advice." },
    ua: { train: "Тренування", hist: "Історія", sim: "Симуляція — не реальні ринкові дані", histData: "Історичні дані", src: "джерело",
      q: "Який сценарій ви вважаєте ймовірнішим на наступній ділянці і чому? Які елементи структури його підтримують і що зробить гіпотезу недійсною?",
      hyp: "Гіпотеза", up: "Вгору (CALL)", down: "Вниз (PUT)", no_trade: "Немає угоди — умов недостатньо", factors: "Що підтримує гіпотезу",
      f_structure: "Структура (HH/HL або LH/LL)", f_liquidity_sweep: "Зняття ліквідності", f_bos_mss: "BOS / MSS", f_fvg: "FVG / дисбаланс", f_premium_discount: "Premium / Discount", f_no_confirmation: "Немає підтвердження / діапазон",
      inval: "Рівень скасування (клацніть по графіку)", entry: "Вхід (навчально, необов’язково)", risk: "Ризик на угоду, %", expl: "Пояснення", submit: "Зафіксувати відповідь",
      needDir: "Оберіть гіпотезу.", needExpl: "Поясніть гіпотезу — щонайменше 10 символів.", invalid: "Перевірте відповідь і спробуйте ще раз.", score: "Бали", c_direction: "Гіпотеза відносно контексту", c_factors: "Знайдені чинники", c_invalidation: "Рівень скасування", c_risk: "Ризик",
      k_sound: "Обґрунтована гіпотеза — правила застосовано правильно.", k_sound_not_realized: "Обґрунтована гіпотеза, яка не реалізувалася. Це не помилка: рішення оцінюється за правилами, а не за результатом.",
      k_incomplete: "Напрямок правильний, але аналіз неповний — див. пропущені чинники й рівень скасування.", k_rule_error: "Гіпотеза суперечить контексту графіка — повторіть структуру та зняття ліквідності.",
      k_forced_trade: "Тут умов для угоди недостатньо — розумніше було пропустити.", missed: "Пропущено", extra: "Зайве", outcome: "Ціна після відповіді", o_up: "зросла", o_down: "знизилася", o_flat: "майже не змінилася",
      lessons: "Повторити", course: { "smart-money-concepts-binary": "Smart Money Concepts", "risk-management-binary": "Risk Management", "hidden-reaction-system": "Hidden Reaction" }, module: "модуль",
      nextSc: "Наступний сценарій", noHist: "Поки немає тренувань.", open: "Розбір", NO_ACCESS: "Розділ відкриється після підтвердження першого депозиту.", FEATURE_UNAVAILABLE: "Розділ поки недоступний.",
      NO_SCENARIOS: "Зараз немає доступних сценаріїв.", NETWORK: "Немає зв’язку із сервером. Спробуйте ще раз.", generic: "Не вдалося завантажити. Спробуйте пізніше.", retry: "Повторити", disclaimer: "Навчальне тренування. Не є торговою рекомендацією." }
  };
  const s = k => S[LANG][k] != null ? S[LANG][k] : S.ru[k] != null ? S.ru[k] : k;
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const main = document.getElementById("lp"); const show = h => { main.innerHTML = h; };
  const FACT = ["structure", "liquidity_sweep", "bos_mss", "fvg", "premium_discount", "no_confirmation"];
  let cur = null, inval = null, resizeT = null;
  function fail(e) {
    if (e && e.code === "UNAUTHENTICATED") return location.replace("/");
    if (e && e.code === "NO_ACCESS") return location.replace("academy.html");
    const code = e && ["FEATURE_UNAVAILABLE", "NETWORK", "NO_SCENARIOS"].includes(e.code) ? e.code : "generic";
    show(`<h1>Chart Training</h1><p class="lp-err" id="ctErr">${esc(s(code))}</p><div class="lp-foot"><a class="lp-btn" href="academy.html">←</a>${code === "NETWORK" || code === "generic" ? `<button class="lp-btn primary" id="ctRetry">${esc(s("retry"))}</button>` : ""}</div>`);
    const r = document.getElementById("ctRetry"); if (r) r.onclick = () => route();
  }
  const tabs = t => `<div class="ct-tabs" role="tablist"><button class="ct-tab" role="tab" aria-selected="${t === "train"}" data-tab="train">${esc(s("train"))}</button><button class="ct-tab" role="tab" aria-selected="${t === "hist"}" data-tab="history">${esc(s("hist"))}</button></div>`;
  const bindTabs = () => main.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { location.hash = b.dataset.tab === "train" ? "train" : "history"; });
  const labelHtml = l => l.kind === "synthetic" ? `<span class="ct-label synthetic" id="ctLabel">⚠ ${esc(s("sim"))}</span>` : `<span class="ct-label historical" id="ctLabel">${esc(s("histData"))}: ${esc(l.instrument)} ${esc(l.timeframe)} · ${esc(s("src"))}: ${esc(l.data_source)}</span>`;
  /* ---------- Свечной график на canvas ---------- */
  function draw(cv, candles, visible, opts = {}) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = Math.round(Math.min(420, Math.max(240, W * 0.5)));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px"; const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const shown = opts.all ? candles : candles.slice(0, visible), n = opts.all ? candles.length : visible + Math.round(visible * 0.3);
    const hi = Math.max(...shown.map(c => c.h), opts.inval || -Infinity), lo = Math.min(...shown.map(c => c.l), opts.inval || Infinity), pad = (hi - lo) * 0.08;
    const top = hi + pad, bot = lo - pad, padR = 58, cw = (W - padR - 8) / n, y = p => (top - p) / (top - bot) * (H - 16) + 8;
    g.fillStyle = "#070a07"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.06)"; g.fillStyle = "#7e887a"; g.font = "11px Manrope, Arial";
    for (let i = 0; i <= 4; i++) { const p = bot + (top - bot) * i / 4, yy = y(p); g.beginPath(); g.moveTo(0, yy); g.lineTo(W - padR, yy); g.stroke(); g.fillText(p.toFixed(5), W - padR + 4, yy + 4); }
    shown.forEach((c, i) => { const x = 8 + i * cw + cw / 2, up = c.c >= c.o, future = i >= visible;
      g.strokeStyle = g.fillStyle = future ? (up ? "rgba(139,234,36,.45)" : "rgba(255,138,122,.45)") : (up ? "#8bea24" : "#ff6b5e");
      g.beginPath(); g.moveTo(x, y(c.h)); g.lineTo(x, y(c.l)); g.stroke();
      const bh = Math.max(1, Math.abs(y(c.o) - y(c.c))); g.fillRect(x - Math.max(1, cw * 0.32), Math.min(y(c.o), y(c.c)), Math.max(2, cw * 0.64), bh); });
    if (opts.all) { const xs = 8 + visible * cw; g.strokeStyle = "rgba(255,209,102,.7)"; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(xs, 0); g.lineTo(xs, H); g.stroke(); g.setLineDash([]); }
    if (opts.inval != null && isFinite(opts.inval)) { const yy = y(opts.inval); g.strokeStyle = "#ffd166"; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, yy); g.lineTo(W - padR, yy); g.stroke(); g.setLineDash([]); g.fillStyle = "#ffd166"; g.fillText(opts.inval.toFixed(5), 6, yy - 4); }
    cv._price = py => top - (py - 8) / (H - 16) * (top - bot);
  }
  async function train() {
    const r = await call("GET", "/api/chart/next?lang=" + LANG); cur = r; inval = null;
    show(`${tabs("train")}${labelHtml(r.scenario.label)}<h1 style="margin:4px 0 10px">${esc(r.scenario.title)} · ${esc(r.scenario.timeframe)}</h1>
      <canvas class="ct-chart" id="ctChart" aria-label="chart"></canvas><p class="ct-q">${esc(s("q"))}</p>
      <form class="ct-form" id="ctForm" novalidate><div class="ct-f"><b>${esc(s("hyp"))}</b><div class="ct-row">${["up", "down", "no_trade"].map(d => `<label class="ct-chip"><input type="radio" name="dir" value="${d}"> ${esc(s(d))}</label>`).join("")}</div></div>
      <div class="ct-f"><b>${esc(s("factors"))}</b><div class="ct-row">${FACT.map(f => `<label class="ct-chip"><input type="checkbox" name="f" value="${f}"> ${esc(s("f_" + f))}</label>`).join("")}</div></div>
      <div class="ct-grid2"><label class="ct-f">${esc(s("inval"))}<input id="ctInval" inputmode="decimal"></label><label class="ct-f">${esc(s("entry"))}<input id="ctEntry" inputmode="decimal"></label><label class="ct-f">${esc(s("risk"))}<input id="ctRisk" inputmode="decimal" value="1"></label></div>
      <label class="ct-f">${esc(s("expl"))}<textarea id="ctExpl" rows="3" maxlength="1000"></textarea></label>
      <p class="lp-err" id="ctFormErr" hidden></p><div class="lp-foot"><span></span><button class="lp-btn primary" id="ctSubmit" type="submit">${esc(s("submit"))}</button></div></form><p class="lp-muted"><small>${esc(s("disclaimer"))}</small></p>`);
    bindTabs(); const cv = document.getElementById("ctChart"), redraw = () => draw(cv, r.scenario.candles, r.scenario.candles.length, { inval });
    redraw(); window.onresize = () => { clearTimeout(resizeT); resizeT = setTimeout(redraw, 120); };
    cv.onclick = e => { const b = cv.getBoundingClientRect(); inval = +cv._price(e.clientY - b.top).toFixed(5); document.getElementById("ctInval").value = inval; redraw(); };
    document.getElementById("ctInval").oninput = e => { const v = Number(String(e.target.value).replace(",", ".")); inval = isFinite(v) && v > 0 ? v : null; redraw(); };
    document.getElementById("ctForm").onsubmit = async ev => {
      ev.preventDefault(); const err = document.getElementById("ctFormErr"); const dir = (main.querySelector("input[name=dir]:checked") || {}).value;
      if (!dir) { err.textContent = s("needDir"); err.hidden = false; return; }
      if (dir !== "no_trade" && document.getElementById("ctExpl").value.trim().length < 10) { err.textContent = s("needExpl"); err.hidden = false; return; }
      const btn = document.getElementById("ctSubmit"); btn.disabled = true;
      try {
        const res = await call("POST", "/api/chart/answer", { session_id: r.session_id, direction: dir, factors: [...main.querySelectorAll("input[name=f]:checked")].map(x => x.value),
          invalidation: document.getElementById("ctInval").value, entry: document.getElementById("ctEntry").value, risk_percent: document.getElementById("ctRisk").value, explanation: document.getElementById("ctExpl").value });
        location.hash = "review/" + r.session_id; renderReview(res, r.scenario);
      } catch (e2) { btn.disabled = false; err.textContent = s(e2 && e2.code === "INVALID" ? "invalid" : e2 && e2.code === "NETWORK" ? "NETWORK" : "generic"); err.hidden = false; }
    };
  }
  function renderReview(res, sc) {
    const g = res.grade, lb = res.label ? labelHtml(res.label) : sc ? labelHtml(sc.label) : "";   // пометка источника — всегда, и в истории
    show(`${tabs("train")}${lb}<canvas class="ct-chart" id="ctChart"></canvas>
      <div style="display:flex;gap:16px;align-items:baseline;margin-top:14px"><span>${esc(s("score"))}</span><span class="ct-score" id="ctScore">${g.score}/100</span></div>
      <div class="ct-kind" id="ctKind">${esc(s("k_" + g.kind))}</div>
      <div class="ct-crit" id="ctCrit">${["direction", "factors", "invalidation", "risk"].map(k => `<div><span>${esc(s("c_" + k))}</span><b>${g.criteria[k]}/25</b></div>`).join("")}</div>
      <p>${esc(s("hyp"))}: <b>${esc(s(res.answer.direction))}</b> · ${esc(s("outcome"))}: <b id="ctOutcome">${esc(s("o_" + g.outcome))}</b></p>
      ${g.missed.length ? `<p>${esc(s("missed"))}: ${g.missed.map(f => esc(s("f_" + f))).join(", ")}</p>` : ""}${g.extra.length ? `<p>${esc(s("extra"))}: ${g.extra.map(f => esc(s("f_" + f))).join(", ")}</p>` : ""}
      ${(res.lessons || []).length ? `<p>${esc(s("lessons"))}: ${res.lessons.map(l => `${esc(s("course")[l.course_slug] || l.course_slug)} — ${esc(s("module"))} ${l.module_index + 1}`).join("; ")}</p>` : ""}
      <div class="lp-foot"><a class="lp-btn" href="#history">${esc(s("hist"))}</a><a class="lp-btn primary" href="#train" id="ctNext">${esc(s("nextSc"))}</a></div><p class="lp-muted"><small>${esc(s("disclaimer"))}</small></p>`);
    bindTabs(); const cv = document.getElementById("ctChart"), redraw = () => draw(cv, res.candles, res.visible, { all: true, inval: res.answer.invalidation });
    redraw(); window.onresize = () => { clearTimeout(resizeT); resizeT = setTimeout(redraw, 120); };
    document.getElementById("ctNext").onclick = e => { e.preventDefault(); location.hash = "train-" + Date.now(); };
  }
  async function history() {
    const h = await call("GET", "/api/chart/history");
    const fmt = ms => new Date(ms).toLocaleString(LANG === "en" ? "en-GB" : LANG === "ua" ? "uk-UA" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    show(`${tabs("hist")}<h1>${esc(s("hist"))}</h1>${h.sessions.length ? `<div class="ct-hist" id="ctHist">${h.sessions.map(x => `<div><span>${esc(fmt(x.answered_at))} · ${esc(s(x.direction))} · <b>${x.score}/100</b></span><a class="lp-btn" href="#review/${esc(x.session_id)}">${esc(s("open"))}</a></div>`).join("")}</div>` : `<p class="lp-muted" id="ctNoHist">${esc(s("noHist"))}</p>`}`);
    bindTabs();
  }
  async function route() {
    const h = location.hash.replace(/^#/, "");
    try {
      if (h === "history") return await history();
      if (h.startsWith("review/")) { const res = await call("GET", "/api/chart/session/" + encodeURIComponent(h.slice(7))); return renderReview(res, null); }
      return await train();
    } catch (e) { fail(e); }
  }
  window.addEventListener("hashchange", route);
  document.querySelectorAll(".lp-langs [data-lang]").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.lang === LANG));
    b.onclick = () => { LANG = b.dataset.lang; try { localStorage.setItem("hd_lang", LANG); } catch (e) {} location.reload(); }; });
  (async () => { try { const f = await fb(); if (!f.auth.currentUser) return location.replace("/"); } catch (e) { return fail({ code: "NETWORK" }); } route(); })();
})();
