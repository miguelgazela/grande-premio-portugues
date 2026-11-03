// O iOS só toca áudio depois de um toque: `unlockAudio()` corre no botão "Começar".
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    void ctx.resume();
    beep(1, 0.02, 0.0001); // desbloqueia
  } catch { /* sem som, tudo bem */ }
}

function beep(freq: number, dur: number, gain = 0.15, when = 0, type: OscillatorType = 'square'): void {
  if (!ctx || ctx.state !== 'running') return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + when;
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export type Sound = 'start' | 'turbo' | 'normal' | 'slow' | 'spin' | 'nitro' | 'finish' | 'tick';

export function play(sound: Sound): void {
  switch (sound) {
    case 'start': [440, 554, 659].forEach((f, i) => beep(f, 0.18, 0.15, i * 0.12)); break;
    case 'turbo': [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 0.15, i * 0.07)); break;
    case 'nitro': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.12, 0.17, i * 0.05, 'sawtooth')); break;
    case 'normal': beep(523, 0.15, 0.12); break;
    case 'slow': beep(330, 0.25, 0.12, 0, 'triangle'); break;
    case 'spin': [500, 420, 340, 260].forEach((f, i) => beep(f, 0.12, 0.15, i * 0.09, 'sawtooth')); break;
    case 'finish': [523, 523, 523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 0.15, i * 0.15)); break;
    case 'tick': beep(880, 0.05, 0.08); break;
  }
}
