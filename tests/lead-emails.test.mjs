import test from 'node:test';
import assert from 'node:assert/strict';
import { limparTexto, handleLeadEmails } from '../netlify/lib/lead-emails.mjs';

test('lead emails: the quoted previous message is cut and bad addresses are refused', async () => {
  assert.equal(limparTexto('Obrigada!\nVou ver.\n\nEm 24/11/2026, Enat escreveu:\n> Segue a proposta'), 'Obrigada!\nVou ver.');
  assert.equal(limparTexto('Olá\n> citado\nAdeus'), 'Olá\nAdeus');
  assert.equal((await handleLeadEmails(new Request('https://x/api/email/conversa?email=nao-e-email'))).status, 400);
  const pass = process.env.SMTP_PASSWORD; delete process.env.SMTP_PASSWORD;
  assert.deepEqual(await (await handleLeadEmails(new Request('https://x/api/email/conversa?email=ana@exemplo.pt'))).json(), { configurado: false, emails: [] });
  if (pass) process.env.SMTP_PASSWORD = pass;
});
