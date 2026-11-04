import { raceConfigFor } from '../game/raceSettings';
import { parseTimeline, type GhostRecord } from './ghosts';
import type { Api, Channel } from './api';
import { toSaveShape } from './quizEdit';
import { EVENT_NAMES, channelName, type AnyEvent } from './protocol';
import { supabase } from './supabase';
import type { AnswerRow, ClassRow, JoinResult, PlayerRow, QuestionRow, QuizRow, RaceRecordRow, RaceSummary, ReviewQuestion, ReviewSession, SaveQuizResult, SessionRow } from './types';

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data;
}

const STALE_SESSION_MS = 12 * 3600_000;
// A sala vem com o seu último jogo (`game` encaixado, ordenado por `number` desc. e limitado a 1 por sala).
const SESSION_COLS = 'id, teacher_id, class_id, pin, created_at, game(id, number, quiz_id, quiz_version, settings, state, status, quiz(title))';
const LATEST_GAME = { referencedTable: 'game' } as const;
type RawGame = Pick<SessionRow, 'quiz_id' | 'quiz_version' | 'settings' | 'state' | 'status'> & { id: string; number: number; quiz: { title: string } | { title: string }[] | null };
type RawSession = Pick<SessionRow, 'id' | 'teacher_id' | 'class_id' | 'pin' | 'created_at'> & { game: RawGame[] };
const toSession = (r: RawSession): SessionRow => {
  const g = r.game[0];
  if (!g) throw new Error('A sala não tem nenhum jogo');
  const q = Array.isArray(g.quiz) ? g.quiz[0] : g.quiz;
  return {
    id: r.id, teacher_id: r.teacher_id, class_id: r.class_id, pin: r.pin, created_at: r.created_at,
    game_id: g.id, game_number: g.number, quiz_id: g.quiz_id, quiz_version: g.quiz_version,
    status: g.status, settings: g.settings, state: g.state, quiz_title: g.settings?.review?.title ?? q?.title ?? '',
  };
};
/** Uma sala pelo id, com o último jogo. */
const sessionById = async (id: string): Promise<SessionRow> =>
  toSession(check(await supabase.from('session').select(SESSION_COLS).eq('id', id).order('number', { ...LATEST_GAME, ascending: false }).limit(1, LATEST_GAME).single()) as unknown as RawSession);

interface RawRace {
  game_id: string;
  created_at: string;
  quiz_id: string;
  quiz_version: number;
  class_id: string | null;
  final_position: number;
  timeline: unknown;
  quiz: { title: string } | { title: string }[] | null;
  class: { name: string } | { name: string }[] | null;
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const avg = (o: { accuracy: number }[]) => (o.length ? o.reduce((s, t) => s + t.accuracy, 0) / o.length : 0);
const toRace = (r: RawRace): RaceSummary => ({
  game_id: r.game_id, created_at: r.created_at, quiz_id: r.quiz_id, quiz_title: one(r.quiz)?.title ?? '', quiz_version: r.quiz_version,
  class_id: r.class_id, class_name: one(r.class)?.name ?? null, final_position: r.final_position,
  avg_accuracy: avg(parseTimeline(r.timeline).outcomes),
});

export const supabaseApi: Api = {
  mock: false,

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async checkTeacher() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return { ok: false, reason: 'anon' };
    const res = await supabase.from('teacher').select('id, name').eq('id', user.id).maybeSingle();
    if (res.error || !res.data) return { ok: false, reason: 'noaccess' };
    return { ok: true, id: res.data.id as string, name: res.data.name as string };
  },

  async listQuizzes() {
    const quizzes = check(await supabase.from('quiz').select('id, title, year, topic, version').is('archived_at', null).order('created_at', { ascending: true })) as Omit<QuizRow, 'questionCount' | 'lastPlayed'>[];
    const questions = check(await supabase.from('question').select('quiz_id, version')) as { quiz_id: string; version: number }[];
    const records = check(await supabase.from('race_record').select('quiz_id, created_at')) as { quiz_id: string; created_at: string }[];
    return quizzes.map((q): QuizRow => ({
      ...q,
      questionCount: questions.filter((x) => x.quiz_id === q.id && x.version === q.version).length,
      lastPlayed: records.filter((r) => r.quiz_id === q.id).reduce<string | null>((m, r) => (!m || r.created_at > m ? r.created_at : m), null),
    }));
  },
  async getQuiz(id) {
    const q = check(await supabase.from('quiz').select('id, title, year, topic, version').eq('id', id).single()) as Omit<QuizRow, 'questionCount' | 'lastPlayed'>;
    const questions = await supabaseApi.loadQuestions(id, q.version);
    return { quiz: { ...q, questionCount: questions.length, lastPlayed: null }, questions };
  },
  async createQuiz(title, year, topic) {
    const { data } = await supabase.auth.getSession();
    const q = check(await supabase.from('quiz').insert({ teacher_id: data.session?.user.id, title, year, topic }).select('id, title, year, topic, version').single()) as Omit<QuizRow, 'questionCount' | 'lastPlayed'>;
    return { ...q, questionCount: 0, lastPlayed: null };
  },
  async saveQuiz(quiz) {
    const res = await supabase.rpc('save_quiz', {
      p_quiz_id: quiz.id,
      p_title: quiz.title,
      p_year: quiz.year,
      p_topic: quiz.topic,
      p_questions: quiz.questions.map(toSaveShape),
    });
    return check(res) as SaveQuizResult;
  },
  async duplicateQuiz(id) {
    const { quiz, questions } = await supabaseApi.getQuiz(id);
    const copy = await supabaseApi.createQuiz(`${quiz.title} (cópia)`, quiz.year, quiz.topic);
    await supabaseApi.saveQuiz({ id: copy.id, title: copy.title, year: copy.year, topic: copy.topic, questions: questions.map((q) => ({ ...q, id: crypto.randomUUID() })) });
    return { ...copy, questionCount: questions.length };
  },
  async deleteQuiz(id) {
    const res = await supabase.from('quiz').delete().eq('id', id);
    if (!res.error) return 'deleted';
    if (res.error.code !== '23503') throw new Error(res.error.message);
    check(await supabase.from('quiz').update({ archived_at: new Date().toISOString() }).eq('id', id));
    return 'archived';
  },
  async listRaces(filter) {
    let q = supabase.from('race_record').select('game_id, created_at, quiz_id, quiz_version, class_id, final_position, timeline, quiz(title), class(name)').order('created_at', { ascending: false });
    if (filter?.classId) q = q.eq('class_id', filter.classId);
    if (filter?.quizId) q = q.eq('quiz_id', filter.quizId);
    return (check(await q) as unknown as RawRace[]).map(toRace);
  },
  async loadReport(gameId) {
    const g = check(await supabase.from('game').select('id, session_id, quiz_id, quiz_version, settings, state').eq('id', gameId).single()) as unknown as Pick<RawGame, 'quiz_id' | 'quiz_version' | 'settings' | 'state'> & { id: string; session_id: string };
    const rec = check(
      await supabase.from('race_record').select('game_id, created_at, quiz_id, quiz_version, class_id, final_position, timeline, quiz(title), class(name)').eq('game_id', gameId).maybeSingle(),
    ) as unknown as RawRace | null;
    const [questions, answers, players] = await Promise.all([g.settings?.review ? supabaseApi.loadQuestionsByIds(g.settings.review.questionIds) : supabaseApi.loadQuestions(g.quiz_id, g.quiz_version), supabaseApi.loadAnswers(gameId), supabaseApi.listPlayers(g.session_id)]);
    // Só as perguntas que a corrida usou (as definições do jogo podem deixar algumas de fora).
    // Alunos: os que alinharam à partida (gravado no estado); nos jogos antigos, os da sala.
    return { race: rec ? toRace(rec) : null, questions: questions.slice(0, raceConfigFor(questions, g.settings).used), answers, playerCount: g.state?.players ?? players.filter((p) => !p.kicked && !p.left).length };
  },
  async listClasses() {
    return check(await supabase.from('class').select('id, name, year').order('name')) as ClassRow[];
  },
  async updateClass(id, name, year) {
    return check(await supabase.from('class').update({ name, year }).eq('id', id).select('id, name, year').single()) as ClassRow;
  },
  async deleteClass(id) {
    check(await supabase.from('class').delete().eq('id', id));
  },
  async createClass(name, year) {
    const { data } = await supabase.auth.getSession();
    const row = check(await supabase.from('class').insert({ teacher_id: data.session?.user.id, name, year }).select('id, name, year').single());
    return row as ClassRow;
  },
  async listOpenSessions() {
    // Limpeza: sessões esquecidas em lobby/running há mais de 12 h libertam o PIN.
    const cutoff = new Date(Date.now() - STALE_SESSION_MS).toISOString();
    // (o estado da sala acompanha o do jogo: trigger na base de dados)
    await supabase.from('game').update({ status: 'aborted', finished_at: new Date().toISOString() }).in('status', ['lobby', 'running']).lt('created_at', cutoff);
    const rows = check(await supabase.from('session').select(SESSION_COLS).in('status', ['lobby', 'running']).order('created_at', { ascending: false }).order('number', { ...LATEST_GAME, ascending: false }).limit(1, LATEST_GAME));
    return (rows as unknown as RawSession[]).map(toSession);
  },
  async abortSession(id) {
    check(await supabase.from('game').update({ status: 'aborted', finished_at: new Date().toISOString() }).eq('session_id', id).in('status', ['lobby', 'running']));
  },
  async createSession(quiz, classId, settings) {
    const { data } = await supabase.auth.getSession();
    const teacher_id = data.session?.user.id;
    for (let attempt = 0; attempt < 12; attempt++) {
      const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      const res = await supabase.from('session').insert({ teacher_id, class_id: classId, pin }).select('id').single();
      if (res.error?.code === '23505') continue; // PIN já em uso numa sala ativa
      const { id } = check(res) as { id: string };
      const game = await supabase.from('game').insert({ session_id: id, number: 1, quiz_id: quiz.id, quiz_version: quiz.version, settings });
      if (game.error) {
        await supabase.from('session').delete().eq('id', id); // não deixa uma sala vazia a segurar o PIN
        throw new Error(game.error.message);
      }
      return sessionById(id);
    }
    throw new Error('Não consegui gerar um PIN livre. Tenta outra vez.');
  },
  async createGame(sessionId, quiz, settings) {
    const cur = await sessionById(sessionId);
    if (cur.status === 'lobby' || cur.status === 'running') throw new Error('O jogo anterior ainda não terminou.');
    // Ao entrar em lobby a sala volta a reservar o PIN (trigger): se entretanto outra sala o ocupou, falha aqui.
    const res = await supabase.from('game').insert({ session_id: sessionId, number: cur.game_number + 1, quiz_id: quiz.id, quiz_version: quiz.version, settings });
    if (res.error?.code === '23505') throw new Error('O PIN desta sala já foi ocupado por outra. Abre uma sala nova.');
    check(res);
    return sessionById(sessionId);
  },
  async getSession(id) {
    return sessionById(id);
  },
  async loadQuestions(quizId, version) {
    const rows = check(
      await supabase.from('question').select('id, position, type, prompt, payload, correct, time_limit, explanation').eq('quiz_id', quizId).eq('version', version).order('position'),
    );
    return rows as unknown as QuestionRow[];
  },
  async loadQuestionsByIds(ids) {
    if (!ids.length) return [];
    type Raw = QuestionRow & { quiz_id: string; version: number; quiz: { title: string; archived_at: string | null } | { title: string; archived_at: string | null }[] | null };
    const rows: Raw[] = [];
    for (let i = 0; i < ids.length; i += 80) { // ids no URL: em blocos
      rows.push(...(check(await supabase.from('question').select('id, position, type, prompt, payload, correct, time_limit, explanation, quiz_id, version, quiz(title, archived_at)').in('id', ids.slice(i, i + 80))) as unknown as Raw[]));
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id): ReviewQuestion[] => {
      const r = byId.get(id);
      if (!r) return [];
      const { quiz, version, ...q } = r;
      const qz = one(quiz);
      return [{ ...q, quiz_version: version, quiz_title: qz?.title ?? '', archived: !!qz?.archived_at } as ReviewQuestion];
    });
  },
  async loadReviewPool({ classId, quizIds, sessions }) {
    // Os jogos terminados da turma (cada jogo conta como uma sessão, mesmo na mesma sala).
    let q = supabase.from('game').select('id, created_at, status, quiz_id, settings, quiz(title), session!inner(class_id)').eq('status', 'finished').eq('session.class_id', classId).order('created_at', { ascending: false }).limit(sessions);
    if (quizIds?.length) q = q.in('quiz_id', quizIds);
    const rows = check(await q) as unknown as { id: string; created_at: string; status: ReviewSession['status']; quiz_id: string; settings: SessionRow['settings']; quiz: { title: string } | { title: string }[] | null }[];
    const out: ReviewSession[] = rows.map((r) => ({ id: r.id, created_at: r.created_at, status: r.status, quiz_id: r.quiz_id, quiz_title: r.settings?.review?.title ?? one(r.quiz)?.title ?? '', review: !!r.settings?.review, answers: [] }));
    // O PostgREST devolve no máximo 1000 linhas por pedido: pagina.
    const bySession = new Map(out.map((s) => [s.id, s]));
    for (let from = 0; out.length; from += 1000) {
      const page = check(
        await supabase.from('answer').select('game_id, question_id, player_id, value, correct, ms_taken').in('game_id', out.map((s) => s.id)).order('id').range(from, from + 999),
      ) as AnswerRow[];
      for (const a of page) bySession.get(a.game_id)?.answers.push(a);
      if (page.length < 1000) break;
    }
    const qids = [...new Set(out.flatMap((s) => s.answers.map((a) => a.question_id)))];
    return { sessions: out, questions: await supabaseApi.loadQuestionsByIds(qids) };
  },
  async listPlayers(sessionId) {
    return check(await supabase.from('player').select('id, nickname, kicked, left').eq('session_id', sessionId).order('joined_at')) as PlayerRow[];
  },
  async kickPlayer(playerId) {
    check(await supabase.from('player').update({ kicked: true }).eq('id', playerId));
  },
  async renamePlayer(playerId, nickname) {
    return check(await supabase.rpc('rename_player', { p_player_id: playerId, p_nickname: nickname })) as string;
  },
  async removePlayer(playerId) {
    check(await supabase.from('player').delete().eq('id', playerId));
  },
  async leavePlayer(playerId) {
    check(await supabase.from('player').update({ left: true }).eq('id', playerId));
  },
  async saveAnswers(rows: AnswerRow[]) {
    if (!rows.length) return;
    check(await supabase.from('answer').upsert(rows, { onConflict: 'game_id,player_id,question_id' }));
  },
  async loadAnswers(gameId) {
    return check(await supabase.from('answer').select('game_id, question_id, player_id, value, correct, ms_taken').eq('game_id', gameId)) as AnswerRow[];
  },
  async updateGame(id, patch) {
    const upd: Record<string, unknown> = {};
    if (patch.status) upd.status = patch.status;
    if (patch.state !== undefined) upd.state = patch.state;
    if (patch.started) upd.started_at = new Date().toISOString();
    if (patch.finished) upd.finished_at = new Date().toISOString();
    check(await supabase.from('game').update(upd).eq('id', id));
  },
  async saveRaceRecord(row: RaceRecordRow) {
    const { data } = await supabase.auth.getSession();
    check(await supabase.from('race_record').upsert({ ...row, teacher_id: data.session?.user.id }, { onConflict: 'game_id' }));
  },

  async listGhostRecords(quizId, version) {
    const rows = check(
      await supabase.from('race_record').select('game_id, created_at, class_id, final_position, finish_time_ms, timeline, class(name)').eq('quiz_id', quizId).eq('quiz_version', version).order('created_at', { ascending: false }),
    ) as unknown as { game_id: string; created_at: string; class_id: string | null; final_position: number; finish_time_ms: number; timeline: unknown; class: { name: string } | { name: string }[] | null }[];
    return rows.flatMap((r): GhostRecord[] => {
      const t = parseTimeline(r.timeline);
      if (!t.trackId || !t.config) return [];
      return [{ game_id: r.game_id, class_id: r.class_id, class_name: one(r.class)?.name ?? null, created_at: r.created_at, final_position: r.final_position, finish_time_ms: r.finish_time_ms, trackId: t.trackId, config: t.config, outcomes: t.outcomes }];
    });
  },

  async joinSession(pin, nickname, deviceToken) {
    const res = await supabase.rpc('join_session', { p_pin: pin, p_nickname: nickname, p_device_token: deviceToken });
    const data = check(res) as JoinResult | { error: string };
    // PIN errado não lança erro no servidor (para o registo da tentativa não ser desfeito).
    if ('error' in data) throw new Error(data.error);
    return data;
  },

  openChannel(sessionId, onMessage, onStatus) {
    const ch = supabase.channel(channelName(sessionId), { config: { broadcast: { self: false, ack: false } } });
    for (const event of EVENT_NAMES) {
      ch.on('broadcast', { event }, (m) => onMessage({ event, payload: m.payload } as AnyEvent));
    }
    let ready = false;
    ch.subscribe((status) => {
      ready = status === 'SUBSCRIBED';
      onStatus?.(ready);
    });
    const channel: Channel = {
      send(msg) {
        if (!ready) return;
        void ch.send({ type: 'broadcast', event: msg.event, payload: msg.payload });
      },
      close() {
        ready = false;
        void supabase.removeChannel(ch);
      },
    };
    return channel;
  },
};
