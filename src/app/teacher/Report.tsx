import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { buildReport, reportToCsv, type QuestionStat } from '../../lib/report';
import type { ReportData } from '../../lib/types';
import { fmtDate, pct } from './Prepare';
import { useTeacher } from './TeacherGate';

const LETTERS = ['A', 'B', 'C', 'D'];

export function Report() {
  const { id } = useParams();
  const { api } = useTeacher();
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.loadReport(id!).then(setData).catch((e) => setError(errorMessage(e))); }, [api, id]);
  const report = useMemo(() => (data ? buildReport(data.questions, data.answers, data.playerCount) : null), [data]);

  if (error) return <div className="error">{error}</div>;
  if (!data || !report) return <p className="muted">A carregar…</p>;

  const title = data.race?.quiz_title ?? 'Corrida';
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(data.race?.created_at ?? '').slice(0, 10) || 'corrida'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stack">
      <Link to="/prof/preparar/historico">← Histórico</Link>
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: 4 }}>{title}</h1>
          <span className="muted">{data.race ? `${fmtDate(data.race.created_at)} · ${data.race.class_name ?? 'sem turma'} · terminou em ${data.race.final_position}º` : 'Corrida sem registo final'}</span>
        </div>
        <button className="primary" onClick={download}>⬇ Exportar CSV</button>
      </div>

      <div className="kpis">
        <div><b>{pct(report.avgAccuracy)}</b><span>respostas certas</span></div>
        <div><b>{pct(report.participation)}</b><span>participação</span></div>
        <div><b>{report.playerCount}</b><span>alunos</span></div>
        <div><b>{report.questions.length}</b><span>perguntas</span></div>
      </div>

      {report.hardest.length > 0 && (
        <section>
          <h3>Mais falhadas</h3>
          <ol className="hardest">
            {report.hardest.map((q) => (
              <li key={q.index}><b>{pct(q.accuracy)}</b> Pergunta {q.index + 1}: {q.prompt}</li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h3>Pergunta a pergunta</h3>
        <div className="stack">
          {report.questions.map((q) => <QuestionCard key={q.index} q={q} />)}
        </div>
      </section>
    </div>
  );
}

function QuestionCard({ q }: { q: QuestionStat }) {
  const max = Math.max(1, ...q.counts);
  return (
    <div className="qcard">
      <div className="row spread">
        <b>{q.index + 1}. {q.prompt}</b>
        <span className={q.accuracy < 0.5 ? 'bad' : 'muted'}>{pct(q.accuracy)} certas · {q.answered} respostas{q.noAnswer ? ` · ${q.noAnswer} sem resposta` : ''}</span>
      </div>
      {q.options.map((o, i) => (
        <div className="bar" key={i}>
          <span className="lbl">{LETTERS[i]}{i === q.correct ? ' ✓' : ''}</span>
          <div className="track"><i className={i === q.correct ? 'ok' : ''} style={{ width: `${(q.counts[i] / max) * 100}%` }} /></div>
          <span className="n">{q.counts[i]}</span>
          <span className="opt-text">{o}</span>
        </div>
      ))}
    </div>
  );
}
