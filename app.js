const DB="corte_paquetes_v1_9",$=id=>document.getElementById(id);
const dk=d=>{d=new Date(d);return Number.isNaN(d.getTime())?null:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const pd=s=>{if(!s||!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(s)))return new Date(NaN);let[a,b,c]=String(s).split("-").map(Number);return new Date(a,b-1,c)};
const keyFor=(week,date)=>week+"_"+date;
const dateFromKey=k=>{let i=String(k).lastIndexOf("_");return i>=0?String(k).slice(i+1):null};
const weekFromKey=k=>String(k).split("_")[0];
function wk(d){d=new Date(d);d.setHours(0,0,0,0);d.setDate(d.getDate()+3-(d.getDay()+6)%7);let y=d.getFullYear(),f=new Date(y,0,4);return y+"-"+(1+Math.round(((d-f)/864e5-f.getDay()+1)/7))}
function bounds(){let n=new Date(),m=new Date(n),x=(n.getDay()+6)%7;m.setDate(n.getDate()-x);m.setHours(0,0,0,0);let s=new Date(m);s.setDate(m.getDate()+6);s.setHours(23,59,59,999);return[m,s]}
const empty=()=>({data:{},rates:{},advances:{},settings:{shade:62,blur:8,bg:null}});
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}};
function migrate(){
  let db=read(DB)||empty();
  db.data??={}; db.rates??={}; db.advances??={};
  db.settings={shade:62,blur:8,bg:null,transparency:78,...(db.settings||{})};

  // Recover older versions. Never delete their localStorage keys.
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i), x=read(k);
    if(!k||k===DB||!x||typeof x!=="object") continue;

    if(x.settings) db.settings={...x.settings,...db.settings};
    if(x.rates) for(const [rd,rv] of Object.entries(x.rates)) if(db.rates[rd]===undefined) db.rates[rd]=rv;

    if(x.data && typeof x.data==="object"){
      for(const [oldKey,v] of Object.entries(x.data)){
        let date=null;
        // Current/known key: YYYY-WW_YYYY-MM-DD
        if(String(oldKey).includes("_")) date=dateFromKey(oldKey);
        // Older plain date key
        if(!date && /^\\d{4}-\\d{2}-\\d{2}$/.test(oldKey)) date=oldKey;
        // Older keys with date embedded
        if(!date){
          const m=String(oldKey).match(/(20\\d{2})[-_/](\\d{1,2})[-_/](\\d{1,2})/);
          if(m) date=`${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
        }
        const d=pd(date);
        if(date && !Number.isNaN(d.getTime()) && Number.isFinite(Number(v))){
          db.data[keyFor(wk(d),date)]=Math.max(0,Math.floor(Number(v)));
        }
      }
    }

    if(x.advances && typeof x.advances==="object"){
      for(const [w,list] of Object.entries(x.advances)){
        if(!db.advances[w]) db.advances[w]=list;
      }
    }
  }

  // Repair malformed records already created by v1.9.
  const repaired={};
  for(const [k,v] of Object.entries(db.data)){
    let date=dateFromKey(k);
    if(!date){
      const m=String(k).match(/(20\\d{2})[-_/](\\d{1,2})[-_/](\\d{1,2})/);
      if(m) date=`${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
    }
    const d=pd(date);
    if(date && !Number.isNaN(d.getTime()) && Number.isFinite(Number(v))){
      repaired[keyFor(wk(d),date)]=Math.max(0,Math.floor(Number(v)));
    }
  }
  db.data=repaired;
  localStorage.setItem(DB,JSON.stringify(db));
  return db;
}
const load=()=>migrate(),save=x=>localStorage.setItem(DB,JSON.stringify(x));
const money=n=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(n)||0);
function rate(db,d){let a=Object.keys(db.rates).filter(x=>x<=d).sort();return a.length?Number(db.rates[a.at(-1)])||0:0}
function renderHistory(db,w){let ws=[...new Set(Object.keys(db.data).map(k=>weekFromKey(k)))].sort().reverse();$("history").innerHTML=ws.length?ws.map(x=>{let en=Object.entries(db.data).filter(([k])=>k.startsWith(x+"_")),t=en.reduce((a,[,v])=>a+Number(v||0),0),last=en.map(([k])=>dateFromKey(k)).sort().at(-1),rr=last?rate(db,last):0,a=(db.advances[x]||[]).reduce((z,q)=>z+Number(q.amount||0),0);return `<div class="row"><div class="dateLabel">Semana ${x.split("-")[1]}<small>${money(rr)} / paquete · adelantos ${money(a)}</small></div><div class="rowRight"><b>${t} paquetes</b><small>${money(t*rr-a)} a recibir</small></div></div>`}).join(""):"Todavía no hay semanas anteriores."}
function renderAdvances(a){$("advList").innerHTML=a.length?a.map((x,i)=>`<div class="row"><div class="dateLabel">${esc(x.concept||"Préstamo")}<small>${pd(x.date).toLocaleDateString("es-MX",{day:"numeric",month:"long"})}</small></div><div class="rowRight"><b>-${money(x.amount)}</b></div><button class="mini" onclick="delAdv(${i})">🗑️</button></div>`).join(""):"No hay adelantos."}
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
$("save").onclick=()=>{let n=Number($("qty").value),date=$("date").value,[m,s]=bounds(),d=pd(date);if(!Number.isFinite(n)||n<0||d<m||d>s){alert("Selecciona un día de la semana actual.");return}let db=load();db.data[keyFor(wk(d),date)]=Math.floor(n);save(db);$("qty").value="";refresh()};
$("date").onchange=()=>{$("dateText").textContent="Seleccionado: "+pd($("date").value).toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"})};
$("saveRate").onclick=()=>{let n=Number($("rate").value);if(!Number.isFinite(n)||n<0)return;let db=load();db.rates[dk(new Date())]=n;save(db);refresh()};
$("addAdv").onclick=()=>{$("advDate").value=dk(new Date());$("advPanel").classList.remove("hidden")};
$("cancelAdv").onclick=()=>$("advPanel").classList.add("hidden");
$("saveAdv").onclick=()=>{let a=Number($("amount").value),c=$("concept").value.trim()||"Préstamo",date=$("advDate").value,[m,s]=bounds(),d=pd(date);if(!Number.isFinite(a)||a<=0||d<m||d>s){alert("Selecciona un día de la semana actual.");return}let db=load(),w=wk(d);db.advances[w]??=[];db.advances[w].push({amount:a,concept:c,date});save(db);$("advPanel").classList.add("hidden");$("amount").value="";$("concept").value="";refresh()};
window.delAdv=i=>{let db=load(),w=wk(new Date);if(confirm("¿Eliminar adelanto?")){db.advances[w].splice(i,1);save(db);refresh()}};
window.editDay=s=>{$("editPanel").dataset.date=s;$("editQty").value=load().data[keyFor(wk(pd(s)),s)]||0;$("editPanel").classList.remove("hidden")};$("cancelEdit").onclick=()=>$("editPanel").classList.add("hidden");$("saveEdit").onclick=()=>{let s=$("editPanel").dataset.date,n=Number($("editQty").value);if(n<0||!Number.isFinite(n))return;let db=load();db.data[keyFor(wk(pd(s)),s)]=Math.floor(n);save(db);$("editPanel").classList.add("hidden");refresh()};window.delDay=s=>{if(confirm("¿Eliminar registro?")){let db=load();delete db.data[keyFor(wk(pd(s)),s)];save(db);refresh()}};
$("reset").onclick=()=>{if(confirm("¿Borrar registros y adelantos de esta semana?")){let db=load(),w=wk(new Date);Object.keys(db.data).filter(k=>weekFromKey(k)===w).forEach(k=>delete db.data[k]);delete db.advances[w];save(db);refresh()}};
$("historyToggle").onclick=()=>{let x=$("historyWrap");x.classList.toggle("open");$("historyToggle").textContent=x.classList.contains("open")?"⌃":"⌄"};
$("settingsBtn").onclick=()=>$("setPanel").classList.remove("hidden");$("closeSet").onclick=()=>$("setPanel").classList.add("hidden");
$("bg").onchange=e=>{let f=e.target.files?.[0];if(!f)return;let r=new FileReader();r.onload=()=>{let db=load();db.settings.bg=r.result;save(db);apply(db.settings)};r.readAsDataURL(f)};$("removeBg").onclick=()=>{let db=load();db.settings.bg=null;save(db);apply(db.settings)};$("shadeRange").oninput=e=>{let db=load();db.settings.shade=Number(e.target.value);save(db);apply(db.settings)};$("blurRange").oninput=e=>{let db=load();db.settings.blur=Number(e.target.value);save(db);apply(db.settings)};$("transRange").oninput=e=>{let db=load();db.settings.transparency=Number(e.target.value);save(db);apply(db.settings)};
function apply(s={}){
  const shade=s.shade??62, blur=s.blur??8, trans=s.transparency??78;
  $("shadeRange").value=shade; $("blurRange").value=blur; $("transRange").value=trans;
  $("shadeOut").textContent=shade+"%"; $("blurOut").textContent=blur+"px"; $("transOut").textContent=trans+"%";
  $("shade").style.background=`rgba(2,5,16,${shade/100})`;
  $("backdrop").style.filter=`blur(${blur}px)`;
  $("backdrop").style.backgroundImage=s.bg?`url("${s.bg}")`:"radial-gradient(circle at 20% 10%,#17285c,#050814 55%,#12051f)";
  // Higher percentage = more opaque. Keep a glass minimum so text remains readable.
  document.documentElement.style.setProperty("--drawer-alpha",String(Math.min(.92,Math.max(.22,trans/100))));
}
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").then(r=>r.update()).catch(()=>{});refresh();
const glassStyle=document.createElement("style");
glassStyle.textContent=`.glass{background:linear-gradient(135deg,rgba(30,48,78,var(--drawer-alpha)),rgba(7,14,32,calc(var(--drawer-alpha)*.62)))} `;
document.head.appendChild(glassStyle);
