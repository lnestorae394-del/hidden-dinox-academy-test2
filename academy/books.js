"use strict";
/* Встроенная читалка: оригинальный PDF книги и прогресс чтения.
   Файл лежит в private/books/ — этот каталог НЕ раздаётся как статика; выдача только через этот маршрут
   после входа (Firebase ID token) и проверки доступа к академии — те же правила, что у курсов.
   Поддержан HTTP Range: PDF.js открывает первую страницу, не дожидаясь загрузки всего файла.
   Полной защиты от копирования встроенная читалка не даёт (как любой просмотр в браузере). */
const fs = require("fs");
const path = require("path");
const R = require("./roles");

const BOOKS = {
  "hidden-reaction-system": { file: "private/books/the-hidden-reaction-system-v1.0-ru.pdf", title: "THE HIDDEN REACTION SYSTEM", version: "1.0", lang: "ru", pages: 49 }
};
const SLUG = /^[a-z0-9-]{3,60}$/;

function registerBookRoutes(router, { db, academyApi, root, log = console, now = () => Date.now() }) {
  const fail = (res, status, error) => res.status(status).json({ error });
  async function reader(req, res) {
    let auth;
    try { auth = await academyApi.authenticate(req); } catch (e) { fail(res, e && e.code === "ACCOUNT_BLOCKED" ? 403 : 401, e && e.code === "ACCOUNT_BLOCKED" ? "ACCOUNT_BLOCKED" : "UNAUTHENTICATED"); return null; }
    const { user, ev } = await academyApi.stateFor(auth.uid, { user: auth.user });
    const staff = R.RANK[R.roleOf(user)] >= R.RANK.team_member;
    if (!ev.academyAccess && !staff) { fail(res, 403, "NO_ACCESS"); return null; }
    const slug = req.params.slug;
    const book = SLUG.test(slug || "") ? BOOKS[slug] : null;
    if (!book) { fail(res, 404, "NOT_FOUND"); return null; }
    return { uid: auth.uid, slug, book };
  }
  const guard = fn => async (req, res) => { try { await fn(req, res); } catch (e) { log.error && log.error("book error:", e && (e.code || e.message)); if (!res.headersSent) fail(res, 503, "UNAVAILABLE"); } };

  // Список книг (для читалки и баннеров) — только метаданные
  router.get("/learn/books", guard(async (req, res) => {
    let auth; try { auth = await academyApi.authenticate(req); } catch (e) { return fail(res, 401, "UNAUTHENTICATED"); }
    res.json({ books: Object.entries(BOOKS).map(([slug, b]) => ({ slug, title: b.title, version: b.version, lang: b.lang, pages: b.pages })) });
  }));

  // Сам PDF (с поддержкой Range)
  router.get("/learn/books/:slug/file", guard(async (req, res) => {
    const r = await reader(req, res); if (!r) return;
    const file = path.join(root, r.book.file);
    let st; try { st = fs.statSync(file); } catch (e) { return fail(res, 404, "FILE_MISSING"); }
    res.set({ "Content-Type": "application/pdf", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" });
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    if (m && (m[1] || m[2])) {
      let start = m[1] === "" ? st.size - Number(m[2]) : Number(m[1]);
      let end = m[1] !== "" && m[2] !== "" ? Number(m[2]) : st.size - 1;
      if (!(start >= 0 && start <= end && end < st.size)) { res.set("Content-Range", `bytes */${st.size}`); return res.status(416).end(); }
      res.status(206).set({ "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": String(end - start + 1) });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.status(200).set("Content-Length", String(st.size));
    fs.createReadStream(file).pipe(res);
  }));

  // Последняя прочитанная страница: reading_progress/{uid}__{slug}
  router.get("/learn/books/:slug/progress", guard(async (req, res) => {
    const r = await reader(req, res); if (!r) return;
    const d = await db.collection("reading_progress").doc(`${r.uid}__${r.slug}`).get();
    res.set("Cache-Control", "no-store").json({ page: d.exists ? d.data().page : 1, pages: r.book.pages, updated_at: d.exists ? d.data().updated_at : null });
  }));
  router.put("/learn/books/:slug/progress", guard(async (req, res) => {
    const r = await reader(req, res); if (!r) return;
    const page = req.body && req.body.page;
    if (!Number.isInteger(page) || page < 1 || page > r.book.pages) return fail(res, 400, "INVALID_PAGE");
    await db.collection("reading_progress").doc(`${r.uid}__${r.slug}`).set({ uid: r.uid, book: r.slug, page, pages: r.book.pages, updated_at: now() }, { merge: true });
    res.json({ ok: true, page });
  }));
}

module.exports = { registerBookRoutes, BOOKS };
