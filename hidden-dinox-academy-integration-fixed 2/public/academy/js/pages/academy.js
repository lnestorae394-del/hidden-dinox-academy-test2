/* Страница 4 — главная академии (academy.html).
   «Активирован» показывается только из ответа сервера (academyAccess === true). */
let state="loading",profile=null;
function renderStatus(){const b=$("statusBody");
  if(state==="loading"){b.innerHTML=`<div class="rows">${[1,2,3].map(()=>`<div class="row"><span class="skel" style="width:46%"></span><span class="skel" style="width:24%"></span></div>`).join("")}</div>`;return}
  if(state==="error"){b.innerHTML=`<div class="errbox" role="alert">${t("loadErr")}<button type="button" class="btn btn-outline" id="retry"><span class="label">${t("retry")}</span></button></div>`;$("retry").onclick=load;return}
  const p=profile;
  b.innerHTML=`<div class="rows">
    <div class="row ${p.academyAccess===true?"key":""}"><span>${t("rAccess")}</span>${p.academyAccess===true?`<span class="dot ok">${t("rAccessOk")}</span>`:`<span class="dot mute">—</span>`}</div>
    <div class="row"><span>${t("rBroker")}<small>Trader ID ${esc(p.traderIdMasked||"")}</small></span>${p.brokerRegistrationConfirmed===true?`<span class="dot ok">${t("rBrokerOk")}</span>`:`<span class="dot mute">—</span>`}</div>
    <div class="row"><span>${t("rDep")}${p.firstDeposit?`<small>${money(p.firstDeposit.amount)}</small>`:""}</span>${p.firstDeposit?`<span class="dot ok">${t("rDepOk")}</span>`:`<span class="dot mute">—</span>`}</div></div>
    <div class="src">${t("src",{t:t("justNow")})}</div>`}
function renderProfile(){const email=(profile&&profile.email)||"";const ini=(email[0]||"·").toUpperCase();
  ["avH","avP"].forEach(id=>$(id).textContent=ini);["emH","emP","menuEmail"].forEach(id=>$(id).textContent=email);$("profBtn").setAttribute("aria-label",t("profile"))}
function render(){renderProfile();renderStatus()}
async function load(){state="loading";renderStatus();
  try{const p=await guard("academy");if(!p)return;profile=p;state="ok"}catch(e){state="error"}
  render()}
function closeMenu(){$("menu").hidden=true;$("profBtn").setAttribute("aria-expanded","false")}
$("profBtn").onclick=e=>{e.stopPropagation();const o=$("menu").hidden;$("menu").hidden=!o;$("profBtn").setAttribute("aria-expanded",o)};
document.addEventListener("click",e=>{if(!$("menu").hidden&&!$("menu").contains(e.target))closeMenu()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu()});
document.querySelectorAll("[data-signout]").forEach(b=>b.onclick=()=>{closeMenu();signOutAndLeave()});
document.querySelectorAll(".sec").forEach(s=>s.onclick=()=>toast(t("soonToast")));
initTelegram();initParticles(24000,30);initLang(render);render();load();
