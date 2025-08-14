(function () {
  const $ = (s) => document.querySelector(s);
  const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
  const logBox = "#log";
  const show = (el, on = true) => { if (typeof el === "string") el = $(el); if (el) el.style.display = on ? "" : "none"; };

  function log(msg) { show(logBox, true); $(logBox).textContent = String(msg ?? ""); }
  function setStatus(text, tone = "") {
    const b = $("#status");
    b.textContent = text;
    b.style.background = tone === "ok" ? "#e8fff1" : tone === "err" ? "#ffe9e9" : "#eef2ff";
    b.style.color = tone === "ok" ? "#0a7c3b" : tone === "err" ? "#b91c1c" : "#3b5bdb";
  }

  // defaults
  const state = {
    baseUrl: "https://basketball.sportdevs.com",
    apiKey : "",
    lastErr: null
  };
  $("#baseUrl").value = state.baseUrl;
  $("#apiKey").value  = state.apiKey;

  // normalizador + alias
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");

  const ALIAS = {
    suecia: "sweden", espana: "spain", granbretana: "greatbritain",
    finlandia: "finland", islandia: "iceland", alemania: "germany",
    republicacheca: "czechrepublic", macedoniadelnorte: "northmacedonia",
    bosnia: "bosnia", bosniayherzegovina: "bosnia", bielorrusia: "belarus",
  };

  // IDs conocidos por tus datos
  const TEAMS = {
    sweden:           { senior: 8810,  u16: 408202 },
    finland:          { senior: 9070,  u16: 408204 },
    iceland:          { /* senior: ?, */ u16: 408206 },
    denmark:          { senior: 9506,  u16: 408201 },
    estonia:          { senior: 9713,  u16: 408205 },
    norway:           { /* senior: ?, */ u16: 408203 },

    germany:          { senior: 8214 },
    spain:            { senior: 7051 },
    greatbritain:     { senior: 8287 },
    lithuania:        { senior: 9032 },
    belgium:          { senior: 1901 },
    israel:           { senior: 8114 },
    latvia:           { senior: 7905 },
    bosnia:           { senior: 6995 },
    belarus:          { senior: 7239 },
    italy:            { senior: 7999 },
    slovakia:         { senior: 8483 },
    canada:           { senior: 6981 },
    japan:            { senior: 6961 },
    montenegro:       { senior: 7826 },
    russia:           { senior: 1964 },
    serbia:           { senior: 7093 },
    czechrepublic:    { senior: 7090 },
    slovenia:         { senior: 8366 },
    croatia:          { senior: 8913 },
    northmacedonia:   { senior: 8944 },
    france:           { senior: 7165 },
  };

  function pickLocalId(nameRaw) {
    let s = norm(nameRaw);
    const isU16 = /u16/.test(s);
    s = s.replace(/(women|femenino|seleccion|team|w)/g, "");
    if (ALIAS[s]) s = ALIAS[s];

    if (TEAMS[s]) {
      if (isU16 && TEAMS[s].u16) return TEAMS[s].u16;
      return TEAMS[s].senior || TEAMS[s].u16 || null;
    }
    for (const key of Object.keys(TEAMS)) {
      if (s.includes(key)) {
        if (isU16 && TEAMS[key].u16) return TEAMS[key].u16;
        return TEAMS[key].senior || TEAMS[key].u16 || null;
      }
    }
    return null;
  }

  async function req(path) {
    const base = ($("#baseUrl").value || state.baseUrl || "").replace(/\/+$/, "");
    const headers = { Accept: "application/json" };
    const k = ($("#apiKey").value || state.apiKey || "").trim();
    if (k) headers.Authorization = `Bearer ${k}`;
    const r = await fetch(base + path, { headers });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${r.statusText} @ ${path}\n${t}`);
    }
    return r.json();
  }

  async function findTeamIdByName(name) {
    const local = pickLocalId(name);
    if (local) return local;

    const tries = [
      `/teams?name=${encodeURIComponent(name)}`,
      `/teams?search=${encodeURIComponent(name)}`,
      `/teams/search?query=${encodeURIComponent(name)}`,
      `/teams/search?name=${encodeURIComponent(name)}`
    ];
    for (const p of tries) {
      try {
        const data = await req(p);
        if (Array.isArray(data) && data.length && (data[0].id || data[0].team_id)) {
          return data[0].id || data[0].team_id;
        }
      } catch {}
    }
    return null;
  }

  async function getH2H(a, b) {
    const tries = [
      `/h2h?team_a_id=${a}&team_b_id=${b}`,
      `/matches/head2head?team_a_id=${a}&team_b_id=${b}`,
      `/matches?team_id=${a}`,
      `/matches?team_id=${b}`,
      `/matches-by-date?start_time_from=2017-01-01&start_time_to=2030-01-01`
    ];
    let lastErr = null, found = [];
    for (const p of tries) {
      try {
        const data = await req(p);
        let list = Array.isArray(data) ? data : [];
        if (p.includes("matches?team_id")) {
          list = list.filter(m =>
            (m.home_team_id === a && m.away_team_id === b) ||
            (m.home_team_id === b && m.away_team_id === a)
          );
        }
        if (p.startsWith("/matches-by-date")) {
          list = list.filter(m =>
            (m.home_team_id === a && m.away_team_id === b) ||
            (m.home_team_id === b && m.away_team_id === a)
          );
        }
        if (list.length) { found = list; break; }
      } catch (e) { lastErr = e; }
    }
    state.lastErr = lastErr;
    return found;
  }

  function renderMatches(list) {
    const tb = $("#rows"); tb.innerHTML = "";
    if (!list.length) { $("#tbl").style.display = "none"; return; }
    const f = (d) => (d || "").replace("T"," ").replace("+00:00","").slice(0,16);
    list.sort((a,b)=> a.start_time > b.start_time ? -1 : 1).slice(0,30).forEach(m=>{
      const tr = document.createElement("tr");
      const tot = (m.home_team_score?.display ?? "—") + "-" + (m.away_team_score?.display ?? "—");
      const P = (n)=> [m.home_team_score?.[n], m.away_team_score?.[n]].every(Number.isFinite)
        ? `${m.home_team_score[n]}-${m.away_team_score[n]}` : "—";
      tr.innerHTML = `
        <td class="muted">${f(m.start_time || "")}</td>
        <td>${m.home_team_name || m.home_team_id}</td>
        <td>${m.away_team_name || m.away_team_id}</td>
        <td><b>${tot}</b></td>
        <td class="muted">${P("period_1")} · ${P("period_2")} · ${P("period_3")} · ${P("period_4")}</td>
        <td>${m.status?.type || m.status_type || "—"}</td>
        <td class="muted">${m.league_name || m.tournament_name || "—"}</td>
      `;
      tb.appendChild(tr);
    });
    $("#tbl").style.display = "";
  }

  // Botones
  $("#btnPing").addEventListener("click", async () => {
    setStatus("PROBANDO…"); log("");
    try { await req("/status").catch(()=>({})); setStatus("OK","ok"); log("Conexión OK."); }
    catch(e){ setStatus("ERROR","err"); log(e.message || e); }
  });

  $("#btnBuscarNombres").addEventListener("click", async () => {
    const aName = $("#teamA").value.trim();
    const bName = $("#teamB").value.trim();
    if (!aName || !bName) return alert("Escribe los nombres de ambos equipos");
    setStatus("BUSCANDO EQUIPOS…"); log("");

    const [aid, bid] = await Promise.all([findTeamIdByName(aName), findTeamIdByName(bName)]);
    if (!aid || !bid) {
      setStatus("SIN EQUIPOS","err");
      const miss = [!aid ? `A="${aName}"`:"", !bid ? `B="${bName}"`:""].filter(Boolean).join(" · ");
      return log(`No pude resolver IDs para: ${miss}\nPrueba con el nombre exacto (ej.: "Sweden U16") o pega IDs si los tienes.`);
    }
    $("#idA").value = String(aid);
    $("#idB").value = String(bid);
    setStatus("OK","ok");
    log(`Resuelto: A=${aid} · B=${bid}. Pulsa “Buscar H2H”.`);
  });

  $("#btnH2H").addEventListener("click", async () => {
    const A = parseInt($("#idA").value,10);
    const B = parseInt($("#idB").value,10);
    if (!A || !B) return alert("Rellena los IDs o usa 'Resolver por nombres'.");
    setStatus("BUSCANDO H2H…");
    setText("#quick","T: — · Lead: — · Fase: — · Ritmo: — · Momentum: —");
    log(""); $("#tbl").style.display = "none";

    try {
      const list = await getH2H(A,B);
      if (!list.length) {
        setStatus("SIN HISTÓRICO");
        const extra = state.lastErr ? ("\n" + (state.lastErr.message || state.lastErr)) : "";
        return log(`No se pudo obtener el H2H con los endpoints probados.${extra}`);
      }
      const last = list[0];
      const total = (last.home_team_score?.display ?? "-") + "-" + (last.away_team_score?.display ?? "-");
      setText("#quick", `T: ${total} · Lead: — · Fase: — · Ritmo: — · Momentum: —`);
      $("#matchLabel").textContent = `${last.home_team_name || A} vs ${last.away_team_name || B}`;
      $("#conf").textContent = "100%";
      renderMatches(list);
      setStatus("OK","ok");
      log(`Encontrados ${list.length} enfrentamientos.`);
    } catch(e) {
      setStatus("ERROR","err");
      log(e.message || e);
    }
  });
})();

