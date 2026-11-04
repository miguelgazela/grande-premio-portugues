import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import type { ClassRow, QuizRow, RaceSummary } from '../../lib/types';
import { fmtDate, pct } from './Prepare';
import { useTeacher } from './TeacherGate';

export function History() {
  const { api } = useTeacher();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const classId = params.get('turma') ?? '';
  const quizId = params.get('quiz') ?? '';
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [races, setRaces] = useState<RaceSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([api.listClasses(), api.listQuizzes()]).then(([c, q]) => { setClasses(c); setQuizzes(q); }).catch((e) => setError(errorMessage(e)));
  }, [api]);
  useEffect(() => {
    setRaces(null);
    api.listRaces({ classId: classId || undefined, quizId: quizId || undefined }).then(setRaces).catch((e) => { setError(errorMessage(e)); setRaces([]); });
  }, [api, classId, quizId]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="stack">
      <h1>Histórico de corridas</h1>
      <div className="row filters">
        <select value={classId} onChange={(e) => set('turma', e.target.value)}>
          <option value="">Todas as turmas</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={quizId} onChange={(e) => set('quiz', e.target.value)}>
          <option value="">Todos os quizzes</option>
          {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {races === null && <p className="muted">A carregar…</p>}
      {races?.length === 0 && <p className="muted">Ainda não há corridas terminadas{classId || quizId ? ' com estes filtros' : ''}.</p>}
      {races && races.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Data</th><th>Quiz</th><th>Turma</th><th>Posição final</th><th>% média certas</th><th /></tr></thead>
          <tbody>
            {races.map((r) => (
              <tr key={r.game_id}>
                <td>{fmtDate(r.created_at)}</td>
                <td>{r.quiz_title}</td>
                <td>{r.class_name ?? '—'}</td>
                <td>{r.final_position}º</td>
                <td>{pct(r.avg_accuracy)}</td>
                <td className="actions"><button onClick={() => nav(`/prof/preparar/relatorio/${r.game_id}`)}>Relatório</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
