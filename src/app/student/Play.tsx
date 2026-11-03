import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Channel } from '../../lib/api';
import { errorMessage } from '../../lib/api';
import type { EndMsg, PublicBody, PublicQuestion, RevealMsg } from '../../lib/protocol';
import type { AnswerValue } from '../../lib/types';
import { useApi } from '../useApi';
import { Asset } from '../ui/Asset';
import { TeamPicker } from '../ui/TeamPicker';
import { DEFAULT_STYLE, type StyleVote, type TeamStyle } from '../../game/teamStyle';
import { StudentInput, describeSolution } from '../ui/Question';
import { clearPlayer, deviceToken, loadAvatar, loadPlayer } from './session';


function readEnd(sessionId: string): EndMsg | null {
  try {
    return JSON.parse(localStorage.getItem(`gpp.end.${sessionId}`) ?? 'null') as EndMsg | null;
  } catch {
    return null;
  }
}

type View =
  | { k: 'wait'; count: number | null; team?: TeamStyle }
  | { k: 'question'; q: PublicQuestion; at: number; full: number }
  | { k: 'reveal'; r: RevealMsg; body: PublicBody | null }
  | { k: 'end'; e: EndMsg }
  | { k: 'aborted' };

export function Play() {
  const api = useApi();
  const nav = useNavigate();
  const player = useRef(loadPlayer()).current;
  const [view, setView] = useState<View>({ k: 'wait', count: null });
  const [chosen, setChosen] = useState<Record<string, AnswerValue>>({});
  const chosenRef = useRef(chosen);
  chosenRef.current = chosen;
  const viewRef = useRef(view);
  viewRef.current = view;
  const lastBody = useRef<{ id: string; body: PublicBody } | null>(null);
  const [problem, setProblem] = useState('');
  const [epoch, setEpoch] = useState(0);
  const channel = useRef<Channel | null>(null);
  const voteRef = useRef<StyleVote | null>(null);
  const [mine, setMine] = useState<StyleVote>({});
  const vote = (v: StyleVote) => {
    const next = { ...voteRef.current, ...v };
    voteRef.current = next;
    setMine(next);
    if (player) channel.current?.send({ event: 'vote', payload: { player_id: player.player_id, ...next } });
  };

  useEffect(() => {
    if (!player) nav('/', { replace: true });
  }, [player, nav]);

  // Volta a ligar quando o Safari regressa do segundo plano.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setEpoch((n) => n + 1);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!api || !player) return;
    let closed = false;
    let ch: Channel | null = null;
    void (async () => {
      try {
        // Confirma que ainda estamos na sessão (e não fomos expulsos).
        await api.joinSession(player.pin, player.nickname, deviceToken());
      } catch (e) {
        if (closed) return;
        const msg = errorMessage(e);
        const savedEnd = msg === 'PIN inválido' ? readEnd(player.session_id) : null;
        if (savedEnd) {
          setView({ k: 'end', e: savedEnd });
          return;
        }
        if (msg === 'PIN inválido' && localStorage.getItem(`gpp.aborted.${player.session_id}`)) {
          setView({ k: 'aborted' });
          return;
        }
        if (msg === 'PIN inválido' || msg.startsWith('Removido')) {
          clearPlayer();
          nav('/', { replace: true });
          return;
        }
        if (msg !== 'A corrida já começou') setProblem(msg);
      }
      if (closed) return;
      ch = api.openChannel(
        player.session_id,
        (m) => {
          switch (m.event) {
            case 'lobby':
              if (viewRef.current.k === 'wait') setView({ k: 'wait', count: m.payload.count, team: m.payload.team });
              // O anfitrião ainda pode não ter o meu voto (a lista de alunos atualiza-se aos poucos): repete-o.
              if (voteRef.current) ch?.send({ event: 'vote', payload: { player_id: player.player_id, ...voteRef.current } });
              break;
            case 'question': {
              const cur = viewRef.current;
              const same = cur.k === 'question' && cur.q.question_id === m.payload.question_id;
              lastBody.current = { id: m.payload.question_id, body: m.payload.body };
              setView({ k: 'question', q: m.payload, at: Date.now(), full: same ? cur.full : m.payload.time });
              const prev = chosenRef.current[m.payload.question_id];
              if (prev !== undefined) ch?.send({ event: 'answer', payload: { player_id: player.player_id, question_id: m.payload.question_id, value: prev } });
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
            case 'kicked':
              if (m.payload.player_id === player.player_id) {
                clearPlayer();
                nav('/', { replace: true });
              }
              break;
          }
        },
        (ok) => ok && ch?.send({ event: 'hello', payload: { player_id: player.player_id, avatar: loadAvatar() ?? undefined } }),
      );
      channel.current = ch;
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

  const answer = (i: AnswerValue) => {
    if (view.k !== 'question' || !player || chosen[view.q.question_id] !== undefined) return;
    setChosen({ ...chosen, [view.q.question_id]: i });
    channel.current?.send({ event: 'answer', payload: { player_id: player.player_id, question_id: view.q.question_id, value: i } });
  };

  if (!player) return null;

  return (
    <div className="student">
      <div className="who">{loadAvatar() && <Asset name={loadAvatar()!} className="me-avatar" />}{player.nickname}{problem && <span className="error"> · {problem}</span>}</div>
      {view.k === 'wait' && (
        <div className="msg">
          <div style={{ width: '100%', maxWidth: 520 }}>
            Estás dentro! 🏁<small>{view.count ? `${view.count} na corrida · ` : ''}À espera que a professora comece…</small>
            <small>Vota no carro da turma (ganha o mais votado; num empate sai um à sorte):</small>
            <TeamPicker value={{ ...(view.team ?? DEFAULT_STYLE), ...mine }} onPick={vote} />
          </div>
        </div>
      )}
      {view.k === 'question' && <QuestionView q={view.q} at={view.at} full={view.full} mine={chosen[view.q.question_id]} onPick={answer} />}
      {view.k === 'reveal' && <RevealView r={view.r} mine={chosen[view.r.question_id]} body={view.body} me={player.player_id} />}
      {view.k === 'aborted' && (
        <div className="msg">
          <div style={{ display: 'grid', gap: 16 }}>
            <div>A professora terminou a sessão</div>
            <button className="primary big" onClick={() => { clearPlayer(); nav('/'); }}>Voltar ao início</button>
          </div>
        </div>
      )}
      {view.k === 'end' && <EndView e={view.e} me={player.player_id} onExit={() => { clearPlayer(); nav('/'); }} />}
    </div>
  );
}

function QuestionView({ q, at, full, mine, onPick }: { q: PublicQuestion; at: number; full: number; mine: AnswerValue | undefined; onPick(v: AnswerValue): void }) {
  const [left, setLeft] = useState(q.time);
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, q.time - (Date.now() - at) / 1000)), 250);
    return () => clearInterval(t);
  }, [q.time, at]);
  return (
    <>
      <div className="sprompt">{q.prompt}</div>
      <div className="timer" style={{ minHeight: 8 }}><i style={{ width: `${Math.min(100, (left / full) * 100)}%` }} /></div>
      {/* `key` repõe o estado local (palavras tocadas, ordem…) a cada pergunta. */}
      <StudentInput key={q.question_id} body={q.body} mine={mine} onSubmit={onPick} />
      {mine !== undefined && <div className="who">Resposta enviada ✓</div>}
    </>
  );
}

function RevealView({ r, mine, body, me }: { r: RevealMsg; mine: AnswerValue | undefined; body: PublicBody | null; me: string }) {
  const ok = r.results[me] === true;
  const part = r.partial?.[me];
  const answered = mine !== undefined;
  return (
    <div className="msg">
      <div>
        <div className="big-result">
          {ok ? <Asset name="ui-check" fallback="✅" /> : part ? '🟡' : answered ? <Asset name="ui-cross" fallback="❌" /> : '⏱️'}
        </div>
        {ok ? 'Certo!' : part ? `Quase! ${Math.round(part * 100)}% certo` : answered ? 'Errado' : 'Sem resposta'}
        <small>{describeSolution(r.solution, body)} {Math.round(r.accuracy * 100)}% da turma acertou.</small>
        {r.explanation && <small>{r.explanation}</small>}
      </div>
    </div>
  );
}

function EndView({ e, me, onExit }: { e: EndMsg; me: string; onExit(): void }) {
  const p = e.players[me];
  return (
    <div className="msg">
      <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 480 }}>
        <div>{e.final.teamPosition === 1 ? '🏆 A turma venceu!' : `🏁 A turma acabou em ${e.final.teamPosition}º`}</div>
        {p ? (
          <>
            <div className="stat"><span>Acertaste</span><b>{p.correct} / {e.final.totalQuestions}</b></div>
            <div className="stat"><span>Maior série</span><b>{p.bestStreak} <Asset name="ui-flame" className="medal" fallback="🔥" /></b></div>
            <div className="stat"><span>Pontos para a equipa</span><b>{p.points}</b></div>
            {p.top && <div>⭐ Estás no top 5 de quem mais ajudou!</div>}
          </>
        ) : (
          <small>Obrigado por jogares!</small>
        )}
        <button onClick={onExit}>Sair</button>
      </div>
    </div>
  );
}
