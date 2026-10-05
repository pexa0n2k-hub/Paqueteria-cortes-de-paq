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
  settings: {shade:62, blur:7, transparency:78, bg:null, accentMode:"auto", accent:"#72F4FF", theme:"glass"}
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

/* ===== v1.33 MultiTheme — robust runtime theme engine ===== */
const THEME_KEY="corte_paquetes_theme";
const THEMES={
  glass:{label:"Glass iOS Premium"},
  cyberpunk:{label:"Cyberpunk Pro"},
  luxury:{label:"Dark Luxury"}
};
function normalizeTheme(value){return THEMES[value]?value:"glass";}
function getTheme(){
  let theme=state?.settings?.theme||"glass";
  try{const saved=localStorage.getItem(THEME_KEY);if(saved)theme=saved;}catch(e){}
  return normalizeTheme(theme);
}
function applyTheme(theme=getTheme(),persist=true){
  theme=normalizeTheme(theme);
  if(state?.settings) state.settings.theme=theme;
  document.body.dataset.theme=theme;
  document.documentElement.dataset.theme=theme;
  document.body.classList.remove("theme-glass","theme-cyberpunk","theme-luxury");
  document.body.classList.add("theme-"+theme);
  if(persist){try{localStorage.setItem(THEME_KEY,theme)}catch(e){}}
  const label=$("themeCurrentLabel");
  if(label) label.textContent=THEMES[theme].label;
  document.querySelectorAll(".themeOption").forEach(btn=>{
    const active=btn.dataset.theme===theme;
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-checked",active?"true":"false");
  });
  return theme;
}
function bindThemes(){
  applyTheme(getTheme(),false);
  document.querySelectorAll(".themeOption").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const theme=applyTheme(btn.dataset.theme,true);
      if(state?.settings){state.settings.theme=theme;safeWrite();}
      btn.blur();
    });
  });
}

function rateFor(date){
  let result=Number(state.rate)||0;
  for(const r of state.rateHistory){
    if(r.date<=date) result=Number(r.rate)||0;
  }
  return result;
}

/* ===== v1.29 Historial de Cortes Semanales ===== */
const WEEKLY_CUTS_KEY="corte_paquetes_weekly_cuts";
function readWeeklyCuts(){
  try{
    const raw=localStorage.getItem(WEEKLY_CUTS_KEY);
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr:[];
  }catch(e){return []}
}
function writeWeeklyCuts(arr){
  try{localStorage.setItem(WEEKLY_CUTS_KEY,JSON.stringify(arr));return true}
  catch(e){console.warn("No se pudo guardar historial de cortes",e);return false}
}
function cutDataForRange(start,end,forcedRate=null){
  const startDate=start instanceof Date?new Date(start):parseDate(start);
  const endDate=end instanceof Date?new Date(end):parseDate(end);
  startDate.setHours(0,0,0,0); endDate.setHours(23,59,59,999);
  const startKey=dateKey(startDate), endKey=dateKey(endDate);
  const entries=Object.entries(state.records)
    .filter(([d])=>d>=startKey&&d<=endKey)
    .sort((a,b)=>a[0].localeCompare(b[0]));
  const total=entries.reduce((sum,[,v])=>sum+Number(v||0),0);
  const rate=forcedRate===null?rateFor(dateKey(new Date())):Number(forcedRate)||0;
  const advances=[];
  for(const [d,list] of Object.entries(state.advances)){
    if(d>=startKey&&d<=endKey&&Array.isArray(list)){
      for(const x of list) advances.push({date:d,amount:Number(x.amount)||0,concept:String(x.concept||"Préstamo")});
    }
  }
  const adv=advances.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const days=[];
  for(let i=0;i<7;i++){
    const dt=new Date(startDate);dt.setDate(startDate.getDate()+i);
    const key=dateKey(dt);
    days.push({date:key,value:Number(state.records[key]||0),has:Object.prototype.hasOwnProperty.call(state.records,key)});
  }
  return {
    start:startDate,end:endDate,startKey,endKey,total,rate,gross:total*rate,adv,net:total*rate-adv,
    entries,advances,days,
    bg:state.settings.bg||null,shade:Number(state.settings.shade??62),
    accentMode:state.settings.accentMode||"auto",accent:state.settings.accent||"#72F4FF"
  };
}
function snapshotFromCut(cut){
  return {
    id:cut.startKey,
    weekStart:cut.startKey,
    weekEnd:cut.endKey,
    total:Number(cut.total)||0,
    rate:Number(cut.rate)||0,
    gross:Number(cut.gross)||0,
    adv:Number(cut.adv)||0,
    net:Number(cut.net)||0,
    days:(cut.days||[]).map(x=>({date:x.date,value:Number(x.value)||0,has:!!x.has})),
    advances:(cut.advances||[]).map(x=>({date:x.date,amount:Number(x.amount)||0,concept:String(x.concept||"Préstamo")})),
    bg:cut.bg||null,shade:Number(cut.shade??62),
    accentMode:cut.accentMode||"auto",accent:cut.accent||"#72F4FF",
    savedAt:Date.now(),version:"1.29"
  };
}
function saveWeeklyCut(cut){
  const snap=snapshotFromCut(cut), all=readWeeklyCuts();
  const idx=all.findIndex(x=>x.weekStart===snap.weekStart);
  if(idx>=0) all[idx]={...all[idx],...snap}; else all.push(snap);
  all.sort((a,b)=>String(b.weekStart).localeCompare(String(a.weekStart)));
  writeWeeklyCuts(all);
  return snap;
}
function archiveCompletedWeeks(){
  const currentStart=dateKey(monday(new Date()));
  const keys=new Set([...Object.keys(state.records),...Object.keys(state.advances)]);
  const weeks=[...keys].filter(Boolean).map(weekKey).filter(w=>w&&w<currentStart);
  for(const w of new Set(weeks)){
    const st=parseDate(w), en=new Date(st);en.setDate(st.getDate()+6);
    saveWeeklyCut(cutDataForRange(st,en,rateFor(dateKey(en))));
  }
}
function snapshotToCut(s){
  const st=parseDate(s.weekStart),en=parseDate(s.weekEnd);
  const entries=(s.days||[]).filter(x=>x.has||Number(x.value)>0).map(x=>[x.date,Number(x.value)||0]);
  return {start:st,end:en,startKey:s.weekStart,endKey:s.weekEnd,total:Number(s.total)||0,rate:Number(s.rate)||0,gross:Number(s.gross)||0,adv:Number(s.adv)||0,net:Number(s.net)||0,entries,advances:s.advances||[],days:s.days||[],bg:s.bg||null,shade:Number(s.shade??62),accentMode:s.accentMode||"auto",accent:s.accent||"#72F4FF",historical:true,id:s.id};
}
function formatCutRange(c){
  const a=parseDate(c.weekStart),b=parseDate(c.weekEnd);
  return `${a.getDate()} – ${b.getDate()} de ${b.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;
}
function openCutHistory(){
  const modal=$("cutHistoryModal");if(!modal)return;
  modal.classList.remove("hidden");renderCutHistoryList();
  requestAnimationFrame(()=>{ modal.scrollTop=0; const panel=modal.querySelector(".historySlidePanel"); if(panel) panel.scrollTop=0; });
}
function closeCutHistory(){const m=$("cutHistoryModal");if(m)m.classList.add("hidden")}
function renderCutHistoryList(){
  const box=$("cutHistoryBody");if(!box)return;
  const cuts=readWeeklyCuts();
  box.innerHTML=cuts.length?cuts.map(c=>`<article class="cutHistoryItem glass">
    <div class="cutHistoryMain"><div class="eyebrow">CORTE SEMANAL</div><h3>${formatCutRange(c)}</h3><div class="cutHistoryStats"><span>📦 <b>${Number(c.total)||0}</b> paquetes</span><span>💰 <b>${money(c.net)}</b> a recibir</span><span>💵 ${money(c.rate)}/paq</span></div></div>
    <div class="cutHistoryActions"><button class="glass action" onclick="viewSavedCut('${esc(c.id)}')">👁️ Ver</button><button class="neonBtn action" onclick="shareSavedCut('${esc(c.id)}')">📲 Compartir</button><button class="glass action danger" onclick="deleteSavedCut('${esc(c.id)}')">🗑️</button></div>
  </article>`).join(""):`<div class="historyHint">Aún no tienes cortes guardados. Al compartir un corte se guardará automáticamente.</div>`;
}
window.viewSavedCut=id=>{
  const c=readWeeklyCuts().find(x=>x.id===id);if(!c)return;
  const days=(c.days||[]).map(x=>`<div class="savedDay"><span>${parseDate(x.date).toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"2-digit"})}</span><b>${Number(x.value)||0}</b></div>`).join("");
  $("cutHistoryBody").innerHTML=`<div class="cutDetail glass"><button class="glass backCut" onclick="renderCutHistoryList()">← Volver a cortes</button><div class="eyebrow">CORTE GUARDADO</div><h2>${formatCutRange(c)}</h2><div class="cutDetailHero"><strong>${Number(c.total)||0}</strong><span>paquetes</span><b>${money(c.net)}</b><span>a recibir</span></div><div class="cutDetailGrid"><div><small>Tarifa</small><b>${money(c.rate)}</b></div><div><small>Bruto</small><b>${money(c.gross)}</b></div><div><small>Adelantos</small><b>-${money(c.adv)}</b></div></div><h3>Resumen diario</h3><div class="savedDays">${days}</div><div class="actions"><button class="glass action danger" onclick="deleteSavedCut('${esc(c.id)}')">🗑️ Eliminar</button><button class="neonBtn action" onclick="shareSavedCut('${esc(c.id)}')">📲 Compartir nuevamente</button></div></div>`;
};
window.deleteSavedCut=id=>{
  const c=readWeeklyCuts().find(x=>x.id===id);if(!c)return;
  if(!confirm(`¿Eliminar el corte del ${formatCutRange(c)}? Esto no borrará tus registros diarios.`))return;
  writeWeeklyCuts(readWeeklyCuts().filter(x=>x.id!==id));renderCutHistoryList();
};
window.shareSavedCut=async id=>{
  const c=readWeeklyCuts().find(x=>x.id===id);if(!c)return;
  const cut=snapshotToCut(c);closeCutHistory();await shareCut(cut);
};



/* ===== v1.28.4 accent persistence/custom picker ===== */
const ACCENT_MODE_KEY="corte_accent_mode";
const ACCENT_COLOR_KEY="corte_accent_color";

function readAccentPrefs(){
  let mode=null,color=null;
  try{
    mode=localStorage.getItem(ACCENT_MODE_KEY);
    color=localStorage.getItem(ACCENT_COLOR_KEY);
  }catch(e){}
  if(mode!=="auto"&&mode!=="preset"&&mode!=="custom")mode=null;
  if(!/^#[0-9a-f]{6}$/i.test(color||""))color=null;
  if(mode)state.settings.accentMode=mode;
  if(color)state.settings.accent=color;
}
function saveAccentPrefs(){
  try{
    localStorage.setItem(ACCENT_MODE_KEY,state.settings.accentMode||"auto");
    localStorage.setItem(ACCENT_COLOR_KEY,state.settings.accent||"#72F4FF");
  }catch(e){}
}
function hexRgb(hex){
  const m=String(hex||"").replace("#","").match(/^([0-9a-f]{6})$/i);
  if(!m)return null;
  const n=parseInt(m[1],16);
  return {r:n>>16,g:(n>>8)&255,b:n&255};
}
function applyAccentDerived(hex){
  const rgb=hexRgb(hex)||{r:114,g:244,b:255};
  const {r,g,b}=rgb;
  const safeHex="#"+[r,g,b].map(x=>Math.round(x).toString(16).padStart(2,"0")).join("");
  document.documentElement.style.setProperty("--accent",safeHex);
  document.documentElement.style.setProperty("--accent-rgb",`${r},${g},${b}`);
  document.documentElement.style.setProperty("--accent-glow",`rgba(${r},${g},${b},.34)`);
  document.documentElement.style.setProperty("--accent-soft",`rgba(${r},${g},${b},.14)`);
  let tag=document.getElementById("runtimeAccentStyle");
  if(!tag){tag=document.createElement("style");tag.id="runtimeAccentStyle";document.head.appendChild(tag)}
  tag.textContent=`
    :root{--accent:${safeHex};--accent-rgb:${r},${g},${b};--cyan:${safeHex}}
    .brandMark,.cube,.hero b,.heroMain .eyebrow,.statsGrid b,.neonCircle,.neonBtn,.shareCut,
    .topIcon,.sectionTitle span,.historyHint strong,.dashboardV27Header small,.dashboardV27CardHead small,
    .dashboardV27Stat strong,.accentSettings label{color:${safeHex}!important}
    .neonBtn,.shareCut,.neonCircle,.topIcon{
      border-color:rgba(${r},${g},${b},.72)!important;
      box-shadow:0 0 24px rgba(${r},${g},${b},.34),inset 0 1px 1px rgba(255,255,255,.52)!important
    }
    .neonBtn{background:linear-gradient(135deg,rgba(${r},${g},${b},.34),rgba(${r},${g},${b},.10))!important}
    .hero b{text-shadow:0 0 28px rgba(${r},${g},${b},.34)!important}
    .bar,.chartBar,.progress i,.progressBar>i,.dashboardV27Day i{
      background:linear-gradient(180deg,${safeHex},rgba(${r},${g},${b},.58))!important;
      box-shadow:0 0 18px rgba(${r},${g},${b},.30)!important
    }
    .accentDot[data-accent="${safeHex}"]{outline:3px solid rgba(255,255,255,.9);outline-offset:3px}
    .dailySummary .dayCell .dash,.dailySummary .dayCell .progress,.dailySummary .dayCell .progress i{background:${safeHex}!important;box-shadow:0 0 12px rgba(${r},${g},${b},.34)!important}
    .dailySummary .dayCell .qty{color:${safeHex}!important;text-shadow:0 0 14px rgba(${r},${g},${b},.34)!important}
  `;
}
function detectAccentFromImage(dataUrl){
  return new Promise(resolve=>{
    if(!dataUrl || !String(dataUrl).startsWith("data:image")) return resolve("#72F4FF");
    const img=new Image();
    img.onload=()=>{
      try{
        const cv=document.createElement("canvas"),ctx=cv.getContext("2d",{willReadFrequently:true});
        cv.width=32;cv.height=32;ctx.drawImage(img,0,0,32,32);
        const d=ctx.getImageData(0,0,32,32).data;
        let r=0,g=0,b=0,n=0;
        for(let i=0;i<d.length;i+=16){r+=d[i];g+=d[i+1];b+=d[i+2];n++}
        r/=n;g/=n;b/=n;
        const max=Math.max(r,g,b),min=Math.min(r,g,b),spread=max-min;
        if(spread<20){r=70;g=215;b=240}
        else if(max===r){g*=.72;b*=.72}
        else if(max===g){r*=.62;b*=.86}
        else {r*=.82;g*=.65}
        const top=Math.max(r,g,b)||1,scale=235/top;
        r=Math.min(255,r*scale);g=Math.min(255,g*scale);b=Math.min(255,b*scale);
        resolve("#"+[r,g,b].map(x=>Math.round(x).toString(16).padStart(2,"0")).join(""));
      }catch(e){resolve("#72F4FF")}
    };
    img.onerror=()=>resolve("#72F4FF");
    img.src=dataUrl;
  });
}
async function applyAccentSettings(){
  readAccentPrefs();
  const s=state.settings||{};
  const mode=s.accentMode||"auto";
  const modeEl=$("accentMode"), colorEl=$("accentColor"), presets=$("accentPresets"), custom=$("customAccentRow");
  if(modeEl)modeEl.value=mode;
  if(colorEl && /^#[0-9a-f]{6}$/i.test(s.accent||"")){
    colorEl.value=s.accent;
    const out=$("accentColorValue"); if(out)out.textContent=s.accent.toUpperCase();
  }
  if(presets)presets.style.display=mode==="preset"?"flex":"none";
  if(custom)custom.style.display=mode==="custom"?"flex":"none";
  if(mode==="auto"){
    const detected=await detectAccentFromImage(s.bg);
    applyAccentDerived(detected);
  }else{
    applyAccentDerived(s.accent||"#72F4FF");
  }
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
  applyAccentSettings();
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

/* v1.35 — quick quantity visual controls */
document.querySelectorAll(".quickQtyBtn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const add=Math.max(0,Math.floor(Number(btn.dataset.qty)||0));
    const input=$("qty"); if(!input)return;
    const current=Math.max(0,Math.floor(Number(input.value)||0));
    input.value=String(current+add);
    input.focus();
    btn.animate?.([{transform:"scale(.92)"},{transform:"scale(1)"}],{duration:180,easing:"cubic-bezier(.2,.8,.2,1)"});
  });
});

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
$("savedCutsBtn") && $("savedCutsBtn").addEventListener("click",openCutHistory);
$("closeCutHistory").onclick=closeCutHistory;

bindThemes();

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
  return cutDataForRange(monday(new Date()),sunday(new Date()),rateFor(dateKey(new Date())));
}
function rr(ctx,x,y,w,h,r){const q=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath()}
function dg(ctx,x,y,w,h,r=28){
  const shareTheme=getTheme();
  const shareAccent=getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()||"#72f4ff";
  const shareBorder=shareTheme==="cyberpunk"?"rgba(255,59,212,.52)":shareTheme==="luxury"?"rgba(215,166,58,.52)":"rgba(255,255,255,.42)";
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
  if(shareTheme==="cyberpunk"){
    g.addColorStop(0,"rgba(255,59,212,.16)");
    g.addColorStop(.45,"rgba(90,30,150,.10)");
    g.addColorStop(1,"rgba(5,3,18,.72)");
  }else if(shareTheme==="luxury"){
    g.addColorStop(0,"rgba(215,166,58,.13)");
    g.addColorStop(.45,"rgba(255,255,255,.06)");
    g.addColorStop(1,"rgba(18,10,3,.72)");
  }else{
    g.addColorStop(0,"rgba(255,255,255,.18)");
    g.addColorStop(.45,"rgba(255,255,255,.10)");
    g.addColorStop(1,"rgba(8,18,38,.58)");
  }
  ctx.fillStyle=g;
  ctx.fillRect(x,y,w,h);

  // Sutil velo oscuro para que los textos sigan siendo legibles.
  const shade=ctx.createLinearGradient(0,y,0,y+h);
  shade.addColorStop(0,"rgba(5,12,26,.08)");
  shade.addColorStop(1,"rgba(5,12,26,.20)");
  ctx.fillStyle=shareTheme==="cyberpunk"?"rgba(8,4,20,.72)":shareTheme==="luxury"?"rgba(18,12,5,.76)":shade;
  ctx.fillRect(x,y,w,h);
  ctx.restore();

  // Borde, brillo superior y reflejo interno.
  ctx.save();
  path();
  ctx.strokeStyle=shareBorder;
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
async function loadShareWallpaper(preferred){
  const candidates=[];
  if(preferred && String(preferred).startsWith("data:image")) candidates.push(preferred);
  if(state?.settings?.bg && String(state.settings.bg).startsWith("data:image") && !candidates.includes(state.settings.bg)) candidates.push(state.settings.bg);
  try{
    const backdrop=$("backdrop");
    const css=getComputedStyle(backdrop);
    const match=String(css.backgroundImage||"").match(/url\(["']?(.*?)["']?\)/);
    if(match && match[1] && !/^data:,?$/.test(match[1]) && !/^radial-gradient|^linear-gradient/.test(match[1])){
      const url=match[1].replace(/\\"/g,'"').replace(/\\'/g,"'");
      if(url.startsWith("data:image")) candidates.push(url);
    }
  }catch(e){}
  for(const src of candidates){
    try{
      const img=await new Promise((resolve,reject)=>{
        const im=new Image();
        im.onload=()=>resolve(im); im.onerror=reject; im.src=src;
      });
      return img;
    }catch(e){}
  }
  return null;
}

async function renderShareImage(cut=null){
  const d=cut||currentCutData(), canvas=$("shareCanvas"), W=1080, H=1350;
  const scale=Math.min(3,Math.max(2,devicePixelRatio||2));
  canvas.width=W*scale; canvas.height=H*scale;
  const ctx=canvas.getContext("2d"); ctx.scale(scale,scale);

  // 1) Wallpaper real de la app. Primero usa el guardado; si no está disponible,
  // recupera el mismo dataURL que está renderizado actualmente en #backdrop.
  const shareShade=Number(d.shade??state.settings.shade??62);
  // Resolver tema/acento ANTES de construir el wallpaper compartido.
  // v1.34.5: evita el ReferenceError que impedía abrir/compartir la imagen.
  const theme=getTheme();
  const accent=getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()||"#72f4ff";
  const accentRgb=getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim()||"114,244,255";
  const isCyber=theme==="cyberpunk", isLuxury=theme==="luxury";
  const img=await loadShareWallpaper(d.bg||state.settings.bg);
  if(img){
    const sc=Math.max(W/img.width,H/img.height), iw=img.width*sc, ih=img.height*sc;
    ctx.drawImage(img,(W-iw)/2,(H-ih)/2,iw,ih);
    // Mantener el wallpaper visible: el velo es configurable y nunca reemplaza la imagen.
    const shadeAlpha=Math.min(.72,Math.max(.08,shareShade/100));
    ctx.fillStyle=`rgba(2,5,16,${shadeAlpha})`; ctx.fillRect(0,0,W,H);
    const veil=ctx.createLinearGradient(0,0,W,H);
    if(isCyber){ veil.addColorStop(0,"rgba(255,0,180,.08)"); veil.addColorStop(1,"rgba(0,220,255,.08)"); }
    else if(isLuxury){ veil.addColorStop(0,"rgba(215,166,58,.07)"); veil.addColorStop(1,"rgba(80,45,8,.08)"); }
    else { veil.addColorStop(0,`rgba(${accentRgb},.045)`); veil.addColorStop(1,`rgba(${accentRgb},.06)`); }
    ctx.fillStyle=veil; ctx.fillRect(0,0,W,H);
  }else{
    // Solo usamos un fondo sólido si realmente no existe ningún wallpaper disponible.
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

  const white=isLuxury?"#fffaf0":"#f8fbff";
  const cyan=accent;
  const mint=isLuxury?"#f2c76b":accent;
  const muted=isLuxury?"#c7bda8":"#a9b8ca";
  const secondary=isCyber?"#ff3bd4":isLuxury?"#d7a63a":accent;
  const cardFill=isCyber?"rgba(10,5,24,.68)":isLuxury?"rgba(16,12,7,.72)":"rgba(255,255,255,.10)";
  const cardBorder=isCyber?`rgba(255,59,212,.42)`:isLuxury?"rgba(215,166,58,.42)":"rgba(255,255,255,.42)";
  const glow=`rgba(${accentRgb},.42)`;
  const text=(s,x,y,size,weight="700",color=white)=>{
    ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui,-apple-system,sans-serif`;ctx.fillText(s,x,y);
  };
  const moneyFit=(value,max,size)=>fit(ctx,value,max,size);

  // Header — igual a la composición premium del mockup.
  text("CORTE DE PAQUETES",55,63,20,"900",cyan);
  text("Corte semanal",55,112,42,"850",white);
  text(`${d.start.getDate()} – ${d.end.getDate()} de ${d.end.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`,55,148,19,"500",muted);
  const themeLabel=isCyber?"CYBERPUNK PRO":isLuxury?"DARK LUXURY":"GLASS iOS PREMIUM";
  text(themeLabel,55,174,13,"800",secondary);

  // Botón compartir visual en la tarjeta exportada.
  dg(ctx,930,28,100,90,25);
  ctx.save();ctx.strokeStyle=cyan;ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(980,91);ctx.lineTo(980,48);ctx.moveTo(980,48);ctx.lineTo(966,62);ctx.moveTo(980,48);ctx.lineTo(994,62);ctx.moveTo(958,71);ctx.lineTo(958,97);ctx.quadraticCurveTo(958,103,964,103);ctx.lineTo(996,103);ctx.quadraticCurveTo(1002,103,1002,97);ctx.lineTo(1002,71);ctx.stroke();ctx.restore();

  // Paquetes — tarjeta ancha rectangular.
  dg(ctx,42,188,996,245,27);
  text("PAQUETES ENTREGADOS",76,238,17,"900",cyan);
  text(String(d.total),76,328,92,"900",white);
  text(`${d.entries.length} días registrados`,76,371,19,"500",muted);

  // Divisor y tarjeta de tarifa.
  ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(600,236);ctx.lineTo(600,397);ctx.stroke();
  dg(ctx,650,272,78,78,20);
  // package icon
  ctx.save();ctx.strokeStyle="#dce8f5";ctx.lineWidth=2.2;ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(669,294);ctx.lineTo(689,284);ctx.lineTo(709,294);ctx.lineTo(689,304);ctx.closePath();
  ctx.moveTo(669,294);ctx.lineTo(669,317);ctx.lineTo(689,328);ctx.lineTo(709,317);ctx.lineTo(709,294);
  ctx.moveTo(689,304);ctx.lineTo(689,328);ctx.stroke();ctx.restore();
  text(money(d.rate),755,313,30,"800",white);
  text("por paquete",755,343,18,"500",muted);

  // Dos tarjetas métricas.
  dg(ctx,42,455,478,190,25); dg(ctx,560,455,478,190,25);
  dg(ctx,80,520,65,65,18); dg(ctx,596,520,65,65,18);

  // Ganancia icon.
  ctx.save();ctx.strokeStyle=accent;ctx.lineWidth=2.8;ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();ctx.moveTo(98,568);ctx.lineTo(108,558);ctx.lineTo(116,563);ctx.lineTo(130,545);ctx.moveTo(99,574);ctx.lineTo(99,548);ctx.moveTo(99,574);ctx.lineTo(132,574);ctx.stroke();ctx.restore();
  text("GANANCIA BRUTA",170,505,17,"900",cyan);
  text(money(d.gross),170,564,moneyFit(money(d.gross),300,42),"900",white);
  text(`${d.total} × ${money(d.rate)}`,170,603,18,"500",muted);

  // Wallet icon.
  ctx.save();ctx.strokeStyle=secondary;ctx.lineWidth=2.5;ctx.lineJoin="round";
  ctx.beginPath();ctx.roundRect(613,539,35,27,5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(613,546);ctx.lineTo(646,546);ctx.quadraticCurveTo(655,546,655,554);ctx.lineTo(646,554);ctx.stroke();
  ctx.beginPath();ctx.arc(645,554,2,0,Math.PI*2);ctx.fillStyle=secondary;ctx.fill();ctx.restore();
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
    const dayData=d.days?.[i];
    const val=Number(dayData?.value ?? state.records[dateKey(dt)] ?? 0);
    dg(ctx,x0+i*(cellW+gap),y0,cellW,cellH,18);
    text(labels[i],x0+i*(cellW+gap)+31,y0+37,14,"800",white);
    text(`${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}`,x0+i*(cellW+gap)+30,y0+61,12,"500",muted);
    ctx.fillStyle=accent;ctx.shadowColor=glow;ctx.shadowBlur=8;ctx.fillRect(x0+i*(cellW+gap)+40,y0+78,36,3);ctx.shadowBlur=0;
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
  text(`Corte de Paquetes • ${themeLabel}`,55,1330,13,"500","rgba(255,255,255,.50)");

  return new Promise(resolve=>canvas.toBlob(resolve,"image/png",1));
}
async function shareCut(cut=null){
  if(!cut){
    cut=currentCutData();
    saveWeeklyCut(cut);
  }
  const blob=await renderShareImage(cut);if(!blob)return;const file=new File([blob],"corte-de-paquetes.png",{type:"image/png"});
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({title:"Corte de Paquetes",text:`Corte semanal ${dateKey(cut.start)} – ${dateKey(cut.end)}.`,files:[file]});return}catch(e){if(e.name==="AbortError")return}}
  $("sharePanel").classList.remove("hidden");
}
$("shareCut").onclick=()=>shareCut();
$("shareTop").onclick=()=>shareCut();$("closeShare").onclick=()=>$("sharePanel").classList.add("hidden");$("nativeShare").onclick=()=>shareCut();
$("downloadShare").onclick=async()=>{const blob=await renderShareImage();if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="corte-de-paquetes.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js?v=1.36.2").then(r=>r.update()).catch(()=>{});
}
archiveCompletedWeeks();
render();

// v1.31: subtle wallpaper depth effect on touch/mouse.
(function(){
  const bg=document.getElementById("backdrop");
  if(!bg)return;
  let raf=0;
  const move=(x,y)=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
    const dx=(x/window.innerWidth-.5)*-7, dy=(y/window.innerHeight-.5)*-5;
    bg.style.transform=`scale(1.035) translate3d(${dx}px,${dy}px,0)`;
  })};
  window.addEventListener("pointermove",e=>move(e.clientX,e.clientY),{passive:true});
  window.addEventListener("pointerleave",()=>{bg.style.transform=""},{passive:true});
})();
})();

/* ===== v1.27 Dashboard rebuilt: isolated controller ===== */
(function(){
  const GOAL_KEY="weeklyGoal";
  const $v27=id=>document.getElementById(id);
  const getGoal=()=>Math.max(1,Number(localStorage.getItem(GOAL_KEY)||400));

  function open(){
    const modal=$v27("dashboardModalV27");
    if(!modal)return;
    modal.hidden=false;
    modal.classList.add("show");
    render();
  }
  function close(){
    const modal=$v27("dashboardModalV27");
    if(!modal)return;
    modal.classList.remove("show");
    modal.hidden=true;
  }
  function render(){
    const modal=$v27("dashboardModalV27");
    if(!modal)return;

    // Read the same persistent database used by the app, independently of
    // the in-memory scope. This makes the Dashboard immune to state-scope issues.
    let db=null;
    try{ db=JSON.parse(localStorage.getItem("corte_paquetes_data")||"null"); }catch(e){}
    if(!db || typeof db!=="object") db={records:{},rate:0,rateHistory:[],advances:{}};
    const records=(db.records && typeof db.records==="object")?db.records:{};

    const now=new Date();
    const weekStart=new Date(now); weekStart.setHours(0,0,0,0);
    weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
    const weekEnd=new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6); weekEnd.setHours(23,59,59,999);
    const keyOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const parseKey=s=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||"")))return null;
      const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d);
    };
    const inWeek=s=>{
      const d=parseKey(s); return d && d>=weekStart && d<=weekEnd;
    };

    const rateHistory=Array.isArray(db.rateHistory)?db.rateHistory:[];
    let rate=Number(db.rate)||0;
    const todayKey=keyOf(now);
    for(const r of rateHistory){
      if(r && String(r.date)<=todayKey) rate=Number(r.rate)||rate;
    }

    const vals=[];
    const labels=["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];
    for(let i=0;i<7;i++){
      const d=new Date(weekStart); d.setDate(weekStart.getDate()+i);
      const key=keyOf(d);
      vals.push({key,label:labels[i],date:d,val:Number(records[key]||0),has:Object.prototype.hasOwnProperty.call(records,key)});
    }

    const total=vals.reduce((s,x)=>s+x.val,0);
    const gross=total*rate;

    // v1.31: compare current week with the previous Monday-Sunday week.
    const prevStart=new Date(weekStart); prevStart.setDate(prevStart.getDate()-7);
    const prevEnd=new Date(weekStart); prevEnd.setDate(prevEnd.getDate()-1);
    const previousTotal=Object.entries(records).reduce((sum,[key,value])=>{
      const d=parseKey(key); return d&&d>=prevStart&&d<=prevEnd ? sum+Number(value||0) : sum;
    },0);
    const delta=previousTotal>0?((total-previousTotal)/previousTotal*100):null;

    $v27("dashboardV27Packages").textContent=String(total);
    $v27("dashboardV27Gross").textContent=typeof money==="function"
      ?money(gross)
      :new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(gross);
    const deltaEl=$v27("dashboardV31WeekDelta");
    if(deltaEl){
      deltaEl.className=delta===null?"":(delta>=0?"positive":"negative");
      deltaEl.textContent=delta===null?"Primera semana comparable":`${delta>=0?"↑":"↓"} ${Math.abs(delta).toFixed(0)}% vs. semana pasada`;
    }
    const netEl=$v27("dashboardV31WeekNet");
    if(netEl)netEl.textContent=previousTotal?`${previousTotal} paquetes la semana pasada`:"Sin semana anterior";
    $v27("dashboardV27Range").textContent=
      `Lunes ${weekStart.getDate()} → Domingo ${weekEnd.getDate()} de ${weekEnd.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;

    const max=Math.max(1,...vals.map(x=>x.val));
    $v27("dashboardV27Chart").innerHTML=vals.map(x=>`
      <button type="button" class="dashboardV27Day ${x.has?"":"empty"}" data-day="${x.key}">
        <div class="dashboardV27BarWrap"><i style="height:${Math.max(5,(x.val/max)*100)}%"></i></div>
        <b>${x.val}</b><span>${x.label}</span>
      </button>`).join("");

    $v27("dashboardV27Chart").querySelectorAll("[data-day]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const d=btn.dataset.day;
        close();
        if(typeof window.openDayActions==="function") window.openDayActions(d);
      });
    });

    const worked=vals.filter(x=>x.has);
    const avg=worked.length?Math.round(total/worked.length):0;
    const best=vals.reduce((p,x)=>x.val>p.val?x:p,vals[0]);
    $v27("dashboardV27Average").textContent=String(avg);
    $v27("dashboardV27Best").textContent=best.val?String(best.val):"—";
    $v27("dashboardV27BestSub").textContent=best.val
      ?best.date.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})
      :"Sin registros";

    const goal=Math.max(1,Number(localStorage.getItem(GOAL_KEY)||400));
    const pct=Math.min(100,total/goal*100);
    const remaining=Math.max(0,goal-total);
    $v27("dashboardV27GoalLabel").textContent=`${goal} paquetes`;
    $v27("dashboardV27GoalCurrent").textContent=`${total} / ${goal}`;
    $v27("dashboardV27GoalPct").textContent=`${pct.toFixed(1).replace(".0","")}%`;
    $v27("dashboardV27GoalFill").style.width=pct+"%";
    $v27("dashboardV27GoalMsg").textContent=
      remaining?`Te faltan ${remaining} paquetes para alcanzar tu meta.`:"🔥 ¡Meta semanal alcanzada!";

    // v1.31: all-time performance from the same persistent records.
    const allEntries=Object.entries(records).filter(([k,v])=>parseKey(k)&&Number(v)>0);
    const allPackages=allEntries.reduce((sum,[,v])=>sum+Number(v||0),0);
    let allMoney=0;
    const weeklyTotals={};
    allEntries.forEach(([key,value])=>{
      const d=parseKey(key), qty=Number(value)||0;
      let dayRate=Number(db.rate)||0;
      for(const r of rateHistory){if(r&&String(r.date)<=key)dayRate=Number(r.rate)||dayRate;}
      allMoney+=qty*dayRate;
      const ws=new Date(d); ws.setHours(0,0,0,0); ws.setDate(ws.getDate()-((ws.getDay()+6)%7));
      const wk=keyOf(ws); weeklyTotals[wk]=(weeklyTotals[wk]||0)+qty;
    });
    let bestWeekKey="",bestWeekTotal=0;
    Object.entries(weeklyTotals).forEach(([wk,q])=>{if(q>bestWeekTotal){bestWeekTotal=q;bestWeekKey=wk;}});
    const fmtWeek=wk=>{const d=parseKey(wk);if(!d)return "—";const e=new Date(d);e.setDate(e.getDate()+6);return `${d.getDate()}–${e.getDate()} ${e.toLocaleDateString("es-MX",{month:"short"})}`;};
    $v27("dashboardV31AllPackages").textContent=String(allPackages);
    $v27("dashboardV31AllMoney").textContent=typeof money==="function"?money(allMoney):`$${allMoney.toFixed(2)}`;
    $v27("dashboardV31BestWeek").textContent=bestWeekTotal?`${bestWeekTotal} paquetes`:"—";
    $v27("dashboardV31BestWeekSub").textContent=bestWeekTotal?`Semana ${fmtWeek(bestWeekKey)}`:"Aún no hay suficientes datos";

    const pulseTitle=$v27("dashboardV31PulseTitle"), pulseText=$v27("dashboardV31PulseText");
    if(pulseTitle&&pulseText){
      if(!total){pulseTitle.textContent="Aún no arrancamos";pulseText.textContent="Registra paquetes y verás aquí tu ritmo semanal.";}
      else if(delta===null){pulseTitle.textContent="🔥 Buen comienzo";pulseText.textContent=`Llevas ${total} paquetes registrados esta semana.`;}
      else if(delta>=15){pulseTitle.textContent="🚀 Semana fuerte";pulseText.textContent=`Vas ${Math.round(delta)}% arriba de la semana pasada.`;}
      else if(delta>0){pulseTitle.textContent="📈 Vas mejorando";pulseText.textContent=`Llevas ${Math.round(delta)}% más paquetes que la semana pasada.`;}
      else if(delta<=-15){pulseTitle.textContent="⚠️ Bajó el ritmo";pulseText.textContent=`Vas ${Math.abs(Math.round(delta))}% abajo de la semana pasada.`;}
      else{pulseTitle.textContent="⚡ Ritmo estable";pulseText.textContent=`Tu ritmo está muy cerca del de la semana pasada.`;}
    }

    // v1.32 Modo Pro: projection, streak, intelligent target and achievements.
    const todayIndex=(now.getDay()+6)%7;
    const todayHas=Object.prototype.hasOwnProperty.call(records,todayKey);
    const futureSlots=Math.max(0,7-todayIndex-(todayHas?1:0));
    const projected=Math.round(total + avg*futureSlots);
    const projectionEl=$v27("dashboardV32Projection"), projectionText=$v27("dashboardV32ProjectionText");
    if(projectionEl&&projectionText){
      projectionEl.textContent=total?`${projected} paquetes`:"—";
      if(!total) projectionText.textContent="Registra paquetes para calcular tu ritmo.";
      else if(projected>=goal) projectionText.textContent=`A este ritmo superarías tu meta de ${goal}.`;
      else projectionText.textContent=`A este ritmo cerrarías cerca de ${projected}.`;
    }

    // Consecutive active-day streak. If today has no record, count back from yesterday.
    let streak=0;
    let cursor=new Date(now); cursor.setHours(0,0,0,0);
    if(!todayHas) cursor.setDate(cursor.getDate()-1);
    while(true){
      const k=keyOf(cursor);
      if(Number(records[k]||0)>0){streak++;cursor.setDate(cursor.getDate()-1);}else break;
    }
    const streakEl=$v27("dashboardV32Streak"), streakText=$v27("dashboardV32StreakText");
    if(streakEl&&streakText){
      streakEl.textContent=`${streak} ${streak===1?"día":"días"}`;
      streakText.textContent=streak>=7?"🔥 Una semana completa de actividad.":streak?"Sigue mañana para aumentar tu racha.":"Registra hoy y empieza tu racha.";
    }

    const remainingGoal=Math.max(0,goal-total);
    const neededDays=Math.max(1,futureSlots);
    const neededPerDay=remainingGoal?Math.ceil(remainingGoal/neededDays):0;
    const needEl=$v27("dashboardV32Need"), needLabel=$v27("dashboardV32NeedLabel"), needFill=$v27("dashboardV32NeedFill"), advice=$v27("dashboardV32Advice");
    if(needEl&&needLabel&&needFill&&advice){
      needEl.textContent=remainingGoal?`${neededPerDay}/día`:"META LISTA";
      needLabel.textContent=remainingGoal?`${remainingGoal} paquetes restantes`:`${total} paquetes · ${goal} objetivo`;
      needFill.style.width=Math.min(100,total/goal*100)+"%";
      if(!total) advice.textContent=`Tu meta es ${goal} paquetes. Registra el primer día para activar el análisis.`;
      else if(!remainingGoal) advice.textContent="🔥 Ya alcanzaste tu meta. Todo lo que sumes ahora es récord.";
      else if(neededPerDay<=avg) advice.textContent=`Vas a buen ritmo: necesitas ${neededPerDay} al día y promedias ${avg}.`;
      else advice.textContent=`Necesitas ${neededPerDay} al día. Tu promedio actual es ${avg}; puedes ajustar tu meta si hace falta.`;
    }

    const bestDayAll=allEntries.reduce((p,[k,v])=>Number(v)>p.val?{key:k,val:Number(v)}:p,{key:"",val:0});
    const badges=[];
    const addBadge=(icon,title,desc,ok)=>{badges.push({icon,title,desc,ok});};
    addBadge("🥉","Primeros 100","Supera 100 paquetes históricos",allPackages>=100);
    addBadge("🥈","500 paquetes","Llega a 500 paquetes acumulados",allPackages>=500);
    addBadge("🥇","1,000 paquetes","Llega a 1,000 paquetes acumulados",allPackages>=1000);
    addBadge("⚡","Día de 100+","Registra 100 o más en un día",bestDayAll.val>=100);
    addBadge("🔥","Semana 300+","Supera 300 paquetes en una semana",bestWeekTotal>=300);
    addBadge("👑","Récord semanal","Supera 600 paquetes en una semana",bestWeekTotal>=600);
    const unlocked=badges.filter(b=>b.ok).length;
    const badgeCount=$v27("dashboardV32AchievementCount"), badgeBox=$v27("dashboardV32Badges");
    if(badgeCount) badgeCount.textContent=`${unlocked}/${badges.length}`;
    if(badgeBox) badgeBox.innerHTML=badges.map(b=>`<div class="dashboardV32Badge ${b.ok?"unlocked":"locked"}"><b>${b.icon}</b><div><strong>${b.title}</strong><span>${b.desc}</span></div><i>${b.ok?"✓":"🔒"}</i></div>`).join("");
  }

  window.openDashboard=()=>open();

  document.addEventListener("DOMContentLoaded",()=>{
    const btn=$v27("dashboardBtn"), closeBtn=$v27("dashboardV27Close"), modal=$v27("dashboardModalV27"), goal=$v27("dashboardV27GoalEdit");
    if(btn)btn.addEventListener("click",open);
    if(closeBtn)closeBtn.addEventListener("click",close);
    const weeklyDashboardBtn=$v27("openDashboardFromHistory"); if(weeklyDashboardBtn)weeklyDashboardBtn.addEventListener("click",()=>{closeCutHistory();open();});
    if(modal)modal.addEventListener("click",e=>{if(e.target===modal)close()});
    if(goal)goal.addEventListener("click",()=>{
      const val=prompt("¿Cuántos paquetes quieres como meta semanal?",getGoal());
      if(val===null)return;
      const n=Math.floor(Number(val));
      if(!Number.isFinite(n)||n<1){alert("Escribe una meta válida.");return}
      localStorage.setItem(GOAL_KEY,String(n)); render();
    });
  });
})();


/* ===== v1.28 Dynamic Accent ===== */
(function(){
  function bindAccent(){
    const mode=$("accentMode"), color=$("accentColor");
    if(mode)mode.addEventListener("change",()=>{
      state.settings.accentMode=mode.value;
      if(mode.value==="preset" && !state.settings.accent)state.settings.accent="#72F4FF";
      if(typeof safeWrite==="function")safeWrite(); applyAccentSettings();
    });
    document.querySelectorAll(".accentDot").forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.settings.accent=btn.dataset.accent;
        state.settings.accentMode="preset";
        if(typeof safeWrite==="function")safeWrite(); applyAccentSettings();
      });
    });
    if(color)color.addEventListener("input",()=>{
      state.settings.accent=color.value;
      state.settings.accentMode="custom";
      if(typeof safeWrite==="function")safeWrite(); applyAccentSettings();
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bindAccent);
  else bindAccent();
})();

(function(){const f=()=>{try{applyAccentSettings()}catch(e){}};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",f);else f()})();

/* v1.28.2 — wallpaper/accent synchronization */
window.refreshDynamicAccent=function(){
  try{ return applyAccentSettings(); }catch(e){ return null; }
};

window.addEventListener("load",()=>{try{applyAccentSettings()}catch(e){}});

(function(){
  const restore=()=>{
    try{readAccentPrefs(); applyAccentSettings();}catch(e){}
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",restore);
  window.addEventListener("load",restore);
})();
