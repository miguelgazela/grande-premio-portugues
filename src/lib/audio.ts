// O iOS só toca áudio depois de um toque: `unlockAudio()` corre no botão "Começar".
// Tudo é sintetizado com WebAudio (sem ficheiros): efeitos + música de fundo que acelera na volta final.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

const MUTE_KEY = 'gpp.muted';
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch { /* sem armazenamento */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
}

export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(master);
    }
    void ctx.resume();
    beep(1, 0.02, 0.0001); // desbloqueia
  } catch { /* sem som, tudo bem */ }
}

function ready(): boolean {
  return !!ctx && ctx.state === 'running' && !!sfxBus;
}

function beep(freq: number, dur: number, gain = 0.15, when = 0, type: OscillatorType = 'square', bus: GainNode | null = sfxBus, slideTo?: number): void {
  if (!ctx || ctx.state !== 'running' || !bus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + when;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Ruído filtrado (derrapagem, "whoosh", palmas). */
function noise(dur: number, gain: number, when = 0, f0 = 1000, f1 = f0, q = 1, type: BiquadFilterType = 'bandpass', bus: GainNode | null = sfxBus): void {
  if (!ctx || ctx.state !== 'running' || !bus) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  const t = ctx.currentTime + when;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(bus);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export type Sound = 'start' | 'turbo' | 'normal' | 'slow' | 'spin' | 'nitro' | 'finish' | 'tick' | 'overtake' | 'cheer';

export function play(sound: Sound): void {
  switch (sound) {
    case 'start': [440, 554, 659, 880].forEach((f, i) => beep(f, i === 3 ? 0.35 : 0.14, 0.15, i * 0.1)); break;
    // certo (turbo/normal) e errado (slow/spin)
    case 'turbo': [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 0.15, i * 0.07)); noise(0.35, 0.1, 0, 600, 3000, 0.8); break;
    case 'nitro': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.12, 0.17, i * 0.05, 'sawtooth')); noise(0.6, 0.18, 0, 400, 5000, 0.7); break;
    case 'normal': beep(523, 0.12, 0.12); beep(659, 0.18, 0.12, 0.1); break;
    case 'slow': beep(330, 0.25, 0.12, 0, 'triangle', sfxBus, 220); break;
    case 'spin':
      [500, 420, 340, 260].forEach((f, i) => beep(f, 0.12, 0.15, i * 0.09, 'sawtooth'));
      noise(0.7, 0.2, 0, 3000, 900, 2, 'bandpass'); // pneus a chiar
      break;
    case 'finish': [523, 523, 523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 0.15, i * 0.15)); noise(1.4, 0.12, 0.2, 2500, 1500, 0.5, 'highpass'); break;
    case 'tick': beep(880, 0.05, 0.08); break;
    case 'overtake': beep(660, 0.1, 0.14, 0, 'triangle'); beep(990, 0.18, 0.14, 0.09, 'triangle'); noise(0.25, 0.1, 0, 800, 2500, 1); break;
    case 'cheer': noise(1.2, 0.14, 0, 1800, 1200, 0.4, 'bandpass'); break;
  }
}

// ---------- Música de fundo ----------
// Loop de 16 passos em Lá menor: baixo + arpejo + bombo/chimbal; o tempo sobe na volta final.
const BASS = [110, 0, 110, 0, 87.3, 0, 87.3, 0, 130.8, 0, 130.8, 0, 98, 0, 98, 98];
const ARP = [440, 523, 659, 523, 349, 440, 523, 440, 523, 659, 784, 659, 392, 494, 587, 494];

let musicTimer = 0;
let nextStep = 0;
let stepIdx = 0;
let stepTime = 0;
let intensity = 0;

function scheduleStep(i: number, t: number, dur: number): void {
  if (!ctx || !musicBus) return;
  const when = t - ctx.currentTime;
  if (BASS[i]) beep(BASS[i], dur * 1.6, 0.09, when, 'triangle', musicBus);
  beep(ARP[i], dur * 0.9, intensity ? 0.05 : 0.035, when, 'square', musicBus);
  if (i % 4 === 0) beep(140, 0.12, 0.22, when, 'sine', musicBus, 45);
  if (i % 2 === 1 || intensity) noise(0.04, 0.05, when, 7000, 7000, 1, 'highpass', musicBus);
}

function tickMusic(): void {
  if (!ctx || ctx.state !== 'running') return;
  stepTime = 60 / (intensity ? 150 : 116) / 4;
  if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.05;
  while (nextStep < ctx.currentTime + 0.25) {
    scheduleStep(stepIdx, nextStep, stepTime);
    nextStep += stepTime;
    stepIdx = (stepIdx + 1) % 16;
  }
}

export const music = {
  start(): void {
    if (musicTimer || !ready()) return;
    nextStep = 0;
    stepIdx = 0;
    intensity = 0;
    tickMusic();
    musicTimer = window.setInterval(tickMusic, 60);
  },
  stop(): void {
    clearInterval(musicTimer);
    musicTimer = 0;
  },
  /** Volta final: mais rápida e com chimbal em todos os passos. */
  setFinalLap(on: boolean): void {
    intensity = on ? 1 : 0;
  },
};
