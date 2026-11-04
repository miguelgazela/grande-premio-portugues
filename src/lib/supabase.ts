import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const SCHEMA = 'grandePremioPortugues';

export const supabase = createClient(url ?? 'http://invalid.local', key ?? 'missing', {
  db: { schema: SCHEMA },
  // Heartbeat mais curto (omissão 25 s): deteta mais cedo uma ligação morta no Safari/iOS e religa.
  realtime: { heartbeatIntervalMs: 10_000 },
  auth: { persistSession: true, autoRefreshToken: true },
});

export const configured = Boolean(url && key);
