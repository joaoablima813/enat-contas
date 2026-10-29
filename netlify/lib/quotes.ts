import { db } from '../../db/index.js';
import { quotes, quoteEvents } from '../../db/schema.js';
import { asc, desc, eq, and, isNull } from 'drizzle-orm';
const fail=(status:number,error:string)=>Response.json({error},{status});
export async function handleQuotes(req:Request,path:string){
  try {
    // Each quote comes with its follow-up: sent, opened, PDF opened and the client's answers.
    if(path==='orcamentos' && req.method==='GET'){
      const [rows,events]=await Promise.all([db.select().from(quotes).orderBy(desc(quotes.id)),db.select().from(quoteEvents).orderBy(asc(quoteEvents.id))]);
      const by=new Map<number,any[]>();
      for(const e of events){if(!by.has(e.quoteId))by.set(e.quoteId,[]);by.get(e.quoteId)!.push({id:e.id,kind:e.kind,note:e.note,at:e.createdAt,read:Boolean(e.readAt)})}
      return Response.json(rows.map(r=>({...r,events:by.get(r.id)||[]})));
    }
    // The user has seen the client's new answers.
    const read=path.match(/^orcamentos\/(\d+)\/lido$/);
    if(read&&req.method==='POST'){await db.update(quoteEvents).set({readAt:new Date()}).where(and(eq(quoteEvents.quoteId,Number(read[1])),isNull(quoteEvents.readAt)));return Response.json({ok:true})}
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
    // The optional PV sizing keeps its inputs and the figures shown in the PDF.
    if(b.pv!==undefined&&b.pv!==null&&(typeof b.pv!=='object'||Array.isArray(b.pv)||JSON.stringify(b.pv).length>30000))return fail(400,'Dimensionamento fotovoltaico inválido.');
    // Follow-up: status, validity in days and the job created from an accepted quote.
    if(b.status!==undefined&&!['rascunho','enviado','aceite','recusado'].includes(b.status))return fail(400,'Estado do orçamento inválido.');
    if(b.validity!==undefined&&(!Number.isInteger(b.validity)||b.validity<1||b.validity>365))return fail(400,'Indique uma validade entre 1 e 365 dias.');
    if(b.obra!==undefined&&(typeof b.obra!=='string'||b.obra.length>40))return fail(400,'Obra inválida.');
    const extra=['status','validity','obra'].filter(k=>b[k]!==undefined&&b[k]!=='');
    const document:any=Object.fromEntries([...fields,'email','topics','brand','lines','margin','vat',...(b.pv?['pv']:[]),...extra].map(k=>[k,b[k]]));
    if(match){
      // The client may have answered while this copy was open: their status and the job created from it are kept.
      const [cur]=await db.select().from(quotes).where(eq(quotes.id,Number(match[1])));
      const old:any=cur?.document||{};
      if(old.clientAt){document.clientAt=old.clientAt;if(b.clientAt!==old.clientAt){for(const k of ['status','obra'])if(old[k]!==undefined)document[k]=old[k];else delete document[k]}}
      if(!document.obra&&old.obra)document.obra=old.obra;
    }
    const rows=match?await db.update(quotes).set({document,updatedAt:new Date()}).where(eq(quotes.id,Number(match[1]))).returning():await db.insert(quotes).values({document}).returning();
    return rows.length?Response.json(rows[0],{status:match?200:201}):fail(404,'Orçamento não encontrado.');
  }catch(error){return fail(error instanceof SyntaxError?400:503,error instanceof SyntaxError?'Dados inválidos.':'Não foi possível aceder aos orçamentos. Tente novamente.');}
}
