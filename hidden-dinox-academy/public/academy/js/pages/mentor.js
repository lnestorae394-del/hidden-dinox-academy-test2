/* ИИ-помощник Hidden Dinox Academy — чат (ответы формирует сервер через Claude API; ключ на сервере). */
(function () {
  let LANG = "ru"; try { const x = localStorage.getItem("hd_lang"); if (["ru", "en", "ua"].includes(x)) LANG = x; } catch (e) {}
  document.documentElement.lang = LANG === "ua" ? "uk" : LANG;
  const S = {
    ru: { page: "ИИ-помощник", welcome: "Привет! Я твой ИИ-помощник Hidden Dinox Academy. Можешь задавать вопросы по Hidden Reaction, Smart Money Concepts и Risk Management. Я помогу разобраться в материалах и объяснить сложные моменты.",
      place: "Напишите вопрос по материалам курсов…", send: "Отправить", attach: "Прикрепить график", imageBad: "Выберите JPEG, PNG или WebP до 5 МБ.", imageTooBig: "Файл больше 5 МБ.", removeImage: "Убрать изображение", typing: "ИИ-помощник печатает", newChat: "Новый диалог", clear: "Очистить историю", clearQ: "Удалить всю историю переписки с ИИ-помощником? Это действие нельзя отменить.",
      yes: "Удалить", no: "Отмена", left: "Осталось сообщений сегодня: {n} из {t}", src: "Источник", retry: "Повторить",
      note: "ИИ может ошибаться — сверяйтесь с уроками. Ответы не являются финансовой рекомендацией и не гарантируют результат.",
      IMAGE_INVALID: "Неподдерживаемый формат изображения.", IMAGE_TOO_LARGE: "Изображение должно быть до 5 МБ.", AI_NOT_CONFIGURED: "ИИ-помощник ещё не подключён. Попробуйте позже.", AI_UNAVAILABLE: "ИИ-помощник временно недоступен. Попробуйте ещё раз через минуту.",
      USER_LIMIT: "Лимит сообщений на сегодня исчерпан. Новые сообщения будут доступны завтра.", BUDGET_EXHAUSTED: "ИИ-помощник временно недоступен: исчерпан общий лимит. Уроки и тесты работают как обычно.",
      BUSY: "Дождитесь ответа на предыдущее сообщение.", TOO_LONG: "Сообщение слишком длинное — не больше 1000 символов.", EMPTY: "Напишите вопрос.",
      NETWORK: "Нет связи с сервером. Попробуйте ещё раз.", FEATURE_UNAVAILABLE: "Раздел пока недоступен.", generic: "Не удалось получить ответ. Попробуйте ещё раз." },
    en: { page: "AI Mentor", welcome: "Hi! I'm your Hidden Dinox Academy AI mentor. You can ask me questions about Hidden Reaction, Smart Money Concepts and Risk Management. I'll help you make sense of the materials and explain the tricky parts.",
      place: "Ask a question about the course materials…", send: "Send", attach: "Attach chart", imageBad: "Choose JPEG, PNG or WebP up to 5 MB.", imageTooBig: "File is larger than 5 MB.", removeImage: "Remove image", typing: "AI Mentor is typing", newChat: "New chat", clear: "Clear history", clearQ: "Delete your entire chat history with the AI mentor? This cannot be undone.",
      yes: "Delete", no: "Cancel", left: "Messages left today: {n} of {t}", src: "Source", retry: "Retry",
      note: "AI can make mistakes — check against the lessons. Answers are not financial advice and do not guarantee results.",
      IMAGE_INVALID: "Unsupported image format.", IMAGE_TOO_LARGE: "Image must be up to 5 MB.", AI_NOT_CONFIGURED: "The AI mentor is not connected yet. Please try later.", AI_UNAVAILABLE: "The AI mentor is temporarily unavailable. Please try again in a minute.",
      USER_LIMIT: "You've reached today's message limit. New messages will be available tomorrow.", BUDGET_EXHAUSTED: "The AI mentor is temporarily unavailable: the overall limit has been reached. Lessons and tests work as usual.",
      BUSY: "Please wait for the answer to your previous message.", TOO_LONG: "The message is too long — up to 1000 characters.", EMPTY: "Type a question.",
      NETWORK: "No connection to the server. Please try again.", FEATURE_UNAVAILABLE: "This section is not available yet.", generic: "Could not get an answer. Please try again." },
    ua: { page: "ШІ-помічник", welcome: "Привіт! Я твій ШІ-помічник Hidden Dinox Academy. Можеш ставити запитання з Hidden Reaction, Smart Money Concepts і Risk Management. Я допоможу розібратися в матеріалах і пояснити складні моменти.",
      place: "Напишіть запитання з матеріалів курсів…", send: "Надіслати", attach: "Додати графік", imageBad: "Оберіть JPEG, PNG або WebP до 5 МБ.", imageTooBig: "Файл більший за 5 МБ.", removeImage: "Прибрати зображення", typing: "ШІ-помічник друкує", newChat: "Новий діалог", clear: "Очистити історію", clearQ: "Видалити всю історію листування з ШІ-помічником? Цю дію не можна скасувати.",
      yes: "Видалити", no: "Скасувати", left: "Залишилося повідомлень сьогодні: {n} з {t}", src: "Джерело", retry: "Повторити",
      note: "ШІ може помилятися — звіряйтеся з уроками. Відповіді не є фінансовою рекомендацією й не гарантують результату.",
      IMAGE_INVALID: "Непідтримуваний формат зображення.", IMAGE_TOO_LARGE: "Зображення має бути до 5 МБ.", AI_NOT_CONFIGURED: "ШІ-помічник ще не підключено. Спробуйте пізніше.", AI_UNAVAILABLE: "ШІ-помічник тимчасово недоступний. Спробуйте ще раз за хвилину.",
      USER_LIMIT: "Ліміт повідомлень на сьогодні вичерпано. Нові повідомлення будуть доступні завтра.", BUDGET_EXHAUSTED: "ШІ-помічник тимчасово недоступний: вичерпано загальний ліміт. Уроки й тести працюють як зазвичай.",
      BUSY: "Дочекайтеся відповіді на попереднє повідомлення.", TOO_LONG: "Повідомлення задовге — не більше 1000 символів.", EMPTY: "Напишіть запитання.",
      NETWORK: "Немає зв’язку із сервером. Спробуйте ще раз.", FEATURE_UNAVAILABLE: "Розділ поки недоступний.", generic: "Не вдалося отримати відповідь. Спробуйте ще раз." }
  };
  const s = (k, v) => { let x = S[LANG][k] != null ? S[LANG][k] : S.ru[k] != null ? S.ru[k] : k; if (v) for (const [a, b] of Object.entries(v)) x = x.split("{" + a + "}").join(String(b)); return x; };
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const main = document.getElementById("lp");
  document.title = s("page") + " — HIDDEN DINOX ACADEMY"; { const c = document.getElementById("crumb"); if (c) c.textContent = s("page"); }
  { const bk = document.getElementById("back"); if (bk) bk.textContent = "← " + ({ ru: "Академия", en: "Academy", ua: "Академія" })[LANG]; }
  /* безопасная разметка ответа: экранирование, абзацы, списки «- », **жирный** */
  function fmt(t) {
    const out = []; let list = null;
    for (const line of String(t).split("\n")) {
      const li = /^\s*[-•*]\s+(.*)$/.exec(line), x = esc(li ? li[1] : line).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      if (li) { if (!list) { list = []; } list.push(`<li>${x}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
      if (line.trim()) out.push(`<p>${x}</p>`);
    }
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    return out.join("");
  }
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : (Date.now().toString(36) + Math.random().toString(36).slice(2))).slice(0, 32);
  let state = { messages: [], limit: null, busy: false, pending: null, image: null };
  function bubble(m) { return `<div class="mn-msg ${m.role}" data-role="${m.role}">${m.role === "assistant" ? fmt(m.text) : `<p>${esc(m.text).replace(/\n/g, "<br>")}</p>`}${(m.sources || []).length ? `<div class="mn-src">${esc(s("src"))}: ${m.sources.map(x => esc(x.course + " → " + x.lesson)).join("; ")}</div>` : ""}</div>`; }
  function render() {
    main.innerHTML = `<div class="mn-top"><h1>${esc(s("page"))}</h1><div class="mn-acts"><button class="lp-btn" id="mnNew" type="button">${esc(s("newChat"))}</button><button class="lp-btn" id="mnClear" type="button">${esc(s("clear"))}</button></div></div>
      <div class="mn-confirm" id="mnClearBox" hidden><p style="margin:0 0 10px">${esc(s("clearQ"))}</p><div class="mn-acts"><button class="lp-btn" id="mnClearNo" type="button">${esc(s("no"))}</button><button class="lp-btn primary" id="mnClearYes" type="button">${esc(s("yes"))}</button></div></div>
      <p class="mn-limit" id="mnLimit"></p>
      <div class="mn-log" id="mnLog" aria-live="polite"></div>
      <div class="mn-err" id="mnErr" hidden><span id="mnErrText"></span><button class="lp-btn" id="mnRetry" type="button" hidden>${esc(s("retry"))}</button></div>
      <div class="mn-image-tools"><label class="lp-btn" for="mnImage">${esc(s("attach"))}</label><input id="mnImage" type="file" accept="image/jpeg,image/png,image/webp" hidden><span id="mnImageName"></span><button type="button" class="lp-btn" id="mnImageRemove" hidden>${esc(s("removeImage"))}</button></div>
      <form class="mn-form" id="mnForm" novalidate><div><textarea id="mnInput" rows="2" maxlength="1000" placeholder="${esc(s("place"))}" aria-label="${esc(s("place"))}"></textarea><div class="mn-count" id="mnCount">0/1000</div></div>
        <button class="lp-btn primary" id="mnSend" type="submit">${esc(s("send"))}</button></form>
      <p class="mn-note">${esc(s("note"))}</p>`;
    bind(); paint();
  }
  function paint() {
    const log = document.getElementById("mnLog");
    log.innerHTML = bubble({ role: "assistant", text: s("welcome") }) + state.messages.map(bubble).join("") + (state.busy ? `<div class="mn-typing" id="mnTyping">${esc(s("typing"))} <i></i><i></i><i></i></div>` : "");
    log.scrollTop = log.scrollHeight;
    const l = state.limit; document.getElementById("mnLimit").textContent = l ? s("left", { n: l.remaining_today, t: l.per_day }) : "";
    document.getElementById("mnSend").disabled = state.busy;
    const nm = document.getElementById("mnImageName"); if (nm) nm.textContent = state.image ? state.image.name : "";
    const rm = document.getElementById("mnImageRemove"); if (rm) rm.hidden = !state.image;
  }
  function showErr(code, canRetry) {
    const box = document.getElementById("mnErr"); document.getElementById("mnErrText").textContent = s(S.ru[code] ? code : "generic");
    document.getElementById("mnRetry").hidden = !canRetry; box.hidden = false; box.dataset.code = code || "generic";
  }
  async function sendMsg(text, id, image = null) {
    document.getElementById("mnErr").hidden = true;
    state.busy = true; state.pending = { text, id, image }; state.messages.push({ role: "user", text: text || "[Скриншот графика]", local: id }); paint();
    try {
      const r = await call("POST", "/api/mentor/message?lang=" + LANG, { text, client_id: id, ...(image ? { image: { mime_type: image.mime_type, data: image.data } } : {}) });
      state.messages.push(r.reply); state.pending = null; if (state.limit) state.limit.remaining_today = Math.max(0, state.limit.remaining_today - (r.duplicate ? 0 : 1));
    } catch (e) {
      state.messages = state.messages.filter(m => m.local !== id);   // не показываем неотправленное как часть диалога
      const code = e && e.code; if (code === "UNAUTHENTICATED") return location.replace("/");
      showErr(code, code === "NETWORK" || code === "AI_UNAVAILABLE" || code === "UNAVAILABLE");
      if (code !== "NETWORK" && code !== "AI_UNAVAILABLE") state.pending = null; else document.getElementById("mnInput").value = text;
    } finally { state.busy = false; paint(); }
  }
  function bind() {
    const ta = document.getElementById("mnInput"), cnt = document.getElementById("mnCount");
    const picker = document.getElementById("mnImage");
    picker.onchange = async () => { const f = picker.files && picker.files[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { showErr("IMAGE_TOO_LARGE", false); picker.value = ""; return; } if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) { showErr("IMAGE_INVALID", false); picker.value = ""; return; } const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = reject; r.readAsDataURL(f); }); state.image = { name: f.name, mime_type: f.type, data }; paint(); };
    document.getElementById("mnImageRemove").onclick = () => { state.image = null; picker.value = ""; paint(); };
    ta.oninput = () => { cnt.textContent = ta.value.length + "/1000"; };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById("mnForm").requestSubmit(); } };
    document.getElementById("mnForm").onsubmit = e => {
      e.preventDefault(); if (state.busy) return; const text = ta.value.trim(); const image = state.image;
      if (!text && !image) { showErr("EMPTY", false); return; } if (text.length > 1000) { showErr("TOO_LONG", false); return; }
      const id = state.pending && state.pending.text === text ? state.pending.id : newId();   // повтор того же текста — тот же client_id (без дублей)
      ta.value = ""; cnt.textContent = "0/1000"; state.image = null; picker.value = ""; paint(); sendMsg(text, id, image);
    };
    document.getElementById("mnRetry").onclick = () => { if (state.pending && !state.busy) { document.getElementById("mnInput").value = ""; sendMsg(state.pending.text, state.pending.id, state.pending.image); } };
    document.getElementById("mnNew").onclick = async () => { try { await call("POST", "/api/mentor/new", {}); state.messages = []; state.pending = null; document.getElementById("mnErr").hidden = true; paint(); } catch (e) { showErr(e && e.code, false); } };
    const box = document.getElementById("mnClearBox");
    document.getElementById("mnClear").onclick = () => { box.hidden = false; document.getElementById("mnClearNo").focus(); };
    document.getElementById("mnClearNo").onclick = () => { box.hidden = true; };
    document.getElementById("mnClearYes").onclick = async () => { try { await call("POST", "/api/mentor/clear", { confirm: true }); state.messages = []; state.pending = null; box.hidden = true; paint(); } catch (e) { showErr(e && e.code, false); } };
  }
  async function load() {
    try { const t = await call("GET", "/api/mentor/thread"); state.messages = t.messages; state.limit = t.limit; render(); if (!t.configured) showErr("AI_NOT_CONFIGURED", false); }
    catch (e) {
      if (e && e.code === "UNAUTHENTICATED") return location.replace("/");
      if (e && e.code === "NO_ACCESS") return location.replace("academy.html");
      main.innerHTML = `<h1>${esc(s("page"))}</h1><p class="lp-err" id="mnFail">${esc(s(e && ["FEATURE_UNAVAILABLE", "NETWORK"].includes(e.code) ? e.code : "generic"))}</p><div class="lp-foot"><a class="lp-btn" href="academy.html">←</a></div>`;
    }
  }
  document.querySelectorAll(".lp-langs [data-lang]").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.lang === LANG));
    b.onclick = () => { LANG = b.dataset.lang; try { localStorage.setItem("hd_lang", LANG); } catch (e) {} location.reload(); }; });
  (async () => { try { const f = await fb(); if (!f.auth.currentUser) return location.replace("/"); } catch (e) { return; } load(); })();
})();
