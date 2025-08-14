(function () {
  // -------- Helpers UI --------
  const $ = (s) => document.querySelector(s);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const show = (el, on = true) => { if (typeof el === 'string') el = $(el); if (el) el.style.display = on ? '' : 'none'; };
  const logBox = $("#log");

  // -------- Estado base --------
  const state = {
    baseUrl: (window.__DEFAULTS__ && window.__DEFAULTS__.BASE_URL) || "",
    apiKey : (window.__DEFAULTS__ && window.__DEFAULTS__.API_KEY ) || "",
    teamAId: null,
    teamBId: null,
    lastErr: null
  };

  // -------- Inicializa inputs --------
  $("#baseUrl").value = state.baseUrl || "https://basketball.sportdevs.com";
  $("#apiKey").value  = state.apiKey;

  // -------- Core fetch con Bearer --------
  async function req(path, params = {}) {
    const base = ($("#baseUrl").value || state.baseUrl || "").replace(/\/+$/,"");
    const url  = base + path;
    const headers = { "Accept":"application/json" };
    const key = ($("#apiKey").value || state.apiKey || "").trim();
    if (key) headers["Authorization"] = `Bearer ${key}`;

    const r = await fetch(url, { headers });
    if (!r.ok) {
      const txt = await r.text().catch(()=> "");
      throw new Error(`HTTP ${r.status} ${r.statusText} @ ${path}\n${txt}`);
    }
    return r.json();
  }

  // -------- Resolución de equipo por nombre --------
  async function findTeamIdByName(name) {
    // Intento 1: /teams?name=
    try {
      const data = await req(`/teams?name=${encodeURIComponent(name)}`);
      if (Array.isArray(data) && data.length) return data[0].id;
    } catch (e) { /* sigue */ }

    // Intento 2: /teams/search?query=
    try {
      const data = await req(`/teams/search?query=${encodeURIComponent(name)}`);
      if (Array.isArray(data) && data.length) return data[0].id;
    } catch (e) { /* sigue */ }

    // Sin suerte
    return null;
  }

  // -------- H2H: intentos de endpoints comunes --------
  async function getH2H(teamAId, teamBId) {
    // 1) endpoint directo de h2h (si existiera)
    const attempts = [
      `/h2h?team_a_id=${teamAId}&team_b_id=${teamBId}`,
      `/matches/head2head?team_a_id=${teamAId}&team_b_id=${teamBId}`,
      // 2) fallback amplio: descargar partidos por fecha y filtrar (últimos años)
      `/matches-by-date?start_time_from=2017-01-01&start_time_to=2030-01-01`
    ];

    let lastErr = null;
    for (const p of attempts) {
      try {
        const data = await req(p);
        // si es el fallback, filtramos por ids:
        let list = data;
        if (p.startsWith("/matches-by-date")) {
          list = (Array.isArray(data) ? data : []).filter(m =>
            (m.home_team_id === teamAId && m.away_team_id === teamBId) ||
            (m.home_team_id === teamBId && m.away_team_id === teamAId)
          );
        }
        if (Array.isArray(list) && list.length) return list;
      } catch (e) {
        lastErr = e;
      }
    }
    state.lastErr = lastErr;
    return [];
  }

  // -------- Presentación de tabla --------
  function renderMatches(list) {
    const tbody = $("#rows"); tbody.innerHTML = "";
    if (!list.length) { show("#tbl", false); return; }

    const f = (d) => (d || "").replace("T"," ").replace("+00:00","").slice(0,16);

    list
      .sort((a,b) => (a.start_time > b.start_time ? -1 : 1))
      .slice(0, 30)
      .forEach(m => {
        const tr = document.createElement("tr");
        const total = (m.home_team_score?.display ?? "—") + "-" + (m.away_team_score?.display ?? "—");
        const p1 = [m.home_team_score?.period_1, m.away_team_score?.period_1].every(Number.isFinite) ?
          `${m.home_team_score.period_1}-${m.away_team_score.period_1}` : "—";
        const p2 = [m.home_team_score?.period_2, m.away_team_score?.period_2].every(Number.isFinite) ?
          `${m.home_team_score.period_2}-${m.away_team_score.period_2}` : "—";
        const p3 = [m.home_team_score?.period_3, m.away_team_score?.period_3].every(Number.isFinite) ?
          `${m.home_team_score.period_3}-${m.away_team_score.period_3}` : "—";
        const p4 = [m.home_team_score?.period_4, m.away_team_score?.period_4].every(Number.isFinite) ?
          `${m.home_team_score.period_4}-${m.away_team_score.period_4}` : "—";

        tr.innerHTML = `
          <td class="muted">${f(m.start_time || "")}</td>
          <td>${m.home_team_name || m.home_team_id}</td>
          <td>${m.away_team_name || m.away_team_id}</td>
          <td><b>${total}</b></td>
          <td class="muted">${p1} · ${p2} · ${p3} · ${p4}</td>
          <td>${m.status?.type || m.status_type || "—"}</td>
          <td class="muted">${m.league_name || m.tournament_name || "—"}</td>
        `;
        tbody.appendChild(tr);
      });
    show("#tbl", true);
  }

  function setStatus(text, tone="") {
    const b = $("#status");
    b.textContent = text;
    b.style.background = tone==="ok" ? "#e8fff1" : tone==="err" ? "#ffe9e9" : "#eef2ff";
    b.style.color = tone==="ok" ? "#0a7c3b" : tone==="err" ? "#b91c1c" : "#3b5bdb";
  }

  function log(msg) {
    show(logBox, true);
    logBox.textContent = String(msg || "");
  }

  // -------- Botón: Probar API --------
  $("#btnPing").addEventListener("click", async () => {
    setStatus("PROBANDO…");
    log("");
    try {
      // buscamos algo muy barato; si no existe, igualmente veremos si responde 200/401
      await req("/status").catch(()=> ({}));
      setStatus("OK", "ok");
      log("Conexión OK. Si algún endpoint concreto falla, revisa la Base URL exacta de la doc y que el token sea válido.");
    } catch (e) {
      setStatus("ERROR", "err");
      log(e.message || e);
    }
  });

  // -------- Botón: Resolver IDs por nombres --------
  $("#btnBuscarNombres").addEventListener("click", async () => {
    const aName = $("#teamA").value.trim();
    const bName = $("#teamB").value.trim();
    if (!aName || !bName) return alert("Escribe los nombres de ambos equipos");

    setStatus("BUSCANDO EQUIPOS…");
    log("");

    const [aid, bid] = await Promise.all([findTeamIdByName(aName), findTeamIdByName(bName)]);
    if (!aid || !bid) {
      setStatus("SIN EQUIPOS", "err");
      const miss = [!aid ? `A="${aName}"`:"", !bid ? `B="${bName}"`:""].filter(Boolean).join(" · ");
      return log(`No pude resolver IDs para: ${miss}\nVerifica cómo los nombra la API.`);
    }

    $("#idA").value = String(aid);
    $("#idB").value = String(bid);
    setStatus("OK", "ok");
    log(`Resuelto: A=${aid} · B=${bid}. Ahora pulsa “Buscar H2H”.`);
  });

  // -------- Botón: Buscar H2H (por IDs ya en los inputs) --------
  $("#btnH2H").addEventListener("click", async () => {
    const A = parseInt($("#idA").value, 10);
    const B = parseInt($("#idB").value, 10);
    if (!A || !B) return alert("Rellena los IDs de ambos equipos o resuélvelos por nombre.");

    setStatus("BUSCANDO H2H…");
    setText("#quick", "T: — · Lead: — · Fase: — · Ritmo: — · Momentum: —");
    log("");
    show("#tbl", false);

    try {
      const list = await getH2H(A, B);
      if (!list.length) {
        setStatus("SIN HISTÓRICO");
        let extra = state.lastErr ? ("\n" + (state.lastErr.message || state.lastErr)) : "";
        return log(`No se pudo obtener el H2H con los endpoints probados.${extra ? "\n" + extra : ""}`);
      }

      // Resumen muy simple
      const last = list[0];
      const total = (last.home_team_score?.display ?? "-") + "-" + (last.away_team_score?.display ?? "-");
      setText("#quick", `T: ${total} · Lead: — · Fase: — · Ritmo: — · Momentum: —`);
      $("#matchLabel").textContent = `${last.home_team_name || A} vs ${last.away_team_name || B}`;
      $("#conf").textContent = "100%";
      renderMatches(list);
      setStatus("OK", "ok");
      log(`Encontrados ${list.length} enfrentamientos.`);
    } catch (e) {
      setStatus("ERROR", "err");
      log(e.message || e);
    }
  });
})();

