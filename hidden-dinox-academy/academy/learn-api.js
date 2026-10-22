"use strict";
/* Обучение для учеников: только ОПУБЛИКОВАННЫЕ курсы (published_courses / published_lessons).
   Доступ: открытая академия (academyAccess, вычисляет сервер) или роль сотрудника (Team Member и выше).
   Правильные ответы тестов клиенту не отдаются; проверка — на сервере. */
const R = require("./roles");
const C = require("./content");

function createLearnApi({ db, academyApi, storage = null, log = console, now = () => Date.now() }) {
  const col = n => db.collection(n);
  const fail = (res, status, error, message) => res.status(status).json({ error, message });
  class E extends Error { constructor(s, c, m) { super(m || c); this.s = s; this.c = c; } }

  async function learner(req, auth) {
    auth = auth || await academyApi.authenticate(req);
    const { user, ev } = await academyApi.stateFor(auth.uid, { user: auth.user });
    const role = R.roleOf(user);
    const staff = R.RANK[role] >= R.RANK.team_member;
    if (!ev.academyAccess && !staff) throw new E(403, "NO_ACCESS", "Обучение доступно после активации академии");
    return { uid: auth.uid, role, staff };
  }
  const visible = (c, staff) => staff || !c.visible_from || c.visible_from <= now();
  const pid = (uid, lid) => `${uid}__${lid}`;
  const progressOf = async (uid, courseId) => (await col("lesson_progress").where("uid", "==", uid).get()).docs.map(d => d.data()).filter(p => !courseId || p.course_id === courseId);

  // Every learner action must enforce the same publication window as lesson viewing.
  // Otherwise a user who learns/guesses a lesson ID could submit quizzes or mark a
  // scheduled lesson complete before its course becomes visible.
  async function publishedLessonForLearner(me, lessonId) {
    const d = await col("published_lessons").doc(lessonId).get();
    if (!d.exists) throw new E(404, "NOT_FOUND");
    const l = d.data();
    const c = await col("published_courses").doc(l.course_id).get();
    if (!c.exists || !visible(c.data(), me.staff)) throw new E(404, "NOT_FOUND");
    const included = (c.data().modules || []).some(m => (m.lessons || []).some(x => x.id === lessonId));
    if (!included) throw new E(404, "NOT_FOUND");
    return l;
  }

  const wrap = fn => async (req, res) => {
    try { const out = await fn(req); res.set && res.set("Cache-Control", "no-store"); res.status(200).json(out); }
    catch (e) {
      if (e instanceof E) return fail(res, e.s, e.c, e.message);
      if (e && e.code && /^(UNAUTHENTICATED|ACCOUNT_BLOCKED|CONFIG_MISSING)$/.test(e.code)) return fail(res, e.code === "UNAUTHENTICATED" ? 401 : e.code === "ACCOUNT_BLOCKED" ? 403 : 503, e.code);
      log.error && log.error("learn api error:", e && (e.code || e.message));
      fail(res, 503, "UNAVAILABLE");
    }
  };

  const H = {
    courses: wrap(async req => {
      // Проверка доступа и чтения курсов/прогресса — параллельно; при отказе в доступе ответ всё равно 403 и данных нет
      const auth = await academyApi.authenticate(req);
      const [me, pubSnap, prog] = await Promise.all([learner(req, auth), col("published_courses").get(), progressOf(auth.uid)]);
      const pubs = pubSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => visible(c, me.staff));
      return { courses: pubs.map(c => {
        const ids = new Set(c.modules.flatMap(m => m.lessons.map(l => l.id)));
        const done = prog.filter(p => p.completed && ids.has(p.lesson_id)).length;
        return { id: c.id, title: c.title, description: c.description, level: c.level, cover_url: c.cover_media_id ? "/media/" + c.cover_media_id : null, lessons: ids.size, completed: done, percent: ids.size ? Math.round(done * 100 / ids.size) : 0 };
      }) };
    }),
    course: wrap(async req => {
      const me = await learner(req);
      const d = await col("published_courses").doc(req.params.id).get();
      if (!d.exists || !visible(d.data(), me.staff)) throw new E(404, "NOT_FOUND");
      const c = d.data(), prog = await progressOf(me.uid, d.id);
      const done = new Set(prog.filter(p => p.completed).map(p => p.lesson_id));
      const total = c.modules.reduce((n, m) => n + m.lessons.length, 0);
      return { course: { id: d.id, title: c.title, description: c.description, goal: c.goal, level: c.level, disclaimer: c.disclaimer, cover_url: c.cover_media_id ? "/media/" + c.cover_media_id : null,
        modules: c.modules.map(m => ({ ...m, lessons: m.lessons.map(l => ({ ...l, completed: done.has(l.id) })) })), total, completed: done.size, percent: total ? Math.round(done.size * 100 / total) : 0 } };
    }),
    lesson: wrap(async req => {
      const me = await learner(req);
      const d = await col("published_lessons").doc(req.params.id).get();
      if (!d.exists) throw new E(404, "NOT_FOUND");
      const c = await col("published_courses").doc(d.data().course_id).get();
      if (!c.exists || !visible(c.data(), me.staff)) throw new E(404, "NOT_FOUND");
      const p = await col("lesson_progress").doc(pid(me.uid, d.id)).get();
      const l = C.publicLesson(d.data());
      // Ссылка на навигацию внутри курса
      const flat = c.data().modules.flatMap(m => m.lessons.map(x => ({ id: x.id, title: x.title, module: m.title })));
      const i = flat.findIndex(x => x.id === d.id);
      return { lesson: { id: d.id, course_id: l.course_id, course_title: c.data().title, title: l.title, outcome: l.outcome, source_pages: l.source_pages, blocks: l.blocks, pass_criteria: l.pass_criteria },
        nav: { prev: flat[i - 1] || null, next: flat[i + 1] || null, index: i + 1, total: flat.length },
        progress: p.exists ? { completed: p.data().completed === true, quiz: p.data().quiz || null } : { completed: false, quiz: null } };
    }),
    quiz: wrap(async req => {
      const me = await learner(req);
      const l = await publishedLessonForLearner(me, req.params.id);
      const blockId = req.body && typeof req.body.block_id === "string" ? req.body.block_id : null;
      const qb = (l.blocks || []).find(b => b.type === "quiz" && (!blockId || b.id === blockId));
      if (!qb) throw new E(404, "NO_QUIZ");
      const answers = Array.isArray(req.body && req.body.answers) ? req.body.answers : [];
      if (answers.length !== qb.questions.length) throw new E(400, "INVALID", "Ответьте на все вопросы");
      const results = qb.questions.map((q, i) => ({ correct: Number(answers[i]) === q.correct, correct_index: q.correct, explanation: q.explanation || "" }));
      const score = results.filter(r => r.correct).length, percent = Math.round(score * 100 / results.length), passed = percent >= (qb.pass_percent ?? 70);
      const ref = col("lesson_progress").doc(pid(me.uid, req.params.id));
      await db.runTransaction(async tx => {
        const p = await tx.get(ref); const prev = p.exists ? p.data() : {};
        const attempts = ((prev.quiz && prev.quiz.attempts) || 0) + 1;
        const best = Math.max(percent, (prev.quiz && prev.quiz.best_percent) || 0);
        tx.set(ref, { uid: me.uid, course_id: l.course_id, lesson_id: req.params.id, quiz: { attempts, last_percent: percent, best_percent: best, passed: (prev.quiz && prev.quiz.passed) || passed, at: now() }, updated_at: now() }, { merge: true });
      });
      return { score, total: results.length, percent, passed, results };
    }),
    complete: wrap(async req => {
      const me = await learner(req);
      const l = await publishedLessonForLearner(me, req.params.id);
      const ref = col("lesson_progress").doc(pid(me.uid, req.params.id));
      const p = await ref.get(); const prev = p.exists ? p.data() : {};
      const pc = l.pass_criteria || {};
      if (pc.require_quiz && !(prev.quiz && prev.quiz.passed)) throw new E(409, "QUIZ_REQUIRED", "Сначала пройдите тест урока");
      if (prev.completed) return { ok: true, already: true };
      await ref.set({ uid: me.uid, course_id: l.course_id, lesson_id: req.params.id, completed: true, completed_at: now(), updated_at: now() }, { merge: true });
      return { ok: true };
    }),
    /* Баннеры главной: опубликованные записи CMS kind:"banner"; если их нет — два стандартных (книга и кабинет партнёра) */
    banners: wrap(async req => {
      const auth = await academyApi.authenticate(req);
      const [{ ev }, snap] = await Promise.all([academyApi.stateFor(auth.uid, { user: auth.user }), col("announcements").where("kind", "==", "banner").get()]);
      const t = now(), all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const live = all.filter(a => a.status === "published" && (!a.show_from || Date.parse(a.show_from) <= t) && (!a.show_until || Date.parse(a.show_until) > t))
        .filter(a => a.audience === "all" || (a.audience === "access" && ev.academyAccess) || (a.audience === "no_access" && !ev.academyAccess))
        .sort((a, b) => (b.priority - a.priority) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
      const src = all.length ? live : DEFAULT_BANNERS;
      return { banners: src.slice(0, 12).map(a => {
        const soon = a.action_type === "soon" || (a.release_at && Date.parse(a.release_at) > t);
        return { id: a.id, title: a.title, title_i18n: a.title_i18n || {}, cta_label: a.cta_label || "", cta_i18n: a.cta_i18n || {}, category_i18n: a.category_i18n || {},
          image_url: a.image_media_id ? "/media/" + a.image_media_id : (C.BUILTIN_IMAGES[a.image_builtin] || null),
          href: soon ? null : C.bannerHref(a), external: a.action_type === "external", soon: !!soon, release_at: a.release_at || null, system: !!a.system };
      }) };
    }),
    announcements: wrap(async req => {
      const auth = await academyApi.authenticate(req);
      const [{ ev }, annSnap] = await Promise.all([academyApi.stateFor(auth.uid, { user: auth.user }), col("announcements").get()]);
      const t = now();
      const list = annSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.kind !== "banner")   // баннеры главной — отдельный маршрут
        .filter(a => a.status === "published" && (!a.show_from || Date.parse(a.show_from) <= t) && (!a.show_until || Date.parse(a.show_until) > t))
        .filter(a => a.audience === "all" || (a.audience === "access" && ev.academyAccess) || (a.audience === "no_access" && !ev.academyAccess))
        .sort((a, b) => (b.priority - a.priority) || String(a.event_at || "").localeCompare(String(b.event_at || "")))
        .slice(0, 10)
        .map(a => ({ id: a.id, title: a.title, body: a.body, image_url: a.image_media_id ? "/media/" + a.image_media_id : null, event_at: a.event_at, cta_label: a.cta_label, cta_url: a.cta_url }));
      return { announcements: list };
    })
  };

  /* Файлы медиа-библиотеки. Идентификаторы случайные (не перебираются); SVG/HTML не принимаются при загрузке. */
  async function media(req, res) {
    try {
      const id = String(req.params.id || "");
      if (!/^med_[a-f0-9]{20}$/.test(id) || !storage || !storage.available) return res.status(404).end();
      const d = await col("media").doc(id).get();
      if (!d.exists || d.data().deleted) return res.status(404).end();
      const buf = await storage.read(d.data().storage_path);
      res.set("Content-Type", d.data().content_type); res.set("X-Content-Type-Options", "nosniff");
      res.set("Cache-Control", "public, max-age=86400"); res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.set("Content-Disposition", (d.data().kind === "pdf" ? "inline" : "inline") + `; filename="${encodeURIComponent(d.data().name || "file")}"`);
      res.status(200).send(buf);
    } catch (e) { log.error && log.error("media error:", e && e.message); res.status(404).end(); }
  }

  const DEFAULT_BANNERS = [
    { id: "sys_book", system: true, kind: "banner", title: "THE HIDDEN REACTION SYSTEM", title_i18n: { ru: "THE HIDDEN REACTION SYSTEM", en: "THE HIDDEN REACTION SYSTEM", ua: "THE HIDDEN REACTION SYSTEM" },
      cta_i18n: { ru: "Читать книгу", en: "Read the book", ua: "Читати книгу" }, category_i18n: { ru: "Книга", en: "Book", ua: "Книга" }, image_builtin: "book-reading", action_type: "reader", action_target: "hidden-reaction-system" },
    { id: "sys_invite", system: true, kind: "banner", title: "INVITE & EARN", title_i18n: { ru: "INVITE & EARN", en: "INVITE & EARN", ua: "INVITE & EARN" },
      cta_i18n: { ru: "Мой кабинет", en: "My dashboard", ua: "Мій кабінет" }, category_i18n: { ru: "Партнёрам", en: "Partners", ua: "Партнерам" }, image_builtin: "invite-pointing", action_type: "referral", action_target: "" }
  ];
  const ROUTES = [["GET", "/home/banners", "banners"], ["GET", "/learn/courses", "courses"], ["GET", "/learn/courses/:id", "course"], ["GET", "/learn/lessons/:id", "lesson"],
    ["POST", "/learn/lessons/:id/quiz", "quiz"], ["POST", "/learn/lessons/:id/complete", "complete"], ["GET", "/announcements", "announcements"]];
  return { H, ROUTES, media };
}

/* Регистрирует маршруты обучения в существующем роутере /api и маршрут файлов /media/:id */
function registerLearnRoutes(app, router, deps) {
  const api = createLearnApi(deps);
  for (const [m, p, h] of api.ROUTES) router[m.toLowerCase()](p, api.H[h]);
  app.get("/media/:id", api.media);
  return api;
}
module.exports = { createLearnApi, registerLearnRoutes };
