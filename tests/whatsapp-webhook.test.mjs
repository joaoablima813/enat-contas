import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/whatsapp-webhook.mjs';

test('webhook: answers Meta verification only with the right token', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'segredo-teste';
  const get = (t, c = '1158201444') => handler(new Request('https://x/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=' + t + '&hub.challenge=' + c));
  const ok = await get('segredo-teste');
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '1158201444');
  assert.equal((await get('errado')).status, 403);
  const post = await handler(new Request('https://x/whatsapp/webhook', { method: 'POST', body: JSON.stringify({ entry: [] }) }));
  assert.equal(post.status, 200);
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  assert.equal((await get('segredo-teste')).status, 403);
});
