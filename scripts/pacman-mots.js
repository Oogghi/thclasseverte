// scripts/pacman-mots.js
// Pac-Man Mots: ONLY target word letters placed on maze, eat in exact order!

import { getBoxes } from './fetch_json.js';
import { showLeaderboardModal } from './leaderboard.js';

// --- Load words ---
let words = [];
async function loadWords() {
  try {
    const cases = parseInt(new URLSearchParams(window.location.search).get('cases') || '1', 10);
    const weekIndex = Math.floor((cases - 1) / 4) + 1;
    const boxes = await getBoxes(weekIndex);
    if (!boxes) throw new Error('Semaine introuvable');
    words = boxes.flatMap(b => b.words);
  } catch (err) {
    console.error('Erreur chargement mots:', err);
    words = ['MAISON', 'ARBRE', 'SOLEIL', 'ECOLE', 'JARDIN'];
  }
}

// ============================================================
// Game Logic
// ============================================================
(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const container = document.getElementById('board-container');
  const wordDisplay = document.getElementById('word-display');
  const wordsCounter = document.getElementById('words-counter');
  const livesCounter = document.getElementById('lives-counter');
  const gameOverPopup = document.getElementById('game-over-popup');
  const finalScoreEl = document.getElementById('final-score');
  const summaryEl = document.getElementById('game-summary');
  const restartBtn = document.getElementById('popup-restart');
  const btnLeaderboard = document.getElementById('btn-show-leaderboard');

  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownText = document.getElementById('countdown-text');
  const countdownNumber = document.getElementById('countdown-number');

  // --- Maze Map Layout (19 cols x 21 rows) ---
  // 1: Wall, 0: Path, 2: Power Pellet, 3: Empty path, 4: Ghost Gate
  const MAP_TEMPLATE = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
    [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
    [1,1,1,1,0,1,1,1,3,1,3,1,1,1,0,1,1,1,1],
    [3,3,3,1,0,1,3,3,3,3,3,3,3,1,0,1,3,3,3],
    [1,1,1,1,0,1,3,1,1,4,1,1,3,1,0,1,1,1,1],
    [3,3,3,3,0,3,3,1,3,3,3,1,3,3,0,3,3,3,3],
    [1,1,1,1,0,1,3,1,1,1,1,1,3,1,0,1,1,1,1],
    [3,3,3,1,0,1,3,3,3,3,3,3,3,1,0,1,3,3,3],
    [1,1,1,1,0,1,3,1,1,1,1,1,3,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
    [1,2,0,1,0,0,0,0,0,3,0,0,0,0,0,1,0,2,1],
    [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
    [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
    [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];

  const COLS = MAP_TEMPLATE[0].length;
  const ROWS = MAP_TEMPLATE.length;

  const Dir = {
    NONE:  { x:  0, y:  0 },
    UP:    { x:  0, y: -1 },
    DOWN:  { x:  0, y:  1 },
    LEFT:  { x: -1, y:  0 },
    RIGHT: { x:  1, y:  0 },
  };

  function isOpposite(d1, d2) {
    return d1.x + d2.x === 0 && d1.y + d2.y === 0;
  }

  // --- Sizing ---
  let DPR = 1, width = 0, height = 0, tile = 24, offsetX = 0, offsetY = 0;

  function resizeCanvas() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    width = container ? container.clientWidth : window.innerWidth;
    height = container ? container.clientHeight : window.innerHeight;

    tile = Math.floor(Math.min(width / COLS, height / ROWS));
    offsetX = Math.floor((width - COLS * tile) / 2);
    offsetY = Math.floor((height - ROWS * tile) / 2);

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  window.addEventListener('resize', () => resizeCanvas());

  // --- Game State ---
  let map = [];
  let pacman;
  let ghosts = [];
  let currentWordIndex = 0;
  let currentWord = '';
  let nextLetterIndex = 0;
  let score = 0;
  let lives = 3;
  let gameRunning = false;
  let gamePaused = false;
  let isCountingDown = false;
  let countdownInterval = null;

  let frightenedTimer = 0;
  let animFrame = 0;
  let wrongHitFlash = 0;

  function isTypingInInput() {
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
    if (document.querySelector('.leaderboard-overlay:not(.hidden)')) return true;
    return false;
  }

  // --- Keyboard & Touch Inputs ---
  let queuedDir = Dir.RIGHT;

  window.addEventListener('keydown', (e) => {
    if (isTypingInInput() || isCountingDown) return;
    if (['ArrowUp', 'w', 'W', 'z', 'Z'].includes(e.key)) queuedDir = Dir.UP;
    if (['ArrowDown', 's', 'S'].includes(e.key)) queuedDir = Dir.DOWN;
    if (['ArrowLeft', 'a', 'A', 'q', 'Q'].includes(e.key)) queuedDir = Dir.LEFT;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) queuedDir = Dir.RIGHT;
  });

  let touchStart = null;
  window.addEventListener('touchstart', (e) => {
    if (isTypingInInput() || isCountingDown || !e.touches.length) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!touchStart || isTypingInInput() || isCountingDown) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
    if (Math.abs(dx) > Math.abs(dy)) queuedDir = dx > 0 ? Dir.RIGHT : Dir.LEFT;
    else queuedDir = dy > 0 ? Dir.DOWN : Dir.UP;
  }, { passive: true });

  btnLeaderboard?.addEventListener('click', () => {
    showLeaderboardModal({
      gameId: 'pacman-mots',
      gameTitle: 'Pac-Man Mots 🟡',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots`,
      isLowerBetter: false,
    });
  });

  restartBtn?.addEventListener('click', () => {
    gameOverPopup?.classList.add('hidden');
    startNewGame();
  });

  // --- Place ONLY the target word's letters on open maze tiles ---
  function populateMazeLetters() {
    map = MAP_TEMPLATE.map(row => row.map(cell => ({ type: cell, letter: null })));

    if (!currentWord) return;
    const normalized = currentWord.toUpperCase();

    // Collect all open path nodes (type === 0), far enough from Pac-Man spawn (9, 16)
    const pathNodes = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (map[r][c].type === 0 && Math.hypot(c - 9, r - 16) > 2) {
          pathNodes.push({ r, c });
        }
      }
    }

    // Shuffle candidate path nodes
    for (let i = pathNodes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pathNodes[i], pathNodes[j]] = [pathNodes[j], pathNodes[i]];
    }

    // Pick positions with Manhattan distance >= 3 to avoid blocking corridors
    const chosenPositions = [];
    for (const node of pathNodes) {
      if (chosenPositions.length >= normalized.length) break;
      const isFarEnough = chosenPositions.every(
        p => (Math.abs(p.r - node.r) + Math.abs(p.c - node.c)) >= 3
      );
      if (isFarEnough) {
        chosenPositions.push(node);
      }
    }

    // Fallback if tight space
    if (chosenPositions.length < normalized.length) {
      for (const node of pathNodes) {
        if (chosenPositions.length >= normalized.length) break;
        if (!chosenPositions.includes(node)) chosenPositions.push(node);
      }
    }

    // Place ONLY target word letters onto chosen positions!
    for (let i = 0; i < normalized.length; i++) {
      if (i < chosenPositions.length) {
        const { r, c } = chosenPositions[i];
        map[r][c].letter = normalized[i];
      }
    }
  }

  // --- 4 Ghost AI System ---
  function createGhosts() {
    ghosts = [
      { id: 'blinky', color: '#ff3333', name: 'Blinky', x: 9, y: 8, dir: Dir.LEFT,  speed: 0.022, state: 'chase' },
      { id: 'pinky',  color: '#ff99cc', name: 'Pinky',  x: 10, y: 8, dir: Dir.RIGHT, speed: 0.022, state: 'chase' },
      { id: 'inky',   color: '#33ffff', name: 'Inky',   x: 8, y: 8, dir: Dir.LEFT,  speed: 0.018, state: 'chase' },
      { id: 'clyde',  color: '#ff9933', name: 'Clyde',  x: 11, y: 8, dir: Dir.RIGHT, speed: 0.018, state: 'chase' },
    ];
  }

  function getGhostTarget(ghost) {
    if (frightenedTimer > 0) {
      return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    }

    const pacX = Math.round(pacman.x);
    const pacY = Math.round(pacman.y);

    if (ghost.id === 'blinky') return { x: pacX, y: pacY };
    if (ghost.id === 'pinky')  return { x: pacX + pacman.dir.x * 4, y: pacY + pacman.dir.y * 4 };
    if (ghost.id === 'inky') {
      const blinky = ghosts.find(g => g.id === 'blinky') || ghost;
      const pivotX = pacX + pacman.dir.x * 2;
      const pivotY = pacY + pacman.dir.y * 2;
      return { x: pivotX * 2 - Math.round(blinky.x), y: pivotY * 2 - Math.round(blinky.y) };
    }
    if (ghost.id === 'clyde') {
      const dist = Math.hypot(pacX - ghost.x, pacY - ghost.y);
      return dist > 8 ? { x: pacX, y: pacY } : { x: 1, y: 19 };
    }

    return { x: pacX, y: pacY };
  }

  function canMoveInDir(x, y, d) {
    if (d === Dir.NONE) return false;
    const tx = Math.round(x + d.x * 0.55);
    const ty = Math.round(y + d.y * 0.55);
    if (ty < 0 || ty >= ROWS) return true;
    if (tx < 0 || tx >= COLS) return true;
    const cell = map[ty][tx];
    const type = (typeof cell === 'object' && cell !== null) ? cell.type : cell;
    return type !== 1 && type !== 4;
  }

  function updateGhost(g) {
    const curX = Math.round(g.x);
    const curY = Math.round(g.y);
    const distToCenter = Math.hypot(g.x - curX, g.y - curY);

    if ((g.lastX !== curX || g.lastY !== curY) && distToCenter <= g.speed) {
      g.x = curX;
      g.y = curY;
      g.lastX = curX;
      g.lastY = curY;

      const target = getGhostTarget(g);
      let possibleDirs = [Dir.UP, Dir.DOWN, Dir.LEFT, Dir.RIGHT].filter(d => {
        if (isOpposite(d, g.dir)) return false;
        return canMoveInDir(curX, curY, d);
      });

      if (possibleDirs.length === 0) {
        possibleDirs = [Dir.UP, Dir.DOWN, Dir.LEFT, Dir.RIGHT].filter(d => canMoveInDir(curX, curY, d));
      }

      if (possibleDirs.length > 0) {
        if (frightenedTimer > 0) {
          g.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
        } else {
          possibleDirs.sort((a, b) => {
            const distA = Math.hypot((curX + a.x) - target.x, (curY + a.y) - target.y);
            const distB = Math.hypot((curX + b.x) - target.x, (curY + b.y) - target.y);
            return distA - distB;
          });
          g.dir = possibleDirs[0];
        }
      }
    }

    if (canMoveInDir(g.x, g.y, g.dir)) {
      g.x += g.dir.x * g.speed;
      g.y += g.dir.y * g.speed;
    } else {
      g.x = curX;
      g.y = curY;
      g.lastX = -1; // Force recalculate next frame if stuck
      const openDirs = [Dir.UP, Dir.DOWN, Dir.LEFT, Dir.RIGHT].filter(d => canMoveInDir(curX, curY, d));
      if (openDirs.length > 0) {
        g.dir = openDirs[Math.floor(Math.random() * openDirs.length)];
      }
    }

    if (g.x < -0.5) g.x = COLS - 0.5;
    if (g.x > COLS - 0.5) g.x = -0.5;
  }

  function updatePacman() {
    const curX = Math.round(pacman.x);
    const curY = Math.round(pacman.y);
    const distToCenter = Math.hypot(pacman.x - curX, pacman.y - curY);

    // 1. Handle queued direction ONLY when player inputs a move
    if (queuedDir !== Dir.NONE) {
      if (isOpposite(pacman.dir, queuedDir)) {
        pacman.dir = queuedDir;
        queuedDir = Dir.NONE;
      } else if (distToCenter < 0.35) {
        if (canMoveInDir(curX, curY, queuedDir)) {
          pacman.x = curX;
          pacman.y = curY;
          pacman.dir = queuedDir;
          queuedDir = Dir.NONE;
        }
      }
    }

    // 2. Move along current direction
    if (canMoveInDir(pacman.x, pacman.y, pacman.dir)) {
      pacman.x += pacman.dir.x * pacman.speed;
      pacman.y += pacman.dir.y * pacman.speed;
    } else {
      // Hit a wall: stop cleanly at center of tile
      pacman.x = curX;
      pacman.y = curY;
    }

    // 3. Tunnel wrap-around
    if (pacman.x < -0.5) pacman.x = COLS - 0.5;
    if (pacman.x > COLS - 0.5) pacman.x = -0.5;

    // 4. Check eating letters / power pellets
    const px = Math.round(pacman.x);
    const py = Math.round(pacman.y);
    if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
      const cell = map[py][px];

      if (cell.type === 2) {
        // Power pellet
        frightenedTimer = 600;
        cell.type = 3;
      } else if (cell.type === 0 && cell.letter) {
        const eatenLetter = cell.letter;
        const expectedLetter = currentWord[nextLetterIndex]?.toUpperCase();

        if (eatenLetter === expectedLetter) {
          // CORRECT LETTER!
          cell.letter = null; // Remove letter from tile
          nextLetterIndex++;
          score++;
          updateWordDisplay();

          if (nextLetterIndex >= currentWord.length) {
            currentWordIndex++;
            updateHUD();
            startWord();
          }
        } else {
          // WRONG LETTER! Lose 1 Life!
          lives--;
          wrongHitFlash = 35;
          updateHUD();

          if (lives <= 0) {
            handleDeath();
          } else {
            // Respawn Pac-Man safely at center
            pacman.x = 9;
            pacman.y = 16;
            pacman.dir = Dir.RIGHT;
            queuedDir = Dir.RIGHT;
          }
        }
      }
    }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      const dist = Math.hypot(g.x - pacman.x, g.y - pacman.y);
      if (dist < 0.65) {
        if (frightenedTimer > 0) {
          g.x = 9;
          g.y = 8;
          score += 10;
        } else {
          // Ghost hit! Lose 1 Life
          lives--;
          wrongHitFlash = 35;
          updateHUD();
          if (lives <= 0) {
            handleDeath();
          } else {
            pacman.x = 9;
            pacman.y = 16;
            pacman.dir = Dir.RIGHT;
            queuedDir = Dir.RIGHT;
          }
        }
      }
    }
  }

  function updateWordDisplay() {
    if (!wordDisplay || !currentWord) return;
    const normalizedWord = currentWord.toUpperCase();
    let html = '';
    for (let i = 0; i < normalizedWord.length; i++) {
      const char = normalizedWord[i];
      const isCollected = i < nextLetterIndex;
      html += `<span class="letter-slot ${isCollected ? 'collected' : 'pending'}">${char}</span>`;
    }
    wordDisplay.innerHTML = html;
  }

  function updateHUD() {
    if (wordsCounter) wordsCounter.textContent = `Mots : ${Math.min(currentWordIndex, words.length)}/${words.length}`;
    if (livesCounter) {
      livesCounter.innerHTML = Array.from({ length: 3 }, (_, i) =>
        `<span class="heart ${i < lives ? 'full' : 'empty'}">♥</span>`
      ).join('');
    }
  }

  function runCountdown(word) {
    return new Promise((resolve) => {
      if (!countdownOverlay) { resolve(); return; }
      isCountingDown = true;
      countdownText.textContent = `Mange les lettres de : "${word.toUpperCase()}" dans le bon ordre !`;
      countdownNumber.textContent = '3';
      countdownOverlay.classList.remove('hidden');
      let n = 3;
      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        n--;
        if (n > 0) {
          countdownNumber.textContent = String(n);
        } else {
          clearInterval(countdownInterval);
          countdownInterval = null;
          isCountingDown = false;
          countdownOverlay.classList.add('hidden');
          resolve();
        }
      }, 1000);
    });
  }

  async function startWord() {
    if (currentWordIndex >= words.length) {
      handleVictory();
      return;
    }
    currentWord = words[currentWordIndex];
    nextLetterIndex = 0;
    populateMazeLetters();
    updateWordDisplay();
    updateHUD();
    gamePaused = true;
    await runCountdown(currentWord);
    gamePaused = false;
  }

  function handleDeath() {
    gameRunning = false;
    if (finalScoreEl) finalScoreEl.textContent = `🎉 Score : ${currentWordIndex} mots 🌟`;
    if (summaryEl) summaryEl.innerHTML = `Mots complétés : <strong>${currentWordIndex}</strong>`;
    gameOverPopup?.classList.remove('hidden');

    setTimeout(() => {
      showLeaderboardModal({
        gameId: 'pacman-mots',
        gameTitle: 'Pac-Man Mots 🟡',
        currentScore: currentWordIndex,
        scoreFormatted: `${currentWordIndex} mots`,
        isLowerBetter: false,
      });
    }, 400);
  }

  function handleVictory() {
    gameRunning = false;
    if (finalScoreEl) finalScoreEl.textContent = `🏆 Victoire Incroyable ! 🌟`;
    if (summaryEl) summaryEl.innerHTML = `Tu as complété les <strong>${words.length}</strong> mots de la semaine !`;
    gameOverPopup?.classList.remove('hidden');

    setTimeout(() => {
      showLeaderboardModal({
        gameId: 'pacman-mots',
        gameTitle: 'Pac-Man Mots 🟡',
        currentScore: currentWordIndex,
        scoreFormatted: `${currentWordIndex} mots`,
        isLowerBetter: false,
      });
    }, 400);
  }

  // --- Rendering ---
  function draw() {
    ctx.fillStyle = wrongHitFlash > 0 ? '#ffcdd2' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw Map Walls, Normal Dots & Target Word Letters
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = map[r][c];
        const px = c * tile;
        const py = r * tile;

        if (cell.type === 1) {
          // Wall
          ctx.fillStyle = '#2e7d32';
          ctx.fillRect(px, py, tile, tile);
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
        } else if (cell.type === 0) {
          if (cell.letter) {
            // Draw Target Word Letter Badge
            ctx.fillStyle = '#fff9e6';
            ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 2, py + 2, tile - 4, tile - 4);

            ctx.fillStyle = '#002000';
            ctx.font = `800 ${Math.floor(tile * 0.65)}px 'Outfit', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.letter, px + tile / 2, py + tile / 2 + 1);
          }
        } else if (cell.type === 2) {
          // Power Pellet
          ctx.fillStyle = '#ffd77a';
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (cell.type === 4) {
          // Gate
          ctx.fillStyle = '#ffb3ba';
          ctx.fillRect(px, py + tile * 0.4, tile, tile * 0.2);
        }
      }
    }

    // Draw Pac-Man
    const pacPx = (pacman.x + 0.5) * tile;
    const pacPy = (pacman.y + 0.5) * tile;
    const r = tile * 0.42;
    const mouthAngle = Math.abs(Math.sin(animFrame * 0.25)) * 0.35 * Math.PI;

    let rot = 0;
    if (pacman.dir === Dir.DOWN) rot = Math.PI * 0.5;
    if (pacman.dir === Dir.LEFT) rot = Math.PI;
    if (pacman.dir === Dir.UP) rot = Math.PI * 1.5;

    ctx.save();
    ctx.translate(pacPx, pacPy);
    ctx.rotate(rot);

    ctx.fillStyle = '#ffd77a';
    ctx.beginPath();
    ctx.arc(0, 0, r, mouthAngle, Math.PI * 2 - mouthAngle);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Draw Ghosts
    for (const g of ghosts) {
      const gPx = (g.x + 0.5) * tile;
      const gPy = (g.y + 0.5) * tile;
      const gr = tile * 0.42;

      ctx.save();
      ctx.translate(gPx, gPy);

      ctx.fillStyle = frightenedTimer > 0 ? '#3366cc' : g.color;
      ctx.beginPath();
      ctx.arc(0, -gr * 0.2, gr, Math.PI, 0, false);
      ctx.lineTo(gr, gr * 0.8);
      ctx.lineTo(gr * 0.5, gr * 0.4);
      ctx.lineTo(0, gr * 0.8);
      ctx.lineTo(-gr * 0.5, gr * 0.4);
      ctx.lineTo(-gr, gr * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-gr * 0.35, -gr * 0.2, gr * 0.3, 0, Math.PI * 2);
      ctx.arc(gr * 0.35, -gr * 0.2, gr * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = frightenedTimer > 0 ? '#ffffff' : '#002000';
      ctx.beginPath();
      ctx.arc(-gr * 0.35 + g.dir.x * 2, -gr * 0.2 + g.dir.y * 2, gr * 0.15, 0, Math.PI * 2);
      ctx.arc(gr * 0.35 + g.dir.x * 2, -gr * 0.2 + g.dir.y * 2, gr * 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }

  function loop() {
    animFrame++;
    if (frightenedTimer > 0) frightenedTimer--;
    if (wrongHitFlash > 0) wrongHitFlash--;

    if (gameRunning && !gamePaused && !isCountingDown) {
      updatePacman();
      for (const g of ghosts) updateGhost(g);
      checkCollisions();
    }

    draw();
    requestAnimationFrame(loop);
  }

  async function startNewGame() {
    resizeCanvas();
    currentWordIndex = 0;
    score = 0;
    lives = 3;
    frightenedTimer = 0;
    pacman = { x: 9, y: 16, dir: Dir.RIGHT, speed: 0.038 };
    queuedDir = Dir.RIGHT;
    createGhosts();
    gameRunning = true;
    await startWord();
  }

  // --- Init ---
  async function init() {
    await loadWords();
    resizeCanvas();
    startNewGame();
    requestAnimationFrame(loop);
  }

  init();
})();
