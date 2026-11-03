import './sim.css';
import { DEFAULT_CONFIG, type RaceConfig } from '../engine/config';
import { DEFAULT_SIM, buildRace, runBatch, type SimOptions } from '../engine/batch';
import { BOT_FIELDS, type BotField } from '../engine/drivers';
import { Track, DEFAULT_TRACK_POINTS } from '../engine/track';
import { pickAwards, scoreRace } from '../engine/scoring';
import type { Effect, Race } from '../engine/race';
import { RaceView } from '../render/raceView';

const track = new Track(DEFAULT_TRACK_POINTS);
const config: RaceConfig = { ...DEFAULT_CONFIG };
const sim: SimOptions = { ...DEFAULT_SIM, botSkills: [...DEFAULT_SIM.botSkills] };
let botField: BotField = 'medio';

type Def = { group: string; key: string; label: string; min: number; max: number; step: number; target: 'config' | 'sim'; pct?: boolean };
const DEFS: Def[] = [
  { group: 'Turma', target: 'sim', key: 'classMean', label: 'Nível médio', min: 0.2, max: 0.95, step: 0.01, pct: true },
  { group: 'Turma', target: 'sim', key: 'classSpread', label: 'Dispersão', min: 0, max: 0.35, step: 0.01, pct: true },
  { group: 'Turma', target: 'sim', key: 'classSize', label: 'Alunos', min: 5, max: 32, step: 1 },
  { group: 'Turma', target: 'sim', key: 'participation', label: 'Participação', min: 0.5, max: 1, step: 0.01, pct: true },
  { group: 'Turma', target: 'sim', key: 'difficultySpread', label: 'Variação de dificuldade', min: 0, max: 0.4, step: 0.01, pct: true },
  { group: 'Corrida', target: 'config', key: 'laps', label: 'Voltas', min: 1, max: 5, step: 1 },
  { group: 'Corrida', target: 'config', key: 'questionsPerLap', label: 'Perguntas por volta', min: 3, max: 10, step: 1 },
  { group: 'Corrida', target: 'config', key: 'questionTime', label: 'Tempo de resposta (s)', min: 5, max: 40, step: 1 },
  { group: 'Velocidade', target: 'config', key: 'minFactor', label: 'Fator a 0%', min: 0.2, max: 1, step: 0.05 },
  { group: 'Velocidade', target: 'config', key: 'maxFactor', label: 'Fator a 100%', min: 1, max: 2, step: 0.05 },
  { group: 'Velocidade', target: 'config', key: 'turboThreshold', label: 'Limite turbo', min: 0.5, max: 1, step: 0.05, pct: true },
  { group: 'Velocidade', target: 'config', key: 'turboMult', label: 'Multiplicador turbo', min: 1, max: 1.5, step: 0.01 },
  { group: 'Velocidade', target: 'config', key: 'spinThreshold', label: 'Limite despiste', min: 0, max: 0.5, step: 0.05, pct: true },
  { group: 'Velocidade', target: 'config', key: 'spinDuration', label: 'Duração despiste (s)', min: 0, max: 5, step: 0.5 },
  { group: 'Velocidade', target: 'config', key: 'speedBonusMax', label: 'Bónus rapidez máx.', min: 0, max: 0.3, step: 0.01, pct: true },
  { group: 'Velocidade', target: 'config', key: 'nitroMult', label: 'Multiplicador nitro', min: 1, max: 2, step: 0.05 },
  { group: 'Velocidade', target: 'config', key: 'finalLapMult', label: 'Amplificação volta final', min: 1, max: 3, step: 0.1 },
  { group: 'Bots', target: 'config', key: 'rubberBand', label: 'Rubber-band', min: 0, max: 4, step: 0.1 },
  { group: 'Bots', target: 'config', key: 'rubberBandCap', label: 'Rubber-band máx.', min: 0, max: 0.5, step: 0.01, pct: true },
];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fmt = (d: Def, v: number) => (d.pct ? `${Math.round(v * 100)}%` : String(Math.round(v * 100) / 100));
const get = (d: Def) => (d.target === 'config' ? (config as unknown as Record<string, number>) : (sim as unknown as Record<string, number>))[d.key];
const set = (d: Def, v: number) => {
  (d.target === 'config' ? (config as unknown as Record<string, number>) : (sim as unknown as Record<string, number>))[d.key] = v;
};

function buildSliders() {
  const root = $('#sliders');
  root.innerHTML = '';
  const groups = new Map<string, HTMLFieldSetElement>();
  for (const d of DEFS) {
    let fs = groups.get(d.group);
    if (!fs) {
      fs = document.createElement('fieldset');
      fs.innerHTML = `<legend>${d.group}</legend>`;
      groups.set(d.group, fs);
      root.appendChild(fs);
    }
    const row = document.createElement('label');
    row.className = 'slider';
    row.innerHTML = `${d.label}<span>${fmt(d, get(d))}</span><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${get(d)}">`;
    const input = row.querySelector('input')!;
    const out = row.querySelector('span')!;
    input.addEventListener('input', () => {
      set(d, Number(input.value));
      out.textContent = fmt(d, Number(input.value));
      scheduleBatch();
    });
    fs.appendChild(row);
  }
  const bots = groups.get('Bots')!;
  const row = document.createElement('label');
  row.className = 'slider';
  row.innerHTML = `Dificuldade dos bots<span></span><select>${Object.keys(BOT_FIELDS).map((k) => `<option ${k === botField ? 'selected' : ''}>${k}</option>`).join('')}</select>`;
  const select = row.querySelector('select')!;
  select.addEventListener('change', () => {
    botField = select.value as BotField;
    sim.botSkills = [...BOT_FIELDS[botField]];
    scheduleBatch();
  });
  bots.prepend(row);
}

// ---------- Batch matrix ----------
const LEVELS = [0.35, 0.5, 0.65, 0.8, 0.92];
let batchTimer = 0;
function scheduleBatch() {
  clearTimeout(batchTimer);
  batchTimer = window.setTimeout(renderMatrix, 150);
}

function renderMatrix() {
  const cars = sim.botSkills.length + 1;
  const head = `<tr><th>Nível</th><th>Acerto</th><th>Pos.</th>${Array.from({ length: cars }, (_, i) => `<th>${i + 1}º</th>`).join('')}<th>Renhida</th><th>Ultrap.</th></tr>`;
  const rows = LEVELS.map((mean) => {
    const s = runBatch(config, { ...sim, classMean: mean }, 300);
    const cells = s.positionShare
      .map((p) => `<td class="cell"><i style="opacity:${Math.min(1, p * 1.6).toFixed(2)}"></i><b>${Math.round(p * 100)}%</b></td>`)
      .join('');
    return `<tr><td>${Math.round(mean * 100)}%</td><td>${Math.round(s.avgAccuracy * 100)}%</td><td>${s.avgPosition.toFixed(1)}</td>${cells}<td>${Math.round(s.closeFinish * 100)}%</td><td>${s.avgOvertakes.toFixed(1)}</td></tr>`;
  });
  $('#matrix').innerHTML = head + rows.join('');
}

// ---------- Live race ----------
const view = new RaceView(track);
let race: Race | null = null;
let raceData: ReturnType<typeof buildRace> | null = null;
let shownEvents = 0;
let bannerUntil = 0;
let clock = 0;

const EFFECT_LABEL: Record<Effect, string> = { turbo: '🔥 TURBO!', normal: 'Ritmo normal', slow: '🐢 A abrandar', spin: '💫 DESPISTE!' };

function startRace() {
  const seed = Math.floor(Math.random() * 1e9);
  raceData = buildRace(config, sim, seed);
  race = raceData.race;
  view.reset();
  shownEvents = 0;
  $('#log').innerHTML = '';
  $('#results').innerHTML = '';
  $('#banner').textContent = '';
  $('#seed').textContent = `seed ${seed}`;
}

function updateHud() {
  if (!race) return;
  const team = race.team!;
  const q = race.currentQuestion;
  $('#hud-q').textContent = q < race.questionCount ? `Pergunta ${q + 1}/${race.questionCount}` : 'Sprint final';
  $('#hud-pos').textContent = `${race.rankOf(team)}º lugar`;

  while (shownEvents < race.events.length) {
    const e = race.events[shownEvents++];
    const r = e.results[0];
    const li = document.createElement('li');
    li.className = r.effect;
    li.textContent = `${Math.round(r.accuracy * 100)}% certas → ${EFFECT_LABEL[r.effect]}${r.nitro ? ' + NITRO' : ''}${e.finalLap ? ' (volta final)' : ''}`;
    $('#log').appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
    $('#banner').textContent = r.nitro ? '⚡ NITRO!' : EFFECT_LABEL[r.effect];
    bannerUntil = clock + 2.5;
  }
  if (clock > bannerUntil) $('#banner').textContent = '';
}

function showResults() {
  if (!race || !raceData) return;
  race.finalizeEvents();
  const standings = race.standings();
  const scores = scoreRace(
    raceData.students.map((s) => s.id),
    race.events.map((e) => ({ answers: raceData!.answersByQ[e.q] ?? [], teamAccuracy: e.results[0].accuracy })),
  );
  const nick = (id: string) => raceData!.students.find((s) => s.id === id)?.nickname ?? id;
  const awards = pickAwards(scores);
  $('#results').innerHTML = `
    <h2>Classificação</h2>
    <ol>${standings.map((c) => `<li>${c.driver.kind === 'team' ? '<b>Turma</b>' : c.driver.name} <small>${c.finishTime!.toFixed(1)}s</small></li>`).join('')}</ol>
    <h2>Quem mais ajudou</h2>
    <ol>${scores.slice(0, 5).map((s) => `<li>${nick(s.playerId)}: ${s.points} pts (${s.correct} certas)</li>`).join('')}</ol>
    <div class="awards">${awards.map((a) => `<div>${a.emoji} <b>${a.title}</b><br>${nick(a.playerId)}, ${a.detail}</div>`).join('')}</div>`;
}

async function init() {
  buildSliders();
  renderMatrix();
  await view.mount($('#stage'));
  startRace();
  let playing = false;
  let done = false;
  $('#play').addEventListener('click', () => {
    if (done || playing) startRace();
    playing = true;
    done = false;
    $<HTMLButtonElement>('#play').textContent = '↻ Nova corrida';
  });
  $('#reset').addEventListener('click', () => {
    Object.assign(config, DEFAULT_CONFIG);
    Object.assign(sim, DEFAULT_SIM, { botSkills: [...DEFAULT_SIM.botSkills] });
    botField = 'medio';
    buildSliders();
    renderMatrix();
  });
  view.app.ticker.add((t) => {
    const dt = t.deltaMS / 1000;
    clock += dt;
    if (race && playing && !race.finished) {
      race.step(dt * Number($<HTMLSelectElement>('#speed').value));
      if (race.finished) {
        playing = false;
        done = true;
        showResults();
      }
    }
    if (race) {
      view.render(race, clock);
      updateHud();
    }
  });
}

init();
