import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import type { QuizRow } from '../../lib/types';
import { fmtDate } from './Prepare';
import { useTeacher } from './TeacherGate';

export function Library() {
  const { api } = useTeacher();
  const nav = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');

  const reload = () => api.listQuizzes().then(setQuizzes).catch((e) => { setError(errorMessage(e)); setQuizzes([]); });
  useEffect(() => { void reload(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => [...new Set((quizzes ?? []).map((x) => x.year).filter((y): y is number => y !== null))].sort(), [quizzes]);
  const topics = useMemo(() => [...new Set((quizzes ?? []).map((x) => x.topic).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, 'pt')), [quizzes]);
  const shown = (quizzes ?? []).filter(
    (x) => (!year || String(x.year) === year) && (!topic || x.topic === topic) && x.title.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const create = async () => {
    try {
      const quiz = await api.createQuiz('Novo quiz', null, null);
      nav(`/prof/preparar/quiz/${quiz.id}`);
    } catch (e) { setError(errorMessage(e)); }
  };
  const duplicate = async (x: QuizRow) => {
    try { await api.duplicateQuiz(x.id); await reload(); } catch (e) { setError(errorMessage(e)); }
  };
  const remove = async (x: QuizRow) => {
    if (!confirm(`Apagar "${x.title}"?\nSe já foi jogado, fica escondido mas o histórico mantém-se.`)) return;
    try { await api.deleteQuiz(x.id); await reload(); } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <div className="stack">
      <div className="row spread">
        <h1>Biblioteca de quizzes</h1>
        <button className="primary" onClick={() => void create()}>＋ Novo quiz</button>
      </div>
      <div className="row filters">
        <input className="grow" placeholder="Pesquisar por título…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Todos os anos</option>
          {years.map((y) => <option key={y} value={y}>{y}º ano</option>)}
        </select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Todos os temas</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {quizzes === null && <p className="muted">A carregar…</p>}
      {quizzes?.length === 0 && <p className="muted">Ainda não há quizzes. Cria o primeiro.</p>}
      {quizzes && quizzes.length > 0 && shown.length === 0 && <p className="muted">Nenhum quiz com estes filtros.</p>}
      {shown.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Título</th><th>Ano</th><th>Tema</th><th>Perguntas</th><th>Último jogo</th><th /></tr></thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.id}>
                <td><a href={`#/prof/preparar/quiz/${x.id}`}><b>{x.title}</b></a></td>
                <td>{x.year ? `${x.year}º` : '—'}</td>
                <td>{x.topic ?? '—'}</td>
                <td>{x.questionCount}</td>
                <td>{fmtDate(x.lastPlayed)}</td>
                <td className="actions">
                  <button onClick={() => nav(`/prof/preparar/quiz/${x.id}`)}>Editar</button>
                  <button onClick={() => void duplicate(x)}>Duplicar</button>
                  <button onClick={() => void remove(x)}>Apagar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
