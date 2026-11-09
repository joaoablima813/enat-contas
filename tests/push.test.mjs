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
