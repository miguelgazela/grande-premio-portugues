import type { Effect } from '../engine/race';

/** Pergunta tal como os alunos a veem: nunca inclui a resposta certa. */
export interface PublicQuestion {
  question_id: string;
  index: number;
  total: number;
  prompt: string;
  options: string[];
  /** Segundos que faltam para fechar. */
  time: number;
}

export interface RevealMsg {
  question_id: string;
  correct_index: number;
  explanation: string | null;
  /** Quota de alunos que acertou, 0..1. */
  accuracy: number;
  effect: Effect;
  nitro: boolean;
  rank: number;
  cars: number;
  /** Respostas certas (player_id → acertou). */
  results: Record<string, boolean>;
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
  totalQuestions: number;
}

export interface EndMsg {
  final: FinalInfo;
  players: Record<string, PlayerSummary>;
}

/** Anfitrião → alunos. */
export type HostEvent =
  | { event: 'lobby'; payload: { count: number } }
  | { event: 'question'; payload: PublicQuestion }
  | { event: 'reveal'; payload: RevealMsg }
  | { event: 'end'; payload: EndMsg }
  | { event: 'kicked'; payload: { player_id: string } };

/** Aluno → anfitrião. */
export type StudentEvent =
  | { event: 'hello'; payload: { player_id: string; /** Chave do manifest, ex. `avatar-fox`. */ avatar?: string } }
  | { event: 'answer'; payload: { player_id: string; question_id: string; value: number } };

export type AnyEvent = HostEvent | StudentEvent;

export const channelName = (sessionId: string) => `corrida:${sessionId}`;
