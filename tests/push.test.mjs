import test from 'node:test';
import assert from 'node:assert/strict';
import { localMs, dueAlerts } from '../netlify/lib/push.mjs';

test('times typed in the app are read as Lisbon time, summer and winter',()=>{
 assert.equal(new Date(localMs('2026-11-09T14:30')).toISOString(),'2026-11-09T14:30:00.000Z');
 assert.equal(new Date(localMs('2026-07-01T14:30')).toISOString(),'2026-07-01T13:30:00.000Z');
 assert.ok(Number.isNaN(localMs('')));
});
test('push alerts: due calls, visits 30 minutes before and new email leads, never done calls',()=>{
 const now=Date.parse('2026-11-09T14:31:00Z');
 const state={leads:[
  {id:'a',name:'Ana',call:'nao',callAt:'2026-11-09T14:30',contact:'912'},
  {id:'b',name:'Rui',call:'nao',callAt:'2026-11-09T14:30',callDone:'2026-11-09T14:30'},
  {id:'c',name:'Eva',call:'nao',callAt:'2026-11-09T15:30'},
  {id:'d',name:'Visita',visitAt:'2026-11-09T14:50',address:'Ponte de Lima'}],del:{'leads:old':1}};
 const inbox=[{id:'m1',name:'Nova',received:'2026-11-09T14:20:00Z'},{id:'old',name:'X',received:'2026-11-09T14:20:00Z'},{id:'m2',name:'Antiga',received:'2026-11-01T10:00:00Z'}];
 const keys=dueAlerts(state,inbox,now).map(a=>a.key);
 assert.deepEqual(keys,['call|a|2026-11-09T14:30','visit|d|2026-11-09T14:50','lead|m1']);
});

test('own calendar entries: evening before at 18:00 and on the day (30 min before, or 08:00 without time)', () => {
  const state = { agenda: [{ id: 'a1', data: '2026-11-27', hora: '09:00', titulo: 'AC Silva', local: 'Arcozelo' }, { id: 'a2', data: '2026-11-27', titulo: 'Bomba de calor' }, { id: 'a3', data: '2026-11-27', titulo: 'Feita', feito: true }] };
  const at = (s) => localMs(s);
  const keys = (t) => dueAlerts(state, [], t).map((a) => a.key).sort();
  assert.deepEqual(keys(at('2026-11-26T17:59')), []);
  assert.deepEqual(keys(at('2026-11-26T18:05')), ['agv|a1|2026-11-27', 'agv|a2|2026-11-27']);
  assert.deepEqual(keys(at('2026-11-27T08:01')).filter((k) => k.startsWith('ag|')), ['ag|a2|2026-11-27|']);
  assert.ok(keys(at('2026-11-27T08:35')).includes('ag|a1|2026-11-27|09:00'));
  assert.equal(dueAlerts(state, [], at('2026-11-26T18:05'))[0].title, 'Amanhã · Obra: AC Silva');
});
