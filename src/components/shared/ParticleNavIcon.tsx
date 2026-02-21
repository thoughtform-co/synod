/**
 * ParticleNavIcon — grid-snapped SVG particle icons for sidebar navigation.
 * Matches Thoughtform particle aesthetic (GRID=3, squares only). Subtle breathing via CSS.
 */

import { useMemo } from 'react';
import { getNavShape, type ParticleNavShapeKey } from './particleNavShapes';

const GRID = 3;

const DAWN_RGB = '236, 227, 214';
const GOLD_RGB = '202, 165, 84';

interface PixelData {
  gx: number;
  gy: number;
  alpha: number;
  phase: number;
}

function snapToGrid(value: number, center: number): number {
  return Math.floor((value + center) / GRID) * GRID;
}

function deduplicatePixels(pixels: PixelData[]): PixelData[] {
  const map = new Map<string, PixelData>();
  for (const pixel of pixels) {
    const key = `${pixel.gx},${pixel.gy}`;
    const existing = map.get(key);
    if (!existing || pixel.alpha > existing.alpha) {
      map.set(key, pixel);
    }
  }
  return Array.from(map.values());
}

export interface ParticleNavIconProps {
  shape: ParticleNavShapeKey;
  /** RGB triplet string; default Dawn */
  color?: string;
  /** RGB triplet for active state; default Gold */
  activeColor?: string;
  active?: boolean;
  size?: number;
  className?: string;
}

export function ParticleNavIcon({
  shape,
  color = DAWN_RGB,
  activeColor = GOLD_RGB,
  active = false,
  size = 18,
  className = '',
}: ParticleNavIconProps) {
  const rgb = active ? activeColor : color;
  const pixels = useMemo(() => {
    const center = size / 2;
    const radius = size / 2 - 3;
    const points = getNavShape(shape);
    const rawPixels: PixelData[] = points.map((point) => {
      const gx = snapToGrid(point.x, center);
      const gy = snapToGrid(point.y, center);
      const alpha = point.alpha ?? 0.9;
      const phase = (gx + gy) / (GRID * 10);
      return { gx, gy, alpha, phase };
    });
    return deduplicatePixels(rawPixels);
  }, [shape, size]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`particle-nav-icon ${className}`.trim()}
      style={{
        imageRendering: 'pixelated',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
      aria-hidden="true"
    >
      {pixels.map((px, i) => (
        <rect
          key={`${px.gx}-${px.gy}-${i}`}
          x={px.gx}
          y={px.gy}
          width={GRID - 1}
          height={GRID - 1}
          fill={`rgba(${rgb}, ${px.alpha})`}
          className="particle-nav-icon__pixel"
          style={{ animationDelay: `${px.phase}s` }}
        />
      ))}
    </svg>
  );
}
