/**** CONFIG INICIAL (puedes dejarlo así; también se pueden poner abajo en el formulario) ****/
let SPORTDEVS_API_KEY = "3b9_ggLLo0-VoHA36GObPA";               // Authorization: Bearer <ESTO>
let ODDS_API_KEY      = "6ab0058770900f248c67b20aeefbbbaa";     // The Odds API

// Cargar claves guardadas en localStorage si existen (no se suben a GitHub)
(function initKeys(){
  const a = localStorage.getItem("sdKey");
  const b = localStorage.getItem("oddsKey");
  if (a) SPORTDEVS_API_KEY = a;
  if (b) ODDS_API_KEY = b;
  const sdInput = document.getElementById("sdKey");
  const odInput = document.getElementById("oddsKey");
  if (sdInput) sdInput.value = SPORTDEVS_API_KEY;
  if (odInput) odInput.value = ODDS_API_KEY;
})();

function guardarClaves(){
  const a = document.getElementById("sdKey").value.trim();
  const b = document.getElementById("oddsKey").value.trim();
  if (a) { SPORTDEVS_API_KEY = a; localStorage.setItem("sdKey", a); }
  if (b) { ODDS_API_KEY = b; localStorage.setItem("oddsKey", b); }
  alert("Claves guardadas en este navegador.");
}

/**** LÓGICA DE SEÑAL (Ultra Seguro básico) ****/
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

/**** PETICIONES Y UI ****/
async function actualizar(){
  const btn = document.getElementById("btn");
  const tbody = document.querySelector("#tabla tbody");
  btn.disabled = true; btn.textContent = "Actualizando..."; 
  tbody.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;

  try {
    // 1) Partidos en vivo (SportDevs; dominio correcto y Bearer)
    const liveRes = await fetch("https://basketball.sportdevs.com/matches?status_type=eq.live", {
      headers: { Authorization: "Bearer " + SPORTDEVS_API_KEY }
    });
    if (!liveRes.ok) throw new Error("SportDevs " + liveRes.status);
    const live = await liveRes.json();
    const partidos = Array.isArray(live) ? live : (live?.data || []);

    // 2) Cuotas (opcional; si falla, seguimos)
    let oddsAll = [];
    try{
      const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${ODDS_API_KEY}`);
      const sports = await sportsRes.json();
      const basketKeys = (Array.isArray(sports)?sports:[]).filter(s => s.key?.startsWith("basketball_")).map(s => s.key);
      for (const key of basketKeys){
        const oRes = await fetch(`https://api.the-odds-api.com/v4/sports/${key}/odds?apiKey=${ODDS_API_KEY}&regions=eu,us&markets=h2h,spreads,totals&oddsFormat=decimal`);
        if (oRes.ok){
          const arr = await oRes.json();
          if (Array.isArray(arr)) oddsAll = oddsAll.concat(arr);
        }
      }
    }catch(_){/* ignoramos para no romper */ }

    // 3) Pintar tabla
    if (!partidos.length){
      tbody.innerHTML = `<tr><td colspan="6">Ahora mismo SportDevs no tiene partidos live.</td></tr>`;
    } else {
      tbody.innerHTML = "";
      for (const g of partidos){
        const league = g?.league?.name || g?.tournament?.name || "Basket";
        const homeName = g?.home?.name || g?.home_team || "Local";
        const awayName = g?.away?.name || g?.away_team || "Visitante";
        const homeScore = Number(g?.home?.score ?? g?.home_score ?? 0);
        const awayScore = Number(g?.away?.score ?? g?.away_score ?? 0);
        const quarter = g?.period || g?.status?.period || 4;
        const secLeftQ = g?.clock_seconds_left ?? 0;

        const s = decide({homeScore, awayScore, quarter, secLeftQ});

        // Por ahora dejamos candados (gratis): si luego encontramos match de odds, los rellenamos.
        let spread = "🔒", total = "🔒", ml = "🔒";

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
  } finally {
    btn.disabled = false; btn.textContent = "Actualizar ahora";
  }
}

// Auto-cargar claves en los inputs al abrir
document.addEventListener("DOMContentLoaded", () => {
  const a = document.getElementById("sdKey"); if (a) a.value = SPORTDEVS_API_KEY;
  const b = document.getElementById("oddsKey"); if (b) b.value = ODDS_API_KEY;
});
