// Realtime load check with a simulated class on a throwaway channel (no DB writes).
// Run: npx tsx --env-file=.env scripts/rt-load-check.ts [students=30] [rounds=4]
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { channelName } from '../src/lib/protocol';

const N = Number(process.argv[2] ?? 30);
const ROUNDS = Number(process.argv[3] ?? 4);
const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const name = channelName(`load-check-${Date.now()}`);
const mk = () => createClient(url, key, { realtime: { heartbeatIntervalMs: 10_000, params: { eventsPerSecond: 20 } } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sub = (ch: RealtimeChannel, label: string) => new Promise<void>((res, rej) => {
  const t = setTimeout(() => rej(new Error(`subscribe timeout: ${label}`)), 15000);
  ch.subscribe((s, err) => { if (s === 'SUBSCRIBED') { clearTimeout(t); res(); } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); rej(new Error(`${label}: ${s} ${err?.message ?? ''}`)); } });
});

const hostClient = mk();
const host = hostClient.channel(name, { config: { broadcast: { self: false } } });
const answerLat: number[] = [];
let answers = 0;
host.on('broadcast', { event: 'answer' }, (m) => { answers++; answerLat.push(Date.now() - (m.payload as { t: number }).t); });
host.on('broadcast', { event: 'hello' }, () => {});

type S = { id: string; client: ReturnType<typeof mk>; ch: RealtimeChannel; qGot: number; qLat: number[]; rGot: number; status: string[] };
const students: S[] = [];
const t0 = Date.now();
let joinFail = 0;
await sub(host, 'host');
for (let i = 0; i < N; i++) {
  const client = mk();
  const ch = client.channel(name, { config: { broadcast: { self: false } } });
  const s: S = { id: `s${i}`, client, ch, qGot: 0, qLat: [], rGot: 0, status: [] };
  ch.on('broadcast', { event: 'question' }, (m) => { s.qGot++; s.qLat.push(Date.now() - (m.payload as { t: number }).t); void ch.send({ type: 'broadcast', event: 'answer', payload: { player_id: s.id, t: Date.now() } }); });
  ch.on('broadcast', { event: 'reveal' }, () => { s.rGot++; });
  try { await sub(ch, s.id); } catch (e) { joinFail++; s.status.push(String(e)); }
  students.push(s);
}
console.log(`ligados: ${N - joinFail}/${N} em ${Date.now() - t0} ms (falhas de entrada: ${joinFail})`);

const results: string[] = [];
for (let r = 0; r < ROUNDS; r++) {
  const before = answers;
  await host.send({ type: 'broadcast', event: 'question', payload: { t: Date.now(), question_id: `q${r}`, body: 'x'.repeat(600) } });
  const resync = setInterval(() => void host.send({ type: 'broadcast', event: 'question', payload: { t: Date.now(), question_id: `q${r}`, body: 'x'.repeat(600) } }), 2500);
  await sleep(6000);
  clearInterval(resync);
  await host.send({ type: 'broadcast', event: 'reveal', payload: { question_id: `q${r}` } });
  await sleep(1500);
  results.push(`ronda ${r + 1}: respostas recebidas pelo anfitrião ${answers - before}/${N}`);
}
const all = students.flatMap((s) => s.qLat).sort((a, b) => a - b);
const pct = (a: number[], p: number) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
const al = [...answerLat].sort((a, b) => a - b);
console.log(results.join('\n'));
console.log(`pergunta -> alunos: ${all.length} receções; latência p50 ${pct(all, 0.5)} ms, p95 ${pct(all, 0.95)} ms, máx ${all[all.length - 1]} ms`);
console.log(`resposta -> anfitrião: p50 ${pct(al, 0.5)} ms, p95 ${pct(al, 0.95)} ms, máx ${al[al.length - 1]} ms`);
console.log(`alunos que perderam alguma pergunta (a 1ª emissão de cada ronda conta; há 3 emissões por ronda): ${students.filter((s) => s.qGot < ROUNDS).length}/${N}`);
console.log(`alunos que perderam alguma revelação: ${students.filter((s) => s.rGot < ROUNDS).length}/${N}`);
await hostClient.removeAllChannels();
await Promise.all(students.map((s) => s.client.removeAllChannels()));
process.exit(0);
