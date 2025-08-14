/*******************************
 * script.js (versión completa)
 * Panel Basket – MVP gratuito
 *******************************/

/**** CLAVES INICIALES (puedes dejarlas aquí o ponerlas en los inputs y pulsar "Guardar claves") ****/
let SPORTDEVS_API_KEY = "3b9_ggLLo0-VoHA36GObPA";               // Authorization: Bearer <ESTO>
let ODDS_API_KEY      = "6ab0058770900f248c67b20aeefbbbaa";     // The Odds API

/**** Carga/guarda claves en el navegador (localStorage) ****/
(function initKeys(){
  try {
    const a = localStorage.getItem("sdKey");
    const b = localStorage.getItem("oddsKey");
    if (a) SPORTDEVS_API_KEY = a;
    if (b) ODDS_API_KEY = b;
    const sdInput = document.getElementById("sdKey");
    const odInput = document.getElementById("oddsKey");
    if (sdInput) sdInput.value = SPORTDEVS_API_KEY;
    if (odInput) odInput.value = ODDS_API_KEY;
  } catch (_) {}
})();

function guardarClaves(){
  const a = (document.getElementById("sdKey")?.value || "").trim();
  const b = (document.getElementById("oddsKey")?.value || "").trim();
  if (a) { SPORTDEVS_API_KEY = a; try { localStorage.setItem("sdKey", a); } catch(_){} }
  if (b) { ODDS_API_KEY = b;      try { localStorage.setItem("oddsKey", b);} catch(_){} }
  alert("Claves guardadas en este navegador.");
}

/**** Reglas de decisión (Ultra Seguro básico) ****/
function decide({homeScore, awayScore, quarter, secLeftQ}){
  const minPerQ = 10; // FIBA
  const lead = Math.abs(homeScore - awayScore);
  const secsPlayedThisQ = (minPerQ*60) - (secLeftQ||0);
  const minsPlayedTotal = ((quarter-1)*minPerQ) + (secsPlayedThisQ/60);
  const pacePerQ = ((homeScore+awayScore)/Math.max(minsPlayedTotal,1))*minPerQ;
  const fast = pacePerQ >= 50;
  const minLead = fast ? 12 : 10;

  if (quarter !== 4){
    return {state:"ESPERA", html:`🟡 ESPERA<br><small>Aún no es Q4</small>`};
  }
  if (lead < minLead){
    return {state:"ESPERA", html:`🟡 ESPERA<br><small>Ventaja ${lead} &lt; ${minLead}</small>`};
  }
  let p = 0.85 + (lead - minLead)*0.01 + (fast ? -0.02 : +0.02);
  p = Math.max(0.55, Math.min(0.97, p));
  return {state:"ENTRA", html:`✅ ENTRA (${Math.round(p*100)}%)<br><small>ML líder o -3.5/-4.5</small>`};
}

/**** Helpers para leer formatos distintos del feed ****/
function pick(...arr){ return arr.find(v => v !== undefined && v !== null && v !== ""); }
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function parseClock(v){
  // Acepta "05:32", "Q4 02:10", {minutes:2,seconds:10}, 130, etc.
  if (!v && v !== 0) return 0;
  if (typeof v === "number") return Math.max(0, v);
  if (typeof v === "object"){
    const m = num(v.minutes), s = num(v.seconds);
    return Math.max(0, m*60 + s);
  }
  const str = String(v);
  const m = str.match(/(\d{1,2}):(\d{2})$/) || str.match(/(\d{1,2})m?[: ](\d{2})s?/i);
  if (m) return num(m[1])*60 + num(m[2]);
  return 0;
}

/**** Peticiones y pintado ****/
async function actualizar(){
  const btn = document.getElementById("btn");
  const tbody = document.querySelector("#tabla tbody");
  btn.disabled = true; btn.textContent = "Actualizando...";
  tbody.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;

  try {
    // 1) Partidos EN VIVO (SportDevs) — dominio correcto + Bearer
    const liveRes = await fetch("https://basketball.sportdevs.com/matches?status_type=eq.live", {
      headers: { Authorization: "Bearer " + SPORTDEVS_API_KEY }
    });
    if (!liveRes.ok) throw new Error("SportDevs " + liveRes.status);
    const live = await liveRes.json();
    const partidos = Array.isArray(live) ? live : (live?.data || []);

    // 2) Cuotas (opcional; si falla seguimos con candados)
    let oddsAll = [];
    try {
      const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${ODDS_API_KEY}`);
      const sports = await sportsRes.json();
      const basketKeys = (Array.isArray(sports)?sports:[])
        .filter(s => s.key?.startsWith("basketball_"))
        .map(s => s.key);
      for (const key of basketKeys){
        const oRes = await fetch(
          `https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${ODDS_API_KEY}&regions=eu,us&markets=h2h,spreads,totals&oddsFormat=decimal`
        );
        if (oRes.ok){
          const arr = await oRes.json();
          if (Array.isArray(arr)) oddsAll = oddsAll.concat(arr);
        }
      }
    } catch(_) {}

    // 3) Pintar tabla (lector robusto de campos de SportDevs)
    if (!partidos.length){
      tbody.innerHTML = `<tr><td colspan="6">Ahora mismo SportDevs no tiene partidos live.</td></tr>`;
    } else {
      tbody.innerHTML = "";
      // console.log("Ejemplo SportDevs:", partidos[0]); // descomenta para ver la estructura real

      for (const g of partidos){
        // --- competición y equipos ---
        const league = pick(g?.league?.name, g?.tournament?.name, g?.competition?.name, g?.category?.name, g?.league_name, "Basket");
        const homeName = pick(
          g?.home?.name, g?.home_team?.name, g?.home_team, g?.teams?.home?.name,
          g?.home_name, g?.localteam?.name, g?.home?.title, "Local"
        );
        const awayName = pick(
          g?.away?.name, g?.away_team?.name, g?.away_team, g?.teams?.away?.name,
          g?.away_name, g?.visitorteam?.name, g?.away?.title, "Visitante"
        );

        // --- marcador ---
        const homeScore = num(pick(g?.home?.score, g?.home_score, g?.scores?.home, g?.result?.home, g?.home_points, g?.homeScore));
        const awayScore = num(pick(g?.away?.score, g?.away_score, g?.scores?.away, g?.result?.away, g?.away_points, g?.awayScore));

        // --- periodo y reloj ---
        const quarter = num(pick(g?.period, g?.status?.period, g?.current_period, g?.quarter, g?.live_period, 4));
        const secLeftQ = parseClock(pick(
          g?.clock_seconds_left, g?.clock, g?.time_remaining, g?.timeLeft, g?.remaining_time, g?.timer
        ));

        // --- señal Ultra Seguro ---
        const s = decide({homeScore, awayScore, quarter, secLeftQ});

        // --- cuotas (MVP: dejamos candados; emparejar por nombres puede añadirse luego) ---
        const spread = "🔒";
        const total  = "🔒";
        const ml     = "🔒";

        // --- fila ---
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${league}</td>
          <td>${homeName} ${homeScore} - ${awayScore} ${awayName}<br><small>Q${quarter}</small></td>
          <td>${spread}</td>
          <td>${total}</td>
          <td>${ml}</td>
          <td class="chip ${s.state==='ENTRA'?'ok':s.state==='ESPERA'?'wait':'no'}">${s.html}</td>
        `;
        tbody.appendChild(tr);
      }
    }

  } catch (e){
    tbody.innerHTML = `<tr><td colspan="6">Error: ${e.message}</td></tr>`;
    console.error(e);
  } finally {
    const btn = document.getElementById("btn");
    btn.disabled = false; btn.textContent = "Actualizar ahora";
  }
}

/**** Deja los inputs rellenos al cargar ****/
document.addEventListener("DOMContentLoaded", () => {
  const a = document.getElementById("sdKey"); if (a) a.value = SPORTDEVS_API_KEY;
  const b = document.getElementById("oddsKey"); if (b) b.value = ODDS_API_KEY;
});
