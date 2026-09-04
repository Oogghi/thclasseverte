// scripts/pacman-mots.js
// Educational Pac-Man Mots game for TH Classe Verte.
import { triggerEndGameSequence } from './leaderboard.js';
import { playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, burst, floatLabel, screenHit } from './game-feedback.js';
import { loadWeekWords } from './words-utils.js';
import {
  MAP_TEMPLATE,
  COLS,
  ROWS,
  Dir,
  isOpposite,
  createPacmanGrid,
  createMazeWallCache,
  createInitialGhosts,
  drawPacman,
  drawGhost,
  updateGhostAI,
  setupPacmanControls,
} from './pacman-core.js?v=20260903_v15';
import {
  setupPauseManager,
  setupDifficultyMenu,
  setupWordCountdown,
  createWordTargetDisplay,
  isTypingInInput,
} from './game-ui.js?v=20260903_v12';

(() => {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game');
  if (!canvas) return;

  const wordDisplayEl  = document.querySelector('#word-display');
  const wordsCounterEl = document.querySelector('#words-counter');
  const livesCounterEl = document.querySelector('#lives-counter');
  const pauseButton    = document.querySelector('#btn-pause');

  // --- Speed Configurations for Kids ---
  const DIFF_CONFIG = [
    { ghostCount: 2, pacSpeed: 3.2, ghostSpeed: 1.8, name: 'Facile' },
    { ghostCount: 3, pacSpeed: 3.8, ghostSpeed: 2.5, name: 'Moyen' },
    { ghostCount: 4, pacSpeed: 4.4, ghostSpeed: 3.2, name: 'Difficile' },
  ];

  // --- Grid & Canvas Metrics ---
  const grid = createPacmanGrid(canvas);
  const ctx = grid.getContext();
  let { tile, offsetX, offsetY, width, height, DPR } = grid.resize();
  let wallCacheCanvas = null;

  function onResize() {
    const m = grid.resize();
    tile = m.tile; offsetX = m.offsetX; offsetY = m.offsetY;
    width = m.width; height = m.height; DPR = m.DPR;
    wallCacheCanvas = createMazeWallCache(map, tile, offsetX, offsetY, width, height, DPR);
  }
  window.addEventListener('resize', onResize);

  // --- Game State ---
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

  let map = [];
  let pacman;
  let ghosts = [];
  let frightenedTimer = 0;
  let lastTimestamp = 0;
  let queuedDir = Dir.RIGHT;
  let mouthChomp = 0;

  // --- UI Components ---
  const wordDisplay = createWordTargetDisplay({
    containerEl: wordDisplayEl,
    wordsCounterEl,
    livesCounterEl,
    maxLives: MAX_LIVES,
  });

  const countdown = setupWordCountdown();

  const pauseManager = setupPauseManager({
    onPause: () => {},
    onResume: () => { lastTimestamp = performance.now() / 1000; },
    isGameRunning: () => gameRunning && !countdown.isActive(),
    pauseButton,
  });

  const diffMenu = setupDifficultyMenu({
    gameId: 'pacman-mots',
    gameTitle: 'Pac-Man Mots 👻',
    defaultDiff: 0,
    onStart: (diff) => {
      startNewGame(diff);
    },
  });

  // --- Controls ---
  setupPacmanControls({
    onDirection: (d) => {
      if (!gameRunning || pauseManager.isPaused() || countdown.isActive()) return;
      queuedDir = d;
    },
    isInputActive: () => isTypingInInput() || countdown.isActive(),
  });

  // --- Maze & Letter Spawning ---
  function initMaze() {
    map = MAP_TEMPLATE.map(row => [...row]);
    wallCacheCanvas = createMazeWallCache(map, tile, offsetX, offsetY, width, height, DPR);
  }

  function getValidTileLocations() {
    const locations = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // ONLY reachable dot/pellet corridors (0 or 2), never ghost house or side tunnels
        if (map[r][c] === 0 || map[r][c] === 2) {
          if (r === 16 && c === 9) continue; // Skip Pac-Man starting tile
          locations.push({ x: c, y: r });
        }
      }
    }
    return locations;
  }

  function spawnLetters() {
    letters = [];
    if (!currentWord) return;

    const normalized = currentWord.toUpperCase();
    const validSpots = getValidTileLocations();

    for (let i = validSpots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validSpots[i], validSpots[j]] = [validSpots[j], validSpots[i]];
    }

    for (let i = 0; i < normalized.length; i++) {
      const spot = validSpots[i] || { x: 1 + i, y: 1 };
      letters.push({
        char: normalized[i],
        index: i,
        x: spot.x,
        y: spot.y,
        collected: false,
      });
    }
  }

  function resetPositions() {
    pacman = { x: 9, y: 16, dir: Dir.RIGHT, moving: false };
    queuedDir = Dir.RIGHT;
    ghosts = createInitialGhosts(DIFF_CONFIG[diffMenu.getDifficulty()].ghostCount);
  }

  async function loadNextWord() {
    if (currentWordIndex >= words.length) {
      handleWin();
      return;
    }

    currentWord = words[currentWordIndex];
    nextLetterIndex = 0;
    wordDisplay.updateWordsCounter(currentWordIndex, words.length);
    wordDisplay.updateLives(lives);

    resetPositions();
    spawnLetters();

    // 5-second countdown preview
    await countdown.runCountdown(
      currentWord,
      diffMenu.getDifficulty(),
      () => wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), true),
      () => wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), false)
    );

    lastTimestamp = performance.now() / 1000;
  }

  // --- Pac-Man Movement & Letter Eating ---
  function updatePacman(dt, speed) {
    const stepDist = speed * dt;
    const curTileX = Math.round(pacman.x);
    const curTileY = Math.round(pacman.y);
    const distToCenter = Math.hypot(pacman.x - curTileX, pacman.y - curTileY);

    if (queuedDir !== Dir.NONE && queuedDir !== pacman.dir) {
      if (distToCenter <= stepDist * 1.5 && canMove(curTileX, curTileY, queuedDir)) {
        pacman.x = curTileX;
        pacman.y = curTileY;
        pacman.dir = queuedDir;
      }
    }

    if (canMove(curTileX, curTileY, pacman.dir)) {
      pacman.moving = true;
      if (pacman.dir.x > 0) {
        pacman.y = curTileY;
        const nextWall = (curTileX + 1 >= COLS) ? false : (map[curTileY][(curTileX + 1) % COLS] === 1);
        if (nextWall) pacman.x = Math.min(curTileX, pacman.x + stepDist);
        else pacman.x = (pacman.x + stepDist + COLS) % COLS;
      } else if (pacman.dir.x < 0) {
        pacman.y = curTileY;
        const nextWall = (curTileX - 1 < 0) ? false : (map[curTileY][(curTileX - 1 + COLS) % COLS] === 1);
        if (nextWall) pacman.x = Math.max(curTileX, pacman.x - stepDist);
        else pacman.x = (pacman.x - stepDist + COLS) % COLS;
      } else if (pacman.dir.y > 0) {
        pacman.x = curTileX;
        const nextWall = (curTileY + 1 >= ROWS) || (map[curTileY + 1][curTileX] === 1 || map[curTileY + 1][curTileX] === 4);
        if (nextWall) pacman.y = Math.min(curTileY, pacman.y + stepDist);
        else pacman.y += stepDist;
      } else if (pacman.dir.y < 0) {
        pacman.x = curTileX;
        const nextWall = (curTileY - 1 < 0) || (map[curTileY - 1][curTileX] === 1 || map[curTileY - 1][curTileX] === 4);
        if (nextWall) pacman.y = Math.max(curTileY, pacman.y - stepDist);
        else pacman.y -= stepDist;
      }
      mouthChomp += dt * 12;
    } else {
      pacman.moving = false;
      pacman.x = curTileX;
      pacman.y = curTileY;
    }

    // Check letter collisions
    const tx = Math.round(pacman.x);
    const ty = Math.round(pacman.y);
    const hit = letters.find(l => !l.collected && l.x === tx && l.y === ty);

    if (hit) {
      const screenPos = grid.gridToScreen(hit.x, hit.y);

      if (hit.index === nextLetterIndex) {
        // Correct letter eaten!
        hit.collected = true;
        nextLetterIndex++;
        score += 15;
        triggerFrightened(8.5); // Ghosts flee for 8.5s!

        playPickupSound();
        wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), false);
        wordDisplay.bumpTarget();
        burst(screenPos.x, screenPos.y, { color: '#2e9d3a', count: 8, distance: tile });
        floatLabel(`+15 ${hit.char}`, screenPos.x, screenPos.y - tile * 0.35);

        // Word completed!
        if (nextLetterIndex >= currentWord.length) {
          playWordSuccessSound();
          score += 50;
          currentWordIndex++;
          setTimeout(() => {
            if (gameRunning) loadNextWord();
          }, 350);
        }
      } else {
        // Wrong letter eaten!
        playDamageSound();
        screenHit();
        lives--;
        wordDisplay.updateLives(lives);
        burst(screenPos.x, screenPos.y, { color: '#d94a4a', count: 8, distance: tile });
        floatLabel('Mauvaise lettre !', screenPos.x, screenPos.y - tile * 0.35, { error: true });

        if (lives <= 0) {
          handleGameOver();
        }
      }
    }

    // Check power pellet collisions (yellow energizers)
    if (map[ty] && map[ty][tx] === 2) {
      map[ty][tx] = 3;
      score += 25;
      triggerFrightened(9.0);
      playPickupSound();
      const pos = grid.gridToScreen(tx, ty);
      floatLabel('+25 🟡', pos.x, pos.y);
      burst(pos.x, pos.y, { color: '#ffd77a', count: 10, distance: tile });
      wallCacheCanvas = createMazeWallCache(map, tile, offsetX, offsetY, width, height, DPR);
    }
  }

  function triggerFrightened(duration = 8.5) {
    frightenedTimer = duration;
    for (const g of ghosts) {
      if (g.mode === 'chase' && !g.eaten) {
        // Reverse direction immediately to flee from Pac-Man
        if (g.dir === Dir.UP) g.dir = Dir.DOWN;
        else if (g.dir === Dir.DOWN) g.dir = Dir.UP;
        else if (g.dir === Dir.LEFT) g.dir = Dir.RIGHT;
        else if (g.dir === Dir.RIGHT) g.dir = Dir.LEFT;
        g._lastTileX = -1;
        g._lastTileY = -1;
      }
    }
  }

  function canMove(tx, ty, dir) {
    if (!dir || dir === Dir.NONE) return false;
    const nx = (tx + dir.x + COLS) % COLS;
    const ny = ty + dir.y;
    if (ny < 0 || ny >= ROWS) return false;
    const cell = map[ny][nx];
    return cell !== 1 && cell !== 4;
  }

  function handleGameOver() {
    gameRunning = false;
    const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = String(elapsedSec % 60).padStart(2, '0');
    const timeFormatted = `${m}m${s}s`;

    triggerEndGameSequence({
      gameId: 'pacman-mots',
      gameTitle: 'Pac-Man Mots 👻',
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
      gameId: 'pacman-mots',
      gameTitle: 'Pac-Man Mots 👻',
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

  function handlePacmanDeath() {
    lives--;
    wordDisplay.updateLives(lives);
    playDamageSound();
    screenHit();

    if (lives <= 0) {
      handleGameOver();
      return;
    }

    resetPositions();
  }

  // --- Main Update Loop ---
  function update(timeMs) {
    const now = timeMs / 1000;
    const dt = Math.min(0.05, now - (lastTimestamp || now));
    lastTimestamp = now;

    if (gameRunning && !pauseManager.isPaused() && !countdown.isActive()) {
      const cfg = DIFF_CONFIG[diffMenu.getDifficulty()];

      if (frightenedTimer > 0) {
        frightenedTimer -= dt;
      }

      updatePacman(dt, cfg.pacSpeed);

      // Update ghosts & collisions
      for (const ghost of ghosts) {
        updateGhostAI(ghost, pacman, map, dt, cfg.ghostSpeed, frightenedTimer);

        const dist = Math.hypot(ghost.x - pacman.x, ghost.y - pacman.y);
        if (dist < 0.65) {
          if (frightenedTimer > 0 && !ghost.eaten) {
            ghost.eaten = true;
            score += 100;
            playPickupSound();
            const gPos = grid.gridToScreen(ghost.x, ghost.y);
            floatLabel('+100', gPos.x, gPos.y);
          } else if (!ghost.eaten) {
            handlePacmanDeath();
            break;
          }
        }
      }
    }

    draw();
    requestAnimationFrame(update);
  }

  // --- Rendering ---
  function draw() {
    // 1. Draw cached maze walls
    if (wallCacheCanvas) {
      ctx.drawImage(wallCacheCanvas, 0, 0, width, height);
    }

    // 2. Draw Letters in the maze
    letters.forEach(letter => {
      if (letter.collected) return;
      const pos = grid.gridToScreen(letter.x, letter.y);
      const isTarget = letter.index === nextLetterIndex;
      const r = tile * 0.44;

      // Shadow
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(pos.x + 1.5, pos.y + 1.5, r, 0, Math.PI * 2);
      ctx.fill();

      // Pill
      ctx.fillStyle = isTarget ? '#ffd77a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = isTarget ? 2 : 1.2;
      ctx.stroke();

      // Letter text
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `900 ${Math.max(11, Math.floor(tile * 0.52))}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter.char, pos.x, pos.y + 1);
    });

    // 3. Draw Pac-Man
    if (pacman) {
      const mouthAngle = pacman.moving ? Math.abs(Math.sin(mouthChomp)) * 0.38 + 0.05 : 0.2;
      drawPacman(ctx, pacman, tile, offsetX, offsetY, mouthAngle);
    }

    // 4. Draw Ghosts
    ghosts.forEach(ghost => {
      drawGhost(ctx, ghost, tile, offsetX, offsetY, frightenedTimer);
    });
  }

  async function startNewGame(chosenDiff) {
    onResize();
    diffMenu.setDifficulty(chosenDiff);

    score = 0;
    lives = MAX_LIVES;
    currentWordIndex = 0;
    gameStartTime = performance.now();
    frightenedTimer = 0;
    gameRunning = true;
    pauseManager.setPaused(false);

    if (!words.length) {
      words = await loadWeekWords();
    }

    loadNextWord();
  }

  // --- Initial Startup ---
  (async () => {
    initMaze();
    words = await loadWeekWords();
    diffMenu.showMenu();
    requestAnimationFrame(update);
  })();
})();
