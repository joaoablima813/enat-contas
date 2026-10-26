import { db } from '../../db/index.js';
import { quotes } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';
const fail=(status:number,error:string)=>Response.json({error},{status});
export async function handleQuotes(req:Request,path:string){
  try {
    if(path==='orcamentos' && req.method==='GET') return Response.json(await db.select().from(quotes).orderBy(desc(quotes.id)));
    const match=path.match(/^orcamentos\/(\d+)$/);
    if(req.method!=='POST' && req.method!=='PUT') return fail(405,'Método não permitido.');
    if((req.method==='PUT'&&!match)||(req.method==='POST'&&path!=='orcamentos'))return fail(404,'Orçamento não encontrado.');
    const b=await req.json();
    if(!b || typeof b!=='object')return fail(400,'Dados inválidos.');
    const fields=['client','address','locality','contact','date','warranty'];
    if(fields.some(k=>typeof b[k]!=='string'||b[k].length>2000)||!b.client.trim()||!b.address.trim()||!b.locality.trim()||!b.contact.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date)))return fail(400,'Preencha os dados do cliente e uma data válida.');
    if(!Array.isArray(b.topics)||!b.topics.length||b.topics.length>20||b.topics.some((t:unknown)=>typeof t!=='string'||!t.trim()||t.length>100))return fail(400,'Selecione pelo menos uma tipologia.');
    if(typeof b.margin!=='number'||!Number.isFinite(b.margin)||b.margin<0||b.margin>=100||typeof b.vat!=='number'||!Number.isFinite(b.vat)||b.vat<0||b.vat>100)return fail(400,'Margem ou IVA inválidos.');
    if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>200||b.lines.some((l:any)=>!l||!['Equipamento / material','Mão de obra','Outros'].includes(l.kind)||typeof l.description!=='string'||!l.description.trim()||l.description.length>4000||typeof l.value!=='number'||!Number.isFinite(l.value)||l.value<0||l.value>1e8)||!b.lines.some((l:any)=>l.value>0))return fail(400,'Preencha as alíneas e pelo menos um valor positivo.');
    const document=Object.fromEntries([...fields,'topics','lines','margin','vat'].map(k=>[k,b[k]]));
    const rows=match?await db.update(quotes).set({document,updatedAt:new Date()}).where(eq(quotes.id,Number(match[1]))).returning():await db.insert(quotes).values({document}).returning();
    return rows.length?Response.json(rows[0],{status:match?200:201}):fail(404,'Orçamento não encontrado.');
  }catch(error){return fail(error instanceof SyntaxError?400:503,error instanceof SyntaxError?'Dados inválidos.':'Não foi possível aceder aos orçamentos. Tente novamente.');}
}
