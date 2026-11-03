/** Proteções do anfitrião contra mensagens a mais, malformadas ou enormes (lógica pura, com testes). */

/** Máximo de alunos por sessão (o servidor aplica o mesmo limite em `join_session`). */
export const MAX_PLAYERS = 60;
/** Tamanho máximo (JSON) do valor de uma resposta. */
export const MAX_ANSWER_CHARS = 1500;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const isId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);

/** Id do aluno que envia a mensagem (só dos eventos que os alunos enviam), ou null se for inválida. */
export function senderOf(m: unknown): string | null {
  if (!m || typeof m !== 'object') return null;
  const { event, payload } = m as { event?: unknown; payload?: unknown };
  if (event !== 'hello' && event !== 'vote' && event !== 'answer' && event !== 'leave') return null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const id = (payload as { player_id?: unknown }).player_id;
  return isId(id) ? id : null;
}

/** O valor é JSON pequeno? (Evita payloads enormes ou ciclos.) */
export function answerSizeOk(value: unknown): boolean {
  try {
    const s = JSON.stringify(value);
    return s === undefined || s.length <= MAX_ANSWER_CHARS;
  } catch {
    return false;
  }
}

/** Balde de fichas por chave: aguenta uma rajada pequena e depois só deixa passar `perSec` mensagens/s. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; t: number }>();
  constructor(
    private capacity: number,
    private perSec: number,
    private maxKeys = 500,
  ) {}

  allow(key: string, nowMs: number): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
      b = { tokens: this.capacity, t: nowMs };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + Math.max(0, nowMs - b.t) * (this.perSec / 1000));
    b.t = nowMs;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}
