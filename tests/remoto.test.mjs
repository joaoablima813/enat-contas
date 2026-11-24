import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleRemoto, alphaHeaders, tuyaSign, tuyaFaults } from '../netlify/lib/remoto.mjs';

const blobs = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, setJSON: async (k, v) => m.set(k, v), delete: async (k) => m.delete(k) }; };
const req = (path, body) => new Request('https://app.test/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
const env = (vars, fn) => async () => { const old = { ...process.env }; Object.assign(process.env, vars); try { await fn(); } finally { for (const k of Object.keys(vars)) if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };

test('AlphaESS: SHA-512 signature of appId + secret + timestamp in seconds', () => {
  const h = alphaHeaders('alpha1', 'sec', 1_700_000_000_123);
  assert.equal(h.timestamp, '1700000000');
  assert.equal(h.sign, createHash('sha512').update('alpha1sec1700000000').digest('hex'));
  assert.equal(h.appId, 'alpha1');
});

test('remote access without keys says it is not configured yet', env({ ALPHAESS_APP_ID: '', ALPHAESS_APP_SECRET: '', TUYA_ACCESS_ID: '', TUYA_ACCESS_SECRET: '', DAIKIN_CLIENT_ID: '', DAIKIN_CLIENT_SECRET: '' }, async () => {
  const c = await (await handleRemoto(req('remoto/config'), 'remoto/config', blobs())).json();
  assert.deepEqual(c, { alpha: false, tuya: false, daikin: false });
  const r = await handleRemoto(req('remoto/alpha/estado?sn=AL123456'), 'remoto/alpha/estado', blobs());
  assert.equal(r.status, 503);assert.match((await r.json()).error, /ainda não está configurada/);
}));

test('AlphaESS: live data of one system, and errors in Portuguese', env({ ALPHAESS_APP_ID: 'a', ALPHAESS_APP_SECRET: 's' }, async () => {
  const calls = [];
  const fetcher = async (url) => { calls.push(url); return { json: async () => url.includes('getEssList') ? { code: 200, data: [{ sysSn: 'AL123456', emsStatus: 'Normal' }] } : { code: 200, data: { ppv: 3200, pload: 900, soc: 76 } } }; };
  const j = await (await handleRemoto(req('remoto/alpha/estado?sn=al123456'), 'remoto/alpha/estado', blobs(), { fetcher })).json();
  assert.equal(j.sistema.emsStatus, 'Normal');assert.equal(j.ultimo.ppv, 3200);
  assert.ok(calls.some((u) => u.endsWith('/getLastPowerData?sysSn=AL123456')));
  const off = async () => ({ json: async () => ({ code: 6042, msg: 'system offline' }) });
  const r = await handleRemoto(req('remoto/alpha/estado?sn=AL123456'), 'remoto/alpha/estado', blobs(), { fetcher: off });
  assert.equal(r.status, 502);assert.match((await r.json()).error, /offline/);
}));

test('Smart Life (Tuya): signed requests, token kept, faults named from the device specification, commands sent', env({ TUYA_ACCESS_ID: 'tid', TUYA_ACCESS_SECRET: 'tsec', TUYA_ENDPOINT: 'https://tuya.test' }, async () => {
  const store = blobs(), seen = [];
  const fetcher = async (url, o) => {
    seen.push([o.method, url.replace('https://tuya.test', ''), o.headers]);
    const p = url.replace('https://tuya.test', '');
    const res = p.startsWith('/v1.0/token') ? { access_token: 'TK', expire_time: 7200 }
      : p.endsWith('/status') ? [{ code: 'switch', value: true }, { code: 'temp_set', value: 550 }, { code: 'fault', value: 5 }]
      : p.endsWith('/specifications') ? { functions: [{ code: 'temp_set', type: 'Integer', values: '{"min":300,"max":700,"scale":1,"unit":"℃"}' }], status: [{ code: 'fault', type: 'Bitmap', values: '{"label":["E1 sensor","E2 pressão","E3 fluxo"]}' }] }
      : p.endsWith('/commands') ? true
      : { name: 'Aquapura', product_name: 'Bomba de calor', online: true };
    return { json: async () => ({ success: true, result: res }) };
  };
  const j = await (await handleRemoto(req('remoto/tuya/estado?id=bf123456abc'), 'remoto/tuya/estado', store, { fetcher })).json();
  assert.equal(j.online, true);assert.deepEqual(j.avarias, ['E1 sensor', 'E3 fluxo']);
  const [m, path, h] = seen.find((x) => x[1].endsWith('/status'));
  assert.equal(h.access_token, 'TK');assert.equal(h.sign, tuyaSign({ id: 'tid', secret: 'tsec', token: 'TK', t: h.t, nonce: h.nonce, method: m, path }));
  assert.equal(seen.filter((x) => x[1].startsWith('/v1.0/token')).length, 1, 'one token for several requests');
  const c = await handleRemoto(req('remoto/tuya/comando', { id: 'bf123456abc', code: 'temp_set', value: 600 }), 'remoto/tuya/comando', store, { fetcher });
  assert.equal(c.status, 200);
  assert.equal((await handleRemoto(req('remoto/tuya/comando', { id: 'bf123456abc', code: 'x;y', value: 1 }), 'remoto/tuya/comando', store, { fetcher })).status, 400);
}));

test('Tuya faults: zero means no fault', () => {
  assert.deepEqual(tuyaFaults([{ code: 'fault', value: 0 }], null), []);
  assert.deepEqual(tuyaFaults([{ code: 'fault', value: 2 }], null), ['Avaria 2']);
});

test('Daikin: link for the client, one-time authorization, status summary, commands and revocation', env({ DAIKIN_CLIENT_ID: 'dkid', DAIKIN_CLIENT_SECRET: 'dksec', LINK_URL: 'https://propostas.test' }, async () => {
  const { handleDaikinPublico, daikinAuthorizeUrl } = await import('../netlify/lib/remoto.mjs');
  const store = blobs(), seen = [];
  const fetcher = async (url, o = {}) => {
    seen.push([o.method, url, o.body]);
    if (url.endsWith('/oidc/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }) };
    if (url.endsWith('/revoke')) return { ok: true, status: 200, json: async () => ({}) };
    if (o.method === 'PATCH') return { ok: true, status: 204, json: async () => null };
    return { ok: true, status: 200, json: async () => ([{ _id: 'gw1', deviceModel: 'Altherma', isCloudConnectionUp: { value: true }, managementPoints: [
      { embeddedId: '0', managementPointType: 'gateway', errorCode: { value: '' } },
      { embeddedId: '1', managementPointType: 'climateControl', name: { value: 'Sala' }, onOffMode: { value: 'on', settable: true }, operationMode: { value: 'heating', settable: true, values: ['heating', 'cooling'] }, isInErrorState: { value: true }, errorCode: { value: 'U4-01' },
        sensoryData: { value: { roomTemperature: { value: 21.5 }, outdoorTemperature: { value: 8 } } },
        temperatureControl: { value: { operationModes: { heating: { setpoints: { roomTemperature: { value: 22, minValue: 12, maxValue: 30, stepValue: 0.5, settable: true } } } } } } },
    ] }]) };
  };
  // Sem autorização ainda
  let r = await handleRemoto(req('remoto/daikin/estado?ref=eq12345'), 'remoto/daikin/estado', store, { fetcher });
  assert.equal(r.status, 409);
  // Link para o cliente
  const { url } = await (await handleRemoto(req('remoto/daikin/link', { ref: 'eq12345' }), 'remoto/daikin/link', store)).json();
  assert.match(url, /^https:\/\/propostas\.test\/api\/daikin\/ligar\?s=[a-f0-9]{32}$/);
  const s = new URL(url).searchParams.get('s');
  const go = await handleDaikinPublico(new Request(url), 'daikin/ligar', store);
  assert.equal(go.status, 302);assert.equal(go.headers.get('location'), daikinAuthorizeUrl(s, 'dkid'));
  assert.match(go.headers.get('location'), /scope=openid%20onecta%3Abasic\.integration%20offline_access/);
  // Retorno com o código
  const back = await handleDaikinPublico(new Request('https://app.test/api/daikin/retorno?code=C1&state=' + s), 'daikin/retorno', store, { fetcher });
  assert.match(await back.text(), /Obrigado/);
  assert.match(seen[0][2], /grant_type=authorization_code/);assert.match(seen[0][2], /client_secret=dksec/);
  // O mesmo link não serve duas vezes
  assert.match(await (await handleDaikinPublico(new Request('https://app.test/api/daikin/retorno?code=C2&state=' + s), 'daikin/retorno', store, { fetcher })).text(), /expirado/);
  // Estado resumido
  const j = await (await handleRemoto(req('remoto/daikin/estado?ref=eq12345'), 'remoto/daikin/estado', store, { fetcher })).json();
  const m = j.dispositivos[0].unidades;
  assert.equal(m.length, 1, 'gateway without error is hidden');
  assert.equal(m[0].erro, 'U4-01');assert.equal(m[0].ligado, true);assert.equal(m[0].sensores.roomTemperature, 21.5);
  assert.deepEqual(m[0].pontos[0], { code: 'roomTemperature', value: 22, min: 12, max: 30, step: 0.5, settable: true, path: '/operationModes/heating/setpoints/roomTemperature' });
  // Comando
  r = await handleRemoto(req('remoto/daikin/comando', { ref: 'eq12345', device: 'gw1', mp: '1', characteristic: 'temperatureControl', path: m[0].pontos[0].path, value: 23 }), 'remoto/daikin/comando', store, { fetcher });
  assert.equal(r.status, 200);
  const p = seen.find((x) => x[0] === 'PATCH');
  assert.match(p[1], /\/gateway-devices\/gw1\/management-points\/1\/characteristics\/temperatureControl$/);assert.deepEqual(JSON.parse(p[2]), { path: '/operationModes/heating/setpoints/roomTemperature', value: 23 });
  assert.equal((await handleRemoto(req('remoto/daikin/comando', { ref: 'eq12345', device: 'gw1', mp: '1', characteristic: 'firmware', value: 1 }), 'remoto/daikin/comando', store, { fetcher })).status, 400);
  // Retirar a ligação
  assert.equal((await handleRemoto(req('remoto/daikin/desligar', { ref: 'eq12345' }), 'remoto/daikin/desligar', store, { fetcher })).status, 200);
  assert.ok(seen.some((x) => x[1].endsWith('/revoke')));
  assert.equal((await handleRemoto(req('remoto/daikin/estado?ref=eq12345'), 'remoto/daikin/estado', store, { fetcher })).status, 409);
}));

test('AlphaESS binding in two steps: CheckCode asks for the email code, then the email code binds', env({ ALPHAESS_APP_ID: 'a', ALPHAESS_APP_SECRET: 's' }, async () => {
  const calls = [];
  const fetcher = async (url, o) => { calls.push([url, o.method, o.body]); return { json: async () => ({ code: 200, msg: 'Success', data: null }) }; };
  let r = await handleRemoto(req('remoto/alpha/codigo', { sn: 'al123456', check: 'Ab12Cd' }), 'remoto/alpha/codigo', blobs(), { fetcher });
  assert.equal(r.status, 200);
  assert.ok(calls[0][0].endsWith('/getVerificationCode?sysSn=AL123456&checkCode=Ab12Cd'), 'CheckCode keeps its case');
  assert.equal(calls.length, 1, 'no binding yet');
  r = await handleRemoto(req('remoto/alpha/associar', { sn: 'AL123456', code: '483920' }), 'remoto/alpha/associar', blobs(), { fetcher });
  assert.equal(r.status, 200);
  assert.ok(calls[1][0].endsWith('/bindSn'));assert.deepEqual(JSON.parse(calls[1][2]), { sysSn: 'AL123456', code: '483920' });
  assert.equal((await handleRemoto(req('remoto/alpha/associar', { sn: 'AL123456', code: '' }), 'remoto/alpha/associar', blobs(), { fetcher })).status, 400);
  const wrong = async () => ({ json: async () => ({ code: 6046, msg: 'Verification code error' }) });
  r = await handleRemoto(req('remoto/alpha/associar', { sn: 'AL123456', code: '1' }), 'remoto/alpha/associar', blobs(), { fetcher: wrong });
  assert.match((await r.json()).error, /email/);
}));
