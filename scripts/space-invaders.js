import { triggerEndGameSequence, showLeaderboardModal } from './leaderboard.js?v=2';
import { playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, burst, floatLabel, screenHit } from './game-feedback.js';

(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreCounter = document.getElementById('score-counter');
  const waveCounter = document.getElementById('wave-counter');
  const livesCounter = document.getElementById('lives-counter');
  const startOverlay = document.getElementById('start-overlay');
  const pauseOverlay = document.getElementById('pause-overlay');
  const startButton = document.getElementById('start-game');
  const pauseButton = document.getElementById('btn-pause');
  const playerShipImage = new Image();
  let playerShipReady = false;
  playerShipImage.addEventListener('load', () => { playerShipReady = true; });
  playerShipImage.src = 'assets/space-invaders-ship.png';

  const SETTINGS = {
    easy:   { enemySpeed: 40, shotRate: .32, enemyShotSpeed: 235, lives: 3, aimChance: 0,   descent: 14, waveSpeed: 3 },
    normal: { enemySpeed: 59, shotRate: .51, enemyShotSpeed: 308, lives: 3, aimChance: .32, descent: 17, waveSpeed: 4 },
    hard:   { enemySpeed: 78, shotRate: .70, enemyShotSpeed: 380, lives: 3, aimChance: .65, descent: 20, waveSpeed: 5 },
  };

  let difficulty = 'normal';
  let dpr = 1, width = 0, height = 0;
  let worldScale = 1;
  let running = false, paused = false, ending = false;
  let score = 0, wave = 1, lives = 3;
  let lastTime = 0, enemyDirection = 1, enemyShotClock = 0;
  let player, invaders = [], playerShots = [], enemyShots = [], particles = [], stars = [], shields = [];
  const keys = { left: false, right: false, shoot: false };
  let shootCooldown = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const oldWidth = width || rect.width;
    const oldHeight = height || rect.height;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = Math.max(280, rect.width);
    height = Math.max(260, rect.height);
    worldScale = Math.max(.78, Math.min(1.5, Math.min(width / 1550, height / 760)));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (player) {
      player.x = (player.x / oldWidth) * width;
      player.y = height - Math.max(46, 54 * worldScale);
      player.w = 58 * worldScale;
      player.h = 32 * worldScale;
    }
    createStars();
  }

  function createStars() {
    const count = Math.max(28, Math.floor(width * height / 13000));
    stars = Array.from({ length: count }, (_, i) => ({
      x: (i * 73.7 % 100) / 100 * width,
      y: (i * 47.3 % 100) / 100 * height,
      r: i % 7 === 0 ? 1.6 : .8,
      a: .2 + (i % 5) * .12,
    }));
  }

  function resetPlayer() {
    player = {
      x: width / 2,
      y: height - Math.max(46, 54 * worldScale),
      w: 58 * worldScale,
      h: 32 * worldScale,
      invulnerable: 1.2,
    };
    playerShots = [];
    enemyShots = [];
  }

  function createInvaders() {
    invaders = [];
    const cols = width < 500 ? 7 : 9;
    const rows = width < 500 ? 4 : 5;
    const gapX = Math.min(120 * worldScale, (width - 70) / Math.max(1, cols - 1));
    const gapY = 50 * worldScale;
    const formationWidth = (cols - 1) * gapX;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        invaders.push({
          x: (width - formationWidth) / 2 + col * gapX,
          y: Math.max(48, 45 * worldScale) + row * gapY,
          w: 38 * worldScale,
          h: 26 * worldScale,
          row,
          col,
          alive: true,
          phase: (row + col) % 2,
        });
      }
    }
    enemyDirection = 1;
  }

  function createShields() {
    shields = [];
    const shieldCount = width < 480 ? 3 : 4;
    const blockSize = 14 * worldScale;
    const shieldY = height - Math.max(135, 180 * worldScale);
    for (let i = 0; i < shieldCount; i++) {
      const center = width * (i + 1) / (shieldCount + 1);
      const blocks = [];
      for (let y = 0; y < 3; y++) {
        for (let x = -3; x <= 3; x++) {
          if (y === 2 && Math.abs(x) <= 1) continue;
          blocks.push({ x: center + x * blockSize, y: shieldY + y * blockSize, size: blockSize, hp: 2 });
        }
      }
      shields.push(...blocks);
    }
  }

  function updateHud() {
    scoreCounter.innerHTML = `Score <strong>${score}</strong>`;
    waveCounter.innerHTML = `Vague <strong>${wave}</strong>`;
    livesCounter.textContent = Array.from({ length: SETTINGS[difficulty].lives }, (_, i) => i < lives ? '♥' : '♡').join(' ');
    livesCounter.setAttribute('aria-label', `${lives} vie${lives > 1 ? 's' : ''}`);
  }

  function startGame() {
    score = 0;
    wave = 1;
    lives = SETTINGS[difficulty].lives;
    ending = false;
    paused = false;
    resetPlayer();
    createInvaders();
    createShields();
    particles = [];
    updateHud();
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    running = true;
    lastTime = performance.now();
  }

  function showStart() {
    running = false;
    paused = false;
    startOverlay.classList.remove('hidden');
    pauseOverlay.classList.add('hidden');
  }

  function togglePause(force) {
    if (!running || ending || !startOverlay.classList.contains('hidden')) return;
    paused = typeof force === 'boolean' ? force : !paused;
    pauseOverlay.classList.toggle('hidden', !paused);
    pauseButton.textContent = paused ? '▶ Reprendre' : '⏸ Pause';
    if (!paused) lastTime = performance.now();
  }

  function shoot() {
    if (!running || paused || shootCooldown > 0) return;
    playerShots.push({ x: player.x, y: player.y - player.h * .55, vy: -510 * Math.max(1, worldScale * .88), r: 3 * worldScale });
    shootCooldown = .22;
    playPickupSound();
  }

  function spawnEnemyShot() {
    const alive = invaders.filter(i => i.alive);
    if (!alive.length) return;
    const frontByColumn = new Map();
    for (const invader of alive) {
      const current = frontByColumn.get(invader.col);
      if (!current || invader.y > current.y) frontByColumn.set(invader.col, invader);
    }
    const shooters = [...frontByColumn.values()];
    const settings = SETTINGS[difficulty];
    const shooter = Math.random() < settings.aimChance
      ? shooters.reduce((closest, candidate) =>
          Math.abs(candidate.x - player.x) < Math.abs(closest.x - player.x) ? candidate : closest
        )
      : shooters[Math.floor(Math.random() * shooters.length)];
    enemyShots.push({
      x: shooter.x,
      y: shooter.y + shooter.h * .6,
      vy: (settings.enemyShotSpeed + wave * 5) * Math.max(1, worldScale * .82),
      r: 3.5 * worldScale,
    });
  }

  function hitRectCircle(rect, shot) {
    return shot.x > rect.x - rect.w / 2 && shot.x < rect.x + rect.w / 2 &&
      shot.y > rect.y - rect.h / 2 && shot.y < rect.y + rect.h / 2;
  }

  function makeExplosion(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count + Math.random() * .3;
      const speed = 35 + Math.random() * 75;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .55, max: .55, color });
    }
  }

  function damagePlayer() {
    if (player.invulnerable > 0) return;
    lives--;
    player.invulnerable = 1.7;
    enemyShots = [];
    makeExplosion(player.x, player.y, '#ff7b66', 14);
    playDamageSound();
    screenHit();
    bump(livesCounter);
    updateHud();
    if (lives <= 0) endGame();
  }

  function blastShieldBlock(hitBlock) {
    const blastRadius = hitBlock.size * 1.08;
    for (const block of shields) {
      if (block.hp <= 0) continue;
      if (Math.hypot(block.x - hitBlock.x, block.y - hitBlock.y) <= blastRadius) {
        block.hp--;
      }
    }
    makeExplosion(hitBlock.x, hitBlock.y, '#8bcf84', 7);
  }

  function endGame() {
    if (ending) return;
    ending = true;
    running = false;
    triggerEndGameSequence({
      gameId: 'space-invaders',
      gameTitle: 'Space Invaders 🚀',
      currentScore: score,
      scoreFormatted: `${score} pts · vague ${wave}`,
      isLowerBetter: false,
      onClose: showStart,
    });
  }

  function nextWave() {
    wave++;
    score += 500;
    playWordSuccessSound();
    bump(waveCounter);
    floatLabel(`Vague ${wave} !`, width / 2, Math.max(100, height * .3));
    updateHud();
    createInvaders();
    createShields();
    enemyShots = [];
    playerShots = [];
    player.invulnerable = 1.2;
  }

  function update(dt) {
    shootCooldown = Math.max(0, shootCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    const playerSpeed = Math.max(300, width * .22);
    if (keys.left) player.x -= playerSpeed * dt;
    if (keys.right) player.x += playerSpeed * dt;
    player.x = Math.max(player.w * .55, Math.min(width - player.w * .55, player.x));
    if (keys.shoot) shoot();

    const aliveCount = invaders.reduce((sum, i) => sum + (i.alive ? 1 : 0), 0);
    const totalCount = invaders.length || 1;
    const settings = SETTINGS[difficulty];
    const speed = (settings.enemySpeed + wave * settings.waveSpeed) * (1 + (1 - aliveCount / totalCount) * 1.7);
    let edgeHit = false;
    for (const invader of invaders) {
      if (!invader.alive) continue;
      invader.x += enemyDirection * speed * dt;
      if (invader.x < invader.w * .65 || invader.x > width - invader.w * .65) edgeHit = true;
    }
    if (edgeHit) {
      enemyDirection *= -1;
      for (const invader of invaders) {
        invader.x = Math.max(invader.w * .65, Math.min(width - invader.w * .65, invader.x));
        invader.y += settings.descent * worldScale;
        if (invader.alive && invader.y > player.y - player.h * 1.3) { endGame(); return; }
      }
    }

    enemyShotClock -= dt;
    if (enemyShotClock <= 0) {
      spawnEnemyShot();
      enemyShotClock = Math.max(.35, 1.25 - SETTINGS[difficulty].shotRate - wave * .035) * (.75 + Math.random() * .5);
    }

    for (const shot of playerShots) shot.y += shot.vy * dt;
    for (const shot of enemyShots) shot.y += shot.vy * dt;

    for (const shot of playerShots) {
      if (shot.dead) continue;
      for (const invader of invaders) {
        if (!invader.alive || !hitRectCircle(invader, shot)) continue;
        invader.alive = false;
        shot.dead = true;
        const points = (5 - Math.min(4, invader.row)) * 10;
        score += points;
        makeExplosion(invader.x, invader.y, invader.row < 2 ? '#ffd77a' : '#9cd397', 8);
        bump(scoreCounter);
        updateHud();
        break;
      }
    }

    for (const shot of enemyShots) {
      if (!shot.dead && hitRectCircle(player, shot)) { shot.dead = true; damagePlayer(); }
    }

    for (const shot of [...playerShots, ...enemyShots]) {
      if (shot.dead) continue;
      for (const block of shields) {
        if (block.hp <= 0) continue;
        if (Math.abs(shot.x - block.x) < block.size * .58 && Math.abs(shot.y - block.y) < block.size * .62) {
          blastShieldBlock(block);
          shot.dead = true;
          break;
        }
      }
    }

    playerShots = playerShots.filter(s => !s.dead && s.y > -10);
    enemyShots = enemyShots.filter(s => !s.dead && s.y < height + 10);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 45 * dt; p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    if (invaders.length && invaders.every(i => !i.alive)) nextWave();
  }

  function drawBackground(time) {
    ctx.fillStyle = '#0d1f20';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(47, 105, 88, .18)';
    ctx.beginPath();
    ctx.arc(width * .16, height * .25, Math.min(width, height) * .23, 0, Math.PI * 2);
    ctx.fill();
    for (const star of stars) {
      ctx.globalAlpha = star.a + Math.sin(time * .0015 + star.x) * .12;
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(156, 211, 151, .28)';
    ctx.beginPath(); ctx.moveTo(16, height - 24); ctx.lineTo(width - 16, height - 24); ctx.stroke();
  }

  function drawInvader(invader, time) {
    if (!invader.alive) return;
    const scale = invader.w / 26;
    const bob = Math.sin(time * .006 + invader.phase * Math.PI) * 1.5 * worldScale;
    const color = invader.row < 2 ? '#ffd77a' : invader.row < 4 ? '#9cd397' : '#f49a8a';
    ctx.save(); ctx.translate(invader.x, invader.y + bob);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-13 * scale, -8 * scale, 26 * scale, 15 * scale, 5 * scale); ctx.fill();
    ctx.fillRect(-9 * scale, 6 * scale, 5 * scale, 6 * scale); ctx.fillRect(4 * scale, 6 * scale, 5 * scale, 6 * scale);
    ctx.fillRect(-17 * scale, -2 * scale, 5 * scale, 8 * scale); ctx.fillRect(12 * scale, -2 * scale, 5 * scale, 8 * scale);
    ctx.fillStyle = '#0d1f20';
    ctx.fillRect(-7 * scale, -3 * scale, 4 * scale, 4 * scale); ctx.fillRect(3 * scale, -3 * scale, 4 * scale, 4 * scale);
    ctx.restore();
  }

  function drawPlayer() {
    if (!player || (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0)) return;
    ctx.save(); ctx.translate(player.x, player.y);
    if (playerShipReady) {
      const enginePulse = .7 + Math.sin(performance.now() * .012) * .18;
      ctx.globalAlpha = enginePulse;
      ctx.fillStyle = '#ffd77a';
      ctx.beginPath(); ctx.ellipse(0, 23 * worldScale, 9 * worldScale, 5 * worldScale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(playerShipImage, -35 * worldScale, -25 * worldScale, 70 * worldScale, 50 * worldScale);
      ctx.restore();
      return;
    }
    ctx.scale(worldScale, worldScale);
    ctx.fillStyle = '#e8f6e4'; ctx.beginPath(); ctx.roundRect(-24, -7, 48, 19, 5); ctx.fill();
    ctx.fillStyle = '#65ad68'; ctx.beginPath(); ctx.moveTo(-15, -7); ctx.lineTo(0, -25); ctx.lineTo(15, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd77a'; ctx.fillRect(-7, 12, 14, 7);
    ctx.restore();
  }

  function draw(time) {
    drawBackground(time);
    for (const block of shields) {
      if (block.hp <= 0) continue;
      ctx.globalAlpha = block.hp === 1 ? .52 : 1;
      ctx.fillStyle = '#74bd75';
      ctx.fillRect(block.x - block.size / 2, block.y - block.size / 2, block.size, block.size);
    }
    ctx.globalAlpha = 1;
    invaders.forEach(i => drawInvader(i, time));
    ctx.fillStyle = '#ffd77a';
    for (const shot of playerShots) {
      ctx.beginPath();
      ctx.roundRect(shot.x - shot.r * .65, shot.y - shot.r * 2.4, shot.r * 1.3, shot.r * 4, shot.r * .6);
      ctx.fill();
    }
    ctx.fillStyle = '#f47d71';
    for (const shot of enemyShots) { ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2); ctx.fill(); }
    for (const p of particles) {
      ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    drawPlayer();
  }

  function loop(time) {
    const dt = Math.min(.033, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    if (running && !paused) update(dt);
    draw(time);
    requestAnimationFrame(loop);
  }

  function isUiOpen() {
    return !startOverlay.classList.contains('hidden') || document.querySelector('.leaderboard-overlay');
  }

  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', ' ', 'q', 'Q', 'd', 'D'].includes(e.key) && !isUiOpen()) e.preventDefault();
    if (['ArrowLeft', 'q', 'Q'].includes(e.key)) keys.left = true;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = true;
    if (e.key === ' ') keys.shoot = true;
    if (['p', 'P', 'Escape'].includes(e.key) && !isUiOpen()) togglePause();
  });
  window.addEventListener('keyup', e => {
    if (['ArrowLeft', 'q', 'Q'].includes(e.key)) keys.left = false;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) keys.right = false;
    if (e.key === ' ') keys.shoot = false;
  });
  window.addEventListener('blur', () => { if (running && !paused) togglePause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) togglePause(true); });
  window.addEventListener('resize', resize);

  function bindHold(id, key) {
    const button = document.getElementById(id);
    const press = e => { e.preventDefault(); keys[key] = true; if (key === 'shoot') shoot(); };
    const release = e => { e.preventDefault(); keys[key] = false; };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  }
  bindHold('move-left', 'left'); bindHold('move-right', 'right'); bindHold('shoot', 'shoot');

  document.querySelectorAll('[data-difficulty]').forEach(button => {
    button.addEventListener('click', () => {
      difficulty = button.dataset.difficulty;
      document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.toggle('selected', b === button));
    });
  });
  startButton.addEventListener('click', startGame);
  pauseButton.addEventListener('click', () => togglePause());

  document.getElementById('menu-leaderboard')?.addEventListener('click', () => {
    showLeaderboardModal({
      gameId: 'space-invaders',
      gameTitle: 'Space Invaders 🚀',
      currentScore: 0,
      scoreFormatted: 'Avant la partie',
      isLowerBetter: false,
    });
  });

  resize();
  resetPlayer();
  createInvaders();
  createShields();
  updateHud();
  requestAnimationFrame(loop);
})();
