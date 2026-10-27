// Free WhatsApp delivery: the quote PDF is stored behind an unguessable link,
// and the app opens the client's chat in the user's own WhatsApp Business with the message ready.
import { db } from '../../db/index.js';
import { quotes } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

const fail = (status: number, error: string) => Response.json({ error }, { status });
const quoteNumber = (id: number, date: string) => 'ORC ' + (String(date || '').slice(0, 4) || new Date().getFullYear()) + '/' + String(id).padStart(4, '0');

export async function handleWhatsapp(req: Request, path: string, store: any) {
  if (path !== 'whatsapp/pdf' || req.method !== 'POST') return fail(404, 'Pedido inválido.');
  let b: any;
  try { b = await req.json(); } catch { return fail(400, 'Dados inválidos.'); }
  if (!Number.isInteger(b?.id) || typeof b.pdf !== 'string' || !b.pdf.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.pdf)) return fail(400, 'Dados inválidos.');
  if (b.pdf.length > 5_400_000) return fail(413, 'O PDF é demasiado grande para enviar.');
  let row;
  try { [row] = await db.select().from(quotes).where(eq(quotes.id, b.id)); } catch { return fail(503, 'Não foi possível aceder aos orçamentos. Tente novamente.'); }
  if (!row) return fail(404, 'Orçamento não encontrado.');
  const q: any = row.document, number = quoteNumber(row.id, q.date);
  const filename = ('ORC Nº ' + number.replace(/^ORC\s*/, '') + ' ' + q.client).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
  const token = randomBytes(18).toString('base64url');
  await store.set('pdf-' + token, Buffer.from(b.pdf, 'base64'), { metadata: { filename, quote: row.id } });
  return Response.json({ url: new URL(req.url).origin + '/api/pdf/' + token, number });
}

// Public link opened by the client; only someone with the link can read the PDF.
export async function servePdf(path: string, store: any) {
  const token = path.slice(4);
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return new Response('Orçamento não encontrado.', { status: 404 });
  const r = await store.getWithMetadata('pdf-' + token, { type: 'arrayBuffer' });
  if (!r) return new Response('Orçamento não encontrado.', { status: 404 });
  const name = String(r.metadata?.filename || 'Orcamento ENAT.pdf');
  return new Response(r.data, { headers: {
    'content-type': 'application/pdf',
    'content-disposition': 'inline; filename="' + name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '') + '"; filename*=UTF-8\'\'' + encodeURIComponent(name),
    'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex',
  } });
}

// Email delivery from the company mailbox over SMTP, with each quote PDF attached.
const mail = () => ({
  host: process.env.SMTP_HOST || 'mail.enat.pt',
  port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || 'pontedelima@enat.pt',
  pass: process.env.SMTP_PASSWORD,
  from: process.env.EMAIL_FROM || 'pontedelima@enat.pt',
});
const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Turns the WhatsApp-style text (*bold*, bare links) into a simple branded email.
export const emailHtml = (text: string) => '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#122c3b;max-width:600px">'
  + htmlEsc(text).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d5d8c">Ver orçamento em PDF</a>').replace(/\n/g, '<br>')
  + '</div>';

export async function handleEmail(req: Request, path: string, store: any) {
  const c = mail();
  if (path === 'email/estado') return Response.json({ configured: Boolean(c.pass), from: c.from });
  if (path !== 'email/enviar' || req.method !== 'POST') return fail(404, 'Pedido inválido.');
  if (!c.pass) return fail(503, 'O envio automático de email ainda não está configurado.');
  let b: any;
  try { b = await req.json(); } catch { return fail(400, 'Dados inválidos.'); }
  const to = String(b?.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 320) return fail(400, 'Indique um email válido do cliente.');
  if (typeof b.subject !== 'string' || !b.subject.trim() || b.subject.length > 300 || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 20000) return fail(400, 'Dados inválidos.');
  if (!Array.isArray(b.links) || !b.links.length || b.links.length > 20) return fail(400, 'Dados inválidos.');
  const attachments = [];
  for (const link of b.links) {
    const token = String(link).split('/api/pdf/')[1] || '';
    if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return fail(400, 'Dados inválidos.');
    const r = await store.getWithMetadata('pdf-' + token, { type: 'arrayBuffer' });
    if (!r) return fail(404, 'O PDF do orçamento já não existe. Prepare o envio novamente.');
    attachments.push({ filename: String(r.metadata?.filename || 'Orcamento ENAT.pdf'), content: Buffer.from(r.data), contentType: 'application/pdf' });
  }
  const text = b.text.replace(/\*([^*\n]+)\*/g, '$1');
  try {
    const { createTransport } = await import('nodemailer');
    const t = createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
    await t.sendMail({ from: { name: 'Enat - Energias', address: c.from }, to, replyTo: c.from, bcc: process.env.EMAIL_BCC_SELF === 'false' ? undefined : c.from, subject: b.subject.trim(), text, html: emailHtml(b.text), attachments });
    return Response.json({ ok: true, to });
  } catch (e: any) {
    console.error('email', e?.code, e?.responseCode);
    if (e?.code === 'EAUTH') return fail(502, 'O servidor de email recusou a palavra-passe de ' + c.user + '. Confirme a palavra-passe no Netlify.');
    if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(e?.code)) return fail(502, 'Não foi possível ligar ao servidor de email (' + c.host + ':' + c.port + ').');
    return fail(502, 'O servidor de email recusou o envio. Tente novamente.');
  }
}
