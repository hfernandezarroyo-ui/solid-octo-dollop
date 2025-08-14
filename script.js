/*******************************
 * script.js (con visor y debug)
 *******************************/
let SPORTDEVS_API_KEY = "3b9_ggLLo0-VoHA36GObPA";
let ODDS_API_KEY      = "6ab0058770900f248c67b20aeefbbbaa";

// Cargar claves guardadas
(function initKeys(){
  try{
    const a = localStorage.getItem("sdKey");
    const b = localStorage.getItem("oddsKey");
    if (a) SPORTDEVS_API_KEY = a;
    if (b) ODDS_API_KEY = b;
    const sd = document.getElementById("sdKey"); if (sd) sd.value = SPORTDEVS_API_KEY;
    const od = document.getElementById("oddsKey"); if (od) od.value = ODDS_API_KEY;
  }catch(_){}
})();
function guardarClaves(){
  const a = (document.getElementById("sdKey")?.value||"").trim();
  const b = (document.getElementById("oddsKey")?.value||"").trim();
  if (a){ SPORTDEVS_API_KEY=a; try{localStorage.setItem("sdKey",a);}catch(_){}} 
  if (b){ ODDS_API_KEY=b;      try{localStorage.setItem("oddsKey",b);}catch(_){}} 
  alert("Claves guardadas.");
}

/* ===== utilidades ===== */
const isStr = v => typeof v === "string" && v.trim() !== "";
const isNum = v => typeof v === "number" && Number.isFinite(v);

function deepFind(obj, predicate, path = "", depth = 0){
  if (obj == null || depth > 6) return null;
  if (predicate(obj, path)) return {value: obj, path};
  if (Array.isArray(obj)){
    for (let i=0;i<obj.length;i++){
      const r = deepFind(obj[i], predicate, `${path}[${i}]`, depth+1);
      if (r) return r;
    }
  } else if (typeof obj === "object"){
    for (const k of Object.keys(obj)){
      const r = deepFind(obj[k], predicate, path? `${path}.${k}` : k, depth+1);
      if (r) return r;
    }
  }
  return null;
}
function parseClock(v){
  if (v == null) return 0;
  if (typeof v === "number") return Math.max(0,v);
  if (typeof v === "object"){
    const m = Number(v.minutes||v.m||0), s=Number(v.seconds||v.s||0);
    if (Number.isFinite(m)&&Number.isFinite(s)) return Math.max(0,m*60+s);
  }
  const s = String(v);
  const m = s.match(/(\d{1,2}):(\d{2})$/) || s.match(/(\d{1,2})m?[: ](\d{2})s?/i);
  if (m) return Number(m[1])*60 + Number(m[2]);
  return 0;
}

/* ===== extractores con ruta detectada (para debug) ===== */
function findHome(g){
  const tries = [
    {rx: /(home|local|host)(_team)?(\.name)?$/i, pick: v=> isStr(v)?v: isStr(v?.name)?v.name:null},
    {rx: /teams\.home(\.name)?$/i, pick: v=> isStr(v)?v: v?.name},
    {rx: /(home|local).*(name|title|short_name|display_name)$/i, pick: v=> v},
  ];
  for(const t of tries){
    const f = deepFind(g, (v,p)=> t.rx.test(p) && (isStr(v)||isStr(v?.name)));
    if (f) return {name: t.pick(f.value), path: f.path};
  }
  return {name:"Local", path:"(no encontrado)"};
}
function findAway(g){
  const tries = [
    {rx: /(away|visit|guest)(_team)?(\.name)?$/i, pick: v=> isStr(v)?v: isStr(v?.name)?v.name:null},
    {rx: /teams\.away(\.name)?$/i, pick: v=> isStr(v)?v: v?.name},
    {rx: /(away|visit|guest).*(name|title|short_name|display_name)$/i, pick: v=> v},
  ];
  for(const t of tries){
    const f = deepFind(g, (v,p)=> t.rx.test(p) && (isStr(v)||isStr(v?.name)));
    if (f) return {name: t.pick(f.value), path: f.path};
  }
  return {name:"Visitante", path:"(no encontrado)"};
}
function findHomeScore(g){
  const f = deepFind(g,(v,p)=> isNum(v) && /(home|local).*(score|points|result)|^home_score$|^homePoints$/i.test(p));
  return {value: f? f.value:0, path: f? f.path:"(no encontrado)"};
}
function findAwayScore(g){
  const f = deepFind(g,(v,p)=> isNum(v) && /(away|visit|guest).*(score|points|result)|^away_score$|^awayPoints$/i.test(p));
  return {value: f? f.value:0, path: f? f.path:"(no encontrado)"};
}
function findLeague(g){
  const f = deepFind(g,(v,p)=> isStr(v) && /(league|tournament|competition|category).*name$|^league_name$/i.test(p));
  if (f) return {name:f.value, path:f.path};
  const f2 = deepFind(g,(v,p)=> v && typeof v==="object" && /(league|tournament|competition|category)$/i.test(p) && isStr(v.name));
  if (f2) return {name: f2.value.name, path: f2.path+".name"};
  return {name:"Basket", path:"(no encontrado)"};
}
function findQuarter(g){
  const f = deepFind(g,(v,p)=> isNum(v) && /(period|quarter|live_period|current_period|q)\b/i.test(p));
  return {value: f? f.value:4, path: f? f.path:"(no encontrado)"};
}
function findSecondsLeft(g){
  const f = deepFind(g,(v,p)=>{
    if (isNum(v) && /(clock|time.*left|remaining.*time|time_remaining|timer)/i.test(p)) return true;
    if (isStr(v) && /(clock|time|remaining|left)/i.test(p)) return true;
    if (v && typeof v==="object" && /(clock|time|remaining|left)/i.test(p)) return true;
    return false;
  });
  return {value: parseClock(f?f.value:null), path: f? f.path:"(no encontrado)"};
}

/* ===== decisión ===== */
function decide({homeScore, awayScore, quarter, secLeftQ}){
  const minPerQ = 10;
  const lead = Math.abs(homeScore - awayScore);
  const secsPlayedThisQ = (minPerQ*60) - (secLeftQ||0);
  const minsPlayedTotal = ((quarter-1)*minPerQ) + (secsPlayedThisQ/60);
  const pacePerQ = ((homeScore+awayScore)/Math.max(minsPlayedTotal,1))*minPerQ;
  const fast = pacePerQ >= 50;
  const minLead = fast ? 12 : 10;
  if (quarter !== 4) return {state:"ESPERA", html:`🟡 ESPERA<br><small>Aún no es Q4</small>`};
  if (lead < minLead) return {state:"ESPERA", html:`🟡 ESPERA<br><small>Ventaja ${lead} &lt; ${minLead}</small>`};
  let p = 0.85 + (lead - minLead)*0.01 + (fast ? -0.02 : +0.02);
  p = Math.max(0.55, Math.min(0.97, p));
  return {state:"ENTRA", html:`✅ ENTRA (${Math.round(p*100)}%)<br><small>ML líder o -3.5/-4.5</small>`};
}

/* ===== fetch + pintado ===== */
async function actualizar(){
  const btn = document.getElementById("btn");
  const tbody = document.querySelector("#tabla tbody");
  const raw = document.getElementById("raw");
  btn.disabled = true; btn.textContent = "Actualizando...";
  tbody.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;
  if (raw) raw.textContent = "";

  try{
    const liveRes = await fetch("https://basketball.sportdevs.com/matches?status_type=eq.live", {
      headers: { Authorization: "Bearer " + SPORTDEVS_API_KEY }
    });
    if (!liveRes.ok) throw new Error("SportDevs " + liveRes.status);
    const live = await liveRes.json();
    const partidos = Array.isArray(live)? live : (live?.data || []);
    if (raw) raw.textContent = JSON.stringify(partidos.slice(0,2), null, 2); // mostramos 2 partidos como muestra

    if (!partidos.length){
      tbody.innerHTML = `<tr><td colspan="6">Ahora mismo SportDevs no tiene partidos live.</td></tr>`;
    } else {
      tbody.innerHTML = "";
      for (const g of partidos){
        const lg = findLeague(g);
        const hn = findHome(g);
        const an = findAway(g);
        const hs = findHomeScore(g);
        const as = findAwayScore(g);
        const qu = findQuarter(g);
        const cl = findSecondsLeft(g);

        const s = decide({homeScore:Number(hs.value||0), awayScore:Number(as.value||0), quarter:Number(qu.value||4), secLeftQ:Number(cl.value||0)});

        // Fila principal
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${lg.name}</td>
          <td>${hn.name} ${hs.value??0} - ${as.value??0} ${an.name}<br><small>Q${qu.value}</small></td>
          <td>🔒</td><td>🔒</td><td>🔒</td>
          <td class="chip ${s.state==='ENTRA'?'ok':s.state==='ESPERA'?'wait':'no'}">${s.html}</td>
        `;
        tbody.appendChild(tr);

        // Fila de debug (qué rutas se usaron)
        const trDbg = document.createElement("tr");
        trDbg.innerHTML = `
          <td colspan="6" class="muted">
            <small>
              <b>Debug</b> – league: <code>${lg.path}</code> · home: <code>${hn.path}</code> · away: <code>${an.path}</code> · 
              homeScore: <code>${hs.path}</code> · awayScore: <code>${as.path}</code> · quarter: <code>${qu.path}</code> · clock: <code>${cl.path}</code>
            </small>
          </td>
        `;
        tbody.appendChild(trDbg);
      }
    }
  }catch(e){
    tbody.innerHTML = `<tr><td colspan="6">Error: ${e.message}</td></tr>`;
  }finally{
    btn.disabled = false; btn.textContent = "Actualizar ahora";
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  const a = document.getElementById("sdKey"); if (a) a.value = SPORTDEVS_API_KEY;
  const b = document.getElementById("oddsKey"); if (b) b.value = ODDS_API_KEY;
});

