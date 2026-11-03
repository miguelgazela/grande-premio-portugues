import { Container, Sprite, Texture } from 'pixi.js';

/** Máximo de partículas vivas (num iPad antigo, pool fixo e sem alocações por frame). */
export const MAX_PARTICLES = 140;

type Kind = 'smoke' | 'spark' | 'confetti' | 'skid';

interface P {
  s: Sprite;
  alive: boolean;
  kind: Kind;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vr: number;
  s0: number;
  s1: number;
  a0: number;
}

let softTex: Texture | null = null;
/** Círculo suave desenhado uma vez (para fumo e faíscas). */
function soft(): Texture {
  if (softTex) return softTex;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    softTex = Texture.from(c);
  } catch {
    softTex = Texture.WHITE;
  }
  return softTex;
}

const CONFETTI = [0xff4d4d, 0xffd23f, 0x4dd2ff, 0x6bff6b, 0xff6bd6, 0xffffff];

/** Partículas simples em coordenadas do mundo: duas camadas (por baixo e por cima dos carros). */
export class Particles {
  readonly under = new Container();
  readonly over = new Container();
  private pool: P[] = [];
  private live = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.visible = false;
      this.pool.push({ s, alive: false, kind: 'smoke', life: 0, max: 1, vx: 0, vy: 0, vr: 0, s0: 1, s1: 1, a0: 1 });
    }
  }

  get count(): number {
    return this.live;
  }

  private take(kind: Kind): P | null {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return null;
    p.alive = true;
    p.kind = kind;
    this.live++;
    const parent = kind === 'skid' ? this.under : this.over;
    if (p.s.parent !== parent) parent.addChild(p.s);
    p.s.visible = true;
    return p;
  }

  smoke(x: number, y: number): void {
    const p = this.take('smoke');
    if (!p) return;
    p.s.texture = soft();
    p.s.tint = 0xe8e8e8;
    p.s.position.set(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6);
    p.s.rotation = 0;
    p.vx = (Math.random() - 0.5) * 18;
    p.vy = (Math.random() - 0.5) * 18;
    p.vr = 0;
    p.life = p.max = 0.7 + Math.random() * 0.3;
    p.s0 = 0.35;
    p.s1 = 1.1;
    p.a0 = 0.7;
  }

  spark(x: number, y: number, angle: number, color: number): void {
    const p = this.take('spark');
    if (!p) return;
    p.s.texture = soft();
    p.s.tint = color;
    p.s.position.set(x, y);
    const a = angle + Math.PI + (Math.random() - 0.5) * 0.9;
    const v = 70 + Math.random() * 90;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    p.vr = 0;
    p.life = p.max = 0.25 + Math.random() * 0.2;
    p.s0 = 0.28;
    p.s1 = 0.05;
    p.a0 = 1;
  }

  confetti(x: number, y: number): void {
    const p = this.take('confetti');
    if (!p) return;
    p.s.texture = Texture.WHITE;
    p.s.tint = CONFETTI[(Math.random() * CONFETTI.length) | 0];
    p.s.position.set(x, y);
    p.s.rotation = Math.random() * 6;
    const a = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 130;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    p.vr = (Math.random() - 0.5) * 14;
    p.life = p.max = 1.4 + Math.random() * 1;
    p.s0 = p.s1 = 1;
    p.a0 = 1;
    p.s.width = 5 + Math.random() * 3;
    p.s.height = 3 + Math.random() * 2;
  }

  /** Marca de pneu: traço escuro orientado com o carro, a desvanecer devagar. */
  skid(x: number, y: number, angle: number): void {
    const p = this.take('skid');
    if (!p) return;
    p.s.texture = Texture.WHITE;
    p.s.tint = 0x1b1b24;
    p.s.position.set(x, y);
    p.s.rotation = angle;
    p.s.width = 9;
    p.s.height = 2.4;
    p.vx = p.vy = p.vr = 0;
    p.life = p.max = 2.2;
    p.s0 = p.s1 = 1;
    p.a0 = 0.35;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.s.visible = false;
        this.live--;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vr * dt;
      p.s.alpha = p.a0 * (1 - t);
      if (p.kind === 'smoke' || p.kind === 'spark') p.s.scale.set((p.s0 + (p.s1 - p.s0) * t) * (p.kind === 'smoke' ? 1 : 1));
      if (p.kind === 'confetti') p.vx *= 1 - 1.6 * dt, p.vy *= 1 - 1.6 * dt;
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.alive = false;
      p.s.visible = false;
    }
    this.live = 0;
  }
}
