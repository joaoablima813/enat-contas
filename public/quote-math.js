(function(root){
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function quoteTotals(q){
    const cost=round(q.lines.reduce((s,l)=>s+Number(l.value||0),0));
    const net=round(cost/(1-Number(q.margin||0)/100));
    const vat=round(net*Number(q.vat)/100);
    return {cost,net,vat,total:round(net+vat),profit:round(net-cost)};
  }
  root.quoteTotals=quoteTotals;
})(globalThis);
