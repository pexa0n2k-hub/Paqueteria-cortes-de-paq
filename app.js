const $=id=>document.getElementById(id);
const DB="corte_paquetes_v1_12";
const MIG="corte_paquetes_v1_12_migrated";
const empty=()=>({data:{},rates:{},advances:{},settings:{shade:62,blur:7,bg:null,transparency:78}});
const readJSON=k=>{try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}};
const dk=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?"":`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`};
const pd=s=>{if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(s||"")))return new Date(NaN);const [a,b,c]=String(s).split("-").map(Number);return new Date(a,b-1,c)};
const keyFor=(w,d)=>`${w}_${d}`;
const dateFromKey=k=>{const m=String(k).match(/_([0-9]{4}-[0-9]{2}-[0-9]{2})$/);return m?m[1]:null};
const weekFromKey=k=>String(k).split("_")[0];
function wk(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()+3-(x.getDay()+6)%7);const y=x.getFullYear(),f=new Date(y,0,4);return y+"-"+String(1+Math.round(((x-f)/864e5-f.getDay()+1)/7)).padStart(2,"0")}
function bounds(){const n=new Date(),m=new Date(n),offset=(n.getDay()+6)%7;m.setDate(n.getDate()-offset);m.setHours(0,0,0,0);const s=new Date(m);s.setDate(m.getDate()+6);s.setHours(23,59,59,999);return[m,s]}
const money=n=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(n)||0);
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function normalizeDate(k){
  if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(k))) return String(k);
  const m=String(k).match(/(20[0-9]{2})[-_/]([0-9]{1,2})[-_/]([0-9]{1,2})/);
  return m?`${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`:null;
}
function looksDB(x){return x&&typeof x==="object"&&(x.data||x.rates||x.advances||x.settings||x.rate!==undefined)}
function mergeLegacy(db,x){
  if(!looksDB(x))return;
  if(x.settings) db.settings={...x.settings,...db.settings};
  if(x.rates) for(const [d,v] of Object.entries(x.rates)) if(db.rates[d]===undefined) db.rates[d]=v;
  if(x.rate!==undefined && !Object.keys(db.rates).length) db.rates[dk(new Date())]=x.rate;
  if(x.data) for(const [k,v] of Object.entries(x.data)){
    const d=normalizeDate(k)||dateFromKey(k), dt=pd(d);
    if(d&&!Number.isNaN(dt.getTime())&&Number.isFinite(Number(v))) db.data[keyFor(wk(dt),d)]=Math.max(0,Math.floor(Number(v)));
  }
  if(x.advances) for(const [w,list] of Object.entries(x.advances)) if(!db.advances[w]) db.advances[w]=Array.isArray(list)?list:[];
}
function init(){
  let db=readJSON(DB);
  if(!looksDB(db))db=empty();
  db.data??={};db.rates??={};db.advances??={};db.settings={...empty().settings,...(db.settings||{})};

  // Migrate once, then keep normal operation in memory. This is much faster than
  // scanning localStorage on every refresh.
  if(localStorage.getItem(MIG)!=="1"){
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k||k===DB||k===MIG)continue;
      mergeLegacy(db,readJSON(k));
    }
    localStorage.setItem(MIG,"1");
    localStorage.setItem(DB,JSON.stringify(db));
  }
  return db;
}
let state=init();
const save=()=>localStorage.setItem(DB,JSON.stringify(state));
function rate(date){const ks=Object.keys(state.rates).filter(x=>x<=date).sort();return ks.length?Number(state.rates[ks[ks.length-1]])||0:0}

function applySettings(s=state.settings){
  const shade=s.shade??62,blur=s.blur??7,trans=s.transparency??78;
  $("shadeRange").value=shade;$("blurRange").value=blur;$("transRange").value=trans;
  $("shadeOut").textContent=shade+"%";$("blurOut").textContent=blur+"px";$("transOut").textContent=trans+"%";
  $("shade").style.background=`rgba(2,5,16,${shade/100})`;
  $("backdrop").style.filter=`blur(${blur}px)`;
  $("backdrop").style.backgroundImage=s.bg?`url("${s.bg}")`:"radial-gradient(circle at 20% 10%,#17285c,#050814 55%,#12051f)";
  document.documentElement.style.setProperty("--drawer-alpha",String(Math.min(.92,Math.max(.25,trans/100))));
}
function setDates(){
  const [m,s]=bounds(),today=dk(new Date());
  $("date").min=dk(m);$("date").max=dk(s);
  if(!$("date").value||$("date").value<dk(m)||$("date").value>dk(s))$("date").value=today;
  $("advDate").min=dk(m);$("advDate").max=dk(s);
  if(!$("advDate").value||$("advDate").value<dk(m)||$("advDate").value>dk(s))$("advDate").value=today;
  updateDateText();
}
function updateDateText(){const d=pd($("date").value);if(!Number.isNaN(d.getTime()))$("dateText").textContent="Seleccionado: "+d.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
function render(){
  const w=wk(new Date()), entries=Object.entries(state.data).filter(([k])=>weekFromKey(k)===w).map(([k,v])=>({date:dateFromKey(k),v:Number(v)||0})).filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date));
  const total=entries.reduce((a,x)=>a+x.v,0), ad=state.advances[w]||[], advTotal=ad.reduce((a,x)=>a+(Number(x.amount)||0),0), today=dk(new Date()), r=rate(today), [m,s]=bounds();
  $("week").textContent="Semana "+w.split("-")[1];
  $("range").textContent=`Lunes ${m.getDate()} – Domingo ${s.getDate()} de ${s.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;
  $("total").textContent=total;$("gross").textContent=money(total*r);$("rateText").textContent=money(r);
  $("adv").textContent="-"+money(advTotal);$("advCount").textContent=ad.length;$("net").textContent=money(total*r-advTotal);
  $("daysText").textContent=entries.length?entries.length+" días registrados":"Sin registros";$("count").textContent=entries.length+" días";
  $("curRate").textContent=money(r);$("rate").value=r||"";
  setDates();
  $("list").innerHTML=entries.length?entries.map(e=>{
    const d=pd(e.date),rr=rate(e.date);
    return `<div class="row"><div class="dateLabel">${d.toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}<small>${d.toLocaleDateString("es-MX",{weekday:"long"})}</small></div><div class="rowRight"><b>${e.v} paquetes</b><small>${money(e.v*rr)}</small></div><div><button class="mini" onclick="editDay('${e.date}')">✏️</button><button class="mini" onclick="delDay('${e.date}')">🗑️</button></div></div>`
  }).join(""):"Aún no hay registros.";
  $("advList").innerHTML=ad.length?ad.map((x,i)=>`<div class="row"><div class="dateLabel">${esc(x.concept||"Préstamo")}<small>${pd(x.date).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}</small></div><div class="rowRight"><b>-${money(x.amount)}</b></div><button class="mini" onclick="delAdv(${i})">🗑️</button></div>`).join(""):"No hay adelantos.";
  const weeks=[...new Set(Object.keys(state.data).map(weekFromKey))].sort().reverse();
  $("history").innerHTML=weeks.length?weeks.map(x=>{
    const en=Object.entries(state.data).filter(([k])=>weekFromKey(k)===x),t=en.reduce((a,[,v])=>a+Number(v||0),0),dates=en.map(([k])=>dateFromKey(k)).filter(Boolean).sort(),rr=dates.length?rate(dates.at(-1)):0,a=(state.advances[x]||[]).reduce((z,q)=>z+Number(q.amount||0),0);
    return `<div class="row"><div class="dateLabel">Semana ${x.split("-")[1]}<small>${money(rr)} / paquete · adelantos ${money(a)}</small></div><div class="rowRight"><b>${t} paquetes</b><small>${money(t*rr-a)} a recibir</small></div></div>`
  }).join(""):"Todavía no hay semanas anteriores.";
  applySettings();
}
$("save").onclick=()=>{
  const n=Number($("qty").value),date=$("date").value,[m,s]=bounds(),d=pd(date);
  if(!Number.isFinite(n)||n<0||Number.isNaN(d.getTime())||d<m||d>s){alert("Selecciona un día de la semana actual, de lunes a domingo.");return}
  state.data[keyFor(wk(d),date)]=Math.floor(n);save();$("qty").value="";render();
};
$("date").addEventListener("change",updateDateText);
$("saveRate").onclick=()=>{
  const n=Number($("rate").value);if(!Number.isFinite(n)||n<0){alert("Escribe una tarifa válida.");return}
  state.rates[dk(new Date())]=n;save();render();
};
$("addAdv").onclick=()=>{$("advDate").value=dk(new Date());$("advPanel").classList.remove("hidden")};
$("cancelAdv").onclick=()=>$("advPanel").classList.add("hidden");
$("saveAdv").onclick=()=>{
  const amount=Number($("amount").value),concept=$("concept").value.trim()||"Préstamo",date=$("advDate").value,[m,s]=bounds(),d=pd(date);
  if(!Number.isFinite(amount)||amount<=0||Number.isNaN(d.getTime())||d<m||d>s){alert("Selecciona una fecha de esta semana y un monto válido.");return}
  const w=wk(d);state.advances[w]??=[];state.advances[w].push({amount,concept,date});save();$("advPanel").classList.add("hidden");$("amount").value="";$("concept").value="";render();
};
window.delAdv=i=>{const w=wk(new Date);if(!confirm("¿Eliminar adelanto?"))return;if(state.advances[w])state.advances[w].splice(i,1);save();render()};
window.editDay=date=>{$("editPanel").dataset.date=date;$("editQty").value=state.data[keyFor(wk(pd(date)),date)]||0;$("editPanel").classList.remove("hidden")};
$("cancelEdit").onclick=()=>$("editPanel").classList.add("hidden");
$("saveEdit").onclick=()=>{const date=$("editPanel").dataset.date,n=Number($("editQty").value);if(!Number.isFinite(n)||n<0)return;state.data[keyFor(wk(pd(date)),date)]=Math.floor(n);save();$("editPanel").classList.add("hidden");render()};
window.delDay=date=>{if(!confirm("¿Eliminar registro?"))return;delete state.data[keyFor(wk(pd(date)),date)];save();render()};
$("reset").onclick=()=>{if(!confirm("¿Borrar registros y adelantos de esta semana?"))return;const w=wk(new Date);for(const k of Object.keys(state.data))if(weekFromKey(k)===w)delete state.data[k];delete state.advances[w];save();render()};
$("historyToggle").onclick=()=>{const x=$("historyWrap");x.classList.toggle("open");$("historyToggle").textContent=x.classList.contains("open")?"⌃":"⌄"};
$("settingsBtn").onclick=()=>$("setPanel").classList.remove("hidden");
$("closeSet").onclick=()=>$("setPanel").classList.add("hidden");
$("bg").onchange=e=>{
  const f=e.target.files?.[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=()=>{const img=new Image();img.onload=()=>{
    const max=1400,scale=Math.min(1,max/img.width),w=Math.round(img.width*scale),h=Math.round(img.height*scale),c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);
    state.settings.bg=c.toDataURL("image/jpeg",.78);save();applySettings();
  };img.src=reader.result};
  reader.readAsDataURL(f);
};
$("removeBg").onclick=()=>{state.settings.bg=null;save();applySettings()};
$("shadeRange").oninput=e=>{state.settings.shade=Number(e.target.value);save();applySettings()};
$("blurRange").oninput=e=>{state.settings.blur=Number(e.target.value);save();applySettings()};
$("transRange").oninput=e=>{state.settings.transparency=Number(e.target.value);save();applySettings()};
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").then(r=>r.update()).catch(()=>{});
render();
