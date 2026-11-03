import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Track } from '../engine/track';
import type { CarState, Race } from '../engine/race';

const WORLD_W = 1000;
const WORLD_H = 620;
const ROAD_W = 56;

/** Placeholder renderer: shapes only. Higgsfield sprites replace these later. */
export class RaceView {
  readonly app = new Application();
  private world = new Container();
  private carLayer = new Container();
  private cars = new Map<string, Container>();
  private effects = new Map<string, Graphics>();

  constructor(private track: Track) {}

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ background: 0x5cb85c, antialias: true, resizeTo: el });
    el.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.drawTrack();
    this.world.addChild(this.carLayer);
    const fit = () => {
      const s = Math.min(el.clientWidth / WORLD_W, el.clientHeight / WORLD_H);
      this.world.scale.set(s);
      this.world.position.set((el.clientWidth - WORLD_W * s) / 2, (el.clientHeight - WORLD_H * s) / 2);
    };
    new ResizeObserver(fit).observe(el);
    fit();
  }

  private drawTrack(): void {
    const pts = this.track.points;
    const path = (g: Graphics) => {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      return g;
    };
    const g = new Graphics();
    path(g).stroke({ width: ROAD_W + 10, color: 0xff8c1a, join: 'round' });
    path(g).stroke({ width: ROAD_W, color: 0x3d3d48, join: 'round' });

    // Dashed centre line.
    for (let d = 0; d < this.track.length; d += 34) {
      const a = this.track.poseAt(d);
      const b = this.track.poseAt(d + 16);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ width: 3, color: 0xdddddd });

    // Chequered start/finish line.
    const p = this.track.poseAt(0);
    const finish = new Graphics();
    const cell = 7;
    const rows = Math.ceil(ROAD_W / cell);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        finish.rect(c * cell - cell, r * cell - ROAD_W / 2, cell, cell).fill((r + c) % 2 ? 0x111111 : 0xffffff);
      }
    }
    finish.position.set(p.x, p.y);
    finish.rotation = p.angle;
    this.world.addChild(g, finish);
  }

  private carSprite(car: CarState): Container {
    const c = new Container();
    const body = new Graphics();
    const color = car.driver.color;
    body.roundRect(-17, -9, 34, 18, 6).fill(color).stroke({ width: 2, color: 0x1b1b24 });
    body.roundRect(2, -6, 9, 12, 3).fill(0xcfe8ff);
    if (car.driver.kind === 'ghost') c.alpha = 0.45;
    const fx = new Graphics();
    c.addChild(fx, body);
    this.effects.set(car.driver.id, fx);
    if (car.driver.kind === 'team') {
      const label = new Text({ text: 'Turma', style: { fontFamily: 'system-ui', fontSize: 14, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x1b1b24, width: 4 } } });
      label.anchor.set(0.5, 1);
      label.position.set(0, -14);
      label.label = 'label';
      c.addChild(label);
    }
    this.carLayer.addChild(c);
    this.cars.set(car.driver.id, c);
    return c;
  }

  render(race: Race, clock: number): void {
    const n = race.cars.length;
    race.cars.forEach((car, i) => {
      const sprite = this.cars.get(car.driver.id) ?? this.carSprite(car);
      const lane = (i - (n - 1) / 2) * (ROAD_W / (n + 1));
      const pose = this.track.poseAt(car.distance);
      sprite.position.set(pose.x + pose.nx * lane, pose.y + pose.ny * lane);
      const spinning = car.spinLeft > 0;
      sprite.rotation = pose.angle + (spinning ? clock * 14 : 0);
      const label = sprite.getChildByLabel('label');
      if (label) label.rotation = -sprite.rotation;

      const fx = this.effects.get(car.driver.id)!;
      fx.clear();
      if (car.finishTime === null && !spinning && (car.lastEffect === 'turbo' || car.nitroActive)) {
        const len = car.nitroActive ? 22 : 12;
        const flicker = 0.7 + 0.3 * Math.sin(clock * 40 + i);
        fx.poly([-17, -6, -17 - len * flicker, 0, -17, 6]).fill(car.nitroActive ? 0x4fd2ff : 0xffb21a);
      }
    });
    // Team car on top.
    const team = race.team;
    if (team) this.carLayer.setChildIndex(this.cars.get(team.driver.id)!, this.carLayer.children.length - 1);
  }

  destroy(): void {
    try {
      this.app.destroy(true, { children: true });
    } catch { /* ainda não inicializado */ }
  }

  reset(): void {
    this.carLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cars.clear();
    this.effects.clear();
  }
}
