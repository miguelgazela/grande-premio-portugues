import QRCode from 'qrcode';
import { VersionTag } from '../ui/VersionTag';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { inFinalStretch } from '../../engine/config';
import { HostGame, type HostSnapshot } from '../../game/hostGame';
import { raceConfigFor } from '../../game/raceSettings';
import { improved, repeatSettings, stillFailing } from '../../lib/review';
import type { ReviewResult } from '../../lib/types';
import { fmtSeconds, fmtTime, ghostMessage, trackRecord, usableRecords } from '../../lib/ghosts';
import { errorMessage } from '../../lib/api';
import { endSessions } from '../../lib/endSessions';
import { keepAwake, wakeLockSupported } from '../../lib/wakeLock';
import { RaceView } from '../../render/raceView';
import { isMuted, play, setMuted } from '../../lib/audio';
import { assetUrl } from '../../render/assets';
import { themeForTrack } from '../../engine/theme';
import { Asset, Countdown, Flames, Place } from '../ui/Asset';
import { fitAvatars } from '../../lib/avatarRow';
import { carDef } from '../../game/teamStyle';
import { CarPreview } from '../ui/TeamPicker';
import { HostBody } from '../ui/Question';
import { useTeacher } from './TeacherGate';

const EFFECT_TEXT = { turbo: 'TURBO!', normal: 'Bom ritmo', slow: '🐢 A abrandar', spin: '💫 DESPISTE!' } as const;

export function Host() {
  const { id } = useParams();
  const { api } = useTeacher();
  const [game, setGame] = useState<HostGame | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let g: HostGame | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const session = await api.getSession(id!);
        const review = session.settings?.review;
        const questions = review ? await api.loadQuestionsByIds(review.questionIds) : await api.loadQuestions(session.quiz_id, session.quiz_version);
        if (!questions.length) throw new Error(review ? 'Já não existem as perguntas desta revisão.' : 'Este quiz não tem perguntas.');
        const { config } = raceConfigFor(questions, session.settings);
        // Uma revisão não tem fantasmas nem recorde.
        const all = review ? [] : await api.listGhostRecords(session.quiz_id, session.quiz_version).catch(() => []);
        const usable = usableRecords(all);
        const ghosts = (session.settings?.ghosts ?? []).flatMap((x) => usable.filter((r) => r.session_id === x.sessionId));
        g = new HostGame(api, session, questions, { ghosts, record: trackRecord(all, config) });
        await g.init();
        if (cancelled) g.destroy();
        else setGame(g);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      g?.destroy();
    };
  }, [api, id]);

  useEffect(() => keepAwake(), []);

  if (error) return <div className="center"><div className="card"><h2>Erro</h2><p className="error">{error}</p></div></div>;
  if (!game) return <div className="center muted">A preparar a sessão…</div>;
  return <HostScreen game={game} />;
}

function HostScreen({ game }: { game: HostGame }) {
  const s = useSyncExternalStore(game.subscribe, game.getSnapshot);
  const nav = useNavigate();

  if (s.phase === 'finished') return <Podium game={game} s={s} onExit={() => nav('/prof')} />;
  if (s.phase === 'lobby') return <Lobby game={game} s={s} />;
  return <RaceScreen game={game} s={s} />;
}

/** Sair termina o jogo (sempre com confirmação). */
function ExitDialog({ game, onClose }: { game: HostGame; onClose(): void }) {
  const { api } = useTeacher();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = async () => {
    setBusy(true);
    try {
      game.announceAborted();
      await endSessions(api, [game.session.id]);
      nav('/prof');
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="overlay" style={{ zIndex: 20 }} onClick={(e) => e.stopPropagation()}>
      <div className="card" style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
        <h2>Terminar o jogo?</h2>
        <p className="muted">Os alunos veem que a professora terminou e o PIN fica livre. Nada fica no histórico.</p>
        {err && <p className="error">{err}</p>}
        <button className="danger big" disabled={busy} onClick={() => void end()}>{busy ? 'A terminar…' : 'Terminar jogo'}</button>
        <button disabled={busy} onClick={onClose}>Continuar</button>
      </div>
    </div>
  );
}

function Lobby({ game, s }: { game: HostGame; s: HostSnapshot }) {
  const pin = game.session.pin;
  const url = `${location.origin}${location.pathname}#/?pin=${pin}`;
  const [qr, setQr] = useState('');
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 0, width: 512, errorCorrectionLevel: 'M' }).then(setQr);
  }, [url]);

  const suffix = themeForTrack(game.trackId).suffix;
  const bg = suffix ? `menu-title-${suffix}.jpg` : 'menu-title.jpg';

  return (
    <div className="host menubg" style={{ backgroundImage: `url(${assetUrl(bg)})` }}>
      <VersionTag />
      <div className="lobby">
        <div className="join">
          <Asset name="ui-logo" alt="Grande Prémio de Português" className="logo" />
          <div className="muted" style={{ fontSize: 'clamp(16px,3vmin,30px)' }}>Entra em</div>
          <div className="url">{location.host}{location.pathname.replace(/\/$/, '')}</div>
          <div className="pin">{pin}</div>
          {qr && <div className="qr"><img src={qr} alt="QR code para entrar" /></div>}
        </div>
        <div className="who">
          <div className="row spread">
            <h2 style={{ fontSize: 'clamp(20px,4vmin,40px)' }}>{game.session.quiz_title}</h2>
            <span className="muted">{s.players.length} na corrida</span>
          </div>
          {game.extras.record && (
            <p className="muted" style={{ fontSize: 'clamp(14px,2.4vmin,24px)', margin: '4px 0' }}>
              🏆 Recorde da pista: <b>{fmtTime(game.extras.record.finish_time_ms)}</b> ({game.extras.record.class_name ?? 'sem turma'})
            </p>
          )}
          {game.extras.ghosts.length > 0 && (
            <p className="muted" style={{ fontSize: 'clamp(14px,2.4vmin,24px)', margin: '4px 0' }}>
              👻 Fantasmas: {game.extras.ghosts.map((g) => `${g.class_name ?? 'Fantasma'} (${fmtTime(g.finish_time_ms)})`).join(', ')}
            </p>
          )}
          <div className="carbox carshow" aria-live="polite">
            <CarPreview car={s.team.car} size={110} />
            <div>
              <b>{carDef(s.team.car)?.cat === 'barco' ? '🚤 Barco' : '🏎️ Carro'} da turma: {carDef(s.team.car)?.label ?? ''}</b>
              <div className="muted" style={{ fontSize: 'clamp(13px,2.2vmin,22px)' }}>
                {s.tie ? `Empate nos votos: ${carDef(s.team.car)?.cat === 'barco' ? 'barco' : 'carro'} sorteado · ${s.voters} votos` : s.voters ? `Mais votado · ${s.voters} voto${s.voters > 1 ? 's' : ''}` : 'Por defeito: os alunos podem votar no telemóvel'}
              </div>
            </div>
          </div>
          <div className="chips">
            {s.players.length === 0 && <span className="muted" style={{ fontSize: 'clamp(16px,3vmin,28px)' }}>À espera dos alunos…</span>}
            {s.players.map((p) => (
              <span className="chip" key={p.id}>
                {s.avatars[p.id] && <Asset name={s.avatars[p.id]} className="chip-avatar" />}
                {p.nickname}
                <button aria-label={`Mudar a alcunha de ${p.nickname}`} title="Mudar alcunha" onClick={() => {
                  const nick = window.prompt('Nova alcunha', p.nickname);
                  if (nick !== null && nick.trim() && nick.trim() !== p.nickname) void game.rename(p.id, nick);
                }}>✎</button>
                <button aria-label={`Expulsar ${p.nickname}`} onClick={() => void game.kick(p.id)}>✕</button>
              </span>
            ))}
          </div>
          {!wakeLockSupported() && <p className="muted">Dica: desliga o bloqueio automático do iPad (Ajustes → Ecrã e brilho).</p>}
          <div className="row spread" style={{ marginTop: 12 }}>
            <button onClick={() => setExiting(true)}>← Sair</button>
            {s.connected ? <span /> : <span className="offline">○ a ligar…</span>}
            <button className="primary big" disabled={!s.players.length} onClick={() => void game.start()}>🏁 Começar corrida</button>
          </div>
        </div>
      </div>
      {s.notice && <div className="notice">{s.notice}</div>}
      {exiting && <ExitDialog game={game} onClose={() => setExiting(false)} />}
    </div>
  );
}

function RaceScreen({ game, s }: { game: HostGame; s: HostSnapshot }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [rank, setRank] = useState(0);
  const [pop, setPop] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [exiting, setExiting] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const inQuestion = s.phase === 'question';
  const showReveal = s.phase === 'reveal' && s.reveal;
  // Na contagem já se reserva o espaço da primeira pergunta (invisível), para a pista não saltar quando ela aparece.
  const panel = s.question ?? (s.phase === 'countdown' ? game.previewFirst() : null);

  useEffect(() => {
    const view = new RaceView(game.track, { sprites: true, follow: true, trackId: game.trackId });
    let mounted = false;
    let gone = false;
    let lastRank = 0;
    let lastPop = -10;
    view.mount(stageRef.current!).then(
      () => {
        if (gone) view.destroy();
        else mounted = true;
      },
      (err: unknown) => {
        // Without this a failed renderer leaves the stage silently dark.
        console.error('RaceView mount failed', err);
        if (!gone) setStageError(err instanceof Error ? err.message : String(err));
      },
    );
    const off = game.onFrame((clock) => {
      if (!mounted) return;
      view.render(game.race, clock);
      const r = game.race.rankOf(game.race.team!);
      if (r !== lastRank) {
        const ph = game.getSnapshot().phase;
        // Só conta como ultrapassagem a corrida a sério (não a grelha de partida) e com intervalo entre avisos.
        if (lastRank && r < lastRank && ['question', 'reveal', 'sprint'].includes(ph) && clock - lastPop > 2) {
          lastPop = clock;
          setPop((n) => n + 1);
          play('overtake');
          view.cheer();
        }
        lastRank = r;
        setRank(r);
      }
    });
    return () => {
      gone = true;
      off();
      if (mounted) view.destroy();
    };
  }, [game]);

  const finalLap = inFinalStretch(game.config, s.qIndex) && s.phase !== 'resume';
  const low = s.timeLeft <= 5;

  return (
    <div className="host">
      <div className="hud">
        <span>{s.phase === 'sprint' || s.phase === 'finishing' || s.qIndex >= s.total ? '🏁 Sprint final' : `Pergunta ${s.qIndex + 1}/${s.total}`}</span>
        <span>
          {finalLap ? 'RETA FINAL ×2' : ''}
          <Flames streak={game.race.team?.turboStreak ?? 0} nitro={!!s.reveal?.nitro && s.phase === 'reveal'} />
        </span>
        <span className="pos">{rank ? `${rank}º lugar` : ''}</span>
      </div>

      <div className="ctl">
        <button onClick={() => game.togglePause()} aria-label="Pausar">{s.paused && !s.hidden ? '▶' : '⏸'}</button>
        {(s.phase === 'question' || s.phase === 'reveal') && <button onClick={() => game.skip()} aria-label="Avançar">⏭</button>}
        <button className="soundbtn" onClick={() => { setMuted(!muted); setMutedState(!muted); }} aria-label={muted ? 'Ligar o som' : 'Desligar o som'}>{muted ? '🔇' : '🔊'}</button>
      </div>

      <div className="stage">
        <div ref={stageRef} />
        {stageError && (
          <div className="notice" role="alert">
            Não foi possível desenhar a pista. Recarrega a página.
            <br />
            <small>{stageError}</small>
          </div>
        )}
        {showReveal && (
          <div className={`banner ${s.reveal!.nitro ? 'nitro' : s.reveal!.effect}`}>
            {(s.reveal!.nitro || s.reveal!.effect === 'turbo') && <Asset name="ui-flame" className="banner-flame" />}
            {s.reveal!.nitro ? 'NITRO!' : EFFECT_TEXT[s.reveal!.effect]} <small style={{ fontSize: '.5em' }}>{Math.round(s.reveal!.accuracy * 100)}% certas</small>
          </div>
        )}
        {pop > 0 && (
          <div key={pop} className="overtake" style={{ backgroundImage: `url(${assetUrl('ui-banner.png')})` }}>
            <Asset name="ui-star" className="star" fallback="⭐" /> +1 POSIÇÃO!
          </div>
        )}
        {s.phase === 'finishing' && <div className="banner turbo">🏁 META!</div>}
      </div>

      {panel && (
        <div className={`qpanel ${s.question ? '' : 'preview'}`} aria-hidden={s.question ? undefined : true}>
          <div className="prompt">{panel.prompt}</div>
          <div className={`timer ${low && inQuestion ? 'low' : ''}`}>
            <i style={{ width: `${inQuestion ? (s.timeLeft / s.questionTime) * 100 : showReveal ? 0 : 100}%` }} />
          </div>
          <HostBody body={panel.body} solution={showReveal ? s.reveal!.solution : undefined} />
          <div className="meta">
            {showReveal && s.reveal!.explanation ? (
              <span className="expl">{s.reveal!.explanation}</span>
            ) : (
              <AnswerRow s={s} reveal={showReveal ? s.reveal : null} />
            )}
            {inQuestion && (
              <span className="tally">
                <b>{s.answered}/{s.players.length}</b> <span className={low ? 'low' : ''}>{Math.ceil(s.timeLeft)}s</span>
              </span>
            )}
          </div>
        </div>
      )}

      {s.phase === 'countdown' && <Countdown value={s.count} />}
      {s.phase === 'resume' && (
        <div className="overlay">
          <div className="card">
            <h2>Corrida em pausa</h2>
            <p className="muted">{s.qIndex >= s.total ? 'Retomar no sprint final.' : `Retomar na pergunta ${s.qIndex + 1} de ${s.total}.`} Os alunos voltam sozinhos.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="primary big" onClick={() => game.resume()}>▶ Retomar</button>
              <button onClick={() => setExiting(true)}>Terminar jogo</button>
            </div>
          </div>
        </div>
      )}
      {s.paused && s.phase !== 'resume' && (
        <div className="overlay" onClick={() => !s.hidden && game.togglePause()}>
          <div>
            <div style={{ fontSize: '12vmin' }}>⏸</div>
            <h2>{s.hidden ? 'Em pausa: a app saiu do ecrã' : 'Em pausa'}</h2>
            {!s.hidden && <button className="primary big">▶ Continuar</button>}
            {!s.hidden && <div style={{ marginTop: 14 }}><button onClick={(e) => { e.stopPropagation(); setExiting(true); }}>Terminar jogo</button></div>}
          </div>
        </div>
      )}
      {exiting && <ExitDialog game={game} onClose={() => setExiting(false)} />}
      {!s.connected && <div className="notice">○ Sem ligação: a tentar reconectar…</div>}
      {s.notice && <div className="notice" style={{ bottom: 50 }}>{s.notice}</div>}
    </div>
  );
}

function Podium({ game, s, onExit }: { game: HostGame; s: HostSnapshot; onExit(): void }) {
  const f = s.final!.final;
  return (
    <div className="host menubg" style={{ backgroundImage: `url(${assetUrl('menu-results.jpg')})` }}>
      <div className="podium">
        <h1>
          {f.teamPosition === 1 && <Asset name="ui-trophy" className="title-icon" fallback="🏆 " />}
          {f.teamPosition === 1 ? 'Vitória da turma!' : `🏁 A turma acabou em ${f.teamPosition}º lugar`}
        </h1>
        {(f.ghost || f.record) && (
          <div className="box ghostbox" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
            {f.ghost && <h2>{ghostMessage(f.ghost)}</h2>}
            {f.record && (
              <p style={{ fontSize: 'clamp(16px,3vmin,30px)', margin: '6px 0 0' }}>
                {f.record.bestMs === null
                  ? `Primeiro tempo desta corrida: ${fmtTime(f.standings.find((c) => c.kind === 'team')?.timeMs ?? 0)}`
                  : f.record.newRecord
                    ? `🏆 Novo recorde! Antes: ${fmtTime(f.record.bestMs)} (${f.record.holder ?? 'sem turma'})`
                    : `Recorde da pista: ${fmtTime(f.record.bestMs)} (${f.record.holder ?? 'sem turma'}) · faltaram ${fmtSeconds(f.record.gapMs)}`}
              </p>
            )}
          </div>
        )}
        <div className="box">
          <h2>Classificação</h2>
          <ol>
            {f.standings.map((c, i) => (
              <li key={i} className={c.kind === 'team' ? 'me' : ''}>
                <span className="who"><Place index={i} />{c.kind === 'team' ? <CarPreview car={f.teamCar ?? 'car-team'} size={44} /> : c.car ? <CarPreview car={c.car} size={44} /> : null} {c.name}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="box">
          <h2>Quem mais ajudou</h2>
          <ol>
            {f.ranking.map((r, i) => (
              <li key={i}>
                <span className="who"><Place index={i} />{r.avatar && <Asset name={r.avatar} className="chip-avatar" />} {r.nickname}</span>
                <small>{r.points} pts · {r.correct} certas</small>
              </li>
            ))}
          </ol>
          <div className="awards">
            {f.awards.map((a, i) => (
              <div className="award" key={i}><span className="award-emoji">{a.emoji}</span> <b>{a.title}</b>{a.nickname}, {a.detail}</div>
            ))}
          </div>
        </div>
        {s.review && <ReviewSummary game={game} />}
        <div style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
          <button className="primary big" onClick={onExit}>Voltar aos quizzes</button>
        </div>
      </div>
    </div>
  );
}

const pctText = (v: number) => `${Math.round(v * 100)}%`;

/** Fim de uma revisão: o que melhorou e o que continua falhado (só agregados da turma, nunca alunos). */
function ReviewSummary({ game }: { game: HostGame }) {
  const { api } = useTeacher();
  const nav = useNavigate();
  const r = game.getSnapshot().review!;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = stillFailing(r);
  const better = improved(r);
  const next = game.session.settings.review ? repeatSettings(game.session.settings.review, r) : null;

  const repeat = async () => {
    if (!next) return;
    setBusy(true);
    try {
      const anchor = { id: game.session.quiz_id, title: next.title, year: null, topic: null, version: game.session.quiz_version, questionCount: next.questionIds.length, lastPlayed: null };
      const settings = { botField: game.session.settings.botField, review: next };
      const s = await api.createSession(anchor, game.session.class_id, settings);
      nav(`/prof/jogo/${s.id}`);
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  const row = (i: ReviewResult['items'][number]) => (
    <li key={i.id} style={{ alignItems: 'center' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.prompt}</span>
      <small style={{ whiteSpace: 'nowrap' }}>{i.before === null ? '' : `${pctText(i.before)} → `}{pctText(i.after)}</small>
    </li>
  );
  return (
    <>
      <div className="box">
        <h2>✅ Já subiram ({better.length})</h2>
        <ol>{better.length ? better.map(row) : <li><span>Nenhuma desta vez.</span></li>}</ol>
      </div>
      <div className="box">
        <h2>🔁 Ainda a trabalhar ({left.length})</h2>
        <ol>{left.length ? left.map(row) : <li><span>Todas acima de {pctText(r.threshold)}. Muito bem!</span></li>}</ol>
      </div>
      {next && (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
          <button className="primary big" disabled={busy} onClick={() => void repeat()}>
            {busy ? 'A criar…' : `Repetir só as ${left.length} que ainda falham`}
          </button>
          {err && <p className="error">{err}</p>}
        </div>
      )}
    </>
  );
}

/** Fila de avatares: cinzento até responder, a cores depois; na revelação, anel verde (certo) ou vermelho (errado). */
function AnswerRow({ s, reveal }: { s: HostSnapshot; reveal: HostSnapshot['reveal'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const done = new Set(s.answeredIds);
  const fit = fitAvatars(s.players.length, box.w, box.h);
  return (
    <div ref={ref} className="answers" role="list" aria-label="Quem já respondeu">
      <div className="answers-grid" style={{ gridTemplateColumns: `repeat(${fit.cols || 1}, ${fit.size}px)`, gridAutoRows: `${fit.size}px`, '--ring': fit.size < 16 ? '1px' : '2px' } as React.CSSProperties}>
        {s.players.map((p) => {
          const has = done.has(p.id);
          const verdict = reveal && has ? (reveal.results[p.id] ? 'right' : (reveal.partial?.[p.id] ?? 0) > 0 ? 'part' : 'wrong') : '';
          return (
            <span key={p.id} role="listitem" className={`ans ${has ? 'on' : ''} ${verdict}`} title={`${p.nickname}${has ? '' : ' (ainda não respondeu)'}`}>
              {s.avatars[p.id] ? <Asset name={s.avatars[p.id]} alt={p.nickname} className="ans-img" fallback={<i>{p.nickname.slice(0, 1)}</i>} /> : <i>{p.nickname.slice(0, 1).toUpperCase()}</i>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
