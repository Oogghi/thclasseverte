// ---- SUPABASE WORD LOADER ----
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ---- SUPABASE ----
const SUPABASE_URL = "https://rwloeubpmlnrycyzhzuo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI"; // keep your real key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let words = [];

async function loadWords() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const cases = parseInt(urlParams.get("cases") || "1");
    const weekIndex = Math.floor((cases - 1) / 4) + 1;

    const { data, error } = await supabase
      .from("weeks")
      .select("boxes")
      .eq("position", weekIndex)
      .single();

    if (error) throw error;

    words = data.boxes.flatMap(b => b.words);
    console.log("✅ Words loaded:", words);
  } catch (err) {
    console.error("⚠️ Error loading from Supabase:", err);
    words = [
      'pomme','table','chien','fleur','voiture','maison',
      'arbre','ordinateur','stylo','livre','soleil','lune',
      'voile','bateau','plage','montagne'
    ];
  }
}

await loadWords();

(() => {
  'use strict';

  // --- Utilities ---
  const qs = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // --- Elements ---
  const canvas = qs('#game') || (function () {
    const c = document.createElement('canvas');
    c.id = 'game';
    document.body.appendChild(c);
    return c;
  })();

  const wordDisplay = qs('#word-display');
  const wordsCounter = qs('#words-counter');
  const livesCounter = qs('#lives-counter');
  const gameOverPopup = qs('#game-over-popup');
  const POPUP_CLOSE = qs('#popup-close');
  const finalScoreEl = qs('#final-score');
  const popupRestart = qs('#popup-restart');
  const countdownOverlay = qs('#countdown-overlay');
  const countdownText = qs('#countdown-text');
  const countdownNumber = qs('#countdown-number');

  const ctx = canvas.getContext('2d', { alpha: false });

  // Ensure popup & countdown are hidden initially (fixes "visible at start" bug)
  function hideGameOverPopup() {
    if (!gameOverPopup) return;
    gameOverPopup.style.display = 'none';
    gameOverPopup.classList.add('hidden');
  }
  function showGameOverPopup() {
    if (!gameOverPopup) return;
    gameOverPopup.style.display = 'flex';
    gameOverPopup.classList.remove('hidden');
  }
  function hideCountdown() {
    if (!countdownOverlay) return;
    countdownOverlay.style.display = 'none';
    countdownOverlay.classList.add('hidden');
    countdownText.textContent = '';
    countdownNumber.textContent = '';
  }
  function showCountdownOverlay() {
    if (!countdownOverlay) return;
    countdownOverlay.style.display = 'flex';
    countdownOverlay.classList.remove('hidden');
  }

  // Read CSS variables
  const rootStyle = getComputedStyle(document.documentElement || document.body);
  const BG_COLOR = rootStyle.getPropertyValue('--bg').trim() || '#fbffd8';
  const GRID_COLOR = rootStyle.getPropertyValue('--grid-line').trim() || 'rgba(0,32,0,0.12)';

  // --- Rendering / grid sizing ---
  let DPR = Math.max(1, window.devicePixelRatio || 1);
  let width = 0, height = 0;
  let cols = 0, rows = 0;
  let tile = 30;
  const minTile = 16, maxTile = 96;
  let offsetX = 0, offsetY = 0;

  function resizeCanvas() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;

    const divisor = (Math.min(width, height) < 600) ? 16 : 18;
    const idealTile = Math.floor(Math.min(width, height) / divisor);
    tile = clamp(idealTile, minTile, maxTile);

    cols = Math.max(8, Math.floor(width / tile));
    rows = Math.max(6, Math.floor(height / tile));

    tile = Math.floor(Math.min(width / cols, height / rows));

    const gridW = cols * tile;
    const gridH = rows * tile;

    offsetX = Math.floor((width - gridW) / 2);
    offsetY = Math.floor((height - gridH) / 2);

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    draw();
  });

  // --- Game state ---
  let snake;
  let letters = [];
  let currentWordIndex = 0;
  let currentWord = '';
  let nextLetterIndex = 0;

  const baseSpeed = 5.5;
  let speedTilesPerSec = baseSpeed;
  const maxSpeed = 12;
  let moveInterval = 1 / speedTilesPerSec;
  let lastMoveTime = 0;
  let interpolation = 0;
  let prevHead = null;
  let gameRunning = false;
  let gamePaused = false;
  let score = 0;
  let highscore = parseInt(localStorage.getItem('snake_highscore') || '0', 10);

  // Lives
  let lives = 3;

  // Input
  const Dir = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  };
  function opposite(a, b) { return a.x + b.x === 0 && a.y + b.y === 0; }
  let queuedDir = null;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { togglePause(); return; }
    if (['ArrowUp', 'w', 'W'].includes(e.key)) trySetDir(Dir.UP);
    if (['ArrowDown', 's', 'S'].includes(e.key)) trySetDir(Dir.DOWN);
    if (['ArrowLeft', 'a', 'A'].includes(e.key)) trySetDir(Dir.LEFT);
    if (['ArrowRight', 'd', 'D'].includes(e.key)) trySetDir(Dir.RIGHT);
  });
  function trySetDir(d) {
    if (!snake.dir) { snake.dir = d; return; }
    if (!opposite(snake.dir, d)) queuedDir = d;
  }

  // Touch
  let touchStart = null;
  window.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absx = Math.abs(dx), absy = Math.abs(dy);
    if (Math.max(absx, absy) < 20) { touchStart = null; return; }
    if (absx > absy) {
      if (dx > 0) trySetDir(Dir.RIGHT); else trySetDir(Dir.LEFT);
    } else {
      if (dy > 0) trySetDir(Dir.DOWN); else trySetDir(Dir.UP);
    }
    touchStart = null;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameRunning && !gamePaused) setPaused(true);
  });

  // --- Snake spawn ---
  function spawnSnake() {
    const startX = Math.floor(cols / 2);
    const startY = Math.floor(rows / 2);
    const initLength = 5;
    const cells = [];
    for (let i = 0; i < initLength; i++) cells.push({ x: startX - i, y: startY });
    snake = { cells, dir: Dir.RIGHT, lengthTiles: initLength };
    prevHead = { ...cells[0] };
    queuedDir = null;
  }

  // HUD
  function updateHUD() {
    if (wordsCounter) wordsCounter.textContent = `Mots : ${Math.min(currentWordIndex + 1, words.length)}/${words.length}`;
    if (livesCounter) livesCounter.textContent = `Vies : ${lives}`;
  }

  // Countdown with message — returns promise
  function showCountdownAndMessage(word) {
    return new Promise((resolve) => {
      if (!countdownOverlay || !countdownNumber || !countdownText) { resolve(); return; }
      countdownText.textContent = `Tu dois reconstruire le mot : "${word}"`;
      let n = 5;
      countdownNumber.textContent = n;
      showCountdownOverlay();
      const interval = setInterval(() => {
        n--;
        if (n > 0) {
          countdownNumber.textContent = n;
        } else {
          clearInterval(interval);
          hideCountdown();
          resolve();
        }
      }, 1000);
    });
  }

  async function startWord() {
    if (currentWordIndex >= words.length) { handleVictory(); return; }
    currentWord = words[currentWordIndex];
    nextLetterIndex = 0;
    letters = [];

    updateHUD();

    if (!snake || !snake.cells) spawnSnake();
    const head = snake.cells[0];
    const headNext = { x: head.x + (snake.dir?.x ?? 1), y: head.y + (snake.dir?.y ?? 0) };

    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    if (headNext.x >= 0 && headNext.x < cols && headNext.y >= 0 && headNext.y < rows) {
      occupied.add(`${headNext.x},${headNext.y}`);
    }

    for (let i = 0; i < currentWord.length; i++) {
      let pos;
      let attempts = 0;
      do {
        const x = randInt(1, cols - 2);
        const y = randInt(1, rows - 2);
        pos = { x, y };
        attempts++;
      } while (occupied.has(`${pos.x},${pos.y}`) && attempts < 2000);

      if (attempts >= 2000) {
        let found = false;
        for (let yy = 1; yy < rows - 1 && !found; yy++) {
          for (let xx = 1; xx < cols - 1 && !found; xx++) {
            if (!occupied.has(`${xx},${yy}`)) { pos = { x: xx, y: yy }; found = true; }
          }
        }
        if (!pos) { console.warn('Could not place all letters; board too full.'); break; }
      }

      occupied.add(`${pos.x},${pos.y}`);
      letters.push({ ...pos, char: currentWord[i].toUpperCase() });
    }

    if (wordDisplay) {
      const collected = currentWord.slice(0, nextLetterIndex);
      const remaining = currentWord.slice(nextLetterIndex);
      wordDisplay.innerHTML = `<span style="color:#006600">${collected}</span>${remaining}`;
    }

    setPaused(true);
    await showCountdownAndMessage(currentWord);

    speedTilesPerSec = baseSpeed;
    moveInterval = 1 / speedTilesPerSec;

    spawnSnake();

    setPaused(false);
    lastMoveTime = performance.now() / 1000;

    console.log("🔤 New word:", currentWord, letters);
  }

  function gridToPixel(cell) {
    return { px: offsetX + (cell.x + 0.5) * tile, py: offsetY + (cell.y + 0.5) * tile };
  }

  function stepSnake() {
    if (queuedDir) { if (!opposite(snake.dir, queuedDir)) snake.dir = queuedDir; queuedDir = null; }
    const head = snake.cells[0];
    const nh = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };

    prevHead = { ...head };
    interpolation = 0;

    if (nh.x < 0 || nh.x >= cols || nh.y < 0 || nh.y >= rows) return handleCollision();

    const occupied = new Set(snake.cells.map((c) => `${c.x},${c.y}`));
    if (occupied.has(`${nh.x},${nh.y}`)) return handleCollision();

    snake.cells.unshift(nh);

    const idx = letters.findIndex(l => l.x === nh.x && l.y === nh.y);
    if (idx !== -1) {
      const letter = letters[idx];
      const expected = currentWord[nextLetterIndex].toUpperCase();
      if (letter.char === expected) {
        letters.splice(idx, 1);
        nextLetterIndex++;
        score++;
        snake.lengthTiles++;

        if (wordDisplay) {
          const collected = currentWord.slice(0, nextLetterIndex);
          const remaining = currentWord.slice(nextLetterIndex);
          wordDisplay.innerHTML = `<span style="color:#90ee90">${collected}</span>${remaining}`;
        }

        if (nextLetterIndex >= currentWord.length) {
          currentWordIndex++;
          updateHUD();
          spawnSnake();
          speedTilesPerSec = baseSpeed;
          moveInterval = 1 / speedTilesPerSec;
          startWord();
        }
      } else {
        return handleCollision();
      }
    }

    while (snake.cells.length > snake.lengthTiles) snake.cells.pop();
    return true;
  }

  function drawLetters() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${tile * 0.7}px monospace`;
    for (const l of letters) {
      const { px, py } = gridToPixel(l);
      ctx.fillStyle = '#90ee90';
      ctx.beginPath();
      ctx.arc(px, py, tile * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#004400';
      ctx.fillText(l.char, px, py + 2);
    }
    ctx.restore();
  }

  function handleCollision() {
    if (lives > 1) {
      lives--;
      updateHUD();
      spawnSnake();
      speedTilesPerSec = baseSpeed;
      moveInterval = 1 / speedTilesPerSec;
      lastMoveTime = performance.now() / 1000;
      setPaused(true);
      setTimeout(async () => {
        await showCountdownAndMessage(currentWord);
        setPaused(false);
        lastMoveTime = performance.now() / 1000;
      }, 200);
      return false;
    } else {
      lives = 0;
      updateHUD();
      return handleDeath();
    }
  }

  function handleDeath() {
    gameRunning = false;
    setPaused(false);
    if (finalScoreEl) finalScoreEl.textContent = `Score: ${score}`;
    showGameOverPopup();
    if (score > highscore) { highscore = score; try { localStorage.setItem('snake_highscore', String(highscore)); } catch (e) {} }
    return false;
  }

  function handleVictory() {
    gameRunning = false;
    setPaused(false);
    if (finalScoreEl) finalScoreEl.textContent = `Bravo ! Score: ${score}`;
    showGameOverPopup();
  }

  function setPaused(p) { gamePaused = p; }
  function togglePause() {
    if (!gameRunning) return;
    setPaused(!gamePaused);
    if (!gamePaused) lastMoveTime = performance.now() / 1000;
  }

  function startNewGame() {
    resizeCanvas();
    currentWordIndex = 0;
    score = 0;
    lives = 3;
    speedTilesPerSec = baseSpeed;
    moveInterval = 1 / speedTilesPerSec;
    spawnSnake();
    updateHUD();
    gameRunning = true;
    gamePaused = false;
    hideGameOverPopup();
    startWord();
    lastMoveTime = performance.now() / 1000;
    requestAnimationFrame(update);
  }

  function update(timeMs) {
    if (!gameRunning || gamePaused) { draw(); requestAnimationFrame(update); return; }
    const t = timeMs / 1000;
    interpolation = (t - lastMoveTime) / moveInterval;
    if (interpolation >= 1) {
      const steps = Math.floor(interpolation);
      for (let i = 0; i < steps; i++) {
        lastMoveTime += moveInterval;
        const ok = stepSnake();
        if (!ok) break;
      }
      interpolation = (t - lastMoveTime) / moveInterval;
    }
    draw();
    requestAnimationFrame(update);
  }

  function drawGridBackground() {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    const gridW = cols * tile;
    const gridH = rows * tile;
    ctx.save();
    ctx.translate(offsetX, offsetY);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (((x + y) & 1) === 0) ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = GRID_COLOR;
    for (let c = 0; c <= cols; c++) {
      const x = c * tile + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, gridH);
    }
    for (let r = 0; r <= rows; r++) {
      const y = r * tile + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(gridW, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,32,0,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, gridW - 2, gridH - 2);
    ctx.restore();
  }

  function drawSnakeInterpolated() {
    if (!snake || snake.cells.length === 0) return;
    const pix = snake.cells.map(gridToPixel);
    if (prevHead) {
      const headNow = snake.cells[0];
      const hx = prevHead.x + (headNow.x - prevHead.x) * clamp(interpolation, 0, 1);
      const hy = prevHead.y + (headNow.y - prevHead.y) * clamp(interpolation, 0, 1);
      pix[0] = gridToPixel({ x: hx, y: hy });
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < pix.length; i++) {
      const p = pix[i];
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    }
    ctx.lineWidth = tile * 0.78;
    ctx.strokeStyle = '#2d7a2d';
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < pix.length; i++) {
      const p = pix[i];
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    }
    ctx.lineWidth = tile * 0.52;
    ctx.strokeStyle = '#7ecb63';
    ctx.stroke();

    const headP = pix[0];
    if (headP) {
      const eyeOffset = tile * 0.18;
      const eyeSize = Math.max(2, tile * 0.06);
      const dir = snake.dir || { x: 1, y: 0 };
      const leftEye = { x: headP.px - dir.x * eyeOffset - dir.y * eyeOffset, y: headP.py - dir.y * eyeOffset + dir.x * eyeOffset };
      const rightEye = { x: headP.px - dir.x * eyeOffset + dir.y * eyeOffset, y: headP.py - dir.y * eyeOffset - dir.x * eyeOffset };
      ctx.fillStyle = '#001400';
      ctx.beginPath();
      ctx.arc(leftEye.x, leftEye.y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rightEye.x, rightEye.y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    drawGridBackground();
    drawLetters();
    drawSnakeInterpolated();
  }

  // init
  function init() {
    resizeCanvas();
    hideGameOverPopup();
    hideCountdown();
    updateHUD();
    startNewGame();
    requestAnimationFrame(update);
  }

  // popup handlers
  POPUP_CLOSE.addEventListener('click', () => {
    hideGameOverPopup();
  });
  popupRestart.addEventListener('click', () => {
    hideGameOverPopup();
    currentWordIndex = 0;
    score = 0;
    lives = 3;
    updateHUD();
    startNewGame();
  });

  init();
})();