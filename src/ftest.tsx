import { createRoot } from 'react-dom/client';
import './app/app.css';
import { FinalScreen } from './app/teacher/FinalScreen';
import type { FinalInfo } from './lib/protocol';

const q = new URLSearchParams(location.search);
const n = Number(q.get('n') ?? 7);
const pos = Number(q.get('pos') ?? 1);
const rec = q.get('rec') ?? 'near'; // none | near | new | first
const ghost = q.get('ghost') ?? 'win';
const help = Number(q.get('help') ?? 5);
const aw = Number(q.get('aw') ?? 3);
const NAMES = ['Faísca', 'Cometa', 'Furacão', 'Trovão', 'Foguete', 'Relâmpago', 'Meteoro', 'Tufão', 'Ciclone', 'Rajada'];
const CARS = ['car-team', 'car-green', 'car-orange', 'car-grey', 'car-kart-green', 'car-kart-orange', 'car-pickup-red'];
const others = Array.from({ length: n - 1 }, (_, i) => ({ name: i % 5 === 4 ? `Fantasma ${i}` : `${NAMES[i % 10]}${i >= 10 ? ' ' + (i + 1) : ''}`, kind: (i % 5 === 4 ? 'ghost' : 'bot') as 'ghost' | 'bot', color: 0, car: i % 5 === 4 ? undefined : CARS[(i + 1) % CARS.length], timeMs: 0 }));
const standings = [...others.slice(0, pos - 1), { name: 'Turma', kind: 'team' as const, color: 0, car: 'car-team', timeMs: 396200 }, ...others.slice(pos - 1)];
const people = ['Gaspar', 'Marta', 'Diogo', 'Inês', 'Rui'];
const f: FinalInfo = {
  standings, teamPosition: pos, teamCar: 'car-team', totalQuestions: 10,
  ranking: people.slice(0, help).map((p, i) => ({ nickname: p, points: 1313 - i * 140, correct: 8 - i, avatar: ['avatar-robot-purple', 'avatar-fox', 'avatar-cat', 'avatar-owl', 'avatar-bear'][i] })),
  awards: [{ emoji: '⚡', title: 'Mais rápido', nickname: 'Gaspar', detail: '22% do tempo, em média' }, { emoji: '🎯', title: 'Mais certeiro', nickname: 'Gaspar', detail: '8 certas' }, { emoji: '🔥', title: 'Maior série', nickname: 'Gaspar', detail: '7 seguidas' }].slice(0, aw),
  ghost: ghost === 'none' ? undefined : { name: 'Fantasma', diffMs: ghost === 'win' ? 3200 : -3200 },
  record: rec === 'none' ? undefined : rec === 'first' ? { holder: null, bestMs: null, newRecord: false, gapMs: 0 } : rec === 'new' ? { holder: 'Fantasma', bestMs: 400000, newRecord: true, gapMs: -3800 } : { holder: 'Fantasma', bestMs: 396000, newRecord: false, gapMs: 200 },
};
createRoot(document.getElementById('root')!).render(<FinalScreen f={f} onNext={() => {}} onExit={() => {}} />);
