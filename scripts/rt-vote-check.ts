// Real Realtime check: a student's `vote` must reach the host. Run: npx tsx --env-file=.env scripts/rt-vote-check.ts
import { createClient } from '@supabase/supabase-js';
import { EVENT_NAMES, channelName } from '../src/lib/protocol';

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const name = channelName(`vote-check-${Date.now()}`);
const mk = () => createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } });
const host = mk(), student = mk();

const got: string[] = [];
const hch = host.channel(name, { config: { broadcast: { self: false } } });
for (const event of EVENT_NAMES) hch.on('broadcast', { event }, (m) => got.push(`${event}:${JSON.stringify(m.payload)}`));
const sch = student.channel(name, { config: { broadcast: { self: false } } });

const sub = (ch: ReturnType<typeof host.channel>) => new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error('subscribe timeout')), 10000); ch.subscribe((s) => { if (s === 'SUBSCRIBED') { clearTimeout(t); res(); } }); });
await sub(hch); await sub(sch);
await sch.send({ type: 'broadcast', event: 'vote', payload: { player_id: 'p1', car: 'car-van-yellow' } });
await new Promise((r) => setTimeout(r, 1500));
console.log(got.length ? `OK, o anfitrião recebeu: ${got.join(' | ')}` : 'FALHOU: o anfitrião não recebeu nada');
await host.removeAllChannels(); await student.removeAllChannels();
process.exit(got.length ? 0 : 1);
