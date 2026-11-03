import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BotField } from '../../engine/drivers';
import { MAX_LAPS, maxQuestionsPerLap } from '../../game/raceSettings';
import { errorMessage } from '../../lib/api';
import { endSessions } from '../../lib/endSessions';
import type { ClassRow, QuizRow, SessionRow, SessionSettings } from '../../lib/types';
import { useTeacher } from './TeacherGate';

const FIELDS: { key: BotField; label: string }[] = [
  { key: 'facil', label: 'Fácil' },
  { key: 'medio', label: 'Médio' },
  { key: 'dificil', label: 'Difícil' },
];

/** Área "Jogar" (iPad): escolher quiz, turma e definições, e criar a sessão. */
export function Jogar() {
  const { api, teacher, signOut } = useTeacher();
  const nav = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [open, setOpen] = useState<SessionRow[]>([]);
  const [quizId, setQuizId] = useState('');
  const [classId, setClassId] = useState('');
  const [field, setField] = useState<BotField>('medio');
  const [laps, setLaps] = useState(3);
  const [perLap, setPerLap] = useState(0); // 0 = todas
  const [time, setTime] = useState(0); // 0 = o do quiz
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [q, c, o] = await Promise.all([api.listQuizzes(), api.listClasses(), api.listOpenSessions()]);
        setQuizzes(q);
        setClasses(c);
        setOpen(o);
        const first = q.find((x) => x.questionCount > 0);
        if (first) setQuizId(first.id);
      } catch (e) {
        setError(errorMessage(e));
        setQuizzes([]);
      }
    })();
  }, [api]);

  const quiz = quizzes?.find((q) => q.id === quizId);
  const n = quiz?.questionCount ?? 0;
  const maxLaps = Math.max(1, Math.min(MAX_LAPS, n));
  const effLaps = Math.min(laps, maxLaps);
  const maxPer = maxQuestionsPerLap(n, effLaps);
  const effPer = perLap && perLap <= maxPer ? perLap : 0;
  const used = effLaps * (effPer || maxPer);

  const terminate = async (ids: string[]) => {
    const what = ids.length > 1 ? `Terminar as ${ids.length} sessões em curso?` : 'Terminar esta sessão?';
    if (!window.confirm(`${what} Os alunos ficam sem corrida e nada é guardado no histórico.`)) return;
    try {
      await endSessions(api, ids);
      setOpen((cur) => cur.filter((x) => !ids.includes(x.id)));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const create = async () => {
    if (!quiz) return;
    setBusy(true);
    setError('');
    try {
      const settings: SessionSettings = { botField: field, laps: effLaps, questionsPerLap: effPer || null, questionTime: time || null };
      const s = await api.createSession(quiz, classId || null, settings);
      nav(`/prof/jogo/${s.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="card wide">
        <div className="row spread">
          <h1>🏎️ Olá, {teacher.name}</h1>
          <div className="row">
            <button onClick={() => nav('/prof/preparar')}>✎ Preparar</button>
            <button onClick={signOut}>Sair</button>
          </div>
        </div>

        {open.length > 0 && (
          <section>
            <div className="row spread">
              <h3>Sessões em curso</h3>
              {open.length > 1 && <button className="danger" onClick={() => void terminate(open.map((s) => s.id))}>Terminar todas</button>}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {open.map((s) => (
                <div className="quiz" key={s.id} onClick={() => nav(`/prof/jogo/${s.id}`)}>
                  <span>
                    <b>{s.quiz_title}</b> <span className="muted">PIN {s.pin} · {s.status === 'lobby' ? 'à espera' : 'a decorrer'}</span>
                  </span>
                  <span className="row">
                    <button className="danger" onClick={(e) => { e.stopPropagation(); void terminate([s.id]); }}>Terminar</button>
                    <button className="primary">Abrir</button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>1. Escolhe o quiz</h3>
          {quizzes === null && <p className="muted">A carregar…</p>}
          {quizzes?.length === 0 && <p className="muted">Ainda não há quizzes. Cria um em “Preparar”.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {quizzes?.map((q) => (
              <div key={q.id} className={`quiz ${q.id === quizId ? 'sel' : ''}`} style={q.questionCount === 0 ? { opacity: 0.5 } : undefined} onClick={() => q.questionCount > 0 && setQuizId(q.id)}>
                <span>
                  <b>{q.title}</b> <span className="muted">{q.year ? `${q.year}º ano · ` : ''}{q.questionCount} perguntas</span>
                </span>
                {q.id === quizId && <span>✓</span>}
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h3>2. Turma (opcional)</h3>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Sem turma</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {classes.length === 0 && <span className="muted">As turmas criam-se em “Preparar → Turmas”.</span>}
        </section>

        <section>
          <h3>3. Dificuldade dos bots</h3>
          <div className="seg">
            {FIELDS.map((f) => (
              <button key={f.key} className={field === f.key ? 'on' : ''} onClick={() => setField(f.key)}>{f.label}</button>
            ))}
          </div>
        </section>

        <section className="settings">
          <h3>4. Corrida</h3>
          <label>Voltas
            <select value={effLaps} onChange={(e) => { setLaps(Number(e.target.value)); setPerLap(0); }}>
              {Array.from({ length: maxLaps }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Perguntas por volta
            <select value={effPer} onChange={(e) => setPerLap(Number(e.target.value))}>
              <option value={0}>Todas ({maxPer})</option>
              {Array.from({ length: maxPer }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Tempo por pergunta
            <select value={time} onChange={(e) => setTime(Number(e.target.value))}>
              <option value={0}>O do quiz</option>
              {[10, 15, 20, 30, 45, 60].map((v) => <option key={v} value={v}>{v} s</option>)}
            </select>
          </label>
          {quiz && <span className="muted">{used} perguntas no total{used < n ? ` (${n - used} ficam de fora)` : ''}.</span>}
        </section>

        {error && <div className="error">{error}</div>}
        <button className="primary big" disabled={!quiz || busy || n < 1} onClick={() => void create()}>
          {busy ? 'A criar…' : 'Criar sessão'}
        </button>
      </div>
    </div>
  );
}
