/* HIDDEN DINOX ACADEMY — связь с Firebase Authentication и сервером.

   Источник истины — сервер (/api/*). Клиент ничего не решает о доступе:
   этап, статусы и сумма приходят только в ответе сервера, проверенном по ID-токену.

   Коды ошибок для интерфейса: EMAIL_EXISTS, BAD_CREDENTIALS, WEAK_PASSWORD, INVALID_EMAIL,
   TOO_MANY, NETWORK, UNAUTHENTICATED, TRADER_TAKEN, ID_LOCKED, INVALID, UNAVAILABLE, GENERIC. */

const fbReady = new Promise((resolve, reject) => {
  window.__hdFbResolve = resolve;
  window.__hdFbReject = reject;
  setTimeout(() => reject({ code: "NETWORK" }), 15000); // Firebase не загрузился — не ждём бесконечно
});
fbReady.catch(() => {});

function fbError(e) {
  const c = (e && e.code) || "";
  if (c === "auth/email-already-in-use") return { code: "EMAIL_EXISTS" };
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(c)) return { code: "BAD_CREDENTIALS" };
  if (c === "auth/weak-password") return { code: "WEAK_PASSWORD" };
  if (c === "auth/invalid-email") return { code: "INVALID_EMAIL" };
  if (c === "auth/too-many-requests") return { code: "TOO_MANY" };
  if (c === "auth/network-request-failed") return { code: "NETWORK" };
  if (c && !c.startsWith("auth/")) return { code: c };
  return { code: "GENERIC" };
}

async function fb() { return fbReady; }

async function idToken() {
  const f = await fb();
  const u = f.auth.currentUser;
  if (!u) throw { code: "UNAUTHENTICATED" };
  try { return await u.getIdToken(); } catch (e) { throw fbError(e); }
}

async function call(method, path, body) {
  const token = await idToken();
  let r;
  try {
    r = await fetch(CONFIG.apiBase + path, {
      method, cache: "no-store", credentials: "same-origin",
      headers: Object.assign({ Authorization: "Bearer " + token }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw { code: "NETWORK" }; }
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw { code: (j && typeof j.error === "string" && j.error) || "UNAVAILABLE" };
  if (!j || typeof j !== "object") throw { code: "UNAVAILABLE" };
  return j;
}

const api = {
  async signUp(email, password) {
    const f = await fb();
    try { await f.createUserWithEmailAndPassword(f.auth, email, password); } catch (e) { throw fbError(e); }
    return call("GET", "/api/me");
  },
  async signIn(email, password) {
    const f = await fb();
    try { await f.signInWithEmailAndPassword(f.auth, email, password); } catch (e) { throw fbError(e); }
  },
  async signOut() {
    try { const f = await fb(); await f.signOut(f.auth); } catch (e) {}
  },
  async resetPassword(email) {
    const f = await fb();
    f.auth.languageCode = lang === "ua" ? "uk" : lang;
    try { await f.sendPasswordResetEmail(f.auth, email); }
    catch (e) {
      const m = fbError(e);
      if (m.code === "BAD_CREDENTIALS") return true; // не раскрываем, есть ли такой email
      throw m;
    }
    return true;
  },
  getProfile() { return call("GET", "/api/me"); },
  async getClickId() { const j = await call("POST", "/api/click"); if (!j.clickId) throw { code: "UNAVAILABLE" }; return j.clickId; },
  submitTraderId(traderId) { return call("POST", "/api/trader-id", { traderId }); },
  /* Статус депозита — по Trader ID текущего пользователя (сервер берёт ID из привязки к аккаунту) */
  async getDepositStatus() {
    const p = await call("GET", "/check-deposit");
    return { state: p.state, brokerRegistrationConfirmed: p.brokerRegistrationConfirmed === true,
      firstDeposit: p.firstDeposit || null, academyAccess: p.academyAccess === true, traderId: p.traderId,
      traderIdLocked: p.traderIdLocked === true, stage: p.stage };
  }
};
