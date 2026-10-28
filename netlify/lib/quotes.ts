import { db } from '../../db/index.js';
import { quotes } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';
const fail=(status:number,error:string)=>Response.json({error},{status});
export async function handleQuotes(req:Request,path:string){
  try {
    if(path==='orcamentos' && req.method==='GET') return Response.json(await db.select().from(quotes).orderBy(desc(quotes.id)));
    const match=path.match(/^orcamentos\/(\d+)$/);
    if(req.method==='DELETE'){
      if(!match)return fail(404,'Orçamento não encontrado.');
      const rows=await db.delete(quotes).where(eq(quotes.id,Number(match[1]))).returning({id:quotes.id});
      return rows.length?new Response(null,{status:204}):fail(404,'Orçamento não encontrado.');
    }
    if(req.method!=='POST' && req.method!=='PUT') return fail(405,'Método não permitido.');
    if((req.method==='PUT'&&!match)||(req.method==='POST'&&path!=='orcamentos'))return fail(404,'Orçamento não encontrado.');
    const b=await req.json();
    if(!b || typeof b!=='object')return fail(400,'Dados inválidos.');
    const fields=['client','address','contact','date','warranty'];
    if(fields.some(k=>typeof b[k]!=='string'||b[k].length>(k==='address'?4000:2000))||!b.client.trim()||!b.address.trim()||!b.contact.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date)))return fail(400,'Preencha os dados do cliente e uma data válida.');
    if(!Array.isArray(b.topics)||!b.topics.length||b.topics.length>20||b.topics.some((t:unknown)=>typeof t!=='string'||!t.trim()||t.length>100))return fail(400,'Selecione pelo menos uma tipologia.');
    if(typeof b.margin!=='number'||!Number.isFinite(b.margin)||b.margin<0||b.margin>=100||typeof b.vat!=='number'||!Number.isFinite(b.vat)||b.vat<0||b.vat>100)return fail(400,'Margem ou IVA inválidos.');
    if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>200||b.lines.some((l:any)=>!l||!['Equipamento / material','Equipamento','Material','Acessórios','Mão de obra','Outros'].includes(l.kind)||typeof l.description!=='string'||!l.description.trim()||l.description.length>4000||typeof l.value!=='number'||!Number.isFinite(l.value)||l.value<0||l.value>1e8||(l.quantity!==undefined&&(typeof l.quantity!=='number'||!Number.isFinite(l.quantity)||l.quantity<=0||l.quantity>1e6))||(l.unit!==undefined&&!['un.','m','m²','m³','h','dia','serviço'].includes(l.unit)))||!b.lines.some((l:any)=>l.value>0))return fail(400,'Preencha as descrições, quantidades e pelo menos um valor positivo.');
    // Lines picked from a price table keep the brand, reference, table price and discount used.
    if(b.lines.some((l:any)=>l.catalog!==undefined&&(!l.catalog||typeof l.catalog!=='object'||typeof l.catalog.brand!=='string'||l.catalog.brand.length>200||typeof l.catalog.ref!=='string'||l.catalog.ref.length>200||typeof l.catalog.price!=='number'||!Number.isFinite(l.catalog.price)||l.catalog.price<0||typeof l.catalog.discount!=='number'||!Number.isFinite(l.catalog.discount)||l.catalog.discount<0||l.catalog.discount>100)))return fail(400,'Referência da tabela de preços inválida.');
    b.lines=b.lines.map(({catalog,...l}:any)=>catalog?{...l,catalog:{brand:catalog.brand,ref:catalog.ref,price:catalog.price,discount:catalog.discount}}:l);
    if(b.brand!==undefined&&(typeof b.brand!=='string'||b.brand.length>200))return fail(400,'Marca inválida.');
    b.brand=(b.brand||'').trim();
    // The client email is optional; when present it must look like a real address.
    if(b.email!==undefined&&(typeof b.email!=='string'||b.email.length>320))return fail(400,'Email inválido.');
    b.email=(b.email||'').trim();
    if(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))return fail(400,'Indique um email válido ou deixe o campo vazio.');
    if(b.locality!==undefined&&(typeof b.locality!=='string'||b.locality.length>2000))return fail(400,'Morada inválida.');
    // Accept older clients while storing a single address in new documents.
    b.address=[b.address,b.locality].filter(Boolean).join(', ');
    if(b.address.length>4000)return fail(400,'Morada demasiado longa.');
    const document=Object.fromEntries([...fields,'email','topics','brand','lines','margin','vat'].map(k=>[k,b[k]]));
    const rows=match?await db.update(quotes).set({document,updatedAt:new Date()}).where(eq(quotes.id,Number(match[1]))).returning():await db.insert(quotes).values({document}).returning();
    return rows.length?Response.json(rows[0],{status:match?200:201}):fail(404,'Orçamento não encontrado.');
  }catch(error){return fail(error instanceof SyntaxError?400:503,error instanceof SyntaxError?'Dados inválidos.':'Não foi possível aceder aos orçamentos. Tente novamente.');}
}
