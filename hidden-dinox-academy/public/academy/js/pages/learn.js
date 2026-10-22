/* HIDDEN DINOX ACADEMY — обучение ученика: курсы → курс → урок. Данные только с сервера (/api/learn). */
(function () {
  "use strict";
  const el = document.getElementById("lp"), crumb = document.getElementById("crumb"), back = document.getElementById("back");
  const H = window.HDLesson, esc = H.esc;
  const ERR = { NO_ACCESS: "Обучение откроется после подтверждения первого депозита.", NOT_FOUND: "Материал не найден или снят с публикации.", TOO_MANY: "Слишком много попыток — подождите минуту.", NETWORK: "Нет связи с сервером." };
  const msg = e => ERR[e && e.code] || (e && e.message) || "Не удалось загрузить данные. Обновите страницу.";
  const show = html => { el.innerHTML = html; el.focus({ preventScroll: true }); window.scrollTo(0, 0); };
  const fail = e => {
    if (e && e.code === "UNAUTHENTICATED") { location.replace("index.html"); return; }
    if (e && e.code === "NO_ACCESS") { location.replace("academy.html"); return; }
    show(`<p class="lp-err">${esc(msg(e))}</p><a class="lp-btn" href="learn.html">К списку курсов</a>`);
  };

  async function courses() {
    crumb.textContent = "Обучение"; back.href = "academy.html"; back.textContent = "Академия";
    const { courses } = await call("GET", "/api/learn/courses");
    show(`<h1>Обучение</h1>${courses.length ? courses.map(c => `<a class="lp-card" href="#/course/${encodeURIComponent(c.id)}">${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="">` : ""}<h2>${esc(c.title)}</h2>${c.description ? `<p class="lp-muted">${esc(c.description)}</p>` : ""}
      <div class="lp-bar"><i style="width:${c.percent}%"></i></div><small class="lp-muted">Пройдено ${c.completed} из ${c.lessons} уроков</small></a>`).join("") : `<p class="lp-muted">Курсы появятся здесь после публикации.</p>`}`);
  }
  async function course(id) {
    const { course: c } = await call("GET", "/api/learn/courses/" + encodeURIComponent(id));
    crumb.textContent = c.title; back.href = "#/"; back.textContent = "Все курсы"; document.title = c.title + " — HIDDEN DINOX ACADEMY";
    const next = c.modules.flatMap(m => m.lessons).find(l => !l.completed);
    show(`<h1>${esc(c.title)}</h1>${c.goal ? `<div class="hdl-text">${H.md(c.goal)}</div>` : ""}
      <div class="lp-bar"><i style="width:${c.percent}%"></i></div><p class="lp-meta">Пройдено ${c.completed} из ${c.total} уроков</p>
      ${next ? `<a class="lp-btn primary" href="#/lesson/${encodeURIComponent(next.id)}">${c.completed ? "Продолжить" : "Начать обучение"}</a>` : `<p class="lp-done">Курс пройден</p>`}
      ${c.disclaimer ? `<div class="lp-disc">${esc(c.disclaimer)}</div>` : ""}
      ${c.modules.map((m, mi) => `<section class="lp-mod"><h2>Модуль ${mi + 1}. ${esc(m.title)}</h2>${m.goal ? `<p>${esc(m.goal)}</p>` : ""}
        ${m.lessons.map((l, li) => `<a class="lp-les" href="#/lesson/${encodeURIComponent(l.id)}"><span>${mi + 1}.${li + 1}. ${esc(l.title)}</span><em class="${l.completed ? "ok" : ""}">${l.completed ? "Пройден" : l.has_quiz ? "С тестом" : ""}</em></a>`).join("")}</section>`).join("")}`);
  }
  async function lesson(id) {
    const r = await call("GET", "/api/learn/lessons/" + encodeURIComponent(id));
    const l = r.lesson;
    crumb.textContent = l.course_title; back.href = "#/course/" + encodeURIComponent(l.course_id); back.textContent = "К курсу"; document.title = l.title + " — HIDDEN DINOX ACADEMY";
    show(`<p class="lp-meta">Урок ${r.nav.index} из ${r.nav.total}</p><h1>${esc(l.title)}</h1><div id="body"></div>
      <div class="lp-foot">${r.nav.prev ? `<a class="lp-btn" href="#/lesson/${encodeURIComponent(r.nav.prev.id)}">Предыдущий урок</a>` : "<span></span>"}
      <span id="doneWrap">${r.progress.completed ? `<span class="lp-done">Урок пройден</span>` : `<button class="lp-btn primary" id="done">Отметить урок пройденным</button>`}</span>
      ${r.nav.next ? `<a class="lp-btn" href="#/lesson/${encodeURIComponent(r.nav.next.id)}">Следующий урок</a>` : ""}</div><p class="lp-err" id="doneErr" hidden></p>`);
    H.render(document.getElementById("body"), l, {
      onQuiz: async (blockId, answers) => {
        try { return await call("POST", `/api/learn/lessons/${encodeURIComponent(id)}/quiz`, { block_id: blockId, answers }); }
        catch (e) { throw new Error(msg(e)); }
      }
    });
    const b = document.getElementById("done");
    if (b) b.onclick = async () => {
      b.disabled = true; const er = document.getElementById("doneErr"); er.hidden = true;
      try { await call("POST", `/api/learn/lessons/${encodeURIComponent(id)}/complete`, {}); document.getElementById("doneWrap").innerHTML = `<span class="lp-done">Урок пройден</span>`; }
      catch (e) { er.hidden = false; er.textContent = e && e.code === "QUIZ_REQUIRED" ? "Сначала пройдите тест урока." : msg(e); b.disabled = false; }
    };
  }
  async function route() {
    const [, kind, id] = (location.hash || "#/").split("/");
    try { if (kind === "course" && id) await course(decodeURIComponent(id)); else if (kind === "lesson" && id) await lesson(decodeURIComponent(id)); else await courses(); }
    catch (e) { fail(e); }
  }
  window.addEventListener("hashchange", route);
  (async () => { try { const f = await fb(); if (!f.auth.currentUser) return location.replace("index.html"); } catch (e) { return fail({ code: "NETWORK" }); } route(); })();
})();
