// Keeps the Sanipower and Sanitop catalogues in the database and builds the compact copy the app downloads.
import { getStore } from '@netlify/blobs';
import { gzipSync } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, sql, lt, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { supplierProducts as T, quotes } from '../../db/schema.js';
import * as site from './fornecedores-sites.mjs';

export const SUPPLIERS: Record<string, { name: string }> = { sanipower: { name: 'Sanipower' }, sanitop: { name: 'Sanitop' } };
const store = () => getStore({ name: 'fornecedores', consistency: 'strong' });
const RUN_MS = 13 * 60e3, STALE_MS = 16 * 60e3, PARALLEL = 5;
// Sanitop family listings: once a week, at most 6 minutes per run so the client prices always get time.
const LIST_EVERY = 6 * 24 * 3600e3, LIST_MS = 6 * 60e3;
// The schedule runs only on Sunday night: a full refresh once a week, and Sanitop on the other ticks of that night
// while client prices are missing.
const EVERY_MS = 6 * 24 * 3600e3, RETRY_MS = 60 * 60e3;

type Row = { key: string; ref?: string; model?: string; name: string; brand?: string; path: string[]; url?: string; pvp: number; net?: number | null; discount?: number | null; stock?: boolean | null; seenAt?: Date };

export async function getStatus(s: string) { return (await store().get('estado-' + s, { type: 'json' })) || {}; }
const setStatus = async (s: string, v: any) => { const st = store(), cur = (await st.get('estado-' + s, { type: 'json' })) || {}; await st.setJSON('estado-' + s, { ...cur, ...v }); };

// Shared secret between the API, the schedule and the background sync.
export async function syncToken() {
  const st = store(); let t = await st.get('token');
  if (!t) { t = randomBytes(24).toString('hex'); await st.set('token', t); }
  return t;
}

// Starts the background sync of the given suppliers, unless one is already running.
// With `scheduled`, a supplier only starts when it is due (see `due`).
export async function triggerSync(origin: string, suppliers = Object.keys(SUPPLIERS), scheduled = false) {
  const token = await syncToken(), started: string[] = [];
  for (const s of suppliers) {
    const st: any = await getStatus(s);
    if (st.running && Date.now() - Date.parse(st.startedAt || 0) < STALE_MS) continue;
    if (scheduled && !(await due(s, st))) continue;
    await setStatus(s, { running: true, startedAt: new Date().toISOString(), phase: 'A iniciar' });
    const r = await fetch(origin + '/.netlify/functions/fornecedores-sync', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-token': token }, body: JSON.stringify({ supplier: s }) }).catch(e => ({ ok: false, status: String(e?.message || e) } as any));
    if (r.ok || r.status === 202) started.push(s);
    else await setStatus(s, { running: false, ok: false, error: 'Não foi possível iniciar a sincronização (' + r.status + ').' });
  }
  return started;
}

// A full refresh once a week. Sanitop also runs on every tick of the schedule while there are client prices to read
// or a family listing to finish, and waits an hour after a failed run so a wrong password does not lock the account.
async function due(s: string, st: any) {
  const since = Date.now() - Date.parse(st.finishedAt || st.startedAt || 0);
  if (!(since >= 0) || since >= EVERY_MS) return true;
  if (s !== 'sanitop' || (st.ok === false && since < RETRY_MS)) return false;
  if (st.listing?.startedAt) return true;
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(T).where(and(eq(T.supplier, s), eq(T.removed, false), sql`${T.netAt} is null`));
  return (r?.n || 0) > 0;
}

// Insert or update products. When a price changes the previous one is kept, so the app can show what changed.
// Without a client price (Sanitop listing) a new list price keeps the last known discount and asks for the product page again.
export async function upsert(s: string, rows: Row[], withNet: boolean) {
  const now = new Date();
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400).map(r => ({ supplier: s, key: r.key, ref: r.ref || '', model: r.model || '', name: r.name.slice(0, 500), brand: (r.brand || '').slice(0, 200), path: r.path, url: r.url || '', pvp: r.pvp, net: withNet ? r.net ?? null : null, discount: withNet ? r.discount ?? null : null, stock: r.stock ?? null, seenAt: r.seenAt || now, netAt: withNet ? now : null, removed: false }));
    const pvpChanged = sql`${T.pvp} is distinct from excluded.pvp`;
    // A price estimated after a list-price change (net_at empty) is not a real previous price.
    const netChanged = withNet ? sql`(${T.netAt} is not null and (${pvpChanged} or ${T.net} is distinct from excluded.net))` : pvpChanged;
    await db.insert(T).values(chunk).onConflictDoUpdate({
      target: [T.supplier, T.key],
      set: {
        ref: sql`excluded.ref`, model: sql`excluded.model`, name: sql`excluded.name`, brand: sql`excluded.brand`, path: sql`excluded.path`, url: sql`excluded.url`,
        stock: sql`coalesce(excluded.stock, ${T.stock})`, seenAt: sql`excluded.seen_at`, removed: false, pvp: sql`excluded.pvp`,
        prevPvp: sql`case when ${netChanged} then ${T.pvp} else ${T.prevPvp} end`,
        prevNet: sql`case when ${netChanged} then ${T.net} else ${T.prevNet} end`,
        changedAt: sql`case when ${netChanged} and ${T.net} is not null then now() else ${T.changedAt} end`,
        ...(withNet
          ? { net: sql`excluded.net`, discount: sql`excluded.discount`, netAt: sql`excluded.net_at` }
          : { net: sql`case when ${pvpChanged} and ${T.discount} is not null then round((excluded.pvp * (1 - ${T.discount} / 100))::numeric, 2)::float8 else ${T.net} end`,
              netAt: sql`case when ${pvpChanged} then null else ${T.netAt} end` }),
      },
    });
  }
}

// A list of texts sent to Postgres as a single JSON parameter (drizzle would expand an array into one parameter per item,
// which is not a valid array and goes over the parameter limit with large catalogues).
const textList = (l: string[]) => JSON.stringify(l);

async function activeCount(s: string) { const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(T).where(and(eq(T.supplier, s), eq(T.removed, false))); return r?.n || 0; }

// Products the supplier no longer lists are hidden, but only after a complete pass that found most of the catalogue.
async function hideMissing(s: string, since: Date) {
  const before = await activeCount(s);
  const [f] = await db.select({ n: sql<number>`count(*)::int` }).from(T).where(and(eq(T.supplier, s), eq(T.removed, false), sql`${T.seenAt} >= ${since}`));
  if ((f?.n || 0) < before * 0.6) return 0;
  const r = await db.update(T).set({ removed: true }).where(and(eq(T.supplier, s), eq(T.removed, false), lt(T.seenAt, since))).returning({ id: T.id });
  return r.length;
}

// Lists every category, then reads product pages until the time runs out: new pages first, then those read longest ago.
async function syncSanipower(deadline: number, progress: (p: string) => Promise<void>) {
  const started = new Date();
  let s = await site.sanipowerLogin();
  const cats = await site.sanipowerCategories(s);
  if (cats.length < 20) throw new Error('A Sanipower não mostrou as categorias do catálogo.');
  const urls = new Set<string>();
  let done = 0, failedCats = 0;
  await site.pool(cats, PARALLEL, async (c: string) => {
    try { for (const u of await site.sanipowerListing(s, c)) urls.add(u); } catch { failedCats++; }
    if (++done % 50 === 0) await progress(`Categorias ${done}/${cats.length}`);
  }, () => Date.now() > deadline);
  const known = await db.select({ url: T.url, at: sql<string | null>`min(${T.netAt})` }).from(T).where(and(eq(T.supplier, 'sanipower'), eq(T.removed, false))).groupBy(T.url);
  const last = new Map(known.map(k => [k.url, k.at ? Date.parse(k.at) : 0]));
  const list = [...urls].sort((a, b) => (last.get(a) ?? -1) - (last.get(b) ?? -1));
  // Pages that disappeared from every category are hidden, but only after a full listing that found most of them.
  let hidden = 0;
  if (done === cats.length && !failedCats && urls.size >= known.length * 0.6 && urls.size) {
    const r = await db.update(T).set({ removed: true }).where(and(eq(T.supplier, 'sanipower'), eq(T.removed, false), sql`${T.url} not in (select jsonb_array_elements_text(${textList([...urls])}::jsonb))`)).returning({ id: T.id });
    hidden = r.length;
  }
  const rows = new Map<string, Row>(), visited: string[] = [];
  let pages = 0, relogged = false, lost = false;
  const flush = async () => {
    await upsert('sanipower', [...rows.values()], true); rows.clear();
    // References no longer shown on a page that was just read are hidden.
    if (visited.length) { const r = await db.update(T).set({ removed: true }).where(and(eq(T.supplier, 'sanipower'), eq(T.removed, false), sql`${T.url} in (select jsonb_array_elements_text(${textList(visited.splice(0))}::jsonb))`, sql`(${T.netAt} is null or ${T.netAt} < ${started})`)).returning({ id: T.id }); hidden += r.length; }
  };
  await site.pool(list, PARALLEL, async (u: string) => {
    let r: any = await site.sanipowerProduct(s, u).catch(() => null);
    if (r && !r.loggedIn && !relogged) { relogged = true; s = await site.sanipowerLogin(); r = await site.sanipowerProduct(s, u).catch(() => null); }
    if (!r) return;
    if (!r.loggedIn) { lost = true; return; }
    for (const p of r.products) rows.set(p.key, p);
    if (r.products.length || r.gone) visited.push(u);
    if (++pages % 100 === 0) { await progress(`Páginas de produto ${pages}/${list.length}`); await flush(); }
  }, () => lost || Date.now() > deadline);
  await flush();
  if (lost) throw new Error('A sessão na Sanipower deixou de mostrar os preços de cliente. Confirme o utilizador e a senha.');
  return { pages, found: list.length, hidden };
}

// Sanitop shows the client price only on each product page, so a run has two steps:
// 1. The family listings (list price, stock, new and removed products) at most once a day, in parts of up to LIST_MS
//    per run; a pass that does not finish continues on the next run where it stopped.
// 2. The client prices for the rest of the time, the products used in quotes first (see readOrder).
async function syncSanitop(deadline: number, progress: (p: string) => Promise<void>) {
  const started = new Date();
  let s = await site.sanitopLogin();
  const st: any = await getStatus('sanitop');
  let listing: { startedAt: string; done: string[]; failed: number } | null = st.listing?.startedAt ? st.listing : null;
  let listed = 0, complete = false, hidden = 0;
  if (listing || !st.listedAt || Date.now() - Date.parse(st.listedAt) > LIST_EVERY) {
    const cats = await site.sanitopCategories(s);
    if (cats.length < 20) throw new Error('A Sanitop não mostrou as famílias do catálogo.');
    const pass = listing || { startedAt: started.toISOString(), done: [], failed: 0 };
    const done = new Set(pass.done), todo = cats.filter((c: any) => !done.has(c.url)), stop = Math.min(deadline, Date.now() + LIST_MS);
    const rows = new Map<string, Row>();
    let n = 0;
    await site.pool(todo, PARALLEL, async (c: any) => {
      try { for (const p of await site.sanitopListing(s, c)) if (!rows.has(p.key)) rows.set(p.key, p); } catch { pass.failed++; }
      done.add(c.url);
      if (++n % 40 === 0) await progress(`Famílias ${done.size}/${cats.length}`);
    }, () => Date.now() > stop);
    await upsert('sanitop', [...rows.values()], false);
    listed = rows.size;
    complete = cats.every((c: any) => done.has(c.url));
    if (complete) {
      if (pass.failed <= 3) hidden = await hideMissing('sanitop', new Date(pass.startedAt));
      await setStatus('sanitop', { listing: null, listedAt: pass.startedAt });
    } else await setStatus('sanitop', { listing: { ...pass, done: [...done] } });
    listing = complete ? null : pass;
  }
  const order = await readOrder();
  let checked = 0, relogged = false, lost = false;
  while (!lost && Date.now() < deadline - 20e3) {
    const batch = await db.select().from(T).where(and(eq(T.supplier, 'sanitop'), eq(T.removed, false), sql`(${T.netAt} is null or ${T.netAt} < ${started})`))
      .orderBy(sql`(${T.netAt} is not null)`, order, sql`${T.netAt} asc nulls first`, asc(T.id)).limit(200);
    if (!batch.length) break;
    const upd: Row[] = [], gone: number[] = [];
    await site.pool(batch, PARALLEL, async (p: any) => {
      let r: any = await site.sanitopProduct(s, p.key).catch(() => null);
      if (r && !r.loggedIn && !relogged) { relogged = true; s = await site.sanitopLogin(); r = await site.sanitopProduct(s, p.key).catch(() => null); }
      if (r && !r.loggedIn) { lost = true; return; }
      if (r?.gone) gone.push(p.id);
      else if (r?.net != null) upd.push({ ...p, pvp: r.pvp, net: r.net, discount: r.discount, stock: r.stock ?? p.stock });
      else upd.push({ ...p, net: p.net, discount: p.discount }); // unreadable page: try again on a later pass
    }, () => lost || Date.now() > deadline - 10e3);
    await upsert('sanitop', upd, true);
    if (gone.length) await db.update(T).set({ removed: true }).where(inArray(T.id, gone));
    checked += upd.length + gone.length;
    await progress(`Preços de cliente lidos nesta passagem: ${checked}`);
    if (upd.length + gone.length < batch.length && !lost) break;
  }
  if (lost) throw new Error('A sessão na Sanitop deixou de mostrar os preços de cliente. Confirme o utilizador e a senha.');
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(T).where(and(eq(T.supplier, 'sanitop'), eq(T.removed, false), sql`${T.netAt} is null`));
  return { listed, complete: !listing, hidden, checked, pending: left?.n || 0 };
}

// Families of the Sanitop shop with the equipment ENAT quotes, and words of the materials the quotes use.
const WORK_FAMILIES = ['Bombas de calor e Ar condicionado', 'Aquecimento e Águas Quentes Sanitárias (AQS)', 'Ventilação', 'Energia Solar', 'Mobilidade elétrica'];
const WORK_WORDS = 'cobre|cabo|calha|coquilha|isolamento|isolad|suporte|antivibr|condensad|disjuntor|diferencial|vaso de expans|v[aá]lvula|multicamada|pe-?rt|colec?tor|termost|purgador|man[oó]metro|glicol|inibidor|conduta|grelha|passa.?muros|abra[cç]adeira|manguito|diel[eé]tric|filtro|circulador|ar condicionado|bomba de calor|split|wallbox|carregador';

// Order in which client prices are read: products already used in quotes, then products of the brands and families
// ENAT quotes, then the materials the quotes use, then the rest.
async function readOrder() {
  const keys = new Set<string>(), brands = new Set<string>();
  const docs = await db.select({ d: quotes.document }).from(quotes).catch(() => [] as { d: any }[]);
  for (const { d } of docs) for (const l of Array.isArray((d as any)?.lines) ? (d as any).lines : []) {
    const c = l?.catalog; if (!c) continue;
    if (c.ref) keys.add(String(c.ref));
    if (c.brand && !/^(sanitop|sanipower|faturas)/i.test(c.brand)) brands.add(String(c.brand));
  }
  return sql`case when ${T.key} in (select jsonb_array_elements_text(${textList([...keys])}::jsonb)) then 0
    when ${T.path}->>0 in (select jsonb_array_elements_text(${textList(WORK_FAMILIES)}::jsonb)) or lower(${T.brand}) in (select lower(jsonb_array_elements_text(${textList([...brands])}::jsonb))) then 1
    when ${T.name} ~* ${WORK_WORDS} then 2 else 3 end`;
}

export async function runSync(s: string) {
  if (!SUPPLIERS[s]) throw new Error('Fornecedor desconhecido');
  const t0 = Date.now(), deadline = t0 + RUN_MS;
  await setStatus(s, { running: true, startedAt: new Date(t0).toISOString(), phase: 'A entrar no site', error: '' });
  const progress = (phase: string) => setStatus(s, { phase });
  try {
    const r = s === 'sanipower' ? await syncSanipower(deadline, progress) : await syncSanitop(deadline, progress);
    await progress('A preparar o catálogo para a app');
    const snap = await buildSnapshot(s);
    await setStatus(s, { running: false, ok: true, error: '', finishedAt: new Date().toISOString(), phase: '', count: snap.count, priced: snap.priced, result: r, seconds: Math.round((Date.now() - t0) / 1000) });
    return r;
  } catch (e: any) {
    console.error('fornecedores', s, e);
    // Whatever was read stays saved and goes into the app's copy.
    await buildSnapshot(s).catch(() => null);
    await setStatus(s, { running: false, ok: false, error: String(e?.message || e).slice(0, 300), finishedAt: new Date().toISOString(), phase: '' });
    throw e;
  }
}

// Compact copy of the catalogue for the app: shared group paths plus one array per product, gzipped.
// Products whose client price was not read yet get an estimate from the brand's usual discount (flagged as such).
export async function buildSnapshot(s: string) {
  const all = await db.select().from(T).where(and(eq(T.supplier, s), eq(T.removed, false))).orderBy(asc(T.id));
  const discs = new Map<string, number[]>(), every: number[] = [];
  for (const p of all) if (p.discount != null && p.net != null) { (discs.get(p.brand) || discs.set(p.brand, []).get(p.brand)!).push(p.discount); every.push(p.discount); }
  const median = (l?: number[]) => { if (!l?.length) return null; const v = [...l].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const brandDisc = new Map([...discs].map(([b, l]) => [b, median(l)!])), fallback = median(every);
  const groups: string[][] = [], gi = new Map<string, number>();
  const week = Date.now() - 7 * 864e5;
  let priced = 0;
  const rows = all.map(p => {
    const g = site.quoteGroup(p.path as string[]), k = g.join('\u0001');
    if (!gi.has(k)) { gi.set(k, groups.length); groups.push(g); }
    let net = p.net, disc = p.discount, est = 0;
    if (net == null) { disc = brandDisc.get(p.brand) ?? fallback ?? 0; net = Math.round(p.pvp * (1 - disc / 100) * 100) / 100; est = 1; } else priced++;
    const changed = p.changedAt && p.changedAt.getTime() > week ? [p.changedAt.getTime(), p.prevNet ?? p.prevPvp ?? null] : 0;
    return [gi.get(k), p.key, p.ref, p.model, p.name, p.brand, p.pvp, net, disc ?? 0, p.stock == null ? null : p.stock ? 1 : 0, est, p.url, changed];
  });
  const at = new Date().toISOString();
  const body = JSON.stringify({ supplier: s, name: SUPPLIERS[s].name, at, cols: ['g', 'key', 'ref', 'model', 'name', 'brand', 'pvp', 'net', 'disc', 'stock', 'est', 'url', 'chg'], groups, rows });
  const gz = gzipSync(body);
  const etag = '"' + createHash('sha1').update(gz).digest('base64url') + '"';
  await store().set('catalogo-' + s, gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer, { metadata: { etag, at, count: rows.length, priced } });
  return { count: rows.length, priced, etag };
}

export async function getSnapshot(s: string) {
  return store().getWithMetadata('catalogo-' + s, { type: 'arrayBuffer' });
}

// Reads one product's price on the supplier's site right now (used when it is added to a quote).
export async function livePrice(s: string, key: string) {
  const [p] = await db.select().from(T).where(and(eq(T.supplier, s), eq(T.key, key))).limit(1);
  if (!p) return null;
  let fresh: Row | null = null, gone = false;
  if (s === 'sanipower') {
    const r: any = await site.sanipowerProduct(await site.sanipowerLogin(), p.url);
    if (!r.loggedIn) throw new Error('A Sanipower não mostrou o preço de cliente.');
    const m = r.products.find((x: Row) => x.key === key);
    if (m) fresh = m; else gone = r.gone || !r.products.length;
  } else {
    const r: any = await site.sanitopProduct(await site.sanitopLogin(), key);
    if (!r.loggedIn) throw new Error('A Sanitop não mostrou o preço de cliente.');
    if (r.net != null) fresh = { ...(p as any), pvp: r.pvp, net: r.net, discount: r.discount, stock: r.stock ?? p.stock }; else gone = !!r.gone;
  }
  if (!fresh) { if (gone) await db.update(T).set({ removed: true }).where(eq(T.id, p.id)); return { key, gone: true }; }
  await upsert(s, [{ ...fresh, seenAt: p.seenAt }], true);
  return { key, pvp: fresh.pvp, net: fresh.net, disc: fresh.discount, stock: fresh.stock ?? null, at: new Date().toISOString(), was: p.net };
}

// /api/fornecedores/… (already authorised by the API).
export async function handleSuppliers(req: Request, path: string) {
  const fail = (status: number, error: string) => Response.json({ error }, { status });
  try {
    if (path === 'fornecedores/estado' && req.method === 'GET') {
      const out = await Promise.all(Object.entries(SUPPLIERS).map(async ([id, v]) => {
        const [status, meta] = await Promise.all([getStatus(id), store().getMetadata('catalogo-' + id)]);
        return { id, name: v.name, ...(status as any), catalog: meta?.metadata || null };
      }));
      return Response.json(out);
    }
    const cat = path.match(/^fornecedores\/catalogo\/([a-z]+)$/);
    if (cat && req.method === 'GET') {
      if (!SUPPLIERS[cat[1]]) return fail(404, 'Fornecedor desconhecido.');
      const meta = await store().getMetadata('catalogo-' + cat[1]);
      if (!meta) return new Response(null, { status: 204 });
      const etag = String((meta.metadata as any).etag || '');
      const headers = { etag, 'cache-control': 'private, no-cache', vary: 'x-session' };
      if (etag && req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
      const snap = await getSnapshot(cat[1]);
      if (!snap) return new Response(null, { status: 204 });
      return new Response(new Uint8Array(snap.data as ArrayBuffer), { headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip' } });
    }
    if (path === 'fornecedores/atualizar' && req.method === 'POST') {
      let b: any = {}; try { b = await req.json(); } catch {}
      const list = b?.supplier ? [b.supplier].filter(s => SUPPLIERS[s]) : Object.keys(SUPPLIERS);
      if (!list.length) return fail(400, 'Fornecedor desconhecido.');
      return Response.json({ started: await triggerSync(new URL(req.url).origin, list) });
    }
    if (path === 'fornecedores/preco' && req.method === 'POST') {
      let b: any = {}; try { b = await req.json(); } catch {}
      if (!SUPPLIERS[b?.supplier] || typeof b.key !== 'string' || !b.key || b.key.length > 100) return fail(400, 'Produto inválido.');
      const r = await livePrice(b.supplier, b.key);
      return r ? Response.json(r) : fail(404, 'Produto não encontrado.');
    }
    return fail(404, 'Pedido desconhecido.');
  } catch (e: any) {
    console.error('fornecedores api', e);
    return fail(502, String(e?.message || 'Não foi possível contactar o fornecedor.').slice(0, 300));
  }
}
