import { useEffect, useState } from 'react';
import { VersionTag } from '../ui/VersionTag';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { BotField } from '../../engine/drivers';
import { themeForTrack } from '../../engine/theme';
import { TRACKS } from '../../engine/track';
import { raceConfigFor } from '../../game/raceSettings';
import { errorMessage } from '../../lib/api';
import { endSessions } from '../../lib/endSessions';
import { bestPerClass, compatibleRecords, fmtTime, ghostLabel, sameTrackAs, trackRecord, type GhostRecord } from '../../lib/ghosts';
import type { ClassRow, QuestionRow, QuizRow, SessionRow, SessionSettings } from '../../lib/types';
import { useTeacher } from './TeacherGate';

const FIELDS: { key: BotField; label: string }[] = [
  { key: 'facil', label: 'Fácil' },
  { key: 'medio', label: 'Médio' },
  { key: 'dificil', label: 'Difícil' },
];
const TIMES: { value: number; label: string }[] = [
  { value: 0, label: 'Do quiz' },
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
  { value: 45, label: '45 s' },
];
/** Tema visual da pista (o traçado é sempre gerado de novo); '' = sorteado pela sessão. Cada tema usa o id de pista antigo (`trackId`). */
const TRACK_CHOICES: { id: string; label: string }[] = [
  { id: '', label: 'Aleatória' },
  ...TRACKS.map((t) => ({ id: t.id, label: themeForTrack(t.id).name })),
];
const RECENT = 3;
const LAST_KEY = 'gpp.lastGame';

/** Última escolha da professora, guardada neste iPad. */
interface LastGame { quizId: string; classId: string; field: BotField; time: number; track: string }

function readLast(): LastGame | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as Partial<LastGame> | null;
    if (!v || typeof v.quizId !== 'string') return null;
    return {
      quizId: v.quizId,
      classId: typeof v.classId === 'string' ? v.classId : '',
      field: FIELDS.some((f) => f.key === v.field) ? (v.field as BotField) : 'medio',
      time: typeof v.time === 'number' ? v.time : 0,
      track: typeof v.track === 'string' && TRACKS.some((t) => t.id === v.track) ? v.track : '',
    };
  } catch {
    return null;
  }
}

function writeLast(v: LastGame) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    /* sem armazenamento: só perde o atalho */
  }
}

/**
 * Área "Jogar" (iPad): repetir o último jogo, ou escolher quiz e turma, e abrir a sala.
 * Com `?sala=<id>` (vindo do ecrã final) escolhe-se só o próximo jogo da MESMA sala: mesmo PIN, turma e alunos.
 */
export function Jogar() {
  const { api, teacher, signOut } = useTeacher();
  const nav = useNavigate();
  const salaId = useSearchParams()[0].get('sala');
  const [room, setRoom] = useState<SessionRow | null>(null);
  const [quizzes, setQuizzes] = useState<QuizRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [last, setLast] = useState<LastGame | null>(null);
  const [quizId, setQuizId] = useState('');
  const [classId, setClassId] = useState('');
  const [field, setField] = useState<BotField>('medio');
  const [time, setTime] = useState(0); // 0 = o do quiz
  const [track, setTrack] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [records, setRecords] = useState<GhostRecord[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        // Sair da sessão termina o jogo; o que sobrar aberto (iPad fechado a meio) limpa-se aqui.
        const [q, c, o] = await Promise.all([api.listQuizzes(), api.listClasses(), api.listOpenSessions()]);
        if (salaId) {
          const r = await api.getSession(salaId);
          if (r.status === 'lobby' || r.status === 'running') {
            nav(`/prof/jogo/${r.id}`, { replace: true }); // o jogo seguinte já foi aberto: segue para lá
            return;
          }
          if (r.status === 'aborted') throw new Error('Esta sala já foi terminada. Abre uma sala nova.');
          setRoom(r);
        }
        if (o.length) void endSessions(api, o.map((x) => x.id)).catch(() => undefined);
        const sorted = [...q].sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '') || a.title.localeCompare(b.title, 'pt'));
        const l = readLast();
        const usable = l && sorted.find((x) => x.id === l.quizId && x.questionCount > 0) ? l : null;
        const first = usable ? sorted.find((x) => x.id === usable.quizId) : sorted.find((x) => x.questionCount > 0);
        setQuizzes(sorted);
        setClasses(c);
        if (usable) {
          setLast({ ...usable, classId: c.some((x) => x.id === usable.classId) ? usable.classId : '' });
          setClassId(c.some((x) => x.id === usable.classId) ? usable.classId : '');
          setField(usable.field);
          setTime(usable.time);
          setTrack(usable.track);
        }
        if (first) setQuizId(first.id);
      } catch (e) {
        setError(errorMessage(e));
        setQuizzes([]);
      }
    })();
  }, [api, salaId, nav]);

  const quiz = quizzes?.find((q) => q.id === quizId);
  const n = quiz?.questionCount ?? 0;

  // Corridas anteriores do quiz escolhido (para fantasmas e recorde).
  useEffect(() => {
    setPicked([]);
    setRecords([]);
    setQuestions([]);
    if (!quiz) return;
    let gone = false;
    void Promise.all([api.loadQuestions(quiz.id, quiz.version), api.listGhostRecords(quiz.id, quiz.version)])
      .then(([qs, rs]) => {
        if (gone) return;
        setQuestions(qs);
        setRecords(rs);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, quizId, quizzes]);

  const shape = raceConfigFor(questions, { botField: field, questionTime: time || null }).config;
  const compat = compatibleRecords(records, shape);
  const chosen = picked.flatMap((id) => compat.filter((g) => g.game_id === id));
  const shown = sameTrackAs(compat, chosen);
  const stars = bestPerClass(compat);
  const record = trackRecord(records, shape);
  const togglePick = (id: string) => {
    setDirty(true);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 3 ? [...cur, id] : cur));
  };
  // Se mudar a configuração, descarta os fantasmas que deixaram de ser compatíveis.
  const validPicked = chosen.map((g) => g.game_id);
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };

  const open = async (target: QuizRow, game: LastGame, ghosts: GhostRecord[]) => {
    setBusy(true);
    setError('');
    try {
      const settings: SessionSettings = { botField: game.field, questionTime: game.time || null };
      if (game.track && !ghosts.length) settings.trackId = game.track;
      if (ghosts.length) {
        settings.trackId = ghosts[0].trackId;
        settings.ghosts = ghosts.map((g) => ({ gameId: g.game_id, name: ghostLabel(g) }));
      }
      const s = room ? await api.createGame(room.id, target, settings) : await api.createSession(target, game.classId || null, settings);
      writeLast(room ? { ...game, classId: room.class_id ?? '' } : game);
      nav(`/prof/jogo/${s.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const lastQuiz = last ? quizzes?.find((q) => q.id === last.quizId) : undefined;
  const lastClass = last ? classes.find((c) => c.id === last.classId) : undefined;
  const botLabel = (k: BotField) => FIELDS.find((f) => f.key === k)!.label;
  const timeLabel = (v: number) => TIMES.find((t) => t.value === v)?.label ?? `${v} s`;
  const recent = quizzes ? quizzes.filter((q) => q.questionCount > 0) : [];
  const visible = showAll ? quizzes ?? [] : recent.slice(0, RECENT).concat(recent.slice(RECENT).filter((q) => q.id === quizId));
  const hasMore = (quizzes?.length ?? 0) > visible.length;
  const showBar = !lastQuiz || dirty || !!room;

  return (
    <div className="center jogar">
      <div className="card wide">
        <div className="row spread">
          <h1>{room ? `🏎️ Outro quiz · sala ${room.pin}` : `🏎️ Olá, ${teacher.name}`}</h1>
          {room ? (
            <div className="row"><button className="nav-btn" onClick={() => nav(`/prof/jogo/${room.id}`)}>← Voltar ao resultado</button></div>
          ) : (
            <div className="row">
              <button className="nav-btn" onClick={() => nav('/prof/revisao')}>Revisão</button>
              <button className="nav-btn" onClick={() => nav('/prof/preparar')}>Preparar</button>
              <button className="nav-btn ghost" onClick={signOut}>Sair</button>
            </div>
          )}
        </div>

        <div className="jogar-cols">
        {!room && last && lastQuiz && (
          <section className="hero" aria-labelledby="again-h">
            <div className="muted" id="again-h">Repetir o último jogo</div>
            <div className="hero-what">{lastQuiz.title}{lastClass ? ` · ${lastClass.name}` : ''}</div>
            <div className="tags">
              <span className="tag">Bots {botLabel(last.field).toLowerCase()}</span>
              <span className="tag">Tempo {last.time ? `${last.time} s` : 'do quiz'}</span>
            </div>
            <button className="primary big" disabled={busy} onClick={() => void open(lastQuiz, last, [])}>{busy ? 'A abrir…' : '🏁 Abrir sala'}</button>
          </section>
        )}

        <section className="group pick">
          <h2 className="sec">{room ? 'Próximo jogo (os alunos ficam na sala)' : last && lastQuiz ? 'Ou escolher outro jogo' : 'Novo jogo'}</h2>
          <div className="group" role="radiogroup" aria-label="Quiz">
            <b>Quiz</b>
            {quizzes === null && <p className="muted">A carregar…</p>}
            {quizzes?.length === 0 && <p className="muted">Ainda não há quizzes. Cria um em “Preparar”.</p>}
            {visible.map((q) => (
              <button
                key={q.id}
                role="radio"
                aria-checked={q.id === quizId}
                disabled={q.questionCount === 0}
                className={`quiz-btn ${q.id === quizId ? 'sel' : ''}`}
                onClick={() => change(() => setQuizId(q.id))}
              >
                <span>
                  <b>{q.title}</b>
                  <small>{q.year ? `${q.year}º ano · ` : ''}{q.questionCount} perguntas</small>
                </span>
                {q.id === quizId && <span className="tick" aria-hidden="true">✓</span>}
              </button>
            ))}
            {hasMore && <button className="ghost more-btn" onClick={() => setShowAll(true)}>Ver todos os quizzes</button>}
          </div>

          {!room && <div className="group" role="radiogroup" aria-label="Turma">
            <b>Turma</b>
            <div className="chips-choice">
              {[...classes.map((c) => ({ id: c.id, name: c.name })), { id: '', name: 'Sem turma' }].map((c) => (
                <button key={c.id || 'none'} role="radio" aria-checked={classId === c.id} className={`choice ${classId === c.id ? 'sel' : ''}`} onClick={() => change(() => setClassId(c.id))}>{c.name}</button>
              ))}
            </div>
            {classes.length === 0 && <span className="muted">As turmas criam-se em “Preparar → Turmas”.</span>}
          </div>}

        </section>

        <div className="adv-area">
          <details className="more">
            <summary>
              <span>Ajustar corrida</span>
              <span className="sum">Bots {botLabel(field).toLowerCase()}{time ? ` · ${timeLabel(time)}` : ''}{track && !validPicked.length ? ` · ${TRACK_CHOICES.find((t) => t.id === track)?.label}` : ''}{validPicked.length ? ` · ${validPicked.length} 👻` : ''}</span>
            </summary>
            <div className="adv">
              <div className="field">
                <b>Bots</b>
                <div className="seg" role="radiogroup" aria-label="Dificuldade dos bots">
                  {FIELDS.map((f) => (
                    <button key={f.key} role="radio" aria-checked={field === f.key} className={field === f.key ? 'on' : ''} onClick={() => change(() => setField(f.key))}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <b>Tempo por pergunta</b>
                <div className="seg" role="radiogroup" aria-label="Tempo por pergunta">
                  {TIMES.map((t) => (
                    <button key={t.value} role="radio" aria-checked={time === t.value} className={time === t.value ? 'on' : ''} onClick={() => change(() => setTime(t.value))}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <b>Tema da pista</b>
                <div className="seg" role="radiogroup" aria-label="Tema da pista">
                  {TRACK_CHOICES.map((t) => (
                    <button key={t.id || 'rnd'} role="radio" aria-checked={track === t.id} disabled={validPicked.length > 0} className={track === t.id ? 'on' : ''} onClick={() => change(() => setTrack(t.id))}>{t.label}</button>
                  ))}
                </div>
                {validPicked.length > 0 && <span className="muted">Com fantasmas, o tema é o deles.</span>}
              </div>
              {compat.length > 0 && (
                <div className="field">
                  <b>Fantasmas de outras turmas</b>
                  {record && <span className="muted">🏆 Recorde: <b>{fmtTime(record.finish_time_ms)}</b> ({ghostLabel(record)})</span>}
                  {shown.map((g) => {
                    const on = validPicked.includes(g.game_id);
                    return (
                      <button key={g.game_id} aria-pressed={on} className={`ghost-row ${on ? 'sel' : ''}`} disabled={!on && validPicked.length >= 3} onClick={() => togglePick(g.game_id)}>
                        <span>
                          <b>{ghostLabel(g)}</b> {stars.has(g.game_id) && <span>⭐</span>}{' '}
                          <span className="muted">{g.final_position}º lugar · {fmtTime(g.finish_time_ms)}</span>
                        </span>
                        {on && <span className="tick" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                  {validPicked.length > 0 && <span className="muted">Os fantasmas ocupam o lugar dos bots; a pista é a deles.</span>}
                </div>
              )}
            </div>
          </details>
        </div>

      <VersionTag />
      {showBar && (
        <div className="actionbar">
          <button className="primary big" disabled={!quiz || busy || n < 1} onClick={() => quiz && void open(quiz, { quizId: quiz.id, classId, field, time, track }, chosen)}>
            {busy ? 'A abrir…' : room ? '🏁 Abrir o jogo' : '🏁 Abrir sala'}
          </button>
        </div>
      )}
        </div>
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
