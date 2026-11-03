// Prints how a class of each level tends to finish. Run: npm run calibrate
import { DEFAULT_CONFIG } from '../src/engine/config';
import { DEFAULT_SIM, runBatch } from '../src/engine/batch';
import { Track, DEFAULT_TRACK_POINTS } from '../src/engine/track';

const track = new Track(DEFAULT_TRACK_POINTS);
const races = Number(process.argv[2] ?? 400);
const levels = [0.35, 0.5, 0.65, 0.8, 0.92];

console.log(`Pista ${Math.round(track.length)}px · ${races} corridas por nível · ${DEFAULT_SIM.botSkills.length} bots\n`);
const header = ['nível', 'acerto', 'pos.média', ...DEFAULT_SIM.botSkills.map((_, i) => `${i + 1}º`), `${DEFAULT_SIM.botSkills.length + 1}º`, 'renhida', 'ultrap.', 'perdidas'];
console.log(header.map((h) => h.padStart(8)).join(''));
for (const mean of levels) {
  const s = runBatch(DEFAULT_CONFIG, { ...DEFAULT_SIM, classMean: mean }, track.length, races);
  const row = [
    mean.toFixed(2),
    `${Math.round(s.avgAccuracy * 100)}%`,
    s.avgPosition.toFixed(2),
    ...s.positionShare.map((p) => `${Math.round(p * 100)}%`),
    `${Math.round(s.closeFinish * 100)}%`,
    s.avgOvertakes.toFixed(1),
    s.avgPositionsLost.toFixed(1),
  ];
  console.log(row.map((c) => c.padStart(8)).join(''));
}
