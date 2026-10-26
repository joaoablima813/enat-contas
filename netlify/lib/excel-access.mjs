import { createHash, randomBytes } from 'node:crypto';
import { getDatabase } from '@netlify/database';
import { excelData } from './excel-data.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
export async function handleExcel(req, path, store, authorized) {
  const db = getDatabase();
  try {
    if (path === 'excel/acesso') {
      if (!authorized) return new Response(null, { status: 401, headers });
      if (req.method === 'POST') {
        const password = randomBytes(24).toString('base64url');
        await db.sql`INSERT INTO excel_access (id, password_hash) VALUES (1, ${hash(password)}) ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, created_at = now()`;
        return Response.json({ username: 'enat', password }, { headers });
      }
      if (req.method === 'DELETE') {
        await db.sql`DELETE FROM excel_access WHERE id = 1`;
        return Response.json({ ok: true }, { headers });
      }
      if (req.method === 'GET') {
        const rows = await db.sql`SELECT created_at FROM excel_access WHERE id = 1`;
        return Response.json({ active: rows.length > 0 }, { headers });
      }
    }
    if (path === 'excel/dados' && req.method === 'GET') {
      const credential = readBasic(req.headers.get('authorization'));
      const rows = credential ? await db.sql`SELECT id FROM excel_access WHERE id = 1 AND password_hash = ${hash(credential)}` : [];
      if (!rows.length) return new Response(null, { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Basic realm="ENAT Excel", charset="UTF-8"' } });
      const state = await store.get('estado', { type: 'json' });
      if (!state) return Response.json({ error: 'Ainda não existem dados sincronizados na app.' }, { status: 409, headers });
      return Response.json(excelData(state), { headers });
    }
    return new Response(null, { status: 405, headers });
  } catch {
    return Response.json({ error: 'Não foi possível ligar o Excel. Tente novamente.' }, { status: 503, headers });
  }
}
export function readBasic(value) {
  if (!value?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
  if (!decoded.startsWith('enat:')) return null;
  const password = decoded.slice(5);
  return /^[A-Za-z0-9_-]{32}$/.test(password) ? password : null;
}
