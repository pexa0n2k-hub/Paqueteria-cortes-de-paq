const DB="corte_paquetes_v1_7";
const $=id=>document.getElementById(id);
const empty=()=>({data:{},rates:{},advances:{},settings:{shade:62,blur:8,bg:null}});
function readAny(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}}
function looksLikeDB(x){return x&&typeof x==="object"&&(x.data||x.rates||x.advances||x.settings||x.rate!==undefined)}
function normalizeDateKey(k){
  const m=String(k).match(/(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})/);
  if(!m)return null;
  return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
}
function migrate(){
  let cur=readAny(DB);
  if(!looksLikeDB(cur))cur=empty();
  if(!cur.data)cur.data={}; if(!cur.rates)cur.rates={}; if(!cur.advances)cur.advances={}; if(!cur.settings)cur.settings={shade:62,blur:8,bg:null};
  // Recover compatible data from older localStorage versions without deleting anything.
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i); if(!key||key===DB)continue;
    const x=readAny(key); if(!looksLikeDB(x))continue;
    if(x.settings){
      cur.settings={...x.settings,...cur.settings};
    }
    if(x.rates){
      Object.entries(x.rates).forEach(([d,v])=>{if(cur.rates[d]===undefined)cur.rates[d]=v});
    }
    if(x.rate!==undefined && Object.keys(cur.rates).length===0){
      cur.rates[dk(new Date())]=x.rate;
    }
    if(x.data){
      Object.entries(x.data).forEach(([k,v])=>{
        let date=normalizeDateKey(k);
        if(!date && /^\d{4}-\d{2}-\d{2}$/.test(k))date=k;
        if(date && Number.isFinite(Number(v))){
          cur.data[wk(pd(date))+"_"+date]=Math.max(0,Math.floor(Number(v)));
        }else if(k.includes("_")){
          const d=normalizeDateKey(k); if(d)cur.data[wk(pd(d))+"_"+d]=Number(v)||0;
        }
      });
    }
    if(x.advances){
      Object.entries(x.advances).forEach(([w,a])=>{if(!cur.advances[w])cur.advances[w]=a});
    }
  }
  localStorage.setItem(DB,JSON.stringify(cur)); return cur;
}
const load=()=>migrate(), save=x=>localStorage.setItem(DB,JSON.stringify(x));
const dk=d=>{d=new Date(d);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const pd=s=>{if(!s)return new Date(NaN);let[a,b,c]=s.split("-").map(Number);return new Date(a,b-1,c)};
function wk(d){d=new Date(d);d.setHours(0,0,0,0);d.setDate(d.getDate()+3-(d.getDay()+6)%7);let y=d.getFullYear(),f=new Date(y,0,4);return y+"-"+(1+Math.round(((d-f)/864e5-f.getDay()+1)/7))}
function bounds(){let n=new Date(),m=new Date(n),day=(n.getDay()+6)%7;m.setDate(n.getDate()-day);m.setHours(0,0,0,0);let s=new Date(m);s.setDate(m.getDate()+6);s.setHours(23,59,59,999);return[m,s]}
function rate(db,date){let ks=Object.keys(db.rates||{}).filter(x=>x<=date).sort();return ks.length?Number(db.rates[ks[ks.length-1]])||0:0}
const money=n=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(Number(n)||0);
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function setDates(db){
  const [m,s]=bounds(),today=dk(new Date());
  $("date").min=dk(m); $("date").max=dk(s);
  if(!$("date").value || $("date").value<dk(m) || $("date").value>dk(s)) $("date").value=today;
  $("advDate").min=dk(m); $("advDate").max=dk(s);
  if(!$("advDate").value || $("advDate").value<dk(m) || $("advDate").value>dk(s)) $("advDate").value=today;
  const d=pd($("date").value||today);
  $("dateText").textContent="Seleccionado: "+d.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}
function refresh(){
  const db=load(),w=wk(new Date()),es=Object.entries(db.data).filter(([k])=>k.startsWith(w+"_")).map(([k,v])=>({date:k.slice(3),v:Number(v)||0}));
  const today=dk(new Date()),r=rate(db,today),total=es.reduce((s,e)=>s+e.v,0),ad=db.advances?.[w]||[],at=ad.reduce((s,x)=>s+(Number(x.amount)||0),0),[m,s]=bounds();
  $("week").textContent="Semana "+w.split("-")[1];
  $("range").textContent=`Lunes ${m.getDate()} – Domingo ${s.getDate()} de ${s.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;
  $("total").textContent=total;$("gross").textContent=money(total*r);$("rateText").textContent=money(r);$("adv").textContent="-"+money(at);$("advCount").textContent=ad.length;$("net").textContent=money(total*r-at);
  $("daysText").textContent=es.length?es.length+" días registrados":"Sin registros";$("count").textContent=es.length+" días";$("curRate").textContent=money(r);$("rate").value=r||"";
  setDates(db);
  $("list").innerHTML=es.length?es.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>{let d=pd(e.date),rr=rate(db,e.date);return `<div class="row"><div class="dateLabel">${d.toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}<small>${d.toLocaleDateString("es-MX",{weekday:"long"})}</small></div><div class="rowRight"><b>${e.v} paquetes</b><small>${money(e.v*rr)}</small></div><div><button class="mini" onclick="editDay('${e.date}')">✏️</button><button class="mini" onclick="delDay('${e.date}')">🗑️</button></div></div>`}).join(""):"Aún no hay registros.";
  $("advList").innerHTML=ad.length?ad.map((x,i)=>`<div class="row"><div class="dateLabel">${esc(x.concept||"Préstamo")}<small>${pd(x.date).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}</small></div><div class="rowRight"><b>-${money(x.amount)}</b></div><button class="mini" onclick="delAdv(${i})">🗑️</button></div>`).join(""):"No hay adelantos.";
  const ws=[...new Set(Object.keys(db.data).map(k=>k.split("_")[0]))].sort().reverse();
  $("history").innerHTML=ws.length?ws.map(x=>{let en=Object.entries(db.data).filter(([k])=>k.startsWith(x+"_")),t=en.reduce((z,[,v])=>z+(Number(v)||0),0),last=en.map(([k])=>k.slice(3)).sort().pop(),rr=last?rate(db,last):0,a=(db.advances?.[x]||[]).reduce((z,q)=>z+(Number(q.amount)||0),0);return `<div class="row"><div class="dateLabel">Semana ${x.split("-")[1]}<small>${money(rr)} / paquete · adelantos ${money(a)}</small></div><div class="rowRight"><b>${t} paquetes</b><small>${money(t*rr-a)} a recibir</small></div></div>`}).join(""):"Todavía no hay semanas anteriores.";
  apply(db.settings);
}
$("date").addEventListener("change",()=>{const d=pd($("date").value);$("dateText").textContent=d.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long",year:"numeric"})});
$("save").onclick=()=>{
  let n=Number($("qty").value); let date=$("date").value||dk(new Date()); const [m,s]=bounds(),d=pd(date);
  if(!Number.isFinite(n)||n<0||Number.isNaN(d.getTime())||d<m||d>s){alert("Selecciona un día de la semana actual, de lunes a domingo.");return}
  const db=load(); db.data[wk(d)+"_"+date]=Math.floor(n); save(db); $("qty").value=""; refresh();
};
$("saveRate").onclick=()=>{let n=Number($("rate").value);if(!Number.isFinite(n)||n<0)return;let db=load();db.rates[dk(new Date())]=n;save(db);refresh()};
$("addAdv").onclick=()=>{$("advDate").value=dk(new Date());$("advPanel").classList.remove("hidden")};
$("cancelAdv").onclick=()=>$("advPanel").classList.add("hidden");
$("saveAdv").onclick=()=>{let a=Number($("amount").value),c=$("concept").value.trim()||"Préstamo",date=$("advDate").value||dk(new Date()),[m,s]=bounds(),d=pd(date);if(!Number.isFinite(a)||a<=0||Number.isNaN(d.getTime())||d<m||d>s){alert("Selecciona un día de la semana actual.");return}let db=load(),w=wk(d);db.advances[w]??=[];db.advances[w].push({amount:a,concept:c,date});save(db);$("advPanel").classList.add("hidden");$("amount").value="";$("concept").value="";refresh()};
window.delAdv=i=>{if(!confirm("¿Eliminar adelanto?"))return;let db=load(),w=wk(new Date);if(db.advances[w])db.advances[w].splice(i,1);save(db);refresh()};
window.editDay=s=>{$("editPanel").dataset.date=s;$("editTitle").textContent="Editar "+pd(s).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"});$("editQty").value=load().data[wk(pd(s))+"_"+s]||0;$("editPanel").classList.remove("hidden")};
$("cancelEdit").onclick=()=>$("editPanel").classList.add("hidden");
$("saveEdit").onclick=()=>{let s=$("editPanel").dataset.date,n=Number($("editQty").value);if(!Number.isFinite(n)||n<0)return;let db=load();db.data[wk(pd(s))+"_"+s]=Math.floor(n);save(db);$("editPanel").classList.add("hidden");refresh()};
window.delDay=s=>{if(!confirm("¿Eliminar registro?"))return;let db=load();delete db.data[wk(pd(s))+"_"+s];save(db);refresh()};
$("reset").onclick=()=>{if(!confirm("¿Borrar registros y adelantos de esta semana?"))return;let db=load(),w=wk(new Date);Object.keys(db.data).filter(k=>k.startsWith(w+"_")).forEach(k=>delete db.data[k]);delete db.advances[w];save(db);refresh()};
$("settingsBtn").onclick=()=>{load();$("setPanel").classList.remove("hidden")};
$("closeSet").onclick=()=>$("setPanel").classList.add("hidden");
$("bg").onchange=e=>{let f=e.target.files?.[0];if(!f)return;let r=new FileReader();r.onload=()=>{let db=load();db.settings.bg=r.result;save(db);apply(db.settings)};r.readAsDataURL(f)};
$("removeBg").onclick=()=>{let db=load();db.settings.bg=null;save(db);apply(db.settings)};
$("shadeRange").oninput=e=>{let db=load();db.settings.shade=Number(e.target.value);save(db);apply(db.settings)};
$("blurRange").oninput=e=>{let db=load();db.settings.blur=Number(e.target.value);save(db);apply(db.settings)};
$("reloadApp").onclick=async()=>{if("serviceWorker"in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)await r.update()}location.href=location.pathname+"?v=1.7&t="+Date.now()};
function apply(s={}){$("shadeRange").value=s.shade??62;$("blurRange").value=s.blur??8;$("shadeOut").textContent=(s.shade??62)+"%";$("blurOut").textContent=(s.blur??8)+"px";$("shade").style.background=`rgba(3,7,18,${(s.shade??62)/100})`;$("backdrop").style.filter=`blur(${s.blur??8}px)`;$("backdrop").style.backgroundImage=s.bg?`url("${s.bg}")`:"linear-gradient(135deg,#162b50,#07111e)"}
if("serviceWorker"in navigator){navigator.serviceWorker.register("./sw.js").then(r=>r.update()).catch(()=>{})}
window.addEventListener("DOMContentLoaded",refresh);