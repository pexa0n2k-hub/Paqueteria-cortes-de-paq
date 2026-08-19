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
  $("adv").textContent="-"+money(advTotal);
  $("advCount").textContent=adv.length;
  $("net").textContent=money(total*currentRate-advTotal);
  $("daysText").textContent=entries.length ? entries.length+" días registrados" : "Sin registros";
  $("count").textContent=entries.length+" días";
  $("curRate").textContent=money(currentRate);
  $("rate").value=currentRate || "";

  $("date").min=dateKey(start); $("date").max=dateKey(end);
  if(!inCurrentWeek($("date").value)) $("date").value=today;
  $("advDate").min=dateKey(start); $("advDate").max=dateKey(end);
  if(!inCurrentWeek($("advDate").value)) $("advDate").value=today;
  updateDateText();

  $("list").innerHTML=entries.length ? entries.map(([d,v])=>{
    const dt=parseDate(d), n=Number(v), r=rateFor(d);
    return `<div class="row">
      <div class="dateLabel">${dt.toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}
        <small>${dt.toLocaleDateString("es-MX",{weekday:"long"})}</small>
      </div>
      <div class="rowRight"><b>${n} paquetes</b><small>${money(n*r)}</small></div>
      <div><button class="mini" onclick="editDay('${d}')">✏️</button><button class="mini" onclick="delDay('${d}')">🗑️</button></div>
    </div>`;
  }).join("") : "Aún no hay registros.";

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
  if(!state.records[d])return;
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

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js?v=1.13").then(r=>r.update()).catch(()=>{});
}
render();
})();