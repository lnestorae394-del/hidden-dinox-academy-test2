/* Подмена firebase-auth.js для тестов: аккаунты и сессия в localStorage, токен "testtoken-<uid>" */
const K = "fakeFbAccounts", S = "fakeFbSession";
const accounts = () => JSON.parse(localStorage.getItem(K) || "{}");
const uidOf = email => email.toLowerCase().replace(/[^a-z0-9]/g, "_");
const mkUser = email => ({ email, uid: uidOf(email), getIdToken: async () => "testtoken-" + uidOf(email) });
const err = code => Object.assign(new Error(code), { code });
export function getAuth() {
  if (!window.__fakeAuth) { const s = localStorage.getItem(S); window.__fakeAuth = { currentUser: s ? mkUser(s) : null, languageCode: null }; }
  return window.__fakeAuth;
}
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(auth.currentUser), 30); return () => {}; }
export async function createUserWithEmailAndPassword(auth, email, pw) {
  if (window.__fakeNetDown) throw err("auth/network-request-failed");
  const a = accounts(); if (a[email.toLowerCase()]) throw err("auth/email-already-in-use");
  if (pw.length < 6) throw err("auth/weak-password");
  a[email.toLowerCase()] = pw; localStorage.setItem(K, JSON.stringify(a));
  localStorage.setItem(S, email.toLowerCase()); auth.currentUser = mkUser(email.toLowerCase());
}
export async function signInWithEmailAndPassword(auth, email, pw) {
  const a = accounts(); if (a[email.toLowerCase()] !== pw) throw err("auth/invalid-credential");
  localStorage.setItem(S, email.toLowerCase()); auth.currentUser = mkUser(email.toLowerCase());
}
export async function signOut(auth) { localStorage.removeItem(S); auth.currentUser = null; }
export async function sendPasswordResetEmail(auth, email) { window.__resetSentTo = email; }
export function connectAuthEmulator(auth, url) { window.__emulatorUrl = url; }
