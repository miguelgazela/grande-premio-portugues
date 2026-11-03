import { Application, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { mulberry32 } from '../engine/rng';
import type { Track } from '../engine/track';
import type { CarState, Race } from '../engine/race';
import { loadRaceTextures, type RaceTextures } from './assets';

const WORLD_W = 1000;
const WORLD_H = 620;
const ROAD_W = 56;
const CAR_LEN = 34;

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

  constructor(
    private track: Track,
    private opts: { sprites?: boolean } = {},
  ) {}

  async mount(el: HTMLElement): Promise<void> {
    if (this.opts.sprites) this.tex = await loadRaceTextures();
    await this.app.init({ background: 0x5cb85c, antialias: true, resizeTo: el, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    if (this.destroyed) return;
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.drawTrack();
    this.world.addChild(this.carLayer);
    const fit = () => {
      // `resizeTo` só reage ao resize da janela; a pista muda de altura quando a pergunta aparece/desaparece.
      if (el.clientWidth && el.clientHeight) this.app.renderer.resize(el.clientWidth, el.clientHeight);
      const s = Math.min(el.clientWidth / WORLD_W, el.clientHeight / WORLD_H);
      this.world.scale.set(s);
      this.world.position.set((el.clientWidth - WORLD_W * s) / 2, (el.clientHeight - WORLD_H * s) / 2);
    };
    new ResizeObserver(fit).observe(el);
    fit();
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
    const grass = this.t('bg-grass');
    if (grass) {
      const bg = new TilingSprite({ texture: grass, width: 4000, height: 3000 });
      bg.position.set(-1500, -1200);
      bg.tileScale.set(0.45);
      this.world.addChild(bg);
    }

    const road = new Graphics();
    const asphalt = this.t('track-asphalt');
    const hasCurb = !!this.t('track-curb');
    if (!hasCurb) this.path(road).stroke({ width: ROAD_W + 10, color: 0xff8c1a, join: 'round' });
    if (asphalt) {
      // Asfalto em tile, recortado pela forma da estrada.
      const mask = this.path(new Graphics()).stroke({ width: ROAD_W, color: 0xffffff, join: 'round' });
      const tile = new TilingSprite({ texture: asphalt, width: WORLD_W + 200, height: WORLD_H + 200 });
      tile.position.set(-100, -100);
      tile.tileScale.set(0.3);
      tile.mask = mask;
      this.world.addChild(road, mask, tile);
    } else {
      this.path(road).stroke({ width: ROAD_W, color: 0x3d3d48, join: 'round' });
      this.world.addChild(road);
    }

    this.drawProps();
    if (hasCurb) this.drawCurbs();

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
  }

  /** Faixas laranja/branca ao longo das duas bordas. */
  private drawCurbs(): void {
    const curb = this.t('track-curb')!;
    const layer = new Container();
    const len = 44;
    const thick = 6;
    for (let d = 0; d < this.track.length; d += len) {
      const p = this.track.poseAt(d + len / 2);
      for (const side of [-1, 1]) {
        const off = side * (ROAD_W / 2 + thick / 2 - 1);
        const s = new Sprite(curb);
        s.anchor.set(0.5);
        s.width = len + 2;
        s.height = thick;
        s.position.set(p.x + p.nx * off, p.y + p.ny * off);
        s.rotation = p.angle;
        layer.addChild(s);
      }
    }
    this.world.addChild(layer);
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

  /** Árvores, arbustos, cones, pneus e bancada, sem nunca tapar a estrada. */
  private drawProps(): void {
    const layer = new Container();
    const rng = mulberry32(7);
    const pts = this.track.points;
    const clearance = (x: number, y: number) => {
      let best = Infinity;
      for (let i = 0; i < pts.length; i += 2) best = Math.min(best, Math.hypot(pts[i].x - x, pts[i].y - y));
      return best;
    };
    const placed: { x: number; y: number; r: number }[] = [];
    const place = (key: string, size: number, count: number, margin: number, nearRoad: boolean) => {
      const tex = this.t(key);
      if (!tex) return;
      for (let n = 0, tries = 0; n < count && tries < 500; tries++) {
        let x: number;
        let y: number;
        if (nearRoad) {
          const p = this.track.poseAt(rng() * this.track.length);
          const off = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + margin + rng() * 14);
          x = p.x + p.nx * off;
          y = p.y + p.ny * off;
        } else {
          x = -90 + rng() * (WORLD_W + 180);
          y = -60 + rng() * (WORLD_H + 120);
        }
        const r = size / 2;
        if (clearance(x, y) < ROAD_W / 2 + margin + r * 0.6) continue;
        if (placed.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.9)) continue;
        placed.push({ x, y, r });
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(size / Math.max(tex.width, tex.height));
        s.position.set(x, y);
        s.rotation = key === 'prop-tree' || key === 'prop-bush' ? rng() * Math.PI * 2 : 0;
        layer.addChild(s);
        n++;
      }
    };

    // Bancada junto à reta de cima, virada para a pista.
    const stand = this.t('prop-grandstand');
    if (stand) {
      const w = 130;
      const h = (stand.height / stand.width) * w;
      const s = new Sprite(stand);
      s.anchor.set(0.5);
      s.width = w;
      s.height = h;
      s.position.set(470, 90 - ROAD_W / 2 - 14 - h / 2 - 8);
      layer.addChild(s);
      placed.push({ x: s.x, y: s.y, r: w / 2 });
    }
    place('prop-tree', 56, 16, 8, false);
    place('prop-bush', 34, 10, 6, false);
    place('prop-tires', 26, 5, 6, true);
    place('prop-cone', 16, 8, 4, true);
    this.world.addChild(layer);
  }

  private carNode(car: CarState): CarNode {
    const root = new Container();
    const tex = this.t(CAR_BY_COLOR[car.driver.kind === 'ghost' ? 0x95a5a6 : car.driver.color] ?? 'car-grey');
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
    if (car.driver.kind === 'ghost') root.alpha = 0.45;
    if (car.driver.kind === 'team') {
      const label = new Text({ text: 'Turma', style: { fontFamily: 'system-ui', fontSize: 14, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1b1b24, width: 4 } } });
      label.anchor.set(0.5, 1);
      label.position.set(0, -14);
      label.label = 'label';
      root.addChild(label);
    }
    this.carLayer.addChild(root);
    this.cars.set(car.driver.id, node);
    return node;
  }

  render(race: Race, clock: number): void {
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
      const nitroOn = running && car.nitroActive;
      const turboOn = running && !car.nitroActive && car.lastEffect === 'turbo';
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
      if (node.smoke) {
        node.smoke.visible = spinning;
        node.smoke.rotation = -sprite.rotation + clock * 2; // o fumo não roda com o carro
        node.smoke.alpha = 0.7 + 0.3 * Math.sin(clock * 12);
      }
    });
    // Carro da turma por cima.
    const team = race.team;
    const teamNode = team && this.cars.get(team.driver.id);
    if (teamNode) this.carLayer.setChildIndex(teamNode.root, this.carLayer.children.length - 1);
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
  }
}
