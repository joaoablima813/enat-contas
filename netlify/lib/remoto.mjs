// Acesso remoto aos equipamentos instalados (separador «Equipamentos» da obra).
// - AlphaESS (inversores e baterias): Open API oficial (open.alphaess.com). Chaves: ALPHAESS_APP_ID e ALPHAESS_APP_SECRET.
//   Cada sistema é associado à conta da ENAT com o número de série (SN) e o CheckCode.
// - Smart Life / Tuya (Energie, Ekallor R290, Proteu piscina): Tuya Cloud (iot.tuya.com), com as contas Smart Life dos
//   clientes ligadas ao projeto da ENAT. Chaves: TUYA_ACCESS_ID, TUYA_ACCESS_SECRET e TUYA_ENDPOINT (por omissão Europa Central).
// As chaves ficam só no servidor (variáveis secretas do Netlify); a app nunca as vê.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { request } from 'node:https';

const json = (status, body) => Response.json(body, { status });
const SN = /^[A-Za-z0-9_-]{4,40}$/, TID = /^[A-Za-z0-9]{6,40}$/, CODE = /^[A-Za-z0-9_]{1,40}$/;

// ---------- AlphaESS ----------
const ALPHA = 'https://openapi.alphaess.com/api';
const ALPHA_ERR = { 6002: 'Este número de série não está associado à ENAT.', 6003: 'Este sistema já está associado.', 6004: 'O CheckCode não está certo.', 6005: 'Este sistema não está associado à conta da ENAT.', 6038: 'Este número de série não existe na AlphaESS.', 6042: 'O sistema está offline (sem ligação à internet).', 6046: 'Código de verificação errado.', 6053: 'Pedidos demasiado rápidos. Tente daqui a um minuto.' };
export function alphaHeaders(appId, secret, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  const sign = createHash('sha512').update(appId + secret + timestamp).digest('hex');
  return { 'content-type': 'application/json', appId, timestamp, timeStamp: timestamp, sign };
}
// A AlphaESS exige um corpo JSON também nos pedidos GET (o fetch não o permite), por isso usa-se https diretamente.
const httpsJson = (url, { method, headers, body }) => new Promise((ok, ko) => {
  const b = body ?? '{}', r = request(url, { method, headers: { ...headers, 'content-length': Buffer.byteLength(b) }, timeout: 15000 }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok({ json: async () => JSON.parse(d || '{}') })); });
  r.on('timeout', () => r.destroy(new Error('A AlphaESS não respondeu a tempo.'))); r.on('error', ko); r.end(b);
});
async function alpha(path, { method = 'GET', body, fetcher = httpsJson } = {}) {
  const id = process.env.ALPHAESS_APP_ID, secret = process.env.ALPHAESS_APP_SECRET;
  if (!id || !secret) throw Object.assign(new Error('A ligação à AlphaESS ainda não está configurada.'), { status: 503 });
  const r = await fetcher(ALPHA + path, { method, headers: alphaHeaders(id, secret), body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (j.code === 200 || j.msg === 'Success' || j.info === 'Success') return j.data ?? null;
  throw Object.assign(new Error(ALPHA_ERR[j.code] || j.msg || 'A AlphaESS não respondeu.'), { status: 502, code: j.code });
}

// ---------- Tuya (Smart Life) ----------
const TUYA = () => String(process.env.TUYA_ENDPOINT || 'https://openapi.tuyaeu.com').replace(/\/+$/, '');
const sha256 = (s) => createHash('sha256').update(s || '').digest('hex');
// Assinatura da Tuya: HMAC-SHA256 de client_id [+ access_token] + t + nonce + (método, hash do corpo, cabeçalhos, caminho).
export function tuyaSign({ id, secret, token = '', t, nonce = '', method, path, body = '' }) {
  const [p, q] = path.split('?');
  const url = q ? p + '?' + q.split('&').sort().join('&') : p;
  const toSign = [method, sha256(body), '', url].join('\n');
  return createHmac('sha256', secret).update(id + token + t + nonce + toSign).digest('hex').toUpperCase();
}
async function tuyaRaw(method, path, { body, token = '', fetcher = fetch, now = Date.now() } = {}) {
  const id = process.env.TUYA_ACCESS_ID, secret = process.env.TUYA_ACCESS_SECRET;
  if (!id || !secret) throw Object.assign(new Error('A ligação à Smart Life (Tuya) ainda não está configurada.'), { status: 503 });
  const t = String(now), nonce = randomBytes(8).toString('hex'), b = body ? JSON.stringify(body) : '';
  const headers = { client_id: id, t, nonce, sign_method: 'HMAC-SHA256', sign: tuyaSign({ id, secret, token, t, nonce, method, path, body: b }), 'content-type': 'application/json', ...(token ? { access_token: token } : {}) };
  const r = await fetcher(TUYA() + path, { method, headers, body: b || undefined });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw Object.assign(new Error(j.msg || 'A Smart Life (Tuya) não respondeu.'), { status: 502, code: j.code });
  return j.result;
}
// Uma só sessão para pedidos em paralelo; guardada até perto de expirar.
let tokenEmCurso = null;
async function tuyaToken(store, opts = {}) {
  const c = await store.get('tuya-token', { type: 'json' }).catch(() => null), now = opts.now || Date.now();
  if (c?.token && c.exp - now > 60e3) return c.token;
  if (!tokenEmCurso) tokenEmCurso = (async () => {
    const r = await tuyaRaw('GET', '/v1.0/token?grant_type=1', opts);
    await store.setJSON('tuya-token', { token: r.access_token, exp: now + Number(r.expire_time || 3600) * 1000 });
    return r.access_token;
  })().finally(() => { tokenEmCurso = null; });
  return tokenEmCurso;
}
async function tuya(store, method, path, opts = {}) {
  try { return await tuyaRaw(method, path, { ...opts, token: await tuyaToken(store, opts) }); }
  catch (e) {
    // Sessão expirada: pede uma nova e tenta outra vez.
    if (e.code === 1010 || e.code === 1011) { await store.delete('tuya-token').catch(() => {}); return tuyaRaw(method, path, { ...opts, token: await tuyaToken(store, opts) }); }
    throw e;
  }
}
// Avarias: o ponto «fault» é um mapa de bits; os nomes vêm das especificações do equipamento.
export function tuyaFaults(status, specs) {
  const f = (status || []).find((s) => /fault|alarm/i.test(s.code));
  if (!f || !Number(f.value)) return [];
  const spec = [...(specs?.status || []), ...(specs?.functions || [])].find((s) => s.code === f.code);
  let labels = [];
  try { labels = JSON.parse(spec?.values || '{}').label || []; } catch {}
  const v = Number(f.value), out = [];
  for (let i = 0; i < 32; i++) if (v & (1 << i)) out.push(labels[i] || 'Avaria ' + (i + 1));
  return out;
}

// ---------- Rotas (/api/remoto/...) ----------
export async function handleRemoto(req, path, store, opts = {}) {
  const u = new URL(req.url), q = (k) => u.searchParams.get(k) || '';
  try {
    if (path === 'remoto/config') return json(200, { alpha: Boolean(process.env.ALPHAESS_APP_ID && process.env.ALPHAESS_APP_SECRET), tuya: Boolean(process.env.TUYA_ACCESS_ID && process.env.TUYA_ACCESS_SECRET) });
    // AlphaESS: associar um sistema à ENAT (SN + CheckCode) e ver o estado.
    if (path === 'remoto/alpha/associar' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), sn = String(b.sn || '').trim().toUpperCase(), check = String(b.check || '').trim();
      if (!SN.test(sn) || !check) return json(400, { error: 'Indique o número de série e o CheckCode.' });
      const code = await alpha(`/getVerificationCode?sysSn=${encodeURIComponent(sn)}&checkCode=${encodeURIComponent(check)}`, opts);
      await alpha('/bindSn', { method: 'POST', body: { sysSn: sn, code: code ?? check }, ...opts });
      return json(200, { ok: true });
    }
    if (path === 'remoto/alpha/estado') {
      const sn = q('sn').toUpperCase();
      if (!SN.test(sn)) return json(400, { error: 'Número de série inválido.' });
      const [list, last] = await Promise.all([alpha('/getEssList', opts), alpha(`/getLastPowerData?sysSn=${encodeURIComponent(sn)}`, opts)]);
      const sys = (Array.isArray(list) ? list : []).find((s) => String(s.sysSn || '').toUpperCase() === sn) || null;
      return json(200, { sistema: sys, ultimo: last, at: Date.now() });
    }
    // Smart Life: equipamentos das contas ligadas, estado com avarias, e comandos.
    if (path === 'remoto/tuya/dispositivos') {
      const out = [];
      let last = '';
      for (let i = 0; i < 10; i++) {
        const r = await tuya(store, 'GET', '/v1.0/iot-01/associated-users/devices?size=100' + (last ? '&last_row_key=' + encodeURIComponent(last) : ''), opts);
        for (const d of r?.devices || []) out.push({ id: d.id, nome: d.name, produto: d.product_name || '', categoria: d.category || '', online: Boolean(d.online) });
        if (!r?.has_more || !r.last_row_key) break;
        last = r.last_row_key;
      }
      return json(200, { dispositivos: out });
    }
    if (path === 'remoto/tuya/estado') {
      const id = q('id');
      if (!TID.test(id)) return json(400, { error: 'Equipamento inválido.' });
      const [info, status, specs] = await Promise.all([tuya(store, 'GET', `/v1.0/devices/${id}`, opts), tuya(store, 'GET', `/v1.0/devices/${id}/status`, opts), tuya(store, 'GET', `/v1.0/devices/${id}/specifications`, opts).catch(() => null)]);
      return json(200, { nome: info?.name || '', produto: info?.product_name || '', online: Boolean(info?.online), status: status || [], funcoes: specs?.functions || [], avarias: tuyaFaults(status, specs), at: Date.now() });
    }
    if (path === 'remoto/tuya/comando' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (!TID.test(String(b.id || '')) || !CODE.test(String(b.code || '')) || !['boolean', 'number', 'string'].includes(typeof b.value)) return json(400, { error: 'Comando inválido.' });
      await tuya(store, 'POST', `/v1.0/devices/${b.id}/commands`, { ...opts, body: { commands: [{ code: b.code, value: b.value }] } });
      return json(200, { ok: true });
    }
    return json(404, { error: 'Pedido inválido.' });
  } catch (e) {
    console.error('remoto', path, e?.code || '', e?.message);
    return json(e.status || 502, { error: e.message || 'Não foi possível ligar ao equipamento.' });
  }
}
