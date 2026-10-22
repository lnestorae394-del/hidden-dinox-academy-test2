/* HIDDEN DINOX ACADEMY — админ-панель (без сборки, без зависимостей).
   Все права проверяет сервер (/admin/api). Интерфейс только скрывает недоступные разделы.
   Пользовательские данные выводятся через esc() — HTML из базы не выполняется. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = window.HDLesson.esc;
  const main = $("#main"), titleEl = $("#title"), app = $("#app");
  let ME = null;
  let SEQ = 0;   // номер текущего перехода: ответы на чтение для покинутой страницы отбрасываются

  /* ---------- Служебное ---------- */
  let toastT;
  function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 3600); }
  const fmtDate = t => (t ? new Date(t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const fmtDay = t => (t ? new Date(t).toLocaleDateString("ru-RU") : "—");
  const kb = n => (n > 1048576 ? (n / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ");
  const can = p => !!(ME && ME.permissions.includes(p));
  const ERR = { UNAUTHENTICATED: "Сессия истекла — войдите снова", FORBIDDEN: "Недостаточно прав для этого действия", NOT_FOUND: "Не найдено", TOO_MANY: "Слишком много запросов — подождите минуту",
    CONFIRM_REQUIRED: "Нужно явное подтверждение", UNAVAILABLE: "Временная ошибка сервера — повторите", CONFIG_MISSING: "Сервер не подключён к Firebase", NETWORK: "Нет связи с сервером", BLOCKED: "Аккаунт заблокирован" };
  const errText = e => (e && (e.message && e.error !== "UNAVAILABLE" ? e.message : ERR[e.error] || ERR[e.code])) || "Не удалось выполнить действие";

  async function api(method, path, body, opts = {}) {
    const seq = SEQ;
    const token = await idToken();
    const headers = { Authorization: "Bearer " + token };
    let payload;
    if (opts.raw) { payload = opts.raw; Object.assign(headers, opts.headers || {}); }
    else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/vnd.hd+json"; }   // свой тип: обходит лимит 100 КБ общего разборщика
    let r;
    try { r = await fetch("/admin/api" + path, { method, headers, body: payload, cache: "no-store" }); } catch (e) { throw { error: "NETWORK" }; }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (method === "GET" && seq !== SEQ) throw { stale: true };   // пользователь уже перешёл на другую страницу
    if (!r.ok) throw Object.assign({ status: r.status }, j || { error: "UNAVAILABLE" });
    return j;
  }
  const run = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } catch (e) { if (e && e.stale) return; toast(errText(e), true); if (e && e.error === "UNAUTHENTICATED") boot(); } finally { if (btn) btn.disabled = false; } };

  function modal(title, bodyHtml, buttons = [], { wide = false } = {}) {
    const d = $("#modal");
    d.className = "modal" + (wide ? " wide" : "");
    $("#modalBody").innerHTML = `<div class="mh"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Закрыть">✕</button></div><div class="mb">${bodyHtml}</div>${buttons.length ? `<div class="mf">${buttons.map((b, i) => `<button class="btn ${b.cls || ""}" data-b="${i}">${esc(b.label)}</button>`).join("")}</div>` : ""}`;
    $("#modalBody").querySelector("[data-x]").onclick = () => d.close();
    buttons.forEach((b, i) => { $("#modalBody").querySelector(`[data-b="${i}"]`).onclick = async e => { const keep = await b.onClick(e.currentTarget); if (keep !== true) d.close(); }; });
    if (!d.open) d.showModal();
    return $("#modalBody");
  }
  const confirmDlg = (title, text, okLabel, onOk, cls = "danger") => modal(title, `<p>${text}</p>`, [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: okLabel, cls, onClick: onOk }]);

  /* ---------- Навигация ---------- */
  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const NAV = [
    ["dashboard", "Сводка", "dashboard.view", I('<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>')],
    ["courses", "Курсы и уроки", "content.edit", I('<path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z"/><path d="M8 9h6M8 13h4"/>')],
    ["media", "Медиа", "content.edit", I('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>')],
    ["announcements", "Афиши", "announcements.edit", I('<path d="M4 10v4l12 5V5zM16 9a3 3 0 0 1 0 6"/>')],
    ["users", "Пользователи", "users.view", I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6 6 0 0 0-4-5.6"/>')],
    ["audit", "Журнал действий", "audit.view", I('<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/>')],
    ["import", "Импорт курса", "import.course", I('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>')],
    ["partners", "Партнёры и выплаты", "partners.view", I('<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19a5 5 0 0 1 10 0M11 19a5 5 0 0 1 10 0"/>')],
    ["diagnostics", "Диагностика", "diagnostics.view", I('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>')]
  ];
  function buildNav(active) {
    $("#nav").innerHTML = NAV.filter(n => can(n[2])).map(n => `<a href="#/${n[0]}" ${n[0] === active ? 'aria-current="page"' : ""}>${n[3]}<span>${n[1]}</span></a>`).join("");
    $("#me").innerHTML = `<b>${esc(ME.email || ME.uid)}</b>${esc(ME.role_label)}<br><button class="btn sm ghost" id="logout">Выйти</button>`;
    $("#logout").onclick = async () => { await api_signOut(); location.hash = ""; boot(); };
  }
  const api_signOut = () => window.hdAuth.signOut();
  function setMenu(open) { app.classList.toggle("menu-open", open); $("#scrim").hidden = !open; $("#menuBtn").setAttribute("aria-expanded", open); }
  $("#menuBtn").onclick = () => setMenu(!app.classList.contains("menu-open"));
  $("#scrim").onclick = () => setMenu(false);
  function page(title, sub, actionsHtml = "") { titleEl.textContent = title; document.title = title + " — HIDDEN DINOX ACADEMY"; return `<div class="page-h"><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ""}</div><div class="actions">${actionsHtml}</div></div>`; }

  /* ---------- Вход ---------- */
  function loginView(message) {
    setMenu(false);                       // на телефоне меню не должно перекрывать форму входа
    app.dataset.view = "login";
    $("#nav").innerHTML = ""; $("#me").innerHTML = ""; titleEl.textContent = "Вход";
    main.innerHTML = `<div class="login"><h2>Админ-панель</h2><p class="muted">${esc(message || "Войдите аккаунтом академии с правами администратора.")}</p>
      <form class="panel form" id="lf"><label class="f">Email<input type="email" id="le" autocomplete="username" required></label>
      <label class="f">Пароль<input type="password" id="lp" autocomplete="current-password" required></label><p class="err" id="lerr" hidden></p>
      <button class="btn primary" id="lb">Войти</button></form><p class="muted" style="margin-top:14px"><a href="/academy/">Вернуться в академию</a></p></div>`;
    $("#lf").onsubmit = async e => {
      e.preventDefault(); const b = $("#lb"); b.disabled = true; $("#lerr").hidden = true;
      try { await window.hdAuth.signIn($("#le").value.trim(), $("#lp").value); await boot(); }
      catch (er) { $("#lerr").hidden = false; $("#lerr").textContent = er && er.code === "BAD_CREDENTIALS" ? "Неверный email или пароль" : errText(er); }
      finally { b.disabled = false; }
    };
  }

  /* ---------- Сводка ---------- */
  const bars = (series, label) => { const max = Math.max(1, ...series.map(s => s.count)); return `<div class="bars" role="img" aria-label="${esc(label)}">${series.map(s => `<i style="height:${(s.count / max) * 100}%" title="${esc(s.date)}: ${s.count}"></i>`).join("")}</div><div class="bars-x"><span>${esc(series[0] ? series[0].date : "")}</span><span>${esc(series.length ? series[series.length - 1].date : "")}</span></div>`; };
  async function dashboardView() {
    main.innerHTML = page("Сводка", "Данные Firestore на момент открытия страницы") + `<p class="muted">Загрузка…</p>`;
    const d = await api("GET", "/dashboard");
    const S = (v, l, key) => `<div class="stat${key ? " key" : ""}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`;
    const norm = s => Array.isArray(s) ? s.map(x => (Array.isArray(x) ? { date: x[0], count: x[1] } : x)) : Object.entries(s || {}).map(([date, count]) => ({ date, count }));
    main.innerHTML = page("Сводка", "Данные Firestore на момент открытия страницы", `<button class="btn" id="rf">Обновить</button>`) +
      `<div class="grid stats">${S(d.users.total, "Пользователей")}${S(d.academy.activated, "Доступ к академии открыт", 1)}${S(d.academy.trader_bound, "Привязано Trader ID")}${S(d.academy.ftd_confirmed, "Подтверждённых первых депозитов")}
      ${S(d.academy.awaiting_deposit, "Ожидают подтверждения депозита")}${S(d.users.new7, "Новых за 7 дней")}${S(d.users.new30, "Новых за 30 дней")}${S(d.content.courses_published + " / " + d.content.courses, "Курсов опубликовано / всего")}
      ${S(d.content.modules, "Модулей")}${S(d.content.lessons_ready + " / " + d.content.lessons, "Уроков готово / всего")}${S(d.learning.lessons_completed, "Завершённых уроков")}${S(d.learning.learners, "Учеников с прогрессом")}</div>
      <div class="grid two"><section class="panel"><h3>Регистрации за 30 дней</h3>${bars(norm(d.charts.registrations), "Регистрации по дням")}</section>
      <section class="panel"><h3>Завершённые уроки за 30 дней</h3>${bars(norm(d.charts.completions), "Завершения по дням")}</section>
      <section class="panel"><h3>Последние действия администраторов</h3>${d.recent.length ? `<div class="table-wrap"><table><tbody>${d.recent.map(r => `<tr><td class="num">${fmtDate(r.at)}</td><td>${esc(r.action)}</td><td class="hide-sm muted">${esc(r.actor || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Пока нет записей.</p>`}</section>
      <section class="panel"><h3>Последние завершения уроков</h3>${(d.recent_learning || []).length ? `<div class="table-wrap"><table><tbody>${d.recent_learning.map(r => `<tr><td class="num">${fmtDate(r.at)}</td><td>${esc(r.email || r.uid)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Ученики ещё не завершали уроки.</p>`}</section></div>
      ${(d.notes || []).map(n => `<p class="muted" style="margin-top:14px;font-size:13px">${esc(n)}</p>`).join("")}`;
    $("#rf").onclick = () => route();
  }

  /* ---------- Курсы ---------- */
  const LEVEL = { beginner: "Начальный", intermediate: "Средний", advanced: "Продвинутый" };
  const statusPill = s => s === "published" ? `<span class="pill ok">Опубликован</span>` : s === "ready" ? `<span class="pill info">Готов к публикации</span>` : `<span class="pill warn">Черновик</span>`;
  async function coursesView() {
    main.innerHTML = page("Курсы и уроки", "") + `<p class="muted">Загрузка…</p>`;
    const { courses } = await api("GET", "/courses");
    main.innerHTML = page("Курсы и уроки", "Черновики не видны ученикам, пока вы не опубликуете курс", `${can("import.course") ? `<a class="btn" href="#/import">Импорт</a>` : ""}<button class="btn primary" id="nc">Новый курс</button>`) +
      (courses.length ? `<div class="table-wrap"><table><thead><tr><th>Курс</th><th>Статус</th><th class="hide-sm">Уровень</th><th class="hide-sm">Изменён</th></tr></thead><tbody>${courses.map(c => `<tr><td><a href="#/courses/${esc(c.id)}"><b>${esc(c.title)}</b></a></td><td>${statusPill(c.status)}</td><td class="hide-sm">${esc(LEVEL[c.level] || c.level || "")}</td><td class="hide-sm num">${fmtDate(c.updated_at)}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="empty">Курсов пока нет.<br><button class="btn primary" id="nc2">Создать первый курс</button></div>`);
    const create = () => courseForm(null);
    $("#nc").onclick = create; if ($("#nc2")) $("#nc2").onclick = create;
  }
  function courseFields(c = {}) {
    return `<div class="form cols"><label class="f">Название<input type="text" name="title" maxlength="160" value="${esc(c.title || "")}" required></label>
      <label class="f">Уровень<select name="level">${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}" ${c.level === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
      <div class="form" style="margin-top:12px"><label class="f">Описание<textarea name="description" maxlength="4000">${esc(c.description || "")}</textarea></label>
      <label class="f">Цель обучения<textarea name="goal" maxlength="2000">${esc(c.goal || "")}</textarea></label>
      <label class="f">Дисклеймер о рисках<small>Показывается ученикам в курсе</small><textarea name="disclaimer" maxlength="2000">${esc(c.disclaimer || "")}</textarea></label>
      <div class="form cols"><label class="f">Обложка<small>ID из медиа-библиотеки</small><input type="text" name="cover_media_id" value="${esc(c.cover_media_id || "")}"></label>
      <div class="f" style="justify-content:flex-end"><button type="button" class="btn" data-pick="cover_media_id">Выбрать из медиа</button></div></div></div>`;
  }
  const readForm = root => Object.fromEntries([...root.querySelectorAll("[name]")].map(el => [el.name, el.type === "checkbox" ? el.checked : el.value]));
  function bindPickers(root) { root.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => pickMedia(id => { root.querySelector(`[name="${b.dataset.pick}"]`).value = id; }, b.dataset.kind)); }
  function courseForm(c) {
    const body = modal(c ? "Свойства курса" : "Новый курс", courseFields(c || {}), [{ label: "Отмена", cls: "ghost", onClick: () => {} },
      { label: c ? "Сохранить" : "Создать курс", cls: "primary", onClick: async btn => {
        const data = readForm($("#modalBody")); if (c) data.slug = c.slug; if (c && c.source) data.source = c.source;
        const r = await run(btn, () => c ? api("PUT", "/courses/" + c.id, data) : api("POST", "/courses", data));
        if (!r) return true;
        toast(c ? "Курс сохранён" : "Курс создан"); location.hash = "#/courses/" + (c ? c.id : r.id); if (c) route();
      } }]);
    bindPickers(body);
  }
  async function courseView(id) {
    main.innerHTML = page("Курс", "") + `<p class="muted">Загрузка…</p>`;
    const d = await api("GET", "/courses/" + id);
    const c = d.course, pub = d.published;
    const st = pub ? `<span class="pill ok">Опубликован, версия ${esc(pub.version)}</span>${pub.visible_from && pub.visible_from > Date.now() ? `<span class="pill info">Показ с ${fmtDate(pub.visible_from)}</span>` : ""}${d.has_unpublished_changes ? `<span class="pill warn">Есть неопубликованные изменения</span>` : ""}` : `<span class="pill warn">Черновик — ученики не видят курс</span>`;
    const ready = d.modules.reduce((n, m) => n + m.lessons.filter(l => l.status === "ready").length, 0), total = d.modules.reduce((n, m) => n + m.lessons.length, 0);
    main.innerHTML = page(c.title, `Уровень: ${esc(LEVEL[c.level] || c.level)} · уроков готово к публикации: ${ready} из ${total}`,
      `<button class="btn" id="edit">Свойства</button><button class="btn" id="dup">Дублировать</button>${can("content.publish") && ready < total ? `<button class="btn" id="readyall">Все уроки готовы</button>` : ""}${can("content.publish") ? (pub ? `<button class="btn" id="unpub">Снять с публикации</button>` : "") + `<button class="btn primary" id="pub">${pub ? "Опубликовать изменения" : "Опубликовать"}</button>` : ""}`) +
      `<div class="status-line" style="margin:-10px 0 18px">${st}</div>
      ${c.description ? `<section class="panel" style="margin-bottom:14px"><h3>Описание</h3><div class="hdl-text">${window.HDLesson.md(c.description)}</div></section>` : ""}
      <div class="tree">${d.modules.map((m, mi) => `<section class="mod"><div class="mod-h"><h4><span class="n">Модуль ${mi + 1}</span>${esc(m.title)}</h4><div class="actions">
        <button class="btn sm ghost" data-mup="${mi}" ${mi === 0 ? "disabled" : ""} aria-label="Выше">↑</button><button class="btn sm ghost" data-mdown="${mi}" ${mi === d.modules.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button>
        <button class="btn sm" data-medit="${esc(m.id)}">Изменить</button><button class="btn sm" data-nl="${esc(m.id)}">+ Урок</button>${can("content.delete") ? `<button class="btn sm danger" data-mdel="${esc(m.id)}">Удалить</button>` : ""}</div></div>
        ${m.lessons.length ? m.lessons.map((l, li) => `<div class="les"><div><a href="#/lessons/${esc(l.id)}">${mi + 1}.${li + 1}. ${esc(l.title)}</a><div class="meta">${statusPill(l.status)} блоков: ${esc(l.blocks)}</div></div><div class="actions">
          <button class="btn sm ghost" data-lup="${mi}:${li}" ${li === 0 ? "disabled" : ""} aria-label="Выше">↑</button><button class="btn sm ghost" data-ldown="${mi}:${li}" ${li === m.lessons.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button></div></div>`).join("") : `<div class="les"><span class="muted">В модуле нет уроков</span></div>`}</section>`).join("")}
        <div class="add-row"><button class="btn" id="nm">+ Модуль</button>${can("content.delete") ? `<button class="btn danger" id="del">Удалить курс</button>` : ""}</div></div>`;
    $("#edit").onclick = () => courseForm(c);
    $("#dup").onclick = e => run(e.currentTarget, async () => { const r = await api("POST", `/courses/${id}/duplicate`, {}); toast("Создана копия курса (черновик)"); location.hash = "#/courses/" + r.id; });
    $("#nm").onclick = () => moduleForm(id, null);
    if ($("#readyall")) $("#readyall").onclick = () => modal("Отметить все уроки готовыми", `<p>Все ${total} уроков получат статус «Готов к публикации». Ученики ничего не увидят, пока вы не нажмёте «Опубликовать».</p><label class="check"><input type="checkbox" id="rac"> Я проверил содержание уроков</label>`,
      [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Отметить", cls: "primary", onClick: async btn => {
        if (!$("#rac").checked) { toast("Подтвердите проверку уроков", true); return true; }
        const r = await run(btn, () => api("POST", `/courses/${id}/ready-all`, { confirm: true })); if (!r) return true; toast(`Готовы к публикации: ${r.total} из ${r.total}`); route(); } }]);
    if ($("#pub")) $("#pub").onclick = () => {
      const b = modal("Публикация курса", `<p>Ученики увидят <b>${ready}</b> уроков в статусе «Готов к публикации». Черновики не публикуются.</p>
        ${ready === 0 ? `<p class="err">Нет готовых уроков: откройте урок и отметьте «Готов к публикации».</p>` : ""}
        <label class="f">Начать показ (необязательно)<small>Пусто — сразу после публикации</small><input type="datetime-local" id="vf"></label>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="cf"> Я проверил материалы и подтверждаю публикацию</label>`,
        [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Опубликовать", cls: "primary", onClick: async btn => {
          if (!$("#cf").checked) { toast("Подтвердите публикацию галочкой", true); return true; }
          const vf = $("#vf").value ? new Date($("#vf").value).toISOString() : undefined;
          const r = await run(btn, () => api("POST", `/courses/${id}/publish`, { confirm: true, visible_from: vf })); if (!r) return true;
          toast(`Опубликовано уроков: ${r.lessons}`); route(); } }]);
    };
    if ($("#unpub")) $("#unpub").onclick = () => confirmDlg("Снять с публикации", "Ученики перестанут видеть курс. Черновики и прогресс учеников сохранятся.", "Снять с публикации",
      async btn => { const r = await run(btn, () => api("POST", `/courses/${id}/unpublish`, { confirm: true })); if (r) { toast("Курс снят с публикации"); route(); } else return true; });
    if ($("#del")) $("#del").onclick = () => {
      modal("Удалить курс", `<p>Будут удалены курс, его модули и уроки-черновики. Опубликованный курс сначала нужно снять с публикации.</p><label class="f">Для подтверждения введите название курса<input type="text" id="dt"></label>`,
        [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Удалить", cls: "danger", onClick: async btn => {
          if ($("#dt").value.trim() !== c.title) { toast("Название не совпадает", true); return true; }
          const r = await run(btn, () => api("POST", `/courses/${id}/delete`, { confirm: true })); if (!r) return true; toast("Курс удалён"); location.hash = "#/courses"; } }]);
    };
    const reorder = async (mods, lessonsMap) => run(null, async () => { await api("POST", `/courses/${id}/reorder`, { modules: mods, lessons: lessonsMap }); route(); });
    const modIds = d.modules.map(m => m.id), lessMap = Object.fromEntries(d.modules.map(m => [m.id, m.lessons.map(l => l.id)]));
    main.querySelectorAll("[data-mup],[data-mdown]").forEach(b => b.onclick = () => { const i = +(b.dataset.mup ?? b.dataset.mdown), j = b.dataset.mup !== undefined ? i - 1 : i + 1; const a = [...modIds]; [a[i], a[j]] = [a[j], a[i]]; reorder(a, lessMap); });
    main.querySelectorAll("[data-lup],[data-ldown]").forEach(b => b.onclick = () => { const [mi, li] = (b.dataset.lup ?? b.dataset.ldown).split(":").map(Number), mid = modIds[mi], a = [...lessMap[mid]], j = b.dataset.lup !== undefined ? li - 1 : li + 1; [a[li], a[j]] = [a[j], a[li]]; reorder(modIds, { ...lessMap, [mid]: a }); });
    main.querySelectorAll("[data-medit]").forEach(b => b.onclick = () => moduleForm(id, d.modules.find(m => m.id === b.dataset.medit)));
    main.querySelectorAll("[data-mdel]").forEach(b => b.onclick = () => confirmDlg("Удалить модуль", "Удалить можно только пустой модуль.", "Удалить", async btn => { const r = await run(btn, () => api("POST", `/modules/${b.dataset.mdel}/delete`, { confirm: true })); if (r) { toast("Модуль удалён"); route(); } else return true; }));
    main.querySelectorAll("[data-nl]").forEach(b => b.onclick = () => modal("Новый урок", `<label class="f">Название урока<input type="text" id="nlt" maxlength="160"></label>`,
      [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Создать", cls: "primary", onClick: async btn => { const r = await run(btn, () => api("POST", `/modules/${b.dataset.nl}/lessons`, { title: $("#nlt").value, blocks: [] })); if (!r) return true; location.hash = "#/lessons/" + r.id; } }]));
  }
  function moduleForm(courseId, m) {
    m = m || {};
    modal(m.id ? "Модуль" : "Новый модуль", `<div class="form"><label class="f">Название<input type="text" name="title" maxlength="160" value="${esc(m.title || "")}"></label>
      <label class="f">Цель модуля<textarea name="goal">${esc(m.goal || "")}</textarea></label><label class="f">Предварительные знания<textarea name="prerequisites">${esc(m.prerequisites || "")}</textarea></label>
      <label class="f">Основные понятия<textarea name="concepts">${esc(m.concepts || "")}</textarea></label><label class="f">Критерии освоения<textarea name="mastery_criteria">${esc(m.mastery_criteria || "")}</textarea></label></div>`,
      [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Сохранить", cls: "primary", onClick: async btn => {
        const data = readForm($("#modalBody")); const r = await run(btn, () => m.id ? api("PUT", "/modules/" + m.id, data) : api("POST", `/courses/${courseId}/modules`, data)); if (!r) return true; toast("Модуль сохранён"); route(); } }]);
  }

  /* ---------- Редактор урока ---------- */
  const BLOCKS = { heading: "Заголовок", text: "Текст", terms: "Термины", image: "Изображение", chart: "График / схема", video: "Видео", note: "Важное замечание", example: "Пример ситуации", practice: "Практическое задание", quiz: "Тест", summary: "Итог урока", file: "PDF-файл" };
  const NOTE = { important: "Важно", warning: "Предупреждение", editorial: "Редакционное дополнение", source: "Из книги", risk: "Риск" };
  const newBlock = t => ({ heading: { text: "" }, text: { title: "", text: "" }, summary: { title: "Итог урока", text: "" }, terms: { title: "Термины", items: [{ term: "", definition: "" }] }, image: { media_id: "", url: "", caption: "", alt: "" },
    chart: { chart_role: "illustration", chart: { title: "", caption: "Учебная схема, не реальные котировки", candles: [[10, 12, 9, 11.5], [11.5, 13, 11, 12.6], [12.6, 13.2, 11.8, 12]], annotations: [] } }, video: { url: "", title: "", caption: "" },
    note: { variant: "important", title: "", text: "" }, example: { title: "", text: "", chart: null }, practice: { title: "Практика", task: "", criteria: "", homework: false, chart: null },
    quiz: { title: "Проверка знаний", pass_percent: 70, questions: [{ q: "", options: ["", ""], correct: 0, explanation: "", kind: "choice" }] }, file: { media_id: "", title: "" } }[t]);
  let L = null;   // редактируемый урок
  const fieldT = (k, label, v, ta, hint) => `<label class="f">${label}${hint ? `<small>${hint}</small>` : ""}${ta ? `<textarea data-k="${k}" ${ta === "code" ? 'class="code" spellcheck="false"' : ""}>${esc(v || "")}</textarea>` : `<input type="text" data-k="${k}" value="${esc(v || "")}">`}</label>`;
  function blockBody(b, i) {
    const t = b.type;
    if (t === "heading") return fieldT("text", "Текст заголовка", b.text);
    if (t === "text" || t === "summary") return `<div class="form">${fieldT("title", "Подзаголовок (необязательно)", b.title)}${fieldT("text", "Текст", b.text, true, "Форматирование: **жирный**, *курсив*, «- » список, «1. » нумерация, [ссылка](https://…)")}</div>`;
    if (t === "note") return `<div class="form"><label class="f">Тип<select data-k="variant">${Object.entries(NOTE).map(([k, v]) => `<option value="${k}" ${b.variant === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>${fieldT("title", "Заголовок", b.title)}${fieldT("text", "Текст", b.text, true)}</div>`;
    if (t === "terms") return `<div class="form">${fieldT("title", "Заголовок", b.title)}${fieldT("items_json", "Термины", (b.items || []).map(x => x.term + " — " + x.definition).join("\n"), true, "Каждый термин с новой строки: «Термин — определение»")}</div>`;
    if (t === "image" || t === "file") return `<div class="form cols">${fieldT("media_id", "Файл из медиа-библиотеки (ID)", b.media_id)}<div class="f" style="justify-content:flex-end"><button type="button" class="btn" data-pickb="${i}" data-kind="${t === "file" ? "pdf" : "image"}">Выбрать</button></div>${t === "image" ? fieldT("url", "или https-ссылка", b.url) + fieldT("alt", "Описание для незрячих", b.alt) : fieldT("title", "Название", b.title)}${fieldT("caption", "Подпись", b.caption)}</div>`;
    if (t === "video") return `<div class="form">${fieldT("url", "Ссылка (YouTube, Vimeo или https)", b.url)}${fieldT("title", "Название", b.title)}${fieldT("caption", "Подпись", b.caption)}</div>`;
    if (t === "chart") return `<div class="form"><label class="f">Роль<select data-k="chart_role">${[["illustration", "Иллюстрация"], ["correct", "Правильный сценарий"], ["incorrect", "Ошибочный сценарий"], ["practice", "Задание по графику"]].map(([k, v]) => `<option value="${k}" ${b.chart_role === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${fieldT("chart_json", "Данные графика (JSON)", JSON.stringify(b.chart, null, 1), "code", "candles: [[open, high, low, close], …]; annotations: marker / zone / hline / trend с подписью label. Учебные графики синтетические — подпись об этом обязательна.")}<div class="chart-pv" data-chartpv="${i}"></div></div>`;
    if (t === "example") return `<div class="form">${fieldT("title", "Название ситуации", b.title)}${fieldT("text", "Разбор", b.text, true)}${fieldT("chart_json", "График (JSON, необязательно)", b.chart ? JSON.stringify(b.chart, null, 1) : "", "code")}</div>`;
    if (t === "practice") return `<div class="form">${fieldT("title", "Название", b.title)}${fieldT("task", "Задание", b.task, true)}${fieldT("criteria", "Критерии выполнения", b.criteria, true)}<label class="check"><input type="checkbox" data-k="homework" ${b.homework ? "checked" : ""}> Домашнее задание</label></div>`;
    if (t === "quiz") return `<div class="form cols">${fieldT("title", "Название теста", b.title)}<label class="f">Проходной балл, %<input type="number" min="0" max="100" data-k="pass_percent" value="${esc(b.pass_percent)}"></label></div>
      <div style="margin-top:10px">${(b.questions || []).map((q, qi) => `<div class="q" data-q="${qi}"><label class="f">Вопрос ${qi + 1}<textarea data-qk="q" style="min-height:60px">${esc(q.q)}</textarea></label>
        ${q.options.map((o, oi) => `<div class="opt"><input type="radio" name="c${i}_${qi}" data-correct="${oi}" ${q.correct === oi ? "checked" : ""} aria-label="Правильный ответ"><input type="text" data-opt="${oi}" value="${esc(o)}"><button type="button" class="btn sm ghost" data-delopt="${oi}" ${q.options.length <= 2 ? "disabled" : ""} aria-label="Удалить вариант">✕</button></div>`).join("")}
        <div class="actions" style="margin-top:8px"><button type="button" class="btn sm" data-addopt>+ Вариант</button><button type="button" class="btn sm danger" data-delq>Удалить вопрос</button></div>
        <label class="f" style="margin-top:8px">Объяснение (ученик видит после попытки)<textarea data-qk="explanation" style="min-height:60px">${esc(q.explanation)}</textarea></label></div>`).join("")}
        <button type="button" class="btn sm" data-addq>+ Вопрос</button></div>`;
    return "";
  }
  /* Перенос значений из формы блока в данные (вызывается при каждом изменении) */
  function readBlock(el, b) {
    el.querySelectorAll("[data-k]").forEach(f => {
      const k = f.dataset.k, v = f.type === "checkbox" ? f.checked : f.value;
      if (k === "chart_json") { if (!v.trim() && b.type === "example") { b.chart = null; return; } try { b.chart = JSON.parse(v); f.setCustomValidity(""); } catch (e) { f.setCustomValidity("Неверный JSON"); } }
      else if (k === "items_json") b.items = v.split("\n").map(s => s.trim()).filter(Boolean).map(s => { const m = s.split(/\s+[—-]\s+/); return { term: (m[0] || "").trim(), definition: m.slice(1).join(" — ").trim() }; });
      else if (k === "pass_percent") b.pass_percent = Number(v);
      else b[k] = v;
    });
    if (b.type === "quiz") el.querySelectorAll("[data-q]").forEach(qe => { const q = b.questions[+qe.dataset.q]; qe.querySelectorAll("[data-qk]").forEach(f => (q[f.dataset.qk] = f.value)); qe.querySelectorAll("[data-opt]").forEach(f => (q.options[+f.dataset.opt] = f.value)); const c = qe.querySelector("[data-correct]:checked"); if (c) q.correct = +c.dataset.correct; });
  }
  async function lessonView(id) {
    main.innerHTML = page("Урок", "") + `<p class="muted">Загрузка…</p>`;
    const { lesson } = await api("GET", "/lessons/" + id);
    L = JSON.parse(JSON.stringify(lesson));
    L.pass_criteria = L.pass_criteria || { require_quiz: false, min_percent: 70 };
    renderLessonEditor();
  }
  function renderLessonEditor() {
    const dirty = { v: false };
    main.innerHTML = page(L.title || "Урок", `<a href="#/courses/${esc(L.course_id)}">← К курсу</a>`, `<button class="btn" id="pv">Предпросмотр</button><button class="btn" id="dupl">Дублировать</button>${can("content.delete") ? `<button class="btn danger" id="dell">Удалить</button>` : ""}`) +
      `<div class="editor"><section class="panel form"><div class="form cols"><label class="f">Название урока<input type="text" id="lt" value="${esc(L.title)}" maxlength="160"></label>
        <label class="f">Статус<select id="ls"><option value="draft" ${L.status !== "ready" ? "selected" : ""}>Черновик</option><option value="ready" ${L.status === "ready" ? "selected" : ""}>Готов к публикации</option></select></label></div>
        <label class="f">Ожидаемый результат<textarea id="lo">${esc(L.outcome || "")}</textarea></label>
        <div class="form cols"><label class="f">Страницы книги<input type="text" id="lsrc" value="${esc(L.source_pages || "")}"></label>
        <label class="f">Минимум для теста, %<input type="number" id="lmin" min="0" max="100" value="${esc(L.pass_criteria.min_percent)}"></label></div>
        <label class="check"><input type="checkbox" id="lrq" ${L.pass_criteria.require_quiz ? "checked" : ""}> Урок засчитывается только после прохождения теста</label></section>
        <div class="blocks" id="blocks">${L.blocks.map((b, i) => `<section class="blk" data-i="${i}"><div class="blk-h"><b>${i + 1}. ${esc(BLOCKS[b.type] || b.type)}</b><div class="tools">
          <button class="btn sm ghost" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Выше">↑</button><button class="btn sm ghost" data-down="${i}" ${i === L.blocks.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button><button class="btn sm danger" data-del="${i}" aria-label="Удалить блок">✕</button></div></div>
          <div class="blk-b">${blockBody(b, i)}</div></section>`).join("") || `<div class="empty">В уроке пока нет блоков — добавьте первый ниже.</div>`}</div>
        <div class="add-row"><span class="muted" style="align-self:center">Добавить блок:</span>${Object.entries(BLOCKS).map(([k, v]) => `<button class="btn sm" data-add="${k}">${v}</button>`).join("")}</div></div>
        <div class="sticky-bar"><span class="muted" id="dirty" style="margin-right:auto;align-self:center"></span><button class="btn primary" id="save">Сохранить</button></div>`;
    const markDirty = () => { dirty.v = true; $("#dirty").textContent = "Есть несохранённые изменения"; };
    const sync = () => { L.title = $("#lt").value; L.status = $("#ls").value; L.outcome = $("#lo").value; L.source_pages = $("#lsrc").value; L.pass_criteria = { require_quiz: $("#lrq").checked, min_percent: Number($("#lmin").value) || 0 };
      main.querySelectorAll(".blk").forEach(el => readBlock(el, L.blocks[+el.dataset.i])); };
    main.querySelector(".editor").addEventListener("input", () => { markDirty(); sync(); drawChartPreviews(); });
    main.querySelector(".editor").addEventListener("change", () => { markDirty(); sync(); });
    // Каждый обработчик сначала вызывает sync(), затем меняет L.blocks. Повторно читать форму здесь нельзя:
    // на экране ещё старый порядок блоков, и значения попали бы в соседние блоки.
    const rerender = () => { renderLessonEditor(); $("#dirty").textContent = "Есть несохранённые изменения"; };
    main.querySelectorAll("[data-add]").forEach(b => b.onclick = () => { sync(); L.blocks.push({ type: b.dataset.add, ...newBlock(b.dataset.add) }); rerender(); });
    main.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { sync(); L.blocks.splice(+b.dataset.del, 1); rerender(); });
    main.querySelectorAll("[data-up],[data-down]").forEach(b => b.onclick = () => { sync(); const i = +(b.dataset.up ?? b.dataset.down), j = b.dataset.up !== undefined ? i - 1 : i + 1; [L.blocks[i], L.blocks[j]] = [L.blocks[j], L.blocks[i]]; rerender(); });
    main.querySelectorAll(".blk").forEach(el => { const bi = +el.dataset.i, b = L.blocks[bi];
      el.querySelectorAll("[data-pickb]").forEach(p => p.onclick = () => pickMedia(mid => { el.querySelector('[data-k="media_id"]').value = mid; sync(); markDirty(); }, p.dataset.kind));
      el.querySelectorAll("[data-addq]").forEach(x => x.onclick = () => { sync(); b.questions.push({ q: "", options: ["", ""], correct: 0, explanation: "", kind: "choice" }); rerender(); });
      el.querySelectorAll("[data-q]").forEach(qe => { const q = b.questions[+qe.dataset.q];
        qe.querySelector("[data-addopt]").onclick = () => { sync(); if (q.options.length < 8) q.options.push(""); rerender(); };
        qe.querySelector("[data-delq]").onclick = () => { sync(); b.questions.splice(+qe.dataset.q, 1); rerender(); };
        qe.querySelectorAll("[data-delopt]").forEach(x => x.onclick = () => { sync(); const oi = +x.dataset.delopt; q.options.splice(oi, 1); if (q.correct >= q.options.length) q.correct = 0; rerender(); }); }); });
    function drawChartPreviews() { main.querySelectorAll("[data-chartpv]").forEach(el => { const b = L.blocks[+el.dataset.chartpv]; try { el.innerHTML = window.HDLesson.chartFigure(b.chart, b.chart_role); } catch (e) { el.innerHTML = `<p class="err">График не построен: проверьте данные</p>`; } }); }
    drawChartPreviews();
    $("#save").onclick = e => { sync(); run(e.currentTarget, async () => { await api("PUT", "/lessons/" + L.id, { title: L.title, outcome: L.outcome, source_pages: L.source_pages, status: L.status, pass_criteria: L.pass_criteria, blocks: L.blocks }); dirty.v = false; $("#dirty").textContent = "Сохранено"; toast("Урок сохранён"); titleEl.textContent = L.title; }); };
    $("#pv").onclick = () => { sync(); preview(L); };
    $("#dupl").onclick = e => run(e.currentTarget, async () => { const r = await api("POST", `/lessons/${L.id}/duplicate`, {}); toast("Создана копия урока"); location.hash = "#/lessons/" + r.id; });
    if ($("#dell")) $("#dell").onclick = () => confirmDlg("Удалить урок", "Урок будет удалён без возможности восстановления.", "Удалить", async btn => { const r = await run(btn, () => api("POST", `/lessons/${L.id}/delete`, { confirm: true })); if (!r) return true; toast("Урок удалён"); location.hash = "#/courses/" + L.course_id; });
    window.onbeforeunload = () => (dirty.v ? true : undefined);
  }
  function preview(lesson) {
    const body = modal("Предпросмотр: так увидит ученик", `<div class="pv-tabs"><button class="btn sm" data-m="phone" aria-pressed="true">Телефон</button><button class="btn sm" data-m="desktop" aria-pressed="false">Компьютер</button></div><div class="pv-frame phone" id="pvf"></div>`, [], { wide: true });
    const draw = mode => { const f = body.querySelector("#pvf"); f.className = "pv-frame " + mode; f.innerHTML = `<h2>${esc(lesson.title)}</h2><div id="pvl"></div>`;
      window.HDLesson.render(f.querySelector("#pvl"), lesson, { onQuiz: async (bid, ans) => window.HDLesson.gradeLocally(lesson, bid, ans) }); };
    body.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { body.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(b.dataset.m); });
    draw("phone");
  }

  /* ---------- Медиа ---------- */
  const isImg = m => m.kind === "image";
  async function mediaList(q, kind) { return (await api("GET", "/media?" + new URLSearchParams({ q: q || "", kind: kind || "" }))).media; }
  const mediaCard = (m, pick) => `<div class="media${pick ? " pickable" : ""}" data-id="${esc(m.id)}"><div class="thumb">${isImg(m) ? `<img src="/media/${esc(m.id)}" alt="${esc(m.name)}" loading="lazy">` : `<span>PDF</span>`}</div>
    <div class="info"><b>${esc(m.name)}</b><span class="muted">${esc(m.category || m.kind)} · ${kb(m.size)}</span>${pick ? "" : `<div class="actions"><button class="btn sm" data-copy>Ссылка</button><button class="btn sm" data-ren>Переименовать</button>${can("content.delete") ? `<button class="btn sm danger" data-rm>Удалить</button>` : ""}</div>`}</div></div>`;
  async function upload(file, category) {
    if (file.size > 20 * 1024 * 1024) throw { message: "Файл больше 20 МБ" };
    return api("POST", "/media", undefined, { raw: file, headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-Media-Category": category } });
  }
  async function mediaView() {
    main.innerHTML = page("Медиа", "Изображения (JPEG, PNG, WebP, GIF) и PDF хранятся в Firebase Storage") +
      `<div class="drop"><input type="file" id="mf" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" multiple><select id="mc">${["lesson", "cover", "poster", "chart", "brand", "pdf", "other"].map(c => `<option value="${c}">${{ lesson: "Для уроков", cover: "Обложка курса", poster: "Афиша", chart: "Скриншот графика", brand: "Бренд", pdf: "PDF", other: "Другое" }[c]}</option>`).join("")}</select><button class="btn primary" id="mu">Загрузить</button></div>
      <div class="filters"><input type="search" id="mq" placeholder="Поиск по названию"><select id="mk"><option value="">Все типы</option><option value="image">Изображения</option><option value="pdf">PDF</option><option value="poster">Афиши</option><option value="cover">Обложки</option></select></div><div id="ml"><p class="muted">Загрузка…</p></div>`;
    const load = async () => { const list = await mediaList($("#mq").value, $("#mk").value);
      $("#ml").innerHTML = list.length ? `<div class="media-grid">${list.map(m => mediaCard(m)).join("")}</div>` : `<div class="empty">Файлов нет. Загрузите первый файл выше.</div>`;
      $("#ml").querySelectorAll(".media").forEach(el => { const m = list.find(x => x.id === el.dataset.id);
        el.querySelector("[data-copy]").onclick = async () => { const u = location.origin + "/media/" + m.id; try { await navigator.clipboard.writeText(u); toast("Ссылка скопирована"); } catch (e) { modal("Ссылка на файл", `<input type="text" readonly value="${esc(u)}"><p class="muted">ID для блоков уроков: <b>${esc(m.id)}</b></p>`); } };
        el.querySelector("[data-ren]").onclick = () => modal("Переименовать", `<input type="text" id="rn" value="${esc(m.name)}" maxlength="120">`, [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Сохранить", cls: "primary", onClick: async btn => { const r = await run(btn, () => api("PUT", "/media/" + m.id, { name: $("#rn").value })); if (!r) return true; toast("Сохранено"); load(); } }]);
        const rm = el.querySelector("[data-rm]"); if (rm) rm.onclick = () => confirmDlg("Удалить файл", `Удалить «${esc(m.name)}»? Используемые файлы удалить нельзя.`, "Удалить", async btn => {
          try { await api("POST", `/media/${m.id}/delete`, {}); toast("Файл удалён"); load(); }
          catch (e) { if (e.error === "IN_USE") { modal("Файл используется", `<p>Сначала замените его в материалах:</p><ul>${(e.used || []).map(u => `<li>${esc(u.title || u.id)} <span class="muted">(${esc(u.type)})</span></li>`).join("")}</ul>`); return true; } toast(errText(e), true); } }); }); };
    $("#mu").onclick = e => run(e.currentTarget, async () => { const fs = [...$("#mf").files]; if (!fs.length) { toast("Выберите файл", true); return; } for (const f of fs) await upload(f, $("#mc").value); toast(fs.length > 1 ? `Загружено файлов: ${fs.length}` : "Файл загружен"); $("#mf").value = ""; load(); });
    const safe = () => load().catch(e => { if (!(e && e.stale)) toast(errText(e), true); });
    $("#mq").oninput = () => { clearTimeout(mediaView.t); mediaView.t = setTimeout(safe, 300); }; $("#mk").onchange = safe;
    await load();
  }
  async function pickMedia(onPick, kind) {
    const body = modal("Выбор файла", `<div class="drop"><input type="file" id="pf" accept="${kind === "pdf" ? "application/pdf" : "image/jpeg,image/png,image/webp,image/gif"}"><button class="btn primary" id="pu">Загрузить и выбрать</button></div><div id="pl"><p class="muted">Загрузка…</p></div>`, [], { wide: true });
    const list = await mediaList("", kind === "pdf" ? "pdf" : "image").catch(e => { toast(errText(e), true); return []; });
    body.querySelector("#pl").innerHTML = list.length ? `<div class="media-grid">${list.map(m => mediaCard(m, true)).join("")}</div>` : `<div class="empty">Подходящих файлов нет — загрузите новый.</div>`;
    body.querySelectorAll(".media.pickable").forEach(el => el.onclick = () => { onPick(el.dataset.id); $("#modal").close(); });
    body.querySelector("#pu").onclick = e => run(e.currentTarget, async () => { const f = body.querySelector("#pf").files[0]; if (!f) return toast("Выберите файл", true); const r = await upload(f, kind === "pdf" ? "pdf" : "lesson"); onPick(r.id); $("#modal").close(); toast("Файл загружен"); });
  }

  /* ---------- Афиши ---------- */
  const AUD = { all: "Все пользователи", access: "С открытым доступом", no_access: "Без доступа к академии" };
  const toLocal = iso => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
  const BUILTIN = { "book-reading": "/academy/assets/banners/book-reading.webp", "invite-pointing": "/academy/assets/banners/invite-pointing.webp", mascot: "/academy/assets/brand/hd-mascot.webp" };
  const bannerPreview = f => { const img = f.image_media_id ? "/media/" + f.image_media_id : BUILTIN[f.image_builtin] || "";
    const title = f.title_i18n_ru || f.title || "Заголовок баннера", cta = f.action_type === "soon" ? "Скоро" : (f.cta_i18n_ru || "Открыть"), cat = f.category_i18n_ru || "";
    return `<div class="bn-pv">${img ? `<img src="${esc(img)}" alt="">` : ""}<span class="bn-sh"></span>${cat ? `<span class="bn-cat">${esc(cat)}</span>` : ""}<span class="bn-b"><span class="bn-t">${esc(title)}</span><span class="bn-c${f.action_type === "soon" ? " soon" : ""}">${esc(cta)}${f.action_type === "soon" ? "" : '<i>→</i>'}</span></span></div>`; };
  const annCard = a => `<div class="ann-card">${a.image_media_id ? `<img src="/media/${esc(a.image_media_id)}" alt="">` : ""}<div class="c">${a.event_at ? `<div class="when">${fmtDate(Date.parse(a.event_at))}</div>` : ""}<h5>${esc(a.title || "Заголовок афиши")}</h5>${a.body ? `<p>${esc(a.body)}</p>` : ""}${a.cta_label && a.cta_url ? `<span class="btn primary sm">${esc(a.cta_label)}</span>` : ""}</div></div>`;
  async function announcementsView() {
    main.innerHTML = page("Афиши и объявления", "Показываются ученикам в академии по расписанию и аудитории", `<button class="btn primary" id="na">Новая афиша</button>`) + `<div id="al"><p class="muted">Загрузка…</p></div>`;
    const { announcements } = await api("GET", "/announcements");
    const S = { draft: `<span class="pill warn">Черновик</span>`, published: `<span class="pill ok">Опубликована</span>`, archived: `<span class="pill">Архив</span>` };
    $("#al").innerHTML = announcements.length ? `<div class="table-wrap"><table><thead><tr><th>Афиша</th><th>Статус</th><th class="hide-sm">Показ</th><th class="hide-sm">Приоритет</th></tr></thead><tbody>${announcements.map(a => `<tr><td><a href="#" data-a="${esc(a.id)}"><b>${esc(a.title)}</b></a><div class="muted">${a.kind === "banner" ? "Баннер главной · " : "Афиша · "}${esc(AUD[a.audience] || "")}</div></td><td>${S[a.status] || ""}</td><td class="hide-sm">${a.show_from ? fmtDay(Date.parse(a.show_from)) : "сразу"} — ${a.show_until ? fmtDay(Date.parse(a.show_until)) : "без срока"}</td><td class="hide-sm num">${esc(a.priority)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Афиш пока нет.</div>`;
    $("#na").onclick = () => annForm({ status: "draft", audience: "all", priority: 0 });
    $("#al").querySelectorAll("[data-a]").forEach(x => x.onclick = e => { e.preventDefault(); annForm(announcements.find(a => a.id === x.dataset.a)); });
  }
  function annForm(a) {
    const body = modal(a.id ? "Афиша" : "Новая афиша", `<div class="grid two"><div class="form">
      <label class="f">Тип<select name="kind"><option value="poster" ${a.kind !== "banner" ? "selected" : ""}>Афиша (лента объявлений)</option><option value="banner" ${a.kind === "banner" ? "selected" : ""}>Баннер главной страницы</option></select></label>
      <label class="f">Заголовок (основной)<input type="text" name="title" maxlength="160" value="${esc(a.title || "")}"></label>
      <fieldset class="form" data-banner style="border:1px solid var(--line);border-radius:10px;padding:12px;margin:0">
        <legend class="muted" style="padding:0 6px">Баннер: переводы и действие</legend>
        <div class="form cols">${["ru", "en", "ua"].map(l => `<label class="f">Заголовок ${l.toUpperCase()}<input type="text" name="title_i18n_${l}" maxlength="160" value="${esc((a.title_i18n || {})[l] || "")}"></label>`).join("")}</div>
        <div class="form cols">${["ru", "en", "ua"].map(l => `<label class="f">Кнопка ${l.toUpperCase()}<input type="text" name="cta_i18n_${l}" maxlength="40" value="${esc((a.cta_i18n || {})[l] || "")}"></label>`).join("")}</div>
        <div class="form cols">${["ru", "en", "ua"].map(l => `<label class="f">Категория ${l.toUpperCase()}<input type="text" name="category_i18n_${l}" maxlength="40" value="${esc((a.category_i18n || {})[l] || "")}"></label>`).join("")}</div>
        <div class="form cols"><label class="f">Действие кнопки<select name="action_type">${[["reader", "Открыть читалку книги"], ["referral", "Кабинет партнёра"], ["course", "Открыть курс"], ["module", "Открыть модуль курса"], ["internal", "Страница академии"], ["external", "Внешняя https-ссылка"], ["soon", "Скоро (недоступно)"]].map(([k, v]) => `<option value="${k}" ${a.action_type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="f">Назначение<small>книга: hidden-reaction-system · курс: crs_… · модуль: crs_…/mod_… · страница: learn, reader, partner, academy · внешняя: https://…</small><input type="text" name="action_target" value="${esc(a.action_target || "")}"></label></div>
        <div class="form cols"><label class="f">Встроенное изображение<select name="image_builtin"><option value="">— нет (из медиатеки)</option>${[["book-reading", "Персонаж читает книгу"], ["invite-pointing", "Персонаж указывает"], ["mascot", "Маскот академии"]].map(([k, v]) => `<option value="${k}" ${a.image_builtin === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="f">Дата релиза (для «Скоро»)<input type="datetime-local" name="release_at" value="${toLocal(a.release_at)}"></label></div>
      </fieldset>
      <label class="f" data-poster>Описание<textarea name="body" maxlength="4000">${esc(a.body || "")}</textarea></label>
      <div class="form cols"><label class="f">Изображение (ID)<input type="text" name="image_media_id" value="${esc(a.image_media_id || "")}"></label><div class="f" style="justify-content:flex-end"><button type="button" class="btn" data-pick="image_media_id">Выбрать</button></div></div>
      <label class="f">Дата и время мероприятия<input type="datetime-local" name="event_at" value="${toLocal(a.event_at)}"></label>
      <div class="form cols"><label class="f">Текст кнопки<input type="text" name="cta_label" maxlength="40" value="${esc(a.cta_label || "")}"></label><label class="f">Ссылка кнопки (https)<input type="url" name="cta_url" value="${esc(a.cta_url || "")}"></label></div>
      <div class="form cols"><label class="f">Показывать с<input type="datetime-local" name="show_from" value="${toLocal(a.show_from)}"></label><label class="f">Показывать до<input type="datetime-local" name="show_until" value="${toLocal(a.show_until)}"></label></div>
      <div class="form cols"><label class="f">Аудитория<select name="audience">${Object.entries(AUD).map(([k, v]) => `<option value="${k}" ${a.audience === k ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="f">Приоритет (0–100)<input type="number" name="priority" min="0" max="100" value="${esc(a.priority || 0)}"></label></div>
      <label class="f">Статус<select name="status">${[["draft", "Черновик"], ["published", "Опубликована"], ["archived", "Архив"]].map(([k, v]) => `<option value="${k}" ${a.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="confirm"> Подтверждаю публикацию (нужно для статуса «Опубликована»)</label></div>
      <div><p class="muted" style="margin:0 0 8px">Так афиша выглядит на телефоне</p><div id="annpv">${annCard(a)}</div></div></div>`,
      [...(a.id && can("announcements.publish") ? [{ label: "Удалить", cls: "danger", onClick: async btn => { const r = await run(btn, () => api("POST", `/announcements/${a.id}/delete`, {})); if (!r) return true; toast("Афиша удалена"); route(); } }] : []),
        { label: "Отмена", cls: "ghost", onClick: () => {} }, { label: "Сохранить", cls: "primary", onClick: async btn => {
          const f = readForm($("#modalBody")); const iso = v => (v ? new Date(v).toISOString() : "");
          const data = { ...f, event_at: iso(f.event_at), show_from: iso(f.show_from), show_until: iso(f.show_until), priority: Number(f.priority) || 0, confirm: f.confirm === true };
          for (const k of ["title_i18n", "cta_i18n", "category_i18n"]) { data[k] = {}; for (const l of ["ru", "en", "ua"]) { if (f[k + "_" + l]) data[k][l] = f[k + "_" + l]; delete data[k + "_" + l]; } }
          data.release_at = iso(f.release_at);
          const r = await run(btn, () => a.id ? api("PUT", "/announcements/" + a.id, data) : api("POST", "/announcements", data)); if (!r) return true; toast("Афиша сохранена"); route(); } }], { wide: true });
    bindPickers(body);
    const sync = () => { const f = readForm(body), banner = f.kind === "banner";
      body.querySelector("[data-banner]").hidden = !banner; body.querySelector("[data-poster]").hidden = banner;
      body.querySelector("#annpv").innerHTML = banner ? bannerPreview(f) : annCard({ ...f, event_at: f.event_at ? new Date(f.event_at).toISOString() : "" }); };
    body.addEventListener("input", sync); body.addEventListener("change", sync); sync();
  }

  /* ---------- Пользователи ---------- */
  const ROLE_LABEL = () => Object.fromEntries((ME.roles || []).map(r => [r.id, r.label]));
  const accessPill = u => u.blocked ? `<span class="pill bad">Заблокирован</span>` : u.academy_access ? `<span class="pill ok">Доступ открыт</span>` : u.stage === "deposit" ? `<span class="pill warn">Ждёт депозит</span>` : `<span class="pill">Нет Trader ID</span>`;
  async function usersView() {
    const RL = ROLE_LABEL();
    main.innerHTML = page("Пользователи", "Поиск по email, внутреннему ID, Telegram ID или @username") +
      `<div class="filters"><input type="search" id="uq" placeholder="Поиск" style="max-width:280px"><select id="ur"><option value="">Все роли</option>${Object.entries(RL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select>
      <select id="us"><option value="">Любой статус</option><option value="access">Доступ открыт</option><option value="awaiting">Ждут депозит</option><option value="no_trader">Без Trader ID</option><option value="blocked">Заблокированы</option></select>
      <label class="f" style="flex-direction:row;align-items:center;gap:6px">с<input type="datetime-local" id="uf" style="width:auto"></label><label class="f" style="flex-direction:row;align-items:center;gap:6px">по<input type="datetime-local" id="ut" style="width:auto"></label></div><div id="ul"><p class="muted">Загрузка…</p></div>`;
    const load = async () => {
      const p = new URLSearchParams({ q: $("#uq").value, role: $("#ur").value, status: $("#us").value, from: $("#uf").value ? new Date($("#uf").value).toISOString() : "", to: $("#ut").value ? new Date($("#ut").value).toISOString() : "" });
      const { users } = await api("GET", "/users?" + p);
      $("#ul").innerHTML = users.length ? `<p class="muted">Найдено: ${users.length}${users.length >= 500 ? " (показаны первые 500)" : ""}</p><div class="table-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th>Академия</th><th class="hide-sm">Регистрация</th><th class="hide-sm">Активность</th></tr></thead><tbody>${users.map(u => `<tr><td><a href="#/users/${esc(u.uid)}"><b>${esc(u.email || u.uid)}</b></a>${u.telegram && u.telegram.username ? `<div class="muted">@${esc(u.telegram.username)}</div>` : ""}</td><td>${esc(RL[u.role] || u.role)}</td><td>${accessPill(u)}</td><td class="hide-sm num">${fmtDay(u.created_at)}</td><td class="hide-sm num">${fmtDate(u.last_active_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Никого не нашли. Измените условия поиска.</div>`;
    };
    ["uq"].forEach(i => ($("#" + i).oninput = () => { clearTimeout(usersView.t); usersView.t = setTimeout(load, 350); }));
    ["ur", "us", "uf", "ut"].forEach(i => ($("#" + i).onchange = load));
    await load();
  }
  async function userView(uid) {
    const RL = ROLE_LABEL();
    main.innerHTML = page("Пользователь", "") + `<p class="muted">Загрузка…</p>`;
    const d = await api("GET", "/users/" + encodeURIComponent(uid)), u = d.user;
    const myRank = ME.roles.findIndex(r => r.id === ME.role), theirRank = ME.roles.findIndex(r => r.id === u.role);
    const canRole = can("users.role") && u.uid !== ME.uid && myRank > theirRank, canBlock = can("users.block") && u.uid !== ME.uid && myRank > theirRank;
    main.innerHTML = page(u.email || u.uid, `<a href="#/users">← Все пользователи</a>`) +
      `<div class="grid two"><section class="panel"><h3>Профиль</h3>${u.telegram && u.telegram.photo_url ? `<img src="${esc(u.telegram.photo_url)}" alt="" width="56" height="56" style="border-radius:50%;float:right">` : ""}
        <p>ID: <b>${esc(u.uid)}</b><br>Роль: <b>${esc(RL[u.role] || u.role)}</b><br>Регистрация: ${fmtDate(u.created_at)}<br>Последняя активность: ${fmtDate(u.last_active_at)}<br>
        Telegram: ${u.telegram ? esc((u.telegram.username ? "@" + u.telegram.username : "") + " " + (u.telegram.name || "") + " (ID " + u.telegram.id + ")") : "не привязан"}</p>
        <p>${accessPill(u)} ${u.broker_confirmed ? `<span class="pill ok">Брокер подтверждён</span>` : ""}</p>
        <p>Trader ID: ${esc(u.trader_id_masked || "—")}<br>Первый депозит: ${u.first_deposit ? "$" + esc(u.first_deposit.amount) + " " + esc(u.first_deposit.currency) : "не подтверждён"}</p></section>
      <section class="panel"><h3>Управление</h3>${canRole ? `<label class="f">Роль<select id="rs">${ME.roles.slice(0, myRank).map(r => `<option value="${r.id}" ${r.id === u.role ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label><button class="btn" id="rsave" style="margin-top:8px">Изменить роль</button>` : `<p class="muted">Роль этого пользователя вы изменить не можете.</p>`}
        ${canBlock ? `<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">${u.blocked ? `<button class="btn" id="unb">Разблокировать</button>` : `<label class="f">Причина блокировки<input type="text" id="br" maxlength="300"></label><button class="btn danger" id="blk" style="margin-top:8px">Заблокировать</button>`}` : ""}</section>
      <section class="panel"><h3>Обучение</h3>${d.progress.length ? `<div class="table-wrap"><table><thead><tr><th>Урок</th><th>Статус</th><th>Тест</th></tr></thead><tbody>${d.progress.map(p => `<tr><td>${esc(p.lesson_id)}</td><td>${p.completed ? `<span class="pill ok">Завершён ${fmtDay(p.completed_at)}</span>` : `<span class="pill">В процессе</span>`}</td><td>${p.quiz ? esc(p.quiz.best_percent ?? p.quiz.percent ?? "") + "%" : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Ученик ещё не начинал уроки.</p>`}</section>
      <section class="panel"><h3>История административных действий</h3>${d.audit.length ? `<div class="table-wrap"><table><tbody>${d.audit.map(l => `<tr><td class="num">${fmtDate(l.at)}</td><td>${esc(l.action)}</td><td class="muted">${esc(l.actor_email || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Действий не было.</p>`}</section></div>`;
    if ($("#rsave")) $("#rsave").onclick = e => run(e.currentTarget, async () => { await api("POST", `/users/${encodeURIComponent(u.uid)}/role`, { role: $("#rs").value }); toast("Роль изменена"); route(); });
    if ($("#blk")) $("#blk").onclick = () => confirmDlg("Заблокировать", "Пользователь потеряет доступ к академии и API, пока вы его не разблокируете.", "Заблокировать", async btn => { const r = await run(btn, () => api("POST", `/users/${encodeURIComponent(u.uid)}/block`, { blocked: true, reason: $("#br").value })); if (r) { toast("Пользователь заблокирован"); route(); } else return true; });
    if ($("#unb")) $("#unb").onclick = e => run(e.currentTarget, async () => { await api("POST", `/users/${encodeURIComponent(u.uid)}/block`, { blocked: false }); toast("Пользователь разблокирован"); route(); });
  }

  /* ---------- Журнал и импорт ---------- */
  async function auditView() {
    main.innerHTML = page("Журнал действий", "Кто, когда и что изменил") + `<div class="filters"><select id="af"><option value="">Все действия</option><option value="admin.">Входы в админ-панель</option><option value="course.">Курсы</option><option value="lesson.">Уроки</option><option value="module.">Модули</option><option value="user.">Пользователи и роли</option><option value="media.">Медиа</option><option value="announcement.">Афиши</option></select></div><div id="al"><p class="muted">Загрузка…</p></div>`;
    const load = async () => { const { logs } = await api("GET", "/audit?limit=300&action=" + encodeURIComponent($("#af").value));
      $("#al").innerHTML = logs.length ? `<div class="table-wrap"><table><thead><tr><th>Время</th><th>Действие</th><th class="hide-sm">Кто</th><th class="hide-sm">Объект</th><th class="hide-sm">Подробности</th></tr></thead><tbody>${logs.map(l => `<tr><td class="num">${fmtDate(l.at)}</td><td>${esc(l.action)}</td><td class="hide-sm">${esc(l.actor_email || l.actor_uid || "")}</td><td class="hide-sm">${esc((l.target_type || "") + " " + (l.target_id || ""))}</td><td class="hide-sm muted">${esc(JSON.stringify(l.details || {}).slice(0, 160))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Записей нет.</div>`; };
    $("#af").onchange = load; await load();
  }
  function importView() {
    main.innerHTML = page("Импорт курса", "Файл JSON в формате CMS. Курс всегда создаётся как черновик и не публикуется автоматически") +
      `<section class="panel form"><input type="file" id="if" accept="application/json,.json"><p class="muted" id="ii"></p>
      <label class="check"><input type="checkbox" id="ic"> Импортировать как новый курс-черновик (ученики его не увидят до публикации)</label><button class="btn primary" id="ib" disabled>Импортировать как черновик</button></section>`;
    let data = null;
    $("#if").onchange = async () => { data = null; $("#ib").disabled = true; const f = $("#if").files[0]; if (!f) return;
      try { data = JSON.parse(await f.text()); const m = data.modules || [], n = m.reduce((s, x) => s + (x.lessons || []).length, 0); $("#ii").textContent = `«${(data.course && data.course.title) || "без названия"}»: модулей ${m.length}, уроков ${n}.`; $("#ib").disabled = false; }
      catch (e) { $("#ii").textContent = "Файл не является корректным JSON."; } };
    $("#ib").onclick = e => run(e.currentTarget, async () => { if (!$("#ic").checked) { toast("Отметьте подтверждение импорта", true); return; }
      let r; try { r = await api("POST", "/import/course", { confirm: true, data }); }
      catch (er) { if (er && er.error === "ALREADY_IMPORTED" && er.course_id) { toast(er.message, true); location.hash = "#/courses/" + er.course_id; return; } throw er; } toast(`Импортировано: модулей ${r.modules}, уроков ${r.lessons}`); location.hash = "#/courses/" + r.course_id; });
  }

  /* ---------- Диагностика (Super Admin): версия кода и фактические данные Firestore ---------- */
  async function diagnosticsView() {
    main.innerHTML = page("Диагностика", "Только чтение. Показывает, какая версия кода работает и что реально лежит в Firestore") + `<p class="muted">Загрузка…</p>`;
    const d = await api("GET", "/diagnostics"), v = d.version;
    const okFmt = v.content_format === "candles-objects-v1";
    main.innerHTML = page("Диагностика", "Только чтение. Показывает, какая версия кода работает и что реально лежит в Firestore", `<button class="btn" id="rf">Обновить</button>`) +
      `<div class="grid two"><section class="panel"><h3>Версия сервера</h3><p>Коммит GitHub: <b>${esc(v.commit ? v.commit.slice(0, 12) : "неизвестен (переменная RENDER_GIT_COMMIT не задана)")}</b>${v.branch ? ` · ветка ${esc(v.branch)}` : ""}<br>
        Сервис: ${esc(v.service || "—")} · пакет ${esc(v.package || "—")} · Node ${esc(v.node)}<br>Сервер запущен: ${fmtDate(v.started_at)}</p>
        <p>${okFmt ? `<span class="pill ok">Формат графиков исправлен (${esc(v.content_format)})</span>` : `<span class="pill bad">Старый формат графиков — импорт курса с графиками будет падать</span>`}</p></section>
      <section class="panel"><h3>Целостность</h3><p>Модулей без курса: <b>${esc(d.modules_without_course)}</b><br>Уроков без курса: <b>${esc(d.lessons_without_course)}</b></p></section></div>
      <h3 style="font:600 15px var(--body);margin:20px 0 10px">Курсы в Firestore: ${d.courses.length}</h3>
      ${d.courses.length ? d.courses.map(c => `<section class="panel" style="margin-bottom:12px"><h3><a href="#/courses/${esc(c.id)}">${esc(c.title)}</a> <span class="muted">${esc(c.id)}</span></h3>
        <p class="muted">Статус: ${esc(c.status)}${c.imported ? " · импортирован" : ""}${c.slug ? " · slug " + esc(c.slug) : ""} · создан ${fmtDate(c.created_at)} · уроков всего ${esc(c.lessons_total)}${c.orphan_lessons ? ` · <b style="color:var(--bad)">уроков без модуля: ${esc(c.orphan_lessons)}</b>` : ""}
        · ${c.published ? `опубликован (версия ${esc(c.published.version)}, уроков в снимке ${esc(c.published.lessons)})` : "не опубликован"}</p>
        <div class="table-wrap"><table><thead><tr><th>Модуль</th><th>Уроков</th><th>Готово</th></tr></thead><tbody>${c.modules.map(m => `<tr><td>${esc(m.title)}</td><td class="num">${m.lessons ? esc(m.lessons) : `<span class="pill bad">0 — пустой</span>`}</td><td class="num">${esc(m.ready)}</td></tr>`).join("")}</tbody></table></div></section>`).join("") : `<div class="empty">Курсов нет.</div>`}`;
    $("#rf").onclick = () => route();
  }

  /* ---------- Партнёры и выплаты ---------- */
  const usd = c => "$" + ((c || 0) / 100).toFixed(2);
  const INV = { registered: "Зарегистрирован", trader_confirmed: "Trader ID подтверждён", ftd_confirmed: "Депозит подтверждён", access_granted: "Доступ выдан", qualified: "Подходит", rewarded: "Вознаграждён", flagged: "На проверке" };
  const WST = { pending: ["warn", "Ожидает"], processing: ["info", "В обработке"], paid: ["ok", "Выплачено"], rejected: ["bad", "Отклонено"], cancelled: ["", "Отменено"] };
  const modeNote = m => m === "off" ? `<span class="pill bad">Денежная часть отключена (REFERRAL_MODE=off)</span>` : m === "test" ? `<span class="pill warn">Тестовый режим — суммы не реальные</span>` : `<span class="pill ok">Боевой режим</span>`;
  async function partnersView(uid) {
    if (uid) return partnerView(decodeURIComponent(uid));
    main.innerHTML = page("Партнёры и выплаты", "Только реальные данные Firestore") + `<p class="muted">Загрузка…</p>`;
    const st = await api("GET", "/partners/stats");
    main.innerHTML = page("Партнёры и выплаты", "Только реальные данные Firestore") + `<p>${modeNote(st.mode)}</p>
      <div class="grid stats"><div class="stat"><span>Приглашений</span><b>${esc(st.invites_total)}</b></div>${Object.entries(st.invites_by_status).map(([k, v]) => `<div class="stat"><span>${esc(INV[k] || k)}</span><b>${esc(v)}</b></div>`).join("")}
      <div class="stat"><span>Заявки в работе</span><b>${usd(st.pending_amount_cents)}</b></div><div class="stat"><span>Выплачено</span><b>${usd(st.paid_amount_cents)}</b></div></div>
      <section class="panel" style="margin-bottom:14px"><h3>Поиск партнёра</h3><form class="filters" id="pf"><input type="search" id="pq" placeholder="UID, Trader ID или реферальный код" style="max-width:340px"><button class="btn primary">Найти</button></form><div id="pr"></div></section>
      <section class="panel"><h3>Заявки на вывод</h3><div class="filters"><select id="wsf"><option value="">Все</option>${Object.entries(WST).map(([k, v]) => `<option value="${k}" ${k === "pending" ? "selected" : ""}>${v[1]}</option>`).join("")}</select></div><div id="wl"></div></section>`;
    $("#pf").onsubmit = async e => { e.preventDefault(); const r = await api("GET", "/partners?q=" + encodeURIComponent($("#pq").value.trim()));
      $("#pr").innerHTML = r.results.length ? `<div class="table-wrap"><table><thead><tr><th>Партнёр</th><th>Код</th><th>Trader ID</th><th>Приглашено</th></tr></thead><tbody>${r.results.map(x => `<tr><td><a href="#/partners/${encodeURIComponent(x.uid)}">${esc(x.email || x.uid)}</a><div class="muted">${esc(x.uid)}</div></td><td>${esc(x.ref_code || "—")}</td><td>${esc(x.trader_id_masked || "—")}</td><td class="num">${esc(x.invited)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Не найдено</div>`; };
    const loadW = async () => { const r = await api("GET", "/withdrawals?status=" + encodeURIComponent($("#wsf").value)); $("#wl").innerHTML = withdrawalsTable(r.withdrawals, true); bindW(); };
    $("#wsf").onchange = loadW; await loadW();
  }
  function withdrawalsTable(ws, withUser) {
    if (!ws.length) return `<div class="empty">Заявок нет</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Создана</th>${withUser ? "<th>Партнёр</th>" : ""}<th>Сумма</th><th>Trader ID</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${ws.map(w => `<tr><td class="num">${fmtDate(w.created_at)}<div class="muted">${esc(w.id)}</div></td>${withUser ? `<td><a href="#/partners/${encodeURIComponent(w.uid)}">${esc(w.uid)}</a></td>` : ""}<td class="num">${usd(w.amount_cents)} ${w.mode === "test" ? '<span class="pill warn">test</span>' : ""}</td><td>${esc(w.trader_id ? "••••" + String(w.trader_id).slice(-4) : "—")}</td><td><span class="pill ${WST[w.status][0]}">${WST[w.status][1]}</span><div class="muted" style="font-size:12px">${esc(((w.history || []).slice(-1)[0] || {}).note || "")}</div></td>
      <td>${can("finance.payouts") ? `${w.status === "pending" ? `<button class="btn sm" data-ws="processing" data-wid="${esc(w.id)}">В обработку</button>` : ""}${["pending", "processing"].includes(w.status) ? `<button class="btn sm danger" data-ws="rejected" data-wid="${esc(w.id)}">Отклонить</button>` : ""}${w.status === "processing" ? `<button class="btn sm primary" data-ws="paid" data-wid="${esc(w.id)}">Выплачено…</button>` : ""}` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function bindW() {
    main.querySelectorAll("[data-ws]").forEach(b => b.onclick = () => {
      const to = b.dataset.ws, wid = b.dataset.wid;
      if (to === "processing") return run(b, async () => { await api("POST", `/withdrawals/${encodeURIComponent(wid)}/status`, { status: "processing" }); toast("Заявка в обработке"); route(); });
      modal(to === "paid" ? "Подтверждение выплаты" : "Отклонить заявку", to === "paid"
        ? `<p>Отмечайте только после фактического перевода. Статус «Выплачено» нельзя отменить.</p><label class="f">Номер / ссылка платежа<input type="text" id="pref" maxlength="200"></label><label class="check" style="margin-top:10px"><input type="checkbox" id="pcf"> Выплата фактически выполнена и проверена</label>`
        : `<label class="f">Причина (увидит партнёр)<textarea id="rsn" maxlength="500"></textarea></label><p class="muted">Резерв вернётся на доступный баланс.</p>`,
        [{ label: "Отмена", cls: "ghost", onClick: () => {} }, { label: to === "paid" ? "Подтвердить выплату" : "Отклонить", cls: to === "paid" ? "primary" : "danger", onClick: async btn => {
          const body = to === "paid" ? { status: "paid", confirm: $("#pcf").checked, payment_reference: $("#pref").value } : { status: "rejected", note: $("#rsn").value };
          const r = await run(btn, () => api("POST", `/withdrawals/${encodeURIComponent(wid)}/status`, body)); if (!r) return true; toast(to === "paid" ? "Выплата отмечена" : "Заявка отклонена"); route(); } }]);
    });
  }
  async function partnerView(uid) {
    main.innerHTML = page("Партнёр", "") + `<p class="muted">Загрузка…</p>`;
    const d = await api("GET", "/partners/" + encodeURIComponent(uid));
    const bal = d.balances[d.mode] || d.balances.test || d.balances.live || {};
    main.innerHTML = page(d.email || d.uid, `<a href="#/partners">← Партнёры</a>`, `<button class="btn" id="pev">Пересчитать статусы</button>`) + `<p>${modeNote(d.mode)}</p>
      <div class="grid two"><section class="panel"><h3>Партнёр</h3><p>UID: <b>${esc(d.uid)}</b><br>Реферальный код: <b>${esc(d.ref_code || "—")}</b><br>Trader ID: <b>${esc(d.trader_id || "не подтверждён")}</b><br>Доступ к академии: ${d.academy_access ? '<span class="pill ok">есть</span>' : '<span class="pill">нет</span>'}</p></section>
      <section class="panel"><h3>Баланс ${d.mode !== "off" ? "(" + esc(d.mode) + ")" : ""}</h3><p>Доступно: <b>${usd(bal.available_cents)}</b> · В резерве: <b>${usd(bal.reserved_cents)}</b> · Выплачено: <b>${usd(bal.paid_cents)}</b> · Начислено всего: <b>${usd(bal.earned_cents)}</b></p>
        ${can("finance.adjust") && d.mode !== "off" ? `<form class="form" id="adj"><div class="form cols"><label class="f">Сумма, $ (минус — списание)<input type="number" step="0.01" id="aam"></label><label class="f">Причина<input type="text" id="ars" maxlength="500"></label></div><button class="btn">Ручная корректировка</button></form>` : ""}</section></div>
      <section class="panel" style="margin-top:14px"><h3>Приглашённые (${d.invites.length})</h3>${d.invites.length ? `<div class="table-wrap"><table><thead><tr><th>Пользователь</th><th>Trader ID</th><th>Статус</th><th>Флаги</th><th>Дата</th></tr></thead><tbody>${d.invites.map(i => `<tr><td>${esc(i.email || i.invitee_uid)}<div class="muted">${esc(i.invitee_uid)}</div></td><td>${esc(i.trader_id_masked || "—")}</td><td>${esc(INV[i.status] || i.status)}</td><td>${(i.flags || []).map(f => `<span class="pill warn">${esc(f)}</span>`).join(" ")}</td><td class="num">${fmtDay(i.created_at)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Приглашённых нет</div>`}</section>
      <section class="panel" style="margin-top:14px"><h3>Заявки на вывод</h3>${withdrawalsTable(d.withdrawals, false)}</section>
      <section class="panel" style="margin-top:14px"><h3>Журнал операций</h3>${d.ledger.length ? `<div class="table-wrap"><table><thead><tr><th>Время</th><th>Операция</th><th>Сумма</th><th>Причина</th><th>ID</th></tr></thead><tbody>${d.ledger.map(e => `<tr><td class="num">${fmtDate(e.created_at)}</td><td>${esc(e.type)} ${e.mode === "test" ? '<span class="pill warn">test</span>' : ""}</td><td class="num">${e.amount_cents ? usd(e.amount_cents) : "—"}</td><td>${esc(e.reason || "")}</td><td class="muted">${esc(e.id)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Операций нет</div>`}</section>`;
    $("#pev").onclick = e => run(e.currentTarget, async () => { const r = await api("POST", `/partners/${encodeURIComponent(uid)}/evaluate`, {}); toast("Пересчитано приглашений: " + r.invites); route(); });
    if ($("#adj")) { const opId = "op-" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      $("#adj").onsubmit = e => { e.preventDefault(); run(e.submitter, async () => { await api("POST", `/partners/${encodeURIComponent(uid)}/adjust`, { amount: Number($("#aam").value), reason: $("#ars").value, op_id: opId }); toast("Корректировка записана"); route(); }); }; }
    bindW();
  }

  /* ---------- Маршрутизация ---------- */
  async function route() {
    if (!ME) return;
    SEQ++; setMenu(false); window.onbeforeunload = null;
    const [, sec, id] = (location.hash || "#/dashboard").split("/");
    const s = sec || "dashboard";
    buildNav(s === "lessons" ? "courses" : s);
    const R = { dashboard: dashboardView, courses: () => (id ? courseView(id) : coursesView()), lessons: () => lessonView(id), media: mediaView, announcements: announcementsView, users: () => (id ? userView(id) : usersView()), audit: auditView, import: importView, diagnostics: diagnosticsView, partners: () => partnersView(id) };
    const nav = NAV.find(n => n[0] === (s === "lessons" ? "courses" : s));
    if (!R[s] || (nav && !can(nav[2]))) { const first = NAV.find(n => can(n[2])); location.hash = "#/" + (first ? first[0] : "dashboard"); return; }
    try { await R[s](); main.focus({ preventScroll: true }); }
    catch (e) { if (e && e.stale) return; main.innerHTML = page("Ошибка", "") + `<div class="empty">${esc(errText(e))}<br><button class="btn" onclick="location.reload()">Обновить страницу</button></div>`; if (e && e.error === "UNAUTHENTICATED") boot(); }
  }
  window.addEventListener("hashchange", route);

  async function boot() {
    ME = null;
    try { const f = await fb(); if (!f.auth.currentUser) return loginView(); }
    catch (e) { return loginView("Не удалось подключиться к Firebase. Проверьте интернет и обновите страницу."); }
    try { ME = await api("GET", "/me"); }
    catch (e) {
      if (e.error === "FORBIDDEN") { await window.hdAuth.signOut(); return loginView("У этого аккаунта нет прав администратора. Права выдаёт владелец академии."); }
      if (e.error === "BLOCKED") { await window.hdAuth.signOut(); return loginView("Аккаунт заблокирован."); }
      return loginView(errText(e));
    }
    app.dataset.view = "app";
    route();
  }
  boot();
})();
