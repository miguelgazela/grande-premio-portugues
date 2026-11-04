import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BotField } from '../../engine/drivers';
import { errorMessage } from '../../lib/api';
import {
  DEFAULT_COUNT, DEFAULT_SESSIONS, DEFAULT_THRESHOLD, MAX_COUNT, MIN_COUNT, buildReviewSettings, byFailure, lastSessions, questionStats, selectFailed,
} from '../../lib/review';
import type { ClassRow, QuizRow, ReviewQuestion, ReviewSession } from '../../lib/types';
import { useTeacher } from './TeacherGate';

const FIELDS: { key: BotField; label: string }[] = [
  { key: 'facil', label: 'Fácil' },
  { key: 'medio', label: 'Médio' },
  { key: 'dificil', label: 'Difícil' },
];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const nSess = (n: number) => `${n} ${n === 1 ? 'sessão' : 'sessões'}`;

/** Modo revisão (iPad): uma corrida só com as perguntas que a turma falhou nas últimas sessões. */
export function Revisao() {
  const { api } = useTeacher();
  const nav = useNavigate();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [classId, setClassId] = useState('');
  const [nSessions, setNSessions] = useState(DEFAULT_SESSIONS);
  const [quizIds, setQuizIds] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [field, setField] = useState<BotField>('medio');
  const [pool, setPool] = useState<{ sessions: ReviewSession[]; questions: ReviewQuestion[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([api.listClasses(), api.listQuizzes()])
      .then(([c, q]) => {
        setClasses(c);
        setQuizzes(q);
        if (c[0]) setClassId(c[0].id);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [api]);

  useEffect(() => {
    setPool(null);
    if (!classId) return;
    let gone = false;
    api.loadReviewPool({ classId, quizIds, sessions: nSessions }).then((p) => !gone && setPool(p)).catch((e) => { if (!gone) { setError(errorMessage(e)); setPool({ sessions: [], questions: [] }); } });
    return () => {
      gone = true;
    };
  }, [api, classId, quizIds, nSessions, reload]);

  const sessions = useMemo(() => (pool ? lastSessions(pool.sessions, nSessions) : []), [pool, nSessions]);
  const { stats, skipped } = useMemo(() => (pool ? questionStats(sessions, pool.questions) : { stats: [], skipped: 0 }), [pool, sessions]);
  const sorted = useMemo(() => [...stats].sort(byFailure), [stats]);
  const failed = sorted.filter((s) => s.pct < threshold);
  const others = sorted.filter((s) => s.pct >= threshold);

  // A seleção automática refaz-se quando muda o material, o limiar ou o número de perguntas.
  useEffect(() => setPicked(selectFailed(stats, threshold, count)), [stats, threshold, count]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_COUNT ? [...cur, id] : cur));
  const toggleQuiz = (id: string) => setQuizIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const className = classes.find((c) => c.id === classId)?.name ?? null;
  const chosen = sorted.filter((s) => picked.includes(s.id));

  const create = async () => {
    if (!pool || !chosen.length) return;
    setBusy(true);
    setError('');
    try {
      const first = pool.questions.find((q) => q.id === chosen[0].id)!;
      const before = Object.fromEntries(chosen.map((s) => [s.id, { pct: s.pct, sessions: s.sessions }]));
      const review = buildReviewSettings(className, chosen.map((s) => s.id), threshold, before);
      // O quiz da sessão é só âncora (a base de dados exige um): as perguntas vêm de `review.questionIds`.
      const anchor: QuizRow = { id: first.quiz_id, title: review.title, year: null, topic: null, version: first.quiz_version, questionCount: chosen.length, lastPlayed: null };
      const s = await api.createSession(anchor, classId, { botField: field, review });
      nav(`/prof/jogo/${s.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const seed = async () => {
    const { seedReviewDemo } = await import('../../lib/api.mock');
    seedReviewDemo();
    const c = await api.listClasses();
    setClasses(c);
    setClassId(c.find((x) => x.name === '9ºB')?.id ?? '');
    setReload((n) => n + 1);
  };

  const line = (s: (typeof sorted)[number]) => (
    <div key={s.id} className={`quiz ${picked.includes(s.id) ? 'sel' : ''}`} onClick={() => toggle(s.id)}>
      <span>
        <b>{s.prompt}</b>{' '}
        <span className="muted">{pct(s.pct)} certas · {nSess(s.sessions)} · {s.quizTitle}</span>
      </span>
      {picked.includes(s.id) && <span>✓</span>}
    </div>
  );

  return (
    <div className="center">
      <div className="card wide">
        <div className="row spread">
          <h1>🔁 Revisão</h1>
          <button onClick={() => nav('/prof')}>← Voltar</button>
        </div>
        <p className="muted">Uma corrida só com as perguntas que a turma falhou nas últimas sessões.</p>

        <section className="settings">
          <h3>1. Turma e origem</h3>
          <label>Turma
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.length === 0 && <option value="">Sem turmas</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Últimas sessões
            <select value={nSessions} onChange={(e) => setNSessions(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 7, 10].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>«Falhada» abaixo de
            <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
              {[0.4, 0.5, 0.6, 0.7, 0.8].map((v) => <option key={v} value={v}>{pct(v)} certas</option>)}
            </select>
          </label>
          <label>Perguntas
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: MAX_COUNT - MIN_COUNT + 1 }, (_, i) => MIN_COUNT + i).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </section>

        <section>
          <h3>Só destes quizzes (opcional)</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {quizzes.map((q) => (
              <button key={q.id} className={quizIds.includes(q.id) ? 'primary' : ''} onClick={() => toggleQuiz(q.id)}>{q.title}</button>
            ))}
            {quizzes.length === 0 && <span className="muted">Ainda não há quizzes.</span>}
          </div>
          {quizIds.length === 0 && <p className="muted">Sem escolha: todos os quizzes jogados pela turma.</p>}
        </section>

        <section>
          <h3>2. Pré-visualização</h3>
          {!classId && <p className="muted">Cria uma turma e joga uma corrida com ela para poder rever.</p>}
          {classId && pool === null && <p className="muted">A carregar…</p>}
          {pool && (
            <p className="muted">
              {nSess(sessions.length)} terminada{sessions.length === 1 ? '' : 's'}
              {sessions.some((s) => s.review) ? ' (algumas são revisões)' : ''}.
              {skipped > 0 && ` ⚠️ ${skipped} pergunta${skipped === 1 ? '' : 's'} ignorada${skipped === 1 ? '' : 's'} (apagada${skipped === 1 ? '' : 's'} ou de quiz arquivado).`}
            </p>
          )}
          {pool && sessions.length === 0 && <p className="muted">Esta turma ainda não tem sessões terminadas{quizIds.length ? ' com estes quizzes' : ''}.</p>}
          {failed.length > 0 && <div style={{ display: 'grid', gap: 8 }}>{failed.map(line)}</div>}
          {pool && sessions.length > 0 && failed.length === 0 && <p className="muted">Nenhuma pergunta ficou abaixo de {pct(threshold)}. Podes escolher outras abaixo.</p>}
          {others.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary>Outras perguntas ({others.length}), para acrescentar</summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>{others.map(line)}</div>
            </details>
          )}
        </section>

        <section>
          <h3>3. Dificuldade dos bots</h3>
          <div className="seg">
            {FIELDS.map((f) => <button key={f.key} className={field === f.key ? 'on' : ''} onClick={() => setField(f.key)}>{f.label}</button>)}
          </div>
        </section>

        {api.mock && <button onClick={() => void seed()}>🧪 Dados de exemplo (só no teste)</button>}
        {error && <div className="error">{error}</div>}
        <button className="primary big" disabled={busy || !chosen.length} onClick={() => void create()}>
          {busy ? 'A criar…' : chosen.length ? `Criar revisão · ${chosen.length} pergunta${chosen.length === 1 ? '' : 's'}` : 'Escolhe perguntas'}
        </button>
      </div>
    </div>
  );
}
