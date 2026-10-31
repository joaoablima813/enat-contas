// Leads da campanha da Meta: lê os emails de leads@tmam.pt na caixa pontedelima@enat.pt e guarda-os em "leads-meta".
// A app junta essas leads às suas (pasta Novas leads). Só entram emails recebidos depois da primeira verificação.
export const SENDER = process.env.META_LEADS_FROM || 'leads@tmam.pt';
export const INBOX_KEY = 'leads-meta';
const KEEP = 60 * 864e5;
const HOUSES = ['Moradia', 'Apartamento', 'Moradia antiga', 'Moradia geminada'];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[:?*\s]+/g, ' ').trim();
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// HTML do email em linhas de texto, uma por célula ou parágrafo.
export function htmlLines(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|td|th|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const LABELS = [
  ['name', /^nome( completo)?$/],
  ['email', /^e-?mail$/],
  ['contact', /^(telefone|telemovel|numero de telefone|contacto)$/],
  ['house', /^a instalacao e para$/],
  ['timing', /^quando pretende avancar/],
];
// Lê os pares título / valor do formulário (o valor é a linha a seguir ao título).
export function parseLead(lines) {
  const out = {};
  for (let i = 0; i < lines.length - 1; i++) {
    const hit = LABELS.find(([k, re]) => !(k in out) && re.test(norm(lines[i])));
    if (hit && !LABELS.some(([, re]) => re.test(norm(lines[i + 1])))) out[hit[0]] = lines[++i].slice(0, 2000);
  }
  return out;
}
const lisbonDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);
const hash = s => { let h = 5381; for (const c of s) h = (h * 33 ^ c.codePointAt(0)) >>> 0; return h.toString(36); };

export function toLead(f, { messageId, date }) {
  const house = HOUSES.find(h => norm(h) === norm(f.house));
  const notes = f.house && !house ? 'A instalação é para: ' + f.house : '';
  return {
    id: 'meta-' + hash(messageId), src: 'meta', received: date.toISOString(),
    name: f.name || '', address: '', contact: f.contact || '', email: f.email || '', coords: '', rooms: '', bill: '', area: '',
    notes, value: '', brand: '', timing: f.timing || '', stage: 'nova', solutions: [], call: '', house: house || '', date: lisbonDay(date),
  };
}

export async function checkMetaLeads(store, now = new Date()) {
  const pass = process.env.SMTP_PASSWORD;
  if (!pass) return { skipped: 'no password' };
  const box = (await store.get(INBOX_KEY, { type: 'json' })) || null;
  // Primeira verificação: marca a data de início e não importa nada do que já estava na caixa.
  if (!box) { await store.setJSON(INBOX_KEY, { desde: now.toISOString(), leads: [] }); return { started: true }; }
  const desde = new Date(box.desde), known = new Set(box.leads.map(l => l.id)), novas = [];
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const port = Number(process.env.IMAP_PORT || 993);
  const client = new ImapFlow({ host: process.env.IMAP_HOST || process.env.SMTP_HOST || 'mail.enat.pt', port, secure: port === 993, auth: { user: process.env.SMTP_USER || 'pontedelima@enat.pt', pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Math.max(desde.getTime(), now.getTime() - 7 * 864e5) - 864e5);
      const uids = (await client.search({ from: SENDER, since }, { uid: true })) || [];
      if (uids.length) for await (const m of client.fetch(uids.slice(-50), { envelope: true, internalDate: true, source: true }, { uid: true })) {
        const date = m.internalDate || m.envelope?.date || now;
        if (date <= desde) continue;
        const messageId = m.envelope?.messageId || 'uid-' + m.uid + '-' + date.getTime();
        const parsed = await simpleParser(m.source);
        const from = parsed.from?.value?.[0]?.address || '';
        if (from.toLowerCase() !== SENDER.toLowerCase()) continue;
        const f = parseLead(parsed.html ? htmlLines(parsed.html) : String(parsed.text || '').split('\n').map(l => l.trim()).filter(Boolean));
        if (!f.name && !f.email && !f.contact) continue;
        const lead = toLead(f, { messageId, date });
        if (!known.has(lead.id)) { known.add(lead.id); novas.push(lead); }
      }
    } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => client.close());
  }
  const keep = box.leads.filter(l => now - new Date(l.received) < KEEP);
  if (novas.length || keep.length !== box.leads.length) await store.setJSON(INBOX_KEY, { ...box, leads: [...keep, ...novas] });
  return { imported: novas.length };
}
