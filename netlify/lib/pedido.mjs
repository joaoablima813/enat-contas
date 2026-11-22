// «Pedir detalhes ao cliente»: link enviado à lead com um questionário curto (tecnologia, gama, áreas, morada e fotos).
// - A app cria o link (POST /api/pedido) e envia-o por WhatsApp ou email;
// - o cliente abre /pedido/<token>, responde e pode juntar fotos;
// - a app lê as respostas (GET /api/pedidos), preenche a lead e recebe um aviso no telemóvel.
import { randomBytes } from 'node:crypto';
import '../../public/pedido-perguntas.js';

const P = globalThis.EnatPedido;
const json = (status, body) => Response.json(body, { status });
const TOKEN = /^[A-Za-z0-9_-]{24}$/, PHOTO = /^[a-z0-9]{8,40}$/, LEAD = /^[A-Za-z0-9_-]{1,60}$/;
const DAY = 864e5, MAX_PHOTOS = 6, INDEX = 'pedidos';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const get = (store, token) => TOKEN.test(token) ? store.get('pedido-' + token, { type: 'json' }).catch(() => null) : null;

// ---- App (com sessão) ----
export async function handlePedidoApi(req, path, store) {
  if (path === 'pedido' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const lead = String(b?.lead || '');
    if (!LEAD.test(lead)) return json(400, { error: 'Guarde a lead antes de pedir detalhes.' });
    // Um link por lead: voltar a pedir reutiliza o mesmo e mantém as respostas já dadas.
    let token = (await store.get('pedido-lead-' + lead, { type: 'json' }).catch(() => null))?.token;
    const old = token ? await get(store, token) : null;
    if (!old) token = randomBytes(18).toString('base64url');
    const sol = (Array.isArray(b.sol) ? b.sol : []).filter((s) => P.TECHS.includes(s));
    await store.setJSON('pedido-' + token, { ...(old || { created: Date.now(), fotos: [] }), lead, nome: String(b.nome || '').trim().slice(0, 120), sol: old?.resp || !sol.length ? old?.sol || sol : sol });
    await store.setJSON('pedido-lead-' + lead, { token });
    return json(200, { token, url: new URL(req.url).origin + '/pedido/' + token });
  }
  if (path === 'pedidos' && req.method === 'GET') {
    const list = (await store.get(INDEX, { type: 'json' }).catch(() => null)) || [];
    const out = [];
    for (const x of list.slice(-60)) { const p = await get(store, x.token); if (p?.resp) out.push({ token: x.token, lead: p.lead, at: p.resp.at, resp: p.resp }); }
    return json(200, { pedidos: out });
  }
  const m = path.match(/^pedido\/foto\/([a-z0-9]{8,40})$/);
  if (m && req.method === 'GET') {
    const r = await store.getWithMetadata('pedfoto-' + m[1], { type: 'arrayBuffer' });
    if (!r) return json(404, { error: 'Foto não encontrada.' });
    return new Response(r.data, { headers: { 'content-type': r.metadata?.mime || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  return json(404, { error: 'Pedido inválido.' });
}

// ---- Página pública ----
export async function handlePedidoPublic(req, token, sub, store) {
  const p = await get(store, token);
  const gone = !p || Date.now() - (p.created || 0) > 90 * DAY;
  if (sub === 'foto' && req.method === 'POST') {
    if (gone) return json(404, { error: 'Link expirado.' });
    if ((p.fotos || []).length >= MAX_PHOTOS * 2) return json(400, { error: 'Já recebemos fotos suficientes.' });
    const type = req.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(400, { error: 'Envie uma foto.' });
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 3e6) return json(400, { error: 'Foto demasiado grande.' });
    const id = randomBytes(9).toString('hex');
    await store.set('pedfoto-' + id, buf, { metadata: { mime: type, token } });
    await store.setJSON('pedido-' + token, { ...p, fotos: [...(p.fotos || []), id] });
    return json(200, { id });
  }
  if (req.method === 'POST') {
    if (gone) return json(404, { error: 'Este link já não está disponível. Contacte-nos.' });
    let b; try { b = JSON.parse((await req.text()).slice(0, 20000)); } catch { return json(400, { error: 'Dados inválidos.' }); }
    const r = P.clean(b);
    if (!r.sol.length) return json(400, { error: 'Escolha pelo menos uma solução.' });
    if (!r.morada || !r.cp) return json(400, { error: 'Indique a morada e o código postal.' });
    const fotos = (Array.isArray(b.fotos) ? b.fotos : []).filter((f) => (p.fotos || []).includes(f)).slice(0, MAX_PHOTOS);
    const resp = { ...r, fotos, at: Date.now() };
    await store.setJSON('pedido-' + token, { ...p, resp });
    const list = ((await store.get(INDEX, { type: 'json' }).catch(() => null)) || []).filter((x) => x.token !== token);
    await store.setJSON(INDEX, [...list, { token, at: resp.at }].slice(-200));
    try {
      const { sendPush } = await import('./push.mjs');
      await sendPush(store, { title: 'Detalhes recebidos: ' + (p.nome || 'lead'), body: [r.sol.join(', '), r.local, fotos.length ? fotos.length + ' foto' + (fotos.length > 1 ? 's' : '') : ''].filter(Boolean).join(' · '), tag: 'pedido-' + p.lead, data: { lead: p.lead } });
    } catch (e) { console.error('pedido push', e?.message); }
    return json(200, { ok: true });
  }
  if (req.method !== 'GET') return json(405, { error: 'Método não permitido.' });
  if (gone) return new Response(page('Link indisponível', '<section class="card"><h1>Este link já não está disponível</h1><p>Contacte-nos para receber um novo pedido: <a href="mailto:pontedelima@enat.pt">pontedelima@enat.pt</a></p></section>'), { status: 404, headers: HTML });
  const empresa = (await store.get('empresa', { type: 'json' }).catch(() => null)) || {};
  return new Response(page('Pedido de orçamento · Enat', form(token, p, empresa)), { headers: HTML });
}

const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
const chips = (id, opts, cur, multi) => `<div class="chips" data-q="${id}"${multi ? ' data-multi' : ''}>${opts.map((o) => `<button type="button" class="chip${(multi ? cur.includes(o) : cur === o) ? ' on' : ''}" data-v="${esc(o)}" aria-pressed="${multi ? cur.includes(o) : cur === o}">${esc(o)}</button>`).join('')}</div>`;
const question = (q, a) => `<div class="q"><label>${esc(q.q)}</label>${q.t ? `<input data-t="${q.id}" value="${esc(a[q.id] || '')}" placeholder="${esc(q.t)}" maxlength="200">` : chips(q.id, q.o, a[q.id] || '')}</div>`;

function form(token, p, e) {
  const r = p.resp || { sol: p.sol || [], a: {}, gama: '', morada: '', cp: '', local: '', notas: '' };
  const first = String(p.nome || '').trim().split(/\s+/)[0];
  const person = e.contacto?.nome || 'João Lima';
  return `<header class="top"><img src="/enat-logo.png" alt="Enat - Ponte de Lima" width="120" height="43"></header>
<section class="card hero"><h1>Olá${first ? ' ' + esc(first) : ''}, obrigado pelo seu contacto</h1><p>Para preparar um orçamento à sua medida, sem visitas desnecessárias, responda a estas perguntas. Leva cerca de 2 minutos.</p>${p.resp ? '<p class="done">Já recebemos as suas respostas. Pode alterá-las e enviar de novo.</p>' : ''}</section>
<form id="f" novalidate>
<section class="card"><h2>Para que quer orçamento?</h2><p class="muted">Pode escolher mais do que uma opção.</p>${chips('sol', P.TECHS, r.sol, true)}</section>
${P.TECHS.map((t) => `<section class="card tech" data-tech="${esc(t)}"${r.sol.includes(t) ? '' : ' hidden'}><h2>${esc(t)}</h2>${P.TECH[t].map((q) => question(q, r.a)).join('')}</section>`).join('')}
<section class="card"><h2>Que gama prefere?</h2><div class="gama" data-q="gama">${P.GAMA.map(([k, t, d]) => `<button type="button" class="opt${r.gama === k ? ' on' : ''}" data-v="${k}" aria-pressed="${r.gama === k}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}</div></section>
<section class="card"><h2>Sobre a casa e o contacto</h2>${P.COMMON.map((q) => question(q, r.a)).join('')}</section>
<section class="card"><h2>Morada da instalação</h2><div class="q"><label for="morada">Rua e número</label><input id="morada" value="${esc(r.morada)}" autocomplete="street-address" maxlength="300" required></div>
<div class="row"><div class="q"><label for="cp">Código postal</label><input id="cp" value="${esc(r.cp)}" inputmode="numeric" autocomplete="postal-code" placeholder="4990-000" maxlength="8" required></div><div class="q"><label for="local">Localidade</label><input id="local" value="${esc(r.local)}" autocomplete="address-level2" maxlength="80"></div></div></section>
<section class="card"><h2>Fotos (opcional)</h2><p class="muted">Ajudam-nos a orçamentar sem visita: o local onde fica o equipamento, o quadro elétrico, o telhado ou as divisões. Até ${MAX_PHOTOS} fotos.</p><div class="thumbs" id="thumbs"></div><label class="btn ghost" id="addph">Adicionar fotos<input type="file" id="ph" accept="image/*" multiple hidden></label></section>
<section class="card"><h2>Mais alguma coisa? (opcional)</h2><textarea id="notas" rows="3" maxlength="1500" placeholder="Ex.: a sala tem pé-direito alto; prefiro equipamentos silenciosos">${esc(r.notas)}</textarea></section>
<p class="err" id="err" role="alert"></p>
<button type="submit" class="btn" id="send">Enviar respostas</button>
</form>
<section class="card thanks" id="thanks" hidden><h1>Obrigado!</h1><p>Recebemos as suas respostas. ${esc(person)} vai preparar o seu orçamento e entra em contacto consigo em breve.</p></section>
<footer>Enat - Ponte de Lima · Os seus dados são usados apenas para preparar o orçamento.</footer>
<script>
const T=${JSON.stringify(token)},st={a:${JSON.stringify(r.a)},sol:${JSON.stringify(r.sol)},gama:${JSON.stringify(r.gama)},fotos:[]},MAX=${MAX_PHOTOS};
const $=s=>document.querySelector(s);
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-v]');if(!b)return;const box=b.parentElement,q=box.dataset.q;
 if(q==='sol'){const v=b.dataset.v,i=st.sol.indexOf(v);i<0?st.sol.push(v):st.sol.splice(i,1);b.classList.toggle('on',i<0);b.setAttribute('aria-pressed',i<0);document.querySelectorAll('[data-tech]').forEach(s=>s.hidden=!st.sol.includes(s.dataset.tech));return}
 box.querySelectorAll('[data-v]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});
 if(q==='gama')st.gama=b.dataset.v;else st.a[q]=b.dataset.v;
});
document.addEventListener('input',e=>{const t=e.target.dataset?.t;if(t)st.a[t]=e.target.value;if(e.target.id==='cp'){let v=e.target.value.replace(/\\D/g,'').slice(0,7);if(v.length>4)v=v.slice(0,4)+'-'+v.slice(4);e.target.value=v}});
// Fotos reduzidas no telemóvel antes de enviar (máx. 1600 px).
const small=f=>new Promise((ok,ko)=>{const u=URL.createObjectURL(f),i=new Image();i.onload=()=>{const k=Math.min(1,1600/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(b=>b?ok(b):ko(),'image/jpeg',.85)};i.onerror=ko;i.src=u});
$('#ph').addEventListener('change',async e=>{
 for(const f of [...e.target.files].slice(0,MAX-st.fotos.length)){
  const box=document.createElement('div');box.className='thumb busy';$('#thumbs').append(box);
  try{const b=await small(f),r=await fetch('/pedido/'+T+'/foto',{method:'POST',headers:{'content-type':'image/jpeg'},body:b}),j=await r.json();if(!r.ok)throw Error(j.error);
   st.fotos.push(j.id);box.className='thumb';box.style.backgroundImage='url('+URL.createObjectURL(b)+')'}
  catch(x){box.remove();$('#err').textContent='Não foi possível enviar uma das fotos. Tente novamente.'}
 }
 e.target.value='';$('#addph').hidden=st.fotos.length>=MAX;
});
$('#f').addEventListener('submit',async e=>{
 e.preventDefault();const err=$('#err');err.textContent='';
 const body={...st,morada:$('#morada').value,cp:$('#cp').value,local:$('#local').value,notas:$('#notas').value};
 if(!st.sol.length){err.textContent='Escolha pelo menos uma solução.';scrollTo({top:0,behavior:'smooth'});return}
 if(!body.morada.trim()||!/^\\d{4}-\\d{3}$/.test(body.cp)){err.textContent='Indique a morada e o código postal (ex.: 4990-062).';$('#morada').focus();return}
 const b=$('#send');b.disabled=true;b.textContent='A enviar…';
 try{const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error);
  $('#f').hidden=true;document.querySelector('.hero').hidden=true;$('#thanks').hidden=false;scrollTo({top:0})}
 catch(x){err.textContent=x.message||'Não foi possível enviar. Verifique a ligação e tente de novo.';b.disabled=false;b.textContent='Enviar respostas'}
});
</script>`;
}

function page(title, body) {
  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="icon" href="/favicon-32x32.png">
<style>
:root{--ink:#16232b;--mute:#5d6b73;--line:#dfe6e3;--bg:#f3f6f4;--card:#fff;--green:#2a723a;--tint:#e8f2ea;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:0 16px 32px}
.top{max-width:560px;margin:0 auto;padding:16px 0 8px}main,form,.card,footer,.err,#send{max-width:560px;margin-left:auto;margin-right:auto}
.card{background:var(--card);border-radius:18px;padding:18px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:22px;line-height:1.25;margin:0 0 8px}h2{font-size:18px;margin:0 0 10px}.muted{color:var(--mute);margin:-4px 0 12px;font-size:14.5px}.done{background:var(--tint);border-radius:12px;padding:10px 12px;margin:10px 0 0;font-size:14.5px}
.q{margin:14px 0 0}.q:first-of-type{margin-top:4px}.q label{display:block;font-weight:600;font-size:15px;margin-bottom:8px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1.5px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:9px 14px;font:inherit;font-size:15px;cursor:pointer}
.chip.on{background:var(--green);border-color:var(--green);color:#fff}
.gama{display:grid;gap:8px}.opt{text-align:left;border:1.5px solid var(--line);background:#fff;border-radius:14px;padding:12px 14px;font:inherit;color:var(--ink);cursor:pointer}.opt b{display:block}.opt small{color:var(--mute);font-size:14px}.opt.on{border-color:var(--green);background:var(--tint)}
input,textarea{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:var(--ink)}input:focus,textarea:focus{outline:2px solid var(--green);border-color:var(--green)}
.row{display:grid;grid-template-columns:1fr 1.4fr;gap:10px}
.btn{display:block;width:100%;border:0;border-radius:14px;background:var(--green);color:#fff;font:inherit;font-weight:700;font-size:17px;padding:15px;margin-top:16px;cursor:pointer;text-align:center}.btn:disabled{opacity:.6}.btn.ghost{background:var(--tint);color:var(--green);font-size:15.5px;padding:12px;margin-top:10px}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.thumb{aspect-ratio:1;border-radius:10px;background:var(--tint) center/cover}.thumb.busy{animation:p 1s infinite alternate}@keyframes p{to{opacity:.4}}
.err{color:#b3261e;font-weight:600;min-height:1px;margin-top:12px}footer{color:var(--mute);font-size:13px;text-align:center;margin-top:20px}[hidden]{display:none!important}
</style></head><body>${body}</body></html>`;
}
