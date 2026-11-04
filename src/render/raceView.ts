// Necessário com CSP sem 'unsafe-eval' (ver vercel.json): o PixiJS usa uma variante sem eval.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { mulberry32 } from '../engine/rng';
import { CURB_W, ROAD_W, type Road } from '../engine/track';
import type { CarState, Race } from '../engine/race';
import { themeForTrack, themeKeys, type Theme } from '../engine/theme';
import { loadRaceTextures, type RaceTextures } from './assets';
import { Particles } from './particles';

const CAR_LEN = 34;
/** Zoom da câmara em relação ao "caber 1000 de largura no ecrã". */
const FOLLOW_ZOOM = 2.2;
const LOOK_AHEAD = 70;
/** A câmara afasta-se até aqui para manter os rivais mais próximos à vista; os que não cabem ficam com marcador no bordo. */
const MIN_FOLLOW_ZOOM = 0.75;
/** Quantos rivais à frente e atrás do carro da turma a câmara tenta manter à vista (não precisa de todos). */
const FRAME_AHEAD = 2;
const FRAME_BEHIND = 2;
const FRAME_MARGIN = 80;
/** Só visual: acima desta diferença (unidades) os rivais aproximam-se do carro da turma, para ficarem sempre perto do ecrã. Os pontos e a classificação usam a distância real. */
const NEAR_GAP = 260;
const NEAR_SOFT = 180;
const NEAR_SLOPE = 0.03;
const CURB_STRIPE = 18;
/** A pista desenha-se aos bocados, só à volta da câmara: a estrada vai "nascendo" à frente do carro. */
const CHUNK = 1000;
const CHUNKS_BEHIND = 2;
const CHUNKS_AHEAD = 4;
/** Área de mundo que um bloco de relva/props cobria antes (para manter a densidade dos temas). */
const OLD_WORLD_AREA = 1800 * 1140;
const OLD_TRACK_LEN = 3948;

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
 * A estrada é aberta e infinita para o jogo: só os blocos perto da câmara existem.
 */
export class RaceView {
  readonly app = new Application();
  private world = new Container();
  private chunkLayer = new Container();
  private carLayer = new Container();
  private cars = new Map<string, CarNode>();
  private chunks = new Map<number, Container>();
  private bg: TilingSprite | null = null;
  private tex: RaceTextures = new Map();
  private destroyed = false;
  private view = { w: 0, h: 0 };
  private cam = { x: 0, y: 0, zoom: 1, snapped: false };
  private lastClock = 0;
  private lastTeamDist = 0;
  private mini = new Container();
  private miniDots = new Graphics();
  private miniW = 200;
  private miniLabels = new Map<string, Text>();
  /** Marcadores no bordo do ecrã para os carros que ficaram fora de vista. */
  private edge = new Container();
  private edgeDots = new Graphics();
  private edgeLabels = new Map<string, Text>();
  private theme: Theme;
  private particles = new Particles();
  private lastRender = 0;
  private stands: Sprite[] = [];
  private cheerT = 0;
  private normals: { x: number; y: number }[];
  /** Onde fica a meta; só existe depois de a última pergunta fechar (a pista "gera" a meta quando é preciso). */
  private finishAt: number | null = null;
  private progressLen = 1;

  constructor(
    private track: Road,
    private opts: { sprites?: boolean; follow?: boolean; trackId?: string } = {},
  ) {
    this.theme = themeForTrack(opts.trackId ?? '');
    this.progressLen = track.length;
    const pts = track.points;
    const n = pts.length;
    this.normals = pts.map((_p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: -dy / len, y: dx / len };
    });
  }

  async mount(el: HTMLElement): Promise<void> {
    if (this.opts.sprites) this.tex = await loadRaceTextures(themeKeys(this.theme));
    await this.app.init({ background: this.theme.background, antialias: true, resizeTo: el, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    if (this.destroyed) return;
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    const grass = this.t(`bg-${this.theme.suffix || 'grass'}`);
    if (grass) {
      this.bg = new TilingSprite({ texture: grass, width: 100, height: 100 });
      this.bg.tileScale.set(0.45);
      this.world.addChild(this.bg);
    }
    this.world.addChild(this.chunkLayer, this.particles.under, this.carLayer, this.particles.over);
    const start = this.track.poseAt(0);
    this.cam.x = start.x + LOOK_AHEAD;
    this.cam.y = start.y;
    this.app.stage.addChild(this.mini);
    this.mini.addChild(this.miniDots);
    this.edge.addChild(this.edgeDots);
    this.app.stage.addChild(this.edge);
    const fit = () => {
      if (this.destroyed) return;
      // `resizeTo` só reage ao resize da janela; a pista muda de altura quando a pergunta aparece/desaparece.
      if (el.clientWidth && el.clientHeight) this.app.renderer.resize(el.clientWidth, el.clientHeight);
      this.view = { w: el.clientWidth, h: el.clientHeight };
      this.layoutMinimap();
      this.applyCamera(0);
    };
    new ResizeObserver(fit).observe(el);
    fit();
    this.ensureChunks(0);
  }

  /** Escala base: 1000 de largura no ecrã; o zoom de seguimento mede-se contra isso. */
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
    if (this.bg && s > 0) {
      // Relva infinita: o tile acompanha a câmara, ancorado ao mundo.
      const w = this.view.w / s + 400;
      const h = this.view.h / s + 400;
      const x = this.cam.x - w / 2;
      const y = this.cam.y - h / 2;
      this.bg.width = w;
      this.bg.height = h;
      this.bg.position.set(x, y);
      this.bg.tilePosition.set(-x, -y);
    }
  }

  /** Barra de progresso: um ponto por carro ao longo da corrida (a pista é longa demais para um mapa). */
  private layoutMinimap(): void {
    const w = Math.max(220, Math.min(420, this.view.w * 0.34));
    this.miniW = w;
    this.mini.position.set(this.view.w - w - 18, this.view.h - 26);
    const bg = new Graphics();
    bg.roundRect(-10, -14, w + 20, 28, 12).fill({ color: 0x14141c, alpha: 0.55 });
    bg.moveTo(0, 0).lineTo(w, 0).stroke({ width: 4, color: 0xffffff, alpha: 0.85, cap: 'round' });
    bg.rect(w - 3, -9, 6, 18).fill(0xffd23f);
    const labels = new Set<unknown>(this.miniLabels.values());
    this.mini.children.filter((c) => c !== this.miniDots && !labels.has(c)).forEach((c) => c.destroy());
    this.mini.addChildAt(bg, 0);
  }

  private t(key: string): Texture | undefined {
    return this.tex.get(key);
  }

  // ---------- Blocos de pista ----------

  /** Cria os blocos à frente da câmara e deita fora os que ficaram para trás. */
  private ensureChunks(d: number): void {
    const lastChunk = Math.floor(Math.min(this.track.length, (this.finishAt ?? this.track.length) + 600) / CHUNK);
    const cur = Math.floor(Math.max(0, d) / CHUNK);
    const lo = Math.max(0, cur - CHUNKS_BEHIND);
    const hi = Math.min(lastChunk, cur + CHUNKS_AHEAD);
    for (let i = lo; i <= hi; i++) if (!this.chunks.has(i)) {
      const c = this.buildChunk(i);
      this.chunkLayer.addChild(c);
      this.chunks.set(i, c);
    }
    for (const [i, c] of this.chunks) {
      if (i < lo - 1 || i > hi + 1) {
        this.chunks.delete(i);
        c.destroy({ children: true });
        this.stands = this.stands.filter((s) => !s.destroyed);
      }
    }
  }

  private buildChunk(index: number): Container {
    const c = new Container();
    const tr = this.track;
    const d0 = index * CHUNK;
    const d1 = Math.min(tr.length, d0 + CHUNK);
    const i0 = Math.max(0, tr.indexAt(d0) - 1);
    const i1 = Math.min(tr.points.length - 1, tr.indexAt(d1) + 2);
    const pts = tr.points.slice(i0, i1 + 1);
    const path = (g: Graphics) => {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      return g;
    };

    // Curb: base laranja e quads brancos por cima, a partir das normais por vértice.
    const curb = path(new Graphics()).stroke({ width: ROAD_W + CURB_W * 2, color: this.theme.curbA, join: 'round', cap: 'butt' });
    const inner = ROAD_W / 2 - 1;
    const outer = ROAD_W / 2 + CURB_W;
    const white = (i: number) => Math.floor(tr.cum[i] / CURB_STRIPE) % 2 === 1;
    for (const side of [-1, 1]) {
      let i = i0;
      while (i < i1) {
        if (!white(i)) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < i1 && white(j + 1)) j++;
        const end = Math.min(j + 1, i1);
        const poly: number[] = [];
        for (let k = i; k <= end; k++) poly.push(tr.points[k].x + this.normals[k].x * outer * side, tr.points[k].y + this.normals[k].y * outer * side);
        for (let k = end; k >= i; k--) poly.push(tr.points[k].x + this.normals[k].x * inner * side, tr.points[k].y + this.normals[k].y * inner * side);
        curb.poly(poly).fill(this.theme.curbB);
        i = j + 1;
      }
    }
    c.addChild(curb);

    const asphalt = this.t(`track-asphalt${this.theme.suffix ? '-' + this.theme.suffix : ''}`);
    if (asphalt) {
      // Asfalto em tile, recortado pela forma da estrada deste bloco.
      const mask = path(new Graphics()).stroke({ width: ROAD_W, color: 0xffffff, join: 'round', cap: 'butt' });
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs) - ROAD_W;
      const y0 = Math.min(...ys) - ROAD_W;
      const tile = new TilingSprite({ texture: asphalt, width: Math.max(...xs) - x0 + ROAD_W, height: Math.max(...ys) - y0 + ROAD_W });
      tile.position.set(x0, y0);
      tile.tileScale.set(0.3);
      tile.tilePosition.set(-x0, -y0);
      tile.mask = mask;
      c.addChild(mask, tile);
    } else {
      c.addChild(path(new Graphics()).stroke({ width: ROAD_W, color: 0x3d3d48, join: 'round', cap: 'butt' }));
    }

    // Linha central tracejada.
    const dashes = new Graphics();
    for (let d = Math.ceil(d0 / 34) * 34; d < d1; d += 34) {
      const a = tr.poseAt(d);
      const b = tr.poseAt(d + 16);
      dashes.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    dashes.stroke({ width: 3, color: asphalt ? 0xf4f4f4 : 0xdddddd, alpha: asphalt ? 0.8 : 1 });
    c.addChild(dashes);

    if (index === 0) this.addLine(c, 0);
    if (this.finishAt !== null && this.finishAt >= d0 && this.finishAt < d0 + CHUNK) this.addLine(c, this.finishAt);
    this.addProps(c, index, d0, d1);
    return c;
  }

  /** Linha de partida/meta: sprite do manifest ou xadrez desenhado. */
  private addLine(into: Container, d: number): void {
    const p = this.track.poseAt(d);
    const tex = this.t('prop-startline');
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.height = ROAD_W + 8;
      s.width = (tex.width / tex.height) * s.height * 1.4;
      s.position.set(p.x, p.y);
      s.rotation = p.angle;
      into.addChild(s);
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
    into.addChild(finish);
  }

  /** Árvores, arbustos, cones, pneus e bancadas do bloco: ordenados por y, nunca sobre a estrada. */
  private addProps(into: Container, index: number, d0: number, d1: number): void {
    const layer = new Container();
    layer.sortableChildren = true;
    const rng = mulberry32(7 + index * 7919);
    const tr = this.track;
    const roadEdge = ROAD_W / 2 + CURB_W;
    const placed: { x: number; y: number; r: number }[] = [];
    // O mapa só avança em x (ver Road): basta comparar com os pontos da estrada próximos em distância.
    const lo = Math.max(0, tr.indexAt(d0 - 400));
    const hi = Math.min(tr.points.length - 1, tr.indexAt(d1 + 400));
    const clearance = (x: number, y: number) => {
      let best = Infinity;
      for (let i = lo; i <= hi; i++) {
        const dx = tr.points[i].x - x;
        const dy = tr.points[i].y - y;
        const dd = dx * dx + dy * dy;
        if (dd < best) best = dd;
      }
      return Math.sqrt(best);
    };
    const add = (tex: Texture, x: number, y: number, w: number, h: number, rotation = 0) => {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.width = w;
      s.height = h;
      s.rotation = rotation;
      s.position.set(x, y);
      s.zIndex = y;
      layer.addChild(s);
      return s;
    };

    // Bancadas: à partida e à meta, do lado de fora da curva (lado esquerdo na partida, direito na meta).
    const stand = this.t('prop-grandstand');
    if (stand) {
      const standAt = (d: number, side: number, w: number) => {
        const h = (stand.height / stand.width) * w;
        const p = tr.poseAt(d);
        const off = roadEdge + 14 + h / 2;
        const x = p.x + p.nx * side * off;
        const y = p.y + p.ny * side * off;
        const s = add(stand, x, y, w, h, Math.atan2(-p.ny * side, -p.nx * side) - Math.PI / 2);
        this.stands.push(s);
        placed.push({ x, y, r: w / 2 });
      };
      if (index === 0) standAt(60, -1, 300);
      if (this.finishAt !== null && this.finishAt >= d0 && this.finishAt < d0 + CHUNK) {
        standAt(this.finishAt - 40, 1, 300);
        standAt(this.finishAt + 260, -1, 230);
      }
    }

    // Props espalhados: a densidade dos temas era "count por mundo antigo" (e "por pista" nos que ficam junto da estrada).
    const chunkLen = d1 - d0;
    const place = (key: string, size: number, count: number, margin: number, nearRoad: boolean, spin = false) => {
      const tex = this.t(key);
      if (!tex) return;
      const r = size / 2;
      const along = nearRoad ? count * (chunkLen / OLD_TRACK_LEN) : (count * (chunkLen * 900)) / OLD_WORLD_AREA;
      const want = Math.floor(along) + (rng() < along - Math.floor(along) ? 1 : 0);
      for (let n = 0, tries = 0; n < want && tries < 120; tries++) {
        let x: number;
        let y: number;
        if (nearRoad) {
          const p = tr.poseAt(d0 + rng() * chunkLen);
          const off = (rng() < 0.5 ? -1 : 1) * (roadEdge + r + margin + rng() * 10);
          x = p.x + p.nx * off;
          y = p.y + p.ny * off;
        } else {
          const p = tr.poseAt(d0 + rng() * chunkLen);
          const off = (rng() < 0.5 ? -1 : 1) * (roadEdge + r + margin + rng() * 520);
          x = p.x + p.nx * off;
          y = p.y + p.ny * off;
        }
        if (clearance(x, y) < roadEdge + r * 0.8 + margin) continue;
        if (placed.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.9)) continue;
        placed.push({ x, y, r });
        const k = size / Math.max(tex.width, tex.height);
        add(tex, x, y, tex.width * k, tex.height * k, spin ? rng() * Math.PI * 2 : 0);
        n++;
      }
    };
    for (const pr of this.theme.props) place(pr.key, pr.size, pr.count, pr.margin, pr.nearRoad, pr.spin);
    into.addChild(layer);
  }

  private carNode(car: CarState): CarNode {
    const root = new Container();
    const tex = this.t(car.driver.car ?? 'car-grey');
    const node: CarNode = { root };

    if (tex) {
      const body = new Sprite(tex);
      body.anchor.set(0.5);
      body.scale.set((CAR_LEN * 1.12) / tex.width);
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
    this.progressLen = race.raceLength;
    if (race.finishLine !== null && race.finishLine !== this.finishAt) {
      // A meta acaba de ser gerada: refaz os blocos para a desenhar (e as bancadas).
      this.finishAt = race.finishLine;
      for (const c of this.chunks.values()) c.destroy({ children: true });
      this.chunks.clear();
      this.stands = [];
    }
    const dt = Math.min(0.1, Math.max(0, clock - this.lastRender));
    this.lastRender = clock;
    const n = race.cars.length;
    race.cars.forEach((car, i) => {
      const node = this.cars.get(car.driver.id) ?? this.carNode(car);
      const sprite = node.root;
      const lane = (i - (n - 1) / 2) * (ROAD_W / (n + 1));
      const jit = this.jitter(car.driver.id, race.time, Math.min(1, race.time / 3) * Math.min(1, ((race.finishLine ?? Infinity) - car.distance) / 600)); // tempo da corrida: parado na contagem e na pausa
      const pose = this.track.poseAt(Math.max(0, Math.min(this.shownDistance(race, car) + jit.along, race.finishLine ?? Infinity)));
      sprite.position.set(pose.x + pose.nx * (lane + jit.lane), pose.y + pose.ny * (lane + jit.lane));
      const spinning = car.spinLeft > 0;
      sprite.rotation = pose.angle + (spinning ? clock * 14 : 0);
      const label = sprite.getChildByLabel('label');
      if (label) label.rotation = -sprite.rotation;

      const running = !car.crossed && !spinning;
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
    if (isTeam && car.crossed && !node.finished) {
      node.finished = true;
      for (let k = 0; k < 70; k++) P.confetti(sprite.x, sprite.y);
      this.cheer();
    }
  }

  /** Só visual: cada carro tem um pequeno avanço fixo e uma oscilação lenta, para não andarem todos exatamente lado a lado. */
  private jitter(id: string, t: number, k: number): { along: number; lane: number } {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    const u = ((h >>> 0) % 1000) / 1000;
    const v = (((h >>> 10) >>> 0) % 1000) / 1000;
    return {
      along: k * (u * 55 + Math.sin(t * (0.5 + v * 0.5) + v * 6.28) * 7),
      lane: k * Math.sin(t * (0.35 + u * 0.4) + u * 6.28) * 4,
    };
  }

  /** Distância desenhada: o carro da turma é exato; os outros ficam comprimidos (sem trocar de ordem) para não fugirem do ecrã. */
  private shownDistance(race: Race, car: CarState): number {
    const team = race.team;
    if (!team || car === team) return car.distance;
    const gap = car.distance - team.distance;
    const a = Math.abs(gap);
    if (a <= NEAR_GAP) return car.distance;
    const over = a - NEAR_GAP;
    const shown = NEAR_GAP + NEAR_SOFT * Math.tanh(over / NEAR_SOFT) + NEAR_SLOPE * over;
    const d = team.distance + Math.sign(gap) * shown;
    return Math.max(0, Math.min(d, race.finishLine ?? Infinity));
  }

  /** Segue o carro da turma: lerp com look-ahead, zoom-out no turbo/nitro, tremor no despiste. Sem rodar. */
  private followCamera(race: Race, team: CarState, root: Container, clock: number): void {
    const dt = Math.min(0.1, Math.max(0, clock - this.lastClock));
    this.lastClock = clock;
    const lookX = root.x + Math.cos(this.track.poseAt(team.distance).angle) * LOOK_AHEAD;
    const lookY = root.y + Math.sin(this.track.poseAt(team.distance).angle) * LOOK_AHEAD;
    const { tx, ty, fit } = this.frame(race, team, root, lookX, lookY);
    const cam = this.cam;
    if (!cam.snapped) {
      cam.x = tx;
      cam.y = ty;
      cam.snapped = true;
    }
    // O atraso da câmara é velocidade / k: com k fixo, o avanço rápido (todos responderam) e a rajada do reveal deixavam o carro fora do ecrã.
    const speed = dt > 0 ? Math.abs(team.distance - this.lastTeamDist) / dt : 0;
    this.lastTeamDist = team.distance;
    const k = 1 - Math.exp(-dt * Math.max(3, speed / 40));
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    const spinning = team.spinLeft > 0;
    const boosted = !team.crossed && !spinning && race.bursting;
    const targetZoom = Math.min(fit, boosted && team.nitroActive ? 0.84 : boosted && team.lastEffect === 'turbo' ? 0.92 : 1);
    cam.zoom += (targetZoom - cam.zoom) * (1 - Math.exp(-dt * 2.5));
    this.ensureChunks(team.distance);
    this.applyCamera(spinning ? 10 : 0);
    this.edgeMarkers(race, team);

    // Minimapa: um ponto por carro, o da turma maior e por cima.
    const d = this.miniDots;
    d.clear();
    const order = [...race.cars].sort((a, b) => Number(a === team) - Number(b === team));
    for (const c of order) {
      const node = this.cars.get(c.driver.id);
      if (!node) continue;
      const isTeam = c === team;
      const x = Math.min(1, Math.max(0, c.distance / this.progressLen)) * this.miniW;
      const y = isTeam ? 0 : ((c.driver.kind === 'ghost' ? 1 : -1) * 7 * ((this.cars.size + order.indexOf(c)) % 2 ? 1 : -1));
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

  /**
   * Enquadramento: o carro da turma mais os rivais por ordem de proximidade, enquanto couberem com o zoom mínimo.
   * Devolve o centro e o zoom que os abrange (1 = sem afastar).
   */
  private frame(race: Race, team: CarState, root: Container, lookX: number, lookY: number): { tx: number; ty: number; fit: number } {
    const s0 = this.baseScale() * FOLLOW_ZOOM;
    if (!s0 || !this.view.w) return { tx: lookX, ty: lookY, fit: 1 };
    let x0 = Math.min(root.x, lookX), x1 = Math.max(root.x, lookX);
    let y0 = Math.min(root.y, lookY), y1 = Math.max(root.y, lookY);
    const zoomFor = (a: number, b: number, c: number, d: number) => Math.min(this.view.w / (s0 * (b - a + FRAME_MARGIN * 2)), this.view.h / (s0 * (d - c + FRAME_MARGIN * 2)));
    const rivals = race.cars.filter((c) => c !== team && !c.crossed);
    const byGap = (a: CarState, b: CarState) => Math.abs(a.distance - team.distance) - Math.abs(b.distance - team.distance);
    const ahead = rivals.filter((c) => c.distance >= team.distance).sort(byGap).slice(0, FRAME_AHEAD);
    const behind = rivals.filter((c) => c.distance < team.distance).sort(byGap).slice(0, FRAME_BEHIND);
    const others = [...ahead, ...behind].sort(byGap);
    for (const c of others) {
      const r = this.cars.get(c.driver.id)?.root;
      if (!r) continue;
      const nx0 = Math.min(x0, r.x), nx1 = Math.max(x1, r.x), ny0 = Math.min(y0, r.y), ny1 = Math.max(y1, r.y);
      if (zoomFor(nx0, nx1, ny0, ny1) < MIN_FOLLOW_ZOOM) break;
      x0 = nx0; x1 = nx1; y0 = ny0; y1 = ny1;
    }
    return { tx: (x0 + x1) / 2, ty: (y0 + y1) / 2, fit: Math.max(MIN_FOLLOW_ZOOM, Math.min(1, zoomFor(x0, x1, y0, y1))) };
  }

  /** Um ponto no bordo do ecrã, com a diferença em segundos, para cada carro que está fora de vista. */
  private edgeMarkers(race: Race, team: CarState): void {
    const g = this.edgeDots;
    g.clear();
    const used = new Set<string>();
    const w = this.view.w;
    const h = this.view.h;
    const m = 26;
    const k = this.world.scale.x;
    for (const c of race.cars) {
      if (c === team || c.crossed) continue;
      const r = this.cars.get(c.driver.id)?.root;
      if (!r) continue;
      const sx = this.world.x + r.x * k;
      const sy = this.world.y + r.y * k;
      if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) continue;
      // Sobre o raio do centro do ecrã até ao carro, para a direção (e não só o canto) se perceber.
      const cx = w / 2;
      const cy = h / 2;
      const dx = sx - cx;
      const dy = sy - cy;
      const t = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - 70) / Math.abs(dy || 1e-6));
      const ex = cx + dx * t;
      const ey = cy + dy * t;
      g.circle(ex, ey, 9).fill(c.driver.kind === 'ghost' ? 0xbfc5cc : c.driver.color || 0x95a5a6).stroke({ width: 2, color: 0xffffff });
      const gap = (c.distance - team.distance) / race.baseSpeed;
      let lab = this.edgeLabels.get(c.driver.id);
      if (!lab) {
        lab = new Text({ text: '', style: { fontFamily: 'system-ui', fontSize: 12, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1b1b24, width: 3 } } });
        lab.anchor.set(0.5, 0);
        this.edge.addChild(lab);
        this.edgeLabels.set(c.driver.id, lab);
      }
      lab.text = `${gap >= 0 ? '−' : '+'}${Math.abs(gap).toFixed(0)}s`;
      lab.position.set(ex, ey + 11);
      lab.visible = true;
      used.add(c.driver.id);
    }
    for (const [id, t] of this.edgeLabels) if (!used.has(id)) t.visible = false;
  }

  destroy(): void {
    this.destroyed = true;
    try {
      this.app.destroy(true, { children: true });
    } catch {
      /* ainda não inicializado */
    }
  }

  /** Nova corrida na mesma estrada (simulador): limpa os blocos e muda onde fica a meta. */
  reset(): void {
    this.finishAt = null;
    for (const c of this.chunks.values()) c.destroy({ children: true });
    this.chunks.clear();
    this.stands = [];
    this.cam.snapped = false;
    this.lastTeamDist = 0;
    const start = this.track.poseAt(0);
    this.cam.x = start.x + LOOK_AHEAD;
    this.cam.y = start.y;
    if (this.app.renderer) this.ensureChunks(0);
    this.carLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cars.clear();
    this.particles.clear();
    this.miniLabels.forEach((t) => t.destroy());
    this.miniLabels.clear();
  }
}
