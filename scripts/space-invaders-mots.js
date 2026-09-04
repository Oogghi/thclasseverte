// scripts/space-invaders-mots.js
// Educational Space Invaders Mots game for TH Classe Verte.
import { triggerEndGameSequence } from './leaderboard.js';
import { playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, burst, floatLabel, screenHit } from './game-feedback.js';
import { loadWeekWords, shuffle } from './words-utils.js';
import {
  createStarfield,
  drawStarfield,
  createShields,
  drawShields,
  drawPlayerShip,
  createParticleManager,
  bindMobileControls,
} from './space-invaders-core.js';
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
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const wordDisplayEl  = document.getElementById('word-display');
  const wordsCounterEl = document.getElementById('words-counter');
  const livesCounterEl = document.getElementById('lives-counter');
  const scoreCounterEl = document.getElementById('score-counter');
  const pauseButton    = document.getElementById('btn-pause');

  const playerShipImage = new Image();
  let playerShipReady = false;
  playerShipImage.addEventListener('load', () => { playerShipReady = true; });
  playerShipImage.src = 'assets/space-invaders-ship.png';

  // --- Settings by Difficulty (0: Facile, 1: Moyen, 2: Difficile) ---
  const SETTINGS = [
    { enemySpeed: 38, shotRate: 0.22, enemyShotSpeed: 215, descent: 14, name: 'Facile' },
    { enemySpeed: 52, shotRate: 0.38, enemyShotSpeed: 280, descent: 16, name: 'Moyen' },
    { enemySpeed: 68, shotRate: 0.52, enemyShotSpeed: 340, descent: 18, name: 'Difficile' },
  ];

  // --- State Variables ---
  const MAX_LIVES = 3;
  let dpr = 1, width = 0, height = 0, worldScale = 1;
  let running = false;
  let score = 0, lives = MAX_LIVES;
  let gameStartTime = 0;

  let words = [];
  let currentWordIndex = 0;
  let currentWord = '';
  let nextLetterIndex = 0;

  let lastTime = 0, enemyDirection = 1, enemyShotClock = 0;
  let player, invaders = [], playerShots = [], enemyShots = [], stars = [], shields = [];
  const keys = { left: false, right: false, shoot: false };
  let shootCooldown = 0;

  const particleManager = createParticleManager();

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
    onResume: () => { lastTime = performance.now() / 1000; },
    isGameRunning: () => running && !countdown.isActive(),
    pauseButton,
  });

  const diffMenu = setupDifficultyMenu({
    gameId: 'space-invaders-mots',
    gameTitle: 'Space Invaders Mots 👾',
    defaultDiff: 0,
    onStart: (diff) => {
      startNewGame(diff);
    },
  });

  // --- Resize ---
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const oldWidth = width || rect.width || window.innerWidth;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = Math.max(280, rect.width || (window.innerWidth - 32));
    height = Math.max(260, rect.height || (window.innerHeight - 150));
    worldScale = Math.max(0.78, Math.min(1.4, Math.min(width / 1500, height / 750)));

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (player) {
      player.x = (player.x / oldWidth) * width;
      player.y = height - Math.max(46, 52 * worldScale);
      player.w = 58 * worldScale;
      player.h = 32 * worldScale;
    }

    stars = createStarfield(width, height);
  }

  window.addEventListener('resize', resize);

  // --- Game Setup Helpers ---
  function resetPlayer() {
    player = {
      x: width / 2,
      y: height - Math.max(46, 52 * worldScale),
      w: 58 * worldScale,
      h: 32 * worldScale,
      invulnerable: 1.2,
    };
    playerShots = [];
    enemyShots  = [];
  }

  function createWordInvaders() {
    invaders = [];
    if (!currentWord) return;

    const normalized = currentWord.toUpperCase();
    const wordLen = normalized.length;
    const cols = Math.max(wordLen, width < 500 ? 5 : 7);
    const rows = 3;

    const gapX = Math.min(110 * worldScale, (width - 60) / Math.max(1, cols - 1));
    const gapY = 48 * worldScale;
    const formationWidth = (cols - 1) * gapX;
    const startX = (width - formationWidth) / 2;
    const startY = Math.max(44, 40 * worldScale);

    // Distribute the target word letters across the invaders
    const letterAssignments = [];
    for (let i = 0; i < wordLen; i++) {
      letterAssignments.push({ char: normalized[i], index: i, isTargetLetter: true });
    }

    // Fill remaining positions with random distractor letters
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const totalSlots = cols * rows;
    while (letterAssignments.length < totalSlots) {
      const randChar = alphabet[Math.floor(Math.random() * alphabet.length)];
      letterAssignments.push({ char: randChar, index: -1, isTargetLetter: false });
    }

    shuffle(letterAssignments);

    let assignIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const item = letterAssignments[assignIdx++] || { char: '?', index: -1, isTargetLetter: false };
        invaders.push({
          x: startX + c * gapX,
          y: startY + r * gapY,
          w: 42 * worldScale,
          h: 32 * worldScale,
          row: r,
          col: c,
          alive: true,
          char: item.char,
          letterIndex: item.index,
          isTargetLetter: item.isTargetLetter,
        });
      }
    }
  }

  function updateHUD() {
    if (scoreCounterEl) scoreCounterEl.innerHTML = `Score : <strong>${score}</strong>`;
    wordDisplay.updateWordsCounter(currentWordIndex, words.length);
    wordDisplay.updateLives(lives);
  }

  async function loadNextWord() {
    if (currentWordIndex >= words.length) {
      handleWin();
      return;
    }

    currentWord = words[currentWordIndex];
    nextLetterIndex = 0;
    updateHUD();

    createWordInvaders();
    shields = createShields(width, height, worldScale);
    enemyDirection = 1;
    enemyShotClock = 0;
    resetPlayer();

    // 5-second countdown preview
    await countdown.runCountdown(
      currentWord,
      diffMenu.getDifficulty(),
      () => wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), true),
      () => wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), false)
    );

    lastTime = performance.now() / 1000;
  }

  // --- Controls & Input ---
  window.addEventListener('keydown', (e) => {
    if (isTypingInInput() || countdown.isActive()) return;
    if (e.code === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.code === 'Space') keys.shoot = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.code === 'Space') keys.shoot = false;
  });

  bindMobileControls({
    onLeft:  (val) => { keys.left = val; },
    onRight: (val) => { keys.right = val; },
    onShoot: (val) => { keys.shoot = val; },
  });

  // --- Collision & Physics ---
  function hitBunker(shot, radius = 7) {
    for (const shield of shields) {
      for (const block of shield.blocks) {
        if (block.hp <= 0) continue;
        const dx = shot.x - (block.x + block.w / 2);
        const dy = shot.y - (block.y + block.h / 2);
        if (Math.abs(dx) <= block.w / 2 + radius && Math.abs(dy) <= block.h / 2 + radius) {
          block.hp--;
          particleManager.addExplosion(shot.x, shot.y, '#2e9d3a', 4);
          return true;
        }
      }
    }
    return false;
  }

  function handlePlayerHit() {
    lives--;
    updateHUD();
    playDamageSound();
    screenHit();
    particleManager.addExplosion(player.x, player.y, '#ffd77a', 20);

    if (lives <= 0) {
      running = false;
      const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
      const m = Math.floor(elapsedSec / 60);
      const s = String(elapsedSec % 60).padStart(2, '0');
      const timeFormatted = `${m}m${s}s`;

      triggerEndGameSequence({
        gameId: 'space-invaders-mots',
        gameTitle: 'Space Invaders Mots 👾',
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
      return;
    }

    resetPlayer();
  }

  function handleWin() {
    running = false;
    playWordSuccessSound();
    const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = String(elapsedSec % 60).padStart(2, '0');
    const timeFormatted = `${m}m${s}s`;

    triggerEndGameSequence({
      gameId: 'space-invaders-mots',
      gameTitle: 'Space Invaders Mots 👾',
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

  // --- Main Update Loop ---
  function update(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, now - (lastTime || now));
    lastTime = now;

    if (running && !pauseManager.isPaused() && !countdown.isActive()) {
      const cfg = SETTINGS[diffMenu.getDifficulty()];
      const playerSpeed = 340 * worldScale;

      // Move player
      if (keys.left)  player.x -= playerSpeed * dt;
      if (keys.right) player.x += playerSpeed * dt;
      player.x = Math.max(player.w / 2 + 10, Math.min(width - player.w / 2 - 10, player.x));

      if (player.invulnerable > 0) player.invulnerable -= dt;
      if (shootCooldown > 0) shootCooldown -= dt;

      // Player shoot
      if (keys.shoot && shootCooldown <= 0) {
        playerShots.push({ x: player.x, y: player.y - player.h / 2, vy: -520 * worldScale });
        shootCooldown = 0.28;
        playPickupSound();
      }

      // Move player shots
      for (let i = playerShots.length - 1; i >= 0; i--) {
        const s = playerShots[i];
        s.y += s.vy * dt;
        if (s.y < 0) { playerShots.splice(i, 1); continue; }
        if (hitBunker(s, 5)) { playerShots.splice(i, 1); continue; }

        // Hit enemy
        for (const inv of invaders) {
          if (!inv.alive) continue;
          if (Math.abs(s.x - inv.x) <= inv.w / 2 && Math.abs(s.y - inv.y) <= inv.h / 2) {
            playerShots.splice(i, 1);

            if (inv.letterIndex === nextLetterIndex) {
              // Correct target letter shot!
              inv.alive = false;
              nextLetterIndex++;
              score += 20;
              updateHUD();

              playPickupSound();
              wordDisplay.renderWord(currentWord, nextLetterIndex, diffMenu.getDifficulty(), false);
              wordDisplay.bumpTarget();
              particleManager.addExplosion(inv.x, inv.y, '#2e9d3a', 14);
              floatLabel(`+20 ${inv.char}`, inv.x, inv.y - 12);

              // Target word finished!
              if (nextLetterIndex >= currentWord.length) {
                playWordSuccessSound();
                score += 50;
                currentWordIndex++;
                setTimeout(() => {
                  if (running) loadNextWord();
                }, 350);
              }
            } else {
              // Wrong letter shot!
              playDamageSound();
              screenHit();
              particleManager.addExplosion(inv.x, inv.y, '#d94a4a', 12);
              floatLabel('Mauvaise lettre !', inv.x, inv.y - 12, { error: true });
              lives--;
              updateHUD();
              if (lives <= 0) {
                handlePlayerHit();
                return;
              }
            }
            break;
          }
        }
      }

      // Alive invaders speed & descent
      const aliveInvaders = invaders.filter(inv => inv.alive);
      if (aliveInvaders.length > 0) {
        const speedBoost = 1 + (1 - aliveInvaders.length / invaders.length) * 1.5;
        const currentSpeed = cfg.enemySpeed * speedBoost * worldScale;

        let edgeReached = false;
        for (const inv of aliveInvaders) {
          inv.x += enemyDirection * currentSpeed * dt;
          if (inv.x <= inv.w / 2 + 15 || inv.x >= width - inv.w / 2 - 15) {
            edgeReached = true;
          }
        }

        if (edgeReached) {
          enemyDirection = -enemyDirection;
          for (const inv of aliveInvaders) {
            inv.y += cfg.descent * worldScale;
            if (inv.y + inv.h / 2 >= player.y - player.h / 2) {
              handlePlayerHit();
              break;
            }
          }
        }

        // Enemy shots
        enemyShotClock += dt;
        if (enemyShotClock >= 1 / cfg.shotRate) {
          enemyShotClock = 0;
          const shooters = aliveInvaders.filter(inv =>
            !aliveInvaders.some(other => other.col === inv.col && other.row > inv.row)
          );
          if (shooters.length) {
            const shooter = shooters[Math.floor(Math.random() * shooters.length)];
            enemyShots.push({ x: shooter.x, y: shooter.y + shooter.h / 2, vy: cfg.enemyShotSpeed * worldScale });
          }
        }
      }

      // Move enemy shots
      for (let i = enemyShots.length - 1; i >= 0; i--) {
        const es = enemyShots[i];
        es.y += es.vy * dt;
        if (es.y > height) { enemyShots.splice(i, 1); continue; }
        if (hitBunker(es, 5)) { enemyShots.splice(i, 1); continue; }

        // Hit player
        if (player.invulnerable <= 0 && Math.abs(es.x - player.x) <= player.w / 2 && Math.abs(es.y - player.y) <= player.h / 2) {
          enemyShots.splice(i, 1);
          handlePlayerHit();
        }
      }

      particleManager.update(dt);
    }

    // --- Render ---
    drawStarfield(ctx, stars, width, height, nowMs);
    drawShields(ctx, shields);

    // Draw Letter Invaders
    ctx.save();
    for (const inv of invaders) {
      if (!inv.alive) continue;
      const isTarget = inv.letterIndex === nextLetterIndex;

      // Alien container
      ctx.fillStyle = isTarget ? '#ffd77a' : '#ffffff';
      ctx.fillRect(inv.x - inv.w / 2, inv.y - inv.h / 2, inv.w, inv.h);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = isTarget ? 2.5 : 1.5;
      ctx.strokeRect(inv.x - inv.w / 2, inv.y - inv.h / 2, inv.w, inv.h);

      // Letter inside
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `900 ${Math.max(14, Math.floor(inv.h * 0.65))}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(inv.char, inv.x, inv.y + 1);
    }
    ctx.restore();

    // Draw Shots
    ctx.fillStyle = '#ffd77a';
    playerShots.forEach(s => ctx.fillRect(s.x - 2, s.y - 7, 4, 14));

    ctx.fillStyle = '#ff4b4b';
    enemyShots.forEach(es => ctx.fillRect(es.x - 2, es.y - 6, 4, 12));

    // Draw Player
    if (running) {
      if (player.invulnerable <= 0 || Math.floor(now * 10) % 2 === 0) {
        drawPlayerShip(ctx, player, playerShipImage, playerShipReady);
      }
    }

    particleManager.draw(ctx);
    requestAnimationFrame(update);
  }

  async function startNewGame(selectedDiff) {
    resize();
    diffMenu.setDifficulty(selectedDiff);

    score = 0;
    lives = MAX_LIVES;
    currentWordIndex = 0;
    gameStartTime = performance.now();
    running = true;
    pauseManager.setPaused(false);
    particleManager.clear();

    if (!words.length) {
      words = await loadWeekWords();
    }

    loadNextWord();
  }

  // --- Initial Startup ---
  (async () => {
    resize();
    words = await loadWeekWords();
    diffMenu.showMenu();
    requestAnimationFrame(update);
  })();
})();
