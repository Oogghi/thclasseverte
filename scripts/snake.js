import { showLeaderboardModal } from './leaderboard.js';

(() => {
  'use strict';

  // --- DOM ---
  const canvas = document.querySelector('#game') || (() => {
    const el = document.createElement('canvas');
    el.id = 'game';
    document.body.appendChild(el);
    return el;
  })();
  const ctx = canvas.getContext('2d', { alpha: false });

  const gameOverPopup  = document.querySelector('#game-over-popup');
  const finalScoreEl   = document.querySelector('#final-score');
  const appleCounter   = document.querySelector('#apple-counter');
  const popupRestartBtn = document.querySelector('#popup-restart');

  document.getElementById('btn-show-leaderboard')?.addEventListener('click', () => {
    showLeaderboardModal({
      gameId: 'snake',
      gameTitle: 'Snake 🍎',
      currentScore: score,
      scoreFormatted: `${score} pommes`,
      isLowerBetter: false,
    });
  });

  // --- CSS variables ---
  const rootStyle  = getComputedStyle(document.documentElement);
  const BG_COLOR   = rootStyle.getPropertyValue('--bg').trim()        || '#fbffd8';
  const GRID_COLOR = rootStyle.getPropertyValue('--grid-line').trim() || 'rgba(0,32,0,0.12)';

  // --- Grid sizing ---
  let DPR = Math.max(1, window.devicePixelRatio || 1);
  let width = 0, height = 0;
  let cols = 0, rows = 0;
  let tile = 30;
  const MIN_TILE = 16, MAX_TILE = 96;
  let offsetX = 0, offsetY = 0;

  function resizeCanvas() {
    DPR    = Math.max(1, window.devicePixelRatio || 1);
    width  = window.innerWidth;
    height = window.innerHeight;

    const marginX = 24;
    const marginY = 32;
    const availW = Math.max(200, width - marginX * 2);
    const availH = Math.max(200, height - marginY * 2);

    const divisor = Math.min(availW, availH) < 600 ? 16 : 18;
    tile = Math.min(MAX_TILE, Math.max(MIN_TILE, Math.floor(Math.min(availW, availH) / divisor)));

    cols = Math.max(8, Math.floor(availW / tile));
    rows = Math.max(6, Math.floor(availH / tile));
    tile = Math.floor(Math.min(availW / cols, availH / rows));

    offsetX = Math.floor((width  - cols * tile) / 2);
    offsetY = Math.floor((height - rows * tile) / 2 + 10);

    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';
    canvas.width  = Math.floor(width  * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  window.addEventListener('resize', () => { resizeCanvas(); draw(); });

  // --- Directions ---
  const Dir = {
    UP:    { x:  0, y: -1 },
    DOWN:  { x:  0, y:  1 },
    LEFT:  { x: -1, y:  0 },
    RIGHT: { x:  1, y:  0 },
  };
  const isOpposite = (a, b) => a.x + b.x === 0 && a.y + b.y === 0;

  // --- State ---
  let snake;
  let prevCells = null; // snapshot of all segment positions before each step (enables smooth tail)
  let apple;
  let queuedDir    = null;
  let interpolation = 0;
  let lastMoveTime  = 0;
  let moveInterval  = 1 / 5.5;
  let gameRunning   = false;
  let gamePaused    = false;
  let score         = 0;
  let highscore     = parseInt(localStorage.getItem('snake_highscore') || '0', 10);

  function isTypingInInput() {
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
    if (document.querySelector('.leaderboard-overlay:not(.hidden)')) return true;
    return false;
  }

  // --- Input: keyboard ---
  window.addEventListener('keydown', (e) => {
    if (isTypingInInput()) return;
    if (!gameRunning && ['Escape', ' '].includes(e.key)) { startNewGame(); return; }
    if (['ArrowUp',    'z', 'Z'].includes(e.key)) trySetDir(Dir.UP);
    if (['ArrowDown',  's', 'S'].includes(e.key)) trySetDir(Dir.DOWN);
    if (['ArrowLeft',  'q', 'Q'].includes(e.key)) trySetDir(Dir.LEFT);
    if (['ArrowRight', 'd', 'D'].includes(e.key)) trySetDir(Dir.RIGHT);
  });

  function trySetDir(d) {
    if (!snake) return;
    if (!snake.dir)              { snake.dir = d; return; }
    if (!isOpposite(snake.dir, d)) queuedDir = d;
  }

  // --- Input: touch ---
  let touchStart = null;
  window.addEventListener('touchstart', (e) => {
    if (!e.touches.length) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) trySetDir(dx > 0 ? Dir.RIGHT : Dir.LEFT);
    else                              trySetDir(dy > 0 ? Dir.DOWN  : Dir.UP);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameRunning && !gamePaused) setPaused(true);
  });

  // --- Game logic ---
  function spawnSnake() {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const initLen = 5;
    const cells = Array.from({ length: initLen }, (_, i) => ({ x: cx - i, y: cy }));
    snake = { cells, dir: Dir.RIGHT, lengthTiles: initLen };
    prevCells = cells.map(c => ({ ...c })); // same positions → no movement on first draw
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

    // Snapshot ALL positions before modifying — this is what makes the tail smooth.
    prevCells     = snake.cells.map(c => ({ ...c }));
    interpolation = 0;

    if (nh.x < 0 || nh.x >= cols || nh.y < 0 || nh.y >= rows) return handleDeath();

    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    if (occupied.has(`${nh.x},${nh.y}`)) return handleDeath();

    snake.cells.unshift(nh);

    if (nh.x === apple.x && nh.y === apple.y) {
      score++;
      snake.lengthTiles++;
      spawnApple();
    }

    while (snake.cells.length > snake.lengthTiles) snake.cells.pop();
    return true;
  }

  function handleDeath() {
    gameRunning = false;
    gamePaused  = false;
    if (score > highscore) {
      highscore = score;
      try { localStorage.setItem('snake_highscore', String(highscore)); } catch (_) {}
    }
    if (finalScoreEl)  finalScoreEl.textContent = `🎉 Bravo ! Pommes récoltées : ${score} 🍎`;
    if (gameOverPopup) gameOverPopup.classList.remove('hidden');

    setTimeout(() => {
      showLeaderboardModal({
        gameId: 'snake',
        gameTitle: 'Snake 🍎',
        currentScore: score,
        scoreFormatted: `${score} pommes`,
        isLowerBetter: false,
      });
    }, 400);

    return false;
  }

  function setPaused(p) { gamePaused = p; }

  // --- Game loop ---
  function startNewGame() {
    resizeCanvas();
    spawnSnake();
    spawnApple();
    moveInterval  = 1 / 5.5;
    lastMoveTime  = performance.now() / 1000;
    interpolation = 0;
    score         = 0;
    gameRunning   = true;
    gamePaused    = false;
    if (gameOverPopup) gameOverPopup.classList.add('hidden');
  }

  function update(timeMs) {
    if (appleCounter) appleCounter.textContent = `Nombre de pommes obtenues : ${score}`;

    if (!gameRunning || gamePaused) { draw(); requestAnimationFrame(update); return; }

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
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    const gridW = cols * tile;
    const gridH = rows * tile;

    // Solid board drop shadow
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(4, 4, gridW, gridH);

    // Clean board field
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gridW, gridH);

    // Soft alternating pattern inside the grid
    ctx.fillStyle = 'rgba(235, 248, 220, 0.45)';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c + r) % 2 === 0) {
          ctx.fillRect(c * tile, r * tile, tile, tile);
        }
      }
    }

    // Grid lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 32, 0, 0.08)';
    ctx.lineWidth   = 1;
    for (let c = 0; c <= cols; c++) { ctx.moveTo(c * tile, 0); ctx.lineTo(c * tile, gridH); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * tile); ctx.lineTo(gridW, r * tile); }
    ctx.stroke();

    // Crisp outer border around the grid board
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = 2.5;
    ctx.strokeRect(0, 0, gridW, gridH);

    ctx.restore();
  }

  function drawApple() {
    const { px, py } = gridToPixel(apple);
    const r = tile * 0.38;

    const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.4, r * 0.1, px, py, r);
    g.addColorStop(0, '#ff6b6b');
    g.addColorStop(1, '#d94a4a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
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

  function drawSnakeInterpolated() {
    if (!snake || snake.cells.length === 0) return;
    const t     = Math.max(0, Math.min(1, interpolation));
    const cells = snake.cells;

    // --- Head tip: slides from prevCells[0] (old head pos) to cells[0] (new head pos).
    // prevCells[0] == cells[0] on init so there is no jump before the first step.
    // This motion is always axis-aligned (the snake only moves along grid axes).
    const headTo   = gridToPixel(cells[0]);
    const headFrom = (prevCells && prevCells.length > 0) ? gridToPixel(prevCells[0]) : headTo;
    const headPt   = {
      px: headFrom.px + (headTo.px - headFrom.px) * t,
      py: headFrom.py + (headTo.py - headFrom.py) * t,
    };

    // --- Tail trailing edge.
    const tailCell   = cells[cells.length - 1];
    const tailCellPx = gridToPixel(tailCell);
    const isGrowing  = prevCells && prevCells.length < cells.length;

    let tailPt;
    if (isGrowing && cells.length >= 2) {
      // Growth step: the new tail cell "sprouts" outward at mid-animation then settles at T.
      // sin(π·t) is 0 at both t=0 and t=1, peaking at t=0.5 — clean boundaries, visible pulse.
      const prev2Px = gridToPixel(cells[cells.length - 2]);
      const tdx     = (tailCellPx.px - prev2Px.px) / tile; // unit direction x (±1 or 0)
      const tdy     = (tailCellPx.py - prev2Px.py) / tile; // unit direction y (±1 or 0)
      const bounce  = Math.sin(Math.PI * t) * tile * 0.55;
      tailPt = {
        px: tailCellPx.px + tdx * bounce,
        py: tailCellPx.py + tdy * bounce,
      };
    } else {
      // Normal step: tail trailing edge retracts from the old tail position toward the new one.
      // Both cells are adjacent on the same axis → always axis-aligned, never diagonal.
      const prevTailSrc = (prevCells && prevCells.length > 0)
        ? prevCells[Math.min(prevCells.length - 1, cells.length - 1)]
        : tailCell;
      const tailFrom = gridToPixel(prevTailSrc);
      tailPt = {
        px: tailFrom.px + (tailCellPx.px - tailFrom.px) * t,
        py: tailFrom.py + (tailCellPx.py - tailFrom.py) * t,
      };
    }

    // --- Point list:
    //   [animated head] → [fixed body joints at grid positions] → [animated tail trailing edge]
    //
    // Crucially, every body joint (cells[1]..cells[n-1]) sits at its exact grid-aligned position.
    // This means corner joints are always clean right angles — the polyline between them is
    // horizontal or vertical, never diagonal, so there is no flickering at turns.
    const pts = [headPt];
    for (let i = 1; i < cells.length; i++) pts.push(gridToPixel(cells[i]));
    pts.push(tailPt);

    const strokePts = () => {
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
    };

    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    strokePts();
    ctx.lineWidth   = tile * 0.78;
    ctx.strokeStyle = '#2d7a2d';
    ctx.stroke();

    strokePts();
    ctx.lineWidth   = tile * 0.52;
    ctx.strokeStyle = '#7ecb63';
    ctx.stroke();

    // Eyes on the head
    const eyeOff = tile * 0.18;
    const eyeR   = Math.max(2, tile * 0.06);
    const dir    = snake.dir || Dir.RIGHT;
    ctx.fillStyle = '#001400';
    for (const side of [-1, 1]) {
      const ex = headPt.px - dir.x * eyeOff + dir.y * eyeOff * side;
      const ey = headPt.py - dir.y * eyeOff - dir.x * eyeOff * side;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    drawGridBackground();
    if (apple) drawApple();
    drawSnakeInterpolated();
  }

  // --- Init ---
  resizeCanvas();
  startNewGame();
  requestAnimationFrame(update);

  popupRestartBtn?.addEventListener('click', () => {
    gameOverPopup.classList.add('hidden');
    startNewGame();
  });

  window.snakeGame = {
    start:     startNewGame,
    pause:     () => setPaused(true),
    resume:    () => setPaused(false),
    isRunning: () => gameRunning && !gamePaused,
    getScore:  () => score,
  };
})();
