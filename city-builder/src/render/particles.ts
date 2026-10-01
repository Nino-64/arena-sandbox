export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  color: string;
  alpha: number;
}

const MAX_PARTICLES = 1400;

/** Lightweight world-space particle system (smoke, dust, sparkles). */
export class Particles {
  items: Particle[] = [];

  emit(p: Omit<Particle, "life"> & { life?: number }): void {
    if (this.items.length >= MAX_PARTICLES) this.items.shift();
    this.items.push({ ...p, life: p.life ?? p.maxLife });
  }

  burst(x: number, y: number, count: number, colors: string[], speed: number, size: number, life: number): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.5 - speed * 0.6,
        maxLife: life * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
        grow: 0,
        color: colors[k % colors.length]!,
        alpha: 1,
      });
    }
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.items) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 4 * dt;
      p.vx *= 1 - 0.6 * dt;
      p.size += p.grow * dt;
      out.push(p);
    }
    this.items = out;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = p.alpha * Math.min(1, t * 1.6);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
