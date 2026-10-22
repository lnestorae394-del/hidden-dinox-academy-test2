"use strict";
/* Idempotent first-deploy seed: imports the book-based course as a DRAFT only.
   It never publishes lessons and never overwrites an existing course with the same slug. */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { initFirebase } = require("../academy/firebase-init");
const { createAdminApi } = require("../academy/admin-api");
const C = require("../academy/content");

async function seedDefaultCourse(db) {
  const file = path.join(__dirname, "..", "content", "hidden-reaction-course.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  C.course(data.course);
  if (!Array.isArray(data.modules) || !data.modules.length) throw new Error("Курс не содержит модулей");
  const existing = await db.collection("courses").where("slug", "==", data.course.slug).limit(1).get();
  if (!existing.empty) {
    console.log("📚 Курс Hidden Reaction уже существует — импорт пропущен.");
    return;
  }
  const api = createAdminApi({ db, verifyIdToken: null, log: console });
  const result = await api.H.importCourse({ body: { confirm: true, data } }, { uid: "system-course-seed", email: "system", role: "super_admin" });
  console.log(`📚 Черновик курса создан: ${data.course.title}; ${result.modules} модулей, ${result.lessons} уроков. Публикация не выполнялась.`);
}

module.exports = { seedDefaultCourse };
