import { useEffect, useRef, type ReactNode } from 'react';
import type { FinalInfo, FinalStanding } from '../../lib/protocol';
import { listDensity, recordNotes, resultHeadline, splitStandings } from '../../lib/finalView';
import { assetUrl } from '../../render/assets';
import { carDef } from '../../game/teamStyle';
import { Asset, Place } from '../ui/Asset';

/** Carro de um concorrente (a turma usa o seu; fantasmas não têm imagem). */
function Wheels({ c, teamCar }: { c: FinalStanding; teamCar?: string }) {
  const key = c.kind === 'team' ? (teamCar ?? 'car-team') : c.car;
  if (!key) return <span className="fcar ghostmark" aria-hidden="true">👻</span>;
  return <img className="fcar" src={assetUrl(`${key}.png`)} alt={carDef(key)?.label ?? ''} draggable={false} />;
}

/** Ecrã final do anfitrião: resultado da turma, pódio, quem mais ajudou e ações. Só apresentação. */
export function FinalScreen({ f, onNext, onExit, children }: { f: FinalInfo; onNext(): void; onExit(): void; children?: ReactNode }) {
  const head = resultHeadline(f.teamPosition, f.standings.length);
  const notes = recordNotes(f);
  const { podium, rest } = splitStandings(f.standings);
  const [first, second, third] = [f.ranking[0], f.ranking[1], f.ranking[2]];
  const more = f.ranking.slice(3);
  const listRef = useRef<HTMLOListElement>(null);
  // Lista longa com scroll interno: deixa a linha da turma à vista.
  useEffect(() => {
    listRef.current?.querySelector('li.me')?.scrollIntoView({ block: 'nearest' });
  }, [f]);

  return (
    <div className="host menubg final" data-tone={head.tone} style={{ backgroundImage: `url(${assetUrl('menu-results.jpg')})` }}>
      <div className="final-wrap">
        <header className="final-hero">
          <div className="hero-card">
            {head.tone === 'win' ? <Asset name="ui-trophy" className="title-icon" fallback="🏆 " /> : <span className="title-icon flag" aria-hidden="true">🏁</span>}
            <div>
              <h1>{head.title}</h1>
              <p className="hero-sub">{head.sub}</p>
            </div>
          </div>
          {notes.length > 0 && (
            <ul className="final-notes">
              {notes.map((n, i) => (
                <li key={i} className={`note ${n.kind}`}>{n.kind === 'record' && <Asset name="ui-trophy" className="note-icon" fallback="🏆 " />}{n.text}</li>
              ))}
            </ul>
          )}
        </header>

        <main className="final-grid">
          <section className="fcard fstand" aria-labelledby="h-stand">
            <h2 id="h-stand">Classificação</h2>
            <div className="podium3" data-n={podium.length}>
              {podium.map(({ index, car }) => (
                <div key={index} className={`step s${index + 1} ${car.kind === 'team' ? 'me' : ''}`}>
                  <Wheels c={car} teamCar={f.teamCar} />
                  <b className="sname">{car.name}</b>
                  <div className="block"><Place index={index} /></div>
                </div>
              ))}
            </div>
            {rest.length > 0 && (
              <ol ref={listRef} className="frest" data-density={listDensity(rest.length)} start={4}>
                {rest.map(({ index, car }) => (
                  <li key={index} className={car.kind === 'team' ? 'me' : ''}>
                    <Place index={index} />
                    <Wheels c={car} teamCar={f.teamCar} />
                    <span className="sname">{car.name}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="fcard fhelp" aria-labelledby="h-help">
            <h2 id="h-help">Quem mais ajudou</h2>
            {f.ranking.length === 0 && <p className="muted">Ninguém pontuou desta vez.</p>}
            {first && (
              <div className="helpers">
                {[first, second, third].map((r, i) => r && (
                  <div key={i} className={`helper h${i + 1}`}>
                    <Place index={i} />
                    {r.avatar ? <Asset name={r.avatar} className="h-avatar" fallback={<i className="h-avatar">{r.nickname.slice(0, 1)}</i>} /> : <i className="h-avatar">{r.nickname.slice(0, 1).toUpperCase()}</i>}
                    <b className="sname">{r.nickname}</b>
                    <small>{r.points} pts · {r.correct} certas</small>
                  </div>
                ))}
              </div>
            )}
            {more.length > 0 && (
              <ol className="hmore" start={4}>
                {more.map((r, i) => (
                  <li key={i}>
                    <Place index={i + 3} />
                    {r.avatar && <Asset name={r.avatar} className="chip-avatar" />}
                    <b className="sname">{r.nickname}</b>
                    <small>{r.points} pts · {r.correct} certas</small>
                  </li>
                ))}
              </ol>
            )}
            {f.awards.length > 0 && (
              <div className="awards3">
                {f.awards.map((a, i) => (
                  <div className="prize" key={i}>
                    <span className="prize-emoji" aria-hidden="true">{a.emoji}</span>
                    <b>{a.title}</b>
                    <span>{a.nickname}, {a.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {children}
        </main>

        <footer className="final-actions">
          <button className="primary big" onClick={onNext}>Outro quiz, mesma sala</button>
          <button className="big" onClick={onExit}>Voltar aos quizzes</button>
        </footer>
      </div>
    </div>
  );
}
