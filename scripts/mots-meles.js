import { getBoxes } from './fetch_json.js';

/* ---- DOM ---- */
const gridEl     = document.getElementById("grid");
const secretSpan = document.getElementById("secret");

/* ---- Grid constants ---- */
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

/* ---- Helpers ---- */
function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases  = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1;
}

function normalizeWord(word) {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

function sanitizeId(str) {
  return normalizeWord(str).replace(/[^A-Z0-9]/g, "_");
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ---- Grid creation ---- */
function createGrid() {
  gridEl.innerHTML = "";
  tiles = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      const tile = document.createElement("div");
      tile.className  = "tile";
      tile.dataset.x  = x;
      tile.dataset.y  = y;
      gridEl.appendChild(tile);
      tiles.push(tile);
    }
  }
}

/* ---- Load words ---- */
async function loadWords() {
  try {
    const boxes = await getBoxes(getWeekPositionFromURL());
    if (!boxes) throw new Error('No week found');

    const words = boxes.flatMap(box => box.words);
    shuffleArray(words);

    selectedWords = words
      .slice(0, Math.min(10, words.length))
      .map(w => ({ original: w, normalized: normalizeWord(w) }));
  } catch (e) {
    console.error("Erreur chargement:", e);
    alert("Préviens le maitre si tu vois ceci !");
    const fallback = ["Erreur", "Chien", "Maison", "Fleur", "Soleil",
                      "Arbre", "Oiseau", "Nuage", "Riviere", "Montagne"];
    selectedWords = fallback.map(w => ({ original: w, normalized: normalizeWord(w) }));
  }
}

/* ---- Word placement in grid ---- */
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
    shuffleArray(options);

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

  const success = solve(0);
  if (!success) {
    console.warn("Retrying placement with subset...");
  }

  tiles.forEach((t, idx) => {
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    const char = gridMatrix[r][c] || String.fromCharCode(65 + Math.floor(Math.random() * 26));
    t.textContent = char;
  });
}

/* ---- Word list display ---- */
function showWordList(words) {
  const ul = document.getElementById("wordList");
  ul.innerHTML = "";
  words.forEach(word => {
    const li = document.createElement("li");
    li.textContent = word.original;
    li.id          = "word-" + sanitizeId(word.normalized);
    ul.appendChild(li);
  });
}

/* ---- Selection logic ---- */
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
  // Clicking an already-selected tile removes it from the end or start
  if (selection.includes(tile)) {
    const first = selection[0];
    const last  = selection[selection.length - 1];
    if (tile === last) {
      last.classList.remove("selected");
      selection.pop();
    } else if (tile === first) {
      first.classList.remove("selected");
      selection.shift();
    }
    selDirection = selection.length >= 2 ? directionBetween(selection[0], selection[1]) : null;
    return;
  }

  if (selection.length === 0) {
    selection.push(tile);
    tile.classList.add("selected");
    selDirection = null;
    return;
  }

  if (selection.length === 1) {
    if (!isAdjacent(selection[0], tile)) return;
    selDirection = directionBetween(selection[0], tile);
    selection.push(tile);
    tile.classList.add("selected");
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
    tile.classList.add("selected");
  } else if (tx === fx - dx && ty === fy - dy) {
    selection.unshift(tile);
    tile.classList.add("selected");
  }
}

function clearSelection() {
  selection.forEach(t => t.classList.remove("selected"));
  selection    = [];
  selDirection = null;
}

function validateSelection() {
  if (!selection.length) return;

  const mot = normalizeWord(selection.map(t => t.textContent).join(""));
  const rev = normalizeWord([...selection].reverse().map(t => t.textContent).join(""));
  const normalizedWords = selectedWords.map(w => w.normalized);

  if (normalizedWords.includes(mot) || normalizedWords.includes(rev)) {
    selection.forEach(t => { t.classList.remove("selected"); t.classList.add("found"); });
    const foundNorm = normalizedWords.includes(mot) ? mot : rev;
    const li = document.getElementById("word-" + sanitizeId(foundNorm));
    if (li) li.classList.add("found");
    checkWin();
  }

  clearSelection();
  selecting = false;
}

import { showLeaderboardModal } from './leaderboard.js';

let startTime = Date.now();

/* ---- Win check ---- */
function checkWin() {
  const allFound = selectedWords.every(w => {
    const li = document.getElementById("word-" + sanitizeId(w.normalized));
    return li?.classList.contains("found");
  });
  if (allFound) {
    secretSpan.textContent = "Bravo !";
    showGameOverPopup();
  }
}

/* ---- Score & popup ---- */
function calculateScore() {
  return selectedWords.reduce((total, w) => {
    const li = document.getElementById("word-" + sanitizeId(w.normalized));
    return total + (li?.classList.contains("found") ? w.normalized.length : 0);
  }, 0);
}

function showGameOverPopup() {
  const popup       = document.getElementById("game-over-popup");
  const finalScore  = document.getElementById("final-score");
  const finalDetails = document.getElementById("final-details");

  const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));

  finalScore.textContent   = `🎉 Bravo ! Mots trouvés ! 🌟`;
  finalDetails.textContent = `Temps : ${elapsedSec} secondes !`;
  popup.classList.remove("hidden");

  // Show Leaderboard modal automatically on win
  setTimeout(() => {
    showLeaderboardModal({
      gameId: 'mots-meles',
      gameTitle: 'Mots Mêlés 🧩',
      currentScore: elapsedSec,
      scoreFormatted: `${elapsedSec} sec`,
      isLowerBetter: true,
    });
  }, 400);
}

/* ---- Events ---- */
gridEl.addEventListener("mousedown", e => {
  if (!e.target.classList.contains("tile")) return;
  selecting = true;
  clearSelection();
  addSelection(e.target);
});

gridEl.addEventListener("mouseover", e => {
  if (selecting && e.target.classList.contains("tile")) addSelection(e.target);
});

document.addEventListener("mouseup", () => {
  if (selecting) validateSelection();
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("popup-close")?.addEventListener("click", () => {
    window.location.href = "finish.html";
  });

  document.getElementById("btn-show-leaderboard")?.addEventListener("click", () => {
    showLeaderboardModal({
      gameId: 'mots-meles',
      gameTitle: 'Mots Mêlés 🧩',
      currentScore: Math.round((Date.now() - startTime) / 1000),
      scoreFormatted: `${Math.round((Date.now() - startTime) / 1000)} sec`,
      isLowerBetter: true,
    });
  });
});

/* ---- Init ---- */
async function init() {
  createGrid();
  await loadWords();
  if (selectedWords.length > 0) {
    placeWords(selectedWords);
    showWordList(selectedWords);
  }
  secretSpan.textContent = "";
  startTime = Date.now();
}

init();
