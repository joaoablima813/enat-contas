// Acesso remoto aos equipamentos instalados (separador «Equipamentos» da obra).
// - AlphaESS (inversores e baterias): Open API oficial (open.alphaess.com). Chaves: ALPHAESS_APP_ID e ALPHAESS_APP_SECRET.
//   Cada sistema é associado à conta da ENAT com o número de série (SN) e o CheckCode.
// - Smart Life / Tuya (Energie, Ekallor R290, Proteu piscina): Tuya Cloud (iot.tuya.com), com as contas Smart Life dos
//   clientes ligadas ao projeto da ENAT. Chaves: TUYA_ACCESS_ID, TUYA_ACCESS_SECRET e TUYA_ENDPOINT (por omissão Europa Central).
// - Daikin (Onecta): ONECTA Cloud API (developer.cloud.daikineurope.com), autorização de cada cliente pelo Daikin ID.
//   Chaves: DAIKIN_CLIENT_ID e DAIKIN_CLIENT_SECRET.
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

// ---------- Daikin (Onecta) ----------
// Cada cliente autoriza a ENAT uma vez, com o seu Daikin ID (OpenID Connect). As sessões ficam guardadas por equipamento
// (blob «daikin-conta-<ref>»); a sessão dura 1 ano e o refresh token muda a cada uso. Limite da Daikin: 200 pedidos/dia por cliente.
const DK_IDP = 'https://idp.onecta.daikineurope.com/v1/oidc', DK_API = 'https://api.onecta.daikineurope.com/v1';
const REF = /^[A-Za-z0-9_-]{4,60}$/, STATE = /^[a-f0-9]{32}$/, DK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DK_CHAR = new Set(['onOffMode', 'temperatureControl', 'operationMode', 'powerfulMode']);
export const DAIKIN_RETORNO = 'https://enat-contas.netlify.app/api/daikin/retorno';
const dkKeys = () => {
  const id = process.env.DAIKIN_CLIENT_ID, secret = process.env.DAIKIN_CLIENT_SECRET;
  if (!id || !secret) throw Object.assign(new Error('A ligação à Daikin ainda não está configurada.'), { status: 503 });
  return { id, secret };
};
export function daikinAuthorizeUrl(state, clientId) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: DAIKIN_RETORNO, scope: 'openid onecta:basic.integration offline_access', state });
  return DK_IDP + '/authorize?' + q.toString().replace(/\+/g, '%20');
}
async function dkToken(params, fetcher = fetch) {
  const { id, secret } = dkKeys();
  const r = await fetcher(DK_IDP + '/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, client_id: id, client_secret: secret }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error(j.error === 'invalid_grant' ? 'A autorização do cliente expirou ou foi retirada. Envie-lhe um novo link.' : 'A Daikin não aceitou a autorização.'), { status: 502, code: j.error });
  return j;
}
const dkGuardar = (store, ref, t, now) => store.setJSON('daikin-conta-' + ref, { access: t.access_token, refresh: t.refresh_token, exp: now + Number(t.expires_in || 3600) * 1000, desde: now });
async function dkAcesso(store, ref, opts = {}) {
  const now = opts.now || Date.now();
  const c = await store.get('daikin-conta-' + ref, { type: 'json' }).catch(() => null);
  if (!c?.refresh && !c?.access) throw Object.assign(new Error('O cliente ainda não autorizou. Envie-lhe o link de autorização.'), { status: 409 });
  if (c.access && c.exp - now > 60e3) return c.access;
  const t = await dkToken({ grant_type: 'refresh_token', refresh_token: c.refresh }, opts.fetcher);
  await store.setJSON('daikin-conta-' + ref, { ...c, access: t.access_token, refresh: t.refresh_token || c.refresh, exp: now + Number(t.expires_in || 3600) * 1000 });
  return t.access_token;
}
async function daikin(store, ref, method, path, opts = {}) {
  const fetcher = opts.fetcher || fetch;
  const r = await fetcher(DK_API + path, { method, headers: { authorization: 'Bearer ' + (await dkAcesso(store, ref, opts)), 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 429) throw Object.assign(new Error('A Daikin só deixa 200 leituras por dia por cliente. Tente mais tarde.'), { status: 429 });
  if (r.status === 401) throw Object.assign(new Error('A autorização do cliente expirou. Envie-lhe um novo link.'), { status: 409 });
  if (!r.ok) throw Object.assign(new Error('A Daikin não respondeu (' + r.status + ').'), { status: 502 });
  return r.status === 204 ? null : r.json().catch(() => null);
}
const v = (c) => (c && typeof c === 'object' && 'value' in c ? c.value : c);
// Resumo legível de cada unidade: ligado, modo, temperaturas, avarias e temperaturas pretendidas (com limites).
export function daikinResumo(devices) {
  return (Array.isArray(devices) ? devices : []).map((d) => {
    const mps = (d.managementPoints || []).map((m) => {
      const modo = v(m.operationMode);
      const ops = v(m.temperatureControl)?.operationModes || {};
      const sp = ops[modo] || ops.heating || Object.values(ops)[0];
      const sensores = Object.fromEntries(Object.entries(v(m.sensoryData) || {}).map(([k, x]) => [k, v(x)]).filter(([, x]) => x != null && typeof x !== 'object'));
      const pontos = Object.entries(sp?.setpoints || {}).map(([k, x]) => ({ code: k, value: x.value, min: x.minValue, max: x.maxValue, step: x.stepValue, settable: Boolean(x.settable), path: '/operationModes/' + (ops[modo] ? modo : ops.heating ? 'heating' : Object.keys(ops)[0]) + '/setpoints/' + k }));
      const erro = v(m.errorCode);
      return {
        id: m.embeddedId, tipo: m.managementPointType, nome: v(m.name) || '', modelo: v(m.modelInfo) || '',
        ligado: m.onOffMode ? v(m.onOffMode) === 'on' : null, ligarOk: Boolean(m.onOffMode?.settable), modo: modo || '', modos: m.operationMode?.values || [], modoOk: Boolean(m.operationMode?.settable),
        sensores, pontos, avaria: Boolean(v(m.isInErrorState)), aviso: Boolean(v(m.isInWarningState) || v(m.isInCautionState)), erro: erro && erro !== '' ? String(erro) : '',
      };
    }).filter((m) => m.tipo !== 'gateway' || m.erro || m.avaria);
    return { id: d._id || d.id, modelo: d.deviceModel || '', online: Boolean(v(d.isCloudConnectionUp)), unidades: mps };
  });
}
const pagina = (titulo, texto) => new Response(`<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><style>body{font-family:system-ui,sans-serif;background:#f4f7f2;color:#1d2b1f;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}main{background:#fff;border-radius:16px;padding:28px;max-width:420px;box-shadow:0 6px 24px rgba(0,0,0,.08);text-align:center}h1{font-size:1.3rem;color:#2f7d32}</style><main><h1>${titulo}</h1><p>${texto}</p><p><small>ENAT Ponte de Lima</small></p></main></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

// Rotas públicas (sem sessão da app): /api/daikin/ligar?s=… leva o cliente à Daikin; /api/daikin/retorno recebe a autorização.
export async function handleDaikinPublico(req, path, store, opts = {}) {
  const u = new URL(req.url), s = u.searchParams.get('s') || u.searchParams.get('state') || '', now = opts.now || Date.now();
  const st = STATE.test(s) ? await store.get('daikin-estado-' + s, { type: 'json' }).catch(() => null) : null;
  if (!st || st.exp < now) return pagina('Link expirado', 'Este link já não é válido. Peça à ENAT um link novo.');
  try {
    if (path === 'daikin/ligar') return Response.redirect(daikinAuthorizeUrl(s, dkKeys().id), 302);
    if (path === 'daikin/retorno') {
      const code = u.searchParams.get('code');
      if (!code) return pagina('Autorização cancelada', 'Não foi dada autorização. Se mudar de ideias, abra outra vez o link que a ENAT lhe enviou.');
      const t = await dkToken({ grant_type: 'authorization_code', code, redirect_uri: DAIKIN_RETORNO }, opts.fetcher);
      await dkGuardar(store, st.ref, t, now);
      await store.delete('daikin-estado-' + s).catch(() => {});
      return pagina('Obrigado!', 'A ENAT já pode acompanhar o seu equipamento Daikin e ajudar mais depressa se houver uma avaria. Pode fechar esta página. Pode retirar esta autorização quando quiser, na app Onecta ou pedindo à ENAT.');
    }
  } catch (e) {
    console.error('daikin', path, e?.code || '', e?.message);
    return pagina('Não foi possível ligar', 'Houve um problema com a Daikin. Tente outra vez daqui a pouco ou fale com a ENAT.');
  }
  return pagina('Link inválido', 'Este link não é válido.');
}

// ---------- Rotas (/api/remoto/...) ----------
export async function handleRemoto(req, path, store, opts = {}) {
  const u = new URL(req.url), q = (k) => u.searchParams.get(k) || '';
  try {
    if (path === 'remoto/config') return json(200, { alpha: Boolean(process.env.ALPHAESS_APP_ID && process.env.ALPHAESS_APP_SECRET), tuya: Boolean(process.env.TUYA_ACCESS_ID && process.env.TUYA_ACCESS_SECRET), daikin: Boolean(process.env.DAIKIN_CLIENT_ID && process.env.DAIKIN_CLIENT_SECRET) });
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
    // Daikin: link de autorização para o cliente, estado, comandos e retirar a ligação.
    if (path === 'remoto/daikin/link' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), ref = String(b.ref || '');
      if (!REF.test(ref)) return json(400, { error: 'Equipamento inválido.' });
      dkKeys();
      const s = randomBytes(16).toString('hex'), now = opts.now || Date.now();
      await store.setJSON('daikin-estado-' + s, { ref, exp: now + 14 * 864e5 });
      const base = String(process.env.LINK_URL || '').replace(/\/+$/, '') || u.origin;
      return json(200, { url: base + '/api/daikin/ligar?s=' + s, validade: 14 });
    }
    if (path === 'remoto/daikin/estado') {
      const ref = q('ref');
      if (!REF.test(ref)) return json(400, { error: 'Equipamento inválido.' });
      return json(200, { dispositivos: daikinResumo(await daikin(store, ref, 'GET', '/gateway-devices', opts)), at: Date.now() });
    }
    if (path === 'remoto/daikin/comando' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const ok = REF.test(String(b.ref || '')) && DK_ID.test(String(b.device || '')) && DK_ID.test(String(b.mp || '')) && DK_CHAR.has(b.characteristic) && ['boolean', 'number', 'string'].includes(typeof b.value) && (b.path == null || /^(\/[A-Za-z0-9_]{1,40}){1,6}$/.test(b.path));
      if (!ok) return json(400, { error: 'Comando inválido.' });
      await daikin(store, b.ref, 'PATCH', `/gateway-devices/${b.device}/management-points/${b.mp}/characteristics/${b.characteristic}`, { ...opts, body: b.path ? { path: b.path, value: b.value } : { value: b.value } });
      return json(200, { ok: true });
    }
    if (path === 'remoto/daikin/desligar' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), ref = String(b.ref || '');
      if (!REF.test(ref)) return json(400, { error: 'Equipamento inválido.' });
      const c = await store.get('daikin-conta-' + ref, { type: 'json' }).catch(() => null);
      if (c?.refresh) {
        const { id, secret } = dkKeys();
        for (const [token, hint] of [[c.refresh, 'refresh_token'], [c.access, 'access_token']]) if (token) await (opts.fetcher || fetch)(DK_IDP + '/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: hint, client_id: id, client_secret: secret }).toString() }).catch(() => {});
      }
      await store.delete('daikin-conta-' + ref).catch(() => {});
      return json(200, { ok: true });
    }
    return json(404, { error: 'Pedido inválido.' });
  } catch (e) {
    console.error('remoto', path, e?.code || '', e?.message);
    return json(e.status || 502, { error: e.message || 'Não foi possível ligar ao equipamento.' });
  }
}
