/****************************************************
 * script.js — Señales, confianza, odds y stake Kelly
 ****************************************************/

/* CLAVES y BANK por defecto (puedes cambiarlas aquí o en los inputs y pulsar "Guardar claves") */
let SPORTDEVS_API_KEY = "3b9_ggLLo0-VoHA36GObPA";               // Authorization: Bearer <ESTO>
let ODDS_API_KEY      = "6ab0058770900f248c67b20aeefbbbaa";     // The Odds API
let BANKROLL_EUR      = 200;

/* Cargar/guardar claves en el navegador (no se suben) */
(function initKeys(){
  try{
    const a = localStorage.getItem("sdKey");
    const b = localStorage.getItem("oddsKey");
    const c = localStorage.getItem("bank");
    if (a) SPORTDEVS_API_KEY = a;
    if (b) ODDS_API_KEY = b;
    if (c) BANKROLL_EUR = Number(c) || BANKROLL_EUR;
    const sd = document.getElementById("sdKey"); if (sd) sd.value = SPORTDEVS_API_KEY;
    const od = document.getElementById("oddsKey"); if (od) od.value = ODDS_API_KEY;
    const bk = document.getElementById("bank");  if (bk) bk.value = BANKROLL_EUR;
  }catch(_){}
})();
function guardarClaves(){
  const a = (document.getElementById("sdKey")?.value||"").trim();
  const b = (document.getElementById("oddsKey")?.value||"").trim();
  const c = Number(document.getElementById("bank")?.value || BANKROLL_EUR);
  if (a){ SPORTDEVS_API_KEY=a; try{localStorage.setItem("sdKey",a);}catch(_){}} 
  if (b){ ODDS_API_KEY=b;      try{localStorage.setItem("oddsKey",b);}catch(_){}} 
  if (c>=0){ BANKROLL_EUR=c;   try{localStorage.setItem("bank",String(c));}catch(_){}} 
  alert("Guardado.");
}

/* ===== utilidades ===== */
const isStr = v => typeof v === "string" && v.trim() !== "";
const isNum = v => typeof v === "number" && Number.isFinite(v);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const pct = x => (Math.round(x*100))+"%";

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

/* ===== extractores con ruta detectada (para debug visual) ===== */
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
  // 1) campos directos
  let f = deepFind(g,(v,p)=> isNum(v) && /(period|quarter|live_period|current_period|q)\b/i.test(p));
  if (f) return {value: f.value, path: f.path};
  // 2) array "times" con period_number o period
  const t = deepFind(g,(v,p)=> Array.isArray(v) && /(^|\.)(times)$/i.test(p));
  if (t && Array.isArray(t.value) && t.value.length){
    const last = t.value[t.value.length-1];
    if (isNum(last?.period_number)) return {value: last.period_number, path: t.path + "[*].period_number"};
    if (isNum(last?.period))       return {value: last.period,       path: t.path + "[*].period"};
  }
  return {value: 4, path:"(no encontrado)"};
}
function findSecondsLeft(g){
  // 1) comunes
  let f = deepFind(g,(v,p)=>{
    if (isNum(v) && /(clock|time.*left|remaining.*time|time_remaining|timer)/i.test(p)) return true;
    if (isStr(v) && /(clock|time|remaining|left)/i.test(p)) return true;
    if (v && typeof v==="object" && /(clock|time|remaining|left)/i.test(p)) return true;
    return false;
  });
  if (f) return {value: parseClock(f.value), path: f.path};
  // 2) "times[].time"
  const t = deepFind(g,(v,p)=> Array.isArray(v) && /(^|\.)(times)$/i.test(p));
  if (t && Array.isArray(t.value) && t.value.length){
    const last = t.value[t.value.length-1];
    if (last?.time != null) return {value: parseClock(last.time), path: t.path + "[*].time"};
  }
  return {value: 0, path:"(no encontrado)"};
}

/* ===== Modelo de confianza (prob. de que mantenga el líder) =====
   Heurístico: base 0.5 + (lead, tiempo restante, ritmo). */
function confianzaProb({homeScore, awayScore, quarter, secLeftQ}){
  const minPerQ = 10; // FIBA
  const totalPts = homeScore + awayScore;
  const lead = Math.abs(homeScore - awayScore);
  const secsPlayedThisQ = (minPerQ*60) - (secLeftQ||0);
  const minsPlayedTotal = ((quarter-1)*minPerQ) + (secsPlayedThisQ/60);
  const pacePerQ = (totalPts / Math.max(minsPlayedTotal,1)) * minPerQ;
  const fast = pacePerQ >= 50;

  // base y factores
  let p = 0.50;
  p += (lead) * 0.012;                     // +1.2% por punto de ventaja
  p += (quarter===4 ? 0.10 : 0);           // tramo final
  p += clamp((minPerQ*60 - (secLeftQ||0))/ (minPerQ*60), 0, 1) * 0.10; // cuanto más avanzado el Q4
  p += fast ? -0.05 : +0.03;               // ritmo alto resta, lento suma
  p = clamp(p, 0.05, 0.99);
  return { p, pacePerQ, fast };
}

/* ===== Emparejar odds (The Odds API) por nombres normalizados ===== */
const norm = s => (s||"").toLowerCase().replace(/[\s\.\-_'’]/g,"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function pickBestH2H(oddsArr){
  // devuelve la mejor cuota ML (mayor precio) entre casas disponibles
  let best = null;
  for (const ev of oddsArr||[]){
    const markets = ev?.bookmakers?.flatMap(b => b.markets||[]) || [];
    const h2h = markets.find(m => m.key==="h2h");
    if (!h2h) continue;
    for (const out of (h2h.outcomes||[])){
      if (!best || (out.price > best.price)) best = { team: out.name, price: out.price, sportKey: ev.sport_key };
    }
  }
  return best; // {team, price}
}

/* ===== Decisión final + Kelly fraccionado (25%) ===== */
function decisionConOdds({leaderName, confP, bestPrice}){
  if (!bestPrice) return {entry:"ESPERA", reason:"Sin cuota", kellyFrac:0};
  const implied = 1/ bestPrice;               // probabilidad implícita de la cuota
  const edge = confP - implied;               // ventaja
  const minEdge = 0.03;                       // margen mínimo de 3 puntos
  if (edge <= minEdge || confP < 0.60) return {entry:"ESPERA", reason:`Edge ${Math.round(edge*100)}%`, kellyFrac:0};
  // Kelly para apuestas con cuota b+1, b = price-1
  const b = bestPrice - 1;
  const k = clamp((confP - (1-confP)/b), 0, 1);   // Kelly pleno
  const kAdj = k * 0.25;                           // Kelly 25% (conservador)
  return {entry:"ENTRA", reason:`Edge ${Math.round(edge*100)}%`, kellyFrac:kAdj};
}

/* ===== Fetch + pintado ===== */
async function actualizar(){
  const btn = document.getElementById("btn");
  const tbody = document.querySelector("#tabla tbody");
  const raw = document.getElementById("raw");
  btn.disabled = true; btn.textContent = "Actualizando...";
  tbody.innerHTML = `<tr><td colspan="7">Cargando...</td></tr>`;
  if (raw) raw.textContent = "";

  try{
    // 1) EN VIVO (SportDevs)
    const liveRes = await fetch("https://basketball.sportdevs.com/matches?status_type=eq.live", {
      headers: { Authorization: "Bearer " + SPORTDEVS_API_KEY }
    });
    if (!liveRes.ok) throw new Error("SportDevs " + liveRes.status);
    const live = await liveRes.json();
    const partidos = Array.isArray(live)? live : (live?.data || []);
    if (raw) raw.textContent = JSON.stringify(partidos.slice(0,2), null, 2); // muestra 2 partidos

    // 2) Odds (The Odds API) — buscamos deportes de basket y juntamos todos
    let oddsAll = [];
    try{
      const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${ODDS_API_KEY}`);
      const sports = await sportsRes.json();
      const basketKeys = (Array.isArray(sports)?sports:[]).filter(s => (s.key||"").startsWith("basketball_")).map(s => s.key);
      for (const key of basketKeys){
        const oRes = await fetch(`https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${ODDS_API_KEY}&regions=eu,us&markets=h2h&oddsFormat=decimal`);
        if (oRes.ok){
          const arr = await oRes.json();
          if (Array.isArray(arr)) oddsAll = oddsAll.concat(arr);
        }
      }
    }catch(_){}

    if (!partidos.length){
      tbody.innerHTML = `<tr><td colspan="7">Ahora mismo SportDevs no tiene partidos live.</td></tr>`;
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

        const homeScore = Number(hs.value||0);
        const awayScore = Number(as.value||0);
        const quarter   = Number(qu.value||4);
        const secLeftQ  = Number(cl.value||0);

        // Confianza + ritmo
        const { p:confP, pacePerQ, fast } = confianzaProb({homeScore, awayScore, quarter, secLeftQ});

        // Equipo líder
        const leaderHome = homeScore >= awayScore;
        const leaderName = leaderHome ? hn.name : an.name;

        // Emparejar con odds (normalización básica por nombre)
        const hName = norm(hn.name), aName = norm(an.name);
        const matchedOdds = oddsAll.filter(ev => {
          const teamNames = (ev?.bookmakers?.[0]?.markets?.[0]?.outcomes||[]).map(o => norm(o.name));
          if (teamNames.length<2) return false;
          return teamNames.some(n => n.includes(hName)) && teamNames.some(n => n.includes(aName));
        });
        const bestH2H = pickBestH2H(matchedOdds);

        // Decisión con odds
        const withOdds = decisionConOdds({leaderName, confP, bestPrice: bestH2H?.price});

        // Rotulitos
        const ritmoTxt = fast ? `rápido (${pacePerQ.toFixed(1)}/Q)` : `lento (${pacePerQ.toFixed(1)}/Q)`;
        const confTxt = `${pct(confP)} ${withOdds.reason ? `· ${withOdds.reason}` : ""}`;
        const cuotaTxt = bestH2H ? `${bestH2H.price.toFixed(2)}` : "—";

        // Stake con Kelly fracc.
        const stake = withOdds.kellyFrac>0 ? Math.max(1, Math.round(BANKROLL_EUR * withOdds.kellyFrac)) : 0;

        const stateClass = withOdds.entry==="ENTRA" ? "ok" : (withOdds.entry==="ESPERA" ? "wait" : "no");
        const entryHtml = withOdds.entry==="ENTRA"
          ? `✅ ENTRA<br><small>${leaderName}</small>`
          : (withOdds.entry==="ESPERA" ? `🟡 ESPERA` : `⛔ NO`);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${lg.name}</td>
          <td>${hn.name} ${homeScore} - ${awayScore} ${an.name}<br><small>Q${quarter}</small></td>
          <td>${ritmoTxt}</td>
          <td>${confTxt}</td>
          <td>${cuotaTxt}</td>
          <td class="chip ${stateClass}">${entryHtml}</td>
          <td class="right">${stake>0 ? (stake+" €") : "—"}</td>
        `;
        tbody.appendChild(tr);

        // Debug (rutas usadas)
        const trDbg = document.createElement("tr");
        trDbg.innerHTML = `
          <td colspan="7" class="muted">
            <small>
              <b>Debug</b> – league: <code>${lg.path}</code> · home: <code>${hn.path}</code> · away: <code>${an.path}</code> · 
              homeScore: <code>${hs.path}</code> · awayScore: <code>${as.path}</code> · quarter: <code>${qu.path}</code> · clock: <code>${cl.path}</code>
              ${bestH2H ? ` · matched odds: <code>${bestH2H.sportKey}</code>` : ""}
            </small>
          </td>
        `;
        tbody.appendChild(trDbg);
      }
    }

  }catch(e){
    document.querySelector("#tabla tbody").innerHTML = `<tr><td colspan="7">Error: ${e.message}</td></tr>`;
    console.error(e);
  }finally{
    const btn = document.getElementById("btn");
    btn.disabled = false; btn.textContent = "Actualizar ahora";
  }
}

/* Deja inputs rellenos al cargar */
document.addEventListener("DOMContentLoaded", ()=>{
  const a = document.getElementById("sdKey"); if (a) a.value = SPORTDEVS_API_KEY;
  const b = document.getElementById("oddsKey"); if (b) b.value = ODDS_API_KEY;
  const c = document.getElementById("bank");  if (c) c.value = BANKROLL_EUR;
});
