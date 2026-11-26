// Emails trocados com um cliente: lê a caixa pontedelima@enat.pt (Enviados e Recebidos) por IMAP e devolve
// as mensagens para/de esse endereço, das mais recentes para as mais antigas. Inclui os emails escritos no Outlook.
// GET /api/email/conversa?email=cliente@exemplo.pt
const SENT_RE = /^(inbox[./])?(sent|sent items|sent messages|enviados|itens enviados|mensagens enviadas)$/i;
const okEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 320;

// Texto simples do email, sem a parte citada da mensagem anterior.
export function limparTexto(t) {
  const linhas = String(t || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (const l of linhas) {
    if (/^>/.test(l.trim())) continue;
    if (/^(On|Em|No dia) .+(wrote|escreveu):\s*$/i.test(l.trim()) || /^-{2,}\s*(Original Message|Mensagem original)/i.test(l.trim()) || /^(De|From):\s/.test(l.trim()) && out.length) break;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

export async function emailsDoCliente(email, { limite = 30, imap } = {}) {
  const pass = process.env.SMTP_PASSWORD;
  if (!pass) return { configurado: false, emails: [] };
  const { ImapFlow } = imap || await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const port = Number(process.env.IMAP_PORT || 993);
  const client = new ImapFlow({ host: process.env.IMAP_HOST || process.env.SMTP_HOST || 'mail.enat.pt', port, secure: port === 993, auth: { user: process.env.SMTP_USER || 'pontedelima@enat.pt', pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 25000 });
  await client.connect();
  const emails = [], vistos = new Set();
  let pastasEnviados = [];
  try {
    const list = await client.list();
    // Todas as pastas de enviados: a do servidor e a do Outlook podem ser diferentes (ex.: «Sent» e «Itens Enviados»).
    pastasEnviados = [...new Set(list.filter((f) => f.specialUse === '\\Sent' || SENT_RE.test(f.path) || SENT_RE.test(f.name || '')).map((f) => f.path))];
    const pastas = [['INBOX', 'recebido', { from: email }], ...pastasEnviados.map((p) => [p, 'enviado', { to: email }])];
    for (const [pasta, tipo, filtro] of pastas) {
      const lock = await client.getMailboxLock(pasta);
      try {
        const uids = (await client.search(filtro, { uid: true })) || [];
        for await (const m of client.fetch(uids.slice(-limite), { envelope: true, internalDate: true, source: true }, { uid: true })) {
          const p = await simpleParser(m.source);
          const mid = p.messageId || pasta + '|' + m.uid;
          if (vistos.has(mid)) continue;
          vistos.add(mid);
          const texto = limparTexto(p.text || '');
          emails.push({
            id: tipo + '-' + pasta + '-' + m.uid, pasta, tipo, data: (m.internalDate || p.date || new Date()).toISOString(),
            assunto: String(p.subject || '(sem assunto)').slice(0, 300), texto,
            anexos: (p.attachments || []).filter((a) => !a.related).map((a) => String(a.filename || 'anexo')).slice(0, 10),
          });
        }
      } finally { lock.release(); }
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  emails.sort((a, b) => b.data.localeCompare(a.data));
  return { configurado: true, pastasEnviados, emails: emails.slice(0, limite) };
}

export async function handleLeadEmails(req) {
  const email = String(new URL(req.url).searchParams.get('email') || '').trim().toLowerCase();
  if (!okEmail(email)) return Response.json({ error: 'Email do cliente inválido.' }, { status: 400 });
  try { return Response.json(await emailsDoCliente(email), { headers: { 'cache-control': 'no-store' } }); }
  catch (e) { console.error('emails do cliente', e?.code || e?.message); return Response.json({ error: 'Não foi possível ler a caixa de email.' }, { status: 502 }); }
}
