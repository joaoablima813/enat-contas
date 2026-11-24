// Sessões da app: token "expira.assinatura" assinado com um segredo guardado nos Blobs (store «enat»).
// Usado pela API principal (/api/*) e pelas funções à parte que precisam da mesma autenticação (ex.: ads-metrics).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const segredo = async (store) => {
  let s = await store.get('auth-segredo');
  if (!s) { s = randomBytes(32).toString('hex'); await store.set('auth-segredo', s); }
  return s;
};
export const assinar = (s, exp) => exp + '.' + createHmac('sha256', s).update(String(exp)).digest('base64url');
export const valido = (s, t) => {
  const exp = String(t || '').split('.')[0];
  if (!exp || !(+exp > Date.now())) return false;
  const a = Buffer.from(assinar(s, exp)), b = Buffer.from(String(t));
  return a.length === b.length && timingSafeEqual(a, b);
};
// Pedido autorizado: sessão válida (x-session) ou o código de acesso da app (x-code = APP_CODE).
export const pedidoAutorizado = async (req, store) => {
  const code = process.env.APP_CODE;
  return Boolean((code && req.headers.get('x-code') === code) || valido(await segredo(store), req.headers.get('x-session')));
};
