import test from 'node:test';
import assert from 'node:assert/strict';
import { sugestoes, isolamento } from '../netlify/lib/sugestoes.mjs';

const pick = (r, titulo) => sugestoes(r).find((s) => s.titulo === titulo);

test('air conditioning: one machine per room in kW and BTU, plus the multisplit option', () => {
  const s = pick({ sol: ['Ar condicionado'], a: { ac_div: '2', ac_rooms: [{ t: 'Sala', m2: 30 }, { t: 'Quarto', m2: 12 }], ano: 'Depois de 2015' } }, 'Ar condicionado');
  assert.match(s.linhas[0], /^Sala \(30 m²\): [\d,]+ kW · [\d ]+ BTU$/);
  assert.match(s.linhas[1], /^Quarto \(12 m²\)/);
  assert.ok(s.linhas.some((l) => /multisplit: 1 exterior de [\d,]+ kW com \d saídas/.test(l)));
  assert.match(s.nota, /isolamento bom/);
});

test('heat pump: older house with single glazing needs more power; radiators decide the water temperature', () => {
  assert.equal(isolamento({ ano: 'Antes de 1990', jan: 'Vidro simples' }), 'fraco');
  assert.equal(isolamento({ ano: 'Depois de 2015' }), 'bom');
  const base = { sol: ['Bomba de calor climatização'], a: { m2: 120, bcc_emis: 'Radiadores', ano: '2006 a 2015', jan: 'Vidro duplo' } };
  const enough = pick({ ...base, a: { ...base.a, bcc_rad: 12, bcc_elem: 14 } }, 'Bomba de calor (aquecimento)');
  assert.match(enough.linhas[0], /^Bomba de calor de \d+ kW/);
  assert.ok(enough.linhas.some((l) => /média temperatura/.test(l)), enough.linhas.join(' | '));
  const few = pick({ ...base, a: { ...base.a, bcc_rad: 4, bcc_elem: 6 } }, 'Bomba de calor (aquecimento)');
  assert.ok(few.linhas.some((l) => /Mesmo a 75 °C|alta temperatura/.test(l)), few.linhas.join(' | '));
  const none = pick(base, 'Bomba de calor (aquecimento)');
  assert.match(none.nota, /Sem o número de radiadores/);
});

test('other technologies get a first sizing; missing answers give no made-up figures', () => {
  const all = sugestoes({ sol: ['Bomba de calor AQS', 'Painéis fotovoltaicos', 'Carregador automóvel'], a: { pessoas: '3 a 4', pv_fat: '50 a 100 €', fase: 'Trifásica', car_dist: 'Até 10 m' } });
  assert.match(all.find((s) => s.titulo === 'Bomba de calor AQS').linhas[0], /Depósito de 200 L/);
  assert.match(all.find((s) => s.titulo === 'Fotovoltaico').linhas[0], /kWp: \d+ painéis de 450 W/);
  assert.match(all.find((s) => s.titulo === 'Carregador').linhas[0], /11 kW trifásico/);
  assert.deepEqual(sugestoes({ sol: ['Bomba de calor climatização', 'VMC'], a: {} }), []);
});
