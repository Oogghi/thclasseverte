// scripts/mots-meles.js
// Word Search (Mots-Mêlés) game for TH Classe Verte.
import { triggerEndGameSequence, showLeaderboardModal } from './leaderboard.js';
import { playWordSuccessSound } from './sound.js';
import { celebrateElement } from './game-feedback.js';
import { loadWeekWords, normalizeWord, shuffle } from './words-utils.js';

/* ---- DOM Elements ---- */
const gridEl     = document.getElementById('grid');
const secretSpan = document.getElementById('secret');
const wordListUl = document.getElementById('wordList');

/* ---- Constants ---- */
const GRID_SIZE  = 12;
const DIRECTIONS = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

/* ---- State ---- */
let tiles         = [];
let selectedWords = [];
let selection     = [];
let selecting     = false;
let selDirection  = null;
let startTime     = performance.now();
let errorCount    = 0;

function sanitizeId(str) {
  return normalizeWord(str).replace(/[^A-Z0-9]/g, '_');
}

/* ---- Grid Creation ---- */
function createGrid() {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  tiles = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      const tile = document.createElement('div');
      tile.className  = 'tile';
      tile.dataset.x  = String(x);
      tile.dataset.y  = String(y);
      gridEl.appendChild(tile);
      tiles.push(tile);
    }
  }
}

/* ---- Load Words ---- */
async function loadWords() {
  const rawWords = await loadWeekWords();
  selectedWords = rawWords
    .filter(w => w && w.length >= 3 && w.length <= GRID_SIZE)
    .slice(0, 10)
    .map(w => ({ original: w, normalized: normalizeWord(w) }));

  if (!selectedWords.length) {
    const fallback = ['Maison', 'Arbre', 'Soleil', 'Ecole', 'Jardin', 'Fleur', 'Oiseau', 'Nuage'];
    selectedWords = fallback.map(w => ({ original: w, normalized: normalizeWord(w) }));
  }
}

/* ---- Word Placement in Grid ---- */
function placeWords(words) {
  const validWords = words
    .map(w => w.normalized)
    .filter(w => w.length <= GRID_SIZE)
    .sort((a, b) => b.length - a.length);

  selectedWords = selectedWords.filter(w => w.normalized.length <= GRID_SIZE);
  const gridMatrix = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(''));

  function canFit(word, r, c, dr, dc) {
    for (let i = 0; i < word.length; i++) {
      const nr = r + dr * i;
      const nc = c + dc * i;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return false;
      if (gridMatrix[nr][nc] !== '' && gridMatrix[nr][nc] !== word[i]) return false;
    }
    return true;
  }

  function solve(wordIdx) {
    if (wordIdx >= validWords.length) return true;
    const word = validWords[wordIdx];

    const options = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        for (const [dr, dc] of DIRECTIONS) {
          if (canFit(word, r, c, dr, dc)) {
            options.push({ r, c, dr, dc });
          }
        }
      }
    }
    shuffle(options);

    for (const { r, c, dr, dc } of options) {
      const placedCoords = [];
      for (let i = 0; i < word.length; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (gridMatrix[nr][nc] === '') {
          gridMatrix[nr][nc] = word[i];
          placedCoords.push({ nr, nc });
        }
      }

      if (solve(wordIdx + 1)) return true;

      for (const { nr, nc } of placedCoords) {
        gridMatrix[nr][nc] = '';
      }
    }

    return false;
  }

  solve(0);

  tiles.forEach((t, idx) => {
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    const char = gridMatrix[r][c] || String.fromCharCode(65 + Math.floor(Math.random() * 26));
    t.textContent = char;
  });
}

/* ---- Word List Display ---- */
function showWordList(words) {
  if (!wordListUl) return;
  wordListUl.innerHTML = '';
  words.forEach(word => {
    const li = document.createElement('li');
    li.textContent = word.original;
    li.id          = 'word-' + sanitizeId(word.normalized);
    wordListUl.appendChild(li);
  });
}

/* ---- Selection Logic ---- */
function coordsOf(tile) {
  return [parseInt(tile.dataset.x, 10), parseInt(tile.dataset.y, 10)];
}

function isAdjacent(a, b) {
  const [ax, ay] = coordsOf(a);
  const [bx, by] = coordsOf(b);
  const dx = bx - ax, dy = by - ay;
  return Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0);
}

function directionBetween(t1, t2) {
  const [x1, y1] = coordsOf(t1);
  const [x2, y2] = coordsOf(t2);
  const dx = x2 - x1, dy = y2 - y1;
  return [dx === 0 ? 0 : dx / Math.abs(dx), dy === 0 ? 0 : dy / Math.abs(dy)];
}

function addSelection(tile) {
  if (selection.includes(tile)) {
    const first = selection[0];
    const last  = selection[selection.length - 1];
    if (tile === last) {
      last.classList.remove('selected');
      selection.pop();
    } else if (tile === first) {
      first.classList.remove('selected');
      selection.shift();
    }
    selDirection = selection.length >= 2 ? directionBetween(selection[0], selection[1]) : null;
    return;
  }

  if (selection.length === 0) {
    selection.push(tile);
    tile.classList.add('selected');
    selDirection = null;
    return;
  }

  if (selection.length === 1) {
    if (!isAdjacent(selection[0], tile)) return;
    selDirection = directionBetween(selection[0], tile);
    selection.push(tile);
    tile.classList.add('selected');
    return;
  }

  const first     = selection[0];
  const last      = selection[selection.length - 1];
  const [fx, fy]  = coordsOf(first);
  const [lx, ly]  = coordsOf(last);
  const [dx, dy]  = selDirection;
  const tx        = parseInt(tile.dataset.x, 10);
  const ty        = parseInt(tile.dataset.y, 10);

  if (tx === lx + dx && ty === ly + dy) {
    selection.push(tile);
    tile.classList.add('selected');
  } else if (tx === fx - dx && ty === fy - dy) {
    selection.unshift(tile);
    tile.classList.add('selected');
  }
}

function clearSelection() {
  selection.forEach(t => t.classList.remove('selected'));
  selection    = [];
  selDirection = null;
}

function validateSelection() {
  if (!selection.length) return;

  const mot = normalizeWord(selection.map(t => t.textContent).join(''));
  const rev = normalizeWord([...selection].reverse().map(t => t.textContent).join(''));
  const normalizedWords = selectedWords.map(w => w.normalized);

  if (normalizedWords.includes(mot) || normalizedWords.includes(rev)) {
    playWordSuccessSound();
    selection.forEach(t => {
      t.classList.remove('selected');
      t.classList.add('found');
    });
    const foundNorm = normalizedWords.includes(mot) ? mot : rev;
    const li = document.getElementById('word-' + sanitizeId(foundNorm));
    if (li) {
      li.classList.add('found');
      celebrateElement(li, 'Trouvé !');
    }
    checkWin();
  } else if (selection.length >= 3) {
    errorCount++;
  }

  clearSelection();
  selecting = false;
}

function checkWin() {
  const allFound = selectedWords.every(w => {
    const li = document.getElementById('word-' + sanitizeId(w.normalized));
    return li?.classList.contains('found');
  });

  if (allFound) {
    if (secretSpan) secretSpan.textContent = 'Bravo ! Tu as tout trouvé ! 🌟';
    const elapsedSec = Number(Math.max(0.5, (performance.now() - startTime) / 1000).toFixed(1));

    triggerEndGameSequence({
      gameId: 'mots-meles',
      gameTitle: 'Mots Mêlés 🧩',
      currentScore: elapsedSec,
      scoreFormatted: `${elapsedSec.toFixed(1)}s${errorCount > 0 ? ` (${errorCount} err)` : ' (0 faute)'}`,
      isLowerBetter: true,
      extraMetrics: {
        timeElapsed: elapsedSec,
        errors: errorCount,
      },
    });
  }
}

/* ---- Event Listeners ---- */
if (gridEl) {
  gridEl.addEventListener('mousedown', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    selecting = true;
    clearSelection();
    addSelection(tile);
  });

  gridEl.addEventListener('mouseover', e => {
    if (selecting) {
      const tile = e.target.closest('.tile');
      if (tile) addSelection(tile);
    }
  });

  // Touch support for tablet/mobile
  gridEl.addEventListener('touchstart', e => {
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const tile = target?.closest('.tile');
    if (tile) {
      selecting = true;
      clearSelection();
      addSelection(tile);
    }
  }, { passive: true });

  gridEl.addEventListener('touchmove', e => {
    if (!selecting) return;
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const tile = target?.closest('.tile');
    if (tile && !selection.includes(tile)) {
      addSelection(tile);
    }
  }, { passive: true });

  gridEl.addEventListener('touchend', () => {
    if (selecting) validateSelection();
  });
}

document.addEventListener('mouseup', () => {
  if (selecting) validateSelection();
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-show-leaderboard')?.addEventListener('click', () => {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    showLeaderboardModal({
      gameId: 'mots-meles',
      gameTitle: 'Mots Mêlés 🧩',
      currentScore: elapsedSec,
      scoreFormatted: `${elapsedSec} sec`,
      isLowerBetter: true,
    });
  });
});

/* ---- Initialization ---- */
async function init() {
  createGrid();
  await loadWords();
  if (selectedWords.length > 0) {
    placeWords(selectedWords);
    showWordList(selectedWords);
  }
  if (secretSpan) secretSpan.textContent = '';
  startTime = performance.now();
  errorCount = 0;
}

init();
