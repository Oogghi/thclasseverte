// scripts/snake.js
// Classic Snake arcade game for TH Classe Verte.
import { triggerEndGameSequence } from './leaderboard.js';
import { playPickupSound, playDamageSound } from './sound.js';
import { bump, burst, floatLabel, screenHit } from './game-feedback.js';
import { Dir, isOpposite, createSnakeGrid, setupSnakeControls, drawSnake } from './snake-core.js';
import { setupPauseManager, isTypingInInput } from './game-ui.js';

(() => {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game') || (() => {
    const el = document.createElement('canvas');
    el.id = 'game';
    document.body.appendChild(el);
    return el;
  })();

  const appleCounter = document.querySelector('#apple-counter');
  const pauseButton  = document.querySelector('#btn-pause');

  // --- Grid & Canvas Metrics ---
  const grid = createSnakeGrid(canvas, { topUI: 80, bottomUI: 70 });
  const ctx = grid.getContext();
  let { cols, rows, tile, offsetX, offsetY, width, height } = grid.resize();

  function onResize() {
    const m = grid.resize();
    cols = m.cols; rows = m.rows; tile = m.tile;
    offsetX = m.offsetX; offsetY = m.offsetY;
    width = m.width; height = m.height;
    draw();
  }
  window.addEventListener('resize', onResize);

  // --- State ---
  let snake;
  let prevCells = null;
  let apple = null;
  let appleSpawnTime = 0;
  let pickupPulse = null;
  let queuedDir = null;
  let interpolation = 0;
  let lastMoveTime = 0;
  let moveInterval = 1 / 5.5;
  let gameRunning = false;
  let score = 0;
  let highscore = parseInt(localStorage.getItem('snake_highscore') || '0', 10);

  // --- Pause Manager ---
  const pauseManager = setupPauseManager({
    onPause: () => {},
    onResume: () => { lastMoveTime = performance.now() / 1000; },
    isGameRunning: () => gameRunning,
    pauseButton,
  });

  // --- Controls ---
  setupSnakeControls({
    onDirection: (d) => {
      if (!snake || pauseManager.isPaused()) return;
      if (!snake.dir) { snake.dir = d; return; }
      if (!isOpposite(snake.dir, d)) queuedDir = d;
    },
    onAction: (key) => {
      if (!gameRunning && ['Escape', ' '].includes(key)) {
        startNewGame();
      }
    },
    isInputActive: isTypingInInput,
  });

  // --- Game Logic ---
  function spawnSnake() {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const initLen = 5;
    const cells = Array.from({ length: initLen }, (_, i) => ({ x: cx - i, y: cy }));
    snake = { cells, dir: Dir.RIGHT, lengthTiles: initLen };
    prevCells = cells.map(c => ({ ...c }));
    queuedDir = null;
  }

  function spawnApple() {
    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    let x, y, tries = 0;
    do {
      x = Math.floor(Math.random() * (cols - 2)) + 1;
      y = Math.floor(Math.random() * (rows - 2)) + 1;
    } while (occupied.has(`${x},${y}`) && ++tries < 1000);
    apple = { x, y };
    appleSpawnTime = performance.now();
  }

  function gridToPixel(cell) {
    return {
      px: offsetX + (cell.x + 0.5) * tile,
      py: offsetY + (cell.y + 0.5) * tile,
    };
  }

  function stepSnake() {
    if (queuedDir) {
      if (!isOpposite(snake.dir, queuedDir)) snake.dir = queuedDir;
      queuedDir = null;
    }

    const head = snake.cells[0];
    const nh = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };

    prevCells = snake.cells.map(c => ({ ...c }));
    interpolation = 0;

    // Wall collision
    if (nh.x < 0 || nh.x >= cols || nh.y < 0 || nh.y >= rows) return handleDeath();

    // Self collision
    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    if (occupied.has(`${nh.x},${nh.y}`)) return handleDeath();

    snake.cells.unshift(nh);

    // Apple collision
    if (apple && nh.x === apple.x && nh.y === apple.y) {
      const eatenAt = gridToPixel(apple);
      score++;
      snake.lengthTiles++;
      pickupPulse = { ...eatenAt, startedAt: performance.now() };
      playPickupSound();
      if (appleCounter) bump(appleCounter);
      burst(eatenAt.px, eatenAt.py, { color: '#e4574f', count: 7, distance: Math.min(38, tile) });
      floatLabel('+1', eatenAt.px, eatenAt.py - tile * 0.35);
      spawnApple();
    }

    while (snake.cells.length > snake.lengthTiles) {
      snake.cells.pop();
    }
    return true;
  }

  function handleDeath() {
    gameRunning = false;
    playDamageSound();
    screenHit();
    if (score > highscore) {
      highscore = score;
      try { localStorage.setItem('snake_highscore', String(highscore)); } catch (_) {}
    }

    const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = String(elapsedSec % 60).padStart(2, '0');
    const timeFormatted = `${m}m${s}s`;

    triggerEndGameSequence({
      gameId: 'snake',
      gameTitle: 'Snake 🍎',
      currentScore: score,
      scoreFormatted: `${score} pommes • ${timeFormatted}`,
      isLowerBetter: false,
      extraMetrics: {
        apples: score,
        timeElapsed: elapsedSec,
      },
      onClose: () => {
        startNewGame();
      }
    });

    return false;
  }

  let gameStartTime = 0;

  function startNewGame() {
    onResize();
    spawnSnake();
    spawnApple();
    moveInterval  = 1 / 5.5;
    lastMoveTime  = performance.now() / 1000;
    gameStartTime = performance.now();
    interpolation = 0;
    score         = 0;
    gameRunning   = true;
    pauseManager.setPaused(false);
  }

  function update(timeMs) {
    if (appleCounter) appleCounter.textContent = `Pommes récoltées : ${score} 🍎`;

    if (!gameRunning || pauseManager.isPaused()) {
      draw();
      requestAnimationFrame(update);
      return;
    }

    const t = timeMs / 1000;
    interpolation = (t - lastMoveTime) / moveInterval;

    if (interpolation >= 1) {
      const steps = Math.floor(interpolation);
      for (let i = 0; i < steps; i++) {
        lastMoveTime += moveInterval;
        if (!stepSnake()) break;
      }
      interpolation = (t - lastMoveTime) / moveInterval;
    }

    draw();
    requestAnimationFrame(update);
  }

  // --- Rendering ---
  function drawGridBackground() {
    const rootStyle = getComputedStyle(document.documentElement);
    const BG_COLOR = rootStyle.getPropertyValue('--bg').trim() || '#fbffd8';

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    const gridW = cols * tile;
    const gridH = rows * tile;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(4, 4, gridW, gridH);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gridW, gridH);

    ctx.fillStyle = 'rgba(235, 248, 220, 0.45)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c + r) % 2 === 0) {
          ctx.fillRect(c * tile, r * tile, tile, tile);
        }
      }
    }

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 32, 0, 0.08)';
    ctx.lineWidth   = 1;
    for (let c = 0; c <= cols; c++) { ctx.moveTo(c * tile, 0); ctx.lineTo(c * tile, gridH); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * tile); ctx.lineTo(gridW, r * tile); }
    ctx.stroke();

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = 2.5;
    ctx.strokeRect(0, 0, gridW, gridH);

    ctx.restore();
  }

  function drawApple() {
    if (!apple) return;
    const { px, py } = gridToPixel(apple);
    const age = Math.min(1, (performance.now() - appleSpawnTime) / 220);
    const pop = 1 + Math.sin(age * Math.PI) * 0.16;
    const r = tile * 0.38 * pop;

    const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.4, r * 0.1, px, py, r);
    g.addColorStop(0, '#ff6b6b');
    g.addColorStop(1, '#d94a4a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(px - r * 0.25, py - r * 0.35, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(px + r * 0.25, py - r * 0.75);
    ctx.rotate(-0.4);
    ctx.fillStyle = '#2d7a2d';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.25, r * 0.12, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPickupPulse() {
    if (!pickupPulse) return;
    const age = (performance.now() - pickupPulse.startedAt) / 320;
    if (age >= 1) { pickupPulse = null; return; }
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = '#e4574f';
    ctx.lineWidth = Math.max(2, tile * 0.08 * (1 - age));
    ctx.beginPath();
    ctx.arc(pickupPulse.px, pickupPulse.py, tile * (0.28 + age * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    drawGridBackground();
    drawApple();
    drawPickupPulse();
    drawSnake(ctx, snake, prevCells, interpolation, { tile, offsetX, offsetY });
  }

  // --- Startup ---
  startNewGame();
  requestAnimationFrame(update);
})();
