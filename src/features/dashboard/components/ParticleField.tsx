import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  phase: number;
  isGold: boolean;
}

interface ParticleFieldProps {
  /** Optional: more particles when more pending items (0–1 or count). */
  intensity?: number;
  className?: string;
}

export function ParticleField({ intensity = 0.5, className }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    let w = canvas.offsetWidth;
    let h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const count = Math.max(40, Math.min(120, Math.round(60 + intensity * 60)));
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        opacity: 0.1 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
        isGold: Math.random() < 0.1,
      });
    }

    let raf = 0;
    const tick = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, w, h);

      const t = Date.now() / 1000;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.8 + p.phase);
        const opacity = p.opacity * breathe;
        ctx.fillStyle = p.isGold
          ? `rgba(202, 165, 84, ${opacity * 0.6})`
          : `rgba(236, 227, 214, ${opacity * 0.15})`;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [intensity]);

  return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
