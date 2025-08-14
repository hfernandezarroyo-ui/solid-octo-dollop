(function () {
  // ---------- util ----------
  const $ = (s) => document.querySelector(s);
  const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
  const show = (el, on = true) => { if (typeof el === "string") el = $(el); if (el) el.style.display = on ? "" : "none"; };
  const logBox = "#log";

  function log(msg) { show(logBox, true); $(logBox).textContent = String(msg ?? ""); }
  function setStatus(text, tone = "") {
    const b = $("#status");
    b.textContent = text;
    b.style.background = tone === "ok" ? "#e8fff1" : tone === "err" ? "#ffe9e9" : "#eef2ff";
    b.style.color = tone === "ok" ? "#0a7c3b" : tone === "err" ? "#b91c1c" : "#3b5bdb";
  }

  // ---------- defaults ----------
  const state = {
    baseUrl: (window.__DEFAULTS__ && window.__DEFAULTS__.BASE_URL) || "https://basketball.sportdevs.com",
    apiKey : (window.__DEFAULTS__ && window.__DEFAULTS__.API_KEY ) || "",
    lastErr: null
  };
  $("#baseUrl").value = state.baseUrl;
  $("#apiKey").value  = state.apiKey;

  // ---------- normalizador + alias ----------
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");

  // Mapa de alias → clave país
  const ALIAS = {
    suecia: "sweden", espana: "spain", granbretana: "greatbritain",
    finlandia: "finland", islandia: "iceland", alemania: "germany",
    republicacheca: "czechrepublic", macedoniadelnorte: "northmacedonia",
    bosnia: "bosnia", bosniayherzegovina: "bosnia", bielorrusia: "belarus",
  };

  // Clave país → IDs (senior / u16)  (de tus datos)
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
    // prueba por contiene (ej. "swedenu16")
    for (const key of Object.keys(TEAMS)) {
      if (s.includes(key)) {
        if (isU16 && TEAMS[key].u16) return TEAMS[key].u16;
        return TEAMS[key].senior || TEAMS[key].u16 || null;
      }
    }
    return null;
  }

  // ---------- Petición con Bearer ----------
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

  // ---------- Buscar ID por nombre con API (+ local fallback) ----------
  async function findTeamIdByName(name) {
    // 0) local
    const local = pickLocalId(name);
    if (local) return local;

    // 1) algunos endpoints típicos
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
      } catch { /* siguiente intento */ }
    }
    return null;
  }

