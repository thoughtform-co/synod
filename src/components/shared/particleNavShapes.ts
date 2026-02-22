/**
 * Particle nav icon shapes — construction grammar.
 * Three layers: skeleton (human intent), signal (navigational accent), drift (machine trace).
 * Composed from six geometric primitives; see references/particle-icon-grammar.md.
 */

export interface NavShapePoint {
  x: number;
  y: number;
  alpha?: number;
}

export type ParticleNavShapeKey =
  | 'inbox'
  | 'snoozed'
  | 'done'
  | 'drafts'
  | 'sent'
  | 'invites'
  | 'promotions'
  | 'social'
  | 'updates'
  | 'spam'
  | 'settings'
  | 'sync';

const R = 5; // nominal radius for 18px icon
const GRID = 3;
const DRIFT_OFFSET = 3; // one grid unit in shape coords
const DRIFT_ALPHA_MIN = 0.4;
const DRIFT_ALPHA_MAX = 0.55;

// ═══════════════════════════════════════════════════════════════════════════
// PRIMITIVES (Grammar mapping: Course Lines, Waypoints, Viewport Frame, etc.)
// ═══════════════════════════════════════════════════════════════════════════

/** axis — Line of pixels along cardinal or diagonal. Course Lines. */
function axis(
  dir: 'h' | 'v' | 'ne' | 'nw',
  from: number,
  to: number,
  step: number = 1,
  alpha: number = 0.9
): NavShapePoint[] {
  const pts: NavShapePoint[] = [];
  const len = to - from;
  const n = Math.max(1, Math.round(Math.abs(len) / step));
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const v = from + len * t;
    if (dir === 'h') pts.push({ x: v, y: 0, alpha });
    else if (dir === 'v') pts.push({ x: 0, y: v, alpha });
    else if (dir === 'ne') pts.push({ x: v, y: -v, alpha });
    else pts.push({ x: -v, y: -v, alpha });
  }
  return pts;
}

/** vertices — N-gon at radius r. Waypoints. */
function vertices(n: number, radius: number, alpha: number = 0.9, rotation: number = 0): NavShapePoint[] {
  const pts: NavShapePoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rotation;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, alpha });
  }
  return pts;
}

/** frame — Corner bracket L-shapes. Viewport Frame. */
function frame(corners: Array<'tl' | 'tr' | 'bl' | 'br'>, arm: number = R, alpha: number = 0.9): NavShapePoint[] {
  const pts: NavShapePoint[] = [];
  const armStep = Math.min(2, arm);
  for (const c of corners) {
    if (c === 'tl') {
      for (let u = 0; u <= arm; u += armStep) pts.push({ x: -arm + u, y: -R, alpha });
      for (let u = armStep; u <= arm; u += armStep) pts.push({ x: -R, y: -R + u, alpha });
    } else if (c === 'tr') {
      for (let u = 0; u <= arm; u += armStep) pts.push({ x: R - u, y: -R, alpha });
      for (let u = armStep; u <= arm; u += armStep) pts.push({ x: R, y: -R + u, alpha });
    } else if (c === 'bl') {
      for (let u = 0; u <= arm; u += armStep) pts.push({ x: -arm + u, y: R, alpha });
      for (let u = armStep; u <= arm; u += armStep) pts.push({ x: -R, y: R - u, alpha });
    } else {
      for (let u = 0; u <= arm; u += armStep) pts.push({ x: R - u, y: R, alpha });
      for (let u = armStep; u <= arm; u += armStep) pts.push({ x: R, y: R - u, alpha });
    }
  }
  return pts;
}

/** trajectory — Directional line with terminal cluster. Heading Indicator. */
function trajectory(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tipCluster: boolean,
  alpha: number = 0.9
): NavShapePoint[] {
  const pts: NavShapePoint[] = [];
  const steps = Math.max(4, Math.round(Math.hypot(toX - fromX, toY - fromY) / 1.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: fromX + (toX - fromX) * t,
      y: fromY + (toY - fromY) * t,
      alpha: i === steps ? 1 : alpha,
    });
  }
  if (tipCluster) {
    pts.push({ x: toX, y: toY - 1, alpha: 0.9 });
    pts.push({ x: toX + 1, y: toY, alpha: 0.9 });
    pts.push({ x: toX - 1, y: toY, alpha: 0.9 });
  }
  return pts;
}

/** anchor — Single pixel at center or offset. Compass Anchor. */
function anchor(offset?: { x?: number; y?: number }, alpha: number = 1): NavShapePoint[] {
  return [{ x: offset?.x ?? 0, y: offset?.y ?? 0, alpha }];
}

/** radiate — Pixels at angles from origin. Signal Strength. */
function radiate(
  originX: number,
  originY: number,
  angles: number[],
  radius: number,
  alpha: number = 0.8
): NavShapePoint[] {
  const pts: NavShapePoint[] = [];
  for (const a of angles) {
    pts.push({
      x: originX + Math.cos(a) * radius,
      y: originY + Math.sin(a) * radius,
      alpha,
    });
  }
  return pts;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIFT — Machine trace: 1–2 pixels displaced by one grid unit from skeleton
// ═══════════════════════════════════════════════════════════════════════════

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pointKey(p: NavShapePoint): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

function centerOfMass(pts: NavShapePoint[]): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  return { x: sx / pts.length, y: sy / pts.length };
}

function applyDrift(skeletonAndSignal: NavShapePoint[], shapeKey: ParticleNavShapeKey): NavShapePoint[] {
  const keys = new Set(skeletonAndSignal.map(pointKey));
  const drift: NavShapePoint[] = [];
  const seed = hashKey(shapeKey);
  const alpha = DRIFT_ALPHA_MIN + (seed % 16) / 100; // 0.4–0.55

  const cm = centerOfMass(skeletonAndSignal);
  let nearest = skeletonAndSignal[0];
  let nearestD = Infinity;
  for (const p of skeletonAndSignal) {
    const d = (p.x - cm.x) ** 2 + (p.y - cm.y) ** 2;
    if (d < nearestD) {
      nearestD = d;
      nearest = p;
    }
  }
  const offsets: [number, number][] = [
    [DRIFT_OFFSET, 0],
    [-DRIFT_OFFSET, 0],
    [0, DRIFT_OFFSET],
    [0, -DRIFT_OFFSET],
  ];
  const dir = seed % 4;
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = offsets[(dir + i) % 4];
    const nx = Math.round(nearest.x + dx);
    const ny = Math.round(nearest.y + dy);
    const key = `${nx},${ny}`;
    if (!keys.has(key)) {
      drift.push({ x: nx, y: ny, alpha });
      keys.add(key);
      break;
    }
  }

  if (skeletonAndSignal.length >= 10) {
    let outermost = skeletonAndSignal[0];
    let maxD = 0;
    for (const p of skeletonAndSignal) {
      const d = p.x * p.x + p.y * p.y;
      if (d > maxD) {
        maxD = d;
        outermost = p;
      }
    }
    const dir2 = (seed >> 2) % 4;
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = offsets[(dir2 + i) % 4];
      const nx = Math.round(outermost.x + dx);
      const ny = Math.round(outermost.y + dy);
      const key = `${nx},${ny}`;
      if (!keys.has(key)) {
        drift.push({ x: nx, y: ny, alpha: alpha * 0.95 });
        break;
      }
    }
  }
  return drift;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICON COMPOSITION — Skeleton + Signal + Drift per taxonomy
// ═══════════════════════════════════════════════════════════════════════════

function merge(...layers: NavShapePoint[][]): NavShapePoint[] {
  return layers.flat();
}

function buildIcon(
  skeleton: NavShapePoint[],
  signal: NavShapePoint[],
  shapeKey: ParticleNavShapeKey
): NavShapePoint[] {
  const base = merge(skeleton, signal);
  const driftPts = applyDrift(base, shapeKey);
  return merge(base, driftPts);
}

/** Containers: frame + axis. */
function inboxPoints(): NavShapePoint[] {
  const skeleton = merge(
    frame(['tl', 'tr'], 4, 0.9),
    axis('v', -R, R, 2, 0.9).map((p) => ({ ...p, x: -R })),
    axis('v', -R, R, 2, 0.9).map((p) => ({ ...p, x: R })),
    [{ x: -R + 1, y: R, alpha: 0.8 }, { x: R - 1, y: R, alpha: 0.8 }]
  );
  const signal = anchor({ y: -R }, 1);
  return buildIcon(skeleton, signal, 'inbox');
}

/** Landmarks: vertices + anchor. */
function snoozedPoints(): NavShapePoint[] {
  const skeleton = merge(
    vertices(4, R, 0.9, Math.PI / 4),
    vertices(4, R * 0.6, 0.6, Math.PI / 4)
  );
  const signal = anchor(undefined, 1);
  return buildIcon(skeleton, signal, 'snoozed');
}

/** Trajectories: trajectory + axis. */
function donePoints(): NavShapePoint[] {
  const skeleton = merge(
    trajectory(-R + 1, 0, -1, R - 2, false, 0.9),
    trajectory(-1, R - 2, R, -R + 1, true, 1)
  );
  const signal = anchor({ x: R, y: -R + 1 }, 1);
  return buildIcon(skeleton, signal, 'done');
}

/** Containers: frame (document). */
function draftsPoints(): NavShapePoint[] {
  const skeleton = merge(
    frame(['tl', 'tr', 'bl', 'br'], R, 0.9),
    axis('v', -R + 1, R - 1, 1, 0.7).map((p) => ({ ...p, x: -R + 1 })),
    [{ x: -R + 1, y: 0, alpha: 0.7 }, { x: -R + 1, y: 1, alpha: 0.7 }, { x: -R + 1, y: 2, alpha: 0.7 }]
  );
  const signal = anchor({ y: -R }, 1);
  return buildIcon(skeleton, signal, 'drafts');
}

/** Trajectories: trajectory (arrow). */
function sentPoints(): NavShapePoint[] {
  const skeleton = merge(
    trajectory(-R, R - 1, R, -R, true, 0.9),
    [{ x: -R, y: R - 1, alpha: 0.8 }, { x: 0, y: 0, alpha: 1 }]
  );
  const signal = anchor({ x: R, y: -R }, 1);
  return buildIcon(skeleton, signal, 'sent');
}

/** Containers: frame + envelope V. */
function invitesPoints(): NavShapePoint[] {
  const skeleton = merge(
    [{ x: -R, y: -R + 1, alpha: 0.9 }, { x: R, y: -R + 1, alpha: 0.9 }],
    [{ x: -R, y: R, alpha: 0.9 }, { x: R, y: R, alpha: 0.9 }],
    radiate(0, -R + 1, [0, -Math.PI * 0.3, Math.PI * 0.3], R * 1.2, 0.8),
    [{ x: -R + 1, y: -R + 2, alpha: 0.7 }, { x: R - 1, y: -R + 2, alpha: 0.7 }]
  );
  const signal = anchor({ y: -R + 1 }, 1);
  return buildIcon(skeleton, signal, 'invites');
}

/** Signals: radiate + anchor. */
function promotionsPoints(): NavShapePoint[] {
  const angles = [0, -0.4 * Math.PI, -0.8 * Math.PI, 0.4 * Math.PI, 0.8 * Math.PI];
  const skeleton = radiate(-R + 1, 0, angles, 3, 0.8);
  const signal = merge(anchor({ x: -R + 1, y: 0 }, 1), [{ x: 0, y: -1, alpha: 0.7 }, { x: 0, y: 1, alpha: 0.7 }]);
  return buildIcon(skeleton, signal, 'promotions');
}

/** Systems: axis (parallel) + clusters. */
function socialPoints(): NavShapePoint[] {
  const left = merge(
    vertices(3, 1.5, 1, -Math.PI / 2).map((p) => ({ ...p, x: p.x - R + 1, y: p.y - 1 })),
    [{ x: -R + 2, y: -1, alpha: 0.8 }]
  );
  const right = merge(
    vertices(3, 1.5, 1, -Math.PI / 2).map((p) => ({ ...p, x: p.x + R - 1, y: p.y - 1 })),
    [{ x: R - 2, y: -1, alpha: 0.8 }]
  );
  const skeleton = merge(left, right);
  const signal = anchor({ y: -1 }, 0.9);
  return buildIcon(skeleton, signal, 'social');
}

/** Signals: radiate (bell outline). */
function updatesPoints(): NavShapePoint[] {
  const skeleton = merge(
    [{ x: -1, y: -R, alpha: 1 }, { x: 0, y: -R, alpha: 1 }, { x: 1, y: -R, alpha: 1 }],
    [{ x: -2, y: -R + 1, alpha: 0.9 }, { x: 2, y: -R + 1, alpha: 0.9 }],
    [{ x: -R + 1, y: 0, alpha: 0.9 }, { x: R - 1, y: 0, alpha: 0.9 }],
    [{ x: -1, y: R - 1, alpha: 0.9 }, { x: 0, y: R, alpha: 1 }, { x: 1, y: R - 1, alpha: 0.9 }]
  );
  const signal = anchor({ y: -R }, 1);
  return buildIcon(skeleton, signal, 'updates');
}

/** Landmarks: vertices (triangle) + anchor. */
function spamPoints(): NavShapePoint[] {
  const skeleton = merge(
    vertices(3, R, 0.95, -Math.PI / 2),
    vertices(3, R * 0.5, 0.75, -Math.PI / 2).map((_, i) => {
      const a1 = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const a2 = ((i + 1) / 3) * Math.PI * 2 - Math.PI / 2;
      return {
        x: (Math.cos(a1) * R + Math.cos(a2) * R) / 2,
        y: (Math.sin(a1) * R + Math.sin(a2) * R) / 2,
        alpha: 0.75,
      };
    })
  );
  const signal = anchor(undefined, 1);
  return buildIcon(skeleton, signal, 'spam');
}

/** Systems: axis (cross) + frame (corners). */
function settingsPoints(): NavShapePoint[] {
  const skeleton = merge(
    axis('h', -R, R, 1, 0.85).filter((p) => p.x !== 0),
    axis('v', -R, R, 1, 0.85).filter((p) => p.y !== 0),
    [{ x: -R, y: -R, alpha: 0.7 }, { x: R, y: -R, alpha: 0.7 }, { x: -R, y: R, alpha: 0.7 }, { x: R, y: R, alpha: 0.7 }]
  );
  const signal = anchor(undefined, 1);
  return buildIcon(skeleton, signal, 'settings');
}

/** Refresh/sync: two broken arcs with arrow tips. */
function syncPoints(): NavShapePoint[] {
  const r = R * 0.85;
  const upper: NavShapePoint[] = [];
  const lower: NavShapePoint[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 1.25 - (i / 6) * Math.PI * 0.9;
    upper.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, alpha: 0.9 });
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 0.25 - (i / 6) * Math.PI * 0.9;
    lower.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, alpha: 0.9 });
  }
  const tipU = upper[upper.length - 1];
  const tipL = lower[lower.length - 1];
  const arrowU: NavShapePoint[] = [
    { x: tipU.x - 1.5, y: tipU.y, alpha: 0.8 },
    { x: tipU.x, y: tipU.y + 1.5, alpha: 0.8 },
  ];
  const arrowL: NavShapePoint[] = [
    { x: tipL.x + 1.5, y: tipL.y, alpha: 0.8 },
    { x: tipL.x, y: tipL.y - 1.5, alpha: 0.8 },
  ];
  const skeleton = merge(upper, lower, arrowU, arrowL);
  const signal = anchor(undefined, 0.6);
  return buildIcon(skeleton, signal, 'sync');
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

const SHAPE_MAP: Record<ParticleNavShapeKey, () => NavShapePoint[]> = {
  inbox: inboxPoints,
  snoozed: snoozedPoints,
  done: donePoints,
  drafts: draftsPoints,
  sent: sentPoints,
  invites: invitesPoints,
  promotions: promotionsPoints,
  social: socialPoints,
  updates: updatesPoints,
  spam: spamPoints,
  settings: settingsPoints,
  sync: syncPoints,
};

export function getNavShape(key: ParticleNavShapeKey): NavShapePoint[] {
  const fn = SHAPE_MAP[key];
  if (!fn) return [];
  return fn();
}
