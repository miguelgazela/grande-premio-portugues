import { clamp, gaussian, mulberry32 } from './rng';

export interface Vec {
  x: number;
  y: number;
}

export interface TrackPose {
  x: number;
  y: number;
  /** Heading in radians. */
  angle: number;
  /** Unit normal (left of heading), used to spread cars across lanes. */
  nx: number;
  ny: number;
}

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** Closed track built from control points. Distance 0 is the start/finish line. */
export class Track {
  readonly points: Vec[] = [];
  readonly cum: number[] = [];
  readonly length: number;

  constructor(control: Vec[], samplesPerSegment = 40) {
    const n = control.length;
    for (let i = 0; i < n; i++) {
      const p0 = control[(i - 1 + n) % n];
      const p1 = control[i];
      const p2 = control[(i + 1) % n];
      const p3 = control[(i + 2) % n];
      for (let s = 0; s < samplesPerSegment; s++) {
        this.points.push(catmullRom(p0, p1, p2, p3, s / samplesPerSegment));
      }
    }
    this.points.push({ ...this.points[0] });
    let total = 0;
    this.cum.push(0);
    for (let i = 1; i < this.points.length; i++) {
      total += Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y);
      this.cum.push(total);
    }
    this.length = total;
  }

  poseAt(distance: number): TrackPose {
    const d = ((distance % this.length) + this.length) % this.length;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = this.points[lo];
    const b = this.points[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (d - this.cum[lo]) / seg;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: a.x + dx * t,
      y: a.y + dy * t,
      angle: Math.atan2(dy, dx),
      nx: -dy / len,
      ny: dx / len,
    };
  }
}

/** Largura da estrada e do curb (cada lado), em unidades do mundo. */
export const ROAD_W = 56;
export const CURB_W = 7;
export const WORLD_W = 1800;
export const WORLD_H = 1140;

const CLASSIC: Vec[] = [
  { x: 900, y: 117 },
  { x: 1144, y: 214 },
  { x: 1279, y: 345 },
  { x: 1373, y: 446 },
  { x: 1512, y: 528 },
  { x: 1665, y: 640 },
  { x: 1712, y: 789 },
  { x: 1591, y: 924 },
  { x: 1361, y: 999 },
  { x: 1123, y: 1028 },
  { x: 900, y: 1049 },
  { x: 658, y: 1062 },
  { x: 408, y: 1023 },
  { x: 238, y: 912 },
  { x: 211, y: 767 },
  { x: 273, y: 640 },
  { x: 319, y: 533 },
  { x: 330, y: 406 },
  { x: 399, y: 250 },
  { x: 606, y: 129 },
];

const TRIANGLE: Vec[] = [{x:812,y:198},{x:940,y:243},{x:1056,y:274},{x:1190,y:291},{x:1353,y:315},{x:1516,y:365},{x:1625,y:449},{x:1640,y:551},{x:1559,y:644},{x:1420,y:711},{x:1277,y:754},{x:1161,y:791},{x:1066,y:840},{x:959,y:904},{x:812,y:964},{x:629,y:990},{x:449,y:964},{x:318,y:890},{x:260,y:792},{x:256,y:698},{x:262,y:620},{x:242,y:551},{x:195,y:474},{x:160,y:379},{x:183,y:276},{x:289,y:192},{x:459,y:150},{x:648,y:158}];

const LOSANGO: Vec[] = [{x:900,y:150},{x:1048,y:172},{x:1170,y:226},{x:1273,y:283},{x:1388,y:331},{x:1518,y:387},{x:1621,y:469},{x:1640,y:570},{x:1562,y:663},{x:1431,y:727},{x:1313,y:772},{x:1230,y:823},{x:1154,y:893},{x:1045,y:960},{x:900,y:990},{x:752,y:968},{x:630,y:914},{x:527,y:857},{x:412,y:809},{x:282,y:753},{x:179,y:671},{x:160,y:570},{x:238,y:477},{x:369,y:413},{x:487,y:368},{x:570,y:317},{x:646,y:247},{x:755,y:180}];

/** Técnica: dois grampos e esses, curvas até ~50 de raio. */
const TECNICO: Vec[] = [{x:724,y:170},{x:769,y:170},{x:814,y:170},{x:859,y:171},{x:904,y:172},{x:949,y:173},{x:994,y:175},{x:1039,y:177},{x:1084,y:179},{x:1129,y:182},{x:1174,y:185},{x:1219,y:189},{x:1264,y:193},{x:1309,y:198},{x:1354,y:203},{x:1399,y:208},{x:1443,y:215},{x:1487,y:226},{x:1529,y:242},{x:1569,y:264},{x:1603,y:292},{x:1629,y:329},{x:1641,y:372},{x:1633,y:416},{x:1607,y:453},{x:1570,y:478},{x:1527,y:493},{x:1483,y:500},{x:1438,y:502},{x:1393,y:500},{x:1348,y:496},{x:1303,y:491},{x:1258,y:487},{x:1213,y:484},{x:1168,y:481},{x:1123,y:479},{x:1078,y:477},{x:1033,y:477},{x:988,y:477},{x:942,y:478},{x:897,y:479},{x:852,y:479},{x:807,y:480},{x:762,y:480},{x:717,y:482},{x:672,y:488},{x:631,y:506},{x:600,y:538},{x:582,y:579},{x:581,y:624},{x:596,y:666},{x:625,y:700},{x:665,y:720},{x:709,y:728},{x:754,y:730},{x:799,y:730},{x:845,y:731},{x:890,y:734},{x:935,y:736},{x:980,y:739},{x:1025,y:741},{x:1070,y:742},{x:1115,y:742},{x:1160,y:741},{x:1205,y:741},{x:1250,y:739},{x:1295,y:739},{x:1340,y:739},{x:1386,y:740},{x:1430,y:743},{x:1475,y:751},{x:1518,y:765},{x:1557,y:788},{x:1590,y:818},{x:1611,y:858},{x:1607,y:902},{x:1581,y:938},{x:1545,y:965},{x:1503,y:982},{x:1459,y:989},{x:1414,y:993},{x:1369,y:997},{x:1324,y:999},{x:1279,y:1001},{x:1234,y:1003},{x:1189,y:1003},{x:1144,y:1003},{x:1098,y:1001},{x:1053,y:998},{x:1009,y:993},{x:964,y:987},{x:920,y:979},{x:876,y:969},{x:832,y:957},{x:789,y:945},{x:745,y:935},{x:700,y:929},{x:655,y:928},{x:610,y:933},{x:567,y:947},{x:527,y:966},{x:484,y:979},{x:439,y:982},{x:394,y:976},{x:351,y:962},{x:311,y:942},{x:276,y:914},{x:253,y:875},{x:251,y:831},{x:265,y:788},{x:275,y:744},{x:275,y:699},{x:264,y:655},{x:243,y:615},{x:220,y:576},{x:202,y:535},{x:191,y:492},{x:189,y:447},{x:197,y:402},{x:210,y:359},{x:230,y:319},{x:255,y:281},{x:288,y:250},{x:325,y:225},{x:366,y:206},{x:409,y:193},{x:454,y:185},{x:498,y:180},{x:543,y:176},{x:588,y:173},{x:634,y:171},{x:679,y:170}];

/** Pistas disponíveis (todas no mesmo mundo); a sessão escolhe uma de forma estável pelo id. */
export const TRACKS: { id: string; name: string; points: Vec[]; samples?: number }[] = [
  { id: 'classico', name: 'Clássico', points: CLASSIC },
  { id: 'triangulo', name: 'Triângulo', points: TRIANGLE },
  { id: 'losango', name: 'Losango', points: LOSANGO },
  { id: 'tecnico', name: 'Técnico', points: TECNICO, samples: 6 },
];

export const DEFAULT_TRACK_POINTS: Vec[] = CLASSIC;

/** Pista de uma sessão: determinística, para sobreviver a um refresh do projetor. */
export function trackFor(sessionId: string): (typeof TRACKS)[number] {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  return TRACKS[h % TRACKS.length];
}

/** Pista aberta, gerada a partir de uma semente: avança sempre para a frente (sem voltas nem cruzamentos). */
export class Road {
  readonly points: Vec[] = [];
  readonly cum: number[] = [];
  readonly length: number;

  /** `length` é o mínimo; a estrada acaba um pouco depois (a meta fica dentro dela). */
  constructor(seed: number, length: number, samplesPerSegment = 12) {
    const rng = mulberry32(seed);
    const step = 170;
    const n = Math.ceil(length / (step * 0.95)) + 8;
    const control: Vec[] = [{ x: -step, y: 0 }, { x: 0, y: 0 }];
    let heading = 0;
    let curv = 0;
    for (let i = 0; i < n; i++) {
      // Curvatura com memória (curvas longas) e uma força que traz o rumo de volta ao eixo.
      curv = curv * 0.8 + gaussian(rng) * 0.2 - heading * 0.12;
      curv = clamp(curv, -0.42, 0.42);
      heading = clamp(heading + curv, -1.2, 1.2);
      const last = control[control.length - 1];
      control.push({ x: last.x + Math.cos(heading) * step, y: last.y + Math.sin(heading) * step });
    }
    for (let i = 1; i < control.length - 2; i++) {
      for (let s = 0; s < samplesPerSegment; s++) {
        this.points.push(catmullRom(control[i - 1], control[i], control[i + 1], control[i + 2], s / samplesPerSegment));
      }
    }
    let total = 0;
    this.cum.push(0);
    for (let i = 1; i < this.points.length; i++) {
      total += Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y);
      this.cum.push(total);
    }
    this.length = total;
  }

  /** Índice do último ponto com `cum <= d`. */
  indexAt(d: number): number {
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  poseAt(distance: number): TrackPose {
    const d = clamp(distance, 0, this.length);
    const lo = this.indexAt(d);
    const hi = Math.min(lo + 1, this.points.length - 1);
    const a = this.points[lo];
    const b = this.points[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (d - this.cum[lo]) / seg;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * t, y: a.y + dy * t, angle: Math.atan2(dy, dx), nx: -dy / len, ny: dx / len };
  }
}

/** Semente estável da estrada de uma sessão (sobrevive a um refresh do projetor). */
export function roadSeed(sessionId: string): number {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) h = Math.imul(h ^ sessionId.charCodeAt(i), 16777619) >>> 0;
  return h;
}
