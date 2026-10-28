// Solar PV sizing helpers: finds the client's address and asks PVGIS (European Commission) for the
// yearly and monthly output of 1 kWp at that location, tilt and orientation.
const json = (status, body) => Response.json(body, { status });
const coord = (v, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

export async function handlePv(req, path) {
  if (req.method !== 'GET') return json(405, { error: 'Método não permitido.' });
  const q = new URL(req.url).searchParams;
  try {
    if (path === 'pv/local') {
      const text = String(q.get('q') || '').trim().slice(0, 300);
      if (text.length < 3) return json(400, { error: 'Indique a morada ou a localidade.' });
      const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pt&accept-language=pt&q=' + encodeURIComponent(text);
      let r = await fetch(url, { headers: { 'user-agent': 'enat-contas/1.0 (pontedelima@enat.pt)' }, signal: AbortSignal.timeout(10000) });
      let rows = r.ok ? await r.json() : [];
      // Full street addresses often fail; the last parts (locality, municipality) usually work.
      const parts = text.split(',').map(s => s.trim()).filter(Boolean);
      for (let i = 1; r.ok && !rows.length && i < parts.length; i++) {
        r = await fetch(url.replace(/q=.*/, 'q=' + encodeURIComponent(parts.slice(i).join(', '))), { headers: { 'user-agent': 'enat-contas/1.0 (pontedelima@enat.pt)' }, signal: AbortSignal.timeout(10000) });
        rows = r.ok ? await r.json() : [];
      }
      if (!r.ok) return json(502, { error: 'O serviço de mapas não respondeu. Indique a latitude e a longitude.' });
      if (!rows.length) return json(404, { error: 'Morada não encontrada. Escreva só a localidade e o concelho, ou indique a latitude e a longitude.' });
      return json(200, { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: rows[0].display_name });
    }
    if (path === 'pv/producao') {
      const lat = coord(q.get('lat'), -60, 70), lon = coord(q.get('lon'), -180, 180), angle = coord(q.get('angle'), 0, 90), aspect = coord(q.get('aspect'), -180, 180);
      if (lat === null || lon === null || angle === null || aspect === null) return json(400, { error: 'Localização, inclinação ou orientação inválidas.' });
      const url = `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&angle=${angle}&aspect=${aspect}&outputformat=json`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const b = await r.json().catch(() => null);
      const monthly = b?.outputs?.monthly?.fixed?.map(m => Number(m.E_m)), annual = Number(b?.outputs?.totals?.fixed?.E_y);
      if (!r.ok || monthly?.length !== 12 || !(annual > 0)) return json(502, { error: b?.message || 'O PVGIS não respondeu. A produção fica estimada; tente mais tarde.' });
      return json(200, { annual: Math.round(annual), monthly: monthly.map(n => Math.round(n * 10) / 10), source: 'PVGIS' });
    }
  } catch { return json(502, { error: 'Serviço indisponível. Tente novamente.' }); }
  return json(404, { error: 'Não encontrado.' });
}
