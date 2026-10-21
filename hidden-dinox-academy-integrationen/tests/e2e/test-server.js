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
const PUB = path.resolve(__dirname, "../../public/academy");
const db = new FakeFirestore();
const quiet = { log() {}, warn() {}, error() {} };
const api = createAcademyApi({ db, verifyIdToken: fakeVerify, log: quiet });
const testDeposit = createTestDeposit({ db, secret: "local-test-deposit-secret-only-0001", log: quiet });
const pb = createAcademyPostback({ db, env: { POCKET_POSTBACK_SECRET: "e2e-secret-0123456789abcdef-test" }, log: quiet });
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg" };

http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const xres = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { send(this.statusCode, b); return this; }, set() { return this; } };
  try {
    if (u.pathname.startsWith("/api/")) {
      let raw = ""; for await (const c of req) raw += c;
      const xreq = { headers: req.headers, body: raw ? JSON.parse(raw) : {}, ip: "127.0.0.1" };
      const h = { "GET /api/me": api.me, "POST /api/click": api.click, "POST /api/trader-id": api.traderId }[req.method + " " + u.pathname];
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
