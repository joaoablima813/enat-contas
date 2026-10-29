// Public quote page opened from the WhatsApp or email link: the client sees the proposal, opens the PDF and answers.
// Opening the page, opening the PDF and every answer are recorded, so the app shows "Visto" and the client's decision.
import { db } from '../../db/index.js';
import { quotes, quoteEvents } from '../../db/schema.js';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import '../../public/quote-math.js';
import '../../public/gestao.js';
import '../../public/quote-obra.js';

const G: any = globalThis;
export const ANSWERS: Record<string, string> = { adjudicar: 'Adjudicado', revisao: 'Pedido de revisão', pensar: 'Vai pensar', mais_tarde: 'Fica para mais tarde', rejeitar: 'Rejeitado' };
// Link previews (WhatsApp, Gmail, Outlook…) open the link by themselves; they must not count as "Visto".
export const isBot = (ua: string) => !ua || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|googleimageproxy|google-safety|proofpoint|mimecast|barracuda|curl|wget|python|headless|lighthouse/i.test(ua);
const COMPANY = { name: 'Enat - Ponte de Lima', email: 'pontedelima@enat.pt' };
const quoteNumber = (id: number, date: string) => 'ORC ' + (String(date || '').slice(0, 4) || new Date().getFullYear()) + '/' + String(id).padStart(4, '0');
const subject = (q: any) => [(q.topics || []).join(' + '), String(q.brand || '').trim()].filter(Boolean).join(' ');
const validity = (q: any) => Number(q.validity) || 15;
const expires = (q: any) => new Date(Date.parse(q.date + 'T00:00:00Z') + validity(q) * 864e5).toISOString().slice(0, 10);
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (n: number) => Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ') + ' €';
const day = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const when = (t: Date | string) => new Date(t).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
const fail = (status: number, error: string) => Response.json({ error }, { status });

async function lookup(token: string, store: any) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  const meta = (await store.getMetadata('pdf-' + token))?.metadata;
  const id = Number(meta?.quote);
  if (!Number.isInteger(id)) return null;
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  return row ? { row, group: typeof meta.group === 'string' ? meta.group : '' } : null;
}
const lastAnswer = async (quoteId: number) => (await db.select().from(quoteEvents).where(and(eq(quoteEvents.quoteId, quoteId), inArray(quoteEvents.kind, Object.keys(ANSWERS)))).orderBy(desc(quoteEvents.id)).limit(1))[0];

// The job is added to the app's synced state; the app merges it on its next sync, like an edit from another device.
export async function openObra(store: any, row: any) {
  const doc: any = row.document, cur: any = await store.get('estado', { type: 'json' });
  if (!cur) return '';
  cur.obras = cur.obras || [];
  if (doc.obra && cur.obras.some((o: any) => o.id === doc.obra)) return doc.obra;
  const now = Date.now(), id = now.toString(36) + randomBytes(2).toString('hex');
  cur.obras.push({ ...G.EnatQuoteObra.obraFromQuote(doc, row.id, id, new Date(now).toISOString().slice(0, 10)), u: now });
  cur.ts = now;
  await store.setJSON('estado', cur);
  return id;
}

async function record(req: Request, found: any, store: any) {
  let b: any;
  try { b = JSON.parse(await req.text()); } catch { return fail(400, 'Dados inválidos.'); }
  const kind = String(b?.kind || ''), note = typeof b?.note === 'string' ? b.note.trim().slice(0, 2000) : '';
  const { row } = found, ua = req.headers.get('user-agent') || '';
  if (kind === 'visto' || kind === 'pdf') {
    if (isBot(ua)) return Response.json({ ok: true });
    // Reloading the page within 10 minutes counts as the same visit.
    const [last] = await db.select().from(quoteEvents).where(and(eq(quoteEvents.quoteId, row.id), eq(quoteEvents.kind, kind))).orderBy(desc(quoteEvents.id)).limit(1);
    if (!last || Date.now() - new Date(last.createdAt).getTime() > 10 * 60e3) await db.insert(quoteEvents).values({ quoteId: row.id, kind });
    return Response.json({ ok: true });
  }
  if (!ANSWERS[kind]) return fail(400, 'Escolha uma resposta.');
  if (kind === 'revisao' && !note) return fail(400, 'Diga-nos o que gostaria de alterar.');
  const doc: any = { ...row.document, status: kind === 'adjudicar' ? 'aceite' : kind === 'rejeitar' ? 'recusado' : 'enviado', clientAt: new Date().toISOString() };
  if (kind === 'adjudicar') {
    const obra = await openObra(store, row).catch((e: any) => { console.error('proposta obra', e?.message); return ''; });
    if (obra) doc.obra = obra;
  }
  await db.update(quotes).set({ document: doc, updatedAt: new Date() }).where(eq(quotes.id, row.id));
  const [ev] = await db.insert(quoteEvents).values({ quoteId: row.id, kind, note }).returning();
  // Choosing one of several quotes sent together takes the place of an earlier choice.
  if (kind === 'adjudicar' && found.group) {
    const siblings: any[] = (await store.get('grupo-' + found.group, { type: 'json' })) || [];
    for (const s of siblings.filter(s => s.quote !== row.id)) {
      const prev = await lastAnswer(s.quote);
      if (prev?.kind !== 'adjudicar') continue;
      const [other] = await db.select().from(quotes).where(eq(quotes.id, s.quote));
      if (!other) continue;
      await db.update(quotes).set({ document: { ...(other.document as any), status: 'enviado', clientAt: doc.clientAt }, updatedAt: new Date() }).where(eq(quotes.id, s.quote));
      await db.insert(quoteEvents).values({ quoteId: s.quote, kind: 'trocou', note: 'Escolheu o ' + quoteNumber(row.id, doc.date) + ' em vez deste orçamento.' });
    }
  }
  return Response.json({ ok: true, kind, label: ANSWERS[kind], at: ev?.createdAt, obra: Boolean(doc.obra) });
}

export async function handleProposta(req: Request, token: string, store: any) {
  let found;
  try { found = await lookup(token, store); } catch (e: any) { console.error('proposta', e?.message); return new Response(page('Serviço indisponível', '<section class="card"><h1>Não foi possível abrir a proposta</h1><p>Tente novamente dentro de instantes.</p></section>'), { status: 503, headers: HTML }); }
  if (req.method === 'POST') return found ? record(req, found, store).catch((e: any) => { console.error('proposta resposta', e?.message); return fail(503, 'Não foi possível registar a resposta. Tente novamente.'); }) : fail(404, 'Proposta não encontrada.');
  if (req.method !== 'GET') return fail(405, 'Método não permitido.');
  if (!found) return new Response(page('Proposta não encontrada', `<section class="card"><h1>Proposta não encontrada</h1><p>Este link já não está disponível. Contacte-nos para receber uma nova proposta.</p><p><a class="btn ghost" href="mailto:${COMPANY.email}">${COMPANY.email}</a></p></section>`), { status: 404, headers: HTML });
  const { row, group } = found, q: any = row.document;
  const [answer, siblings] = await Promise.all([lastAnswer(row.id), group ? store.get('grupo-' + group, { type: 'json' }) : null]);
  let others: any[] = [];
  const ids = ((siblings as any[]) || []).filter(s => s.quote !== row.id).map(s => s.quote);
  if (ids.length) {
    const rows = await db.select().from(quotes).where(inArray(quotes.id, ids));
    others = ((siblings as any[]) || []).map(s => ({ ...s, row: rows.find((r: any) => r.id === s.quote) })).filter(s => s.row);
  }
  return new Response(page('Proposta ' + quoteNumber(row.id, q.date) + ' · ' + COMPANY.name, body(token, row, answer, others)), { headers: HTML });
}

const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
const ICONS: Record<string, string> = {
  adjudicar: '<path d="M20 6 9 17l-5-5"/>',
  revisao: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  pensar: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mais_tarde: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  rejeitar: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const OPTIONS: [string, string, string][] = [
  ['adjudicar', 'Adjudicar', 'Aceito a proposta e quero avançar'],
  ['revisao', 'Pedir revisão', 'Gostava de alterar alguma coisa'],
  ['pensar', 'Vou pensar', 'Preciso de algum tempo para decidir'],
  ['mais_tarde', 'Fica para mais tarde', 'Agora não, talvez no futuro'],
  ['rejeitar', 'Rejeitar', 'Não vou avançar com esta proposta'],
];
const icon = (k: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

function body(token: string, row: any, answer: any, others: any[]) {
  const q = row.document, number = quoteNumber(row.id, q.date), total = G.quoteTotals(q).total, until = expires(q);
  const expired = new Date().toISOString().slice(0, 10) > until;
  const current = answer ? `<div class="answer a-${answer.kind}" id="current"><span class="dot"></span><div><b>A sua resposta: ${esc(ANSWERS[answer.kind])}</b><small>${esc(when(answer.createdAt))}${answer.note ? ' · «' + esc(answer.note) + '»' : ''}</small><small>Pode mudar a sua resposta a qualquer momento.</small></div></div>` : '<div id="current"></div>';
  const list = others.length ? `<section class="card"><h2>Outras propostas enviadas</h2><p class="muted">Recebeu ${others.length + 1} propostas. Pode abrir cada uma e escolher a que prefere.</p>${others.map(s => `<a class="other" href="/proposta/${esc(s.token)}"><span><b>${esc(quoteNumber(s.row.id, s.row.document.date))}</b><small>${esc(subject(s.row.document))}</small></span><em>${esc(eur(G.quoteTotals(s.row.document).total))}</em></a>`).join('')}</section>` : '';
  const terms = ['Proposta válida até ' + day(until), 'Pagamento: 50% na adjudicação e 50% na conclusão da obra', 'Transferência bancária · IBAN ' + G.ENAT_IBAN, 'Garantia dos equipamentos: 3 anos · Garantia de instalação: 2 anos'];
  return `<header class="top"><span class="logo"><img src="/enat-logo.png" alt="${COMPANY.name}" width="131" height="47"></span><span class="tag">Proposta comercial</span></header>
<div id="owner" class="owner" hidden>Está a ver esta página num dispositivo da Enat: as aberturas não contam como «Visto» e as respostas estão desativadas. <button type="button" id="as-client">Testar como cliente</button></div>
<section class="hero">
 <p class="kicker">${esc(number)}</p>
 <h1>Olá, ${esc(String(q.client).trim())}</h1>
 <p class="lead">Obrigado pelo seu contacto. Preparámos esta proposta para <b>${esc(subject(q))}</b>${q.address ? ' em ' + esc(q.address) : ''}.</p>
 <div class="total"><small>Valor total</small><b>${esc(eur(total))}</b><small>IVA incluído</small></div>
 <dl><div><dt>Data</dt><dd>${esc(day(q.date))}</dd></div><div><dt>Válida até</dt><dd>${esc(day(until))}</dd></div></dl>
 <a class="btn light" id="pdf" href="/proposta/${esc(token)}/pdf" target="_blank" rel="noopener">${'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>'}Ver orçamento completo (PDF)</a>
</section>
${expired ? `<p class="notice">Esta proposta passou a validade a ${esc(day(until))}. Pode responder na mesma e confirmamos consigo os valores.</p>` : ''}
${list}
<section class="card" id="decide">
 <h2>A sua decisão</h2>
 <p class="muted">Escolha uma opção. A sua resposta chega diretamente à nossa equipa.</p>
 ${current}
 <div class="options" role="radiogroup" aria-label="Resposta à proposta">${OPTIONS.map(([k, t, d]) => `<button type="button" class="opt o-${k}" role="radio" aria-checked="false" data-kind="${k}">${icon(k)}<span><b>${t}</b><small>${d}</small></span></button>`).join('')}</div>
 <form id="form">
  <div id="fields" hidden>
  <div id="terms" hidden><h3>Condições da proposta</h3><ul>${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul><p class="muted">Valor a pagar na adjudicação (50%): <b>${esc(eur(Math.round(total * 50) / 100))}</b></p><label class="check"><input type="checkbox" id="accept"> Li e aceito a proposta ${esc(number)} e as condições acima.</label></div>
  <label class="field"><span id="note-label">Comentário (opcional)</span><textarea id="note" rows="3" maxlength="2000"></textarea></label>
  </div>
  <p class="error" id="error" role="alert"></p>
  <button class="btn" id="send" type="submit" disabled>Escolha uma opção acima</button>
 </form>
 <div id="thanks" class="thanks" hidden></div>
</section>
<footer><span class="logo sm"><img src="/enat-logo.png" alt="" width="84" height="30"></span><p><b>${COMPANY.name}</b><br>Dúvidas? Responda à mensagem que recebeu ou escreva para <a href="mailto:${COMPANY.email}">${COMPANY.email}</a>.</p></footer>
<script>
(function(){
 var url=location.pathname.replace(/\\/$/,''),owner=false,kind='';
 try{owner=!!localStorage.getItem('enat-contas-2')&&!sessionStorage.getItem('enat-as-client')}catch(e){}
 var $=function(id){return document.getElementById(id)};
 var send=function(b){if(owner)return;try{navigator.sendBeacon?navigator.sendBeacon(url,JSON.stringify(b)):fetch(url,{method:'POST',body:JSON.stringify(b),keepalive:true})}catch(e){}};
 if(owner){$('owner').hidden=false;$('send').textContent='Respostas desativadas neste dispositivo';document.querySelectorAll('.opt').forEach(function(b){b.disabled=true})}
 $('as-client').onclick=function(){try{sessionStorage.setItem('enat-as-client','1')}catch(e){}location.reload()};
 send({kind:'visto'});
 $('pdf').addEventListener('click',function(){send({kind:'pdf'})});
 var LABELS={adjudicar:['Comentário (opcional)','Confirmar adjudicação','Ex.: melhor dia para começar'],revisao:['O que gostaria de alterar?','Pedir revisão','Ex.: trocar para 2 splits, outra marca…'],pensar:['Comentário (opcional)','Enviar resposta','Ex.: decido até ao fim do mês'],mais_tarde:['Quando pensa avançar? (opcional)','Enviar resposta','Ex.: na primavera'],rejeitar:['Motivo (opcional)','Rejeitar proposta','Ex.: encontrei outra solução']};
 document.querySelectorAll('.opt').forEach(function(b){b.onclick=function(){
  kind=b.dataset.kind;document.querySelectorAll('.opt').forEach(function(x){x.setAttribute('aria-checked',String(x===b))});
  var l=LABELS[kind];$('fields').hidden=false;$('send').disabled=false;$('thanks').hidden=true;$('terms').hidden=kind!=='adjudicar';$('note-label').textContent=l[0];$('send').textContent=l[1];$('note').placeholder=l[2];$('note').required=kind==='revisao';$('error').textContent='';
  $('send').className='btn'+(kind==='rejeitar'?' danger':'');$('send').scrollIntoView({behavior:'smooth',block:'nearest'});
 }});
 $('form').onsubmit=function(e){
  e.preventDefault();if(!kind||owner)return;
  if(kind==='adjudicar'&&!$('accept').checked){$('error').textContent='Confirme que aceita as condições para adjudicar.';return}
  var note=$('note').value.trim();if(kind==='revisao'&&!note){$('error').textContent='Diga-nos o que gostaria de alterar.';return}
  $('send').disabled=true;$('send').textContent='A enviar…';
  fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:kind,note:note})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j.error||'');return j})}).then(function(j){
   var T={adjudicar:'<b>Obrigado pela confiança!</b> A proposta foi adjudicada. Vamos entrar em contacto para combinar a data da instalação.<br>Para confirmar, transfira o valor de adjudicação (50%) para o IBAN ${esc(G.ENAT_IBAN)}.',revisao:'<b>Pedido recebido.</b> Vamos rever a proposta e enviamos-lhe uma nova versão.',pensar:'<b>Sem problema.</b> Fica registado que vai pensar. Estamos disponíveis para qualquer dúvida.',mais_tarde:'<b>Fica registado.</b> Quando for altura, fale connosco e atualizamos a proposta.',rejeitar:'<b>Obrigado pela resposta.</b> Se mudar de ideias, pode voltar a esta página.'};
   $('fields').hidden=true;$('thanks').hidden=false;$('thanks').innerHTML=T[kind]+'<small>Pode mudar a sua resposta a qualquer momento nesta página.</small>';
   var c=$('current');c.className='answer a-'+kind;c.innerHTML='<span class="dot"></span><div><b>A sua resposta: '+j.label+'</b><small>Agora mesmo'+(note?' · «'+note.replace(/[&<>"]/g,function(s){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]})+'»':'')+'</small></div></div>';
   document.querySelectorAll('.opt').forEach(function(x){x.setAttribute('aria-checked','false')});kind='';$('send').className='btn';$('note').value='';$('accept').checked=false;
  }).catch(function(err){$('error').textContent=err.message||'Não foi possível enviar. Verifique a ligação e tente novamente.'}).finally(function(){$('send').disabled=!kind;$('send').textContent=kind?LABELS[kind][1]:'Escolha uma opção acima'});
 };
})();
</script>`;
}

function page(title: string, content: string) {
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)"><meta name="color-scheme" content="light dark"><title>${esc(title)}</title><link rel="icon" href="/favicon-32x32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
#nl-badge-frame,[id^="nl-badge"]{display:none!important}
:root{--bg:#f2f2f7;--card:#fff;--ink:#0b0d12;--mute:#7a7f8c;--line:#e6e7ec;--chip:#ececf1;--blue:#0666eb;--green:#13a05a;--red:#e5484d;--sun:#e8a317;--hero1:#0a0f1f;--hero2:#16307a;--tint:#f5f8ff;--warn:#fff6e0;--warnb:#f3d48a;--warnt:#6b4c00;--okbg:#eefaf3;--okb:#bfe6cf;--shadow:0 1px 2px rgba(10,15,31,.05),0 8px 24px rgba(10,15,31,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#16171b;--ink:#f5f6f8;--mute:#8d93a1;--line:#26282e;--chip:#26282e;--blue:#3d8bff;--green:#35c97f;--red:#ff6b70;--hero1:#10162b;--hero2:#1e3f9e;--tint:#1b2233;--warn:#2a2210;--warnb:#4d3c12;--warnt:#f3d48a;--okbg:#10231a;--okb:#1d4a33;--shadow:none;color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0 auto;background:var(--bg);color:var(--ink);font:400 16px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;padding:0 16px calc(40px + env(safe-area-inset-bottom,0px));max-width:600px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(16px + env(safe-area-inset-top,0px)) 2px 16px}
.logo{display:inline-flex;align-items:center;background:#fff;border-radius:16px;padding:7px 12px;box-shadow:0 0 0 .5px rgba(10,15,31,.06),0 4px 14px rgba(10,15,31,.08)}.logo img{display:block;height:34px;width:auto;border-radius:8px}
.logo.sm{border-radius:11px;padding:5px 8px;box-shadow:0 0 0 .5px rgba(10,15,31,.06)}.logo.sm img{height:22px;border-radius:5px}
.tag{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--mute);background:var(--chip);padding:6px 11px;border-radius:20px;white-space:nowrap}
.owner{background:var(--warn);border:1px solid var(--warnb);color:var(--warnt);border-radius:14px;padding:10px 12px;font-size:14px;margin-bottom:12px}.owner button{background:none;border:0;color:var(--blue);font:inherit;font-weight:600;padding:0;cursor:pointer;text-decoration:underline}
.hero{background:linear-gradient(150deg,var(--hero1) 0%,var(--hero2) 100%);color:#fff;border-radius:26px;padding:24px 22px 22px;position:relative;overflow:hidden;box-shadow:0 14px 34px rgba(10,15,31,.22);isolation:isolate}
.hero::before{content:"";position:absolute;z-index:-1;left:-40%;bottom:-70%;width:120%;height:120%;border-radius:50%;background:radial-gradient(circle,rgba(61,139,255,.35),rgba(61,139,255,0) 65%)}
.hero::after{content:"";position:absolute;z-index:-1;right:-70px;top:-70px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(232,163,23,.45),rgba(232,163,23,0) 68%)}
.kicker{display:inline-block;margin:0;font-size:12px;font-weight:600;letter-spacing:.04em;color:#fff;background:rgba(255,255,255,.12);padding:4px 10px;border-radius:20px;font-variant-numeric:tabular-nums}
.hero h1{margin:12px 0 6px;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em}.lead{margin:0 0 20px;color:rgba(255,255,255,.72);font-size:15px}.lead b{color:#fff;font-weight:600}
.total{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:16px 18px;display:flex;flex-direction:column;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
.total small{color:rgba(255,255,255,.62);font-size:13px}.total b{font-size:38px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
dl{display:flex;gap:28px;margin:16px 4px 20px}dl div{display:flex;flex-direction:column}dt{font-size:12.5px;color:rgba(255,255,255,.6)}dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:16px;padding:15px 16px;font:inherit;font-size:17px;font-weight:600;text-decoration:none;cursor:pointer;background:var(--blue);color:#fff;transition:transform .12s,opacity .15s;-webkit-tap-highlight-color:transparent}.btn:active{transform:scale(.98)}
.btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.btn.light{background:#fff;color:#0b0d12}.btn.ghost{background:var(--chip);color:var(--ink)}.btn.danger{background:var(--red)}.btn:disabled{opacity:.6;cursor:default}
.notice{background:var(--warn);border:1px solid var(--warnb);color:var(--warnt);border-radius:14px;padding:10px 12px;font-size:14px;margin:12px 0 0}
.card{background:var(--card);border-radius:22px;padding:20px;margin-top:14px;box-shadow:var(--shadow)}
.card h1{margin:0 0 6px;font-size:22px;letter-spacing:-.01em}.card h2{margin:0 0 4px;font-size:20px;font-weight:700;letter-spacing:-.01em}.card h3{margin:0 0 8px;font-size:16px}.muted{color:var(--mute);margin:0 0 16px;font-size:14.5px}
.options{display:grid;gap:8px}
.opt{display:flex;align-items:center;gap:14px;text-align:left;width:100%;background:var(--card);border:1.5px solid var(--line);border-radius:18px;padding:12px 14px;font:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s,transform .12s;-webkit-tap-highlight-color:transparent}.opt:active{transform:scale(.99)}
.opt svg{flex:none;width:42px;height:42px;padding:10px;border-radius:50%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;background:var(--chip);color:var(--blue)}
.opt b{display:block;font-size:16px;font-weight:600}.opt small{display:block;color:var(--mute);font-size:13.5px}
.opt:hover{border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}.opt[aria-checked=true]{border-color:var(--blue);background:var(--tint);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}
.o-adjudicar svg{background:var(--green);color:#fff}.o-adjudicar[aria-checked=true]{border-color:var(--green);background:var(--okbg);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 14%,transparent)}
.o-rejeitar svg{color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent)}.opt:disabled{opacity:.55;cursor:default}
form{margin-top:16px}#fields{border-top:1px solid var(--line);padding-top:16px}form ul{margin:0 0 10px;padding-left:20px;font-size:14.5px}form li{margin:3px 0}
.check{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;font-weight:600;margin:4px 0 14px}.check input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--green)}
.field span{display:block;font-size:14px;font-weight:600;margin-bottom:6px}textarea{width:100%;border:1.5px solid var(--line);border-radius:14px;padding:11px 13px;font:inherit;resize:vertical;background:var(--card);color:var(--ink)}textarea:focus{outline:none;border-color:var(--blue)}
.error{color:var(--red);font-size:14px;min-height:1px;margin:8px 0}
.answer{display:flex;gap:12px;align-items:flex-start;background:var(--tint);border-radius:16px;padding:12px 14px;margin:0 0 14px}.answer:empty{display:none}.answer small{display:block;color:var(--mute);font-size:13.5px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:7px;background:var(--blue)}.a-adjudicar .dot{background:var(--green)}.a-rejeitar .dot{background:var(--red)}.a-revisao .dot,.a-pensar .dot,.a-mais_tarde .dot{background:var(--sun)}
.thanks{margin-top:16px;background:var(--okbg);border:1px solid var(--okb);border-radius:16px;padding:14px;font-size:15px}.thanks small{display:block;color:var(--mute);margin-top:6px}
.other{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:12px 14px;margin-top:8px;text-decoration:none;color:var(--ink)}.other small{display:block;color:var(--mute);font-size:13.5px}.other em{font-style:normal;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
footer{display:flex;gap:12px;align-items:center;margin:28px 4px 0;color:var(--mute);font-size:13px}footer p{margin:0}footer b{color:var(--ink);font-weight:600}footer a{color:var(--blue)}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
@media (min-width:560px){.hero{padding:30px 30px 26px}.hero h1{font-size:32px}.card{padding:24px}}
</style></head><body>${content}</body></html>`;
}
