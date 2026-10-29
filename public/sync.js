/* Sincronização entre dispositivos: cada obra, movimento, fatura e lead alterada fica com a hora da alteração (u)
   e cada item apagado fica registado em del. Assim, duas versões editadas ao mesmo tempo juntam-se sem perder nada. */
(function(root){
 const KEYS=['obras','tx','inv','leads'],KEEP=90*864e5;
 const body=x=>{const {u,...r}=x;return JSON.stringify(r)};
 // Fotografia do estado: chave "coleção:id" com o conteúdo de cada item.
 function snap(S){const m={};for(const k of KEYS)for(const x of S[k]||[])m[k+':'+x.id]=body(x);return m}
 // Compara com a última fotografia: itens novos ou alterados recebem a hora; itens que desapareceram ficam em del.
 function stamp(S,last,now=Date.now()){
  S.del=S.del||{};const next=snap(S);
  for(const k of KEYS)for(const x of S[k]||[]){const key=k+':'+x.id;if(last&&last[key]!==next[key])x.u=now;delete S.del[key]}
  if(last)for(const key of Object.keys(last))if(!(key in next))S.del[key]=now;
  for(const [key,t] of Object.entries(S.del))if(now-t>KEEP)delete S.del[key];
  return snap(S);
 }
 // Junta a versão local (L) com a do servidor (R): por item fica a alteração mais recente; apagar só ganha a edições anteriores.
 function merge(L,R){
  const del={...(R.del||{})};for(const [k,t] of Object.entries(L.del||{}))del[k]=Math.max(del[k]||0,t);
  const out={...((L.ts||0)>=(R.ts||0)?R:L),...((L.ts||0)>=(R.ts||0)?L:R),del};
  for(const k of KEYS){
   const m=new Map();for(const x of R[k]||[])m.set(x.id,x);
   for(const x of L[k]||[]){const y=m.get(x.id);if(!y||(x.u||0)>=(y.u||0))m.set(x.id,x)}
   out[k]=[...m.values()].filter(x=>!((del[k+':'+x.id]||0)>(x.u||0)));
  }
  return out;
 }
 root.EnatSync={snap,stamp,merge};
})(globalThis);
