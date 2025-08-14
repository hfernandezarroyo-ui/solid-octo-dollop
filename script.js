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
    const s = [...arr].sort((x,

