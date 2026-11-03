import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BotField } from '../../engine/drivers';
import { errorMessage } from '../../lib/api';
import type { ClassRow, QuizRow, SessionRow } from '../../lib/types';
import { useTeacher } from './TeacherGate';

const FIELDS: { key: BotField; label: string }[] = [
  { key: 'facil', label: 'Fácil' },
  { key: 'medio', label: 'Médio' },
  { key: 'dificil', label: 'Difícil' },
];

export function Quizzes() {
  const { api, teacher, signOut } = useTeacher();
  const nav = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [open, setOpen] = useState<SessionRow[]>([]);
  const [quizId, setQuizId] = useState('');
  const [classId, setClassId] = useState('');
  const [field, setField] = useState<BotField>('medio');
  const [newClass, setNewClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [q, c, o] = await Promise.all([api.listQuizzes(), api.listClasses(), api.listOpenSessions()]);
        setQuizzes(q);
        setClasses(c);
        setOpen(o);
        if (q.length) setQuizId(q[0].id);
      } catch (e) {
        setError(errorMessage(e));
        setQuizzes([]);
      }
    })();
  }, [api]);

  const quiz = quizzes?.find((q) => q.id === quizId);

  const addClass = async () => {
    const name = newClass.trim();
    if (!name) return;
    try {
      const year = Number(/\d+/.exec(name)?.[0]) || 9;
      const c = await api.createClass(name, Math.min(12, Math.max(5, year)));
      setClasses((cs) => [...cs, c]);
      setClassId(c.id);
      setNewClass('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const create = async () => {
    if (!quiz) return;
    setBusy(true);
    setError('');
    try {
      const s = await api.createSession(quiz, classId || null, { botField: field });
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
          <button onClick={signOut}>Sair</button>
        </div>

        {open.length > 0 && (
          <section>
            <h3>Sessões em curso</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {open.map((s) => (
                <div className="quiz" key={s.id} onClick={() => nav(`/prof/jogo/${s.id}`)}>
                  <span>
                    <b>{s.quiz_title}</b> <span className="muted">PIN {s.pin} · {s.status === 'lobby' ? 'à espera' : 'a decorrer'}</span>
                  </span>
                  <button className="primary">Abrir</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3>1. Escolhe o quiz</h3>
          {quizzes === null && <p className="muted">A carregar…</p>}
          {quizzes?.length === 0 && <p className="muted">Ainda não há quizzes. Aplica a seed de exemplo (ver README).</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {quizzes?.map((q) => (
              <div key={q.id} className={`quiz ${q.id === quizId ? 'sel' : ''}`} onClick={() => setQuizId(q.id)}>
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
          <div className="row">
            <input style={{ flex: 1 }} placeholder="Nova turma, ex.: 9ºA" value={newClass} onChange={(e) => setNewClass(e.target.value)} />
            <button onClick={() => void addClass()} disabled={!newClass.trim()}>Adicionar</button>
          </div>
        </section>

        <section>
          <h3>3. Dificuldade dos bots</h3>
          <div className="seg">
            {FIELDS.map((f) => (
              <button key={f.key} className={field === f.key ? 'on' : ''} onClick={() => setField(f.key)}>{f.label}</button>
            ))}
          </div>
        </section>

        {error && <div className="error">{error}</div>}
        <button className="primary big" disabled={!quiz || busy || (quiz?.questionCount ?? 0) < 1} onClick={() => void create()}>
          {busy ? 'A criar…' : 'Criar sessão'}
        </button>
      </div>
    </div>
  );
}
