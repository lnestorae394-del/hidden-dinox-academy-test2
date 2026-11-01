"use strict";
/* POST /internal/daily/run — подготовка наборов Daily Tests (сегодня и завтра) по расписанию (GitHub Actions).
   Защита: заголовок X-Cron-Secret = DAILY_CRON_SECRET (≥ 24 символов), сравнение за постоянное время.
   Без переменной маршрут выключен (503). Запуск идемпотентен: повтор ничего не дублирует. */
const crypto = require("crypto");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function registerDailyCron(app, { db, env = process.env, log = console, now = () => Date.now() }) {
  const D = require("./daily-tests").createDailyTests({ db, now, log });
  let last = 0;
  app.post("/internal/daily/run", async (req, res) => {
    res.set && res.set("Cache-Control", "no-store");
    const secret = String(env.DAILY_CRON_SECRET || "");
    if (secret.length < 24) return res.status(503).json({ error: "CRON_NOT_CONFIGURED" });
    if (!same(req.get ? req.get("x-cron-secret") || "" : (req.headers || {})["x-cron-secret"] || "", secret)) return res.status(403).json({ error: "FORBIDDEN" });
    if (now() - last < 5000) return res.status(429).json({ error: "TOO_MANY" });
    last = now();
    try { const r = await D.run("cron"); log.log && log.log(`ℹ️ Daily Tests: запуск по расписанию — сегодня ${r.today.status}, завтра ${r.tomorrow.status}`); return res.status(200).json(r); }
    catch (e) { log.error && log.error("Daily Tests: ошибка запуска по расписанию:", (e && (e.code || e.message)) || "error"); return res.status(503).json({ error: "UNAVAILABLE" }); }
  });
}
module.exports = { registerDailyCron };
