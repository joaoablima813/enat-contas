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

test('remote access without keys says it is not configured yet', env({ ALPHAESS_APP_ID: '', ALPHAESS_APP_SECRET: '', TUYA_ACCESS_ID: '', TUYA_ACCESS_SECRET: '' }, async () => {
  const c = await (await handleRemoto(req('remoto/config'), 'remoto/config', blobs())).json();
  assert.deepEqual(c, { alpha: false, tuya: false });
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
