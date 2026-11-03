import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { TYPE_LABEL } from '../../lib/questions';
import { MAX_TIME, MIN_TIME, blankQuestion, duplicateQuestion, moveItem, questionProblems, quizProblems, renumber } from '../../lib/quizEdit';
import type { QuestionRow } from '../../lib/types';
import { Preview, QuestionForm } from './QuestionForm';
import { useTeacher } from './TeacherGate';
type EQ = QuestionRow & { key: string };
interface Doc { title: string; year: number | null; topic: string; qs: EQ[] }
type Status = 'saved' | 'dirty' | 'saving' | 'invalid' | 'error';

const withKey = (q: QuestionRow): EQ => ({ ...q, key: crypto.randomUUID() }) as EQ;
const DEBOUNCE_MS = 800;

export function Editor() {
  const { id } = useParams();
  const { api } = useTeacher();
  const nav = useNavigate();
  const [doc, setDocState] = useState<Doc | null>(null);
  const [version, setVersion] = useState(1);
  const [sel, setSel] = useState(0);
  const [status, setStatus] = useState<Status>('saved');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const docRef = useRef<Doc | null>(null);
  const rev = useRef(0);
  const saving = useRef(false);
  const timer = useRef(0);

  useEffect(() => {
    api.getQuiz(id!).then(({ quiz, questions }) => {
      const d: Doc = { title: quiz.title, year: quiz.year, topic: quiz.topic ?? '', qs: questions.map(withKey) };
      docRef.current = d;
      setDocState(d);
      setVersion(quiz.version);
    }).catch((e) => setError(errorMessage(e)));
  }, [api, id]);

  const save = useCallback(async () => {
    const d = docRef.current;
    if (!d || saving.current) return;
    const snapRev = rev.current;
    const problems = quizProblems(d.title, d.qs);
    if (problems.length) { setStatus('invalid'); return; }
    saving.current = true;
    setStatus('saving');
    try {
      const res = await api.saveQuiz({ id: id!, title: d.title.trim(), year: d.year, topic: d.topic.trim() || null, questions: d.qs });
      // Nova versão ⇒ as perguntas ganham ids novos; actualiza sem perder edições feitas entretanto.
      const remap = new Map(d.qs.map((q, i) => [q.id, res.ids[i]]));
      const cur = docRef.current!;
      const next = { ...cur, qs: cur.qs.map((q) => ({ ...q, id: remap.get(q.id) ?? q.id })) };
      docRef.current = next;
      setDocState(next);
      setVersion(res.version);
      if (res.bumped) setNote(`Este quiz já foi jogado: criada a versão ${res.version}. As corridas antigas mantêm a versão em que foram jogadas.`);
      saving.current = false;
      if (rev.current !== snapRev) void save();
      else setStatus('saved');
    } catch (e) {
      saving.current = false;
      setError(errorMessage(e));
      setStatus('error');
    }
  }, [api, id]);

  const edit = (fn: (d: Doc) => Doc) => {
    const next = fn(docRef.current!);
    docRef.current = next;
    setDocState(next);
    rev.current++;
    setStatus('dirty');
    setError('');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Aviso ao fechar com alterações por guardar.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (status !== 'saved') e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [status]);

  const problems = useMemo(() => (doc ? quizProblems(doc.title, doc.qs) : []), [doc]);
  if (error && !doc) return <div className="error">{error}</div>;
  if (!doc) return <p className="muted">A carregar…</p>;

  const idx = Math.min(sel, doc.qs.length - 1);
  const q = doc.qs[idx];
  const setQ = (next: QuestionRow | Partial<Pick<QuestionRow, 'time_limit' | 'explanation'>>) =>
    edit((d) => ({ ...d, qs: d.qs.map((x, i) => (i === idx ? ({ ...x, ...next, key: x.key } as EQ) : x)) }));
  const add = () => {
    edit((d) => ({ ...d, qs: renumber([...d.qs, withKey(blankQuestion())]) as EQ[] }));
    setSel(doc.qs.length);
  };
  const move = (from: number, to: number) => {
    edit((d) => ({ ...d, qs: renumber(moveItem(d.qs, from, to)) as EQ[] }));
    setSel(to);
  };
  const dup = (i: number) => {
    edit((d) => {
      const copy = withKey(duplicateQuestion(d.qs[i]));
      return { ...d, qs: renumber([...d.qs.slice(0, i + 1), copy, ...d.qs.slice(i + 1)]) as EQ[] };
    });
    setSel(i + 1);
  };
  const del = (i: number) => {
    if (!confirm(`Apagar a pergunta ${i + 1}?`)) return;
    edit((d) => ({ ...d, qs: renumber(d.qs.filter((_, k) => k !== i)) as EQ[] }));
    setSel(Math.max(0, i - 1));
  };
  const leave = () => {
    if (status !== 'saved' && !confirm('Há alterações por guardar (veja os avisos). Sair mesmo assim?')) return;
    nav('/prof/preparar');
  };

  const label: Record<Status, string> = {
    saved: '✓ Guardado',
    dirty: '… A guardar',
    saving: '… A guardar',
    invalid: '⚠ Por guardar: corrige os avisos',
    error: '✕ Erro ao guardar',
  };

  return (
    <div className="editor">
      <div className="ed-head">
        <button onClick={leave}>← Biblioteca</button>
        <input className="grow title" placeholder="Título do quiz" value={doc.title} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} />
        <select style={{ width: 130 }} value={doc.year ?? ''} onChange={(e) => edit((d) => ({ ...d, year: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">Sem ano</option>
          {[5, 6, 7, 8, 9, 10, 11, 12].map((y) => <option key={y} value={y}>{y}º ano</option>)}
        </select>
        <input style={{ width: 200 }} placeholder="Tema (ex.: Os Lusíadas)" value={doc.topic} onChange={(e) => edit((d) => ({ ...d, topic: e.target.value }))} />
        <span className={`save ${status}`} title={`Versão ${version}`}>{label[status]}</span>
      </div>
      {note && <div className="note" onClick={() => setNote('')}>{note}</div>}
      {error && <div className="error">{error}</div>}

      <div className="ed-body">
        <aside className="ed-list">
          {doc.qs.map((x, i) => (
            <div key={x.key} className={`qrow ${i === idx ? 'sel' : ''}`} onClick={() => setSel(i)}>
              <span className="num">{i + 1}</span>
              <span className="txt"><small className="muted">{TYPE_LABEL[x.type]} · </small>{x.prompt || <i className="muted">(sem enunciado)</i>}</span>
              {questionProblems(x).length > 0 && <span title={questionProblems(x).join('; ')}>⚠</span>}
              <span className="mini">
                <button aria-label="Subir" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, i - 1); }}>↑</button>
                <button aria-label="Descer" disabled={i === doc.qs.length - 1} onClick={(e) => { e.stopPropagation(); move(i, i + 1); }}>↓</button>
              </span>
            </div>
          ))}
          <button className="primary" onClick={add}>＋ Pergunta</button>
        </aside>

        <section className="ed-form">
          {!q && <p className="muted">Sem perguntas. Carrega em “＋ Pergunta”.</p>}
          {q && (
            <>
              <div className="row spread">
                <h3 style={{ margin: 0 }}>Pergunta {idx + 1}</h3>
                <div className="row">
                  <button onClick={() => dup(idx)}>Duplicar</button>
                  <button onClick={() => del(idx)}>Apagar</button>
                </div>
              </div>
              <QuestionForm q={q} onChange={setQ} />
              <label>Tempo ({MIN_TIME}–{MAX_TIME} s)
                <input type="number" min={MIN_TIME} max={MAX_TIME} style={{ width: 120 }} value={q.time_limit} onChange={(e) => setQ({ time_limit: Number(e.target.value) })} />
              </label>
              <label>Explicação (mostrada depois da resposta)
                <textarea rows={2} value={q.explanation ?? ''} onChange={(e) => setQ({ explanation: e.target.value || null })} />
              </label>
              <Preview q={q} />
              {questionProblems(q).length > 0 && <ul className="warn">{questionProblems(q).map((p) => <li key={p}>{p}</li>)}</ul>}
            </>
          )}
          {problems.length > 0 && (
            <div className="warnbox">
              <b>Para poder jogar este quiz:</b>
              <ul>{problems.map((p, i) => <li key={i}>{p.index >= 0 ? <a href="#" onClick={(e) => { e.preventDefault(); setSel(p.index); }}>{p.text}</a> : p.text}</li>)}</ul>
            </div>
          )}
          <p className="muted">O jogo usa o maior tempo das perguntas usadas (a não ser que o mudes ao criar a sessão). <Link to="/prof/preparar">Fechar</Link></p>
        </section>
      </div>
    </div>
  );
}
