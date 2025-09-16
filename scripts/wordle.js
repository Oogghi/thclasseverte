import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/*
  Nettoyage et réorganisation du script fourni.
  - Variables/fonctions renommées pour la lisibilité
  - Suppression de code redondant / logs superflus
  - Ajout de commentaires concis expliquant les parties importantes
  - Aucune modification visuelle ou fonctionnelle intentionnelle
*/

/* -------------------------- SUPABASE / CONFIG -------------------------- */
const SUPABASE_URL = 'https://rwloeubpmlnrycyzhzuo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_ROWS = Infinity;
const DICT_URL = '../mots.txt';

/* -------------------------- STATE / DOM -------------------------- */
// Word data structures
let dictByLength = new Map(); // Map<number, Set<string>>
let answers = [];             // array of candidate answers (stripped)
let secretWord = '';          // stripped secret word
let wordLen = 5;              // length of the secret word

// Board state
let currentRow = 0;
let currentCol = 0;
let board = [];               // 2D array of letters per row

// DOM references (must match existing HTML)
const grid = document.getElementById('grid');
const submitBtn = document.getElementById('submit');
const resetBtn = document.getElementById('reset');
const messageEl = document.getElementById('msg');

/* -------------------------- HELPERS -------------------------- */

/**
 * Remove accents and lowercase a string.
 * Returns '' for falsy input.
 */
function strip(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Fetch a newline list file and return cleaned words (stripped, non-empty).
 */
async function fetchFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const txt = await res.text();
  return txt
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(strip);
}

/* -------------------------- URL / WEEK UTIL -------------------------- */

/**
 * Compute the 'week position' from URL query param "cases".
 * If ?cases is missing, defaults to 1 -> position 1.
 * Logic: position = floor((cases - 1) / 4) + 1 (keeps original behavior).
 */
function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1;
}

/* -------------------------- TILE / CARET MANAGEMENT -------------------------- */

/**
 * Set the visual content of a tile at (r,c).
 * - Places uppercase letter or clears content.
 * - Preserves a '.caret' element inside tile if present.
 * - Toggles 'filled' class when character present.
 */
function setTile(r, c, ch) {
  const idx = r * wordLen + c;
  const tile = grid.children[idx];
  if (!tile) return;
  // remove existing text but keep caret if present
  const caret = tile.querySelector('.caret');
  tile.textContent = ch ? ch.toUpperCase() : '';
  if (caret) tile.appendChild(caret);
  tile.classList.toggle('filled', !!ch);
}

/**
 * Update caret: show blinking underscore in active tile and mark active class.
 * Removes previous carets and active classes first.
 */
function updateCaret() {
  // clear existing carets / active markers
  grid.querySelectorAll('.caret').forEach(n => n.remove());
  grid.querySelectorAll('.tile.active').forEach(t => t.classList.remove('active'));

  if (currentRow >= MAX_ROWS) return;
  if (currentCol < 0 || currentCol >= wordLen) return;

  const idx = currentRow * wordLen + currentCol;
  const tile = grid.children[idx];
  if (!tile || tile.classList.contains('missing')) return;

  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '_';
  tile.appendChild(caret);
  tile.classList.add('active');
}

/* -------------------------- LOAD / DICTIONARY / ANSWERS -------------------------- */

/**
 * Try to load answers for the current week from Supabase.
 * On failure, fall back to dictionary words of the correct length.
 */
async function loadAnswersFromSupabase() {
  const weekPosition = getWeekPositionFromURL();

  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('boxes')
      .eq('position', weekPosition);

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No week found');

    // flatten boxes -> words and strip
    answers = data[0].boxes.flatMap(box => box.words).map(strip);

    if (!answers.length) throw new Error('Empty answer pool');
  } catch (err) {
    // fallback: use dictionary words with target length if supabase fails
    console.warn('Supabase fallback:', err);
    answers = Array.from(dictByLength.get(wordLen) || []);
  }
}

/**
 * Load dictionary file, build dictByLength, then load answers and initialize board.
 */
async function initGame() {
  let dictWords = [];
  try {
    dictWords = await fetchFile(DICT_URL);
  } catch (err) {
    console.warn('Failed to load dict file, using small fallback list', err);
    dictWords = ['pomme','table','jouer','chien','aimer','fleur','ordinateur','smartphone','voiture','avion'].map(strip);
  }

  dictByLength.clear();
  for (const w of dictWords) {
    const L = w.length;
    if (!dictByLength.has(L)) dictByLength.set(L, new Set());
    dictByLength.get(L).add(w);
  }

  await loadAnswersFromSupabase();

  pickRandomSecret();
  buildGridForWord();
}

/* -------------------------- SECRET MANAGEMENT -------------------------- */

/**
 * Choose a random secret from the loaded answers and set related state.
 */
function pickRandomSecret() {
  if (!answers.length) {
    // if no answers loaded, try to pick from dictionary default size 5
    const fallback = Array.from(dictByLength.get(wordLen) || []);
    secretWord = fallback[Math.floor(Math.random() * fallback.length)] || 'pomme';
  } else {
    secretWord = answers[Math.floor(Math.random() * answers.length)];
  }
  secretWord = strip(secretWord);
  wordLen = secretWord.length;
}

/**
 * Reset secret (pick new) and rebuild grid.
 */
function resetSecretAndState() {
  pickRandomSecret();
  buildGridForWord();
  showMessage('Actualisation du mot');
}

/* -------------------------- GRID BUILD / SIZE -------------------------- */

/**
 * Build DOM grid and internal board for current secretWord.
 * Starts with a single row (player types, then new rows are appended on submissions).
 */
function buildGridForWord() {
  grid.innerHTML = '';
  adjustTileSize(wordLen);
  board = [];
  appendRow(); // first row
  currentRow = 0;
  currentCol = 0;
  updateCaret();
}

/**
 * Append a new empty row both to the board array and as tiles in the DOM.
 */
function appendRow() {
  const r = board.length;
  const newRow = Array(wordLen).fill('');
  board.push(newRow);

  for (let c = 0; c < wordLen; c++) {
    const d = document.createElement('div');
    d.className = 'tile';
    d.dataset.r = r;
    d.dataset.c = c;
    grid.appendChild(d);
  }
}

/**
 * Compute an appropriate tile size based on container width and CSS --gap variable.
 * Sets --size and grid-template-columns accordingly.
 */
function adjustTileSize(cols) {
  const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 8;
  const container = grid.parentElement;
  let containerWidth = container ? container.clientWidth : Math.min(window.innerWidth - 40, 540);
  const size = Math.max(36, Math.min(84, Math.floor((containerWidth - (cols - 1) * gap) / cols)));
  document.documentElement.style.setProperty('--size', size + 'px');
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
}

/**
 * Reset classes/text of all tiles (used by reset UI).
 */
function clearTiles() {
  const tiles = grid.children;
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].className = 'tile';
    tiles[i].textContent = '';
  }
}

/* -------------------------- INPUT HANDLERS -------------------------- */

function handleLetter(l) {
  if (currentRow >= MAX_ROWS) return;
  if (currentCol >= wordLen) return;
  const letter = strip(l).slice(0, 1);
  board[currentRow][currentCol] = letter;
  setTile(currentRow, currentCol, letter);
  currentCol++;
  updateCaret();
}

function handleBack() {
  if (currentRow >= MAX_ROWS) return;
  if (currentCol === 0) return;
  currentCol--;
  board[currentRow][currentCol] = '';
  setTile(currentRow, currentCol, '');
  updateCaret();
}

function handlePaste(text) {
  if (currentRow >= MAX_ROWS) return;
  const letters = strip(text).split('').filter(ch => /[a-z]/.test(ch)).slice(0, wordLen);
  for (let i = 0; i < letters.length; i++) {
    board[currentRow][i] = letters[i];
    setTile(currentRow, i, letters[i]);
  }
  currentCol = Math.min(wordLen, letters.length);
  updateCaret();
}

/* -------------------------- SUBMIT / VALIDATE -------------------------- */

/**
 * Submit the current row as a guess, validate length/dictionary,
 * compute statuses (correct/present/absent), update tile classes.
 */
function submitGuess() {
  if (currentRow >= MAX_ROWS) return;

  const guess = board[currentRow].join('').trim();

  // keep original behavior: allow guesses of length 3..wordLen
  if (guess.length < 3 || guess.length > wordLen) {
    showMessage(`Le mot doit comporter entre 3 et ${wordLen} lettres`, true);
    shakeRow(currentRow);
    return;
  }

  const dictSet = dictByLength.get(guess.length);
  if (!dictSet || !dictSet.has(guess)) {
    showMessage('Mot invalide !', true);
    shakeRow(currentRow);
    return;
  }

  // compute statuses using two-pass approach (exact matches first)
  const secretArr = secretWord.split('');
  const status = Array(guess.length).fill('absent');

  // first pass: correct positions
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secretArr[i]) {
      status[i] = 'correct';
      secretArr[i] = null;
    }
  }

  // second pass: present elsewhere
  for (let i = 0; i < guess.length; i++) {
    if (status[i] === 'correct') continue;
    const idx = secretArr.indexOf(guess[i]);
    if (idx !== -1) {
      status[i] = 'present';
      secretArr[idx] = null;
    }
  }

  // apply status classes to tiles for the typed letters
  for (let i = 0; i < guess.length; i++) {
    const idx = currentRow * wordLen + i;
    const tile = grid.children[idx];
    if (!tile) continue;
    tile.textContent = guess[i].toUpperCase();
    tile.classList.remove('absent', 'present', 'correct', 'missing');
    tile.classList.add(status[i]); // 'correct' | 'present' | 'absent'
  }

  // mark remaining tiles in the row as 'missing' (red underscores / empty)
  for (let i = guess.length; i < wordLen; i++) {
    const idx = currentRow * wordLen + i;
    const tile = grid.children[idx];
    if (!tile) continue;
    tile.textContent = '';
    const oldCaret = tile.querySelector('.caret');
    if (oldCaret) oldCaret.remove();
    tile.classList.remove('absent', 'present', 'correct');
    tile.classList.add('missing');
  }

  // win condition: full-length guess && all 'correct'
  if (guess.length === wordLen && status.every(s => s === 'correct')) {
    showMessage(`Bravo ! Trouvé en ${currentRow + 1} essai(s).`);
    currentRow = MAX_ROWS; // freeze input
    updateCaret();
    return;
  }

  // advance to next row
  currentRow++;
  currentCol = 0;
  if (currentRow < MAX_ROWS) appendRow();
  updateCaret();
}

/* -------------------------- VISUAL HELPERS -------------------------- */

function shakeRow(r) {
  for (let i = 0; i < wordLen; i++) {
    const idx = r * wordLen + i;
    const tile = grid.children[idx];
    if (!tile) continue;
    tile.classList.remove('shake');
    // force reflow to restart animation
    void tile.offsetWidth;
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 600);
  }
}

let messageTimeout = null;
/**
 * Show a short ephemeral message in the message element.
 * isError toggles the color to indicate an error.
 */
function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#b12' : '';
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => { messageEl.textContent = ''; }, 3000);
}

/* -------------------------- RESET UI -------------------------- */

/**
 * Reset UI tiles and internal board state but keep the same secret.
 */
function resetBoardUI() {
  clearTiles();
  board = Array.from({ length: MAX_ROWS }, () => Array(wordLen).fill(''));
  currentRow = 0;
  currentCol = 0;
  showMessage('Partie réinitialisée');
  updateCaret();
}

/* -------------------------- EVENTS -------------------------- */

document.addEventListener('keydown', e => {
  // if game finished, only allow 'r' (reset via keyboard) to work
  if (currentRow >= MAX_ROWS && e.key !== 'r') return;

  if (e.key === 'Backspace') {
    e.preventDefault();
    handleBack();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submitGuess();
  } else if (e.key.length === 1 && /[a-zA-ZÀ-ÖØ-öø-ÿ-]/.test(e.key)) {
    e.preventDefault();
    handleLetter(e.key);
  } else if (e.key === 'r' && currentRow >= MAX_ROWS) {
    // convenient keyboard reset (keeps original UI behavior possibility)
    e.preventDefault();
    resetSecretAndState();
  }
});

document.addEventListener('paste', e => {
  if (currentRow >= MAX_ROWS) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  handlePaste(text);
  e.preventDefault();
});

submitBtn.addEventListener('click', submitGuess);
resetBtn.addEventListener('click', () => { resetSecretAndState(); });
window.addEventListener('resize', () => { adjustTileSize(wordLen); });

/* -------------------------- INIT -------------------------- */
initGame();