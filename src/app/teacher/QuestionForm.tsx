import { TYPES, TYPE_LABEL, BLANK, blankCount, prepare, tokenize } from '../../lib/questions';
import { MAX_ITEMS, MAX_OPTIONS, MAX_PAIRS, changeType, removeOption } from '../../lib/quizEdit';
import type { QuestionRow } from '../../lib/types';
import { StudentInput } from '../ui/Question';

const LETTERS = ['A', 'B', 'C', 'D'];

interface Props<Q extends QuestionRow> {
  q: Q;
  onChange(q: QuestionRow): void;
}

/** Seletor de tipo + formulário do tipo + pré-visualização do que o aluno vê. */
export function QuestionForm<Q extends QuestionRow>({ q, onChange }: Props<Q>) {
  return (
    <>
      <div>
        <div className="lbl">Tipo de pergunta</div>
        <div className="typesel">
          {TYPES.map((t) => (
            <button key={t} className={q.type === t ? 'on' : ''} aria-pressed={q.type === t} onClick={() => onChange(changeType(q, t))}>{TYPE_LABEL[t]}</button>
          ))}
        </div>
      </div>
      <label>Enunciado
        <textarea rows={2} value={q.prompt} onChange={(e) => onChange({ ...q, prompt: e.target.value })} />
      </label>
      <TypeFields q={q} onChange={onChange} />
    </>
  );
}

export function Preview({ q }: { q: QuestionRow }) {
  const body = prepare(q, 1).body;
  return (
    <div className="preview" aria-label="Pré-visualização">
      <div className="lbl">Pré-visualização (o que o aluno vê)</div>
      <div className="student">
        <div className="sprompt">{q.prompt || '(sem enunciado)'}</div>
        <StudentInput body={body} mine={undefined} onSubmit={() => undefined} />
      </div>
    </div>
  );
}

function OptionList({ q, onChange }: Props<Extract<QuestionRow, { type: 'multiple_choice' | 'excerpt' }>>) {
  const o = q.payload.options;
  const set = (options: string[], index = q.correct.index) => onChange({ ...q, payload: { ...q.payload, options }, correct: { index } } as QuestionRow);
  return (
    <div>
      <div className="lbl">Opções (marca a certa)</div>
      {o.map((x, i) => (
        <div className="optrow" key={i}>
          <input type="radio" name="correct" aria-label={`Opção ${LETTERS[i]} é a certa`} checked={q.correct.index === i} onChange={() => set(o, i)} />
          <b className={`letter ${LETTERS[i]}`}>{LETTERS[i]}</b>
          <input className="grow" value={x} placeholder={`Opção ${LETTERS[i]}`} onChange={(e) => set(o.map((v, k) => (k === i ? e.target.value : v)))} />
          <button aria-label={`Remover opção ${LETTERS[i]}`} disabled={o.length <= 2} onClick={() => onChange(removeOption(q, i))}>✕</button>
        </div>
      ))}
      {o.length < MAX_OPTIONS && <button onClick={() => set([...o, ''])}>＋ Opção</button>}
    </div>
  );
}

function TypeFields({ q, onChange }: Props<QuestionRow>) {
  switch (q.type) {
    case 'multiple_choice':
      return <OptionList q={q} onChange={onChange} />;
    case 'excerpt':
      return (
        <>
          <label>Excerto
            <textarea rows={6} value={q.payload.excerpt} placeholder="Cola o excerto. Indica o autor e a obra no fim." onChange={(e) => onChange({ ...q, payload: { ...q.payload, excerpt: e.target.value } })} />
          </label>
          <OptionList q={q} onChange={onChange} />
        </>
      );
    case 'true_false':
      return (
        <div>
          <div className="lbl">A afirmação é…</div>
          {[true, false].map((v) => (
            <label key={String(v)} className="optrow" style={{ fontWeight: 700 }}>
              <input type="radio" name="tf" checked={q.correct.value === v} onChange={() => onChange({ ...q, correct: { value: v } })} />
              {v ? 'Verdadeira' : 'Falsa'}
            </label>
          ))}
          <p className="hint">Escreve a afirmação no enunciado.</p>
        </div>
      );
    case 'tap_word': {
      const words = tokenize(q.payload.sentence);
      const on = new Set(q.correct.indices);
      const toggle = (i: number) => onChange({ ...q, correct: { indices: (on.has(i) ? [...on].filter((x) => x !== i) : [...on, i]).sort((a, b) => a - b) } });
      return (
        <>
          <label>Frase
            <input value={q.payload.sentence} onChange={(e) => onChange({ ...q, payload: { sentence: e.target.value }, correct: { indices: q.correct.indices.filter((i) => i < tokenize(e.target.value).length) } })} />
          </label>
          <div>
            <div className="lbl">Marca a(s) palavra(s) certa(s)</div>
            <div className="wordpick">
              {words.map((w, i) => <button key={i} className={on.has(i) ? 'on' : ''} aria-pressed={on.has(i)} onClick={() => toggle(i)}>{w}</button>)}
              {!words.length && <span className="muted">Escreve a frase acima.</span>}
            </div>
            <p className="hint">O aluno tem de tocar exatamente nestas palavras. A pontuação fica colada à palavra.</p>
          </div>
        </>
      );
    }
    case 'order': {
      const it = q.payload.items;
      const set = (items: string[]) => onChange({ ...q, payload: { items } });
      return (
        <div>
          <div className="lbl">Itens, pela ordem CERTA (o jogo baralha-os)</div>
          {it.map((x, i) => (
            <div className="optrow" key={i}>
              <b>{i + 1}</b>
              <input className="grow" value={x} placeholder={`Item ${i + 1}`} onChange={(e) => set(it.map((v, k) => (k === i ? e.target.value : v)))} />
              <button aria-label="Subir" disabled={i === 0} onClick={() => { const n = [...it]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); }}>↑</button>
              <button aria-label="Descer" disabled={i === it.length - 1} onClick={() => { const n = [...it]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); }}>↓</button>
              <button aria-label={`Remover item ${i + 1}`} disabled={it.length <= 2} onClick={() => set(it.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
          {it.length < MAX_ITEMS && <button onClick={() => set([...it, ''])}>＋ Item</button>}
          <p className="hint">Crédito parcial: cada item na posição certa conta.</p>
        </div>
      );
    }
    case 'complete': {
      const n = blankCount(q.payload.text);
      const opts = q.payload.options;
      const accepted = Array.from({ length: n }, (_, b) => q.correct.accepted[b] ?? ['']);
      const setText = (text: string) => onChange({ ...q, payload: { ...q.payload, text }, correct: { accepted: Array.from({ length: blankCount(text) }, (_, b) => q.correct.accepted[b] ?? ['']) } });
      const setAcc = (b: number, text: string) => onChange({ ...q, correct: { accepted: accepted.map((a, k) => (k === b ? text.split('|').map((x) => x.trim()) : a)) } });
      return (
        <>
          <label>Texto (usa {BLANK} para cada lacuna)
            <textarea rows={2} value={q.payload.text} placeholder={`Ontem, eu ${BLANK} (fazer) o trabalho.`} onChange={(e) => setText(e.target.value)} />
          </label>
          {accepted.map((a, b) => (
            <label key={b}>Resposta certa{n > 1 ? ` da lacuna ${b + 1}` : ''}
              <input value={a.join(' | ')} placeholder="fiz" onChange={(e) => setAcc(b, e.target.value)} />
              <span className="hint">Várias respostas aceites: separa com |. Ignora maiúsculas, acentos e espaços a mais.</span>
            </label>
          ))}
          <label className="optrow" style={{ fontWeight: 700 }}>
            <input type="checkbox" style={{ width: 22, minHeight: 0 }} checked={!!opts} onChange={(e) => onChange({ ...q, payload: { ...q.payload, options: e.target.checked ? [accepted[0]?.[0] ?? '', ''] : undefined } })} />
            O aluno escolhe entre opções (em vez de escrever)
          </label>
          {opts && (
            <div>
              {opts.map((x, i) => (
                <div className="optrow" key={i}>
                  <input className="grow" value={x} placeholder={`Opção ${i + 1}`} onChange={(e) => onChange({ ...q, payload: { ...q.payload, options: opts.map((v, k) => (k === i ? e.target.value : v)) } })} />
                  <button aria-label="Remover opção" disabled={opts.length <= 2} onClick={() => onChange({ ...q, payload: { ...q.payload, options: opts.filter((_, k) => k !== i) } })}>✕</button>
                </div>
              ))}
              {opts.length < 6 && <button onClick={() => onChange({ ...q, payload: { ...q.payload, options: [...opts, ''] } })}>＋ Opção</button>}
              <p className="hint">Com opções só pode haver uma lacuna, e a resposta certa tem de estar entre elas.</p>
            </div>
          )}
        </>
      );
    }
    case 'match': {
      const { left, right } = q.payload;
      const set = (l: string[], r: string[]) => onChange({ ...q, payload: { left: l, right: r } });
      return (
        <div>
          <div className="lbl">Pares certos (o jogo baralha a coluna da direita)</div>
          {left.map((l, i) => (
            <div className="optrow" key={i}>
              <input className="grow" value={l} placeholder="Esquerda" onChange={(e) => set(left.map((v, k) => (k === i ? e.target.value : v)), right)} />
              <span>↔</span>
              <input className="grow" value={right[i]} placeholder="Direita" onChange={(e) => set(left, right.map((v, k) => (k === i ? e.target.value : v)))} />
              <button aria-label={`Remover par ${i + 1}`} disabled={left.length <= 2} onClick={() => set(left.filter((_, k) => k !== i), right.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
          {left.length < MAX_PAIRS && <button onClick={() => set([...left, ''], [...right, ''])}>＋ Par</button>}
          <p className="hint">Crédito parcial: cada par certo conta.</p>
        </div>
      );
    }
  }
}
