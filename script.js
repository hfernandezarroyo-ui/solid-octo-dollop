/* =========================================================
   Basket simple — Integración completa con API + Historial
   ========================================================= */

/* ---------- Estado mínimo ---------- */
const state = {
  equipoA: "", equipoB: "",
  ticks: [], // strings tipo "24-17", "38-34", "..."
  swaps: 0,
};

/* ---------- Utilidades DOM ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- Panel básico ---------- */
$("#iniciarPartido").addEventListener("click", ()=>{
  state.equipoA = $("#equipoA").value.trim() || "A";
  state.equipoB = $("#equipoB").value.trim() || "B";
  state.ticks = [];
  state.swaps = 0;
  $("#estadoPartido").textContent = "EN CURSO";
  $("#tablaTicks").innerHTML = "";
  renderQuickSummary({}); // limpia
});

$("#anadirTick").addEventListener("click", ()=>{
  const v = $("#tickInput").value.trim();
  if(!/^\d+\s*-\s*\d+$/.test(v)){ alert("Formato de tick: 24-17"); return; }
  state.ticks.push(v.replace(/\s*/g,""));
  $("#tickInput").value = "";
  renderTicks();
  renderQuickSummary(metricsFromTicks(state.ticks));
});

$("#reset").addEventListener("click", ()=>{
  state.ticks = [];
  state.swaps = 0;
  $("#tablaTicks").innerHTML = "";
  $("#generatedTicks").value = "";
  $("#estadoPartido").textContent = "ESPERA";
  $("#confPartido").textContent = "0%";
  renderQuickSummary({});
});

/* ---------- Métricas simples ---------- */
/** Convierte "A-B" a {a,b} número */
function parseTick(t){ const [a,b]=t.split("-").map(n=>parseInt(n,10)); return {a,b}; }

/** Calcula lead, total, swaps y momentum aproximado */
function metricsFromTicks(ticks){
  if(!ticks || !ticks.length) return { total:null, lead:null, swaps:0, momentum:null, fase:null };
  let swaps = 0, lastSign = null, momentum = 0, lastDiff = 0;
  for(const t of ticks){
    const {a,b} = parseTick(t);
    const diff = a-b;
    const sign = Math.sign(diff);
    if(lastSign !== null && sign !== 0 && sign !== lastSign) swaps++;
    // momentum simple: cambios de diff (derivada discreta)
    momentum += (diff - lastDiff);
    lastDiff = diff;
    if(sign !== 0) lastSign = sign;
  }
  const {a,b} = parseTick(ticks[ticks.length-1]);
  const total = a+b;
  const lead  = a>b ? `${state.equipoA} +${a-b}` : (b>a ? `${state.equipoB} +${b-a}` : "Empate");
  // fase aproximada por nº de ticks
  const fase = ticks.length<=1?"Q1":ticks.length===2?"Q2":ticks.length===3?"Q3":"Q4/FT";
  return { total, lead, swaps, momentum, fase };
}

/** Pinta resumen arriba */
function renderQuickSummary(m){
  const el = $("#quickSummary");
  if(!m || !m.total){
    el.innerHTML = `<p class="muted">Resumen rápido — T: — · Lead: — · Fase: — · Ritmo: — · Momentum: —</p>`;
    return;
  }
  el.innerHTML = `<p>T: <b>${m.total}</b> · Lead: <b>${m.lead}</b> · Fase: <b>${m.fase}</b> · Ritmo: <b>${ritmoFromTicks(state.ticks)}</b> · Momentum: <b>${m.momentum}</b></p>`;
}

/** Ritmo (muy simple): total / nº de cuartos aportados */
function ritmoFromTicks(ticks){
  const n = ticks?.length||0;
  if(!n) return "—";
  const {a,b} = parseTick(ticks[n-1]);
  const total = a+b;
  return (total / n).toFixed(1) + " pts/periodo";
}

/** Pinta tabla de ticks */
function renderTicks(){
  const tbody = $("#tablaTicks");
  tbody.innerHTML = "";
  let prev = {a:0,b:0}, swaps=0, lastSign=null;
  state.ticks.forEach((t,i)=>{
    const {a,b} = parseTick(t);
    const total = a+b;
    const diff = a-b;
    const sign = Math.sign(diff);
    if(lastSign!==null && sign!==0 && sign!==lastSign) swaps++;
    if(sign!==0) lastSign = sign;
    const mom = (diff - (prev.a - prev.b));
    prev = {a,b};
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t}</td>
      <td>${a}</td>
      <td>${b}</td>
      <td>${total}</td>
      <td>${swaps}</td>
      <td>${mom >=0 ? "+"+mom : mom}</td>
    `;
    tbody.appendChild(tr);
  });
  $("#confPartido").textContent = Math.min(100, state.ticks.length*25) + "%";
}

/* ---------- Historial en localStorage ---------- */
const LS_KEY = "basket_simple_historial_v1";

function loadHistorial(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY)||"{}"); }
  catch{ return {}; }
}

function saveHistorial(h){
  localStorage.setItem(LS_KEY, JSON.stringify(h));
  renderHistorial();
}

function upsertHistoryFromMatch(m){
  const h = loadHistorial();
  const kTeams = `${m.home_team_name}__${m.away_team_name}`;
  if(!h[kTeams]) h[kTeams] = [];
  // Evita duplicados por id
  if(!h[kTeams].some(x => x.id===m.id)){
    h[kTeams].push({
      id: m.id,
      fecha: m.start_time,
      torneo: m.tournament_name,
      marcador: `${m.home_team_score?.display}-${m.away_team_score?.display}`,
    });
    saveHistorial(h);
  }
}

function renderHistorial(){
  const box = $("#historial");
  const h = loadHistorial();
  const keys = Object.keys(h);
  if(!keys.length){ box.innerHTML = `<small class="muted">Aún no hay historial.</small>`; return; }
  box.innerHTML = keys.map(k=>{
    const [home,away] = k.split("__");
    const rows = h[k]
      .sort((a,b)=> new Date(b.fecha)-new Date(a.fecha))
      .map(x=>`<li>${new Date(x.fecha).toLocaleString()} — ${x.torneo} — <b>${x.marcador}</b></li>`).join("");
    return `<div class="card" style="margin:10px 0;background:#fbfcff">
      <b>${home} vs ${away}</b>
      <ul>${rows}</ul>
    </div>`;
  }).join("");
}
renderHistorial();

/* ---------- Reconstrucción de ticks desde periodos ---------- */
/** Dado un partido con parciales por periodos, devuelve ticks acumulados por cuarto */
function buildTicksFromPeriods(match){
  const hp = match.home_team_score||{}, ap = match.away_team_score||{};
  const byQ = [
    {ha: hp.period_1||0, aa: ap.period_1||0},
    {ha: hp.period_2||0, aa: ap.period_2||0},
    {ha: hp.period_3||0, aa: ap.period_3||0},
    {ha: hp.period_4||0, aa: ap.period_4||0},
  ];
  const ticks = [];
  let A=0,B=0;
  byQ.forEach((q)=>{
    A += Number(q.ha||0);
    B += Number(q.aa||0);
    ticks.push(`${A}-${B}`);
  });
  return { ticks };
}

/* ---------- INTEGRACIÓN API (config genérica) ---------- */
const API = {
  // ✅ Ajusta aquí tu ruta H2H si tu proveedor usa otra
  H2H_ROUTE: ({teamAId, teamBId}) =>
    `/basketball/head-to-head?home_team_id=${encodeURIComponent(teamAId)}&away_team_id=${encodeURIComponent(teamBId)}&status=finished&from=2017-01-01`,
  HEADERS: (key)=>({
    "Content-Type":"application/json",
    ...(key? {"Authorization":`Bearer ${key}`} : {})
  })
};

async function apiGet(fullBase, path, apiKey){
  const url = fullBase.replace(/\/$/,"") + path;
  const res = await fetch(url, { headers: API.HEADERS(apiKey) });
  if(!res.ok){
    const txt = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${txt}`);
  }
  return res.json();
}

/** Si tu API ya devuelve el mismo formato de los ejemplos, devuelve tal cual */
function adaptDevsSportsMatches(rawArray){
  // return rawArray; // ← si tu API ya coincide, descomenta y borra el mapeo de abajo

  // Mapeo genérico (ajústalo a tu payload real si los nombres difieren):
  return rawArray.map(r=>({
    id: r.id,
    name: r.name || `${r.home?.name} vs ${r.away?.name}`,
    tournament_id: r.tournament_id ?? r.tournament?.id,
    tournament_name: r.tournament_name ?? r.tournament?.name,
    season_id: r.season_id ?? r.season?.id,
    season_name: r.season_name ?? r.season?.name,
    status: r.status || { type: r.status_type || "finished", reason:"Ended" },
    status_type: r.status_type || r.status?.type || "finished",
    start_time: r.start_time || r.started_at || r.date,
    home_team_id: r.home_team_id ?? r.home?.id,
    home_team_name: r.home_team_name ?? r.home?.name,
    away_team_id: r.away_team_id ?? r.away?.id,
    away_team_name: r.away_team_name ?? r.away?.name,
    home_team_score: {
      display: r.home_team_score?.display ?? r.scores?.home?.total,
      current: r.home_team_score?.current ?? r.scores?.home?.total,
      period_1: r.home_team_score?.period_1 ?? r.scores?.home?.q1,
      period_2: r.home_team_score?.period_2 ?? r.scores?.home?.q2,
      period_3: r.home_team_score?.period_3 ?? r.scores?.home?.q3,
      period_4: r.home_team_score?.period_4 ?? r.scores?.home?.q4,
      default_time: r.home_team_score?.default_time ?? r.scores?.home?.total,
    },
    away_team_score: {
      display: r.away_team_score?.display ?? r.scores?.away?.total,
      current: r.away_team_score?.current ?? r.scores?.away?.total,
      period_1: r.away_team_score?.period_1 ?? r.scores?.away?.q1,
      period_2: r.away_team_score?.period_2 ?? r.scores?.away?.q2,
      period_3: r.away_team_score?.period_3 ?? r.scores?.away?.q3,
      period_4: r.away_team_score?.period_4 ?? r.scores?.away?.q4,
      default_time: r.away_team_score?.default_time ?? r.scores?.away?.total,
    },
    league_id: r.league_id ?? r.league?.id,
    league_name: r.league_name ?? r.league?.name,
  }));
}

/** Flujo completo: busca H2H, normaliza, guarda y vuelca último partido */
async function fetchH2HAndPopulate({teamAId, teamBId, apiBase, apiKey}){
  const raw = await apiGet(apiBase, API.H2H_ROUTE({teamAId, teamBId}), apiKey);

  // soporta `raw.data`, `raw.matches` o array plano
  const list = Array.isArray(raw?.data) ? raw.data
             : Array.isArray(raw?.matches) ? raw.matches
             : (Array.isArray(raw) ? raw : []);
  const matches = adaptDevsSportsMatches(list);

  if(!matches.length) throw new Error("La API no devolvió partidos");

  // Ordena por fecha ascendente, y procesa todos al historial
  matches.sort((a,b)=> new Date(a.start_time||0) - new Date(b.start_time||0));
  matches.forEach(upsertHistoryFromMatch);

  // Usa el último para montar el panel
  const last = matches[matches.length-1];

  // Rellena nombres
  $("#equipoA").value = last.home_team_name || "A";
  $("#equipoB").value = last.away_team_name || "B";
  $("#iniciarPartido").click();

  // Construye ticks por cuartos y añádelos
  const { ticks } = buildTicksFromPeriods(last);
  $("#generatedTicks").value = ticks.join("\n");

  for(const t of ticks){
    $("#tickInput").value = t;
    $("#anadirTick").click();
  }

  // Resumen
  renderQuickSummary(metricsFromTicks(state.ticks));

  return { matches, last, ticks };
}

/* ---------- Wire del botón API ---------- */
(function wireAPIBox(){
  const btn = $("#btnFetchH2H");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    const apiBase = $("#apiBase").value.trim();
    const apiKey  = $("#apiKey").value.trim();
    const teamAId = $("#teamAId").value.trim();
    const teamBId = $("#teamBId").value.trim();
    if(!apiBase || !teamAId || !teamBId){ alert("Completa BASE, A y B"); return; }

    btn.disabled = true; const old = btn.textContent; btn.textContent = "Buscando…";
    try{
      await fetchH2HAndPopulate({teamAId, teamBId, apiBase, apiKey});
      btn.textContent = "¡Cargado!";
      setTimeout(()=>{ btn.textContent = old; btn.disabled=false; }, 900);
    }catch(err){
      console.error(err);
      alert("Error: " + err.message);
      btn.textContent = old; btn.disabled=false;
    }
  });
})();
