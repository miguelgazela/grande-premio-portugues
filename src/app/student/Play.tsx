import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Channel } from '../../lib/api';
import { errorMessage } from '../../lib/api';
import type { EndMsg, PublicBody, PublicQuestion, RevealMsg } from '../../lib/protocol';
import type { AnswerValue } from '../../lib/types';
import { useApi } from '../useApi';
import { Asset } from '../ui/Asset';
import { CarPicker } from '../ui/TeamPicker';
import { VEHICLE_WORDS, carDef, type Category } from '../../game/teamStyle';
import { StudentInput, solutionView } from '../ui/Question';
import { clearPlayer, deviceToken, loadAvatar, loadPlayer, savePlayer } from './session';


function readEnd(sessionId: string): EndMsg | null {
  try {
    return JSON.parse(localStorage.getItem(`gpp.end.${sessionId}`) ?? 'null') as EndMsg | null;
  } catch {
    return null;
  }
}

function readVote(playerId: string | undefined): string | null {
  try {
    const v = playerId ? localStorage.getItem(`gpp.vote.${playerId}`) : null;
    return v && carDef(v) ? v : null;
  } catch {
    return null;
  }
}

type View =
  | { k: 'wait'; count: number | null }
  | { k: 'question'; q: PublicQuestion; at: number; full: number; paused?: boolean }
  | { k: 'reveal'; r: RevealMsg; body: PublicBody | null }
  | { k: 'end'; e: EndMsg }
  | { k: 'aborted' };

export function Play() {
  const api = useApi();
  const nav = useNavigate();
  const player = useRef(loadPlayer()).current;
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [view, setView] = useState<View>({ k: 'wait', count: null });
  const [chosen, setChosen] = useState<Record<string, AnswerValue>>({});
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;
  const viewRef = useRef(view);
  viewRef.current = view;
  const lastBody = useRef<{ id: string; body: PublicBody } | null>(null);
  /** Nº do jogo da sala que estamos a seguir (a professora pode abrir outro na mesma sala). */
  const gameRef = useRef<number | null>(null);
  const [problem, setProblem] = useState('');
  const [epoch, setEpoch] = useState(0);
  const channel = useRef<Channel | null>(null);
  const [car, setCar] = useState<string | null>(() => readVote(player?.player_id));
  const carRef = useRef(car);
  // Só se conhece com a primeira mensagem do lobby; até lá não se mostra o seletor (senão piscavam os carros antes dos barcos).
  const [cat, setCat] = useState<Category | null>(null);
  const [leaving, setLeaving] = useState(false);
  const vote = (next: string) => {
    carRef.current = next;
    setCar(next);
    if (!player) return;
    try { localStorage.setItem(`gpp.vote.${player.player_id}`, next); } catch { /* sem armazenamento */ }
    channel.current?.send({ event: 'vote', payload: { player_id: player.player_id, car: next } });
  };

  useEffect(() => {
    if (!player) nav('/', { replace: true });
  }, [player, nav]);

  // Volta a ligar quando o Safari regressa do segundo plano ou a rede volta.
  useEffect(() => {
    const reconnect = () => setEpoch((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && reconnect();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', reconnect);
    window.addEventListener('pageshow', reconnect);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('pageshow', reconnect);
    };
  }, []);

  useEffect(() => {
    if (!api || !player) return;
    let closed = false;
    let ch: Channel | null = null;
    // O canal abre já, sem esperar pelo RPC: a confirmação de que ainda estamos na sessão corre em paralelo.
    ch = api.openChannel(
      player.session_id,
      (m) => {
        // Terminada pela professora: nada a reabre (um reenvio atrasado da pergunta não pode voltar a pôr o aluno a jogar).
        if (viewRef.current.k === 'aborted' && m.event !== 'aborted') return;
        // Outro jogo na mesma sala? Mensagens de um jogo anterior (atrasadas) ignoram-se; um jogo novo limpa o que
        // respondemos (o mesmo quiz volta a ter as mesmas perguntas) e volta a dizer ao anfitrião quem somos.
        const g = m.event === 'lobby' || m.event === 'question' || m.event === 'end' ? (m.payload as { game?: number }).game : undefined;
        let fresh = false;
        if (g !== undefined) {
          if (gameRef.current !== null && g < gameRef.current) return;
          const cur = viewRef.current;
          const ended = cur.k === 'end' ? cur.e.game : undefined;
          fresh = m.event !== 'end' && ((gameRef.current !== null && g > gameRef.current) || (ended !== undefined && g > ended));
          gameRef.current = g;
          if (fresh) {
            chosenRef.current = {};
            setChosen({});
            lastBody.current = null;
            try { localStorage.removeItem(`gpp.end.${player.session_id}`); } catch { /* sem armazenamento */ }
            ch?.send({ event: 'hello', payload: { player_id: player.player_id, avatar: loadAvatar() ?? undefined, car: carRef.current ?? undefined } });
          }
        }
        switch (m.event) {
          case 'lobby':
            setCat(m.payload.cat === 'barco' || m.payload.cat === 'nave' ? m.payload.cat : 'carro');
            if (fresh || viewRef.current.k === 'wait') setView({ k: 'wait', count: m.payload.count });
            break;
          case 'question': {
            const cur = viewRef.current;
            const same = cur.k === 'question' && cur.q.question_id === m.payload.question_id;
            lastBody.current = { id: m.payload.question_id, body: m.payload.body };
            setView({ k: 'question', q: m.payload, at: Date.now(), full: same ? cur.full : m.payload.time, paused: m.payload.paused === true });
            const prev = chosenRef.current[m.payload.question_id];
            if (prev !== undefined) ch?.send({ event: 'answer', payload: { player_id: player.player_id, question_id: m.payload.question_id, value: prev } });
            break;
          }
          case 'pause': {
            const cur = viewRef.current;
            if (cur.k === 'question') setView({ ...cur, q: { ...cur.q, time: m.payload.time }, at: Date.now(), paused: m.payload.paused });
            break;
          }
          case 'reveal':
            setView({ k: 'reveal', r: m.payload, body: lastBody.current?.id === m.payload.question_id ? lastBody.current.body : null });
            break;
          case 'end':
            try { localStorage.setItem(`gpp.end.${player.session_id}`, JSON.stringify(m.payload)); } catch { /* sem armazenamento */ }
            setView({ k: 'end', e: m.payload });
            break;
          case 'aborted':
            try { localStorage.setItem(`gpp.aborted.${player.session_id}`, '1'); } catch { /* sem armazenamento */ }
            setView({ k: 'aborted' });
            break;
          case 'renamed':
            if (m.payload.player_id === player.player_id && typeof m.payload.nickname === 'string') {
              savePlayer({ ...player, nickname: m.payload.nickname });
              setNickname(m.payload.nickname);
            }
            break;
          case 'kicked':
            if (m.payload.player_id === player.player_id) {
              clearPlayer();
              nav('/', { replace: true });
            }
            break;
        }
      },
      (ok) => ok && ch?.send({ event: 'hello', payload: { player_id: player.player_id, avatar: loadAvatar() ?? undefined, car: carRef.current ?? undefined } }),
    );
    channel.current = ch;
    void (async () => {
      try {
        // Confirma que ainda estamos na sessão (e não fomos expulsos).
        const r = await api.joinSession(player.pin, player.nickname, deviceToken());
        if (r.nickname !== player.nickname) {
          savePlayer({ ...player, nickname: r.nickname }); // a professora mudou-me a alcunha
          setNickname(r.nickname);
        }
      } catch (e) {
        if (closed) return;
        const msg = errorMessage(e);
        const savedEnd = msg === 'PIN inválido' ? readEnd(player.session_id) : null;
        if (savedEnd) {
          // O canal fica aberto: a professora pode abrir outro jogo na mesma sala e o aluno tem de o ouvir.
          setView({ k: 'end', e: savedEnd });
          return;
        }
        if (msg === 'PIN inválido' && localStorage.getItem(`gpp.aborted.${player.session_id}`)) {
          setView({ k: 'aborted' });
          ch?.close();
          return;
        }
        if (msg === 'PIN inválido' || msg.startsWith('Removido')) {
          clearPlayer();
          nav('/', { replace: true });
          return;
        }
        if (msg !== 'A corrida já começou') setProblem(msg);
      }
    })();
    return () => {
      closed = true;
      ch?.close();
      channel.current = null;
    };
  }, [api, player, nav, epoch]);

  // Reenvia a resposta enquanto não há revelação (o anfitrião ignora repetidas).
  useEffect(() => {
    if (view.k !== 'question' || !player) return;
    const qid = view.q.question_id;
    const t = window.setInterval(() => {
      const v = chosenRef.current[qid];
      if (v !== undefined) channel.current?.send({ event: 'answer', payload: { player_id: player.player_id, question_id: qid, value: v } });
    }, 3000);
    return () => clearInterval(t);
  }, [view, player]);

  const leave = () => {
    if (player) channel.current?.send({ event: 'leave', payload: { player_id: player.player_id } });
    // Dá um instante para a mensagem sair antes de fechar o canal.
    window.setTimeout(() => {
      clearPlayer();
      nav('/', { replace: true });
    }, 250);
  };

  const answer = (i: AnswerValue) => {
    if (view.k !== 'question' || !player || chosen[view.q.question_id] !== undefined) return;
    setChosen({ ...chosen, [view.q.question_id]: i });
    channel.current?.send({ event: 'answer', payload: { player_id: player.player_id, question_id: view.q.question_id, value: i } });
  };

  if (!player) return null;

  return (
    <div className="student">
      <header className={`me-bar ${view.k === 'question' || view.k === 'reveal' ? 'compact' : ''}`}>
        <span />
        <div className="me-id">
          {loadAvatar() && <Asset name={loadAvatar()!} className="me-avatar" />}
          <span className="me-name">{nickname}</span>
          {problem && <span className="error"> · {problem}</span>}
        </div>
        <button type="button" className="leave-btn" onClick={() => setLeaving(true)}>Sair</button>
      </header>
      {leaving && (
        <div className="leave-backdrop" role="dialog" aria-modal="true" aria-label="Sair da corrida">
          <div className="leave-card">
            <b>Sair da corrida?</b>
            <small>Deixas de jogar com a turma.</small>
            <div className="leave-actions">
              <button type="button" onClick={() => setLeaving(false)}>Ficar</button>
              <button type="button" className="danger" onClick={leave}>Sair</button>
            </div>
          </div>
        </div>
      )}
      {view.k === 'wait' && (
        <main className="wait">
          <section className="wait-status" aria-live="polite">
            <h1>Estás dentro! 🏁</h1>
            <div className="wait-count">
              {view.count ? <span className="pill">👥 {view.count} na corrida</span> : null}
              <span className="wait-dots">À espera da professora<i>.</i><i>.</i><i>.</i></span>
            </div>
          </section>
          <section className="wait-vote">
            {cat ? (
              <>
                <h2>{VEHICLE_WORDS[cat].vote}</h2>
                <p className="lead">O mais votado ganha.</p>
                <CarPicker value={car} onPick={vote} cat={cat} />
              </>
            ) : null}
          </section>
        </main>
      )}
      {view.k === 'question' && <QuestionView q={view.q} at={view.at} full={view.full} paused={view.paused} mine={chosen[view.q.question_id]} onPick={answer} />}
      {view.k === 'reveal' && <RevealView r={view.r} mine={chosen[view.r.question_id]} body={view.body} me={player.player_id} />}
      {view.k === 'aborted' && (
        <div className="msg">
          <div className="end-box">
            <h1>A professora terminou a sessão</h1>
            <button className="primary big" onClick={() => { clearPlayer(); nav('/'); }}>Voltar ao início</button>
          </div>
        </div>
      )}
      {view.k === 'end' && <EndView e={view.e} me={player.player_id} onExit={() => { clearPlayer(); nav('/'); }} />}
    </div>
  );
}

export function QuestionView({ q, at, full, paused, mine, onPick }: { q: PublicQuestion; at: number; full: number; paused?: boolean; mine: AnswerValue | undefined; onPick(v: AnswerValue): void }) {
  const [left, setLeft] = useState(q.time);
  useEffect(() => {
    if (paused) {
      setLeft(q.time);
      return;
    }
    const t = window.setInterval(() => setLeft(Math.max(0, q.time - (Date.now() - at) / 1000)), 250);
    return () => clearInterval(t);
  }, [q.time, at, paused]);
  return (
    <>
      <div className="sprompt">{q.prompt}</div>
      <div className="timer" style={{ minHeight: 8 }}><i style={{ width: `${Math.min(100, (left / full) * 100)}%` }} /></div>
      {/* `key` repõe o estado local (palavras tocadas, ordem…) a cada pergunta. */}
      <StudentInput key={q.question_id} body={q.body} mine={mine} onSubmit={paused ? () => undefined : onPick} />
      {/* Espaço sempre reservado: o aviso aparece sem mexer nas opções. */}
      <div className="qstatus">
        {paused ? <div className="status-pill paused">⏸ Jogo em pausa</div> : mine !== undefined ? <div className="status-pill sent">✓ Resposta enviada</div> : null}
      </div>
    </>
  );
}

export function RevealView({ r, mine, body, me }: { r: RevealMsg; mine: AnswerValue | undefined; body: PublicBody | null; me: string }) {
  const ok = r.results[me] === true;
  const part = r.partial?.[me];
  const answered = mine !== undefined;
  const tone = ok ? 'r-good' : part ? 'r-half' : 'r-bad';
  const sol = solutionView(r.solution, body);
  const pct = Math.round(r.accuracy * 100);
  return (
    <main className={`reveal ${tone}`}>
      <section className="reveal-result" aria-live="polite">
        <div className="big-result">
          {ok ? <Asset name="ui-check" fallback="✅" /> : part ? '🟡' : answered ? <Asset name="ui-cross" fallback="❌" /> : '⏱️'}
        </div>
        <h1>{ok ? 'Certo!' : part ? `Quase! ${Math.round(part * 100)}% certo` : answered ? 'Errado' : 'Sem resposta'}</h1>
      </section>
      <section className="answer-card" aria-label="Resposta certa">
        <span className="label">{ok ? 'A resposta' : 'A resposta certa'}</span>
        <div className={`answer-main ${sol.tone ?? ''}`}>
          {sol.badge && <b className="answer-badge">{sol.badge}</b>}
          <div className="answer-lines">{sol.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
        </div>
      </section>
      <div className="class-stat"><span className="pill">{pct}% da turma acertou</span></div>
      {r.explanation && <Explanation text={r.explanation} />}
    </main>
  );
}

/** Explicação em cartão próprio; se for longa, mostra o início com "Ler tudo" (nada se perde). */
function Explanation({ text }: { text: string }) {
  const long = text.length > 180;
  const [open, setOpen] = useState(!long);
  return (
    <section className="explain">
      <span className="label">Explicação</span>
      <p className={open ? '' : 'clamped'}>{text}</p>
      {long && <button type="button" className="more-text" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ler menos' : 'Ler tudo'}</button>}
    </section>
  );
}

export function EndView({ e, me, onExit }: { e: EndMsg; me: string; onExit(): void }) {
  const p = e.players[me];
  const won = e.final.teamPosition === 1;
  return (
    <main className="end-box">
      <h1>{won ? '🏆 A turma venceu!' : `🏁 A turma acabou em ${e.final.teamPosition}º`}</h1>
      {p ? (
        <>
          <div className="stats">
            <div className="stat"><b>{p.correct} / {e.final.totalQuestions}</b><span>Acertaste</span></div>
            <div className="stat"><b>{p.bestStreak} <Asset name="ui-flame" className="medal" fallback="🔥" /></b><span>Maior série</span></div>
            <div className="stat"><b>{p.points}</b><span>Pontos para a equipa</span></div>
          </div>
          {p.top && <div className="status-pill sent">⭐ Estás no top 5 de quem mais ajudou!</div>}
        </>
      ) : (
        <p className="lead">Obrigado por jogares!</p>
      )}
      <button className="big" onClick={onExit}>Sair</button>
    </main>
  );
}
