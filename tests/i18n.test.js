"use strict";
/* Переводы курса Hidden Reaction (EN, UA): node --test tests/i18n.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./helpers/fake-firestore");
const { fakeVerify, fakeRes, fakeReq } = require("./helpers/http");
const { adminCaller, learnCaller } = require("./helpers/router");
const { createAdminApi } = require("../academy/admin-api");
const { createLearnApi } = require("../academy/learn-api");
const { createAcademyApi } = require("../academy/api");
const { createAcademyPostback } = require("../academy/postback");
const COURSE = require("../content/hidden-reaction-course.json");
const SECRET = "test-postback-secret-0123456789abcdef", quiet = { log() {}, warn() {}, error() {} };
const CYR = /[А-Яа-яЁёІіЇїЄєҐґ]/;

function setup() {
  const db = new FakeFirestore();
  const academyApi = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet });
  const A = adminCaller(createAdminApi({ db, verifyIdToken: fakeVerify, log: quiet }));
  const L = learnCaller(createLearnApi({ db, academyApi, log: quiet }));
  const pb = createAcademyPostback({ db, env: { POCKET_POSTBACK_SECRET: SECRET }, log: quiet });
  async function student(uid, trader) {
    await academyApi.me(fakeReq({ token: "testtoken-" + uid }), fakeRes());
    await pb.handle({ type: "registration", trader_id: trader, secret: SECRET });
    await academyApi.traderId(fakeReq({ token: "testtoken-" + uid, body: { traderId: trader } }), fakeRes());
    await pb.handle({ type: "ftd", trader_id: trader, amount: "60", currency: "USD", secret: SECRET });
  }
  async function publishAll(data) {
    await db.collection("users").doc("boss").set({ role: "super_admin" });
    const imp = await A("POST", "/import/course", { uid: "boss", body: { confirm: true, data } });
    assert.equal(imp.statusCode, 200, JSON.stringify(imp.body));
    await A("POST", `/courses/${imp.body.course_id}/ready-all`, { uid: "boss", body: { confirm: true } });
    assert.equal((await A("POST", `/courses/${imp.body.course_id}/publish`, { uid: "boss", body: { confirm: true } })).statusCode, 200);
    return imp.body.course_id;
  }
  return { db, A, L, student, publishAll };
}
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === "tr" ? undefined : v)));

test("все 29 уроков на EN и UA переведены полностью; в английской выдаче нет кириллицы; правильных ответов нет", async () => {
  const s = setup(); const cid = await s.publishAll(COURSE); await s.student("stu", "71000001");
  const tree = (await s.L("GET", `/learn/courses/${cid}?lang=en`, { uid: "stu" })).body.course;
  assert.equal(tree.title, "HIDDEN DINOX — The Hidden Reaction System");
  assert.equal(tree.modules[0].title, "Foundations of the Hidden Reaction system");
  assert.equal(tree.translation.complete, true);
  const list = (await s.L("GET", "/learn/courses?lang=ua", { uid: "stu" })).body;
  for (const [name, body] of [["дерево курса", tree], ["список курсов", list]]) assert.equal(JSON.stringify(body).includes('"tr":'), false, name + ": служебное поле переводов не отдаётся");
  const ids = tree.modules.flatMap(m => m.lessons.map(l => l.id)); assert.equal(ids.length, 29);
  for (const lang of ["en", "ua"]) for (const id of ids) {
    const r = (await s.L("GET", `/learn/lessons/${id}?lang=${lang}`, { uid: "stu" })).body;
    assert.equal(r.lesson.translation.complete, true, `${lang} ${id}: не хватает ${r.lesson.translation.missing}`);
    const qs = r.lesson.blocks.filter(b => b.type === "quiz").flatMap(b => b.questions);
    assert.ok(qs.every(q => !("correct" in q) && !("explanation" in q)), "ответы скрыты");
    if (lang === "en") assert.equal(CYR.test(JSON.stringify([r.lesson, r.nav])), false, "кириллица в EN: " + id);
    assert.equal("tr" in r.lesson, false);
  }
});

test("русский по умолчанию и при неизвестном языке; поле переводов не отдаётся", async () => {
  const s = setup(); const cid = await s.publishAll(COURSE); await s.student("stu", "71000002");
  const id = (await s.L("GET", `/learn/courses/${cid}`, { uid: "stu" })).body.course.modules[0].lessons[0].id;
  for (const q of ["", "?lang=ru", "?lang=de", "?lang=__proto__"]) {
    const r = (await s.L("GET", `/learn/lessons/${id}${q}`, { uid: "stu" })).body.lesson;
    assert.equal(r.title, "Рынок не хаос: идея системы", q); assert.equal("tr" in r, false);
  }
});

test("тест: оценка одинакова на любом языке, объяснения на языке ученика; прогресс общий для всех языков", async () => {
  const s = setup(); const cid = await s.publishAll(COURSE); await s.student("stu", "71000003");
  const id = (await s.L("GET", `/learn/courses/${cid}`, { uid: "stu" })).body.course.modules[0].lessons[0].id;
  const qb = COURSE.modules[0].lessons[0].blocks.find(b => b.type === "quiz");
  const right = qb.questions.map(q => q.correct), wrong = qb.questions.map(q => (q.correct + 1) % q.options.length);
  const ru = (await s.L("POST", `/learn/lessons/${id}/quiz`, { uid: "stu", body: { block_id: null, answers: wrong } })).body;
  const en = (await s.L("POST", `/learn/lessons/${id}/quiz`, { uid: "stu", body: { block_id: null, answers: wrong, lang: "en" } })).body;
  assert.deepEqual([ru.score, ru.percent, ru.passed], [en.score, en.percent, en.passed]);
  assert.match(en.results[0].explanation, /^P\. 3/); assert.match(ru.results[0].explanation, /^Стр\. 3/);
  const ua = (await s.L("POST", `/learn/lessons/${id}/quiz`, { uid: "stu", body: { answers: right, lang: "ua" } })).body;
  assert.equal(ua.passed, true); assert.match(ua.results[0].explanation, /^Стор\. 3/);
  await s.L("POST", `/learn/lessons/${id}/complete`, { uid: "stu", body: {} });
  for (const lang of ["ru", "en", "ua"]) assert.equal((await s.L("GET", `/learn/courses/${cid}?lang=${lang}`, { uid: "stu" })).body.course.completed, 1, lang);
});

test("правка русского текста: устаревший перевод не показывается (русский + пометка), остальное остаётся переведённым; переводы не теряются при сохранении", async () => {
  const s = setup(); const cid = await s.publishAll(COURSE); await s.student("stu", "71000004");
  const lid = (await s.A("GET", "/courses/" + cid, { uid: "boss" })).body.modules[0].lessons[0].id;
  const les = (await s.A("GET", "/lessons/" + lid, { uid: "boss" })).body.lesson;
  const ti = les.blocks.findIndex(b => b.type === "text");
  les.blocks[ti].text = "Новый русский текст объяснения.";
  assert.equal((await s.A("PUT", "/lessons/" + lid, { uid: "boss", body: { title: les.title, outcome: les.outcome, source_pages: les.source_pages, status: "ready", pass_criteria: les.pass_criteria, blocks: les.blocks } })).statusCode, 200);
  assert.ok((await s.db.collection("course_lessons").doc(lid).get()).data().tr.en, "переводы сохранились после правки");
  await s.A("POST", `/courses/${cid}/publish`, { uid: "boss", body: { confirm: true } });
  const r = (await s.L("GET", `/learn/lessons/${lid}?lang=en`, { uid: "stu" })).body.lesson;
  assert.equal(r.blocks[ti].text, "Новый русский текст объяснения.");
  assert.deepEqual([r.translation.complete, r.translation.missing], [false, 1]);
  assert.equal(r.title, "The market is not chaos: the idea of the system");
});

test("«Обновить переводы»: курс без переводов получает их без смены ID и прогресса; несовпадение пропускается с объяснением; только с правами и подтверждением", async () => {
  const s = setup(); const cid = await s.publishAll(strip(COURSE)); await s.student("stu", "71000005");
  const lid = (await s.L("GET", `/learn/courses/${cid}`, { uid: "stu" })).body.course.modules[0].lessons[0].id;
  await s.L("POST", `/learn/lessons/${lid}/quiz`, { uid: "stu", body: { answers: COURSE.modules[0].lessons[0].blocks.find(b => b.type === "quiz").questions.map(q => q.correct) } });
  await s.L("POST", `/learn/lessons/${lid}/complete`, { uid: "stu", body: {} });
  const before = (await s.L("GET", `/learn/lessons/${lid}?lang=en`, { uid: "stu" })).body.lesson;
  assert.equal(before.title, "Рынок не хаос: идея системы"); assert.equal(before.translation.complete, false);
  await s.db.collection("users").doc("adm").set({ role: "mentor" });
  assert.equal((await s.A("POST", "/import/translations", { uid: "adm", body: { confirm: true, data: COURSE } })).statusCode, 403);
  assert.equal((await s.A("POST", "/import/translations", { uid: "boss", body: { data: COURSE } })).statusCode, 400);
  const changed = JSON.parse(JSON.stringify(COURSE)); changed.modules[5].lessons[0].title = "Другое название";
  const r = await s.A("POST", "/import/translations", { uid: "boss", body: { confirm: true, data: changed } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.lessons, 28); assert.equal(r.body.skipped.length, 1); assert.match(r.body.skipped[0], /6\.1/);
  await s.A("POST", `/courses/${cid}/publish`, { uid: "boss", body: { confirm: true } });
  const after = (await s.L("GET", `/learn/lessons/${lid}?lang=en`, { uid: "stu" })).body;
  assert.equal(after.lesson.id, lid); assert.equal(after.lesson.title, "The market is not chaos: the idea of the system"); assert.equal(after.lesson.translation.complete, true);
  assert.equal(after.progress.completed, true);                                                        // прогресс на месте
  const audit = (await s.db.collection("audit_logs").get()).docs.map(d => d.data().action); assert.ok(audit.includes("course.translations"));
});

test("переводы проверяются: неверный ключ или не-строка отклоняются", () => {
  const C = require("../academy/content");
  assert.throws(() => C.lesson({ title: "x", tr: { en: { "../x": "a" } } }), C.ValidationError);
  assert.throws(() => C.lesson({ title: "x", tr: { en: { title: 5 } } }), C.ValidationError);
  assert.throws(() => C.lesson({ title: "x", tr: "строка" }), C.ValidationError);
  assert.deepEqual(C.lesson({ title: "x", tr: { en: { title: "X" }, src: { title: C.trHash("x") } } }).tr, { en: { title: "X" }, src: { title: C.trHash("x") } });
});
