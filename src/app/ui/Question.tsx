import { Fragment, useRef, useState, type ReactNode } from 'react';
import type { PublicBody, Solution } from '../../lib/protocol';
import { BLANK } from '../../lib/questions';
import type { AnswerValue } from '../../lib/types';

const LETTERS = ['A', 'B', 'C', 'D'];

/** Texto com lacunas: cada `___` é substituído por `fill(i)` (ou um espaço em branco). */
export function withBlanks(text: string, fill: (i: number) => ReactNode): ReactNode[] {
  return text.split(BLANK).flatMap((part, i, all) => (i < all.length - 1 ? [part, <Fragment key={i}>{fill(i)}</Fragment>] : [part]));
}

/** "A resposta era …", para o ecrã do aluno. */
export function describeSolution(s: Solution, body: PublicBody | null): string {
  switch (s.type) {
    case 'multiple_choice':
    case 'excerpt': {
      const text = body && 'options' in body && body.options ? body.options[s.index] : '';
      return `A resposta era ${LETTERS[s.index]}${text ? `: ${text}` : ''}.`;
    }
    case 'true_false':
      return `A resposta era ${s.value ? 'Verdadeiro' : 'Falso'}.`;
    case 'tap_word': {
      const words = body?.type === 'tap_word' ? body.words : [];
      return `A resposta era: ${s.indices.map((i) => words[i]).join(' ')}.`;
    }
    case 'order':
      return `A ordem certa: ${s.items.map((x, i) => `${i + 1}. ${x}`).join(' · ')}`;
    case 'complete':
      return `A resposta era: ${s.answers.join(' · ')}.`;
    case 'match':
      return `Os pares certos: ${s.pairs.map(([l, r]) => `${l} ↔ ${r}`).join(' · ')}`;
  }
}

// ---------------------------------------------------------------- aluno

interface InputProps {
  body: PublicBody;
  /** Resposta já enviada (bloqueia a escolha). */
  mine: AnswerValue | undefined;
  onSubmit(v: AnswerValue): void;
}

export function StudentInput({ body, mine, onSubmit }: InputProps) {
  switch (body.type) {
    case 'multiple_choice':
      return <Options options={body.options} mine={mine as number | undefined} onSubmit={onSubmit} />;
    case 'excerpt':
      return (
        <>
          <blockquote className="excerpt">{body.excerpt}</blockquote>
          <Options options={body.options} mine={mine as number | undefined} onSubmit={onSubmit} />
        </>
      );
    case 'true_false':
      return (
        <div className="sopts tf">
          {[true, false].map((v) => (
            <button key={String(v)} className={`sopt ${v ? 'T' : 'F'} ${mine !== undefined && mine !== v ? 'dim' : ''} ${mine === v ? 'mine' : ''}`} disabled={mine !== undefined} onClick={() => onSubmit(v)}>
              <b>{v ? '✔' : '✘'}</b>
              <span>{v ? 'Verdadeiro' : 'Falso'}</span>
            </button>
          ))}
        </div>
      );
    case 'tap_word':
      return <TapWords words={body.words} mine={mine as number[] | undefined} onSubmit={onSubmit} />;
    case 'order':
      return <OrderInput items={body.items} mine={mine as number[] | undefined} onSubmit={onSubmit} />;
    case 'complete':
      return <CompleteInput body={body} mine={mine as string[] | undefined} onSubmit={onSubmit} />;
    case 'match':
      return <MatchInput left={body.left} right={body.right} mine={mine as number[] | undefined} onSubmit={onSubmit} />;
  }
}

function Options({ options, mine, onSubmit }: { options: string[]; mine: number | undefined; onSubmit(v: number): void }) {
  return (
    <div className="sopts">
      {options.map((o, i) => (
        <button key={i} className={`sopt ${LETTERS[i]} ${mine !== undefined && mine !== i ? 'dim' : ''} ${mine === i ? 'mine' : ''}`} disabled={mine !== undefined} onClick={() => onSubmit(i)}>
          <b>{LETTERS[i]}</b>
          <span>{o}</span>
        </button>
      ))}
    </div>
  );
}

function Confirm({ disabled, onClick }: { disabled: boolean; onClick(): void }) {
  return <button className="primary big confirm" disabled={disabled} onClick={onClick}>Confirmar</button>;
}

function TapWords({ words, mine, onSubmit }: { words: string[]; mine: number[] | undefined; onSubmit(v: number[]): void }) {
  const [sel, setSel] = useState<number[]>([]);
  const cur = mine ?? sel;
  const toggle = (i: number) => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  return (
    <div className="stack-fill">
      <div className="words">
        {words.map((w, i) => (
          <button key={i} className={`word ${cur.includes(i) ? 'on' : ''}`} disabled={mine !== undefined} onClick={() => toggle(i)}>{w}</button>
        ))}
      </div>
      {mine === undefined && <Confirm disabled={!sel.length} onClick={() => onSubmit([...sel].sort((a, b) => a - b))} />}
    </div>
  );
}

/** Setas ↑↓ (sempre fiáveis) e arrastar pela pega (o arrastar no Safari falha às vezes). */
function OrderInput({ items, mine, onSubmit }: { items: string[]; mine: number[] | undefined; onSubmit(v: number[]): void }) {
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [drag, setDrag] = useState<number | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const cur = mine ?? order;
  const locked = mine !== undefined;
  const move = (from: number, to: number) =>
    setOrder((o) => {
      if (to < 0 || to >= o.length || from === to) return o;
      const n = [...o];
      n.splice(to, 0, n.splice(from, 1)[0]);
      return n;
    });
  const onMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    const j = rows.current.findIndex((r) => r && e.clientY >= r.getBoundingClientRect().top && e.clientY <= r.getBoundingClientRect().bottom);
    if (j >= 0 && j !== drag) {
      move(drag, j);
      setDrag(j);
    }
  };
  return (
    <div className="stack-fill">
      <ol className="order" onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {cur.map((it, pos) => (
          <li key={it} ref={(el) => { rows.current[pos] = el; }} className={drag === pos ? 'drag' : ''}>
            <span className="grip" aria-hidden onPointerDown={(e) => { if (locked) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(pos); }}>⠿</span>
            <b>{pos + 1}</b>
            <span className="grow">{items[it]}</span>
            <button aria-label="Subir" disabled={locked || pos === 0} onClick={() => move(pos, pos - 1)}>↑</button>
            <button aria-label="Descer" disabled={locked || pos === cur.length - 1} onClick={() => move(pos, pos + 1)}>↓</button>
          </li>
        ))}
      </ol>
      {!locked && <Confirm disabled={false} onClick={() => onSubmit(order)} />}
    </div>
  );
}

function CompleteInput({ body, mine, onSubmit }: { body: Extract<PublicBody, { type: 'complete' }>; mine: string[] | undefined; onSubmit(v: string[]): void }) {
  const blanks = body.text.split(BLANK).length - 1;
  const [vals, setVals] = useState<string[]>(() => Array(blanks).fill(''));
  const cur = mine ?? vals;
  const text = (
    <div className="cloze">
      {withBlanks(body.text, (i) =>
        body.options ? (
          <span className={`slot ${cur[i] ? 'filled' : ''}`}>{cur[i] || '      '}</span>
        ) : (
          <input
            className="blank" aria-label={`Lacuna ${i + 1}`} value={cur[i]} disabled={mine !== undefined} maxLength={60} size={Math.max(8, cur[i].length + 2)}
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
            onChange={(e) => setVals((v) => v.map((x, k) => (k === i ? e.target.value : x)))}
            onKeyDown={(e) => e.key === 'Enter' && vals.some((x) => x.trim()) && onSubmit(vals)}
          />
        ),
      )}
    </div>
  );
  if (body.options) {
    return (
      <div className="stack-fill">
        {text}
        <div className="chips-choice">
          {body.options.map((o) => (
            <button key={o} className={`word ${mine?.[0] === o ? 'on' : ''} ${mine && mine[0] !== o ? 'dim' : ''}`} disabled={mine !== undefined} onClick={() => onSubmit([o])}>{o}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="stack-fill">
      {text}
      {mine === undefined && <Confirm disabled={!vals.some((x) => x.trim())} onClick={() => onSubmit(vals)} />}
    </div>
  );
}

/** Toca num item da esquerda e depois num da direita. Tocar num par já ligado desliga-o. */
function MatchInput({ left, right, mine, onSubmit }: { left: string[]; right: string[]; mine: number[] | undefined; onSubmit(v: number[]): void }) {
  const [links, setLinks] = useState<number[]>(() => left.map(() => -1));
  const [selL, setSelL] = useState<number | null>(null);
  const cur = mine ?? links;
  const locked = mine !== undefined;
  const tapLeft = (i: number) => {
    if (links[i] >= 0) {
      setLinks((l) => l.map((x, k) => (k === i ? -1 : x)));
      setSelL(i);
    } else setSelL(selL === i ? null : i);
  };
  const tapRight = (j: number) => {
    const owner = links.indexOf(j);
    if (selL === null) {
      if (owner >= 0) {
        setLinks((l) => l.map((x, k) => (k === owner ? -1 : x)));
        setSelL(owner);
      }
      return;
    }
    setLinks((l) => l.map((x, k) => (k === selL ? j : x === j ? -1 : x)));
    setSelL(null);
  };
  return (
    <div className="stack-fill">
      <div className="match">
        <div>
          {left.map((l, i) => (
            <button key={i} className={`mitem ${cur[i] >= 0 ? `pair p${i % 6}` : ''} ${selL === i ? 'sel' : ''}`} disabled={locked} onClick={() => tapLeft(i)}>{l}</button>
          ))}
        </div>
        <div>
          {right.map((r, j) => {
            const owner = cur.indexOf(j);
            return <button key={j} className={`mitem ${owner >= 0 ? `pair p${owner % 6}` : ''}`} disabled={locked} onClick={() => tapRight(j)}>{r}</button>;
          })}
        </div>
      </div>
      {!locked && <Confirm disabled={links.every((x) => x < 0)} onClick={() => onSubmit(links)} />}
    </div>
  );
}

// ------------------------------------------------------------- anfitrião

/** Material no projetor; com `solution` (só na revelação) mostra a solução. */
export function HostBody({ body, solution }: { body: PublicBody; solution?: Solution }) {
  const rev = !!solution;
  switch (body.type) {
    case 'multiple_choice':
    case 'excerpt': {
      const idx = solution && (solution.type === 'multiple_choice' || solution.type === 'excerpt') ? solution.index : -1;
      return (
        <>
          {body.type === 'excerpt' && <div className="hexcerpt">{body.excerpt}</div>}
          <div className="opts">
            {body.options.map((o, i) => (
              <div key={i} className={`opt ${LETTERS[i]} ${rev ? (i === idx ? 'right' : 'dim') : ''}`}><b>{LETTERS[i]}</b>{o}</div>
            ))}
          </div>
        </>
      );
    }
    case 'true_false': {
      const v = solution?.type === 'true_false' ? solution.value : null;
      return (
        <div className="opts">
          {[true, false].map((x) => (
            <div key={String(x)} className={`opt ${x ? 'T' : 'F'} ${rev ? (v === x ? 'right' : 'dim') : ''}`}><b>{x ? '✔' : '✘'}</b>{x ? 'Verdadeiro' : 'Falso'}</div>
          ))}
        </div>
      );
    }
    case 'tap_word': {
      const ok = solution?.type === 'tap_word' ? solution.indices : [];
      return (
        <div className="hwords">
          {body.words.map((w, i) => <span key={i} className={`hword ${rev ? (ok.includes(i) ? 'right' : 'dim') : ''}`}>{w}</span>)}
        </div>
      );
    }
    case 'order': {
      const items = solution?.type === 'order' ? solution.items : body.items;
      return (
        <div className="hitems">
          {items.map((x, i) => <span key={x} className={`hitem ${rev ? 'right' : ''}`}>{rev && <b>{i + 1}</b>}{x}</span>)}
        </div>
      );
    }
    case 'complete': {
      const answers = solution?.type === 'complete' ? solution.answers : null;
      return (
        <>
          <div className="hcloze">
            {withBlanks(body.text, (i) => (answers ? <span className="hslot right">{answers[i]}</span> : <span className="hslot">&nbsp;</span>))}
          </div>
          {body.options && (
            <div className="hitems">
              {body.options.map((o) => <span key={o} className={`hitem ${answers ? (answers.includes(o) ? 'right' : 'dim') : ''}`}>{o}</span>)}
            </div>
          )}
        </>
      );
    }
    case 'match': {
      if (solution?.type === 'match') {
        return (
          <div className="hpairs">
            {solution.pairs.map(([l, r], i) => <div key={i} className={`hpair p${i % 6}`}><span>{l}</span><i>↔</i><span>{r}</span></div>)}
          </div>
        );
      }
      return (
        <div className="hmatch">
          <div>{body.left.map((l, i) => <span key={i} className="hitem">{l}</span>)}</div>
          <div>{body.right.map((r, i) => <span key={i} className="hitem">{r}</span>)}</div>
        </div>
      );
    }
  }
}
