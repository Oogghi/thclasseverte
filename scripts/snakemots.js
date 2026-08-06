import { getBoxes } from './fetch_json.js';
import { triggerEndGameSequence, showLeaderboardModal, getTopScores, getTopScoresAsync } from './leaderboard.js?v=2';
import { playWordSuccessSound } from './sound.js';

// --- Load words ---
let words = [];
async function loadWords() {
  try {
    const cases     = parseInt(new URLSearchParams(window.location.search).get('cases') || '1');
    const weekIndex = Math.floor((cases - 1) / 4) + 1;
    const boxes     = await getBoxes(weekIndex);
    if (!boxes) throw new Error('Semaine introuvable');
    words = boxes.flatMap(b => b.words);
  } catch (err) {
    console.error('Erreur chargement:', err);
    alert('Préviens le maitre si tu vois ceci !');
    words = Array(16).fill('Erreur');
  }
}

// ============================================================
// Game (IIFE to keep all game state local)
// ============================================================
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

  const wordDisplay            = document.querySelector('#word-display');
  const wordsCounter           = document.querySelector('#words-counter');
  const livesCounter           = document.querySelector('#lives-counter');
  const countdownOverlay       = document.querySelector('#countdown-overlay');
  const countdownText          = document.querySelector('#countdown-text');
  const countdownNumber        = document.querySelector('#countdown-number');

  const diffMenuOverlay        = document.querySelector('#difficulty-menu-overlay');
  const diffButtons            = document.querySelectorAll('.btn-diff');
  const btnChangeDifficulty    = document.querySelector('#btn-change-difficulty');
  const btnOpenFullLeaderboard = document.querySelector('#btn-open-full-leaderboard');

  // --- Game state ---
  let snake;
  let prevCells = null;
  let letters   = [];
  let currentWordIndex = 0;
  let currentWord      = '';
  let nextLetterIndex  = 0;

  const BASE_SPEED = 5.5;
  let speedTilesPerSec = BASE_SPEED;
  let moveInterval     = 1 / BASE_SPEED;
  let lastMoveTime     = 0;
  let interpolation    = 0;
  const MAX_LIVES      = 3;
  let gameRunning      = false;
  let gamePaused       = false;
  let score            = 0;
  let lives            = MAX_LIVES;
  let highscore        = parseInt(localStorage.getItem('snake_highscore') || '0', 10);

  // --- CSS variables & URL params ---
  const rootStyle  = getComputedStyle(document.documentElement);
  const BG_COLOR   = rootStyle.getPropertyValue('--bg').trim()        || '#fbffd8';
  const GRID_COLOR = rootStyle.getPropertyValue('--grid-line').trim() || 'rgba(0,32,0,0.12)';

  const urlParams  = new URLSearchParams(window.location.search);
  let difficulte   = Math.max(0, Math.min(2, parseInt(urlParams.get('difficulte') || '0', 10)));

  // --- Countdown helpers ---
  let isCountingDown = false;
  let countdownInterval = null;

  function hideCountdown() {
    if (!countdownOverlay) return;
    countdownOverlay.style.display = 'none';
    countdownOverlay.classList.add('hidden');
    if (countdownText)   countdownText.textContent   = '';
    if (countdownNumber) countdownNumber.textContent = '';
  }

  function showCountdown() {
    if (!countdownOverlay) return;
    countdownOverlay.style.display = 'flex';
    countdownOverlay.classList.remove('hidden');
  }

  function runCountdown(word) {
    return new Promise((resolve) => {
      if (!countdownOverlay || !countdownNumber || !countdownText) { resolve(); return; }

      isCountingDown = true;
      const normalizedWord = word.toUpperCase();

      if (difficulte === 0 || difficulte === 1) {
        countdownText.textContent = `Tu dois reconstruire le mot : "${normalizedWord}"`;
      } else {
        countdownText.textContent = `Tu dois reconstruire un mot mystère (${normalizedWord.length} lettres) !`;
      }

      updateWordDisplay(true); // Preview mode during countdown

      countdownNumber.textContent = '5';
      showCountdown();
      let n = 5;

      if (countdownInterval) clearInterval(countdownInterval);
      countdownInterval = setInterval(() => {
        n--;
        if (n > 0) {
          countdownNumber.textContent = n;
        } else {
          clearInterval(countdownInterval);
          countdownInterval = null;
          isCountingDown = false;
          hideCountdown();
          updateWordDisplay(false); // Reveal/mask animation for game start
          resolve();
        }
      }, 1000);
    });
  }

  // --- Difficulty & Leaderboard UI ---
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

    populate(getTopScores('snakemots', 'week', false));
    const globalScores = await getTopScoresAsync('snakemots', 'week', false);
    populate(globalScores);
  }

  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, match => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[match];
    });
  }

  function showDifficultyMenu() {
    setPaused(true);
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
    const isDiffMenuOpen = diffMenuOverlay && !diffMenuOverlay.classList.contains('hidden');
    const wasRunning = gameRunning && !gamePaused;
    if (wasRunning) setPaused(true);
    hideDifficultyMenu();

    showLeaderboardModal({
      gameId: 'snakemots',
      gameTitle: 'Snake Mots 🐍',
      currentScore: currentWordIndex || 0,
      scoreFormatted: `${currentWordIndex || 0} mots`,
      isLowerBetter: false,
      onClose: () => {
        if (isDiffMenuOpen || !gameRunning) {
          showDifficultyMenu();
        } else if (wasRunning) {
          lastMoveTime = performance.now() / 1000;
          setPaused(false);
        }
      }
    });
  }

  document.getElementById('btn-show-leaderboard')?.addEventListener('click', openLeaderboard);
  btnOpenFullLeaderboard?.addEventListener('click', openLeaderboard);

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      difficulte = parseInt(btn.getAttribute('data-diff') || '0', 10);
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
        setPaused(false);
        lastMoveTime = performance.now() / 1000;
      } else {
        difficulte = 0;
        hideDifficultyMenu();
        startNewGame();
      }
    }
  });

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

  function isTypingInInput() {
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
    if (document.querySelector('.leaderboard-overlay:not(.hidden)')) return true;
    if (diffMenuOverlay && !diffMenuOverlay.classList.contains('hidden')) return true;
    return false;
  }

  // --- Input: keyboard ---
  let queuedDir = null;

  window.addEventListener('keydown', (e) => {
    if (isTypingInInput() || isCountingDown) return;
    if (e.key === 'Escape') { togglePause(); return; }
    if (['ArrowUp',    'w', 'W'].includes(e.key)) trySetDir(Dir.UP);
    if (['ArrowDown',  's', 'S'].includes(e.key)) trySetDir(Dir.DOWN);
    if (['ArrowLeft',  'a', 'A'].includes(e.key)) trySetDir(Dir.LEFT);
    if (['ArrowRight', 'd', 'D'].includes(e.key)) trySetDir(Dir.RIGHT);
  });

  function trySetDir(d) {
    if (!snake || isCountingDown) return;
    if (!snake.dir)               { snake.dir = d; return; }
    if (!isOpposite(snake.dir, d)) queuedDir = d;
  }

  // --- Input: touch ---
  let touchStart = null;
  window.addEventListener('touchstart', (e) => {
    if (!e.touches.length || isCountingDown) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!touchStart || isCountingDown) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) trySetDir(dx > 0 ? Dir.RIGHT : Dir.LEFT);
    else                              trySetDir(dy > 0 ? Dir.DOWN  : Dir.UP);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameRunning && !gamePaused && !isCountingDown) setPaused(true);
  });

  // --- Snake helpers ---
  function spawnSnake(keepLength = false) {
    const cx      = Math.floor(cols / 2);
    const cy      = Math.floor(rows / 2);
    const initLen = 5;
    const len     = (keepLength && snake?.lengthTiles) ? snake.lengthTiles : initLen;
    const cells   = Array.from({ length: initLen }, (_, i) => ({ x: cx - i, y: cy }));
    snake     = { cells, dir: Dir.RIGHT, lengthTiles: len };
    prevCells = cells.map(c => ({ ...c }));
    queuedDir = null;
  }

  function gridToPixel(cell) {
    return {
      px: offsetX + (cell.x + 0.5) * tile,
      py: offsetY + (cell.y + 0.5) * tile,
    };
  }

  function updateWordDisplay(isCountdown = false) {
    if (!wordDisplay || !currentWord) return;
    const normalizedWord = currentWord.toUpperCase();
    let html = '';

    for (let i = 0; i < normalizedWord.length; i++) {
      const char = normalizedWord[i];
      const isCollected = i < nextLetterIndex;

      let displayChar = char;
      let slotClass = 'letter-slot';

      if (difficulte === 0) {
        slotClass += isCollected ? ' collected' : ' pending';
      } else if (difficulte === 1) {
        if (isCountdown) {
          displayChar = char;
          slotClass += ' countdown-preview';
        } else {
          if (isCollected) {
            displayChar = char;
            slotClass += ' collected revealed';
          } else {
            displayChar = '_';
            slotClass += ' hidden-slot';
          }
        }
      } else if (difficulte === 2) {
        if (isCollected || nextLetterIndex >= currentWord.length) {
          displayChar = char;
          slotClass += ' collected revealed';
        } else {
          displayChar = '_';
          slotClass += ' hidden-slot mystery';
        }
      }

      html += `<span class="${slotClass}">${displayChar}</span>`;
    }

    wordDisplay.innerHTML = html;
  }

  function heartsHTML() {
    return Array.from({ length: MAX_LIVES }, (_, i) =>
      `<span class="heart ${i < lives ? 'full' : 'empty'}">♥</span>`
    ).join('');
  }

  function updateHUD() {
    if (wordsCounter) wordsCounter.textContent = `Mots : ${Math.min(currentWordIndex, words.length)}/${words.length}`;
    if (livesCounter) livesCounter.innerHTML = heartsHTML();
  }

  // --- Letter placement ---
  function placeLettersForCurrentWord() {
    letters = [];
    if (!currentWord) return;

    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    const headNext = { x: snake.cells[0].x + (snake.dir?.x ?? 1), y: snake.cells[0].y + (snake.dir?.y ?? 0) };
    if (headNext.x >= 0 && headNext.x < cols && headNext.y >= 0 && headNext.y < rows)
      occupied.add(`${headNext.x},${headNext.y}`);

    for (let i = 0; i < currentWord.length; i++) {
      let pos, tries = 0;
      do {
        pos = {
          x: Math.floor(Math.random() * (cols - 2)) + 1,
          y: Math.floor(Math.random() * (rows - 2)) + 1,
        };
        tries++;
      } while (occupied.has(`${pos.x},${pos.y}`) && tries < 2000);

      if (tries >= 2000) {
        let found = false;
        outer: for (let ry = 1; ry < rows - 1; ry++) {
          for (let rx = 1; rx < cols - 1; rx++) {
            if (!occupied.has(`${rx},${ry}`)) { pos = { x: rx, y: ry }; found = true; break outer; }
          }
        }
        if (!found) { console.warn('Board too full to place letter.'); break; }
      }

      occupied.add(`${pos.x},${pos.y}`);
      letters.push({ ...pos, char: currentWord[i].toUpperCase() });
    }

    updateWordDisplay();
  }

  // --- Word flow ---
  async function startWord() {
    if (currentWordIndex >= words.length) { handleVictory(); return; }

    currentWord      = words[currentWordIndex];
    nextLetterIndex  = 0;
    letters          = [];

    updateHUD();

    if (!snake?.cells) spawnSnake(false);

    placeLettersForCurrentWord();
    setPaused(true);
    await runCountdown(currentWord);

    speedTilesPerSec = BASE_SPEED;
    moveInterval     = 1 / speedTilesPerSec;

    spawnSnake(true);
    setPaused(false);
    lastMoveTime = performance.now() / 1000;
  }

  // --- Step ---
  function stepSnake() {
    if (queuedDir) {
      if (!isOpposite(snake.dir, queuedDir)) snake.dir = queuedDir;
      queuedDir = null;
    }

    const head = snake.cells[0];
    const nh   = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };

    prevCells     = snake.cells.map(c => ({ ...c }));
    interpolation = 0;

    if (nh.x < 0 || nh.x >= cols || nh.y < 0 || nh.y >= rows) return handleCollision();

    const occupied = new Set(snake.cells.map(c => `${c.x},${c.y}`));
    if (occupied.has(`${nh.x},${nh.y}`)) return handleCollision();

    snake.cells.unshift(nh);

    const letterIdx = letters.findIndex(l => l.x === nh.x && l.y === nh.y);
    if (letterIdx !== -1) {
      const letter   = letters[letterIdx];
      const expected = currentWord[nextLetterIndex].toUpperCase();
      if (letter.char === expected) {
        letters.splice(letterIdx, 1);
        nextLetterIndex++;
        score++;
        snake.lengthTiles++;

        updateWordDisplay(false);

        if (nextLetterIndex >= currentWord.length) {
          playWordSuccessSound();
          currentWordIndex++;
          updateHUD();
          spawnSnake(true);
          startWord();
        }
      } else {
        return handleCollision();
      }
    }

    while (snake.cells.length > snake.lengthTiles) snake.cells.pop();
    return true;
  }

  // --- Collision / death / victory ---
  function loseLife() {
    lives--;
    updateHUD();
    if (livesCounter) {
      livesCounter.classList.remove('lives-lost');
      void livesCounter.offsetWidth;
      livesCounter.classList.add('lives-lost');
      livesCounter.addEventListener('animationend', () => livesCounter.classList.remove('lives-lost'), { once: true });
    }
  }

  function handleCollision() {
    if (lives > 1) {
      nextLetterIndex = 0;
      loseLife();
      spawnSnake(true);
      setPaused(true);

      setTimeout(async () => {
        placeLettersForCurrentWord();
        await runCountdown(currentWord);
        updateWordDisplay(false);
        setPaused(false);
        lastMoveTime = performance.now() / 1000;
      }, 200);

      return false;
    }

    loseLife();
    return handleDeath();
  }

  function handleDeath() {
    gameRunning = false;
    gamePaused  = false;

    if (score > highscore) {
      highscore = score;
      try { localStorage.setItem('snake_highscore', String(highscore)); } catch (_) {}
    }

    triggerEndGameSequence({
      gameId: 'snakemots',
      gameTitle: 'Snake Mots 🐍',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots`,
      isLowerBetter: false,
      onClose: restartGame,
    });

    return false;
  }

  function handleVictory() {
    gameRunning = false;
    gamePaused  = false;

    triggerEndGameSequence({
      gameId: 'snakemots',
      gameTitle: 'Snake Mots 🐍',
      currentScore: currentWordIndex,
      scoreFormatted: `${currentWordIndex} mots`,
      isLowerBetter: false,
      onClose: restartGame,
    });
  }

  function restartGame() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    isCountingDown = false;
    hideCountdown();
    currentWordIndex = 0;
    score  = 0;
    lives  = MAX_LIVES;
    updateHUD();
    startNewGame();
  }

  function setPaused(p) { gamePaused = p; }
  function togglePause() {
    if (!gameRunning || isCountingDown) return;
    setPaused(!gamePaused);
    if (!gamePaused) lastMoveTime = performance.now() / 1000;
  }

  // --- Game loop ---
  function startNewGame() {
    resizeCanvas();
    currentWordIndex = 0;
    score            = 0;
    lives            = 3;
    speedTilesPerSec = BASE_SPEED;
    moveInterval     = 1 / BASE_SPEED;
    spawnSnake(false);
    updateHUD();
    gameRunning = true;
    gamePaused  = false;
    startWord();
    lastMoveTime = performance.now() / 1000;
  }

  function update(timeMs) {
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

  function drawLetters() {
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = `${tile * 0.7}px monospace`;
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

  function drawSnakeInterpolated() {
    if (!snake || snake.cells.length === 0) return;
    const t     = Math.max(0, Math.min(1, interpolation));
    const cells = snake.cells;

    const headTo   = gridToPixel(cells[0]);
    const headFrom = (prevCells && prevCells.length > 0) ? gridToPixel(prevCells[0]) : headTo;
    const headPt   = {
      px: headFrom.px + (headTo.px - headFrom.px) * t,
      py: headFrom.py + (headTo.py - headFrom.py) * t,
    };

    const tailCell   = cells[cells.length - 1];
    const tailCellPx = gridToPixel(tailCell);
    const isGrowing  = prevCells && prevCells.length < cells.length;

    let tailPt;
    if (isGrowing && cells.length >= 2) {
      const prev2Px = gridToPixel(cells[cells.length - 2]);
      const tdx     = (tailCellPx.px - prev2Px.px) / tile;
      const tdy     = (tailCellPx.py - prev2Px.py) / tile;
      const bounce  = Math.sin(Math.PI * t) * tile * 0.55;
      tailPt = {
        px: tailCellPx.px + tdx * bounce,
        py: tailCellPx.py + tdy * bounce,
      };
    } else {
      const prevTailSrc = (prevCells && prevCells.length > 0)
        ? prevCells[Math.min(prevCells.length - 1, cells.length - 1)]
        : tailCell;
      const tailFrom = gridToPixel(prevTailSrc);
      tailPt = {
        px: tailFrom.px + (tailCellPx.px - tailFrom.px) * t,
        py: tailFrom.py + (tailCellPx.py - tailFrom.py) * t,
      };
    }

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
    drawLetters();
    drawSnakeInterpolated();
  }

  // --- Init ---
  (async () => {
    resizeCanvas();
    drawGridBackground();
    await loadWords();
    hideCountdown();
    updateHUD();
    showDifficultyMenu();
    requestAnimationFrame(update);
  })();
})();
