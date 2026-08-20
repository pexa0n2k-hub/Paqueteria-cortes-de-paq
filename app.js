(() => {
"use strict";

const $ = id => document.getElementById(id);
const DB_KEY = "corte_paquetes_data";
const OLD_KEYS = ["corte_paquetes_v1_12","corte_paquetes_v1_11","corte_paquetes_v1_10","corte_paquetes_v1_9","corte_paquetes_v1_8"];
const DEFAULTS = {
  records: {},                 // { "YYYY-MM-DD": number }
  rate: 0,                     // current default rate
  rateHistory: [],             // [{date, rate}]
  advances: {},                // { "YYYY-MM-DD": [{amount, concept}] }
  settings: {shade:62, blur:7, transparency:78, bg:null}
};

function cloneDefaults(){ return JSON.parse(JSON.stringify(DEFAULTS)); }
function safeRead(key){
  try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch(e){ console.warn("No se pudo leer almacenamiento",e); return null; }
}
function safeWrite(){
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(state));
    return true;
  } catch(e){
    alert("No se pudo guardar. El almacenamiento del navegador está lleno. Si tienes un fondo muy pesado, quítalo desde Ajustes e inténtalo de nuevo.");
    console.error(e);
    return false;
  }
}
function dateKey(d){
  const x = d instanceof Date ? new Date(d) : new Date(d);
  if(Number.isNaN(x.getTime())) return "";
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}
function parseDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||""))) return new Date(NaN);
  const [y,m,d]=s.split("-").map(Number);
  return new Date(y,m-1,d);
}
function monday(d){
  const x=new Date(d); x.setHours(0,0,0,0);
  x.setDate(x.getDate()-((x.getDay()+6)%7));
  return x;
}
function sunday(d){
  const x=monday(d); x.setDate(x.getDate()+6); x.setHours(23,59,59,999); return x;
}
function inCurrentWeek(s){
  const d=parseDate(s); if(Number.isNaN(d.getTime())) return false;
  const a=monday(new Date()), b=sunday(new Date());
  return d>=a && d<=b;
}
function weekKey(s){ return dateKey(monday(parseDate(s))); }
function money(n){return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(n)||0);}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

function migrateOne(db,x){
  if(!x || typeof x!=="object") return;
  if(x.settings) db.settings={...db.settings,...x.settings};

  // Old rate formats
  if(typeof x.rate==="number" && !db.rate) db.rate=x.rate;
  if(x.rates && typeof x.rates==="object"){
    for(const [d,v] of Object.entries(x.rates)){
      if(/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Number(v))){
        db.rateHistory.push({date:d,rate:Number(v)});
      }
    }
  }

  // Old records can be keyed by a date or by week_date.
  if(x.data && typeof x.data==="object"){
    for(const [k,v] of Object.entries(x.data)){
      let d=null;
      const m=String(k).match(/(20\d{2}-\d{2}-\d{2})$/);
      if(m) d=m[1];
      else if(/^\d{4}-\d{2}-\d{2}$/.test(k)) d=k;
      if(d && Number.isFinite(Number(v))) db.records[d]=Math.max(0,Math.floor(Number(v)));
    }
  }
  if(x.advances && typeof x.advances==="object"){
    for(const [wk,list] of Object.entries(x.advances)){
      if(!Array.isArray(list)) continue;
      for(const item of list){
        const d=item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
        if(!d) continue;
        db.advances[d] ??= [];
        db.advances[d].push({amount:Number(item.amount)||0,concept:String(item.concept||"Préstamo")});
      }
    }
  }
}

function makeState(){
  const base=cloneDefaults();
  const current=safeRead(DB_KEY);
  if(current && typeof current==="object"){
    if(current.records) base.records=current.records;
    if(typeof current.rate==="number") base.rate=current.rate;
    if(Array.isArray(current.rateHistory)) base.rateHistory=current.rateHistory;
    if(current.advances) base.advances=current.advances;
    if(current.settings) base.settings={...base.settings,...current.settings};
  } else {
    // One-time recovery from previous project versions.
    for(const k of OLD_KEYS) migrateOne(base,safeRead(k));
    if(base.rateHistory.length){
      base.rateHistory.sort((a,b)=>a.date.localeCompare(b.date));
      base.rate=Number(base.rateHistory.at(-1).rate)||base.rate;
    }
    try{localStorage.setItem(DB_KEY,JSON.stringify(base));}catch(e){}
  }
  // Normalize settings.
  base.settings={...cloneDefaults().settings,...(base.settings||{})};
  return base;
}

let state=makeState();

function rateFor(date){
  let result=Number(state.rate)||0;
  for(const r of state.rateHistory){
    if(r.date<=date) result=Number(r.rate)||0;
  }
  return result;
}

function applySettings(){
  const s=state.settings;
  $("shadeRange").value=s.shade;
  $("blurRange").value=s.blur;
  $("transRange").value=s.transparency;
  $("shadeOut").textContent=s.shade+"%";
  $("blurOut").textContent=s.blur+"px";
  $("transOut").textContent=s.transparency+"%";
  $("shade").style.background=`rgba(2,5,16,${s.shade/100})`;
  $("backdrop").style.filter=`blur(${s.blur}px)`;
  $("backdrop").style.backgroundImage=s.bg ? `url("${s.bg}")` : "radial-gradient(circle at 20% 10%,#17285c,#050814 55%,#12051f)";
  document.documentElement.style.setProperty("--drawer-alpha",String(Math.min(.92,Math.max(.25,s.transparency/100))));
}

function render(){
  const today=dateKey(new Date());
  const start=monday(new Date()), end=sunday(new Date());
  const entries=Object.entries(state.records)
    .filter(([d,v])=>inCurrentWeek(d) && Number.isFinite(Number(v)))
    .sort((a,b)=>a[0].localeCompare(b[0]));

  const total=entries.reduce((sum,[,v])=>sum+Number(v),0);
  let adv=[];
  for(const [d,list] of Object.entries(state.advances)){
    if(inCurrentWeek(d)) for(const item of (Array.isArray(list)?list:[])) adv.push({date:d,...item});
  }
  const advTotal=adv.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const currentRate=rateFor(today);

  $("week").textContent="Semana actual";
  $("range").textContent=`Lunes ${start.getDate()} – Domingo ${end.getDate()} de ${end.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;
  $("total").textContent=total;
  $("gross").textContent=money(total*currentRate);
  $("rateText").textContent=money(currentRate);
  $("grossDetail").textContent=`${total} × ${money(currentRate)}`;
  $("netDetail").textContent=`${money(total*currentRate)} − ${money(advTotal)} de adelantos`;
  $("footerRange").textContent=`${start.getDate()} – ${end.getDate()} de ${end.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;
  $("adv").textContent="-"+money(advTotal);
  $("advCount").textContent=adv.length;
  $("net").textContent=money(total*currentRate-advTotal);
  $("daysText").textContent=entries.length ? entries.length+" días registrados" : "Sin registros";
  $("curRate").textContent=money(currentRate);
  $("rate").value=currentRate || "";

  $("date").min=dateKey(start); $("date").max=dateKey(end);
  if(!inCurrentWeek($("date").value)) $("date").value=today;
  $("advDate").min=dateKey(start); $("advDate").max=dateKey(end);
  if(!inCurrentWeek($("advDate").value)) $("advDate").value=today;
  updateDateText();

  const daily=$("dailySummary");
  if(daily){
    const labels=["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];
    const cells=[];
    for(let i=0;i<7;i++){
      const dd=new Date(start); dd.setDate(start.getDate()+i);
      const key=dateKey(dd), val=Number(state.records[key]||0);
      const has=Object.prototype.hasOwnProperty.call(state.records,key);
      cells.push(`<button type="button" class="dayCell ${has?"":"empty"}" onclick="openDayActions('${key}')" aria-label="Gestionar ${labels[i]} ${String(dd.getDate()).padStart(2,"0")}/${String(dd.getMonth()+1).padStart(2,"0")}"><div class="dow">${labels[i]}</div><div class="dateNum">${String(dd.getDate()).padStart(2,"0")}/${String(dd.getMonth()+1).padStart(2,"0")}</div><div class="dash"></div><div class="qty">${val}</div><div class="label">paquetes</div></button>`);
    }
    daily.innerHTML=`<div class="dailyGrid">${cells.join("")}</div>`;
  }

  $("advList").innerHTML=adv.length ? adv.map((x,i)=>{
    const dt=parseDate(x.date);
    return `<div class="row"><div class="dateLabel">${esc(x.concept||"Préstamo")}<small>${dt.toLocaleDateString("es-MX",{day:"numeric",month:"long"})}</small></div><div class="rowRight"><b>-${money(x.amount)}</b></div><button class="mini" onclick="delAdv(${i})">🗑️</button></div>`;
  }).join("") : "No hay adelantos.";

  const weeks=[...new Set(Object.keys(state.records).map(weekKey))].sort().reverse();
  $("history").innerHTML=weeks.length ? weeks.map(w=>{
    const en=Object.entries(state.records).filter(([d])=>weekKey(d)===w);
    const t=en.reduce((sum,[,v])=>sum+Number(v||0),0);
    const dates=en.map(([d])=>d).sort();
    const r=dates.length?rateFor(dates.at(-1)):0;
    const a=Object.entries(state.advances).filter(([d])=>weekKey(d)===w).reduce((sum,[,list])=>sum+(Array.isArray(list)?list.reduce((z,x)=>z+Number(x.amount||0),0):0),0);
    const wd=parseDate(w);
    return `<div class="row"><div class="dateLabel">Semana ${wd.getDate()} – ${new Date(wd.getFullYear(),wd.getMonth(),wd.getDate()+6).getDate()}<small>${money(r)} / paquete · adelantos ${money(a)}</small></div><div class="rowRight"><b>${t} paquetes</b><small>${money(t*r-a)} a recibir</small></div></div>`;
  }).join("") : "Todavía no hay semanas anteriores.";

  applySettings();
}

function updateDateText(){
  const d=parseDate($("date").value);
  if(!Number.isNaN(d.getTime())) $("dateText").textContent="Seleccionado: "+d.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}

$("save").onclick=()=>{
  const date=$("date").value, n=Number($("qty").value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!inCurrentWeek(date)||!Number.isFinite(n)||n<0){
    alert("Selecciona un día de esta semana (lunes a domingo) y escribe una cantidad válida.");
    return;
  }
  state.records[date]=Math.floor(n);
  if(safeWrite()){ $("qty").value=""; render(); }
};

$("date").onchange=updateDateText;

$("saveRate").onclick=()=>{
  const n=Number($("rate").value);
  if(!Number.isFinite(n)||n<0){alert("Escribe una tarifa válida.");return;}
  const d=dateKey(new Date());
  state.rate=n;
  const last=state.rateHistory.at(-1);
  if(last && last.date===d) last.rate=n; else state.rateHistory.push({date:d,rate:n});
  if(safeWrite()) render();
};

$("addAdv").onclick=()=>{
  $("advDate").value=dateKey(new Date());
  $("advPanel").classList.remove("hidden");
};
$("cancelAdv").onclick=()=>$("advPanel").classList.add("hidden");

$("saveAdv").onclick=()=>{
  const d=$("advDate").value, amount=Number($("amount").value), concept=$("concept").value.trim()||"Préstamo";
  if(!inCurrentWeek(d)||!Number.isFinite(amount)||amount<=0){alert("Selecciona una fecha de esta semana y un monto válido.");return;}
  state.advances[d]??=[];
  state.advances[d].push({amount,concept});
  if(safeWrite()){ $("amount").value=""; $("concept").value=""; $("advPanel").classList.add("hidden"); render(); }
};

window.delAdv=i=>{
  const items=[];
  for(const [d,list] of Object.entries(state.advances)) if(inCurrentWeek(d)) for(let j=0;j<list.length;j++) items.push({d,j});
  const target=items[i]; if(!target)return;
  if(!confirm("¿Eliminar adelanto?"))return;
  state.advances[target.d].splice(target.j,1);
  if(!state.advances[target.d].length) delete state.advances[target.d];
  if(safeWrite())render();
};

let selectedDay="";
window.openDayActions=d=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  selectedDay=d;
  const dt=parseDate(d);
  $("dayActionDate").textContent=dt.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  $("dayActionQty").textContent=Number(state.records[d]||0);
  $("dayActionPanel").classList.remove("hidden");
};
const closeDayActions=()=>{$("dayActionPanel").classList.add("hidden");selectedDay="";};
$("closeDayAction").onclick=closeDayActions;
$("modifyDay").onclick=()=>{
  if(!selectedDay)return;
  const d=selectedDay;
  closeDayActions();
  window.editDay(d);
};
$("deleteDay").onclick=()=>{
  if(!selectedDay)return;
  const d=selectedDay;
  closeDayActions();
  window.delDay(d);
};

const DASH_GOAL_KEY="weeklyGoal";function getWeekGoal(){const n=Number(localStorage.getItem(DASH_GOAL_KEY)||400);return n>0?n:400}function renderDashboard(){const total=Object.values(state.records||{}).reduce((s,v)=>s+Number(v||0),0),gross=total*currentRate;$("dashTotal").textContent=total;$("dashGross").textContent=money(gross);$("dashMoneySub").textContent=`${money(currentRate)} por paquete`;const labels=["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"],vals=[];for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d);vals.push({key,label:labels[i],date:d,val:Number(state.records[key]||0),has:Object.prototype.hasOwnProperty.call(state.records,key)})}const max=Math.max(1,...vals.map(x=>x.val));$("dashboardChart").innerHTML=vals.map(x=>`<button type="button" class="chartDay ${x.has?"":"empty"}" onclick="openDayActions('${x.key}')"><div class="barWrap"><i class="bar" style="height:${Math.max(4,x.val/max*100)}%"></i></div><b class="qty">${x.val}</b><span class="dow">${x.label}</span></button>`).join("");const worked=vals.filter(x=>x.has),avg=worked.length?Math.round(total/worked.length):0,best=vals.reduce((a,b)=>b.val>a.val?b:a,vals[0]);$("dashAverage").textContent=avg;$("dashBest").textContent=best.val?`${best.label} · ${best.val}`:"—";$("dashBestDay").textContent=best.val||"—";$("dashBestDaySub").textContent=best.val?best.date.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"}):"Sin registros";const goal=getWeekGoal(),pct=Math.min(100,total/goal*100),rem=Math.max(0,goal-total);$("goalCurrent").textContent=`${total} / ${goal}`;$("goalPercent").textContent=`${pct.toFixed(1).replace(".0","")}%`;$("goalFill").style.width=pct+"%";$("goalText").textContent=`${goal} paquetes esta semana`;$("goalMessage").textContent=rem?`Te faltan ${rem} paquetes para alcanzar tu meta.`:"🔥 ¡Meta semanal alcanzada!"}function openDashboard(){renderDashboard();$("dashboardPanel").classList.remove("hidden")}function closeDashboard(){$("dashboardPanel").classList.add("hidden")}const bindDashboard=()=>{
  const btn=$("dashboardBtn");
  const close=$("closeDashboard");
  const panel=$("dashboardPanel");
  const goal=$("goalEdit");
  if(btn) btn.onclick=openDashboard;
  if(close) close.onclick=closeDashboard;
  if(panel) panel.addEventListener("click",e=>{if(e.target===panel)closeDashboard()});
  if(goal) goal.onclick=()=>{
    const val=prompt("¿Cuántos paquetes quieres como meta semanal?",getWeekGoal());
    if(val===null)return;
    const n=Math.floor(Number(val));
    if(!Number.isFinite(n)||n<1)return alert("Escribe una meta válida.");
    localStorage.setItem(DASH_GOAL_KEY,n);
    renderDashboard();
  };
};
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bindDashboard);
else bindDashboard();
window.editDay=d=>{
  $("editPanel").dataset.date=d;
  $("editQty").value=state.records[d]??0;
  $("editPanel").classList.remove("hidden");
};
$("cancelEdit").onclick=()=>$("editPanel").classList.add("hidden");
$("saveEdit").onclick=()=>{
  const d=$("editPanel").dataset.date,n=Number($("editQty").value);
  if(!d||!inCurrentWeek(d)||!Number.isFinite(n)||n<0)return;
  state.records[d]=Math.floor(n);
  if(safeWrite()){ $("editPanel").classList.add("hidden"); render(); }
};
window.delDay=d=>{
  if(!Object.prototype.hasOwnProperty.call(state.records,d))return;
  if(!confirm("¿Eliminar registro de este día?"))return;
  delete state.records[d];
  if(safeWrite())render();
};

$("reset").onclick=()=>{
  if(!confirm("¿Borrar registros y adelantos de esta semana?"))return;
  for(const d of Object.keys(state.records)) if(inCurrentWeek(d)) delete state.records[d];
  for(const d of Object.keys(state.advances)) if(inCurrentWeek(d)) delete state.advances[d];
  if(safeWrite())render();
};

$("historyToggle").onclick=()=>{
  const x=$("historyWrap"); x.classList.toggle("open");
  $("historyToggle").textContent=x.classList.contains("open")?"⌃":"⌄";
};
$("settingsBtn").onclick=()=>$("setPanel").classList.remove("hidden");
$("closeSet").onclick=()=>$("setPanel").classList.add("hidden");

$("bg").onchange=e=>{
  const f=e.target.files?.[0]; if(!f)return;
  const reader=new FileReader();
  reader.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const max=1200, scale=Math.min(1,max/img.width);
      const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
      const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      state.settings.bg=canvas.toDataURL("image/jpeg",.72);
      if(safeWrite())applySettings();
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(f);
};
$("removeBg").onclick=()=>{state.settings.bg=null;if(safeWrite())applySettings();};
$("shadeRange").oninput=e=>{state.settings.shade=Number(e.target.value);safeWrite();applySettings();};
$("blurRange").oninput=e=>{state.settings.blur=Number(e.target.value);safeWrite();applySettings();};
$("transRange").oninput=e=>{state.settings.transparency=Number(e.target.value);safeWrite();applySettings();};


function currentCutData(){
  const today=dateKey(new Date()), start=monday(new Date()), end=sunday(new Date());
  const entries=Object.entries(state.records).filter(([d])=>inCurrentWeek(d)).sort((a,b)=>a[0].localeCompare(b[0]));
  const total=entries.reduce((s,[,v])=>s+Number(v||0),0), rate=rateFor(today);
  let advances=[];
  for(const [d,list] of Object.entries(state.advances)) if(inCurrentWeek(d)) for(const x of (Array.isArray(list)?list:[])) advances.push({date:d,...x});
  const adv=advances.reduce((s,x)=>s+Number(x.amount||0),0);
  return {start,end,total,rate,gross:total*rate,adv,net:total*rate-adv,entries,advances};
}
function rr(ctx,x,y,w,h,r){const q=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath()}
function dg(ctx,x,y,w,h,r=28){
  // IMPORTANTE: el blur se aplica únicamente al fondo capturado ANTES de
  // dibujar los cajones. Nunca hacemos drawImage() del canvas sobre sí mismo.
  const q=Math.min(r,w/2,h/2);
  const path=()=>{
    ctx.beginPath();
    ctx.moveTo(x+q,y);
    ctx.arcTo(x+w,y,x+w,y+h,q);
    ctx.arcTo(x+w,y+h,x,y+h,q);
    ctx.arcTo(x,y+h,x,y,q);
    ctx.arcTo(x,y,x+w,y,q);
    ctx.closePath();
  };

  ctx.save();
  path();
  ctx.clip();

  if(window.__shareGlassSource){
    ctx.save();
    ctx.filter="blur(14px)";
    ctx.drawImage(
      window.__shareGlassSource,
      0,0,window.__shareGlassW*window.__shareGlassScale,window.__shareGlassH*window.__shareGlassScale,
      0,0,window.__shareGlassW,window.__shareGlassH
    );
    ctx.filter="none";
    ctx.restore();
  }

  // Material Liquid Glass: aproximadamente 25% de transparencia.
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,"rgba(255,255,255,.18)");
  g.addColorStop(.45,"rgba(255,255,255,.10)");
  g.addColorStop(1,"rgba(8,18,38,.58)");
  ctx.fillStyle=g;
  ctx.fillRect(x,y,w,h);

  // Sutil velo oscuro para que los textos sigan siendo legibles.
  const shade=ctx.createLinearGradient(0,y,0,y+h);
  shade.addColorStop(0,"rgba(5,12,26,.08)");
  shade.addColorStop(1,"rgba(5,12,26,.20)");
  ctx.fillStyle=shade;
  ctx.fillRect(x,y,w,h);
  ctx.restore();

  // Borde, brillo superior y reflejo interno.
  ctx.save();
  path();
  ctx.strokeStyle="rgba(255,255,255,.42)";
  ctx.lineWidth=2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x+30,y+1);
  ctx.lineTo(x+w-30,y+1);
  ctx.strokeStyle="rgba(255,255,255,.72)";
  ctx.lineWidth=2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x+22,y+q);
  ctx.lineTo(x+22,y+h-q);
  ctx.strokeStyle="rgba(255,255,255,.10)";
  ctx.lineWidth=1;
  ctx.stroke();
  ctx.restore();
}
function fit(ctx,text,max,size){let s=size;ctx.font=`900 ${s}px system-ui,sans-serif`;while(ctx.measureText(text).width>max&&s>14){s--;ctx.font=`900 ${s}px system-ui,sans-serif`}return s}
async function renderShareImage(){
  const d=currentCutData(), canvas=$("shareCanvas"), W=1080, H=1350;
  const scale=Math.min(3,Math.max(2,devicePixelRatio||2));
  canvas.width=W*scale; canvas.height=H*scale;
  const ctx=canvas.getContext("2d"); ctx.scale(scale,scale);

  // 1) Fondo personalizado de la app, exactamente como se muestra dentro de ella.
  if(state.settings.bg){
    try{
      const img=await new Promise((resolve,reject)=>{
        const im=new Image();
        im.onload=()=>resolve(im); im.onerror=reject; im.src=state.settings.bg;
      });
      const sc=Math.max(W/img.width,H/img.height), iw=img.width*sc, ih=img.height*sc;
      ctx.drawImage(img,(W-iw)/2,(H-ih)/2,iw,ih);
      ctx.fillStyle=`rgba(2,5,16,${(state.settings.shade??62)/100})`; ctx.fillRect(0,0,W,H);
      const veil=ctx.createLinearGradient(0,0,W,H);
      veil.addColorStop(0,"rgba(0,215,255,.045)"); veil.addColorStop(1,"rgba(150,40,255,.06)");
      ctx.fillStyle=veil; ctx.fillRect(0,0,W,H);
    }catch(e){
      const bg=ctx.createLinearGradient(0,0,W,H);
      bg.addColorStop(0,"#0b1730");bg.addColorStop(.5,"#07101f");bg.addColorStop(1,"#160a2a");
      ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    }
  }else{
    const bg=ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,"#0b1730");bg.addColorStop(.5,"#07101f");bg.addColorStop(1,"#160a2a");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  }

  // Captura del fondo antes de los cristales: cada cajón tendrá blur SOLO de lo que hay debajo.
  const glassSource=document.createElement("canvas");
  glassSource.width=canvas.width;glassSource.height=canvas.height;
  glassSource.getContext("2d").drawImage(canvas,0,0);
  window.__shareGlassSource=glassSource;
  window.__shareGlassW=W;window.__shareGlassH=H;window.__shareGlassScale=scale;

  const white="#f8fbff", cyan="#78f4ff", mint="#72ffd7", muted="#a9b8ca";
  const text=(s,x,y,size,weight="700",color=white)=>{
    ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui,-apple-system,sans-serif`;ctx.fillText(s,x,y);
  };
  const moneyFit=(value,max,size)=>fit(ctx,value,max,size);

  // Header — igual a la composición premium del mockup.
  text("CORTE DE PAQUETES",55,63,20,"900",cyan);
  text("Corte semanal",55,112,42,"850",white);
  text(`${d.start.getDate()} – ${d.end.getDate()} de ${d.end.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`,55,148,19,"500",muted);

  // Botón compartir visual en la tarjeta exportada.
  dg(ctx,930,28,100,90,25);
  ctx.save();ctx.strokeStyle=cyan;ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(980,91);ctx.lineTo(980,48);ctx.moveTo(980,48);ctx.lineTo(966,62);ctx.moveTo(980,48);ctx.lineTo(994,62);ctx.moveTo(958,71);ctx.lineTo(958,97);ctx.quadraticCurveTo(958,103,964,103);ctx.lineTo(996,103);ctx.quadraticCurveTo(1002,103,1002,97);ctx.lineTo(1002,71);ctx.stroke();ctx.restore();

  // Paquetes — tarjeta ancha rectangular.
  dg(ctx,42,176,996,245,27);
  text("PAQUETES ENTREGADOS",76,226,17,"900",cyan);
  text(String(d.total),76,316,92,"900",white);
  text(`${d.entries.length} días registrados`,76,359,19,"500",muted);

  // Divisor y tarjeta de tarifa.
  ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(600,224);ctx.lineTo(600,385);ctx.stroke();
  dg(ctx,650,260,78,78,20);
  // package icon
  ctx.save();ctx.strokeStyle="#dce8f5";ctx.lineWidth=2.2;ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(669,282);ctx.lineTo(689,272);ctx.lineTo(709,282);ctx.lineTo(689,292);ctx.closePath();
  ctx.moveTo(669,282);ctx.lineTo(669,305);ctx.lineTo(689,316);ctx.lineTo(709,305);ctx.lineTo(709,282);
  ctx.moveTo(689,292);ctx.lineTo(689,316);ctx.stroke();ctx.restore();
  text(money(d.rate),755,301,30,"800",white);
  text("por paquete",755,331,18,"500",muted);

  // Dos tarjetas métricas.
  dg(ctx,42,455,478,190,25); dg(ctx,560,455,478,190,25);
  dg(ctx,80,520,65,65,18); dg(ctx,596,520,65,65,18);

  // Ganancia icon.
  ctx.save();ctx.strokeStyle="#73fff0";ctx.lineWidth=2.8;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(98,568);ctx.lineTo(108,558);ctx.lineTo(116,563);ctx.lineTo(130,545);ctx.moveTo(99,574);ctx.lineTo(99,548);ctx.moveTo(99,574);ctx.lineTo(132,574);ctx.stroke();ctx.restore();
  text("GANANCIA BRUTA",170,505,17,"900",cyan);
  text(money(d.gross),170,564,moneyFit(money(d.gross),300,42),"900",white);
  text(`${d.total} × ${money(d.rate)}`,170,603,18,"500",muted);

  // Wallet icon.
  ctx.save();ctx.strokeStyle="#ff8faa";ctx.lineWidth=2.5;ctx.lineJoin="round";
  ctx.beginPath();ctx.roundRect(613,539,35,27,5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(613,546);ctx.lineTo(646,546);ctx.quadraticCurveTo(655,546,655,554);ctx.lineTo(646,554);ctx.stroke();
  ctx.beginPath();ctx.arc(645,554,2,0,Math.PI*2);ctx.fillStyle="#ff8faa";ctx.fill();ctx.restore();
  text("ADELANTOS / PRÉSTAMOS",685,505,17,"900",cyan);
  text("-"+money(d.adv),685,564,moneyFit("-"+money(d.adv),300,42),"900",white);
  text(`${d.advances.length} registro${d.advances.length===1?"":"s"}`,685,603,18,"500",muted);

  // Total.
  dg(ctx,42,678,996,220,27);
  text("TOTAL A RECIBIR",76,727,18,"900",cyan);
  text(money(d.net),76,814,moneyFit(money(d.net),600,66),"900",mint);
  text(`${money(d.gross)} − ${money(d.adv)} de adelantos`,76,852,18,"500",muted);

  // Share button inside the total card.
  dg(ctx,716,770,280,72,18);
  ctx.save();ctx.strokeStyle=cyan;ctx.lineWidth=2.5;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(752,817);ctx.lineTo(752,786);ctx.moveTo(752,786);ctx.lineTo(741,797);ctx.moveTo(752,786);ctx.lineTo(763,797);ctx.moveTo(737,801);ctx.lineTo(737,824);ctx.quadraticCurveTo(737,830,743,830);ctx.lineTo(775,830);ctx.quadraticCurveTo(781,830,781,824);ctx.lineTo(781,801);ctx.stroke();ctx.restore();
  text("Compartir corte",798,815,17,"800",cyan);

  // Resumen diario — siempre 7 días lunes a domingo.
  dg(ctx,42,932,996,278,25);
  text("RESUMEN DIARIO",76,977,17,"900",cyan);
  const labels=["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];
  const gap=13, cellW=116, cellH=185, x0=72, y0=1002;
  for(let i=0;i<7;i++){
    const dt=new Date(d.start);dt.setDate(d.start.getDate()+i);
    const key=dateKey(dt), val=Number(state.records[key]||0);
    dg(ctx,x0+i*(cellW+gap),y0,cellW,cellH,18);
    text(labels[i],x0+i*(cellW+gap)+31,y0+37,14,"800",white);
    text(`${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}`,x0+i*(cellW+gap)+30,y0+61,12,"500",muted);
    ctx.fillStyle=cyan;ctx.shadowColor="rgba(114,255,240,.7)";ctx.shadowBlur=8;ctx.fillRect(x0+i*(cellW+gap)+40,y0+78,36,3);ctx.shadowBlur=0;
    text(String(val),x0+i*(cellW+gap)+36,y0+126,26,"900",white);
    text("paquetes",x0+i*(cellW+gap)+25,y0+151,11,"500",muted);
  }

  // Footer.
  dg(ctx,42,1230,996,75,18);
  text("▣",76,1276,23,"500","#dce8f5");
  text("Corte semanal: lunes a domingo",112,1273,16,"600",white);
  text("◷",645,1276,22,"500","#dce8f5");
  const now=new Date();
  text(`Generado: ${now.toLocaleDateString("es-MX",{day:"numeric",month:"long"})}, ${now.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}`,680,1273,14,"500",white);
  text("Generado desde Corte de Paquetes",55,1330,13,"500","rgba(255,255,255,.50)");

  return new Promise(resolve=>canvas.toBlob(resolve,"image/png",1));
}
async function shareCut(){
  const blob=await renderShareImage();if(!blob)return;const file=new File([blob],"corte-de-paquetes.png",{type:"image/png"});
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({title:"Corte de Paquetes",text:"Mi corte semanal de paquetes.",files:[file]});return}catch(e){if(e.name==="AbortError")return}}
  $("sharePanel").classList.remove("hidden");
}
$("shareCut").onclick=shareCut;
$("shareTop").onclick=shareCut;$("closeShare").onclick=()=>$("sharePanel").classList.add("hidden");$("nativeShare").onclick=shareCut;
$("downloadShare").onclick=async()=>{const blob=await renderShareImage();if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="corte-de-paquetes.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js?v=1.13").then(r=>r.update()).catch(()=>{});
}
render();
})();