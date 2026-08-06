import { getBoxes } from './fetch_json.js';

const DICT_URL = '../mots.txt';
const MAX_ROWS = Infinity;

/* ---- DOM ---- */
const grid      = document.getElementById('grid');
const submitBtn = document.getElementById('submit');
const messageEl = document.getElementById('msg');
const POPUP           = document.getElementById('game-over-popup');
const POPUP_RESTART   = document.getElementById('popup-restart');
const SCORE_TITLE     = document.getElementById('FINAL_SCORE_TITLE');
const SCORE_DETAILS   = document.getElementById('FINAL_DETAILS');

/* ---- Game state ---- */
let dictByLength = new Map();
let answers      = [];
let secretWord   = '';
let wordLen      = 5;
let currentRow   = 0;
let currentCol   = 0;
let board        = [];
let triesCount   = 0;

/* ---- Helpers ---- */
function strip(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases  = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1;
}

async function fetchFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const txt = await res.text();
  return txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(strip);
}

/* ---- Tile / caret ---- */
function setTile(r, c, ch) {
  const tile = grid.children[r * wordLen + c];
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
  const tile = grid.children[currentRow * wordLen + currentCol];
  if (!tile || tile.classList.contains('missing')) return;
  const caret = document.createElement('span');
  caret.className   = 'caret';
  caret.textContent = '_';
  tile.appendChild(caret);
  tile.classList.add('active');
}

/* ---- Dictionary / answers ---- */
async function loadAnswers() {
  try {
    const boxes = await getBoxes(getWeekPositionFromURL());
    if (!boxes) throw new Error('No week found');
    answers = boxes.flatMap(box => box.words).map(strip);
    if (!answers.length) throw new Error('Empty answer pool');
  } catch (err) {
    console.warn('Fallback:', err);
    alert("Préviens le maitre si tu vois ceci !");
    answers = ["erreur", "erreur", "erreur", "erreur", "erreur", "erreur", "erreur", "erreur",
               "erreur", "erreur", "erreur", "erreur", "erreur", "erreur", "erreur", "erreur"];
  }
}

async function initGame() {
  triesCount = 0;

  let dictWords = [];
  try {
    dictWords = await fetchFile(DICT_URL);
  } catch (err) {
    alert('Préviens le maitre ! : ', err);
    dictWords = ['pomme', 'table', 'jouer', 'chien', 'aimer', 'fleur', 'ordinateur', 'smartphone', 'voiture', 'avion'].map(strip);
  }

  dictByLength.clear();
  for (const w of dictWords) {
    if (!dictByLength.has(w.length)) dictByLength.set(w.length, new Set());
    dictByLength.get(w.length).add(w);
  }

  await loadAnswers();
  pickRandomSecret();
  buildGrid();
  renderVirtualKeyboard();
}

/* ---- Virtual Keyboard ---- */
const KEYBOARD_ROWS = [
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['⌫', 'W', 'X', 'C', 'V', 'B', 'N', 'OK']
];

function renderVirtualKeyboard() {
  const vk = document.getElementById('virtual-keyboard');
  if (!vk) return;
  vk.innerHTML = '';

  KEYBOARD_ROWS.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'vk-row';
    row.forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'vk-key';
      btn.textContent = key;
      btn.dataset.key = key;
      if (key === '⌫' || key === 'OK') btn.classList.add('vk-key-wide');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (key === '⌫') handleBack();
        else if (key === 'OK') submitGuess();
        else handleLetter(key);
      });
      rowDiv.appendChild(btn);
    });
    vk.appendChild(rowDiv);
  });
}

/* ---- Secret management ---- */
function pickRandomSecret() {
  const pool = answers.length ? answers : Array.from(dictByLength.get(wordLen) || []);

  if (!pool.length) {
    alert("Prévenir le maitre !");
    secretWord = 'pomme';
    wordLen    = 5;
    return;
  }

  let word;
  do {
    word = strip(pool[Math.floor(Math.random() * pool.length)]);
  } while (word.length < 3 || word.includes('œ'));

  secretWord = word;
  wordLen    = word.length;
}

/* ---- Grid ---- */
function buildGrid() {
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
  board.push(Array(wordLen).fill(''));
  for (let c = 0; c < wordLen; c++) {
    const d = document.createElement('div');
    d.className  = 'tile';
    d.dataset.r  = r;
    d.dataset.c  = c;
    grid.appendChild(d);
  }
  grid.lastChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function adjustTileSize(cols) {
  const gap       = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 8;
  const container = grid.parentElement;
  const availW    = container ? container.clientWidth : Math.min(window.innerWidth - 40, 540);
  const size      = Math.max(36, Math.min(84, Math.floor((availW - (cols - 1) * gap) / cols)));
  document.documentElement.style.setProperty('--size', size + 'px');
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
}

/* ---- Input handlers ---- */
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

/* ---- Submit / validate ---- */
function submitGuess() {
  if (currentRow >= MAX_ROWS) return;
  const guess = board[currentRow].join('').trim();

  if (guess.length < 3 || guess.length > wordLen) { shakeRow(currentRow); return; }

  const dictSet = dictByLength.get(guess.length);
  if (!dictSet?.has(guess)) {
    showMessage('Mot invalide !', true);
    shakeRow(currentRow);
    return;
  }

  // Score each letter
  const secretArr = secretWord.split('');
  const status    = Array(guess.length).fill('absent');

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secretArr[i]) { status[i] = 'correct'; secretArr[i] = null; }
  }
  for (let i = 0; i < guess.length; i++) {
    if (status[i] === 'correct') continue;
    const idx = secretArr.indexOf(guess[i]);
    if (idx !== -1) { status[i] = 'present'; secretArr[idx] = null; }
  }

  // Apply colours to tiles and update virtual keyboard
  for (let i = 0; i < guess.length; i++) {
    const tile = grid.children[currentRow * wordLen + i];
    if (tile) {
      tile.textContent = guess[i].toUpperCase();
      tile.className   = `tile ${status[i]}`;
    }

    const char = guess[i].toUpperCase();
    const keyBtn = document.querySelector(`.vk-key[data-key="${char}"]`);
    if (keyBtn) {
      if (status[i] === 'correct') {
        keyBtn.classList.remove('present', 'absent');
        keyBtn.classList.add('correct');
      } else if (status[i] === 'present' && !keyBtn.classList.contains('correct')) {
        keyBtn.classList.remove('absent');
        keyBtn.classList.add('present');
      } else if (status[i] === 'absent' && !keyBtn.classList.contains('correct') && !keyBtn.classList.contains('present')) {
        keyBtn.classList.add('absent');
      }
    }
  }

  // Mark short-word padding as missing
  for (let i = guess.length; i < wordLen; i++) {
    const tile = grid.children[currentRow * wordLen + i];
    if (!tile) continue;
    tile.textContent = '';
    tile.querySelector('.caret')?.remove();
    tile.className = 'tile missing';
  }

  triesCount++;

  if (status.every(s => s === 'correct')) {
    showPopup();
    currentRow = MAX_ROWS;
    updateCaret();
    return;
  }

  currentRow++;
  currentCol = 0;
  if (currentRow < MAX_ROWS) appendRow();
  updateCaret();
}

import { showLeaderboardModal } from './leaderboard.js';

function computeScore() {
  const maxScore  = wordLen * 100;
  const idealTries = wordLen + 1;
  const raw        = maxScore * (1 - (triesCount - 1) / idealTries);
  return Math.max(Math.round(raw), Math.round(maxScore * 0.1));
}

function showPopup() {
  const score = computeScore();

  let message = '';
  if (triesCount === 1)                         message = '🎉 Gé-nials ! Trouver du premier coup, quel champion !';
  else if (triesCount <= Math.ceil(wordLen / 2)) message = '🌟 Bravo ! Excellente déduction !';
  else if (triesCount <= wordLen)               message = '👏 Super effort ! Tu as réussi !';
  else                                          message = '💪 Bravo pour ta ténacité !';

  SCORE_TITLE.textContent = '🎉 Gagné ! Score : ' + score;
  SCORE_DETAILS.innerHTML = `Nombre d'essais : ${triesCount} <br>${message}`;
  POPUP.classList.remove('hidden');
  POPUP_RESTART.focus();

  setTimeout(() => {
    showLeaderboardModal({
      gameId: 'wordle',
      gameTitle: 'Wordle 🔤',
      currentScore: triesCount,
      scoreFormatted: `${triesCount} essai(s)`,
      isLowerBetter: true,
    });
  }, 400);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-show-leaderboard")?.addEventListener("click", () => {
    showLeaderboardModal({
      gameId: 'wordle',
      gameTitle: 'Wordle 🔤',
      currentScore: triesCount || 1,
      scoreFormatted: triesCount ? `${triesCount} essai(s)` : 'En cours',
      isLowerBetter: true,
    });
  });
});

/* ---- Visual helpers ---- */
function shakeRow(r) {
  for (let i = 0; i < wordLen; i++) {
    const tile = grid.children[r * wordLen + i];
    if (!tile) continue;
    tile.classList.remove('shake');
    void tile.offsetWidth; // reflow to restart animation
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 600);
  }
}

let messageTimer = null;
function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#b12' : '';
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { messageEl.textContent = ''; }, 3000);
}

function isTypingInInput() {
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
  if (document.querySelector('.leaderboard-overlay:not(.hidden)')) return true;
  return false;
}

/* ---- Events ---- */
document.addEventListener('keydown', e => {
  if (isTypingInInput()) return;
  if (currentRow >= MAX_ROWS && e.key !== 'r') return;
  if (e.key === 'Backspace')                                          { e.preventDefault(); handleBack();        }
  else if (e.key === 'Enter')                                         { e.preventDefault(); submitGuess();       }
  else if (e.key.length === 1 && /[a-zA-ZÀ-ÖØ-öø-ÿ-]/.test(e.key)) { e.preventDefault(); handleLetter(e.key); }
  else if (e.key === 'r' && currentRow >= MAX_ROWS)                   { e.preventDefault(); resetGame();         }
});

document.addEventListener('paste', e => {
  if (isTypingInInput() || currentRow >= MAX_ROWS) return;
  handlePaste((e.clipboardData || window.clipboardData).getData('text'));
  e.preventDefault();
});

function resetGame() {
  pickRandomSecret();
  buildGrid();
  triesCount = 0;
}

POPUP_RESTART.addEventListener('click', () => {
  POPUP.classList.add('hidden');
  initGame();
});

submitBtn.addEventListener('click', submitGuess);
window.addEventListener('resize', () => adjustTileSize(wordLen));

/* ---- Init ---- */
initGame();
