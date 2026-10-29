(function(root){
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  function quoteTotals(q){
    const rate=Number(q.vat)/100;
    const cost=round(q.lines.reduce((s,l)=>s+Number(l.value||0)*Number(l.quantity??1),0));
    const costVat=round(cost*(1+rate));
    // The profit margin is added on top of the cost including VAT.
    const total=round(costVat*(1+Number(q.margin||0)/100));
    const net=round(total/(1+rate));
    return {cost,costVat,net,vat:round(total-net),total,profit:round(net-cost),profitVat:round(total-costVat)};
  }
  root.quoteTotals=quoteTotals;
  // Bank account shown in the quote PDF and in payment reminders.
  root.ENAT_IBAN='PT50 0007 0000 0088 6037 7712 3';
})(globalThis);
