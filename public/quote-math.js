(function(root){
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function quoteTotals(q){
    const cost=round(q.lines.reduce((s,l)=>s+Number(l.value||0)*Number(l.quantity??1),0));
    const costVat=round(cost*(1+Number(q.vat)/100));
    const net=round(cost/(1-Number(q.margin||0)/100));
    const vat=round(net*Number(q.vat)/100);
    return {cost,costVat,net,vat,total:round(net+vat),profit:round(net-cost),profitVat:round(net+vat-costVat)};
  }
  root.quoteTotals=quoteTotals;
})(globalThis);
