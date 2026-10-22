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
function render(){renderProfile();renderStatus();if(typeof renderLearning==="function")renderLearning()}
async function load(){state="loading";renderStatus();
  try{const p=await guard("academy");if(!p)return;profile=p;state="ok"}catch(e){state="error"}
  render();if(state==="ok")loadLearning()}
/* Опубликованные курсы, прогресс и афиши — только данные сервера */
const escH=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let learnData=null,annData=null;
function renderLearning(){
  if(learnData&&learnData.length){$("learnPanel").hidden=false;
    $("learnList").innerHTML=learnData.map(c=>`<a class="course-card" href="learn.html#/course/${encodeURIComponent(c.id)}">${c.cover_url?`<img src="${escH(c.cover_url)}" alt="" loading="lazy">`:""}<div><h3>${escH(c.title)}</h3>${c.description?`<p>${escH(c.description.slice(0,160))}${c.description.length>160?"…":""}</p>`:""}
      <div class="cbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.percent}"><i style="width:${c.percent}%"></i></div><small>${c.completed}/${c.lessons} ${t("learnLessons")} · ${c.percent}% ${t("learnDone")}</small></div><span class="go">${t(c.completed?"learnCont":"learnOpen")}</span></a>`).join("");
    const tot=learnData.reduce((n,c)=>n+c.lessons,0),done=learnData.reduce((n,c)=>n+c.completed,0),pct=tot?Math.round(done*100/tot):0;
    const pe=document.querySelector(".p-progress .prog-empty");
    if(pe)pe.innerHTML=`<div class="ring" aria-hidden="true" style="--p:${pct}">${pct}%</div><div><p>${escH(learnData[0].title)}</p><small>${t("progLessonsT")}: ${done} / ${tot}</small></div>`;}
  if(annData&&annData.length){$("annPanel").hidden=false;
    $("annList").innerHTML=annData.map(a=>`<article class="ann">${a.image_url?`<img src="${escH(a.image_url)}" alt="" loading="lazy">`:""}<div>${a.event_at?`<time>${escH(new Date(a.event_at).toLocaleString(lang==="en"?"en-GB":lang==="ua"?"uk-UA":"ru-RU",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}))}</time>`:""}<h3>${escH(a.title)}</h3>${a.body?`<p>${escH(a.body)}</p>`:""}${a.cta_url&&a.cta_label?`<a class="ann-cta" href="${escH(a.cta_url)}" target="_blank" rel="noopener noreferrer">${escH(a.cta_label)}</a>`:""}</div></article>`).join("");}
}
async function loadLearning(){
  try{learnData=(await call("GET","/api/learn/courses")).courses||[]}catch(e){learnData=null}
  try{annData=(await call("GET","/api/announcements")).announcements||[]}catch(e){annData=null}
  renderLearning()}
function closeMenu(){$("menu").hidden=true;$("profBtn").setAttribute("aria-expanded","false")}
$("profBtn").onclick=e=>{e.stopPropagation();const o=$("menu").hidden;$("menu").hidden=!o;$("profBtn").setAttribute("aria-expanded",o)};
document.addEventListener("click",e=>{if(!$("menu").hidden&&!$("menu").contains(e.target))closeMenu()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu()});
document.querySelectorAll("[data-signout]").forEach(b=>b.onclick=()=>{closeMenu();signOutAndLeave()});
document.querySelectorAll(".sec").forEach(s=>s.onclick=()=>toast(t("soonToast")));
initTelegram();initParticles(24000,30);initLang(render);render();load();
