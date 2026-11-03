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

/** Default loop in a 1000×620 world. */
export const DEFAULT_TRACK_POINTS: Vec[] = [
  { x: 180, y: 120 },
  { x: 520, y: 90 },
  { x: 820, y: 130 },
  { x: 900, y: 300 },
  { x: 760, y: 360 },
  { x: 600, y: 300 },
  { x: 480, y: 380 },
  { x: 640, y: 500 },
  { x: 520, y: 560 },
  { x: 200, y: 520 },
  { x: 100, y: 380 },
  { x: 110, y: 220 },
];
