import { Application, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { mulberry32 } from '../engine/rng';
import { CURB_W, ROAD_W, WORLD_H, WORLD_W, type Track } from '../engine/track';
import type { CarState, Race } from '../engine/race';
import { themeForTrack, themeKeys, type Theme } from '../engine/theme';
import { loadRaceTextures, type RaceTextures } from './assets';
import { Particles } from './particles';

const CAR_LEN = 34;
/** Zoom da câmara em relação ao "caber o mundo antigo (1000 de largura) no ecrã". */
const FOLLOW_ZOOM = 2.2;
const LOOK_AHEAD = 70;
const CURB_STRIPE = 18;
const CAR_MODELS = ['cartype-coupe', 'cartype-rally', 'cartype-pickup', 'cartype-kart', 'cartype-van'];
const GHOST_TINT = 0xb8c0c8;

/** Cor do bot → sprite de carro. */
const CAR_BY_COLOR: Record<number, string> = {
  0x2f6bff: 'car-team',
  0xe74c3c: 'car-red',
  0xf39c12: 'car-orange',
  0x9b59b6: 'car-purple',
  0x1abc9c: 'car-teal',
  0xe84393: 'car-pink',
  0x95a5a6: 'car-grey',
  0x2ecc71: 'car-green',
};

interface CarNode {
  root: Container;
  /** Só existe com placeholders. */
  fx?: Graphics;
  turbo?: Sprite;
  finished?: boolean;
  skidT?: number;
  puffT?: number;
  sparkT?: number;
  nitro?: Sprite;
  smoke?: Sprite;
}

/**
 * Renderer da pista. Com `{ sprites: true }` carrega os assets do manifest e usa
 * formas desenhadas para tudo o que faltar (ou se não houver manifest).
 */
export class RaceView {
  readonly app = new Application();
  private world = new Container();
  private carLayer = new Container();
  private cars = new Map<string, CarNode>();
  private tex: RaceTextures = new Map();
  private destroyed = false;
  private view = { w: 0, h: 0 };
  private cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1, snapped: false };
  private lastClock = 0;
  private mini = new Container();
  private miniDots = new Graphics();
  private miniScale = 1;
  private miniLabels = new Map<string, Text>();
  private clearancePts: Float32Array;
  private theme: Theme;
  private particles = new Particles();
  private lastRender = 0;
  private stands: Sprite[] = [];
  private cheerT = 0;

  constructor(
    private track: Track,
    private opts: { sprites?: boolean; follow?: boolean; trackId?: string } = {},
  ) {
    this.theme = themeForTrack(opts.trackId ?? '');
    const pts = track.points.slice(0, -1);
    this.clearancePts = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => {
      this.clearancePts[i * 2] = p.x;
      this.clearancePts[i * 2 + 1] = p.y;
    });
  }

  async mount(el: HTMLElement): Promise<void> {
    if (this.opts.sprites) this.tex = await loadRaceTextures(themeKeys(this.theme));
    await this.app.init({ background: this.theme.background, antialias: true, resizeTo: el, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    if (this.destroyed) return;
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.drawTrack();
    this.world.addChild(this.particles.under, this.carLayer, this.particles.over);
    if (this.opts.follow) {
      this.app.stage.addChild(this.mini);
      this.mini.addChild(this.miniDots);
    }
    const fit = () => {
      // `resizeTo` só reage ao resize da janela; a pista muda de altura quando a pergunta aparece/desaparece.
      if (el.clientWidth && el.clientHeight) this.app.renderer.resize(el.clientWidth, el.clientHeight);
      this.view = { w: el.clientWidth, h: el.clientHeight };
      if (this.opts.follow) {
        this.layoutMinimap();
        this.applyCamera(0);
      } else {
        const s = Math.min(el.clientWidth / WORLD_W, el.clientHeight / WORLD_H);
        this.world.scale.set(s);
        this.world.position.set((el.clientWidth - WORLD_W * s) / 2, (el.clientHeight - WORLD_H * s) / 2);
      }
    };
    new ResizeObserver(fit).observe(el);
    fit();
  }

  /** Escala base: o mundo antigo (1000 de largura) cabia no ecrã; o zoom de seguimento mede-se contra isso. */
  private baseScale(): number {
    return Math.min(this.view.w / 1000, this.view.h / 620);
  }

  private applyCamera(shake: number): void {
    const s = this.baseScale() * FOLLOW_ZOOM * this.cam.zoom;
    this.world.scale.set(s);
    this.world.position.set(
      this.view.w / 2 - this.cam.x * s + (shake ? (Math.random() - 0.5) * shake : 0),
      this.view.h / 2 - this.cam.y * s + (shake ? (Math.random() - 0.5) * shake : 0),
    );
  }

  private layoutMinimap(): void {
    const w = Math.max(150, Math.min(260, this.view.w * 0.24));
    const h = w * (WORLD_H / WORLD_W);
    this.miniScale = w / WORLD_W;
    this.mini.position.set(this.view.w - w - 12, this.view.h - h - 12);
    const bg = new Graphics();
    bg.roundRect(-8, -8, w + 16, h + 16, 10).fill({ color: 0x14141c, alpha: 0.55 });
    const pts = this.track.points;
    bg.moveTo(pts[0].x * this.miniScale, pts[0].y * this.miniScale);
    for (let i = 1; i < pts.length; i += 3) bg.lineTo(pts[i].x * this.miniScale, pts[i].y * this.miniScale);
    bg.closePath().stroke({ width: 5, color: 0xffffff, alpha: 0.85, join: 'round' });
    const start = this.track.poseAt(0);
    bg.circle(start.x * this.miniScale, start.y * this.miniScale, 3).fill(0xffd23f);
    const labels = new Set<unknown>(this.miniLabels.values());
    this.mini.children.filter((c) => c !== this.miniDots && !labels.has(c)).forEach((c) => c.destroy());
    this.mini.addChildAt(bg, 0);
  }

  private t(key: string): Texture | undefined {
    return this.tex.get(key);
  }

  private path(g: Graphics): Graphics {
    const pts = this.track.points;
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    return g.closePath();
  }

  private drawTrack(): void {
    // Fundo: relva em tile, muito além do mundo (o canvas pode ter margens).
    const grass = this.t(`bg-${this.theme.suffix || 'grass'}`);
    if (grass) {
      const bg = new TilingSprite({ texture: grass, width: 4000, height: 3000 });
      bg.position.set(-1500, -1200);
      bg.tileScale.set(0.45);
      this.world.addChild(bg);
    }

    this.drawCurbs();
    const road = new Graphics();
    const asphalt = this.t(`track-asphalt${this.theme.suffix ? '-' + this.theme.suffix : ''}`);
    if (asphalt) {
      // Asfalto em tile, recortado pela forma da estrada.
      const mask = this.path(new Graphics()).stroke({ width: ROAD_W, color: 0xffffff, join: 'round' });
      const tile = new TilingSprite({ texture: asphalt, width: WORLD_W + 400, height: WORLD_H + 400 });
      tile.position.set(-200, -200);
      tile.tileScale.set(0.3);
      tile.mask = mask;
      this.world.addChild(road, mask, tile);
    } else {
      this.path(road).stroke({ width: ROAD_W, color: 0x3d3d48, join: 'round' });
      this.world.addChild(road);
    }

    // Linha central tracejada.
    const dashes = new Graphics();
    for (let d = 0; d < this.track.length; d += 34) {
      const a = this.track.poseAt(d);
      const b = this.track.poseAt(d + 16);
      dashes.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    dashes.stroke({ width: 3, color: asphalt ? 0xf4f4f4 : 0xdddddd, alpha: asphalt ? 0.8 : 1 });
    this.world.addChild(dashes);

    this.drawStartLine();
    this.drawProps();
  }

  /**
   * Curb contínuo: base laranja (traço mais largo que a estrada) e quads brancos por cima,
   * gerados a partir das normais por vértice, por isso sem buracos nem sobreposições em curva.
   */
  private drawCurbs(): void {
    const g = new Graphics();
    this.path(g).stroke({ width: ROAD_W + CURB_W * 2, color: this.theme.curbA, join: 'round' });
    const pts = this.track.points.slice(0, -1);
    const n = pts.length;
    const cum = this.track.cum;
    const normals = pts.map((_p, i) => {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: -dy / len, y: dx / len };
    });
    const inner = ROAD_W / 2 - 1;
    const outer = ROAD_W / 2 + CURB_W;
    const white = (i: number) => Math.floor(cum[i] / CURB_STRIPE) % 2 === 1;
    for (const side of [-1, 1]) {
      let i = 0;
      while (i < n) {
        if (!white(i)) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < n && white(j + 1)) j++;
        // Inclui o vértice seguinte para as listas encostarem.
        const end = Math.min(j + 1, n - 1);
        const poly: number[] = [];
        for (let k = i; k <= end; k++) poly.push(pts[k].x + normals[k].x * outer * side, pts[k].y + normals[k].y * outer * side);
        for (let k = end; k >= i; k--) poly.push(pts[k].x + normals[k].x * inner * side, pts[k].y + normals[k].y * inner * side);
        g.poly(poly).fill(this.theme.curbB);
        i = j + 1;
      }
    }
    this.world.addChild(g);
  }

  private drawStartLine(): void {
    const p = this.track.poseAt(0);
    const tex = this.t('prop-startline');
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.height = ROAD_W + 8;
      s.width = (tex.width / tex.height) * s.height * 1.4;
      s.position.set(p.x, p.y);
      s.rotation = p.angle;
      this.world.addChild(s);
      return;
    }
    const finish = new Graphics();
    const cell = 7;
    const rows = Math.ceil(ROAD_W / cell);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) finish.rect(c * cell - cell, r * cell - ROAD_W / 2, cell, cell).fill((r + c) % 2 ? 0x111111 : 0xffffff);
    }
    finish.position.set(p.x, p.y);
    finish.rotation = p.angle;
    this.world.addChild(finish);
  }

  /** Distância ao ponto mais próximo de QUALQUER troço da pista. */
  private clearance(x: number, y: number): number {
    const c = this.clearancePts;
    let best = Infinity;
    for (let i = 0; i < c.length; i += 2) {
      const dx = c[i] - x;
      const dy = c[i + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Árvores, arbustos, cones, pneus e bancadas: acima da estrada, ordenados por y, nunca sobre ela. */
  private drawProps(): void {
    const layer = new Container();
    layer.sortableChildren = true;
    const rng = mulberry32(7);
    const roadEdge = ROAD_W / 2 + CURB_W;
    const placed: { x: number; y: number; r: number }[] = [];
    const add = (tex: Texture, x: number, y: number, w: number, h: number, rotation = 0) => {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.width = w;
      s.height = h;
      s.rotation = rotation;
      s.position.set(x, y);
      s.zIndex = y;
      layer.addChild(s);
    };

    // Bancadas: nas retas mais direitas, do lado de fora da pista, viradas para ela. A principal junto à meta.
    const stand = this.t('prop-grandstand');
    if (stand) {
      const L = this.track.length;
      const turn = (d: number) => {
        let worst = 0;
        for (let k = -4; k < 4; k++) {
          const a = this.track.poseAt(d + k * 40).angle;
          const b = this.track.poseAt(d + (k + 1) * 40).angle;
          worst += Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
        }
        return worst;
      };
      const candidates: { d: number; score: number }[] = [];
      for (let d = 0; d < L; d += 30) candidates.push({ d, score: turn(d) });
      candidates.sort((a, b) => a.score - b.score);
      const near = (d: number, e: number) => Math.min(Math.abs(d - e), L - Math.abs(d - e));
      const cx = WORLD_W / 2;
      const cy = WORLD_H / 2;
      const tryStand = (d: number, w: number): boolean => {
        const h = (stand.height / stand.width) * w;
        const p = this.track.poseAt(d);
        // Lado de fora: o que se afasta do centro do mundo.
        const side = (p.nx * (p.x - cx) + p.ny * (p.y - cy)) >= 0 ? 1 : -1;
        const off = roadEdge + 12 + h / 2;
        const x = p.x + p.nx * side * off;
        const y = p.y + p.ny * side * off;
        const tx = Math.cos(p.angle);
        const ty = Math.sin(p.angle);
        const fx = -p.nx * side; // para a pista
        const fy = -p.ny * side;
        // Todos os pontos do retângulo (cantos e meios) longe de QUALQUER troço, não só do mais próximo.
        for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
          for (const v of [-0.5, 0, 0.5]) {
            if (this.clearance(x + tx * w * u + fx * h * v, y + ty * w * u + fy * h * v) < roadEdge + 8) return false;
          }
        }
        const s = new Sprite(stand);
        s.anchor.set(0.5);
        s.width = w;
        s.height = h;
        s.rotation = Math.atan2(fy, fx) - Math.PI / 2;
        s.position.set(x, y);
        s.zIndex = y;
        layer.addChild(s);
        this.stands.push(s);
        placed.push({ x, y, r: w / 2 });
        return true;
      };
      const picks: number[] = [];
      for (const c of candidates.filter((c) => near(c.d, 0) < 0.12 * L)) {
        if (tryStand(c.d, 300)) {
          picks.push(c.d);
          break;
        }
      }
      for (const c of candidates) {
        if (picks.length >= 3) break;
        if (picks.every((p) => near(p, c.d) > 0.22 * L) && tryStand(c.d, 230)) picks.push(c.d);
      }
    }

    const place = (key: string, size: number, count: number, margin: number, nearRoad: boolean, spin = false) => {
      const tex = this.t(key);
      if (!tex) return;
      const r = size / 2;
      for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
        let x: number;
        let y: number;
        if (nearRoad) {
          const p = this.track.poseAt(rng() * this.track.length);
          const off = (rng() < 0.5 ? -1 : 1) * (roadEdge + r + margin + rng() * 10);
          x = p.x + p.nx * off;
          y = p.y + p.ny * off;
        } else {
          x = -140 + rng() * (WORLD_W + 280);
          y = -140 + rng() * (WORLD_H + 280);
        }
        if (this.clearance(x, y) < roadEdge + r * 0.8 + margin) continue;
        if (placed.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.9)) continue;
        placed.push({ x, y, r });
        const k = size / Math.max(tex.width, tex.height);
        add(tex, x, y, tex.width * k, tex.height * k, spin ? rng() * Math.PI * 2 : 0);
        n++;
      }
    };
    for (const pr of this.theme.props) place(pr.key, pr.size, pr.count, pr.margin, pr.nearRoad, pr.spin);
    this.world.addChild(layer);
  }

  /** Modelo tingido (cartype-*) quando existe; senão o carro de cor fixa; senão formas. */
  private carLook(car: CarState): { tex: Texture; tint: number | null } | null {
    const d = car.driver;
    const idx = d.kind === 'bot' ? Number(/\d+$/.exec(d.id)?.[0] ?? 0) : 0;
    const model = d.kind === 'team' ? d.model ?? 'cartype-coupe' : d.kind === 'ghost' ? 'cartype-coupe' : CAR_MODELS[(idx + 1) % CAR_MODELS.length];
    const tinted = this.t(model) ?? this.t('cartype-coupe');
    const tint = d.kind === 'ghost' ? GHOST_TINT : d.color;
    if (tinted) return { tex: tinted, tint };
    const fixed = this.t(CAR_BY_COLOR[d.kind === 'ghost' ? 0x95a5a6 : d.color] ?? 'car-grey');
    return fixed ? { tex: fixed, tint: null } : null;
  }

  private carNode(car: CarState): CarNode {
    const root = new Container();
    const look = this.carLook(car);
    const tex = look?.tex;
    const node: CarNode = { root };

    if (tex) {
      const body = new Sprite(tex);
      body.anchor.set(0.5);
      body.scale.set((CAR_LEN * 1.12) / tex.width);
      if (look!.tint !== null) body.tint = look!.tint;
      const smokeTex = this.t('fx-smoke');
      if (smokeTex) {
        node.smoke = new Sprite(smokeTex);
        node.smoke.anchor.set(0.5);
        node.smoke.scale.set(0.2);
        node.smoke.visible = false;
        root.addChild(node.smoke);
      }
      const turbo = this.t('fx-turbo');
      if (turbo) {
        node.turbo = new Sprite(turbo);
        node.turbo.anchor.set(1, 0.5);
        node.turbo.position.set(-CAR_LEN / 2 + 3, 0);
        node.turbo.scale.set(26 / turbo.width);
        node.turbo.visible = false;
        root.addChild(node.turbo);
      }
      const nitro = this.t('fx-nitro');
      if (nitro) {
        node.nitro = new Sprite(nitro);
        node.nitro.anchor.set(1, 0.5);
        node.nitro.position.set(-CAR_LEN / 2 + 3, 0);
        node.nitro.scale.set(42 / nitro.width);
        node.nitro.visible = false;
        root.addChild(node.nitro);
      }
      root.addChild(body);
    } else {
      const body = new Graphics();
      body.roundRect(-17, -9, 34, 18, 6).fill(car.driver.color).stroke({ width: 2, color: 0x1b1b24 });
      body.roundRect(2, -6, 9, 12, 3).fill(0xcfe8ff);
      node.fx = new Graphics();
      root.addChild(node.fx, body);
    }
    // Fantasma semi-transparente; o nome fica legível.
    if (car.driver.kind === 'ghost') for (const c of root.children) c.alpha = 0.45;
    if (car.driver.kind === 'team' || car.driver.kind === 'ghost') {
      const label = new Text({ text: car.driver.kind === 'ghost' ? `👻 ${car.driver.name}` : car.driver.name, style: { fontFamily: 'system-ui', fontSize: car.driver.kind === 'ghost' ? 12 : 14, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1b1b24, width: 4 } } });
      label.anchor.set(0.5, 1);
      label.position.set(0, -14);
      label.label = 'label';
      root.addChild(label);
    }
    this.carLayer.addChild(root);
    this.cars.set(car.driver.id, node);
    return node;
  }

  /** Público a festejar durante ~1,6 s (ultrapassagem, meta). */
  cheer(): void {
    this.cheerT = 1.6;
  }

  render(race: Race, clock: number): void {
    const dt = Math.min(0.1, Math.max(0, clock - this.lastRender));
    this.lastRender = clock;
    const n = race.cars.length;
    race.cars.forEach((car, i) => {
      const node = this.cars.get(car.driver.id) ?? this.carNode(car);
      const sprite = node.root;
      const lane = (i - (n - 1) / 2) * (ROAD_W / (n + 1));
      const pose = this.track.poseAt(car.distance);
      sprite.position.set(pose.x + pose.nx * lane, pose.y + pose.ny * lane);
      const spinning = car.spinLeft > 0;
      sprite.rotation = pose.angle + (spinning ? clock * 14 : 0);
      const label = sprite.getChildByLabel('label');
      if (label) label.rotation = -sprite.rotation;

      const running = car.finishTime === null && !spinning;
      const flicker = 0.75 + 0.25 * Math.sin(clock * 40 + i);
      const nitroOn = running && race.bursting && car.nitroActive;
      const turboOn = running && race.bursting && !car.nitroActive && car.lastEffect === 'turbo';
      if (node.fx) {
        node.fx.clear();
        if (nitroOn || turboOn) {
          const len = nitroOn ? 22 : 12;
          node.fx.poly([-17, -6, -17 - len * flicker, 0, -17, 6]).fill(nitroOn ? 0x4fd2ff : 0xffb21a);
        }
      }
      if (node.turbo) {
        node.turbo.visible = turboOn;
        node.turbo.scale.x = (26 / node.turbo.texture.width) * flicker;
      }
      if (node.nitro) {
        node.nitro.visible = nitroOn;
        node.nitro.scale.x = (42 / node.nitro.texture.width) * flicker;
      }
      this.emit(node, car, sprite, pose.angle, { spinning, nitroOn, turboOn }, dt);
      if (node.smoke) {
        node.smoke.visible = spinning;
        node.smoke.rotation = -sprite.rotation + clock * 2; // o fumo não roda com o carro
        node.smoke.alpha = 0.7 + 0.3 * Math.sin(clock * 12);
      }
    });
    this.particles.update(dt);
    if (this.cheerT > 0) {
      this.cheerT = Math.max(0, this.cheerT - dt);
      for (const [k, st] of this.stands.entries()) st.scale.y = st.scale.x * (1 + (this.cheerT > 0 ? 0.06 * Math.abs(Math.sin(clock * 14 + k)) : 0));
    }
    // Carro da turma por cima.
    const team = race.team;
    const teamNode = team && this.cars.get(team.driver.id);
    if (teamNode) this.carLayer.setChildIndex(teamNode.root, this.carLayer.children.length - 1);
    if (this.opts.follow && team && teamNode) this.followCamera(race, team, teamNode.root, clock);
  }

  /** Rasto de pneus, fumo no despiste, faíscas no nitro, confetti na meta. Tudo limitado pelo pool de partículas. */
  private emit(node: CarNode, car: CarState, sprite: Container, heading: number, st: { spinning: boolean; nitroOn: boolean; turboOn: boolean }, dt: number): void {
    const isTeam = car.driver.kind === 'team';
    const P = this.particles;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    if (st.spinning) {
      node.puffT = (node.puffT ?? 0) - dt;
      if (node.puffT <= 0) {
        node.puffT = 0.05;
        P.smoke(sprite.x, sprite.y);
      }
      node.skidT = (node.skidT ?? 0) - dt;
      if (node.skidT <= 0) {
        node.skidT = 0.06;
        P.skid(sprite.x, sprite.y, sprite.rotation);
      }
    } else if (isTeam && (st.nitroOn || st.turboOn)) {
      node.skidT = (node.skidT ?? 0) - dt;
      if (node.skidT <= 0) {
        node.skidT = 0.07;
        for (const side of [-1, 1]) P.skid(sprite.x - cos * 12 - sin * 7 * side, sprite.y - sin * 12 + cos * 7 * side, heading);
      }
    }
    if (st.nitroOn || (isTeam && st.turboOn)) {
      node.sparkT = (node.sparkT ?? 0) - dt;
      if (node.sparkT <= 0) {
        node.sparkT = st.nitroOn ? 0.03 : 0.07;
        P.spark(sprite.x - cos * CAR_LEN * 0.55, sprite.y - sin * CAR_LEN * 0.55, heading, st.nitroOn ? (Math.random() < 0.5 ? 0x7fe0ff : 0xffffff) : 0xffb21a);
      }
    }
    if (isTeam && car.finishTime !== null && !node.finished) {
      node.finished = true;
      for (let k = 0; k < 70; k++) P.confetti(sprite.x, sprite.y);
      this.cheer();
    }
  }

  /** Segue o carro da turma: lerp com look-ahead, zoom-out no turbo/nitro, tremor no despiste. Sem rodar. */
  private followCamera(race: Race, team: CarState, root: Container, clock: number): void {
    const dt = Math.min(0.1, Math.max(0, clock - this.lastClock));
    this.lastClock = clock;
    const pose = this.track.poseAt(team.distance);
    const tx = root.x + Math.cos(pose.angle) * LOOK_AHEAD;
    const ty = root.y + Math.sin(pose.angle) * LOOK_AHEAD;
    const cam = this.cam;
    if (!cam.snapped) {
      cam.x = tx;
      cam.y = ty;
      cam.snapped = true;
    }
    const k = 1 - Math.exp(-dt * 3);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const spinning = team.spinLeft > 0;
    const boosted = team.finishTime === null && !spinning && race.bursting;
    const targetZoom = boosted && team.nitroActive ? 0.84 : boosted && team.lastEffect === 'turbo' ? 0.92 : 1;
    cam.zoom += (targetZoom - cam.zoom) * (1 - Math.exp(-dt * 2.5));
    this.applyCamera(spinning ? 10 : 0);

    // Minimapa: um ponto por carro, o da turma maior e por cima.
    const d = this.miniDots;
    d.clear();
    const order = [...race.cars].sort((a, b) => Number(a === team) - Number(b === team));
    for (const c of order) {
      const node = this.cars.get(c.driver.id);
      if (!node) continue;
      const isTeam = c === team;
      const x = node.root.x * this.miniScale;
      const y = node.root.y * this.miniScale;
      d.circle(x, y, isTeam ? 6 : 3.5).fill(c.driver.kind === 'ghost' ? 0xbfc5cc : c.driver.color || 0x95a5a6);
      if (isTeam) d.circle(x, y, 6).stroke({ width: 2, color: 0xffffff });
      if (c.driver.kind === 'ghost') {
        let t = this.miniLabels.get(c.driver.id);
        if (!t) {
          t = new Text({ text: c.driver.name, style: { fontFamily: 'system-ui', fontSize: 10, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1b1b24, width: 3 } } });
          t.anchor.set(0.5, 1);
          this.mini.addChild(t);
          this.miniLabels.set(c.driver.id, t);
        }
        t.position.set(x, y - 5);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    try {
      this.app.destroy(true, { children: true });
    } catch {
      /* ainda não inicializado */
    }
  }

  reset(): void {
    this.carLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cars.clear();
    this.particles.clear();
    this.miniLabels.forEach((t) => t.destroy());
    this.miniLabels.clear();
  }
}
