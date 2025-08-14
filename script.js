/** ========= Núcleo: cálculo de señal solo con historial de marcador ========= */
function signalFromScore(history) {
  if (!history || history.length === 0) {
    return out('ESPERA','sin datos',0);
  }
  const a = history.at(-1).a, b = history.at(-1).b;
  const T = a + b;
  const lead = Math.abs(a - b);
  const sign = Math.sign(a - b);

  // Fase por total (heurístico FIBA)
  const fase = (T < 70) ? 'early' : (T < 110 ? 'mid' : (T < 140 ? 'late' : 'verylate'));

  // Δlead y ΔT recientes
  const deltasLead = [], deltasT = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i-1], cur = history[i];
    deltasLead.push(Math.abs(cur.a - cur.b) - Math.abs(prev.a - prev.b));
    deltasT.push((cur.a + cur.b) - (prev.a + prev.b));
  }
  const lastDL = deltasLead.at(-1) ?? 0;
  const last5DT = deltasT.slice(-5);

  // momentum: lead_now - lead_hace_3
  let momentum = 0;
  if (history.length >= 4) {
    const then = Math.abs(history.at(-4).a - history.at(-4).b);
    momentum = lead - then;
  }

  // ritmo por mediana de ΔT
  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((x,y)=>x-y);
    const m = Math.floor(s.length/2);
    return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
  };
  const mDT = median(last5DT);
  const ritmo = (mDT >= 6) ? 'fast' : (mDT <= 3 ? 'slow' : 'medium');

  // cambios de líder
  let swaps = 0;
  for (let i = 1; i < history.length; i++) {
    const sPrev = Math.sign(history[i-1].a - history[i-1].b);
    const sNow  = Math.sign(history[i].a - history[i].b);
    if (sPrev !== 0 && sNow !== 0 && sPrev !== sNow) swaps++;
  }

  // Filtros anti-ruido
  if (history.length < 5) return out('ESPERA','historia corta (<5 ticks)',0,{T,lead,sign,fase,ritmo,momentum,lastDL,swaps});
  if (Math.abs(lastDL) >= 5) return out('ESPERA','volatilidad alta (Δlead≥5)',0,{T,lead,sign,fase,ritmo,momentum,lastDL,swaps});
  if (swaps >= 3) return out('NO','demasiados cambios de líder',0,{T,lead,sign,fase,ritmo,momentum,lastDL,swaps});

  // Umbrales internos (definidos aquí, no vienen de ninguna API)
  const need =
    (fase==='mid') ? 14 :
    (fase==='late') ? (ritmo==='fast' ? 12 : 10) :
    (fase==='verylate') ? (ritmo==='fast' ? 11 : 9) :
    Infinity;

  if (fase==='early') return out('NO','fase temprana',0,{T,lead,sign,fase,ritmo,momentum,lastDL,swaps});

  // Confianza
  let conf =
    (fase==='mid')      ? (65 + 1.0*(lead-14)) :
    (fase==='late')     ? (75 + 1.2*(lead-need)) :
    (fase==='verylate') ? (82 + 1.5*(lead-need)) : 0;

  if (momentum >= 2) conf += 4;      // momentum a favor
  if (ritmo === 'fast') conf -= 4;   // penaliza ritmos rápidos
  conf -= 6;                         // penalización por no tener reloj/cuarto
  if (Math.abs(lastDL) >= 3) conf -= 3;

  conf = Math.max(0, Math.min(92, conf)); // cap

  if (lead >= need && conf >= 82 && lastDL <= 0) return out('ENTRA', why(), Math.round(conf), {T,lead,sign,fase,ritmo,momentum,lastDL,swaps});
  if (lead >= need && conf >= 70)               return out('ESPERA', why(), Math.round(conf), {T,lead,sign,fase,ritmo,momentum,lastDL,swaps});
  return out('NO',     why(), Math.round(Math.min(conf,69)), {T,lead,sign,fase,ritmo,momentum,lastDL,swaps});

  function why(){ return `${fase}+${ritmo}, lead=${lead} (need≥${need}), momentum=${momentum}, Δlead1=${lastDL}`; }
  function out(signal, reason, confidence, debug){
    return { signal, reason, confidence, stake: signal==='ENTRA'?1.0:0, debug: debug||{} };
  }
}

/** ========= UI mínima: introducir marcador y ver la señal ========= */
const history = []; // guardamos aquí los ticks introducidos

const $ = sel => document.querySelector(sel);
const scoreInput = $('#scoreInput');
const addBtn = $('#addBtn');
const resetBtn = $('#resetBtn');
const historyBox = $('#historyBox');
const tbody = $('#tbody');
const quick = $('#quick');

addBtn.addEventListener('click', addTick);
resetBtn.addEventListener('click', () => { history.length = 0; render(); });
scoreInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTick(); });

function addTick(){
  const val = (scoreInput.value || '').trim();
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(val);
  if(!m){ alert('Formato inválido. Usa A-B, ej: 72-58'); return; }
  const a = parseInt(m[1],10), b = parseInt(m[2],10);
  history.push({a,b});
  if(history.length>40) history.splice(0, history.length-40); // conserva últimos 40
  scoreInput.value = '';
  render();
}

function pill(text, type){
  const cls = type==='ok'?'ok':type==='warn'?'warn':'no';
  return `<span class="pill ${cls}">${text}</span>`;
}

function render(){
  historyBox.textContent = history.length ? history.map(h=>`${h.a}-${h.b}`).join('  →  ') : '—';

  const res = signalFromScore(history);
  const d = res.debug || {};

  // Resumen rápido
  if(history.length){
    quick.textContent = `T: ${d.T??'—'} · Lead: ${d.lead??'—'} · Fase: ${d.fase??'—'} · Ritmo: ${d.ritmo??'—'} · Momentum: ${d.momentum??'—'}`;
  }else{
    quick.textContent = 'T: — · Lead: — · Fase: — · Ritmo: — · Momentum: —';
  }

  // Fila de tabla
  const signalType = res.signal==='ENTRA'?'ok':res.signal==='ESPERA'?'warn':'no';
  const leadTotal = history.length ? `${d.lead ?? '—'} / ${d.T ?? '—'}` : '—';
  const row = `
    <tr>
      <td>${pill(res.signal, signalType)}</td>
      <td>${res.confidence ?? 0}%</td>
      <td class="mini">${res.reason || '—'}</td>
      <td>${leadTotal}</td>
      <td>${d.fase ?? '—'}</td>
      <td>${d.ritmo ?? '—'}</td>
      <td>${d.momentum ?? '—'}</td>
      <td>${d.lastDL ?? '—'}</td>
      <td>${d.swaps ?? '—'}</td>
    </tr>`;
  tbody.innerHTML = row;
}

// Render inicial
render();
