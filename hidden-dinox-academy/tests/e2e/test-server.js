"use strict";
/* Тестовый сервер для сквозных проверок интерфейса (только для тестов, не для production).
   Настоящие обработчики academy/api.js и academy/postback.js + тестовая Firestore в памяти.
   Служебные /test/* существуют ТОЛЬКО здесь. */
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");
const { FakeFirestore } = require("../helpers/fake-firestore");
const { fakeVerify } = require("../helpers/http");
const { createAcademyApi } = require("../../academy/api");
const { createAcademyPostback } = require("../../academy/postback");
const { createTestDeposit } = require("../../academy/test-deposit");
const { createAdminApi } = require("../../academy/admin-api");
const { createLearnApi } = require("../../academy/learn-api");
const { memoryStorage } = require("../../academy/storage");
const { matcher } = require("../helpers/router");
const { registerBookRoutes } = require("../../academy/books");
const { registerReferralRoutes } = require("../../academy/referral");
const { registerPartnerLinkRoutes } = require("../../academy/partner-links");
const PUB = path.resolve(__dirname, "../../public/academy"), ADMIN = path.resolve(__dirname, "../../public/admin");
const db = new FakeFirestore();
const quiet = { log() {}, warn() {}, error() {} };
if (!process.env.REFERRAL_MODE) process.env.REFERRAL_MODE = "test"; if (!process.env.REFERRAL_PAYOUTS_ENABLED) process.env.REFERRAL_PAYOUTS_ENABLED = "1";   // админка партнёров читает process.env
const api = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet });
const testDeposit = createTestDeposit({ db, secret: "local-test-deposit-secret-only-0001", log: quiet });
const pb = createAcademyPostback({ db, env: { POCKET_POSTBACK_SECRET: "e2e-secret-0123456789abcdef-test" }, log: quiet });
db.latency = Number(process.env.FAKE_FS_LATENCY || 0);   // только для измерений
const storage = memoryStorage();
const adminApi = createAdminApi({ db, verifyIdToken: fakeVerify, storage, log: quiet });
const learnApi = createLearnApi({ db, academyApi: api, storage, log: quiet });
const adminTable = adminApi.ROUTES.map(([m, p, name, perm, mut]) => ({ m, match: matcher(p), h: adminApi.handler(name, perm, mut) }));
const learnTable = learnApi.ROUTES.map(([m, p, name]) => ({ m, match: matcher("/api" + p), h: learnApi.H[name] }));
// Маршруты книги и рефералов — те же функции регистрации, что на сервере (express-подобный адаптер ниже)
const extraTable = [];
const fakeRouter = { get: (p, h) => extraTable.push({ m: "GET", match: matcher("/api" + p), h }), post: (p, h) => extraTable.push({ m: "POST", match: matcher("/api" + p), h }), put: (p, h) => extraTable.push({ m: "PUT", match: matcher("/api" + p), h }) };
registerBookRoutes(fakeRouter, { db, academyApi: api, root: path.resolve(__dirname, "../.."), log: quiet });
registerPartnerLinkRoutes(fakeRouter, { db, academyApi: api, log: quiet });
registerReferralRoutes(fakeRouter, { db, academyApi: api, env: { REFERRAL_MODE: process.env.REFERRAL_MODE || "test", REFERRAL_PAYOUTS_ENABLED: process.env.REFERRAL_PAYOUTS_ENABLED || "1" }, log: quiet });
const expressify = res => { res.status = c => { res.statusCode = c; return res; }; res.set = (k, v) => { if (typeof k === "object") for (const [a, b] of Object.entries(k)) res.setHeader(a, b); else res.setHeader(k, v); return res; };
  res.json = b => { if (!res.headersSent) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(b)); return res; }; return res; };
const readBody = async req => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };
const types = {
  ".mjs": "text/javascript; charset=utf-8", ".pdf": "application/pdf", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };

http.createServer(async (req, res) => {
  if (process.env.MEASURE_LOG) { const t0 = Date.now(), o0 = db.ops || 0; res.on("finish", () => process.stderr.write(`REQ ${req.method} ${req.url.split("?")[0]} ${Date.now() - t0}ms ops=${(db.ops || 0) - o0} t=${t0 % 100000}\n`)); }
  const u = url.parse(req.url, true);
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const xres = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { send(this.statusCode, b); return this; }, set() { return this; } };
  xres.send = function (b) { res.writeHead(this.statusCode, this._h || {}); res.end(b); return this; };
  xres.set = function (k, v) { this._h = { ...(this._h || {}), [k]: v }; return this; };
  xres.end = function () { res.writeHead(this.statusCode); res.end(); return this; };
  try {
    // Админ-API и обучение — те же обработчики и таблицы маршрутов, что на сервере
    const dispatch = async (table, prefix) => {
      for (const r of table) { if (r.m !== req.method) continue; const params = r.match(u.pathname.slice(prefix.length)); if (!params) continue;
        const buf = await readBody(req), ct = String(req.headers["content-type"] || "");
        const body = /json/.test(ct) ? (buf.length ? JSON.parse(buf.toString("utf8")) : {}) : (buf.length ? buf : {});
        await r.h({ params, query: u.query, body, headers: req.headers, ip: "127.0.0.1" }, xres); return true; }
      return false;
    };
    if (u.pathname.startsWith("/admin/api/")) { if (!(await dispatch(adminTable, "/admin/api"))) send(404, { error: "NOT_FOUND" }); return; }
    if (u.pathname === "/api/learn/courses" && global.__failLearn > 0) { global.__failLearn--; return send(503, { error: "UNAVAILABLE" }); }   // временная ошибка Firestore
    if (u.pathname.startsWith("/api/learn/books") || u.pathname.startsWith("/api/referral/") || u.pathname === "/api/via/attach" || u.pathname === "/api/broker-link") {
      for (const r of extraTable) { if (r.m !== req.method) continue; const params = r.match(u.pathname); if (!params) continue;
        const buf = await readBody(req); const body = buf.length && /json/.test(String(req.headers["content-type"] || "")) ? JSON.parse(buf.toString("utf8")) : {};
        return r.h({ params, query: u.query, body, headers: req.headers }, expressify(res)); }
      return send(404, { error: "NOT_FOUND" });
    }
    if (u.pathname.startsWith("/api/learn/") || u.pathname.startsWith("/api/home/") || u.pathname === "/api/announcements") { if (!(await dispatch(learnTable, ""))) send(404, { error: "NOT_FOUND" }); return; }
    if (u.pathname.startsWith("/media/")) return learnApi.media({ params: { id: u.pathname.slice(7) } }, xres);
    if (u.pathname === "/test/fail-learn") { global.__failLearn = Number(u.query.n || 1); return send(200, { ok: true }); }
    if (u.pathname === "/test/ops") return send(200, { ops: db.ops || 0 });
    if (u.pathname === "/test/ops-reset") { db.ops = 0; return send(200, { ok: true }); }
    if (u.pathname === "/test/role") { await db.collection("users").doc(u.query.uid).set({ role: u.query.role }, { merge: true }); return send(200, { ok: true }); }
    if (u.pathname === "/admin" || u.pathname.startsWith("/admin/")) {
      let p = path.join(ADMIN, decodeURIComponent(u.pathname.slice("/admin/".length)) || "index.html");
      if (!p.startsWith(ADMIN)) return send(403, "forbidden", "text/plain");
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(ADMIN, "index.html");
      return send(200, fs.readFileSync(p), types[path.extname(p)] || "application/octet-stream");
    }
    if (u.pathname.startsWith("/api/") || u.pathname === "/check-deposit" || u.pathname === "/check") {
      let raw = ""; for await (const c of req) raw += c;
      const xreq = { headers: req.headers, body: raw ? JSON.parse(raw) : {}, query: u.query, ip: "127.0.0.1" };
      const h = { "GET /api/me": api.me, "POST /api/click": api.click, "POST /api/trader-id": api.traderId, "POST /api/lang": api.setLang, "GET /check-deposit": api.checkDeposit, "GET /check": api.check }[req.method + " " + u.pathname];
      return h ? h(xreq, xres) : send(404, { error: "NOT_FOUND" });
    }
    if (u.pathname === "/test/postback") { const r = await pb.handle(u.query, { ip: "127.0.0.1" }); return send(200, r); }
    if (u.pathname === "/test/deposit") { const r = await testDeposit(u.query); return send(r.http, { ok: r.http === 200, test: true, status: r.status, message: r.message }); }
    if (u.pathname === "/test/outage") { db.failAll = u.query.on === "1"; return send(200, { failAll: db.failAll }); }
    if (u.pathname === "/test/user") { const users = db.dump("users"); return send(200, users[u.query.uid] || null); }
    if (u.pathname.startsWith("/academy/")) {
      let p = path.join(PUB, decodeURIComponent(u.pathname.slice("/academy/".length)) || "index.html");
      if (!p.startsWith(PUB)) return send(403, "forbidden", "text/plain");
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
      if (!fs.existsSync(p)) return send(404, "not found", "text/plain");
      return send(200, fs.readFileSync(p), types[path.extname(p)] || "application/octet-stream");
    }
    send(404, "not found", "text/plain");
  } catch (e) { send(500, { error: "TEST_SERVER", message: e.message }); }
}).listen(Number(process.env.PORT || 8790), "127.0.0.1", () => console.log("ready"));
