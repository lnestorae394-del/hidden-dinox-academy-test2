"use strict";
/* Проверка изоляции: обычный режим не изменился, тестовый — отключает боты, git push и approveTrader. */
const { execFileSync } = require("child_process"), path = require("path");
const run = (env, action = "") => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, "boot-scenario.js"), action],
  { env: { PATH: process.env.PATH, ...env }, encoding: "utf8" }));
const EMU = { HD_TEST_MODE: "1", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", GCLOUD_PROJECT: "demo-hd-academy" };
const out = []; let failed = 0;
const check = (name, ok, info) => { out.push((ok ? "✔ " : "✘ ") + name + (ok ? "" : " — " + JSON.stringify(info))); if (!ok) failed++; };

const prod = run({ FIREBASE_KEY: "{}" }, "redeposit");
check("обычный режим: боты загружаются как раньше", prod.botsLoaded === 2, prod);
check("обычный режим: автосохранение git как раньше", prod.gitIntervals === 1, prod);
check("обычный режим: Firebase с ключом сервисного аккаунта", prod.initArgs && prod.initArgs.credential === true, prod);
check("обычный режим: redeposit по-прежнему вызывает approveTrader", prod.approveCalls === 1, prod);

const test = run(EMU, "redeposit");
check("тестовый режим: сервер запускается", test.started === true, test);
check("тестовый режим: боты НЕ загружаются", test.botsLoaded === 0, test);
check("тестовый режим: git push НЕ запланирован", test.gitIntervals === 0, test);
check("тестовый режим: Firebase только на demo-проекте, без ключа", test.initArgs && test.initArgs.projectId === "demo-hd-academy", test);
check("тестовый режим: redeposit НЕ вызывает approveTrader", test.approveCalls === 0, test);

for (const [name, env] of [["с production FIREBASE_KEY", { ...EMU, FIREBASE_KEY: "{}" }], ["с реальным проектом", { ...EMU, GCLOUD_PROJECT: "ai-boost-10540" }], ["без эмулятора Firestore", { ...EMU, FIRESTORE_EMULATOR_HOST: "" }]]) {
  const r = run(env);
  check("тестовый режим " + name + ": сервер НЕ запускается", r.started === false && r.error === "HD_TEST_MODE_INVALID" && r.botsLoaded === 0, r);
}
console.log(out.join("\n"));
process.exit(failed ? 1 : 0);
