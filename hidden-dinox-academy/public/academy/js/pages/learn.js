/* HIDDEN DINOX ACADEMY — обучение ученика: курсы → курс → урок. Данные только с сервера (/api/learn). */
(function () {
  "use strict";
  const el = document.getElementById("lp"), crumb = document.getElementById("crumb"), back = document.getElementById("back");
  const H = window.HDLesson, esc = H.esc;
  /* Язык — тот же, что выбран в академии (localStorage hd_lang); сервер переводит содержание курса */
  let LANG = "ru"; try { const x = localStorage.getItem("hd_lang"); if (["ru", "en", "ua"].includes(x)) LANG = x; } catch (e) {}
  H.setLang(LANG); document.documentElement.lang = LANG === "ua" ? "uk" : LANG;
  const S = {
    ru: { NO_ACCESS: "Обучение откроется после подтверждения первого депозита.", NOT_FOUND: "Материал не найден или снят с публикации.", TOO_MANY: "Слишком много попыток — подождите минуту.", NETWORK: "Нет связи с сервером.", generic: "Не удалось загрузить данные. Обновите страницу.",
      toList: "К списку курсов", learning: "Обучение", academy: "Академия", done: "Пройдено {d} из {t} уроков", empty: "Курсы появятся здесь после публикации.", allCourses: "Все курсы", cont: "Продолжить", start: "Начать обучение",
      courseDone: "Курс пройден", module: "Модуль", toCourse: "К курсу", lessonOf: "Урок {i} из {n}", prev: "Предыдущий урок", next: "Следующий урок", lessonDone: "Урок пройден", markDone: "Отметить урок пройденным", quizFirst: "Сначала пройдите тест урока.", passedB: "Пройден", withQuiz: "С тестом",
      trPartial: "Перевод этого материала неполный: часть текста показана на русском.", trNone: "Перевода на этот язык пока нет — показан русский текст." },
    en: { NO_ACCESS: "Learning opens after your first deposit is confirmed.", NOT_FOUND: "The material was not found or has been unpublished.", TOO_MANY: "Too many attempts — wait a minute.", NETWORK: "No connection to the server.", generic: "Couldn’t load the data. Refresh the page.",
      toList: "Back to courses", learning: "Learning", academy: "Academy", done: "{d} of {t} lessons completed", empty: "Courses will appear here once published.", allCourses: "All courses", cont: "Continue", start: "Start learning",
      courseDone: "Course completed", module: "Module", toCourse: "Back to course", lessonOf: "Lesson {i} of {n}", prev: "Previous lesson", next: "Next lesson", lessonDone: "Lesson completed", markDone: "Mark lesson as completed", quizFirst: "Pass the lesson test first.", passedB: "Completed", withQuiz: "With test",
      trPartial: "This material is only partly translated: some text is shown in Russian.", trNone: "There is no translation into this language yet — the Russian text is shown." },
    ua: { NO_ACCESS: "Навчання відкриється після підтвердження першого депозиту.", NOT_FOUND: "Матеріал не знайдено або знято з публікації.", TOO_MANY: "Забагато спроб — зачекайте хвилину.", NETWORK: "Немає зв'язку із сервером.", generic: "Не вдалося завантажити дані. Оновіть сторінку.",
      toList: "До списку курсів", learning: "Навчання", academy: "Академія", done: "Пройдено {d} з {t} уроків", empty: "Курси з'являться тут після публікації.", allCourses: "Усі курси", cont: "Продовжити", start: "Почати навчання",
      courseDone: "Курс пройдено", module: "Модуль", toCourse: "До курсу", lessonOf: "Урок {i} з {n}", prev: "Попередній урок", next: "Наступний урок", lessonDone: "Урок пройдено", markDone: "Позначити урок пройденим", quizFirst: "Спочатку пройдіть тест уроку.", passedB: "Пройдено", withQuiz: "З тестом",
      trPartial: "Переклад цього матеріалу неповний: частину тексту показано російською.", trNone: "Перекладу цією мовою поки немає — показано російський текст." }
  };
  const s = (k, v) => { let x = S[LANG][k] || S.ru[k] || k; if (v) for (const [a, b] of Object.entries(v)) x = x.replace("{" + a + "}", b); return x; };
  const qs = "?lang=" + LANG;
  const trNote = tr => (LANG === "ru" || !tr || tr.complete) ? "" : `<p class="lp-trnote" role="note">${esc(s(tr.none ? "trNone" : "trPartial"))}</p>`;
  const msg = e => (e && ["NO_ACCESS", "NOT_FOUND", "TOO_MANY", "NETWORK"].includes(e.code)) ? s(e.code) : s("generic");
  const show = html => { el.innerHTML = html; el.focus({ preventScroll: true }); window.scrollTo(0, 0); };
  const fail = e => {
    if (e && e.code === "UNAUTHENTICATED") { location.replace("index.html"); return; }
    if (e && e.code === "NO_ACCESS") { location.replace("academy.html"); return; }
    show(`<p class="lp-err">${esc(msg(e))}</p><a class="lp-btn" href="learn.html">${esc(s("toList"))}</a>`);
  };

  async function courses() {
    crumb.textContent = s("learning"); back.href = "academy.html"; back.textContent = s("academy");
    const { courses } = await call("GET", "/api/learn/courses" + qs);
    show(`<h1>${esc(s("learning"))}</h1>${courses.length ? courses.map(c => `<a class="lp-card" href="#/course/${encodeURIComponent(c.id)}">${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="">` : ""}<h2>${esc(c.title)}</h2>${c.description ? `<p class="lp-muted">${esc(c.description)}</p>` : ""}
      <div class="lp-bar"><i style="width:${c.percent}%"></i></div><small class="lp-muted">${esc(s("done", { d: c.completed, t: c.lessons }))}</small></a>`).join("") : `<p class="lp-muted">${esc(s("empty"))}</p>`}`);
  }
  async function course(id) {
    const { course: c } = await call("GET", "/api/learn/courses/" + encodeURIComponent(id) + qs);
    crumb.textContent = c.title; back.href = "#/"; back.textContent = s("allCourses"); document.title = c.title + " — HIDDEN DINOX ACADEMY";
    const next = c.modules.flatMap(m => m.lessons).find(l => !l.completed);
    show(`<h1>${esc(c.title)}</h1>${trNote(c.translation)}${c.goal ? `<div class="hdl-text">${H.md(c.goal)}</div>` : ""}
      <div class="lp-bar"><i style="width:${c.percent}%"></i></div><p class="lp-meta">Пройдено ${c.completed} из ${c.total} уроков</p>
      ${next ? `<a class="lp-btn primary" href="#/lesson/${encodeURIComponent(next.id)}">${esc(c.completed ? s("cont") : s("start"))}</a>` : `<p class="lp-done">${esc(s("courseDone"))}</p>`}
      ${c.disclaimer ? `<div class="lp-disc">${esc(c.disclaimer)}</div>` : ""}
      ${c.modules.map((m, mi) => `<section class="lp-mod"><h2>${esc(s("module"))} ${mi + 1}. ${esc(m.title)}</h2>${m.goal ? `<p>${esc(m.goal)}</p>` : ""}
        ${m.lessons.map((l, li) => `<a class="lp-les" href="#/lesson/${encodeURIComponent(l.id)}"><span>${mi + 1}.${li + 1}. ${esc(l.title)}</span><em class="${l.completed ? "ok" : ""}">${l.completed ? s("passedB") : l.has_quiz ? s("withQuiz") : ""}</em></a>`).join("")}</section>`).join("")}`);
  }
  async function lesson(id) {
    const r = await call("GET", "/api/learn/lessons/" + encodeURIComponent(id) + qs);
    const l = r.lesson;
    crumb.textContent = l.course_title; back.href = "#/course/" + encodeURIComponent(l.course_id); back.textContent = s("toCourse"); document.title = l.title + " — HIDDEN DINOX ACADEMY";
    show(`<p class="lp-meta">${esc(s("lessonOf", { i: r.nav.index, n: r.nav.total }))}</p><h1>${esc(l.title)}</h1>${trNote(l.translation)}<div id="body"></div>
      <div class="lp-foot">${r.nav.prev ? `<a class="lp-btn" href="#/lesson/${encodeURIComponent(r.nav.prev.id)}">${esc(s("prev"))}</a>` : "<span></span>"}
      <span id="doneWrap">${r.progress.completed ? `<span class="lp-done">${esc(s("lessonDone"))}</span>` : `<button class="lp-btn primary" id="done">${esc(s("markDone"))}</button>`}</span>
      ${r.nav.next ? `<a class="lp-btn" href="#/lesson/${encodeURIComponent(r.nav.next.id)}">${esc(s("next"))}</a>` : ""}</div><p class="lp-err" id="doneErr" hidden></p>`);
    H.render(document.getElementById("body"), l, {
      onQuiz: async (blockId, answers) => {
        try { return await call("POST", `/api/learn/lessons/${encodeURIComponent(id)}/quiz`, { block_id: blockId, answers, lang: LANG }); }
        catch (e) { throw new Error(msg(e)); }
      }
    });
    const b = document.getElementById("done");
    if (b) b.onclick = async () => {
      b.disabled = true; const er = document.getElementById("doneErr"); er.hidden = true;
      try { await call("POST", `/api/learn/lessons/${encodeURIComponent(id)}/complete`, {}); document.getElementById("doneWrap").innerHTML = `<span class="lp-done">${esc(s("lessonDone"))}</span>`; }
      catch (e) { er.hidden = false; er.textContent = e && e.code === "QUIZ_REQUIRED" ? s("quizFirst") : msg(e); b.disabled = false; }
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
