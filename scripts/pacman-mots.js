// scripts/pacman-mots.js
// Educational Pac-Man Mots: Unbreakable letter placement algorithm, Ghost Jail/House System, Delta-time physics, 4 Power Pellets, 3 Difficulties & Leaderboard

import { getBoxes } from './fetch_json.js';
import { triggerEndGameSequence, showLeaderboardModal, getTopScores, getTopScoresAsync } from './leaderboard.js?v=2';
import { playDamageSound, playPickupSound, playWordSuccessSound } from './sound.js';
import { bump, floatLabel, screenHit } from './game-feedback.js';

// --- Load Words from Database ---
let words = [];
async function loadWords() {
  try {
    const cases = parseInt(new URLSearchParams(window.location.search).get('cases') || '1', 10);
    const weekIndex = Math.floor((cases - 1) / 4) + 1;
    const boxes = await getBoxes(weekIndex);
    if (!boxes) throw new Error('Semaine introuvable');
    words = boxes.flatMap(b => b.words);
    if (!words || words.length === 0) throw new Error('Aucun mot dans la semaine');
  } catch (err) {
    console.error('Erreur chargement mots:', err);
    words = ['MAISON', 'ARBRE', 'SOLEIL', 'ECOLE', 'JARDIN', 'FLEUR', 'OISEAU', 'NUAGE'];
  }
}

// ============================================================
// Game Logic
// ============================================================
(() => {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.querySelector('#game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const wordDisplay = document.getElementById('word-display');
  const wordsCounter = document.getElementById('words-counter');
  const livesCounter = document.getElementById('lives-counter');

  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownText = document.getElementById('countdown-text');
  const countdownNumber = document.getElementById('countdown-number');

  const diffMenuOverlay = document.getElementById('difficulty-menu-overlay');
  const diffButtons = document.querySelectorAll('.btn-diff');
  const btnChangeDifficulty = document.getElementById('btn-change-difficulty');
  const btnShowLeaderboard = document.getElementById('btn-show-leaderboard');
  const btnOpenFullLeaderboard = document.getElementById('btn-open-full-leaderboard');

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

    const topUI = 95;
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
  let currentWordIndex = 0;
  let currentWord = '';
  let nextLetterIndex = 0;
  let letterPositions = [];
  const MAX_LIVES = 3;
  let lives = MAX_LIVES;
  let gameRunning = false;
  let gamePaused = false;
  let isCountingDown = false;
  let countdownInterval = null;

  const urlParams = new URLSearchParams(window.location.search);
  let difficulty = Math.max(0, Math.min(2, parseInt(urlParams.get('difficulte') || '0', 10)));

  let frightenedTimer = 0;
  let wrongHitFlash = 0;
  let lastTimestamp = 0;

  // --- Speeds in TILES PER SECOND (Calm for 8-10yo kids) ---
  const DIFF_CONFIG = [
    { ghostCount: 2, pacSpeed: 2.8, ghostSpeed: 1.4, name: 'Facile' },
    { ghostCount: 3, pacSpeed: 3.4, ghostSpeed: 2.1, name: 'Moyen' },
    { ghostCount: 4, pacSpeed: 4.0, ghostSpeed: 3.0, name: 'Difficile' },
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

  // --- Side Leaderboard Preview & Modal ---
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

    populate(getTopScores('pacman-mots', 'week', false));
    const globalScores = await getTopScoresAsync('pacman-mots', 'week', false);
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
      gameId: 'pacman-mots',
      gameTitle: 'Pac-Man Mots 👻',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots`,
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

  // ============================================================
  // UNBREAKABLE LETTER PLACEMENT ALGORITHM WITH BFS REACHABILITY
  // ============================================================

  function isWalkable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    const val = MAP_TEMPLATE[r][c];
    return val !== 1 && val !== 4;
  }

  function getWalkableNeighbors(r, c) {
    const n = [];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (isWalkable(nr, nc)) {
        n.push({ r: nr, c: nc });
      }
    }
    return n;
  }

  function getShortestPathDistance(r1, c1, r2, c2, blockedSet = new Set()) {
    if (r1 === r2 && c1 === c2) return 0;
    const queue = [{ r: r1, c: c1, dist: 0 }];
    const visited = new Set([`${r1},${c1}`]);

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.r === r2 && cur.c === c2) return cur.dist;

      for (const nb of getWalkableNeighbors(cur.r, cur.c)) {
        const key = `${nb.r},${nb.c}`;
        if (!visited.has(key) && (!blockedSet.has(key) || (nb.r === r2 && nb.c === c2))) {
          visited.add(key);
          queue.push({ r: nb.r, c: nb.c, dist: cur.dist + 1 });
        }
      }
    }
    return -1;
  }

  function validateLetterSequence(startPos, positions) {
    for (let i = 0; i < positions.length; i++) {
      const from = i === 0 ? startPos : positions[i - 1];
      const target = positions[i];

      const futureBlocked = new Set();
      for (let j = i + 1; j < positions.length; j++) {
        futureBlocked.add(`${positions[j].r},${positions[j].c}`);
      }

      const dist = getShortestPathDistance(from.r, from.c, target.r, target.c, futureBlocked);
      if (dist === -1) {
        return false;
      }
    }
    return true;
  }

  function generateRobustLetterPositions(wordLen) {
    const candidates = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (MAP_TEMPLATE[r][c] === 0 && Math.hypot(c - 9, r - 16) >= 2.5) {
          candidates.push({ r, c });
        }
      }
    }

    const startPos = { r: 16, c: 9 };

    for (let attempt = 0; attempt < 500; attempt++) {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      const selected = [];
      for (const node of candidates) {
        if (selected.length >= wordLen) break;

        const isFarEnough = selected.every(
          p => (Math.abs(p.r - node.r) + Math.abs(p.c - node.c)) >= 4
        );

        if (isFarEnough) {
          selected.push(node);
        }
      }

      if (selected.length === wordLen && validateLetterSequence(startPos, selected)) {
        return selected;
      }
    }

    const fallbackQueue = [{ r: 16, c: 9 }];
    const visited = new Set(['16,9']);
    const waveNodes = [];

    while (fallbackQueue.length > 0) {
      const cur = fallbackQueue.shift();
      if (MAP_TEMPLATE[cur.r][cur.c] === 0 && Math.hypot(cur.c - 9, cur.r - 16) >= 2.5) {
        waveNodes.push(cur);
      }
      for (const nb of getWalkableNeighbors(cur.r, cur.c)) {
        const key = `${nb.r},${nb.c}`;
        if (!visited.has(key)) {
          visited.add(key);
          fallbackQueue.push(nb);
        }
      }
    }

    const step = Math.max(1, Math.floor(waveNodes.length / wordLen));
    const fallbackSelected = [];
    for (let i = 0; i < wordLen; i++) {
      fallbackSelected.push(waveNodes[(i * step) % waveNodes.length]);
    }
    return fallbackSelected;
  }

  function populateMazeLetters() {
    map = MAP_TEMPLATE.map(row => row.map(cell => ({
      type: cell,
      letter: null,
      letterIndex: -1,
    })));

    if (!currentWord) return;
    const normalized = currentWord.toUpperCase();

    const chosenPositions = generateRobustLetterPositions(normalized.length);
    letterPositions = [];

    for (let i = 0; i < normalized.length; i++) {
      if (i < chosenPositions.length) {
        const { r, c } = chosenPositions[i];
        map[r][c].letter = normalized[i];
        map[r][c].letterIndex = i;
        letterPositions.push({ r, c, char: normalized[i], index: i });
      }
    }
  }

  // --- Ghosts AI Setup (with Ghost Jail / House System) ---
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
        jailTimer: 2.0,
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
        jailTimer: 4.5,
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
        jailTimer: 7.0,
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

  function isWall(c, r) {
    if (r === 10 && (c < 0 || c >= COLS)) return false; // Tunnel
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    const cell = map[r][c];
    const type = (typeof cell === 'object' && cell !== null) ? cell.type : cell;
    return type === 1 || type === 4;
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
          g.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
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

    // 5. Check eating letters or power pellets
    const px = Math.round(pacman.x);
    const py = Math.round(pacman.y);
    if (Math.abs(pacman.x - px) < 0.38 && Math.abs(pacman.y - py) < 0.38) {
      if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
        const cell = map[py][px];

        if (cell.type === 2) {
          // Power Pellet
          frightenedTimer = 8.0;
          cell.type = 3;
        } else if (cell.letter) {
          const eatenLetter = cell.letter;
          const expectedLetter = currentWord[nextLetterIndex]?.toUpperCase();

          if (eatenLetter === expectedLetter) {
            // CORRECT LETTER!
            cell.letter = null;
            nextLetterIndex++;
            playPickupSound();
            bump(wordDisplay);
            const point = gridToScreen(px, py);
            floatLabel(eatenLetter, point.x, point.y);
            updateWordDisplay(false);

            if (nextLetterIndex >= currentWord.length) {
              playWordSuccessSound();
              currentWordIndex++;
              updateHUD();
              startWord();
            }
          } else {
            // WRONG LETTER!
            handleLifeLoss();
          }
        }
      }
    }
  }

  function handleLifeLoss() {
    lives--;
    playDamageSound();
    screenHit();
    wrongHitFlash = 25;
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
      nextLetterIndex = 0;
      populateMazeLetters();
      updateWordDisplay(false);

      pacman.x = 9;
      pacman.y = 16;
      pacman.dir = Dir.RIGHT;
      queuedDir = Dir.RIGHT;

      createGhosts();
      lastTimestamp = performance.now();
    }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.state !== 'chase') continue; // In jail or exiting: safe!

      const dist = Math.hypot(g.x - pacman.x, g.y - pacman.y);
      if (dist < 0.65) {
        if (frightenedTimer > 0) {
          // Eat frightened ghost -> respawn back in jail with recovery timer
          g.x = g.startX;
          g.y = g.startY;
          g.state = 'in_house';
          g.jailTimer = 2.5;
        } else {
          // Hit by ghost
          handleLifeLoss();
          break;
        }
      }
    }
  }

  // --- Word Banner Display ---
  function updateWordDisplay(isCountdown = false) {
    if (!wordDisplay || !currentWord) return;
    const normalizedWord = currentWord.toUpperCase();
    let html = '';

    for (let i = 0; i < normalizedWord.length; i++) {
      const char = normalizedWord[i];
      const isCollected = i < nextLetterIndex;

      let displayChar = char;
      let slotClass = 'letter-slot';

      if (difficulty === 0) {
        // Facile: Always visible
        slotClass += isCollected ? ' collected' : ' pending';
      } else if (difficulty === 1) {
        // Moyen: Preview 5s then hidden
        if (isCountdown) {
          displayChar = char;
          slotClass += ' countdown-preview';
        } else {
          if (isCollected) {
            displayChar = char;
            slotClass += ' collected';
          } else {
            displayChar = '_';
            slotClass += ' hidden-slot';
          }
        }
      } else if (difficulty === 2) {
        // Difficile: Mystery word
        if (isCollected) {
          displayChar = char;
          slotClass += ' collected';
        } else {
          displayChar = '_';
          slotClass += ' hidden-slot mystery';
        }
      }

      html += `<span class="${slotClass}">${displayChar}</span>`;
    }

    wordDisplay.innerHTML = html;
  }

  function updateHUD() {
    if (wordsCounter) wordsCounter.textContent = `Mots : ${Math.min(currentWordIndex, words.length)}/${words.length}`;
    if (livesCounter) {
      livesCounter.innerHTML = Array.from({ length: MAX_LIVES }, (_, i) =>
        `<span class="heart ${i < lives ? 'full' : 'empty'}">♥</span>`
      ).join('');
    }
  }

  function runCountdown(word) {
    return new Promise((resolve) => {
      if (!countdownOverlay) { resolve(); return; }
      isCountingDown = true;
      const normalized = word.toUpperCase();

      if (difficulty === 0 || difficulty === 1) {
        countdownText.textContent = `Tu dois reconstruire le mot : "${normalized}"`;
      } else {
        countdownText.textContent = `Tu dois reconstruire un mot mystère (${normalized.length} lettres) !`;
      }

      updateWordDisplay(true);

      countdownNumber.textContent = '5';
      countdownOverlay.classList.remove('hidden');
      let n = 5;

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
          updateWordDisplay(false);
          lastTimestamp = performance.now();
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
    updateHUD();

    pacman.x = 9;
    pacman.y = 16;
    pacman.dir = Dir.RIGHT;
    queuedDir = Dir.RIGHT;

    createGhosts();

    gamePaused = true;
    await runCountdown(currentWord);
    gamePaused = false;
    lastTimestamp = performance.now();
  }

  function handleDeath() {
    gameRunning = false;
    gamePaused = false;

    triggerEndGameSequence({
      gameId: 'pacman-mots',
      gameTitle: 'Pac-Man Mots 👻',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots`,
      isLowerBetter: false,
      onClose: () => {
        showDifficultyMenu();
      }
    });
  }

  function handleVictory() {
    gameRunning = false;
    gamePaused = false;

    triggerEndGameSequence({
      gameId: 'pacman-mots',
      gameTitle: 'Pac-Man Mots 👻',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots`,
      isLowerBetter: false,
      onClose: () => {
        showDifficultyMenu();
      }
    });
  }

  // --- Rendering ---
  function draw() {
    if (!map || map.length === 0) return;

    ctx.fillStyle = wrongHitFlash > 0 ? '#ffcdd2' : '#fbffd8';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const gridW = COLS * tile;
    const gridH = ROWS * tile;

    // Hard Drop Shadow
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(4, 4, gridW, gridH);

    // Inner Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gridW, gridH);

    // Draw Map Walls, Power Pellets & Target Word Letters
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
        } else if (cell.type === 2) {
          // Power Pellet
          ctx.fillStyle = '#ffd77a';
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, tile * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (cell.type === 4) {
          // Ghost Gate (Pink Jail Door)
          ctx.fillStyle = '#ff66b2';
          ctx.fillRect(px, py + tile * 0.42, tile, tile * 0.16);
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py + tile * 0.42, tile, tile * 0.16);
        }

        // Target Word Letter Badge
        if (cell.letter) {
          ctx.fillStyle = '#fff9e6';
          ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, tile - 4, tile - 4);

          ctx.fillStyle = '#002000';
          ctx.font = `800 ${Math.floor(tile * 0.65)}px 'Outfit', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.letter, px + tile / 2, py + tile / 2 + 1);
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
      const mouthAngle = (gameRunning && !gamePaused && !isCountingDown)
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
    if (wrongHitFlash > 0) wrongHitFlash--;

    if (gameRunning && !gamePaused && !isCountingDown) {
      updatePacman(dt);
      for (const g of ghosts) updateGhost(g, dt);
      checkCollisions();
    }

    draw();
    requestAnimationFrame(loop);
  }

  async function startNewGame() {
    resizeCanvas();
    currentWordIndex = 0;
    lives = MAX_LIVES;
    frightenedTimer = 0;
    const cfg = DIFF_CONFIG[difficulty] || DIFF_CONFIG[0];
    pacman = { x: 9, y: 16, dir: Dir.RIGHT, speed: cfg.pacSpeed };
    queuedDir = Dir.RIGHT;
    createGhosts();
    gameRunning = true;
    await startWord();
  }

  // --- Initialization ---
  async function init() {
    await loadWords();
    resizeCanvas();
    map = MAP_TEMPLATE.map(row => row.map(cell => ({ type: cell, letter: null, letterIndex: -1 })));
    pacman = { x: 9, y: 16, dir: Dir.RIGHT, speed: 2.8 };
    createGhosts();
    updateHUD();
    showDifficultyMenu();
    requestAnimationFrame(loop);
  }

  init();
})();
