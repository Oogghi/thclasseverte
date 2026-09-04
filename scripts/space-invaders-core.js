// scripts/space-invaders-core.js
// Shared engine for Space Invaders and Space Invaders Mots.

/**
 * Creates a starry background with subtle twinkles.
 */
export function createStarfield(width, height) {
  const count = Math.max(30, Math.floor((width * height) / 12000));
  return Array.from({ length: count }, (_, i) => ({
    x: ((i * 73.7) % 100) / 100 * width,
    y: ((i * 47.3) % 100) / 100 * height,
    r: i % 7 === 0 ? 1.6 : 0.9,
    baseA: 0.2 + (i % 5) * 0.12,
    speed: 0.8 + (i % 3) * 0.4,
  }));
}

export function drawStarfield(ctx, stars, width, height, time = performance.now()) {
  ctx.fillStyle = '#0d1f20';
  ctx.fillRect(0, 0, width, height);

  stars.forEach((s, idx) => {
    const twinkle = Math.sin((time * 0.002 * s.speed) + idx);
    const alpha = Math.max(0.1, Math.min(0.85, s.baseA + twinkle * 0.15));
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Creates destructible bunker shields.
 */
export function createShields(width, height, worldScale = 1) {
  const shields = [];
  const count = width < 480 ? 3 : 4;
  const shieldW = Math.max(48, Math.min(84, 68 * worldScale));
  const shieldH = Math.max(30, Math.min(54, 44 * worldScale));
  const totalW = count * shieldW;
  const gap = (width - totalW) / (count + 1);
  const bunkerY = height - Math.max(90, 115 * worldScale);

  for (let i = 0; i < count; i++) {
    const x = gap + i * (shieldW + gap);
    const y = bunkerY;
    const blocks = [];
    const cols = 8;
    const rows = 6;
    const bw = shieldW / cols;
    const bh = shieldH / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Archway notch at bottom center of bunker
        if (r >= 4 && (c === 3 || c === 4)) continue;
        // Rounded top corners
        if (r === 0 && (c === 0 || c === cols - 1)) continue;

        blocks.push({
          x: x + c * bw,
          y: y + r * bh,
          w: bw + 0.5,
          h: bh + 0.5,
          hp: 2,
        });
      }
    }

    shields.push({ x, y, w: shieldW, h: shieldH, blocks });
  }

  return shields;
}

export function drawShields(ctx, shields) {
  ctx.save();
  shields.forEach(shield => {
    shield.blocks.forEach(b => {
      if (b.hp <= 0) return;
      ctx.fillStyle = b.hp === 2 ? '#2e9d3a' : '#8cd997';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    });
  });
  ctx.restore();
}

/**
 * Draws the player ship (image or crisp procedural SVG/canvas fallback).
 */
export function drawPlayerShip(ctx, player, shipImg, isReady) {
  if (!player) return;
  const { x, y, w, h } = player;

  if (isReady && shipImg && shipImg.complete) {
    ctx.drawImage(shipImg, x - w / 2, y - h / 2, w, h);
  } else {
    // Neo-brutalist procedural ship
    ctx.save();
    ctx.translate(x, y);

    // Drop shadow
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 + 2);
    ctx.lineTo(w / 2 + 2, h / 2 + 2);
    ctx.lineTo(-w / 2 + 2, h / 2 + 2);
    ctx.closePath();
    ctx.fill();

    // Ship hull
    ctx.fillStyle = '#ffd77a';
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cockpit
    ctx.fillStyle = '#2e9d3a';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Procedural particle manager for explosive feedback.
 */
export function createParticleManager() {
  let particles = [];

  function addExplosion(x, y, color = '#ffd77a', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 40 + Math.random() * 90;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        size: 3 + Math.random() * 3,
        color,
      });
    }
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function draw(ctx) {
    particles.forEach(p => {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  function clear() {
    particles = [];
  }

  return { addExplosion, update, draw, clear };
}

/**
 * Mobile touch controls binder.
 */
export function bindMobileControls({ onLeft, onRight, onShoot }) {
  const leftBtn  = document.getElementById('move-left');
  const rightBtn = document.getElementById('move-right');
  const shootBtn = document.getElementById('shoot');

  const setupBtn = (el, callback) => {
    if (!el) return;
    const activate = (e) => { e.preventDefault(); callback(true); };
    const deactivate = (e) => { e.preventDefault(); callback(false); };
    el.addEventListener('touchstart', activate, { passive: false });
    el.addEventListener('touchend', deactivate, { passive: false });
    el.addEventListener('mousedown', activate);
    el.addEventListener('mouseup', deactivate);
    el.addEventListener('mouseleave', deactivate);
  };

  setupBtn(leftBtn, onLeft);
  setupBtn(rightBtn, onRight);
  setupBtn(shootBtn, onShoot);
}

export default {
  createStarfield,
  drawStarfield,
  createShields,
  drawShields,
  drawPlayerShip,
  createParticleManager,
  bindMobileControls,
};
