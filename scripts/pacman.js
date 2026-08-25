// scripts/pacman.js
// Classic Arcade Pac-Man with Ghost Jail/House System, Delta-Time Physics, 3 Balanced Speeds for Kids & Leaderboard

import { triggerEndGameSequence, showLeaderboardModal, getTopScores, getTopScoresAsync } from './leaderboard.js?v=2';
import { playClickSound, playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, floatLabel, screenHit } from './game-feedback.js';

(() => {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const scoreCounter = document.getElementById('score-counter');
  const livesCounter = document.getElementById('lives-counter');

  const diffMenuOverlay = document.getElementById('difficulty-menu-overlay');
  const diffButtons = document.querySelectorAll('.btn-diff');
  const btnChangeDifficulty = document.getElementById('btn-change-difficulty');
  const btnShowLeaderboard = document.getElementById('btn-show-leaderboard');
  const btnOpenFullLeaderboard = document.getElementById('btn-open-full-leaderboard');

  // --- Maze Map Layout (19 cols x 21 rows) ---
  // 1: Wall, 0: Dot, 2: Power Pellet, 3: Empty path, 4: Ghost Gate
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
    [1,2,0,1,0,1,1,1,0,3,0,1,1,1,0,1,0,2,1],
    [1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1],
    [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
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
    return d1 && d2 && d1.x + d2.x === 0 && d1.y + d2.y === 0;
  }

  // --- Sizing & Responsive Canvas ---
  let DPR = 1, width = 0, height = 0, tile = 24, offsetX = 0, offsetY = 0;

  function resizeCanvas() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;

    const topUI = 75;
    const bottomUI = 65;
    const availW = Math.max(200, width - 30);
    const availH = Math.max(200, height - topUI - bottomUI);

    tile = Math.floor(Math.min(availW / COLS, availH / ROWS));
    tile = Math.max(14, Math.min(48, tile));

    offsetX = Math.floor((width - COLS * tile) / 2);
    offsetY = Math.floor(topUI + (availH - ROWS * tile) / 2);

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function gridToScreen(x, y) {
    return { x: offsetX + (x + .5) * tile, y: offsetY + (y + .5) * tile };
  }

  window.addEventListener('resize', () => resizeCanvas());

  // --- Game State ---
  let map = [];
  let pacman;
  let ghosts = [];
  let score = 0;
  const MAX_LIVES = 3;
  let lives = MAX_LIVES;
  let dotsRemaining = 0;
  let gameRunning = false;
  let gamePaused = false;
  let difficulty = 0;

  let frightenedTimer = 0;
  let lastTimestamp = 0;

  // --- Speeds in TILES PER SECOND (Calibrated for 8-10yo kids) ---
  const DIFF_CONFIG = [
    { ghostCount: 2, pacSpeed: 2.8, ghostSpeed: 1.6, name: 'Facile' },
    { ghostCount: 3, pacSpeed: 3.5, ghostSpeed: 2.3, name: 'Moyen' },
    { ghostCount: 4, pacSpeed: 4.2, ghostSpeed: 3.2, name: 'Difficile' },
  ];

  function isTypingInInput() {
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
    if (document.querySelector('.leaderboard-overlay:not(.hidden)')) return true;
    if (diffMenuOverlay && !diffMenuOverlay.classList.contains('hidden')) return true;
    return false;
  }

  // --- Inputs ---
  let queuedDir = Dir.RIGHT;

  window.addEventListener('keydown', (e) => {
    if (isTypingInInput()) return;
    if (['ArrowUp', 'w', 'W', 'z', 'Z'].includes(e.key)) queuedDir = Dir.UP;
    if (['ArrowDown', 's', 'S'].includes(e.key)) queuedDir = Dir.DOWN;
    if (['ArrowLeft', 'a', 'A', 'q', 'Q'].includes(e.key)) queuedDir = Dir.LEFT;
    if (['ArrowRight', 'd', 'D'].includes(e.key)) queuedDir = Dir.RIGHT;
  });

  let touchStart = null;
  window.addEventListener('touchstart', (e) => {
    if (isTypingInInput() || !e.touches.length) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!touchStart || isTypingInInput()) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
    if (Math.abs(dx) > Math.abs(dy)) queuedDir = dx > 0 ? Dir.RIGHT : Dir.LEFT;
    else queuedDir = dy > 0 ? Dir.DOWN : Dir.UP;
  }, { passive: true });

  // --- Side Leaderboard preview & modal ---
  async function renderSideLeaderboard() {
    const tableBody = document.querySelector('#side-scores-body');
    if (!tableBody) return;

    const populate = (scores) => {
      if (!scores || scores.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="empty-side-msg">Aucun score cette semaine. Sois le 1er ! 🌟</td></tr>`;
        return;
      }

      tableBody.innerHTML = scores.slice(0, 5).map((item, idx) => {
        const rank = idx + 1;
        let rankDisplay = `#${rank}`;
        if (rank === 1) rankDisplay = '🥇';
        else if (rank === 2) rankDisplay = '🥈';
        else if (rank === 3) rankDisplay = '🥉';

        return `
          <tr>
            <td><span style="font-weight:800;">${rankDisplay}</span></td>
            <td>${escapeHTML(item.name)}</td>
            <td style="text-align:right;"><strong>${escapeHTML(item.scoreFormatted)}</strong></td>
          </tr>
        `;
      }).join('');
    };

    populate(getTopScores('pacman', 'week', false));
    const globalScores = await getTopScoresAsync('pacman', 'week', false);
    populate(globalScores);
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, match => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[match];
    });
  }

  function showDifficultyMenu() {
    gamePaused = true;
    renderSideLeaderboard();
    if (diffMenuOverlay) {
      diffMenuOverlay.style.display = 'flex';
      diffMenuOverlay.classList.remove('hidden');
    }
  }

  function hideDifficultyMenu() {
    if (diffMenuOverlay) {
      diffMenuOverlay.style.display = 'none';
      diffMenuOverlay.classList.add('hidden');
    }
  }

  function openLeaderboard() {
    const isDiffOpen = diffMenuOverlay && !diffMenuOverlay.classList.contains('hidden');
    const wasRunning = gameRunning && !gamePaused;
    if (wasRunning) gamePaused = true;
    hideDifficultyMenu();

    showLeaderboardModal({
      gameId: 'pacman',
      gameTitle: 'Pac-Man 🟡',
      currentScore: score,
      scoreFormatted: `${score} pts`,
      isLowerBetter: false,
      onClose: () => {
        if (isDiffOpen || !gameRunning) {
          showDifficultyMenu();
        } else if (wasRunning) {
          gamePaused = false;
          lastTimestamp = performance.now();
        }
      }
    });
  }

  btnShowLeaderboard?.addEventListener('click', openLeaderboard);
  btnOpenFullLeaderboard?.addEventListener('click', openLeaderboard);

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      difficulty = parseInt(btn.getAttribute('data-diff') || '0', 10);
      hideDifficultyMenu();
      startNewGame();
    });
  });

  btnChangeDifficulty?.addEventListener('click', () => {
    showDifficultyMenu();
  });

  diffMenuOverlay?.addEventListener('click', (e) => {
    if (e.target === diffMenuOverlay) {
      if (gameRunning) {
        hideDifficultyMenu();
        gamePaused = false;
        lastTimestamp = performance.now();
      } else {
        difficulty = 0;
        hideDifficultyMenu();
        startNewGame();
      }
    }
  });

  // --- Map Setup ---
  function resetMap() {
    dotsRemaining = 0;
    map = MAP_TEMPLATE.map(row => row.map(val => {
      if (val === 0 || val === 2) dotsRemaining++;
      return val;
    }));
  }

  // --- Ghosts AI Setup (with Jail / House System) ---
  function createGhosts() {
    const cfg = DIFF_CONFIG[difficulty] || DIFF_CONFIG[0];
    const allGhosts = [
      {
        id: 'blinky',
        color: '#ff3333',
        name: 'Blinky',
        x: 9,
        y: 8,
        startX: 9,
        startY: 8,
        dir: Dir.LEFT,
        speed: cfg.ghostSpeed,
        state: 'chase',
        jailTimer: 0,
        bobOffset: 0,
        lastTileX: -1,
        lastTileY: -1,
      },
      {
        id: 'pinky',
        color: '#ff99cc',
        name: 'Pinky',
        x: 9,
        y: 10,
        startX: 9,
        startY: 10,
        dir: Dir.UP,
        speed: cfg.ghostSpeed * 0.95,
        state: 'in_house',
        jailTimer: 2.0, // Exits jail after 2s
        bobOffset: 1.5,
        lastTileX: -1,
        lastTileY: -1,
      },
      {
        id: 'inky',
        color: '#33d6ff',
        name: 'Inky',
        x: 8,
        y: 10,
        startX: 8,
        startY: 10,
        dir: Dir.UP,
        speed: cfg.ghostSpeed * 0.90,
        state: 'in_house',
        jailTimer: 4.5, // Exits jail after 4.5s
        bobOffset: 3.0,
        lastTileX: -1,
        lastTileY: -1,
      },
      {
        id: 'clyde',
        color: '#ff9933',
        name: 'Clyde',
        x: 10,
        y: 10,
        startX: 10,
        startY: 10,
        dir: Dir.UP,
        speed: cfg.ghostSpeed * 0.85,
        state: 'in_house',
        jailTimer: 7.0, // Exits jail after 7s
        bobOffset: 4.5,
        lastTileX: -1,
        lastTileY: -1,
      },
    ];

    ghosts = allGhosts.slice(0, cfg.ghostCount);
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

  function sendGhostsFleeing() {
    for (const ghost of ghosts) {
      if (ghost.state !== 'chase' || !ghost.dir) continue;
      ghost.dir = { x: -ghost.dir.x, y: -ghost.dir.y };
      ghost.lastTileX = -1;
      ghost.lastTileY = -1;
    }
  }

  function isWall(c, r) {
    if (r === 10 && (c < 0 || c >= COLS)) return false; // Tunnel
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    const cell = map[r][c];
    return cell === 1 || cell === 4;
  }

  function updateGhost(g, dt) {
    const speed = (frightenedTimer > 0 && g.state === 'chase' ? g.speed * 0.55 : g.speed) * dt;

    // 1. Ghost inside jail: bob gently until jailTimer elapses
    if (g.state === 'in_house') {
      g.jailTimer = Math.max(0, g.jailTimer - dt);
      g.y = 10 + Math.sin(performance.now() * 0.005 + g.bobOffset) * 0.25;
      if (g.jailTimer <= 0) {
        g.state = 'exiting';
      }
      return;
    }

    // 2. Ghost exiting jail: move to center x=9, then up through gate (4) to corridor y=8
    if (g.state === 'exiting') {
      if (Math.abs(g.x - 9) > 0.04) {
        g.x += Math.sign(9 - g.x) * speed;
      } else {
        g.x = 9;
        g.y -= speed;
        if (g.y <= 8.0) {
          g.y = 8.0;
          g.state = 'chase';
          g.dir = Dir.LEFT;
          g.lastTileX = -1;
          g.lastTileY = -1;
        }
      }
      return;
    }

    // 3. Normal Maze Chase / Wander
    const curX = Math.round(g.x);
    const curY = Math.round(g.y);
    const moveDist = speed;

    const atCenter = (g.dir.x !== 0 && Math.abs(g.x - curX) <= moveDist * 1.5) ||
                     (g.dir.y !== 0 && Math.abs(g.y - curY) <= moveDist * 1.5) ||
                     (g.dir === Dir.NONE);

    if (atCenter && (g.lastTileX !== curX || g.lastTileY !== curY)) {
      g.x = curX;
      g.y = curY;
      g.lastTileX = curX;
      g.lastTileY = curY;

      const target = getGhostTarget(g);
      const possibleDirs = [Dir.UP, Dir.LEFT, Dir.DOWN, Dir.RIGHT].filter(d => {
        if (isOpposite(d, g.dir)) return false;
        return !isWall(curX + d.x, curY + d.y);
      });

      if (possibleDirs.length > 0) {
        if (frightenedTimer > 0) {
          possibleDirs.sort((a, b) => {
            const distA = Math.hypot((curX + a.x) - pacman.x, (curY + a.y) - pacman.y);
            const distB = Math.hypot((curX + b.x) - pacman.x, (curY + b.y) - pacman.y);
            return distB - distA;
          });
          g.dir = possibleDirs[0];
        } else {
          possibleDirs.sort((a, b) => {
            const distA = Math.hypot((curX + a.x) - target.x, (curY + a.y) - target.y);
            const distB = Math.hypot((curX + b.x) - target.x, (curY + b.y) - target.y);
            return distA - distB;
          });
          g.dir = possibleDirs[0];
        }
      } else {
        const reverse = [Dir.UP, Dir.LEFT, Dir.DOWN, Dir.RIGHT].filter(d => !isWall(curX + d.x, curY + d.y));
        if (reverse.length > 0) g.dir = reverse[0];
      }
    }

    if (g.dir.x > 0) {
      g.y = curY;
      if (isWall(curX + 1, curY)) {
        g.x = Math.min(curX, g.x + moveDist);
        g.lastTileX = -1;
      } else {
        g.x += moveDist;
      }
    } else if (g.dir.x < 0) {
      g.y = curY;
      if (isWall(curX - 1, curY)) {
        g.x = Math.max(curX, g.x - moveDist);
        g.lastTileX = -1;
      } else {
        g.x -= moveDist;
      }
    } else if (g.dir.y > 0) {
      g.x = curX;
      if (isWall(curX, curY + 1)) {
        g.y = Math.min(curY, g.y + moveDist);
        g.lastTileX = -1;
      } else {
        g.y += moveDist;
      }
    } else if (g.dir.y < 0) {
      g.x = curX;
      if (isWall(curX, curY - 1)) {
        g.y = Math.max(curY, g.y - moveDist);
        g.lastTileX = -1;
      } else {
        g.y -= moveDist;
      }
    }

    if (g.x < -0.5) g.x = COLS - 0.5;
    if (g.x > COLS - 0.5) g.x = -0.5;
  }

  function updatePacman(dt) {
    const curX = Math.round(pacman.x);
    const curY = Math.round(pacman.y);
    const moveDist = pacman.speed * dt;
    const turnMargin = Math.max(0.20, moveDist * 1.5);

    // 1. Instant 180 reverse
    if (queuedDir && isOpposite(pacman.dir, queuedDir)) {
      pacman.dir = queuedDir;
    }
    // 2. Corner turning
    else if (queuedDir && queuedDir !== pacman.dir) {
      if (pacman.dir.x !== 0 && queuedDir.y !== 0) {
        if (Math.abs(pacman.x - curX) <= turnMargin && !isWall(curX, curY + queuedDir.y)) {
          pacman.x = curX;
          pacman.dir = queuedDir;
        }
      } else if (pacman.dir.y !== 0 && queuedDir.x !== 0) {
        if (Math.abs(pacman.y - curY) <= turnMargin && !isWall(curX + queuedDir.x, curY)) {
          pacman.y = curY;
          pacman.dir = queuedDir;
        }
      } else if (pacman.dir === Dir.NONE) {
        if (!isWall(curX + queuedDir.x, curY + queuedDir.y)) {
          pacman.x = curX;
          pacman.y = curY;
          pacman.dir = queuedDir;
        }
      }
    }

    // 3. Forward Movement
    if (pacman.dir.x > 0) {
      pacman.y = curY;
      if (isWall(curX + 1, curY)) {
        pacman.x = Math.min(curX, pacman.x + moveDist);
      } else {
        pacman.x += moveDist;
      }
    } else if (pacman.dir.x < 0) {
      pacman.y = curY;
      if (isWall(curX - 1, curY)) {
        pacman.x = Math.max(curX, pacman.x - moveDist);
      } else {
        pacman.x -= moveDist;
      }
    } else if (pacman.dir.y > 0) {
      pacman.x = curX;
      if (isWall(curX, curY + 1)) {
        pacman.y = Math.min(curY, pacman.y + moveDist);
      } else {
        pacman.y += moveDist;
      }
    } else if (pacman.dir.y < 0) {
      pacman.x = curX;
      if (isWall(curX, curY - 1)) {
        pacman.y = Math.max(curY, pacman.y - moveDist);
      } else {
        pacman.y -= moveDist;
      }
    }

    // 4. Tunnel Wrap
    if (pacman.x < -0.5) pacman.x = COLS - 0.5;
    if (pacman.x > COLS - 0.5) pacman.x = -0.5;

    // 5. Check eating dots / power pellets
    const px = Math.round(pacman.x);
    const py = Math.round(pacman.y);
    if (Math.abs(pacman.x - px) < 0.38 && Math.abs(pacman.y - py) < 0.38) {
      if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
        const tileVal = map[py][px];
        if (tileVal === 0 || tileVal === 2) {
          if (tileVal === 2) {
            frightenedTimer = 8.0;
            sendGhostsFleeing();
            score += 50;
            playPickupSound();
            bump(scoreCounter);
            const point = gridToScreen(px, py);
            floatLabel('+50', point.x, point.y);
          } else {
            score += 10;
          }
          map[py][px] = 3;
          dotsRemaining--;
          updateHUD();

          if (dotsRemaining <= 0) {
            handleMazeClear();
          }
        }
      }
    }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.state !== 'chase') continue; // Ghosts in jail or exiting cannot hurt Pac-Man

      const dist = Math.hypot(g.x - pacman.x, g.y - pacman.y);
      if (dist < 0.65) {
        if (frightenedTimer > 0) {
          // Eat frightened ghost -> respawn back in jail with recovery timer
          g.x = g.startX;
          g.y = g.startY;
          g.state = 'in_house';
          g.jailTimer = 2.5;
          score += 200;
          playPickupSound();
          bump(scoreCounter);
          const point = gridToScreen(g.x, g.y);
          floatLabel('+200', point.x, point.y);
          updateHUD();
        } else {
          // Hurt by ghost
          lives--;
          playDamageSound();
          screenHit();
          updateHUD();
          if (livesCounter) {
            livesCounter.classList.remove('lives-lost');
            void livesCounter.offsetWidth;
            livesCounter.classList.add('lives-lost');
            livesCounter.addEventListener('animationend', () => livesCounter.classList.remove('lives-lost'), { once: true });
          }

          if (lives <= 0) {
            handleDeath();
          } else {
            // Reset Pac-man and ghosts
            pacman.x = 9;
            pacman.y = 16;
            pacman.dir = Dir.RIGHT;
            queuedDir = Dir.RIGHT;
            createGhosts();
            lastTimestamp = performance.now();
          }
          break;
        }
      }
    }
  }

  function updateHUD() {
    if (scoreCounter) scoreCounter.textContent = `Score : ${score}`;
    if (livesCounter) {
      livesCounter.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) =>
        `<span class="heart ${i < lives ? 'full' : 'empty'}">♥</span>`
      ).join('');
    }
  }

  function handleMazeClear() {
    score += 1000;
    playWordSuccessSound();
    resetMap();
    pacman.x = 9;
    pacman.y = 16;
    pacman.dir = Dir.RIGHT;
    queuedDir = Dir.RIGHT;
    createGhosts();
    updateHUD();
    lastTimestamp = performance.now();
  }

  function handleDeath() {
    gameRunning = false;
    gamePaused = false;

    triggerEndGameSequence({
      gameId: 'pacman',
      gameTitle: 'Pac-Man 🟡',
      currentScore: score,
      scoreFormatted: `${score} pts`,
      isLowerBetter: false,
      onClose: () => {
        showDifficultyMenu();
      }
    });
  }

  // --- Rendering ---
  function draw() {
    if (!map || map.length === 0) return;

    // Fill background
    ctx.fillStyle = '#fbffd8';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const gridW = COLS * tile;
    const gridH = ROWS * tile;

    // Draw Hard Drop Shadow for Maze
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(4, 4, gridW, gridH);

    // Inner Maze Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gridW, gridH);

    // Draw Map Walls & Dots
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = map[r][c];
        const px = c * tile;
        const py = r * tile;

        if (val === 1) {
          // Wall
          ctx.fillStyle = '#2e7d32';
          ctx.fillRect(px, py, tile, tile);
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
        } else if (val === 0) {
          // Normal Dot
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, Math.max(2.5, tile * 0.12), 0, Math.PI * 2);
          ctx.fill();
        } else if (val === 2) {
          // Power Pellet
          ctx.fillStyle = '#ffd77a';
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, tile * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (val === 4) {
          // Ghost Gate (Pink Jail Door)
          ctx.fillStyle = '#ff66b2';
          ctx.fillRect(px, py + tile * 0.42, tile, tile * 0.16);
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py + tile * 0.42, tile, tile * 0.16);
        }
      }
    }

    // Outer Border
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, gridW, gridH);

    // Draw Pac-Man
    if (pacman) {
      const pacPx = (pacman.x + 0.5) * tile;
      const pacPy = (pacman.y + 0.5) * tile;
      const r = tile * 0.42;
      const mouthAngle = (gameRunning && !gamePaused)
        ? Math.abs(Math.sin(performance.now() * 0.008)) * 0.35 * Math.PI
        : 0.1 * Math.PI;

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
    }

    // Draw Ghosts
    for (const g of ghosts) {
      const gPx = (g.x + 0.5) * tile;
      const gPy = (g.y + 0.5) * tile;
      const gr = tile * 0.42;

      ctx.save();
      ctx.translate(gPx, gPy);

      if (g.state === 'eaten') {
        // Only draw eyes returning to jail
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-gr * 0.35, -gr * 0.2, gr * 0.28, 0, Math.PI * 2);
        ctx.arc(gr * 0.35, -gr * 0.2, gr * 0.28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#002000';
        ctx.beginPath();
        ctx.arc(-gr * 0.35, -gr * 0.2, gr * 0.14, 0, Math.PI * 2);
        ctx.arc(gr * 0.35, -gr * 0.2, gr * 0.14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const isFlashing = frightenedTimer > 0 && frightenedTimer < 2.5 && (Math.floor(frightenedTimer * 4) % 2 === 0);
        const ghostColor = (frightenedTimer > 0 && g.state === 'chase') ? (isFlashing ? '#ffffff' : '#2b5cb8') : g.color;

        ctx.fillStyle = ghostColor;
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

        // Ghost Eyes
        if (frightenedTimer <= 0 || g.state !== 'chase') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-gr * 0.35, -gr * 0.2, gr * 0.28, 0, Math.PI * 2);
          ctx.arc(gr * 0.35, -gr * 0.2, gr * 0.28, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#002000';
          ctx.beginPath();
          ctx.arc(-gr * 0.35 + g.dir.x * 2.5, -gr * 0.2 + g.dir.y * 2.5, gr * 0.14, 0, Math.PI * 2);
          ctx.arc(gr * 0.35 + g.dir.x * 2.5, -gr * 0.2 + g.dir.y * 2.5, gr * 0.14, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Frightened Eyes / Face
          ctx.fillStyle = isFlashing ? '#ff3333' : '#ffd77a';
          ctx.beginPath();
          ctx.arc(-gr * 0.3, -gr * 0.2, gr * 0.12, 0, Math.PI * 2);
          ctx.arc(gr * 0.3, -gr * 0.2, gr * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    ctx.restore();
  }

  function loop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    if (frightenedTimer > 0) frightenedTimer = Math.max(0, frightenedTimer - dt);

    if (gameRunning && !gamePaused) {
      updatePacman(dt);
      for (const g of ghosts) updateGhost(g, dt);
      checkCollisions();
    }

    draw();
    requestAnimationFrame(loop);
  }

  function startNewGame() {
    resizeCanvas();
    resetMap();
    score = 0;
    lives = MAX_LIVES;
    frightenedTimer = 0;
    const cfg = DIFF_CONFIG[difficulty] || DIFF_CONFIG[0];
    pacman = { x: 9, y: 16, dir: Dir.RIGHT, speed: cfg.pacSpeed };
    queuedDir = Dir.RIGHT;
    createGhosts();
    updateHUD();
    gameRunning = true;
    gamePaused = false;
    lastTimestamp = performance.now();
  }

  // --- Init ---
  resizeCanvas();
  resetMap();
  pacman = { x: 9, y: 16, dir: Dir.RIGHT, speed: 2.8 };
  createGhosts();
  updateHUD();
  showDifficultyMenu();
  requestAnimationFrame(loop);
})();
