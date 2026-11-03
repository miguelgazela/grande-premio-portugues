import type { Api, Channel } from './api';
import { channelName, type AnyEvent } from './protocol';
import { supabase } from './supabase';
import type { AnswerRow, ClassRow, JoinResult, PlayerRow, QuestionRow, QuizRow, RaceRecordRow, SessionRow } from './types';

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data;
}

const SESSION_COLS = 'id, teacher_id, quiz_id, quiz_version, class_id, pin, status, settings, state, quiz(title)';
type RawSession = Omit<SessionRow, 'quiz_title'> & { quiz: { title: string } | { title: string }[] | null };
const toSession = (r: RawSession): SessionRow => {
  const q = Array.isArray(r.quiz) ? r.quiz[0] : r.quiz;
  const { quiz: _quiz, ...rest } = r;
  return { ...rest, quiz_title: q?.title ?? '' };
};

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
    const quizzes = check(await supabase.from('quiz').select('id, title, year, topic, version').order('created_at', { ascending: true }));
    const out: QuizRow[] = [];
    for (const q of quizzes as Omit<QuizRow, 'questionCount'>[]) {
      const res = await supabase.from('question').select('id', { count: 'exact', head: true }).eq('quiz_id', q.id).eq('version', q.version);
      out.push({ ...q, questionCount: res.count ?? 0 });
    }
    return out;
  },
  async listClasses() {
    return check(await supabase.from('class').select('id, name, year').order('name')) as ClassRow[];
  },
  async createClass(name, year) {
    const { data } = await supabase.auth.getSession();
    const row = check(await supabase.from('class').insert({ teacher_id: data.session?.user.id, name, year }).select('id, name, year').single());
    return row as ClassRow;
  },
  async listOpenSessions() {
    const rows = check(await supabase.from('session').select(SESSION_COLS).in('status', ['lobby', 'running']).order('created_at', { ascending: false }));
    return (rows as unknown as RawSession[]).map(toSession);
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
    for (const event of ['hello', 'answer', 'lobby', 'question', 'reveal', 'end', 'kicked']) {
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
