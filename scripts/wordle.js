import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* -------------------------- SUPABASE / CONFIG -------------------------- */
const SUPABASE_URL = 'https://rwloeubpmlnrycyzhzuo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_ROWS = Infinity;
const DICT_URL = '../mots.txt';

/* -------------------------- STATE / DOM -------------------------- */
let dictByLength = new Map();
let answers = [];
let secretWord = '';
let wordLen = 5;

let currentRow = 0;
let currentCol = 0;
let board = [];

const grid = document.getElementById('grid');
const submitBtn = document.getElementById('submit');
const messageEl = document.getElementById('msg');

/* --- Scoring & stats --- */
let triesCount = 0;     
let matchesCount = 0;   
let flipsCount = 0;     

const POPUP = document.getElementById('game-over-popup');
const POPUP_CLOSE = document.getElementById('popup-close');
const FINAL_SCORE_TITLE = document.getElementById('FINAL_SCORE_TITLE');
const FINAL_DETAILS = document.getElementById('FINAL_DETAILS');

/* -------------------------- HELPERS -------------------------- */
function strip(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

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

function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1;
}

/* -------------------------- TILE / CARET -------------------------- */
function setTile(r, c, ch) {
  const idx = r * wordLen + c;
  const tile = grid.children[idx];
  if (!tile) return;
  const caret = tile.querySelector('.caret');
  tile.textContent = ch ? ch.toUpperCase() : '';
  if (caret) tile.appendChild(caret);
  tile.classList.toggle('filled', !!ch);
}

function updateCaret() {
  grid.querySelectorAll('.caret').forEach(n => n.remove());
  grid.querySelectorAll('.tile.active').forEach(t => t.classList.remove('active'));
  if (currentRow >= MAX_ROWS || currentCol < 0 || currentCol >= wordLen) return;
  const idx = currentRow * wordLen + currentCol;
  const tile = grid.children[idx];
  if (!tile || tile.classList.contains('missing')) return;
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '_';
  tile.appendChild(caret);
  tile.classList.add('active');
}

/* -------------------------- DICTIONARY / ANSWERS -------------------------- */
async function loadAnswersFromSupabase() {
  const weekPosition = getWeekPositionFromURL();
  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('boxes')
      .eq('position', weekPosition);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No week found');
    answers = data[0].boxes.flatMap(box => box.words).map(strip);
    if (!answers.length) throw new Error('Empty answer pool');
  } catch (err) {
    console.warn('Supabase fallback:', err);
    answers = Array.from(dictByLength.get(wordLen) || []);
  }
}

async function initGame() {
  let dictWords = [];
  try {
    dictWords = await fetchFile(DICT_URL);
  } catch (err) {
    console.warn('Failed to load dict file, using fallback', err);
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
function pickRandomSecret() {
  if (!answers.length) {
    const fallback = Array.from(dictByLength.get(wordLen) || []);
    secretWord = fallback[Math.floor(Math.random() * fallback.length)] || 'pomme';
  } else {
    secretWord = answers[Math.floor(Math.random() * answers.length)];
  }
  secretWord = strip(secretWord);
  wordLen = secretWord.length;
}

function resetSecretAndState() {
  pickRandomSecret();
  buildGridForWord();
  triesCount = 0;
  matchesCount = 0;
  flipsCount = 0;
}

/* -------------------------- GRID BUILD -------------------------- */
function buildGridForWord() {
  grid.innerHTML = '';
  adjustTileSize(wordLen);
  board = [];
  appendRow();
  currentRow = 0;
  currentCol = 0;
  updateCaret();
}

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
  grid.lastChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function adjustTileSize(cols) {
  const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 8;
  const container = grid.parentElement;
  let containerWidth = container ? container.clientWidth : Math.min(window.innerWidth - 40, 540);
  const size = Math.max(36, Math.min(84, Math.floor((containerWidth - (cols - 1) * gap) / cols)));
  document.documentElement.style.setProperty('--size', size + 'px');
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
}

function clearTiles() {
  const tiles = grid.children;
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].className = 'tile';
    tiles[i].textContent = '';
  }
}

/* -------------------------- INPUT HANDLERS -------------------------- */
function handleLetter(l) {
  if (currentRow >= MAX_ROWS || currentCol >= wordLen) return;
  const letter = strip(l).slice(0, 1);
  board[currentRow][currentCol] = letter;
  setTile(currentRow, currentCol, letter);
  currentCol++;
  updateCaret();
}

function handleBack() {
  if (currentRow >= MAX_ROWS || currentCol === 0) return;
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
function submitGuess() {
  if (currentRow >= MAX_ROWS) return;
  const guess = board[currentRow].join('').trim();

  if (guess.length < 3 || guess.length > wordLen) {
    shakeRow(currentRow);
    return;
  }

  const dictSet = dictByLength.get(guess.length);
  if (!dictSet || !dictSet.has(guess)) {
    showMessage('Mot invalide !', true);
    shakeRow(currentRow);
    return;
  }

  const secretArr = secretWord.split('');
  const status = Array(guess.length).fill('absent');

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secretArr[i]) {
      status[i] = 'correct';
      secretArr[i] = null;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (status[i] === 'correct') continue;
    const idx = secretArr.indexOf(guess[i]);
    if (idx !== -1) {
      status[i] = 'present';
      secretArr[idx] = null;
    }
  }

  for (let i = 0; i < guess.length; i++) {
    const idx = currentRow * wordLen + i;
    const tile = grid.children[idx];
    if (!tile) continue;
    tile.textContent = guess[i].toUpperCase();
    tile.classList.remove('absent', 'present', 'correct', 'missing');
    tile.classList.add(status[i]);
  }

  for (let i = guess.length; i < wordLen; i++) {
    const idx = currentRow * wordLen + i;
    const tile = grid.children[idx];
    if (!tile) continue;
    tile.textContent = '';
    tile.querySelector('.caret')?.remove();
    tile.classList.remove('absent', 'present', 'correct');
    tile.classList.add('missing');
  }

  triesCount++;
  matchesCount += status.filter(s => s === 'correct').length;

  // Win check
  if (status.every(s => s === 'correct')) {
    showGameOver();
    currentRow = MAX_ROWS;
    updateCaret();
    return;
  }

  currentRow++;
  currentCol = 0;
  if (currentRow < MAX_ROWS) appendRow();
  updateCaret();
}

/* -------------------------- SCORE / POPUP -------------------------- */
function showGameOver() {
  const maxScore = wordLen * 100;           // score max proportionnel à la longueur
  const idealTries = wordLen + 1;           // nombre de tentatives idéales
  let rawScore = maxScore * (1 - (triesCount - 1) / idealTries);

  // jamais négatif : minimum 10% du maxScore
  const score = Math.max(Math.round(rawScore), Math.round(maxScore * 0.1));

  FINAL_SCORE_TITLE.textContent = 'Score : ' + score;

  // message encourageant selon performance
  let message = '';
  if (triesCount === 1) message = 'Incroyable ! Mot trouvé du premier coup ! 🎉';
  else if (triesCount <= Math.ceil(wordLen / 2)) message = 'Très bien joué ! 😊';
  else if (triesCount <= wordLen) message = 'Super ! continue comme ça ! 👍';
  else message = 'Tu as trouvé ! 💪';

  FINAL_DETAILS.innerHTML =
    `Tentatives : ${triesCount} <br>` +
    `${message}`;

  POPUP.classList.remove('hidden');
  POPUP_CLOSE.focus();
}

/* -------------------------- VISUAL HELPERS -------------------------- */
function shakeRow(r) {
  for (let i = 0; i < wordLen; i++) {
    const idx = r * wordLen + i;
    const tile = grid.children[idx];
    if (!tile) continue;
    tile.classList.remove('shake');
    void tile.offsetWidth;
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 600);
  }
}

let messageTimeout = null;
function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#b12' : '';
  clearTimeout(messageTimeout);
  messageTimeout = setTimeout(() => { messageEl.textContent = ''; }, 3000);
}

/* -------------------------- EVENTS -------------------------- */
document.addEventListener('keydown', e => {
  if (currentRow >= MAX_ROWS && e.key !== 'r') return;
  if (e.key === 'Backspace') { e.preventDefault(); handleBack(); }
  else if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
  else if (e.key.length === 1 && /[a-zA-ZÀ-ÖØ-öø-ÿ-]/.test(e.key)) { e.preventDefault(); handleLetter(e.key); }
  else if (e.key === 'r' && currentRow >= MAX_ROWS) { e.preventDefault(); resetSecretAndState(); }
});

document.addEventListener('paste', e => {
  if (currentRow >= MAX_ROWS) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  handlePaste(text);
  e.preventDefault();
});

POPUP_CLOSE.addEventListener('click', () => {
  window.location.href = "finish.html";
});

submitBtn.addEventListener('click', submitGuess);
window.addEventListener('resize', () => adjustTileSize(wordLen));

/* -------------------------- INIT -------------------------- */
initGame();