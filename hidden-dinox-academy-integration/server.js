const express = require("express");
const fs = require("fs");
const simpleGit = require("simple-git");

const app = express();
const git = simpleGit();

/* HIDDEN DINOX ACADEMY: изолированный тестовый режим (только эмуляторы Firebase, см. academy/test-mode.js).
   Без HD_TEST_MODE поведение сервера не меняется. При неверной настройке — остановка. */
const HD_TEST_MODE = require("./academy/test-mode").resolveTestMode(process.env);
if(HD_TEST_MODE) console.log("🧪 HD_TEST_MODE: эмуляторы Firebase, боты/git/approveTrader отключены");

const PARTNER_BOT_ADMIN = 838408932; // твой телеграм

let approvedDeposits = {};

/* =========================
LOAD APPROVED
========================= */

try{
const data = fs.readFileSync("approved.json","utf8");
approvedDeposits = JSON.parse(data);
console.log("💾 approved loaded");
}catch(e){
console.log("⚠️ approved.json not found");
}

/* =========================
ERROR HANDLERS
========================= */

process.on("uncaughtException", err => {
console.error("UNCAUGHT EXCEPTION", err);
});

process.on("unhandledRejection", err => {
console.error("UNHANDLED REJECTION", err);
});

app.use(express.json());

let clickPartners = {};
let traderPartners = {};
let partnerStats = {};


/* =========================
   FIREBASE
========================= */

const admin = require("firebase-admin");

let db = null;

try{

if(HD_TEST_MODE){
// Эмуляторы: Admin SDK сам подключается по FIRESTORE_EMULATOR_HOST и FIREBASE_AUTH_EMULATOR_HOST
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}else{
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
credential: admin.credential.cert(serviceAccount)
});
}

db = admin.firestore();

console.log("🔥 Firebase connected");

}catch(e){

console.log("⚠️ Firebase disabled (serviceAccountKey.json not found)");

}


/* =========================
   RAM БАЗА
========================= */

let registeredUsers = {};
let deposits = {};

try{
const data = fs.readFileSync("deposits.json","utf8");
deposits = JSON.parse(data);
console.log("💾 deposits loaded");
}catch(e){
console.log("⚠️ deposits.json not found");
}

/* =========================
   STATS LOAD
========================= */

let stats = 
{"users":166259,"profit":320236555,"win":75,"loss":25,"time":"20:00"}

try{
const data = fs.readFileSync("stats.json","utf8");
stats = JSON.parse(data);
console.log("📊 stats loaded");
}catch(e){
console.log("⚠️ stats.json not found, creating...");
fs.writeFileSync("stats.json", JSON.stringify(stats,null,2));
}

function saveStats(){
try{

const tmp = "stats.tmp";

fs.writeFileSync(tmp, JSON.stringify(stats,null,2));
fs.renameSync(tmp, "stats.json");

}catch(e){
console.log("stats save error", e);
}
}

let liveTrades = [];
let totalTrades = 0;

let winChance = 0.74;

const DEV_MODE = true;


/* =========================
   STATIC
========================= */

/* =========================
   HIDDEN DINOX ACADEMY
   (закрывает public/bot, подключает /api и /academy; старые маршруты не меняются)
========================= */

const { attachAcademy, blockPrivateStatic } = require("./academy");
blockPrivateStatic(app);
const academy = attachAcademy({
app, express, admin, db,
publicDir: require("path").join(__dirname, "public")
});

app.set("etag", true);

app.use(express.static("public", {
  maxAge: "6h"
}));


/* =========================
   CLEAN ROUTES (без .html)
========================= */

const path = require("path");

const pages = [
"index",
"login",
"register",
"signals",
"history",
"rules",
"deposit",
"pocket",
"instruction",
"delete",
"about",

];

pages.forEach(page=>{

app.get("/"+page,(req,res)=>{
res.sendFile(path.join(__dirname,"public",page+".html"));
});

});


/* =========================
   DEV DEPOSIT
========================= */

app.get("/dev-deposit",(req,res)=>{

const adminKey = req.query.key;

if(!process.env.DEV_KEY || adminKey !== process.env.DEV_KEY){
return res.send("forbidden");
}

const trader = req.query.trader_id;
const amount = parseFloat(req.query.amount || 25);

if(trader){

if(!deposits[trader] || amount > deposits[trader]){
deposits[trader] = amount;
}


console.log("🧪 TEST депозит:",trader,"+",amount);

}

res.send("ok");

});



/* =========================
   РЕАЛ ДЕПОЗИТ
========================= */

app.get("/deposit",(req,res)=>{

const trader = req.query.trader_id;
const amount = parseFloat(req.query.amount || 0);

if(trader && amount){

deposits[trader] = amount;

console.log("💰 депозит:",trader,"+",amount);

}

res.send("OK");

});


app.get("/check", async (req,res)=>{

const trader = req.query.trader_id;

if(!trader){
return res.json({ok:false});
}

try{

/* 🔥 проверяем в Firebase */

if(!db){
console.log("❌ DB NOT CONNECTED");
return res.send("db error");
}

const ref = await db.collection("referrals").doc(trader).get();

if(ref.exists){
return res.json({
ok:true,
trader_id: trader
});
}

}catch(e){
console.log("firebase check error", e);
}

return res.json({ok:false});

});

/* =========================
   ПРОВЕРКА ДЕПОЗИТА
========================= */

app.get("/check-deposit", async (req,res)=>{

  const trader = req.query.trader_id;

  if(!trader){
    return res.json({ok:false,amount:0});
  }

  try{

    if(!db){
      console.log("❌ DB NOT CONNECTED");
      return res.json({ok:false,amount:0});
    }

    const ref = await db.collection("referrals").doc(trader).get();

    if(ref.exists){

      const data = ref.data();
      const amount = parseFloat(data.deposit || 0);

      if(amount >= 30){
        return res.json({
          ok:true,
          amount:amount
        });
      }

    }

  }catch(e){
    console.log("firebase check deposit error", e);
  }

  return res.json({
    ok:false,
    amount:0
  });

  
});


/* =========================
   ПРОВЕРКА АПРУВА
========================= */

app.get("/check-approve",(req,res)=>{

const trader = req.query.trader_id;

if(!trader){
return res.json({ok:false});
}

if(approvedDeposits[trader]){
console.log("✅ approve found:", trader);

return res.json({
ok:true
});
}

res.json({
ok:false
});

});



/* =========================
   РЫНОК
========================= */

let currentPrice = 1.18420;
let currentPair = "EUR/USD";

function movePrice(){

let baseMove = (Math.random()-0.5)*0.00025;
let trend = (Math.random()>0.5?1:-1)*0.00005;

currentPrice += baseMove + trend;
currentPrice += (Math.random()-0.5)*0.00003;

if(currentPrice < 1) currentPrice = 1.1;

}

setInterval(movePrice,900);


/* =========================
   ПОЛУЧЕНИЕ ЦЕНЫ
========================= */

app.get("/price",(req,res)=>{
res.json({
price: currentPrice,
pair: currentPair
});
});


/* =========================
   SET PAIR (для signals)
========================= */

app.get("/setpair",(req,res)=>{

const pair = req.query.pair;

if(pair){
currentPair = pair;
}

res.json({ok:true});

});


/* =========================
   ENTRY
========================= */

app.get("/get-entry",(req,res)=>{

let wait = 3000 + Math.random()*5000;

setTimeout(()=>{

let entry = currentPrice;
entry += (Math.random()-0.5)*0.00015;

res.json({
entry: entry,
pair: currentPair
});

},wait);

});


/* =========================
   BLOCK DIRECT HTML ACCESS
========================= */

app.get(/\.html$/, (req,res)=>{
res.redirect("/");
});

/* =========================
   SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("🚀 SERVER START");
console.log("PORT:",PORT);
console.log("🧪 DEV MODE:",DEV_MODE);
});

/* =========================
   REAL MARKET SIMULATOR
========================= */

function getMarketDelay(){

let hour = new Date().getHours();

/* ночь */
if(hour >=0 && hour <7){
return 7000 + Math.random()*4000;
}

/* утро */
if(hour >=7 && hour <12){
return 4000 + Math.random()*2000;
}

/* день */
if(hour >=12 && hour <18){
return 2000 + Math.random()*1000;
}

/* вечер пик */
if(hour >=18 && hour <23){
return 1200 + Math.random()*600;
}

/* поздний вечер */
return 3000 + Math.random()*1500;

}

function generateTrade(){

let pairs = ["EUR/USD","GBP/USD","BTC","ETH","GOLD","USD/JPY"];

let pair = pairs[Math.floor(Math.random()*pairs.length)];

let end = Math.floor(100 + Math.random()*900);
let id = "ID 12****" + end;

/* суммы */

let amount;
let r = Math.random();

if(r < 0.65){
amount = Math.floor(Math.random()*120)+40;
}else if(r < 0.9){
amount = Math.floor(Math.random()*600)+200;
}else if(r < 0.98){
amount = Math.floor(Math.random()*1200)+600;
}else{
amount = Math.floor(Math.random()*2000)+2000;
}

/* плавный винрейт */

if(Math.random()>0.9){
winChance += (Math.random()-0.5)*0.02;
}

if(winChance > 0.89) winChance = 0.89;
if(winChance < 0.63) winChance = 0.63;

let isWin = Math.random() < winChance;
let result = isWin ? "win":"loss";

/* обновляем прибыль */

if(isWin){
stats.profit += Math.floor(amount*0.7);
}else{
stats.profit -= Math.floor(amount*0.3);
}

/* рост пользователей */

if(Math.random()>0.92){
stats.users += 1;
}

/* время */

let kyiv = new Date().toLocaleString("en-US",{timeZone:"Europe/Kyiv"});
let hour = new Date(kyiv).getHours().toString().padStart(2,"0");

stats.time = hour+":00";

/* сделки */

liveTrades.push({
id,
pair,
amount,
result,
time:Date.now()
});

if(liveTrades.length>40){
liveTrades = liveTrades.slice(-40);
}

/* winrate */

stats.win = Math.round(winChance*100);
stats.loss = 100 - stats.win;

/* сохранить */

saveStats();

console.log("📈 trade generated");

/* следующая сделка */

setTimeout(generateTrade, getMarketDelay());

}

/* запуск рынка */

generateTrade();

if(!HD_TEST_MODE){
require("./public/bot/bot");
require("./public/bot/partnerBot");
}

app.get("/stats",(req,res)=>{

try{
const data = fs.readFileSync("stats.json","utf8");
stats = JSON.parse(data);
}catch(e){
console.log("stats reload error", e);
}

res.json(stats);

});
app.get("/live",(req,res)=>{
res.json(liveTrades);
});

/* =========================
   GLOBAL ERROR HANDLER
========================= */

app.use((err, req, res, next) => {

console.error("SERVER ERROR:", err);

res.status(500).json({
error: "server_error"
});

});

/* =========================
   AUTO SAVE STATS TO GIT
========================= */

if(!HD_TEST_MODE) setInterval(async()=>{

try{

await git.add("stats.json");

await git.commit("auto stats update");

await git.push();

console.log("📦 stats saved to git");

}catch(e){

console.log("git save error", e.message);

}

},300000);

app.get("/postback", async (req, res) => {
  // Защита: задайте POCKET_POSTBACK_SECRET в Render и передайте тот же
  // статический параметр secret в URL postback в кабинете партнёра.
  const expectedSecret = process.env.POCKET_POSTBACK_SECRET;
  const suppliedSecret = String(req.query.secret || req.query.token || "");
  if (!expectedSecret || expectedSecret.length < 24) {
    console.error("POSTBACK_REJECTED: POCKET_POSTBACK_SECRET is not configured (or too short)");
    return res.status(503).send("postback_not_configured");
  }
  if (suppliedSecret !== expectedSecret) {
    console.warn("POSTBACK_REJECTED: invalid secret", { ip: req.ip });
    return res.status(401).send("unauthorized");
  }
  if (!db) {
    console.error("POSTBACK_FAILED: Firebase/Firestore is not connected");
    return res.status(503).send("database_unavailable");
  }

  const click = String(req.query.click_id || req.query.clickid || "").trim();
  const trader = String(req.query.trader_id || req.query.traderId || req.query.sub1 || req.query.sub2 || "").trim();
  const amount = Number.parseFloat(req.query.amount || req.query.sum || req.query.sumdep || 0);
  const type = String(req.query.type || req.query.event || req.query.status || "registration").toLowerCase().trim();

  if (!trader || !/^\d{4,20}$/.test(trader)) {
    console.warn("POSTBACK_REJECTED: missing/invalid trader_id", { type, hasClick: Boolean(click) });
    return res.status(400).send("invalid_trader_id");
  }

  // A campaign id (cid) is not a unique click id; don't use it as click attribution.
  const isRegistration = ["registration", "register", "reg", "signup", "ftd"].includes(type);
  const isDeposit = ["deposit", "ftd", "first_deposit", "firstdeposit"].includes(type) && amount > 0;
  const isRedeposit = ["redeposit", "re_deposit", "repeat_deposit"].includes(type);

  try {
    const ref = db.collection("referrals").doc(trader);
    const existing = await ref.get();

    if (isRegistration) {
      if (!click || click.length < 4) {
        console.warn("POSTBACK_REGISTRATION_NO_CLICK_ID", { trader, type });
        // Registration can be logged, but don't fabricate attribution.
        await ref.set({ trader_id: trader, registration_postback_at: Date.now(), registration_confirmed: true }, { merge: true });
      } else {
        await ref.set({
          trader_id: trader,
          click_id: click,
          registration_postback_at: Date.now(),
          registration_confirmed: true
        }, { merge: true });
      }
      console.log("POSTBACK_REGISTRATION_SAVED", { trader, hasClick: Boolean(click) });
    }

    if (isDeposit) {
      // Preserve the first confirmed deposit; later deposit events must not overwrite FTD.
      const prior = existing.exists ? existing.data() : {};
      const patch = {
        trader_id: trader,
        last_deposit_amount: amount,
        last_deposit_at: Date.now()
      };
      if (!prior.ftd_amount && !prior.deposit) {
        patch.ftd_amount = amount;
        patch.deposit = amount;
        patch.deposit_at = Date.now();
        deposits[trader] = amount;
        if (typeof saveDeposits === "function") saveDeposits();
      }
      await ref.set(patch, { merge: true });
      console.log("POSTBACK_DEPOSIT_SAVED", { trader, amount, first: !prior.ftd_amount && !prior.deposit });
    }

    if (isRedeposit) {
      // Do not approve/pay partners based on an unverified or repeatable public event.
      // A separate, audited approval flow is required for redeposit rewards.
      console.warn("POSTBACK_REDEPOSIT_RECEIVED_NOT_AUTO_APPROVED", { trader, amount });
      await ref.set({ last_redeposit_amount: Number.isFinite(amount) ? amount : 0, last_redeposit_at: Date.now() }, { merge: true });
    }

    if (!isRegistration && !isDeposit && !isRedeposit) {
      console.warn("POSTBACK_UNKNOWN_EVENT", { type, trader });
      return res.status(400).send("unknown_event");
    }
    return res.status(200).send("OK");
  } catch (e) {
    console.error("POSTBACK_FIRESTORE_ERROR", e && e.message);
    return res.status(500).send("firestore_error");
  }
});



function saveDeposits(){
fs.writeFileSync("deposits.json", JSON.stringify(deposits,null,2));
}

/* =========================
   TRADERS LOAD
========================= */

let traders = {};

try{
const data = fs.readFileSync("traders.json","utf8");
traders = JSON.parse(data);
console.log("💾 traders loaded");
}catch(e){
console.log("⚠️ traders.json not found");
}

function saveTraders(){
fs.writeFileSync("traders.json", JSON.stringify(traders,null,2));
}

function saveApproved(){
fs.writeFileSync("approved.json", JSON.stringify(approvedDeposits,null,2));
}

/* =========================
SAVE TRADER ID
========================= */

