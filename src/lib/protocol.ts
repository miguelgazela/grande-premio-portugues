import type { Effect } from '../engine/race';
import type { StyleVote, TeamStyle } from '../game/teamStyle';
import type { AnswerValue } from './types';

/** Material de uma pergunta tal como os alunos (e o projetor) o veem: nunca inclui a resposta certa. */
export type PublicBody =
  | { type: 'multiple_choice'; options: string[] }
  | { type: 'true_false' }
  /** `words` = frase tokenizada; o aluno devolve os índices. */
  | { type: 'tap_word'; words: string[] }
  /** `items` já baralhados; o aluno devolve os índices pela ordem que escolheu. */
  | { type: 'order'; items: string[] }
  /** `text` com `___` nas lacunas; `options` (baralhadas) só quando é para escolher. */
  | { type: 'complete'; text: string; options?: string[] }
  | { type: 'excerpt'; excerpt: string; options: string[] }
  /** `right` baralhado; o aluno devolve, para cada `left[i]`, o índice escolhido em `right` (-1 = por ligar). */
  | { type: 'match'; left: string[]; right: string[] };

export interface PublicQuestion {
  question_id: string;
  index: number;
  total: number;
  prompt: string;
  body: PublicBody;
  /** Segundos que faltam para fechar. */
  time: number;
}

/** A solução, só enviada na revelação. */
export type Solution =
  | { type: 'multiple_choice' | 'excerpt'; index: number }
  | { type: 'true_false'; value: boolean }
  | { type: 'tap_word'; indices: number[] }
  /** Itens pela ordem certa (texto). */
  | { type: 'order'; items: string[] }
  /** Uma resposta (a principal) por lacuna. */
  | { type: 'complete'; answers: string[] }
  | { type: 'match'; pairs: [string, string][] };

export interface RevealMsg {
  question_id: string;
  solution: Solution;
  explanation: string | null;
  /** Quota de alunos que acertou, 0..1. */
  accuracy: number;
  effect: Effect;
  nitro: boolean;
  rank: number;
  cars: number;
  /** Respostas certas (player_id → acertou). */
  results: Record<string, boolean>;
  /** Crédito parcial (0–1) só para quem não acertou por inteiro mas teve alguma parte certa. */
  partial?: Record<string, number>;
}

export interface PlayerSummary {
  points: number;
  correct: number;
  answered: number;
  bestStreak: number;
  /** Está no top 5 (só se mostra a quem lá está). */
  top: boolean;
}

export interface FinalStanding {
  name: string;
  kind: 'team' | 'bot' | 'ghost';
  color: number;
  timeMs: number;
}

export interface FinalInfo {
  standings: FinalStanding[];
  ranking: { nickname: string; points: number; correct: number; avatar?: string }[];
  awards: { emoji: string; title: string; nickname: string; detail: string }[];
  teamPosition: number;
  /** Carro da turma (chave do manifest), para o ecrã final. */
  teamCar?: string;
  totalQuestions: number;
  /** Contra o fantasma mais relevante. `diffMs` > 0: a turma ganhou. */
  ghost?: { name: string; diffMs: number };
  /** Recorde da pista (entre as corridas da professora). */
  record?: { holder: string | null; bestMs: number | null; newRecord: boolean; gapMs: number };
}

export interface EndMsg {
  final: FinalInfo;
  players: Record<string, PlayerSummary>;
}

/** Anfitrião → alunos. */
export type HostEvent =
  | { event: 'lobby'; payload: { count: number; /** Aspeto atual do carro da turma. */ team?: TeamStyle } }
  | { event: 'question'; payload: PublicQuestion }
  | { event: 'reveal'; payload: RevealMsg }
  | { event: 'end'; payload: EndMsg }
  | { event: 'kicked'; payload: { player_id: string } }
  /** A professora terminou a sessão a meio. */
  | { event: 'aborted'; payload: Record<string, never> };

/** Aluno → anfitrião. */
export type StudentEvent =
  | { event: 'hello'; payload: { player_id: string; /** Chave do manifest, ex. `avatar-fox`. */ avatar?: string } }
  /** Voto no aspeto do carro da turma (lobby). */
  | { event: 'vote'; payload: { player_id: string } & StyleVote }
  | { event: 'answer'; payload: { player_id: string; question_id: string; value: AnswerValue } }
  /** O aluno saiu da sessão pelo botão "Sair". */
  | { event: 'leave'; payload: { player_id: string } };

export type AnyEvent = HostEvent | StudentEvent;

/**
 * Todas as mensagens do canal. O Realtime do Supabase só entrega as mensagens cujo nome foi registado,
 * por isso esta lista tem de as ter todas: o `satisfies` abaixo falha a compilar se faltar alguma.
 */
export const EVENT_NAMES = ['lobby', 'question', 'reveal', 'end', 'kicked', 'aborted', 'hello', 'vote', 'answer', 'leave'] as const satisfies readonly AnyEvent['event'][];
type MissingEvents = Exclude<AnyEvent['event'], (typeof EVENT_NAMES)[number]>;
export const _allEventsListed: [MissingEvents] extends [never] ? true : never = true;

export const channelName = (sessionId: string) => `corrida:${sessionId}`;
