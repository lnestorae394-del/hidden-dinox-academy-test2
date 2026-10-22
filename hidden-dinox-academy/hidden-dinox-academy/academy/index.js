"use strict";
/* HIDDEN DINOX ACADEMY — подключение к существующему серверу AI BOOST.
   Вызывается из server.js одной строкой; старые маршруты не меняются. */
const path = require("path");
const { mountAcademyApi } = require("./api");
const { mountAdminApi } = require("./admin-api");
const { registerLearnRoutes } = require("./learn-api");
const { firebaseStorage } = require("./storage");
const { registerTelegramRoutes } = require("./telegram");
const { createAcademyPostback } = require("./postback");
const { testDepositConfig, createTestDeposit } = require("./test-deposit");
const { resolveTestMode } = require("./test-mode");

function attachAcademy({ app, express, admin, db, env = process.env, log = console, publicDir }) {
  // IP отправителя за прокси Render: включается явно (TRUST_PROXY=1), нужен только для POSTBACK_ALLOWED_IPS
  if (env.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
  // 1) API академии. Без Firebase — честный ответ 503, доступ закрыт.
  const verifyIdToken = db && admin && admin.auth ? t => admin.auth().verifyIdToken(t) : null;
  // Хранилище файлов: Firebase Storage проекта (бакет из Web Config; можно переопределить FIREBASE_STORAGE_BUCKET)
  const storage = db && admin && admin.storage ? firebaseStorage(admin, env.FIREBASE_STORAGE_BUCKET || "ai-boost-10540.firebasestorage.app") : null;
  const authAdmin = db && admin && admin.auth ? admin.auth() : null;
  // 1а) Обучение для учеников (/api/learn/*, /api/announcements, /media/:id) — внутри роутера /api
  mountAcademyApi(app, express, { db, verifyIdToken, log }, (router, academyApi) => {
    registerLearnRoutes(app, router, { db, academyApi, storage, log });
    registerTelegramRoutes(router, { db, academyApi, env });
  });
  // 1б) Админ-панель: API и страницы /admin/ (права проверяет сервер)
  mountAdminApi(app, express, { db, verifyIdToken, storage, authAdmin, log });
  app.use("/admin", express.static(path.join(publicDir, "admin"), {
    index: "index.html",
    setHeaders(res, p) { res.setHeader("Cache-Control", p.endsWith(".html") ? "no-cache" : "public, max-age=3600"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Referrer-Policy", "same-origin"); }
  }));

  // 2) Статика академии: HTML без кеша, остальное — короткий кеш (адреса файлов версионированы)
  app.use("/academy", express.static(path.join(publicDir, "academy"), {
    index: "index.html",
    setHeaders(res, p) {
      res.setHeader("Cache-Control", p.endsWith(".html") ? "no-cache" : "public, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
    }
  }));

  // 3) Обработчик postback для академии (вызывается из существующего /postback)
  const postback = createAcademyPostback({ db, env, log });
  const pc = postback.config;
  if (!pc.secretConfigured) log.warn && log.warn("⚠️ academy: POCKET_POSTBACK_SECRET " + (pc.secretTooShort ? "короче 24 символов" : "не задан") + " — /postback отвечает 503, подтверждения не записываются");
  else log.log && log.log("✅ academy: приём postback включён" + (pc.defaultCurrency ? ", валюта по умолчанию " + pc.defaultCurrency : ", валюта по умолчанию НЕ задана"));
  // 4) ТЕСТОВЫЙ депозит по Trader ID — только в HD_TEST_MODE (эмуляторы). В production маршрута нет.
  const tcfg = testDepositConfig({ testMode: resolveTestMode(env), env });
  if (tcfg.enabled) {
    const testDeposit = createTestDeposit({ db, secret: tcfg.secret, log });
    app.get("/test/deposit", async (req, res) => {
      let r;
      try { r = await testDeposit(req.query || {}); }
      catch (e) { log.error && log.error("test deposit error:", e && (e.code || e.message)); r = { http: 503, status: "db_error", message: "Ошибка Firebase (эмулятор)" }; }
      res.status(r.http).json({ ok: r.http === 200, test: true, status: r.status, message: r.message });
    });
    log.warn && log.warn("🧪 ТЕСТОВЫЙ маршрут /test/deposit включён (только эмулятор Firebase)");
  } else if (env.TEST_POSTBACK_SECRET) {
    log.warn && log.warn("ℹ️ /test/deposit не включён: " + tcfg.reason);
  }
  return { postback };
}

/* Закрывает публичную раздачу файлов ботов из public/bot (сами файлы не трогаем: require читает их с диска).
   Путь декодируется и нормализуется так же, как это делает раздача статики, чтобы /%62ot/… или /x/../bot/… не обходили запрет. */
const BLOCKED_PREFIXES = ["/bot"];
function isBlockedPath(rawPath) {
  let p;
  try { p = decodeURIComponent(rawPath); } catch (e) { return true; }
  p = path.posix.normalize(p.replace(/\\/g, "/")).toLowerCase();
  return BLOCKED_PREFIXES.some(b => p === b || p.startsWith(b + "/"));
}
function blockPrivateStatic(app) {
  app.use((req, res, next) => (isBlockedPath(req.path) ? res.status(404).send("Not found") : next()));
}

module.exports = { attachAcademy, blockPrivateStatic, isBlockedPath };
