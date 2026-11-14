// Readers for the suppliers' online shops. They log in with the account in the environment variables,
// walk the catalogue and return plain product objects. No database here, so they can be tested on their own.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// A tiny browser session: keeps cookies and follows redirects.
export function session() {
  const cookies = new Map();
  async function go(url, opts = {}, tries = 2) {
    let u = url, o = opts, res;
    for (let hop = 0; hop < 8; hop++) {
      const headers = { 'user-agent': UA, 'accept-language': 'pt-PT,pt;q=0.9', ...(o.headers || {}) };
      if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
      try { res = await fetch(u, { ...o, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) }); }
      catch (e) { if (tries > 1) { await new Promise(r => setTimeout(r, 1500)); return go(url, opts, tries - 1); } throw e; }
      for (const sc of res.headers.getSetCookie?.() || []) {
        const kv = sc.split(';')[0], i = kv.indexOf('=');
        if (i > 0) cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1));
      }
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { u = new URL(loc, u).href; o = { headers: o.headers }; continue; }
      break;
    }
    if (res.status >= 500 && tries > 1) { await new Promise(r => setTimeout(r, 2000)); return go(url, opts, tries - 1); }
    return res;
  }
  return { cookies, fetch: go, text: async (url, opts) => { const r = await go(url, opts); if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`); return r.text(); } };
}

// Runs `fn` over the items with a few requests at a time, stopping early when `until` says so.
export async function pool(items, size, fn, until = () => false) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length && !until()) { const i = next++; await fn(items[i], i); }
  }));
}

const entities = s => String(s ?? '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&ordf;/g, 'ª').replace(/&ccedil;/g, 'ç').replace(/&atilde;/g, 'ã');
const clean = s => entities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// "1 195,000 €" → 1195
export const euros = s => { const m = clean(s).replace(/[\s ]/g, '').match(/-?\d[\d.]*(?:,\d+)?/); return m ? Number(m[0].replace(/\./g, '').replace(',', '.')) : null; };
const r2 = n => Math.round(n * 100) / 100;

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`Falta configurar ${k}.`); return v; };

/* ---------------- Sanipower ---------------- */
const SP = 'https://www.sanipower.pt';

export async function sanipowerLogin() {
  const s = session();
  await s.fetch(SP + '/');
  await s.fetch(SP + '/utilizadores/entrar', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', referer: SP + '/' }, body: new URLSearchParams({ utilizador: need('SANIPOWER_USER'), senha: need('SANIPOWER_PASSWORD') }) });
  // 96 products per listing page instead of 12.
  s.cookies.set('sani_products_by_page', '96');
  return s;
}

// Leaf categories (e.g. /ar-condicionado/lg/mono-split-r32) from the site menu.
export async function sanipowerCategories(s) {
  const h = await s.text(SP + '/');
  return [...new Set([...h.matchAll(/href="(https:\/\/www\.sanipower\.pt\/[^"#?]+)"/g)].map(m => m[1].replace(/\/$/, '')))]
    .filter(u => new URL(u).pathname.split('/').filter(Boolean).length === 3);
}

// Product pages listed in one category, following its pages.
export async function sanipowerListing(s, cat) {
  const out = new Set();
  for (let page = 1; page <= 30; page++) {
    const h = await s.text(cat + (page > 1 ? '?pagina=' + page : ''));
    const before = out.size;
    for (const m of h.matchAll(/href="(https:\/\/www\.sanipower\.pt\/[^"#?]+)"/g)) if (m[1].startsWith(cat + '/') && new URL(m[1]).pathname.split('/').filter(Boolean).length === 4) out.add(m[1]);
    const last = Math.max(1, ...[...h.matchAll(/[?&]pagina=(\d+)/g)].map(m => +m[1]));
    if (page >= last || out.size === before) break;
  }
  return [...out];
}

// One product page: every reference in its table, with list price, discount, net price and stock.
// Returns null when the page does not show the client prices (session lost).
export function sanipowerParse(h, url) {
  const crumbs = [...(h.match(/class="[^"]*breadcrumbs[^"]*"[\s\S]*?<\/section>/)?.[0] || '').matchAll(/<a[^>]*title="([^"]*)"/g)].map(m => clean(m[1]));
  const titles = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => clean(m[1]));
  const title = titles[titles.length - 1] || crumbs[crumbs.length - 1] || '';
  const name = title.replace(/®/g, '').trim();
  // The manufacturer comes before the ® sign ("LG® Mono-Split…").
  const maker = title.match(/^([^®]{2,30})®/)?.[1].trim() || '';
  const path = crumbs.slice(1, -1);
  const table = h.match(/<table class="table">[\s\S]*?<\/table>/)?.[0];
  if (!table || !name) return { products: [], loggedIn: true };
  const head = clean(table.match(/<thead>[\s\S]*?<\/thead>/)?.[0] || '');
  if (!/Desconto|Desc\./.test(head)) return { products: [], loggedIn: false };
  // A reference can have a general row ("direto") and a row with this account's own conditions ("preco_cliente"): the latter wins.
  const byRef = new Map();
  for (const row of table.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const own = /preco_cliente/.test(row[1]);
    const cells = [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map(m => m[1]);
    if (cells.length < 5) continue;
    const ref = clean(cells[0]), pvp = euros(cells[2]), disc = euros(cells[3]);
    const net = euros(cells[4].match(/<span class="bold">([\s\S]*?)<\/span>/)?.[1] ?? cells[4]);
    if (!ref || pvp == null) continue;
    const stockCell = row[2].match(/celula_stock[\s\S]*?<i class="las (la-[a-z]+)/)?.[1];
    const p = { key: ref, ref, model: clean(cells[1]), name, brand: maker, path, url, pvp: r2(pvp), net: net == null ? null : r2(net), discount: disc, stock: stockCell ? stockCell === 'la-check' : null };
    const was = byRef.get(ref);
    if (!was || own) byRef.set(ref, was && p.stock == null ? { ...p, stock: was.stock } : p);
  }
  return { products: [...byRef.values()], loggedIn: true };
}

export async function sanipowerProduct(s, url) {
  const r = await s.fetch(url);
  if (r.status === 404) return { products: [], gone: true, loggedIn: true };
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return sanipowerParse(await r.text(), url);
}

/* ---------------- Sanitop ---------------- */
const ST = 'https://www.sanitop.pt';
const ST_API = ST + '/DesktopModules/DNNServices/API/sanitop/';

export async function sanitopLogin() {
  const s = session(), L = ST + '/Profissional?returnurl=%2fLoja%2fTemp';
  const h = await s.text(L);
  const form = new URLSearchParams();
  for (const m of h.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = m[0].match(/name="([^"]*)"/)?.[1];
    if (n) form.set(n, entities(m[0].match(/value="([^"]*)"/)?.[1] ?? ''));
  }
  const field = h.match(/name="([^"]*Login_DNN\$txtUsername)"/)?.[1] || 'dnn$ctr2742$Login$Login_DNN$txtUsername';
  const base = field.replace(/\$txtUsername$/, '');
  form.set('__EVENTTARGET', base + '$cmdLogin');
  form.set(base + '$txtUsername', need('SANITOP_USER'));
  form.set(base + '$txtPassword', need('SANITOP_PASSWORD'));
  const r = await s.fetch(L, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', referer: L }, body: form });
  const t = await r.text();
  if (!s.cookies.has('.DOTNETNUKE') || !/ctl\/Logoff/i.test(t)) throw new Error('A Sanitop recusou o login. Confirme o utilizador e a senha.');
  return s;
}

const stJson = async (s, path, referer) => {
  const r = await s.fetch(ST_API + path, { headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', referer } });
  const t = await r.text();
  if (!r.ok || !t) throw new Error(`Sanitop não respondeu (${r.status}) em ${path.split('?')[0]}`);
  return JSON.parse(t);
};

// Leaf families of the product menu with their full path.
export async function sanitopCategories(s) {
  const d = await stJson(s, 'GetMenu?Level=3', ST + '/');
  const out = [];
  const walk = (n, p) => { const path = [...p, clean(n.name)]; if (n.child?.length) n.child.forEach(c => walk(c, path)); else if (n.url) out.push({ url: n.url, path }); };
  (d.menu || []).forEach(n => walk(n, []));
  return out;
}

// Every product of one family (list price and stock; the client price comes from the product page).
export async function sanitopListing(s, cat) {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const q = new URLSearchParams({ keywords: '', hash: `fam3=${cat.url};dcp=${page};dppp=100;orderby=rank;filter=` });
    const d = await stJson(s, 'GetProductsInformation?' + q, ST + '/searchproducts/' + cat.url);
    const list = d.products || [];
    for (const p of list) {
      const pvp = Number(p.ListPrice || p.RefPrice);
      if (!p.ItemCode || !(pvp >= 0)) continue;
      out.push({ key: String(p.ItemCode), ref: String(p.ISBN || ''), model: '', name: clean(p.DisplayName), brand: clean(p.Brand || p.Free1 || ''), path: cat.path, url: ST + '/store/productid/' + p.ItemCode, pvp: r2(pvp), stock: p.Stock == null ? null : Number(p.Stock) > 0 });
    }
    const total = Number(list[0]?.count) || 0;
    if (!list.length || page * 100 >= total) break;
  }
  return out;
}

// Client price, list price and discount shown on the product page when logged in.
export function sanitopParse(h) {
  if (!/ctl\/Logoff/i.test(h)) return { loggedIn: false };
  const at = h.search(/id="[^"]*ProductPage_UnitCost"/);
  const block = at < 0 ? '' : h.slice(at, at + 1500).split(/<\/span>\s*<\/div>\s*<\/div>|ProductPage_pnl(?!DetailPrice)/)[0];
  const net = euros(block.match(/s-productprice-red">([\s\S]*?)<\/span>/)?.[1] ?? block.match(/CATProductListItem[^>]*>([\s\S]*?)<\/span>/)?.[1]);
  const struck = euros(block.match(/line-through[^>]*>([\s\S]*?)<\/span>/)?.[1]);
  const disc = block.match(/discountText">[^<]*\(([\d.,]+)\s*%\)/)?.[1];
  const stock = clean(h).match(/Stock total\s+(\d+)/i)?.[1];
  if (net == null) return { loggedIn: true, gone: !/ProductPage/.test(h) };
  const pvp = struck ?? net;
  return { loggedIn: true, net: r2(net), pvp: r2(pvp), discount: disc ? Number(disc.replace(',', '.')) : pvp > 0 ? Math.round((1 - net / pvp) * 1000) / 10 : 0, stock: stock == null ? null : Number(stock) > 0 };
}

export async function sanitopProduct(s, key) {
  const r = await s.fetch(ST + '/store/productid/' + encodeURIComponent(key));
  if (r.status === 404) return { loggedIn: true, gone: true };
  if (!r.ok) throw new Error(`HTTP ${r.status} na Sanitop`);
  return sanitopParse(await r.text());
}

/* ---------------- Quote typologies ---------------- */
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Puts each product under the quote typology it belongs to (so it is ticked automatically), followed by the supplier's own path.
const TYPES = [
  ['Bomba de calor AQS', /bombas? de calor.*(aqs|aguas? quentes?|termoacumul)|(aqs|termoacumul).*bombas? de calor/],
  ['Ar condicionado', /ar condicionado|split|\bvrf\b|\bvrv\b/],
  ['Bomba de calor climatização', /bombas? de calor/],
  ['Ventiloconvectores', /ventiloconvector/],
  ['VMC', /\bvmc\b|ventilacao mecanica|recuperacao de energia|recuperadores? de energia|ventilacao controlada/],
  ['UPAC (fotovoltaico)', /fotovolt|inversor|upac|autoconsumo/],
  ['Carregadores de veículos elétricos', /mobilidade eletrica|carregador(es)? (de|para) (veiculos|carros)|wallbox/],
];
export function quoteGroup(path) {
  const text = norm(path.join(' › '));
  const type = TYPES.find(([, re]) => re.test(text))?.[0];
  const g = type ? [type, ...path.slice(1)] : [...path];
  return g.filter((x, i) => x && (i === 0 || norm(x) !== norm(g[i - 1])));
}
