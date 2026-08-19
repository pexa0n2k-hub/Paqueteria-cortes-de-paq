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
  ctx.save();

  // 1) Blur ONLY the area inside the glass drawer.
  // The background photo underneath remains sharp everywhere else.
  const q=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+q,y);
  ctx.arcTo(x+w,y,x+w,y+h,q);
  ctx.arcTo(x+w,y+h,x,y+h,q);
  ctx.arcTo(x,y+h,x,y,q);
  ctx.arcTo(x,y,x+w,y,q);
  ctx.closePath();
  ctx.clip();

  const srcCanvas=ctx.canvas;
  ctx.filter="blur(18px)";
  ctx.drawImage(srcCanvas,0,0);
  ctx.filter="none";

  // 2) 25% translucent material over the blurred background.
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,"rgba(255,255,255,.105)");
  g.addColorStop(.45,"rgba(255,255,255,.062)");
  g.addColorStop(1,"rgba(5,12,28,.25)");
  ctx.fillStyle=g;
  ctx.fillRect(x,y,w,h);
  ctx.restore();

  // 3) Glass edge + top reflection.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x+q,y);
  ctx.arcTo(x+w,y,x+w,y+h,q);
  ctx.arcTo(x+w,y+h,x,y+h,q);
  ctx.arcTo(x,y+h,x,y,q);
  ctx.arcTo(x,y,x+w,y,q);
  ctx.closePath();
  ctx.strokeStyle="rgba(255,255,255,.30)";
  ctx.lineWidth=2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x+28,y+1);
  ctx.lineTo(x+w-28,y+1);
  ctx.strokeStyle="rgba(255,255,255,.62)";
  ctx.lineWidth=2;
  ctx.stroke();
  ctx.restore();
}
function fit(ctx,text,max,size){let s=size;ctx.font=`900 ${s}px system-ui,sans-serif`;while(ctx.measureText(text).width>max&&s>14){s--;ctx.font=`900 ${s}px system-ui,sans-serif`}return s}
async function renderShareImage(){
  const d=currentCutData(),canvas=$("shareCanvas"),W=1080,H=1350,scale=Math.min(3,Math.max(2,devicePixelRatio||2));
  canvas.width=W*scale;canvas.height=H*scale;const ctx=canvas.getContext("2d");ctx.scale(scale,scale);
  // Usa el mismo fondo personalizado que tiene la aplicación.
  if(state.settings.bg){
    try{
      const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=state.settings.bg;});
      const sc=Math.max(W/img.width,H/img.height),iw=img.width*sc,ih=img.height*sc;
      ctx.drawImage(img,(W-iw)/2,(H-ih)/2,iw,ih);
      ctx.fillStyle=`rgba(2,5,16,${(state.settings.shade??62)/100})`;
      ctx.fillRect(0,0,W,H);
      const veil=ctx.createLinearGradient(0,0,W,H);
      veil.addColorStop(0,"rgba(0,215,255,.045)");veil.addColorStop(1,"rgba(150,40,255,.06)");
      ctx.fillStyle=veil;ctx.fillRect(0,0,W,H);
    }catch(e){
      const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#0b1730");bg.addColorStop(.5,"#07101f");bg.addColorStop(1,"#160a2a");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    }
  }else{
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#0b1730");bg.addColorStop(.5,"#07101f");bg.addColorStop(1,"#160a2a");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    let gl=ctx.createRadialGradient(180,80,10,180,80,450);gl.addColorStop(0,"rgba(70,230,255,.22)");gl.addColorStop(1,"rgba(70,230,255,0)");ctx.fillStyle=gl;ctx.fillRect(0,0,W,H);
    gl=ctx.createRadialGradient(900,1150,10,900,1150,500);gl.addColorStop(0,"rgba(170,60,255,.18)");gl.addColorStop(1,"rgba(170,60,255,0)");ctx.fillStyle=gl;ctx.fillRect(0,0,W,H);
  }
  ctx.fillStyle="#91f7ff";ctx.font="900 24px system-ui,sans-serif";ctx.fillText("CORTE DE PAQUETES",70,78);
  ctx.fillStyle="#fff";ctx.font="800 46px system-ui,sans-serif";ctx.fillText("Corte semanal",70,132);
  ctx.fillStyle="#aab8ca";ctx.font="500 23px system-ui,sans-serif";ctx.fillText(`${d.start.getDate()} – ${d.end.getDate()} de ${d.end.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`,70,170);
  dg(ctx,55,205,970,250,34);ctx.fillStyle="#91f7ff";ctx.font="900 18px system-ui,sans-serif";ctx.fillText("PAQUETES ENTREGADOS",90,250);ctx.fillStyle="#fff";ctx.font="900 105px system-ui,sans-serif";ctx.fillText(String(d.total),90,355);ctx.fillStyle="#9cafc5";ctx.font="500 20px system-ui,sans-serif";ctx.fillText(`${d.entries.length} días registrados`,90,400);ctx.fillStyle="#fff";ctx.font="700 25px system-ui,sans-serif";ctx.fillText(`${money(d.rate)} por paquete`,690,300);
  dg(ctx,55,485,465,185,30);dg(ctx,560,485,465,185,30);
  ctx.fillStyle="#91f7ff";ctx.font="900 17px system-ui,sans-serif";ctx.fillText("GANANCIA BRUTA",85,530);ctx.fillStyle="#fff";ctx.font=`900 ${fit(ctx,money(d.gross),390,42)}px system-ui,sans-serif`;ctx.fillText(money(d.gross),85,592);ctx.fillStyle="#9cafc5";ctx.font="500 18px system-ui,sans-serif";ctx.fillText(`${d.total} × ${money(d.rate)}`,85,630);
  ctx.fillStyle="#91f7ff";ctx.font="900 17px system-ui,sans-serif";ctx.fillText("ADELANTOS / PRÉSTAMOS",590,530);ctx.fillStyle="#fff";ctx.font=`900 ${fit(ctx,"-"+money(d.adv),390,42)}px system-ui,sans-serif`;ctx.fillText("-"+money(d.adv),590,592);ctx.fillStyle="#9cafc5";ctx.font="500 18px system-ui,sans-serif";ctx.fillText(`${d.advances.length} registros`,590,630);
  dg(ctx,55,700,970,280,38);ctx.fillStyle="#a5fff0";ctx.font="900 18px system-ui,sans-serif";ctx.fillText("TOTAL A RECIBIR",90,755);ctx.fillStyle="#7dffdb";ctx.font=`900 ${fit(ctx,money(d.net),820,92)}px system-ui,sans-serif`;ctx.fillText(money(d.net),90,860);ctx.fillStyle="#b0bdce";ctx.font="500 21px system-ui,sans-serif";ctx.fillText(`${money(d.gross)} − ${money(d.adv)} de adelantos`,90,908);
  dg(ctx,55,1015,970,235,32);ctx.fillStyle="#fff";ctx.font="800 22px system-ui,sans-serif";ctx.fillText("Registro de la semana",90,1058);
  const shown=d.entries.slice(-6);let yy=1100;for(const [date,val] of shown){const dt=parseDate(date);ctx.fillStyle="#a9b7c9";ctx.font="600 17px system-ui,sans-serif";ctx.fillText(dt.toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"}),90,yy);ctx.fillStyle="#fff";ctx.font="800 18px system-ui,sans-serif";ctx.fillText(`${val} paquetes`,390,yy);ctx.fillStyle="#8ff7ff";ctx.font="700 17px system-ui,sans-serif";ctx.fillText(money(Number(val)*rateFor(date)),730,yy);yy+=30}
  ctx.fillStyle="rgba(255,255,255,.48)";ctx.font="500 15px system-ui,sans-serif";ctx.fillText("Generado desde Corte de Paquetes",70,1315);
  return new Promise(resolve=>canvas.toBlob(resolve,"image/png",1));
}
async function shareCut(){
  const blob=await renderShareImage();if(!blob)return;const file=new File([blob],"corte-de-paquetes.png",{type:"image/png"});
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({title:"Corte de Paquetes",text:"Mi corte semanal de paquetes.",files:[file]});return}catch(e){if(e.name==="AbortError")return}}
  $("sharePanel").classList.remove("hidden");
}
$("shareCut").onclick=shareCut;$("closeShare").onclick=()=>$("sharePanel").classList.add("hidden");$("nativeShare").onclick=shareCut;
$("downloadShare").onclick=async()=>{const blob=await renderShareImage();if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="corte-de-paquetes.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js?v=1.13").then(r=>r.update()).catch(()=>{});
}
render();
})();