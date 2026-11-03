import { raceConfigFor } from '../game/raceSettings';
import type { Api, Channel } from './api';
import { channelName, type AnyEvent } from './protocol';
import { supabase } from './supabase';
import type { AnswerRow, ClassRow, JoinResult, PlayerRow, QuestionRow, QuizRow, RaceRecordRow, RaceSummary, SaveQuizResult, SessionRow } from './types';

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data;
}

const STALE_SESSION_MS = 12 * 3600_000;
const SESSION_COLS = 'id, teacher_id, quiz_id, quiz_version, class_id, pin, status, settings, state, quiz(title)';
type RawSession = Omit<SessionRow, 'quiz_title'> & { quiz: { title: string } | { title: string }[] | null };
const toSession = (r: RawSession): SessionRow => {
  const q = Array.isArray(r.quiz) ? r.quiz[0] : r.quiz;
  const { quiz: _quiz, ...rest } = r;
  return { ...rest, quiz_title: q?.title ?? '' };
};

interface RawRace {
  session_id: string;
  created_at: string;
  quiz_id: string;
  quiz_version: number;
  class_id: string | null;
  final_position: number;
  timeline: { accuracy: number }[];
  quiz: { title: string } | { title: string }[] | null;
  class: { name: string } | { name: string }[] | null;
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const toRace = (r: RawRace): RaceSummary => ({
  session_id: r.session_id, created_at: r.created_at, quiz_id: r.quiz_id, quiz_title: one(r.quiz)?.title ?? '', quiz_version: r.quiz_version,
  class_id: r.class_id, class_name: one(r.class)?.name ?? null, final_position: r.final_position,
  avg_accuracy: r.timeline.length ? r.timeline.reduce((s, t) => s + t.accuracy, 0) / r.timeline.length : 0,
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
      p_questions: quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, correct: q.correct, time_limit: q.time_limit, explanation: q.explanation })),
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
    let q = supabase.from('race_record').select('session_id, created_at, quiz_id, quiz_version, class_id, final_position, timeline, quiz(title), class(name)').order('created_at', { ascending: false });
    if (filter?.classId) q = q.eq('class_id', filter.classId);
    if (filter?.quizId) q = q.eq('quiz_id', filter.quizId);
    return (check(await q) as unknown as RawRace[]).map(toRace);
  },
  async loadReport(sessionId) {
    const s = await supabaseApi.getSession(sessionId);
    const rec = check(
      await supabase.from('race_record').select('session_id, created_at, quiz_id, quiz_version, class_id, final_position, timeline, quiz(title), class(name)').eq('session_id', sessionId).maybeSingle(),
    ) as unknown as RawRace | null;
    const [questions, answers, players] = await Promise.all([supabaseApi.loadQuestions(s.quiz_id, s.quiz_version), supabaseApi.loadAnswers(sessionId), supabaseApi.listPlayers(sessionId)]);
    // Só as perguntas que a corrida usou (as definições da sessão podem deixar algumas de fora).
    return { race: rec ? toRace(rec) : null, questions: questions.slice(0, raceConfigFor(questions, s.settings).used), answers, playerCount: players.filter((p) => !p.kicked).length };
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
    await supabase.from('session').update({ status: 'aborted', finished_at: new Date().toISOString() }).in('status', ['lobby', 'running']).lt('created_at', cutoff);
    const rows = check(await supabase.from('session').select(SESSION_COLS).in('status', ['lobby', 'running']).order('created_at', { ascending: false }));
    return (rows as unknown as RawSession[]).map(toSession);
  },
  async abortSession(id) {
    check(await supabase.from('session').update({ status: 'aborted', finished_at: new Date().toISOString() }).eq('id', id).in('status', ['lobby', 'running']));
  },
  async createSession(quiz, classId, settings) {
    const { data } = await supabase.auth.getSession();
    const teacher_id = data.session?.user.id;
    for (let attempt = 0; attempt < 12; attempt++) {
      const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      const res = await supabase
        .from('session')
        .insert({ teacher_id, quiz_id: quiz.id, quiz_version: quiz.version, class_id: classId, pin, settings })
        .select(SESSION_COLS)
        .single();
      if (res.error?.code === '23505') continue; // PIN já em uso numa sessão ativa
      return toSession(check(res) as unknown as RawSession);
    }
    throw new Error('Não consegui gerar um PIN livre. Tenta outra vez.');
  },
  async getSession(id) {
    return toSession(check(await supabase.from('session').select(SESSION_COLS).eq('id', id).single()) as unknown as RawSession);
  },
  async loadQuestions(quizId, version) {
    const rows = check(
      await supabase.from('question').select('id, position, prompt, payload, correct, time_limit, explanation').eq('quiz_id', quizId).eq('version', version).order('position'),
    );
    return (rows as { id: string; position: number; prompt: string; payload: { options: string[] }; correct: { index: number }; time_limit: number; explanation: string | null }[]).map(
      (r): QuestionRow => ({ id: r.id, position: r.position, prompt: r.prompt, options: r.payload.options, correct: r.correct.index, time_limit: r.time_limit, explanation: r.explanation }),
    );
  },
  async listPlayers(sessionId) {
    return check(await supabase.from('player').select('id, nickname, kicked').eq('session_id', sessionId).order('joined_at')) as PlayerRow[];
  },
  async kickPlayer(playerId) {
    check(await supabase.from('player').update({ kicked: true }).eq('id', playerId));
  },
  async saveAnswers(rows: AnswerRow[]) {
    if (!rows.length) return;
    check(await supabase.from('answer').upsert(rows, { onConflict: 'player_id,question_id' }));
  },
  async loadAnswers(sessionId) {
    return check(await supabase.from('answer').select('session_id, question_id, player_id, value, correct, ms_taken').eq('session_id', sessionId)) as AnswerRow[];
  },
  async updateSession(id, patch) {
    const upd: Record<string, unknown> = {};
    if (patch.status) upd.status = patch.status;
    if (patch.state !== undefined) upd.state = patch.state;
    if (patch.started) upd.started_at = new Date().toISOString();
    if (patch.finished) upd.finished_at = new Date().toISOString();
    check(await supabase.from('session').update(upd).eq('id', id));
  },
  async saveRaceRecord(row: RaceRecordRow) {
    const { data } = await supabase.auth.getSession();
    check(await supabase.from('race_record').upsert({ ...row, teacher_id: data.session?.user.id }, { onConflict: 'session_id' }));
  },

  async joinSession(pin, nickname, deviceToken) {
    const res = await supabase.rpc('join_session', { p_pin: pin, p_nickname: nickname, p_device_token: deviceToken });
    return check(res) as JoinResult;
  },

  openChannel(sessionId, onMessage, onStatus) {
    const ch = supabase.channel(channelName(sessionId), { config: { broadcast: { self: false, ack: false } } });
    for (const event of ['hello', 'answer', 'lobby', 'question', 'reveal', 'end', 'kicked', 'aborted']) {
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
