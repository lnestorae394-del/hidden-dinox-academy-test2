"use strict";
/* Тесты админ-панели, CMS, обучения и Telegram. node --test tests/admin.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { FakeFirestore } = require("./helpers/fake-firestore");
const { fakeVerify, fakeRes, fakeReq } = require("./helpers/http");
const { adminCaller, learnCaller } = require("./helpers/router");
const { createAdminApi } = require("../academy/admin-api");
const { createAcademyApi } = require("../academy/api");
const { createLearnApi } = require("../academy/learn-api");
const { createAcademyPostback } = require("../academy/postback");
const { memoryStorage } = require("../academy/storage");
const { verifyInitData } = require("../academy/telegram");

const quiet = { log() {}, warn() {}, error() {} };
const SECRET = "test-secret-0123456789abcdef-XYZ";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64)]);

function setup({ storage = memoryStorage(), clock } = {}) {
  const db = new FakeFirestore();
  let t = clock || 1_800_000_000_000; const now = () => t;
  const adminApi = createAdminApi({ db, verifyIdToken: fakeVerify, storage, log: quiet, now });
  const academyApi = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet, now });
  const learnApi = createLearnApi({ db, academyApi, storage, log: quiet, now });
  const pb = createAcademyPostback({ db, env: { POCKET_POSTBACK_SECRET: SECRET }, log: quiet, now });
  const A = adminCaller(adminApi), L = learnCaller(learnApi);
  const user = (uid, role, extra = {}) => db.collection("users").doc(uid).set({ email: uid + "@test.local", role, created_at: t - 1000, ...extra }, { merge: true });
  async function giveAccess(uid, trader) {      // настоящий путь доступа: регистрация → привязка → FTD $60
    const r = fakeRes(); await academyApi.me(fakeReq({ token: "testtoken-" + uid }), r);
    await pb.handle({ type: "registration", trader_id: trader, secret: SECRET });
    const b = fakeRes(); await academyApi.traderId(fakeReq({ token: "testtoken-" + uid, body: { traderId: trader } }), b);
    await pb.handle({ type: "ftd", trader_id: trader, amount: "60", currency: "USD", secret: SECRET });
  }
  const advance = ms => { t += ms; };
  return { db, A, L, user, giveAccess, adminApi, academyApi, learnApi, advance, storage, now };
}
// Минимальный корректный курс через API
async function makeCourse(s, uid = "boss") {
  const c = (await s.A("POST", "/courses", { uid, body: { title: "Курс", level: "beginner" } })).body.id;
  const m = (await s.A("POST", `/courses/${c}/modules`, { uid, body: { title: "Модуль 1" } })).body.id;
  const l = (await s.A("POST", `/modules/${m}/lessons`, { uid, body: { title: "Урок 1" } })).body.id;
  await s.A("PUT", `/lessons/${l}`, { uid, body: { title: "Урок 1", status: "ready", pass_criteria: { require_quiz: true, min_percent: 50 }, blocks: [
    { type: "heading", text: "Заголовок" }, { type: "text", text: "Текст **жирный** <script>alert(1)</script>" },
    { type: "quiz", id: "q1", pass_percent: 50, questions: [{ q: "2+2?", options: ["3", "4"], correct: 1, explanation: "Так." }, { q: "Да?", options: ["да", "нет"], correct: 0 }] }] } });
  return { c, m, l };
}

/* ---------- Права и роли ---------- */
test("админ-API: без токена 401, ученик 403, mentor видит только разрешённое", async () => {
  const s = setup(); await s.user("stud", "student"); await s.user("ment", "mentor");
  assert.equal((await s.A("GET", "/me", {})).statusCode, 401);
  assert.equal((await s.A("GET", "/me", { uid: "stud" })).statusCode, 403);
  const me = await s.A("GET", "/me", { uid: "ment" });
  assert.equal(me.statusCode, 200); assert.equal(me.body.role, "mentor");
  assert.ok(me.body.permissions.includes("content.edit")); assert.ok(!me.body.permissions.includes("content.publish"));
  assert.equal((await s.A("GET", "/users", { uid: "ment" })).statusCode, 403);
  assert.equal((await s.A("GET", "/audit", { uid: "ment" })).statusCode, 403);
  const { c } = await makeCourse(s, "ment");
  assert.equal((await s.A("POST", `/courses/${c}/publish`, { uid: "ment", body: { confirm: true } })).statusCode, 403);
});

test("роли: назначить можно только роль ниже своей, себе — нельзя; клиент не может выдать себе роль", async () => {
  const s = setup(); await s.user("boss", "super_admin"); await s.user("adm", "admin"); await s.user("adm2", "admin"); await s.user("stud", "student");
  assert.equal((await s.A("POST", "/users/stud/role", { uid: "adm", body: { role: "mentor" } })).statusCode, 200);
  for (const role of ["admin", "super_admin"]) assert.equal((await s.A("POST", "/users/stud/role", { uid: "adm", body: { role } })).statusCode, 403, role);
  assert.equal((await s.A("POST", "/users/adm2/role", { uid: "adm", body: { role: "student" } })).statusCode, 403);   // равная роль
  assert.equal((await s.A("POST", "/users/adm/role", { uid: "adm", body: { role: "super_admin" } })).statusCode, 403); // себе
  assert.equal((await s.A("POST", "/users/stud/role", { uid: "adm", body: { role: "god" } })).statusCode, 403);
  assert.equal((await s.A("POST", "/users/adm2/role", { uid: "boss", body: { role: "moderator" } })).statusCode, 200);
  // Ученик не может стать админом через обычный API академии
  const r = fakeRes(); await s.academyApi.traderId(fakeReq({ token: "testtoken-stud", body: { traderId: "12345678", role: "super_admin" } }), r);
  assert.equal(s.db.dump("users").stud.role, "mentor");
  const log = s.db.dump("audit_logs"); assert.ok(Object.values(log).some(l => l.action === "user.role" && l.target_id === "stud" && l.details.to === "mentor"));
});

test("блокировка: заблокированный не получает данные академии и админки; равного по роли блокировать нельзя", async () => {
  const s = setup(); await s.user("adm", "admin"); await s.user("adm2", "admin"); await s.user("stud", "student"); await s.user("ment", "mentor");
  assert.equal((await s.A("POST", "/users/stud/block", { uid: "adm", body: { blocked: true, reason: "спам" } })).statusCode, 200);
  const r = fakeRes(); await s.academyApi.me(fakeReq({ token: "testtoken-stud" }), r);
  assert.deepEqual([r.statusCode, r.body.error], [403, "ACCOUNT_BLOCKED"]);
  assert.equal((await s.L("GET", "/learn/courses", { uid: "stud" })).statusCode, 403);
  assert.equal((await s.A("POST", "/users/adm2/block", { uid: "adm", body: { blocked: true } })).statusCode, 403);
  assert.equal((await s.A("POST", "/users/ment/block", { uid: "adm", body: { blocked: true } })).statusCode, 200);
  assert.equal((await s.A("GET", "/me", { uid: "ment" })).statusCode, 403);
  assert.equal((await s.A("POST", "/users/stud/block", { uid: "adm", body: { blocked: false } })).statusCode, 200);
  const r2 = fakeRes(); await s.academyApi.me(fakeReq({ token: "testtoken-stud" }), r2); assert.equal(r2.statusCode, 200);
});

/* ---------- CMS ---------- */
test("CMS: курс, модуль, урок; неверный блок → 400 с полем; удалённые блоки не возвращаются", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const { c, l } = await makeCourse(s);
  const bad = await s.A("PUT", `/lessons/${l}`, { uid: "boss", body: { title: "x", blocks: [{ type: "quiz", questions: [{ q: "?", options: ["a"], correct: 0 }] }] } });
  assert.equal(bad.statusCode, 400); assert.match(bad.body.field, /blocks\[0\]/);
  const bad2 = await s.A("PUT", `/lessons/${l}`, { uid: "boss", body: { title: "x", blocks: [{ type: "video", url: "javascript:alert(1)" }] } });
  assert.equal(bad2.statusCode, 400);
  await s.A("PUT", `/lessons/${l}`, { uid: "boss", body: { title: "Урок 1", blocks: [{ type: "heading", text: "Только он" }] } });
  assert.equal((await s.A("GET", `/lessons/${l}`, { uid: "boss" })).body.lesson.blocks.length, 1);
  const full = (await s.A("GET", `/courses/${c}`, { uid: "boss" })).body;
  assert.equal(full.modules.length, 1); assert.equal(full.modules[0].lessons.length, 1);
});

test("CMS: порядок модулей и уроков; перенос урока в другой модуль; чужие ID отклоняются", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const { c, m, l } = await makeCourse(s);
  const m2 = (await s.A("POST", `/courses/${c}/modules`, { uid: "boss", body: { title: "Модуль 2" } })).body.id;
  assert.equal((await s.A("POST", `/courses/${c}/reorder`, { uid: "boss", body: { modules: [m2, m], lessons: { [m2]: [l], [m]: [] } } })).statusCode, 200);
  const full = (await s.A("GET", `/courses/${c}`, { uid: "boss" })).body;
  assert.deepEqual(full.modules.map(x => x.title), ["Модуль 2", "Модуль 1"]);
  assert.equal(full.modules[0].lessons[0].id, l);
  assert.equal((await s.A("POST", `/courses/${c}/reorder`, { uid: "boss", body: { modules: ["mod_alien000000"] } })).statusCode, 400);
});

test("публикация: только с подтверждением, только уроки «Готов»; черновые правки не видны ученикам до повторной публикации", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const { c, m, l } = await makeCourse(s);
  const l2 = (await s.A("POST", `/modules/${m}/lessons`, { uid: "boss", body: { title: "Черновой урок" } })).body.id;
  assert.equal((await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: {} })).statusCode, 400);
  assert.equal((await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: { confirm: true } })).statusCode, 200);
  assert.ok(s.db.dump("published_lessons")[l]); assert.equal(s.db.dump("published_lessons")[l2], undefined);
  await s.giveAccess("stud", "50000001");
  const course = (await s.L("GET", `/learn/courses/${c}`, { uid: "stud" })).body.course;
  assert.equal(course.total, 1);
  s.advance(60000);                                                                     // правка через минуту после публикации
  await s.A("PUT", `/lessons/${l}`, { uid: "boss", body: { title: "Изменённый", status: "ready", blocks: [{ type: "heading", text: "Новое" }] } });
  assert.equal((await s.L("GET", `/learn/lessons/${l}`, { uid: "stud" })).body.lesson.title, "Урок 1");      // ещё старая версия
  assert.equal((await s.A("GET", `/courses/${c}`, { uid: "boss" })).body.has_unpublished_changes, true);
  s.advance(1000);
  await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: { confirm: true } });
  assert.equal((await s.L("GET", `/learn/lessons/${l}`, { uid: "stud" })).body.lesson.title, "Изменённый");
  await s.A("POST", `/courses/${c}/unpublish`, { uid: "boss", body: { confirm: true } });
  assert.equal((await s.L("GET", `/learn/courses`, { uid: "stud" })).body.courses.length, 0);
  assert.equal((await s.L("GET", `/learn/lessons/${l}`, { uid: "stud" })).statusCode, 404);
});

test("публикация без готовых уроков → 409; удаление опубликованного курса запрещено", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const c = (await s.A("POST", "/courses", { uid: "boss", body: { title: "Пустой" } })).body.id;
  assert.equal((await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: { confirm: true } })).statusCode, 409);
  const k = await makeCourse(s);
  await s.A("POST", `/courses/${k.c}/publish`, { uid: "boss", body: { confirm: true } });
  assert.equal((await s.A("POST", `/courses/${k.c}/delete`, { uid: "boss", body: { confirm: true } })).statusCode, 409);
});

test("отложенная публикация: до даты ученик не видит курс, сотрудник видит", async () => {
  const s = setup(); await s.user("boss", "super_admin"); await s.user("team", "team_member");
  const { c, l } = await makeCourse(s);
  const when = new Date(s.now() + 3 * 86400000).toISOString();
  await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: { confirm: true, visible_from: when } });
  await s.giveAccess("stud", "50000002");
  assert.equal((await s.L("GET", "/learn/courses", { uid: "stud" })).body.courses.length, 0);
  assert.equal((await s.L("GET", "/learn/courses", { uid: "team" })).body.courses.length, 1);
  // Не только просмотр, но и тест/завершение должны уважать отложенную публикацию.
  assert.equal((await s.L("POST", `/learn/lessons/${l}/quiz`, { uid: "stud", body: { answers: [1, 0] } })).statusCode, 404);
  assert.equal((await s.L("POST", `/learn/lessons/${l}/complete`, { uid: "stud" })).statusCode, 404);
  s.advance(3 * 86400000 + 1);
  assert.equal((await s.L("GET", "/learn/courses", { uid: "stud" })).body.courses.length, 1);
});

/* ---------- Обучение ---------- */
test("обучение: без открытой академии — 403; ответы тестов скрыты; проверка на сервере; завершение требует теста", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const { c, l } = await makeCourse(s);
  await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: { confirm: true } });
  const r0 = fakeRes(); await s.academyApi.me(fakeReq({ token: "testtoken-noaccess" }), r0);
  assert.equal((await s.L("GET", "/learn/courses", { uid: "noaccess" })).statusCode, 403);
  await s.giveAccess("stud", "50000003");
  const les = (await s.L("GET", `/learn/lessons/${l}`, { uid: "stud" })).body.lesson;
  const quiz = les.blocks.find(b => b.type === "quiz");
  assert.equal(JSON.stringify(quiz).includes("correct"), false); assert.equal(JSON.stringify(quiz).includes("Так."), false);
  assert.equal((await s.L("POST", `/learn/lessons/${l}/complete`, { uid: "stud" })).statusCode, 409);
  const bad = await s.L("POST", `/learn/lessons/${l}/quiz`, { uid: "stud", body: { answers: [0, 1] } });
  assert.deepEqual([bad.body.percent, bad.body.passed], [0, false]);
  const good = await s.L("POST", `/learn/lessons/${l}/quiz`, { uid: "stud", body: { answers: [1, 0] } });
  assert.deepEqual([good.body.percent, good.body.passed, good.body.results[0].explanation], [100, true, "Так."]);
  assert.equal((await s.L("POST", `/learn/lessons/${l}/complete`, { uid: "stud" })).statusCode, 200);
  const course = (await s.L("GET", `/learn/courses/${c}`, { uid: "stud" })).body.course;
  assert.deepEqual([course.completed, course.percent], [1, 100]);
  assert.equal(s.db.dump("lesson_progress")[`stud__${l}`].quiz.attempts, 2);
});

/* ---------- Медиа ---------- */
test("медиа: принимаются только разрешённые форматы с верной сигнатурой; SVG/HTML отклоняются; размер ограничен", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const up = (ct, body) => s.A("POST", "/media", { uid: "boss", body, headers: { "content-type": ct, "x-file-name": encodeURIComponent("схема.png") } });
  assert.equal((await up("image/svg+xml", Buffer.from("<svg onload=alert(1)>"))).body.error, "UNSUPPORTED_TYPE");
  assert.equal((await up("text/html", Buffer.from("<html>"))).body.error, "UNSUPPORTED_TYPE");
  assert.equal((await up("image/png", Buffer.from("<html>not png"))).body.error, "BAD_SIGNATURE");
  assert.equal((await up("image/png", Buffer.concat([PNG, Buffer.alloc(9 << 20)]))).body.error, "TOO_LARGE");
  const ok = await up("image/png", PNG);
  assert.equal(ok.statusCode, 200); assert.match(ok.body.url, /^\/media\/med_[a-f0-9]{20}$/);
  const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  await s.learnApi.media({ params: { id: ok.body.id } }, res);
  assert.equal(res.code, 200); assert.equal(res.headers["Content-Type"], "image/png"); assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
});

test("медиа: удаление используемого файла запрещено (409 со списком); после освобождения — удаляется", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  const id = (await s.A("POST", "/media", { uid: "boss", body: PNG, headers: { "content-type": "image/png" } })).body.id;
  const c = (await s.A("POST", "/courses", { uid: "boss", body: { title: "С обложкой", cover_media_id: id } })).body.id;
  const r = await s.A("POST", `/media/${id}/delete`, { uid: "boss" });
  assert.equal(r.statusCode, 409); assert.equal(r.body.used[0].id, c);
  await s.A("PUT", `/courses/${c}`, { uid: "boss", body: { title: "Без обложки" } });
  assert.equal((await s.A("POST", `/media/${id}/delete`, { uid: "boss" })).statusCode, 200);
  assert.equal(s.storage.files.size, 0);
});

test("медиа: без настроенного хранилища загрузка — 503 с понятным сообщением", async () => {
  const s = setup({ storage: null }); await s.user("boss", "super_admin");
  const r = await s.A("POST", "/media", { uid: "boss", body: PNG, headers: { "content-type": "image/png" } });
  assert.deepEqual([r.statusCode, r.body.error], [503, "STORAGE_UNAVAILABLE"]);
});

/* ---------- Афиши ---------- */
test("афиши: модератор создаёт черновик, публикует только админ с подтверждением; показ по аудитории и датам", async () => {
  const s = setup(); await s.user("mod", "moderator"); await s.user("boss", "super_admin");
  const draft = await s.A("POST", "/announcements", { uid: "mod", body: { title: "Эфир", status: "draft", audience: "access" } });
  assert.equal(draft.statusCode, 200);
  assert.equal((await s.A("PUT", `/announcements/${draft.body.id}`, { uid: "mod", body: { title: "Эфир", status: "published" } })).statusCode, 403);
  // Модератор не может опубликовать афишу и сразу при создании — даже с подтверждением
  const direct = await s.A("POST", "/announcements", { uid: "mod", body: { title: "Сразу в эфир", status: "published", confirm: true } });
  assert.equal(direct.statusCode, 403);
  assert.equal((await s.A("GET", "/announcements", { uid: "boss" })).body.announcements.some(a => a.title === "Сразу в эфир"), false);
  assert.equal((await s.A("PUT", `/announcements/${draft.body.id}`, { uid: "boss", body: { title: "Эфир", status: "published", audience: "access" } })).statusCode, 400);
  assert.equal((await s.A("PUT", `/announcements/${draft.body.id}`, { uid: "boss", body: { title: "Эфир", status: "published", audience: "access", confirm: true } })).statusCode, 200);
  const future = new Date(s.now() + 86400000).toISOString();
  await s.A("POST", "/announcements", { uid: "boss", body: { title: "Позже", status: "published", show_from: future, confirm: true } });
  await s.A("POST", "/announcements", { uid: "boss", body: { title: "Для новичков", status: "published", audience: "no_access", confirm: true } });
  await s.A("POST", "/announcements", { uid: "boss", body: { title: "Архив", status: "archived" } });
  await s.giveAccess("stud", "50000004");
  assert.deepEqual((await s.L("GET", "/announcements", { uid: "stud" })).body.announcements.map(a => a.title), ["Эфир"]);
  const r0 = fakeRes(); await s.academyApi.me(fakeReq({ token: "testtoken-newbie" }), r0);
  assert.deepEqual((await s.L("GET", "/announcements", { uid: "newbie" })).body.announcements.map(a => a.title), ["Для новичков"]);
  assert.equal((await s.A("POST", "/announcements", { uid: "boss", body: { title: "x", cta_url: "http://insecure.example" } })).statusCode, 400);
});

/* ---------- Dashboard ---------- */
test("dashboard: только реальные данные — пользователи, активации, контент, прогресс", async () => {
  const s = setup(); await s.user("boss", "super_admin");
  await s.giveAccess("stud", "50000005");
  const r0 = fakeRes(); await s.academyApi.me(fakeReq({ token: "testtoken-waiting" }), r0);
  await s.academyApi.click(fakeReq({ token: "testtoken-waiting" }), fakeRes());
  const { c, l } = await makeCourse(s);
  await s.A("POST", `/courses/${c}/publish`, { uid: "boss", body: { confirm: true } });
  await s.L("POST", `/learn/lessons/${l}/quiz`, { uid: "stud", body: { answers: [1, 0] } });
  await s.L("POST", `/learn/lessons/${l}/complete`, { uid: "stud" });
  const d = (await s.A("GET", "/dashboard", { uid: "boss" })).body;
  assert.equal(d.users.total, 3);
  assert.deepEqual(d.academy, { activated: 1, trader_bound: 1, ftd_confirmed: 1, awaiting_deposit: 0 });
  assert.deepEqual([d.content.courses, d.content.courses_published, d.content.lessons], [1, 1, 1]);
  assert.deepEqual([d.learning.lessons_completed, d.learning.learners], [1, 1]);
  assert.equal(d.charts.registrations.length, 30);
});

/* ---------- Импорт и аудит ---------- */
test("импорт курса: только с подтверждением, всё как черновик, без публикации; журнал действий", async () => {
  const s = setup(); await s.user("boss", "super_admin"); await s.user("ment", "mentor");
  const data = { course: { title: "Импорт" }, modules: [{ title: "М1", lessons: [{ title: "У1", status: "ready", blocks: [{ type: "heading", text: "Привет" }] }] }] };
  assert.equal((await s.A("POST", "/import/course", { uid: "ment", body: { confirm: true, data } })).statusCode, 403);
  assert.equal((await s.A("POST", "/import/course", { uid: "boss", body: { data } })).statusCode, 400);
  const r = await s.A("POST", "/import/course", { uid: "boss", body: { confirm: true, data } });
  assert.deepEqual([r.statusCode, r.body.lessons], [200, 1]);
  assert.equal(Object.values(s.db.dump("course_lessons"))[0].status, "draft");          // «ready» из файла не принимается
  assert.equal(Object.keys(s.db.dump("published_courses")).length, 0);
  const logs = (await s.A("GET", "/audit", { uid: "boss" })).body.logs.map(l => l.action);
  assert.ok(logs.includes("course.import"));
});

test("журнал: каждое изменение пользователя и контента записывается с автором", async () => {
  const s = setup(); await s.user("boss", "super_admin"); await s.user("stud", "student");
  await makeCourse(s);
  await s.A("POST", "/users/stud/role", { uid: "boss", body: { role: "streamer" } });
  await s.A("POST", "/users/stud/block", { uid: "boss", body: { blocked: true } });
  const acts = Object.values(s.db.dump("audit_logs")).map(l => [l.action, l.actor_uid]);
  for (const a of ["course.create", "module.create", "lesson.create", "lesson.update", "user.role", "user.block"]) assert.ok(acts.some(x => x[0] === a && x[1] === "boss"), a);
});

/* ---------- Telegram ---------- */
function signInit(fields, token) {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort();
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
test("Telegram: подпись initData проверяется по официальному алгоритму; подделка и устаревшие данные отклоняются", () => {
  const token = "123456:TEST_TOKEN_ONLY", nowMs = 1_800_000_000_000;
  const user = JSON.stringify({ id: 777, first_name: "Иван", username: "ivan", photo_url: "https://t.me/i/userpic/1.jpg" });
  const good = signInit({ auth_date: String(Math.floor(nowMs / 1000) - 60), query_id: "AAA", user }, token);
  const v = verifyInitData(good, token, { now: () => nowMs });
  assert.equal(v.ok, true); assert.deepEqual([v.user.id, v.user.username, v.user.name], [777, "ivan", "Иван"]);
  assert.equal(verifyInitData(good.replace("ivan", "evil"), token, { now: () => nowMs }).error, "BAD_SIGNATURE");
  assert.equal(verifyInitData(good, "999:OTHER", { now: () => nowMs }).error, "BAD_SIGNATURE");
  assert.equal(verifyInitData(good, token, { now: () => nowMs + 2 * 86400000 }).error, "EXPIRED");
  assert.equal(verifyInitData(good, "", {}).error, "NOT_CONFIGURED");
  assert.equal(verifyInitData("user=%7B%7D", token, {}).error, "INVALID");
});
