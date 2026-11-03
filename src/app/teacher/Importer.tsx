import { type DragEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { TYPE_LABEL } from '../../lib/questions';
import { renumber } from '../../lib/quizEdit';
import type { QuestionRow } from '../../lib/types';
import { useTeacher } from './TeacherGate';

// A biblioteca de .xlsx só é descarregada aqui, quando a professora abre o importador.
type ImportLib = typeof import('../../lib/import');
type Result = import('../../lib/import').ImportResult;

const FORMAT_LABEL = { 'kahoot-template': 'Modelo de importação do Kahoot', 'kahoot-report': 'Relatório de um jogo do Kahoot', simple: 'Formato simples (ficheiro-modelo)' } as const;
const STATUS_LABEL = { ok: 'Ok', warn: 'Aviso', skip: 'Saltada' } as const;

export function Importer() {
  const { api } = useTeacher();
  const nav = useNavigate();
  const lib = useRef<Promise<ImportLib> | null>(null);
  const load = () => (lib.current ??= import('../../lib/import'));
  useEffect(() => { void load(); }, []);

  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [topic, setTopic] = useState('');
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setResult(null); setRemoved(new Set());
    try {
      const m = await load();
      if (file.size > m.LIMITS.fileBytes) throw new m.ImportError(`O ficheiro é demasiado grande (máximo ${m.LIMITS.fileBytes / 1024 / 1024} MB).`);
      const r = m.parseImportFile(file.name, new Uint8Array(await file.arrayBuffer()));
      setResult(r); setFileName(file.name); setTitle(m.titleFromFile(file.name));
    } catch (e) { setError(errorMessage(e)); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void pick(e.dataTransfer.files[0]); };

  const downloadTemplate = async () => {
    const m = await load();
    const url = URL.createObjectURL(new Blob([m.templateCsv()], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'modelo-importacao.csv' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const items = result?.items ?? [];
  const chosen = items.filter((x, i) => x.question && !removed.has(i));
  const skipped = items.filter((x) => !x.question).length;
  const toggle = (i: number) => setRemoved((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const create = async () => {
    setBusy(true); setError('');
    let id: string | null = null;
    try {
      const y = year ? Number(year) : null;
      const quiz = await api.createQuiz(title.trim(), y, topic.trim() || null);
      id = quiz.id;
      const questions = renumber(chosen.map((x) => ({ ...x.question!, id: crypto.randomUUID(), position: 0 }) as QuestionRow));
      await api.saveQuiz({ id, title: title.trim(), year: y, topic: topic.trim() || null, questions });
      nav(`/prof/preparar/quiz/${id}`);
    } catch (e) {
      if (id) await api.deleteQuiz(id).catch(() => undefined); // não deixa um quiz vazio para trás
      setError(`Não consegui criar o quiz: ${errorMessage(e)}`);
      setBusy(false);
    }
  };

  return (
    <div className="stack importer">
      <div className="row spread">
        <h1>Importar quiz</h1>
        <button onClick={() => nav('/prof/preparar')}>← Biblioteca</button>
      </div>

      {!result && (
        <>
          <label className={`dropzone${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <b>Larga aqui o ficheiro ou clica para escolher</b>
            <span className="muted">.xlsx ou .csv · o ficheiro é lido no teu computador, não vai para nenhum servidor</span>
            <input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <div className="imp-help muted">
            <p><b>Kahoot:</b> serve o modelo de importação (o ficheiro-modelo que o Kahoot oferece para criar quizzes a partir de uma folha de cálculo) ou o relatório de um jogo descarregado em Excel.</p>
            <p><b>À mão:</b> <button className="linklike" onClick={() => void downloadTemplate()}>descarrega o ficheiro-modelo</button>, preenche no Excel e importa. Colunas: Pergunta, Resposta 1 a 4, Resposta certa (1 a 4), Tempo (s), Explicação.</p>
          </div>
        </>
      )}
      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <p className="muted">{FORMAT_LABEL[result.format]} · <b>{fileName}</b> · <button className="linklike" onClick={() => { setResult(null); setError(''); }}>escolher outro ficheiro</button></p>
          {result.notes.map((n) => <p key={n} className="muted">{n}</p>)}
          <div className="row filters">
            <input className="grow" placeholder="Título do quiz" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título" />
            <select style={{ width: 130 }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Ano">
              <option value="">Sem ano</option>
              {[5, 6, 7, 8, 9, 10, 11, 12].map((y) => <option key={y} value={y}>{y}º ano</option>)}
            </select>
            <input style={{ width: 220 }} placeholder="Tema (ex.: Os Lusíadas)" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Tema" />
          </div>
          <table className="tbl imp-tbl">
            <thead><tr><th>Linha</th><th>Pergunta</th><th>Tipo</th><th>Tempo</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={i} className={`imp-${x.status}${removed.has(i) ? ' removed' : ''}`}>
                  <td>{x.row}</td>
                  <td>{x.prompt || <i className="muted">(sem texto)</i>}{x.notes.length > 0 && <div className="imp-notes">{x.notes.join(' · ')}</div>}</td>
                  <td>{x.question ? TYPE_LABEL[x.question.type] : '—'}</td>
                  <td>{x.question ? `${x.question.time_limit} s` : '—'}</td>
                  <td><span className={`imp-badge ${removed.has(i) ? 'skip' : x.status}`}>{removed.has(i) ? 'Retirada' : STATUS_LABEL[x.status]}</span></td>
                  <td className="actions">{x.question && <button onClick={() => toggle(i)}>{removed.has(i) ? 'Repor' : 'Retirar'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row spread imp-foot">
            <span><b>{chosen.length}</b> {chosen.length === 1 ? 'pergunta vai' : 'perguntas vão'} ser criadas{skipped > 0 && <> · {skipped} saltada{skipped > 1 ? 's' : ''}</>}{removed.size > 0 && <> · {removed.size} retirada{removed.size > 1 ? 's' : ''}</>}</span>
            <button className="primary" disabled={busy || !chosen.length || !title.trim()} onClick={() => void create()}>{busy ? 'A criar…' : 'Criar quiz'}</button>
          </div>
        </>
      )}
    </div>
  );
}
