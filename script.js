/* =========  AUTO H2H con SportDevs  =========
   Usa tu UI actual:
   - #api-base          (ej: https://basketball.sportdevs.com)
   - #api-key           (opcional, Bearer token)
   - #teamAId, #teamBId (si los tienes; si no, busca por nombre)
   - #equipoA, #equipoB (nombres del bloque "Panel")
   - #btn-h2h           (botón "Buscar H2H")
   - #h2h-results       (div opcional donde volcar resultados)
   - #tabla-partido     (tbody opcional para lista de partidos)
================================================ */

(function () {
  // ---- Helpers para coger elementos sin romper si no existen
  const $ = (sel) => document.querySelector(sel);
  const apiBaseEl = $('#api-base') || $('#apiBase');
  const apiKeyEl  = $('#api-key')  || $('#apiKey');
  const teamAIdEl = $('#teamAId');
  const teamBIdEl = $('#teamBId');
  const teamANameEl = $('#equipoA') || $('#teamAName');
  const teamBNameEl = $('#equipoB') || $('#teamBName');
  const btnH2H = $('#btn-h2h') || document.querySelector('button[data-action="buscar-h2h"]');
  const outEl = $('#h2h-results');
  const tableBody = $('#tabla-partido');

  // ---- Pintar en pantalla/tabla + consola
  function logOut(message) {
    console.log('[H2H]', message);
    if (outEl) {
      outEl.style.whiteSpace = 'pre-wrap';
      outEl.textContent = (typeof message === 'string') ? message : JSON.stringify(message, null, 2);
    }
  }
  function paintTable(matches) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    matches.forEach(m => {
      const tr = document.createElement('tr');
      const when = m.start_time || m.specific_start_time || m.date || m.match_time || '—';
      const tA = m.home_team_name || m.team_home || m.home || m.homeTeam?.name || '—';
      const tB = m.away_team_name || m.team_away || m.away || m.awayTeam?.name || '—';
      const sA = m.home_team_score?.display ?? m.home_team_score?.current ?? m.homeScore ?? m.score?.home ?? '—';
      const sB = m.away_team_score?.display ?? m.away_team_score?.current ?? m.awayScore ?? m.score?.away ?? '—';
      tr.innerHTML = `
        <td>${when}</td>
        <td>${tA}</td>
        <td>${tB}</td>
        <td>${sA} - ${sB}</td>
        <td>${m.tournament_name || m.league_name || m.league?.name || m.tournament?.name || '—'}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // ---- Cliente genérico con múltiples rutas candidatas (por si la doc cambia)
  async function tryFetch(urls, opts) {
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, opts);
        if (!res.ok) {
          lastErr = new Error(`${res.status} ${res.statusText}`);
          continue;
        }
        const data = await res.json();
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('No se pudo obtener respuesta');
  }

  function buildHeaders() {
    const headers = { 'Accept': 'application/json' };
    const key = apiKeyEl?.value?.trim();
    if (key) headers['Authorization'] = `Bearer ${key}`;
    return headers;
  }

  function base() {
    let b = apiBaseEl?.value?.trim();
    if (!b) b = 'https://basketball.sportdevs.com'; // por defecto el de la doc
    // quitar trailing slash
    return b.replace(/\/+$/, '');
  }

  // ---- Buscar equipo por nombre (prueba varias rutas conocidas)
  async function findTeamByName(name) {
    const q = encodeURIComponent(name);
    const b = base();
    const urls = [
      `${b}/teams/search?name=${q}`,
      `${b}/teams?name=${q}`,
      `${b}/teams?search=${q}`,
      `${b}/teams?query=${q}`
    ];
    const data = await tryFetch(urls, { headers: buildHeaders() });
    // Normalizar resultado: puede venir como {data:[...]}, {results:[...]}, [...]
    const list = Array.isArray(data) ? data
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.results) ? data.results
      : [];

    if (!list.length) throw new Error(`No encontré equipo: "${name}"`);
    // Heurística: escoger el más parecido por nombre
    const lower = name.toLowerCase();
    let best = list[0], bestScore = -1;
    for (const t of list) {
      const n = (t.name || t.team_name || t.short_name || '').toLowerCase();
      const score = n === lower ? 100 : n.includes(lower) ? 50 : 0;
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return {
      id: best.id || best.team_id || best._id || best.teamId,
      name: best.name || best.team_name || best.short_name || name
    };
  }

  // ---- Obtener H2H por IDs (prueba varias rutas)
  async function getH2HByIds(idA, idB) {
    const b = base();
    const urls = [
      `${b}/matches/head-to-head?team1=${idA}&team2=${idB}`,
      `${b}/head-to-head?team1_id=${idA}&team2_id=${idB}`,
      `${b}/h2h?teamA=${idA}&teamB=${idB}`,
      `${b}/matches?team_ids=${idA},${idB}&scope=h2h`,
    ];
    const data = await tryFetch(urls, { headers: buildHeaders() });

    // Normalizar array de partidos
    const list = Array.isArray(data) ? data
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.matches) ? data.matches
      : Array.isArray(data?.results) ? data.results
      : [];

    return list;
  }

  // ---- Flujo principal al pulsar "Buscar H2H"
  async function onBuscarH2H() {
    try {
      const aIdRaw = teamAIdEl?.value?.trim();
      const bIdRaw = teamBIdEl?.value?.trim();
      let idA = aIdRaw || null;
      let idB = bIdRaw || null;

      // Si no hay IDs, buscamos por nombre
      if (!idA || !idB) {
        const nameA = teamANameEl?.value?.trim();
        const nameB = teamBNameEl?.value?.trim();
        if (!nameA || !nameB) {
          alert('Rellena IDs o NOMBRES de Equipo A y Equipo B.');
          return;
        }
        const [ta, tb] = await Promise.all([
          findTeamByName(nameA),
          findTeamByName(nameB)
        ]);
        idA = ta.id;
        idB = tb.id;
        if (teamAIdEl) teamAIdEl.value = idA ?? '';
        if (teamBIdEl) teamBIdEl.value = idB ?? '';
        logOut({ equiposDetectados: [ta, tb] });
      }

      const matches = await getH2HByIds(idA, idB);

      if (!matches.length) {
        logOut('No hay enfrentamientos anteriores entre esos equipos.');
        paintTable([]);
        return;
      }

      // Ordenar por fecha descendente si es posible
      matches.sort((x, y) => {
        const dx = Date.parse(x.start_time || x.specific_start_time || x.date || 0);
        const dy = Date.parse(y.start_time || y.specific_start_time || y.date || 0);
        return dy - dx;
      });

      // Resumen rápido
      const last = matches[0];
      const resumen = {
        total_enfrentamientos: matches.length,
        ultimo: {
          fecha: last.start_time || last.specific_start_time || last.date || '—',
          local: last.home_team_name || last.home || last.homeTeam?.name || '—',
          visitante: last.away_team_name || last.away || last.awayTeam?.name || '—',
          marcador: `${last?.home_team_score?.display ?? last?.homeScore ?? '—'} - ${last?.away_team_score?.display ?? last?.awayScore ?? '—'}`,
          torneo: last.tournament_name || last.league_name || last?.league?.name || '—'
        }
      };

      logOut({ resumen, partidos: matches.slice(0, 10) }); // muestra los 10 últimos en texto
      paintTable(matches.slice(0, 25)); // y hasta 25 en la tabla si existe
    } catch (err) {
      console.error(err);
      logOut(`Error: ${err?.message || err}`);
      alert('No se pudo obtener el histórico (revisa Base URL y/o API key).');
    }
  }

  // ---- Wire del botón
  if (btnH2H) {
    btnH2H.addEventListener('click', onBuscarH2H);
  } else {
    // Si no encontramos el botón, escucha clicks globales por si el HTML usa otro selector
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t && (t.id === 'btn-h2h' || t.dataset?.action === 'buscar-h2h')) {
        onBuscarH2H();
      }
    });
  }

  // Mensaje de arranque
  console.log('H2H SportDevs listo. Base URL por defecto:', base());
})();
