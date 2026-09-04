// scripts/pacman.js
// Classic Arcade Pac-Man for TH Classe Verte.
import { triggerEndGameSequence } from './leaderboard.js';
import { playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, floatLabel, screenHit } from './game-feedback.js';
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
import { setupPauseManager, setupDifficultyMenu, isTypingInInput } from './game-ui.js?v=20260903_v14';

(() => {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game');
  if (!canvas) return;

  const scoreCounter = document.getElementById('score-counter');
  const livesCounter = document.getElementById('lives-counter');
  const pauseButton  = document.getElementById('btn-pause');

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

  // --- Speed Configurations for Kids ---
  const DIFF_CONFIG = [
    { ghostCount: 2, pacSpeed: 3.2, ghostSpeed: 1.8, name: 'Facile' },
    { ghostCount: 3, pacSpeed: 3.8, ghostSpeed: 2.5, name: 'Moyen' },
    { ghostCount: 4, pacSpeed: 4.4, ghostSpeed: 3.2, name: 'Difficile' },
  ];

  // --- Game State ---
  let map = [];
  let pacman;
  let ghosts = [];
  let score = 0;
  const MAX_LIVES = 3;
  let lives = MAX_LIVES;
  let dotsRemaining = 0;
  let gameRunning = false;
  let difficulty = 0;
  let frightenedTimer = 0;
  let lastTimestamp = 0;
  let queuedDir = Dir.RIGHT;
  let mouthChomp = 0;

  // --- Pause Manager ---
  const pauseManager = setupPauseManager({
    onPause: () => {},
    onResume: () => { lastTimestamp = performance.now() / 1000; },
    isGameRunning: () => gameRunning,
    pauseButton,
  });

  // --- Difficulty & Leaderboard Menu ---
  const diffMenu = setupDifficultyMenu({
    gameId: 'pacman',
    gameTitle: 'Pac-Man 🟡',
    defaultDiff: 0,
    onStart: (chosenDiff) => {
      startNewGame(chosenDiff);
    },
  });

  // --- Controls ---
  setupPacmanControls({
    onDirection: (d) => {
      if (!gameRunning || pauseManager.isPaused()) return;
      queuedDir = d;
    },
    isInputActive: isTypingInInput,
  });

  // --- Game Setup Helpers ---
  function initMaze() {
    map = MAP_TEMPLATE.map(row => [...row]);
    dotsRemaining = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (map[r][c] === 0 || map[r][c] === 2) dotsRemaining++;
      }
    }

    wallCacheCanvas = createMazeWallCache(map, tile, offsetX, offsetY, width, height, DPR);
  }

  function resetPositions() {
    pacman = { x: 9, y: 16, dir: Dir.RIGHT, moving: false };
    queuedDir = Dir.RIGHT;
    ghosts = createInitialGhosts(DIFF_CONFIG[difficulty].ghostCount);
  }

  function updateHUD() {
    if (scoreCounter) scoreCounter.textContent = `Score : ${score}`;
    if (livesCounter) {
      livesCounter.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) =>
        `<span class="heart ${i < lives ? 'full' : 'empty'}">♥</span>`
      ).join(' ');
    }
  }

  function startNewGame(chosenDiff) {
    onResize();
    difficulty = chosenDiff;
    diffMenu.setDifficulty(chosenDiff);

    score = 0;
    lives = MAX_LIVES;
    frightenedTimer = 0;
    gameRunning = true;
    pauseManager.setPaused(false);

    initMaze();
    resetPositions();
    updateHUD();
    lastTimestamp = performance.now() / 1000;
  }

  // --- Pac-Man Movement & Dot Eating ---
  function updatePacman(dt, speed) {
    const stepDist = speed * dt;
    const curTileX = Math.round(pacman.x);
    const curTileY = Math.round(pacman.y);
    const distToCenter = Math.hypot(pacman.x - curTileX, pacman.y - curTileY);

    // Can we turn to queuedDir?
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

    // Check eating dots
    const tx = Math.round(pacman.x);
    const ty = Math.round(pacman.y);
    if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) {
      const cell = map[ty][tx];
      if (cell === 0) {
        // Small dot
        map[ty][tx] = 3;
        dotsRemaining--;
        score += 10;
        playPickupSound();
        updateHUD();
        checkWin();
      } else if (cell === 2) {
        // Energizer power pellet
        map[ty][tx] = 3;
        dotsRemaining--;
        score += 50;
        triggerFrightened(9.0);
        playWordSuccessSound();
        floatLabel('FANTÔMES EFFRAYÉS !', offsetX + (tx + 0.5) * tile, offsetY + (ty + 0.5) * tile);
        updateHUD();
        wallCacheCanvas = createMazeWallCache(map, tile, offsetX, offsetY, width, height, DPR);
        checkWin();
      }
    }
  }

  function triggerFrightened(duration = 9.0) {
    frightenedTimer = duration;
    for (const g of ghosts) {
      if (g.mode === 'chase' && !g.eaten) {
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

  function checkWin() {
    if (dotsRemaining <= 0) {
      gameRunning = false;
      playWordSuccessSound();
      triggerEndGameSequence({
        gameId: 'pacman',
        gameTitle: 'Pac-Man 🟡',
        currentScore: score,
        scoreFormatted: `${score} pts • ${lives} ♥ (Terminé ! 🌟)`,
        isLowerBetter: false,
        extraMetrics: {
          livesRemaining: lives,
        },
        onClose: () => {
          diffMenu.showMenu();
        },
      });
    }
  }

  function handlePacmanDeath() {
    lives--;
    updateHUD();
    playDamageSound();
    screenHit();

    if (lives <= 0) {
      gameRunning = false;
      triggerEndGameSequence({
        gameId: 'pacman',
        gameTitle: 'Pac-Man 🟡',
        currentScore: score,
        scoreFormatted: `${score} pts • 0 ♥`,
        isLowerBetter: false,
        extraMetrics: {
          livesRemaining: 0,
        },
        onClose: () => {
          diffMenu.showMenu();
        },
      });
      return;
    }

    resetPositions();
  }

  // --- Main Update Loop ---
  function update(timeMs) {
    const now = timeMs / 1000;
    const dt = Math.min(0.05, now - (lastTimestamp || now));
    lastTimestamp = now;

    if (gameRunning && !pauseManager.isPaused()) {
      const cfg = DIFF_CONFIG[difficulty];

      if (frightenedTimer > 0) {
        frightenedTimer -= dt;
      }

      updatePacman(dt, cfg.pacSpeed);

      // Update ghosts and check collisions
      for (const ghost of ghosts) {
        updateGhostAI(ghost, pacman, map, dt, cfg.ghostSpeed, frightenedTimer);

        // Collision check
        const dist = Math.hypot(ghost.x - pacman.x, ghost.y - pacman.y);
        if (dist < 0.65) {
          if (frightenedTimer > 0 && !ghost.eaten) {
            // Eat ghost
            ghost.eaten = true;
            score += 200;
            updateHUD();
            playPickupSound();
            floatLabel('+200', offsetX + (ghost.x + 0.5) * tile, offsetY + (ghost.y + 0.5) * tile);
          } else if (!ghost.eaten) {
            // Ghost kills Pac-Man
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

    // 2. Draw dots and energizers
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = map[r]?.[c];
        const x = offsetX + (c + 0.5) * tile;
        const y = offsetY + (r + 0.5) * tile;

        if (cell === 0) {
          ctx.fillStyle = '#ffcf25';
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2, tile * 0.12), 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 2) {
          const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.2;
          ctx.fillStyle = '#ffd77a';
          ctx.beginPath();
          ctx.arc(x, y, tile * 0.28 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

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

  // --- Startup ---
  initMaze();
  diffMenu.showMenu();
  requestAnimationFrame(update);
})();
