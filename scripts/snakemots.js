// scripts/snakemots.js
// Educational Snake Mots game for TH Classe Verte.
import { triggerEndGameSequence } from './leaderboard.js';
import { playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, burst, floatLabel, screenHit } from './game-feedback.js';
import { loadWeekWords, shuffle } from './words-utils.js';
import { Dir, isOpposite, createSnakeGrid, setupSnakeControls, drawSnake } from './snake-core.js';
import {
  setupPauseManager,
  setupDifficultyMenu,
  setupWordCountdown,
  createWordTargetDisplay,
  isTypingInInput,
} from './game-ui.js';

(() => {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game') || (() => {
    const el = document.createElement('canvas');
    el.id = 'game';
    document.body.appendChild(el);
    return el;
  })();

  const wordDisplayEl  = document.querySelector('#word-display');
  const wordsCounterEl = document.querySelector('#words-counter');
  const livesCounterEl = document.querySelector('#lives-counter');
  const pauseButton    = document.querySelector('#btn-pause');

  // --- State ---
  let words = [];
  let currentWordIndex = 0;
  let currentWord = '';
  let nextLetterIndex = 0;
  let letters = [];

  const MAX_LIVES = 3;
  let lives = MAX_LIVES;
  let score = 0;
  let gameRunning = false;
  let gameStartTime = 0;

  const BASE_SPEED = 5.5;
  let speedTilesPerSec = BASE_SPEED;
  let moveInterval = 1 / BASE_SPEED;
  let lastMoveTime = 0;
  let interpolation = 0;

  let snake;
  let prevCells = null;
  let queuedDir = null;
  let pickupPulse = null;

  // --- Grid & Canvas Metrics ---
  const grid = createSnakeGrid(canvas, { topUI: 90, bottomUI: 65 });
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

  // --- Word UI & Countdown ---
  const wordDisplay = createWordTargetDisplay({
    containerEl: wordDisplayEl,
    wordsCounterEl,
    livesCounterEl,
    maxLives: MAX_LIVES,
  });

  const countdown = setupWordCountdown();

  // --- Pause Manager ---
  const pauseManager = setupPauseManager({
    onPause: () => {},
    onResume: () => { lastMoveTime = performance.now() / 1000; },
    isGameRunning: () => gameRunning && !countdown.isActive(),
    pauseButton,
  });

  // --- Difficulty & Leaderboard Menu ---
  const diffMenu = setupDifficultyMenu({
    gameId: 'snakemots',
    gameTitle: 'Snake Mots 🐍',
    defaultDiff: 0,
    onStart: (selectedDiff) => {
      startNewGame(selectedDiff);
    },
  });

  // --- Controls ---
  setupSnakeControls({
    onDirection: (d) => {
      if (!snake || pauseManager.isPaused() || countdown.isActive()) return;
      if (!snake.dir) { snake.dir = d; return; }
      if (!isOpposite(snake.dir, d)) queuedDir = d;
    },
    isInputActive: () => isTypingInInput() || countdown.isActive(),
  });

  // --- Helpers ---
  function gridToPixel(cell) {
    return {
      px: offsetX + (cell.x + 0.5) * tile,
      py: offsetY + (cell.y + 0.5) * tile,
    };
  }

  function spawnSnake(keepLength = false) {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const initLen = 5;
    const len = (keepLength && snake?.lengthTiles) ? snake.lengthTiles : initLen;
    const cells = Array.from({ length: initLen }, (_, i) => ({ x: cx - i, y: cy }));
    snake = { cells, dir: Dir.RIGHT, lengthTiles: len };
    prevCells = cells.map(c => ({ ...c }));
    queuedDir = null;
  }

  function spawnLetters() {
    letters = [];
    if (!currentWord) return;

    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    const uppercaseWord = currentWord.toUpperCase();

    for (let i = 0; i < uppercaseWord.length; i++) {
      let x, y, tries = 0;
      do {
        x = Math.floor(Math.random() * (cols - 2)) + 1;
        y = Math.floor(Math.random() * (rows - 2)) + 1;
      } while (
        (occupied.has(`${x},${y}`) || letters.some(l => l.x === x && l.y === y)) &&
        ++tries < 1000
      );

      letters.push({
        char: uppercaseWord[i],
        index: i,
        x,
        y,
        spawnTime: performance.now(),
        collected: false,
      });
    }
  }

  async function loadNextWord() {
    if (currentWordIndex >= words.length) {
      handleWin();
      return;
    }

    currentWord = words[currentWordIndex];
    nextLetterIndex = 0;
    wordDisplay.updateWordsCounter(currentWordIndex, words.length);

    spawnSnake(true);
    spawnLetters();

    // 5-second countdown preview
    await countdown.runCountdown(
      currentWord,
      diffMenu.getDifficulty(),
      () => wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), true),
      () => wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), false)
    );

    lastMoveTime = performance.now() / 1000;
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
    if (nh.x < 0 || nh.x >= cols || nh.y < 0 || nh.y >= rows) return handleCollision(true);

    // Self collision
    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    if (occupied.has(`${nh.x},${nh.y}`)) return handleCollision(true);

    snake.cells.unshift(nh);

    // Letter collisions
    const hitIndex = letters.findIndex(l => !l.collected && l.x === nh.x && l.y === nh.y);
    if (hitIndex !== -1) {
      const hit = letters[hitIndex];
      const hitPos = gridToPixel(hit);

      const expectedChar = currentWord[nextLetterIndex]?.toUpperCase();
      if (hit.char === expectedChar) {
        // Correct letter eaten!
        hit.collected = true;
        nextLetterIndex++;
        score += 10;
        snake.lengthTiles++;
        pickupPulse = { ...hitPos, startedAt: performance.now(), color: '#2e9d3a' };

        playPickupSound();
        wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), false);
        wordDisplay.bumpTarget();
        burst(hitPos.px, hitPos.py, { color: '#2e9d3a', count: 8, distance: Math.min(38, tile) });
        floatLabel(`+10 ${hit.char}`, hitPos.px, hitPos.py - tile * 0.35);

        // Word completed!
        if (nextLetterIndex >= currentWord.length) {
          playWordSuccessSound();
          score += 50;
          currentWordIndex++;
          setTimeout(() => {
            if (gameRunning) loadNextWord();
          }, 300);
        }
      } else {
        // Wrong letter eaten!
        playDamageSound();
        screenHit();
        lives--;
        wordDisplay.updateLives(lives);
        burst(hitPos.px, hitPos.py, { color: '#d94a4a', count: 8, distance: Math.min(38, tile) });
        floatLabel('Aïe ! Mauvaise lettre', hitPos.px, hitPos.py - tile * 0.35, { error: true });

        if (lives <= 0) {
          handleGameOver();
          return false;
        }
      }
    }

    while (snake.cells.length > snake.lengthTiles) {
      snake.cells.pop();
    }

    return true;
  }

  function handleCollision(isWallOrSelf = false) {
    playDamageSound();
    screenHit();
    lives--;
    wordDisplay.updateLives(lives);

    if (lives <= 0) {
      handleGameOver();
      return false;
    }

    // Reset snake to center if collided with wall or self
    if (isWallOrSelf) {
      spawnSnake(true);
    }
    return true;
  }

  function handleGameOver() {
    gameRunning = false;
    const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = String(elapsedSec % 60).padStart(2, '0');
    const timeFormatted = `${m}m${s}s`;

    triggerEndGameSequence({
      gameId: 'snakemots',
      gameTitle: 'Snake Mots 🐍',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots • ${lives} ♥ • ${timeFormatted}`,
      isLowerBetter: false,
      extraMetrics: {
        wordsCount: currentWordIndex,
        livesRemaining: lives,
        timeElapsed: elapsedSec,
      },
      onClose: () => {
        diffMenu.showMenu();
      },
    });
  }

  function handleWin() {
    gameRunning = false;
    playWordSuccessSound();
    const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = String(elapsedSec % 60).padStart(2, '0');
    const timeFormatted = `${m}m${s}s`;

    triggerEndGameSequence({
      gameId: 'snakemots',
      gameTitle: 'Snake Mots 🐍',
      currentScore: words.length,
      scoreFormatted: `${words.length} mots • ${lives} ♥ • ${timeFormatted}`,
      isLowerBetter: false,
      extraMetrics: {
        wordsCount: words.length,
        livesRemaining: lives,
        timeElapsed: elapsedSec,
      },
      onClose: () => {
        diffMenu.showMenu();
      },
    });
  }

  async function startNewGame(selectedDiff) {
    onResize();
    diffMenu.setDifficulty(selectedDiff);

    score = 0;
    lives = MAX_LIVES;
    currentWordIndex = 0;
    gameStartTime = performance.now();
    speedTilesPerSec = BASE_SPEED + selectedDiff * 0.7;
    moveInterval = 1 / speedTilesPerSec;

    wordDisplay.updateLives(lives);
    gameRunning = true;
    pauseManager.setPaused(false);

    if (!words.length) {
      words = await loadWeekWords();
    }

    loadNextWord();
  }

  function update(timeMs) {
    if (!gameRunning || pauseManager.isPaused() || countdown.isActive()) {
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
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) { ctx.moveTo(c * tile, 0); ctx.lineTo(c * tile, gridH); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * tile); ctx.lineTo(gridW, r * tile); }
    ctx.stroke();

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, gridW, gridH);

    ctx.restore();
  }

  function drawLetters() {
    if (!letters || !letters.length) return;

    letters.forEach(letter => {
      if (letter.collected) return;
      const { px, py } = gridToPixel(letter);
      const r = tile * 0.42;

      // Outer neo-brutalist circle
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(px + 2, py + 2, r, 0, Math.PI * 2);
      ctx.fill();

      // Inner pill
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Letter text
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `900 ${Math.max(12, Math.floor(tile * 0.52))}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter.char, px, py + 1);
    });
  }

  function drawPickupPulse() {
    if (!pickupPulse) return;
    const age = (performance.now() - pickupPulse.startedAt) / 320;
    if (age >= 1) { pickupPulse = null; return; }
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = pickupPulse.color || '#2e9d3a';
    ctx.lineWidth = Math.max(2, tile * 0.08 * (1 - age));
    ctx.beginPath();
    ctx.arc(pickupPulse.px, pickupPulse.py, tile * (0.28 + age * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    drawGridBackground();
    drawLetters();
    drawPickupPulse();
    drawSnake(ctx, snake, prevCells, interpolation, { tile, offsetX, offsetY });
  }

  // --- Initial Startup ---
  (async () => {
    words = await loadWeekWords();
    diffMenu.showMenu();
    requestAnimationFrame(update);
  })();
})();
