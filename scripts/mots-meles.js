import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- Configuration Supabase ---
const SUPABASE_URL = 'https://rwloeubpmlnrycyzhzuo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Variables principales ---
const gridSize = 12;
const grid = document.getElementById("grid");
const secretSpan = document.getElementById("secret");
let tiles = [];
let selectedWords = [];
let selection = [];
let selecting = false;
let selDirection = null; // direction en cours [dx, dy] ou null

// --- Utilitaires ---
function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1;
}

function normalizeWord(word) {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

function createGrid() {
  grid.innerHTML = "";
  tiles = [];
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.x = x;
      tile.dataset.y = y;
      grid.appendChild(tile);
      tiles.push(tile);
    }
  }
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

// --- Chargement des mots ---
async function loadWordsFromSupabase() {
  const weekPosition = getWeekPositionFromURL();
  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('boxes')
      .eq('position', weekPosition);

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No week found');

    const words = data[0].boxes.flatMap(box => box.words);
    shuffleArray(words);

    // au lieu de juste normaliser
    selectedWords = words
      .slice(0, Math.min(10, words.length))
      .map(w => ({
        original: w,               // version avec accents et minuscules
        normalized: normalizeWord(w) // version pour la grille
      }));

    console.log(`Loaded ${selectedWords.length} words from week position ${weekPosition}`);
  } catch (e) {
    console.error("Erreur Supabase:", e);
  }
}

// --- Directions possibles (8) ---
const directions = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [-1, 1], [1, -1], [-1, -1]
];

// Vérifie si un mot peut être placé
function canPlace(word, x, y, dx, dy) {
  for (let i = 0; i < word.length; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) return false;
    const tile = tiles[nx * gridSize + ny];
    if (tile.textContent && tile.textContent !== word[i]) return false;
  }
  return true;
}

function placeWord(word, x, y, dx, dy) {
  for (let i = 0; i < word.length; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    tiles[nx * gridSize + ny].textContent = word[i];
  }
}

// --- Placement avec diversification des directions ---
function placeWords(words) {
  const wordsSorted = words.map(w => w.normalized).sort((a, b) => b.length - a.length);
  const maxAttempts = 100;
  let attempts = 0;

  while (true) {
    tiles.forEach(t => t.textContent = "");
    let failed = false;

    for (const word of wordsSorted) {
      let placed = false;
      let positions = [];

      // Choisir un sous-ensemble random de directions pour ce mot
      const shuffledDirections = [...directions];
      shuffleArray(shuffledDirections);

      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          for (const [dx, dy] of shuffledDirections) {
            if (canPlace(word, x, y, dx, dy)) positions.push({ x, y, dx, dy });
          }
        }
      }

      shuffleArray(positions);

      if (positions.length > 0) {
        const pos = positions[0]; // on prend une position aléatoire
        placeWord(word, pos.x, pos.y, pos.dx, pos.dy);
        placed = true;
      }

      if (!placed) {
        console.warn("Échec placement pour", word);
        failed = true;
        break;
      }
    }

    attempts++;
    if (!failed || attempts >= maxAttempts) {
      tiles.forEach(t => {
        if (!t.textContent) t.textContent = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      });
      break;
    }
  }
}

// --- Affichage de la liste ---
function showWordList(words) {
  const ul = document.getElementById("wordList");
  ul.innerHTML = "";
  words.forEach(word => {
    const li = document.createElement("li");
    li.textContent = word.original;             // <-- garde accents et minuscules
    li.id = "word-" + sanitizeId(word.normalized); // toujours normalisé pour l'identifiant
    ul.appendChild(li);
  });
}

// --- Sélection utilisateur ---
function coordsOf(tile) {
  return [parseInt(tile.dataset.x, 10), parseInt(tile.dataset.y, 10)];
}

function isAdjacent(a, b) {
  const [ax, ay] = coordsOf(a);
  const [bx, by] = coordsOf(b);
  const dx = bx - ax, dy = by - ay;
  return !(Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0));
}

function directionBetween(t1, t2) {
  const [x1, y1] = coordsOf(t1);
  const [x2, y2] = coordsOf(t2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  return [dx === 0 ? 0 : dx / Math.abs(dx), dy === 0 ? 0 : dy / Math.abs(dy)];
}

function addSelection(tile) {
  if (selection.includes(tile)) {
    const first = selection[0], last = selection[selection.length - 1];
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

  const first = selection[0], last = selection[selection.length - 1];
  const [fx, fy] = coordsOf(first);
  const [lx, ly] = coordsOf(last);
  const [dx, dy] = selDirection;

  if (parseInt(tile.dataset.x) === lx + dx && parseInt(tile.dataset.y) === ly + dy) {
    selection.push(tile);
    tile.classList.add("selected");
    return;
  }

  if (parseInt(tile.dataset.x) === fx - dx && parseInt(tile.dataset.y) === fy - dy) {
    selection.unshift(tile);
    tile.classList.add("selected");
  }
}

function clearSelection() {
  selection.forEach(t => t.classList.remove("selected"));
  selection = [];
  selDirection = null;
}

function validateSelection() {
  if (selection.length === 0) return;

  const mot = normalizeWord(selection.map(t => t.textContent).join(""));
  const rev = normalizeWord(selection.map(t => t.textContent).reverse().join(""));
  const normalizedWords = selectedWords.map(w => w.normalized);

  if (normalizedWords.includes(mot) || normalizedWords.includes(rev)) {
    selection.forEach(t => { t.classList.remove("selected"); t.classList.add("found"); });
    const foundWord = normalizedWords.includes(mot) ? mot : rev;
    const li = document.getElementById("word-" + sanitizeId(foundWord));
    if (li) li.classList.add("found");
    checkWin();
  }
  clearSelection();
  selecting = false;
}

// --- Vérifie victoire ---
function checkWin() {
  const allFound = selectedWords.every(w => {
    const li = document.getElementById("word-" + sanitizeId(w));
    return li && li.classList.contains("found");
  });
  if (allFound) secretSpan.textContent = "Bravo !";
}

// --- Événements ---
grid.addEventListener("mousedown", e => {
  if (e.target.classList.contains("tile")) {
    selecting = true;
    clearSelection();
    addSelection(e.target);
  }
});
grid.addEventListener("mouseover", e => {
  if (selecting && e.target.classList.contains("tile")) {
    addSelection(e.target);
  }
});
document.addEventListener("mouseup", () => {
  if (selecting) validateSelection();
});

// --- Bouton générer ---
document.getElementById("generate").addEventListener("click", async () => {
  const weekPosition = getWeekPositionFromURL();
  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('boxes')
      .eq('position', weekPosition);

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No week found');

    const words = data[0].boxes.flatMap(box => box.words);
    shuffleArray(words);

    const wordsForGrid = words
      .slice(0, Math.min(10, words.length))
      .map(w => normalizeWord(w));

    createGrid();
    placeWords(wordsForGrid);
    showWordList(wordsForGrid);
    secretSpan.textContent = "";
  } catch (e) {
    console.error("Erreur Supabase:", e);
  }
});

// --- Initialisation ---
async function init() {
  createGrid();
  await loadWordsFromSupabase();
  if (selectedWords.length > 0) {
    placeWords(selectedWords);
    showWordList(selectedWords);
  }
  secretSpan.textContent = "";
}

init();