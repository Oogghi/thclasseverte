// scripts/wordle.js
// Optimized Wordle game for TH Classe Verte.
import { getBoxes } from './fetch_json.js';
import { triggerEndGameSequence, showLeaderboardModal } from './leaderboard.js';
import { playClickSound, playWordSuccessSound } from './sound.js';
import { celebrateElement, markError } from './game-feedback.js';
import { getWeekPositionFromURL, stripDiacritics } from './words-utils.js';
import { isTypingInInput } from './game-ui.js';

const DICT_URL = 'mots.txt';
const MAX_ROWS = Infinity;
const TARGET_WORDS_COUNT = 8;

/* ---- DOM Elements ---- */
const grid       = document.getElementById('grid');
const submitBtn  = document.getElementById('submit');
const messageEl  = document.getElementById('msg');
const wordsCount = document.getElementById('words-counter');
const triesCount = document.getElementById('tries-counter');

/* ---- Game State ---- */
const dictByLength = new Map();
let answers         = [];
let secretWord      = '';
let wordLen         = 5;
let currentRow      = 0;
let currentCol      = 0;
let board           = [];

let wordsCompleted   = 0;
let totalTriesCount  = 0;
let currentWordTries = 0;
let gameStartTime    = 0;
const usedWords      = new Set();
let dictionaryReady  = false;

/* ---- Helpers ---- */
function updateHUD() {
  if (wordsCount) wordsCount.textContent = `Mots : ${Math.min(wordsCompleted + 1, TARGET_WORDS_COUNT)}/${TARGET_WORDS_COUNT}`;
  if (triesCount) triesCount.textContent = `Essais : ${totalTriesCount + currentWordTries}`;
}

function setTile(r, c, ch) {
  const tile = grid.children[r * wordLen + c];
  if (!tile) return;
  const caret = tile.querySelector('.caret');
  tile.textContent = ch ? ch.toUpperCase() : '';
  if (caret) tile.appendChild(caret);
  tile.classList.toggle('filled', Boolean(ch));
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

/* ---- Dictionary & Answers Loading ---- */
async function loadAnswers() {
  try {
    const boxes = await getBoxes(getWeekPositionFromURL());
    if (!boxes || !boxes.length) throw new Error('No week found');
    answers = boxes
      .flatMap(box => (Array.isArray(box?.words) ? box.words : []))
      .map(stripDiacritics)
      .filter(w => w && w.length >= 3);
    if (!answers.length) throw new Error('Empty answer pool');
  } catch (err) {
    console.warn('Fallback answers:', err);
    answers = ['pomme', 'table', 'jouer', 'chien', 'aimer', 'fleur', 'maison', 'soleil'];
  }

  // Ensure answer words are always recognized as valid dictionary words
  answers.forEach(w => {
    if (!dictByLength.has(w.length)) dictByLength.set(w.length, new Set());
    dictByLength.get(w.length).add(w);
  });
}

async function loadDictionaryAsync() {
  try {
    const res = await fetch(DICT_URL);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const word = lines[i].trim().toLowerCase();
      const len = word.length;
      if (len >= 3 && len <= 15) {
        let set = dictByLength.get(len);
        if (!set) {
          set = new Set();
          dictByLength.set(len, set);
        }
        set.add(word);
      }
    }
    dictionaryReady = true;
  } catch (err) {
    console.warn('Erreur chargement dictionnaire, utilisation des mots de base:', err);
    ['pomme', 'table', 'jouer', 'chien', 'aimer', 'fleur', 'ordinateur', 'voiture', 'soleil', 'maison'].forEach(w => {
      if (!dictByLength.has(w.length)) dictByLength.set(w.length, new Set());
      dictByLength.get(w.length).add(w);
    });
    dictionaryReady = true;
  }
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
        playClickSound();
        if (key === '⌫') handleBack();
        else if (key === 'OK') submitGuess();
        else handleLetter(key);
      });
      rowDiv.appendChild(btn);
    });
    vk.appendChild(rowDiv);
  });
}

function resetKeyboardColors() {
  document.querySelectorAll('.vk-key').forEach(k => {
    k.classList.remove('correct', 'present', 'absent');
  });
}

/* ---- Secret Management ---- */
function pickRandomSecret() {
  const pool = answers.length ? answers : Array.from(dictByLength.get(wordLen) || []);

  if (!pool.length) {
    secretWord = 'pomme';
    wordLen    = 5;
    return;
  }

  let word;
  let attempts = 0;
  do {
    word = stripDiacritics(pool[Math.floor(Math.random() * pool.length)]);
    attempts++;
  } while ((word.length < 3 || word.includes('œ') || usedWords.has(word)) && attempts < 100);

  usedWords.add(word);
  secretWord = word;
  wordLen    = word.length;
}

/* ---- Grid Construction ---- */
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
  if (grid.lastChild) {
    grid.lastChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function adjustTileSize(cols) {
  const gap       = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 8;
  const container = grid.parentElement;
  const availW    = container ? container.clientWidth : Math.min(window.innerWidth - 40, 600);
  const size      = Math.max(38, Math.min(90, Math.floor((availW - (cols - 1) * gap) / cols)));
  document.documentElement.style.setProperty('--size', size + 'px');
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
}

/* ---- Input Handlers ---- */
function handleLetter(l) {
  if (currentRow >= MAX_ROWS || currentCol >= wordLen) return;
  const letter = stripDiacritics(l).slice(0, 1);
  if (!letter || !/[a-z]/.test(letter)) return;
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
  const letters = stripDiacritics(text).split('').filter(ch => /[a-z]/.test(ch)).slice(0, wordLen);
  for (let i = 0; i < letters.length; i++) {
    board[currentRow][i] = letters[i];
    setTile(currentRow, i, letters[i]);
  }
  currentCol = Math.min(wordLen, letters.length);
  updateCaret();
}

/* ---- Validation & Guess Processing ---- */
function submitGuess() {
  if (currentRow >= MAX_ROWS) return;
  const guess = board[currentRow].join('').trim();

  if (guess.length < 3 || guess.length > wordLen) {
    shakeRow(currentRow);
    return;
  }

  const dictSet = dictByLength.get(guess.length);
  // If dictionary is ready, validate strictly against dictionary or answers
  if (dictionaryReady && dictSet && !dictSet.has(guess) && !answers.includes(guess)) {
    showMessage('Mot invalide !', true);
    shakeRow(currentRow);
    markError(grid.children[currentRow * wordLen]);
    return;
  }

  const secretArr = secretWord.split('');
  const status    = Array(guess.length).fill('absent');

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

  for (let i = guess.length; i < wordLen; i++) {
    const tile = grid.children[currentRow * wordLen + i];
    if (!tile) continue;
    tile.textContent = '';
    tile.querySelector('.caret')?.remove();
    tile.className = 'tile missing';
  }

  currentWordTries++;
  updateHUD();

  if (status.every(s => s === 'correct')) {
    playWordSuccessSound();
    celebrateElement(grid.children[currentRow * wordLen + guess.length - 1], 'Bien joué !');
    wordsCompleted++;
    totalTriesCount += currentWordTries;
    currentWordTries = 0;
    updateHUD();

    if (wordsCompleted < TARGET_WORDS_COUNT) {
      showMessage(`Bravo ! Mot ${wordsCompleted}/${TARGET_WORDS_COUNT} trouvé ! 🎉`);
      setTimeout(() => {
        resetKeyboardColors();
        pickRandomSecret();
        buildGrid();
      }, 900);
      return;
    }

    // 8 Words completed: trigger universal victory sequence
    currentRow = MAX_ROWS;
    updateCaret();

    const elapsedSec = Math.round((performance.now() - (gameStartTime || performance.now())) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = String(elapsedSec % 60).padStart(2, '0');
    const timeFormatted = `${m}m${s}s`;

    triggerEndGameSequence({
      gameId: 'wordle',
      gameTitle: 'Wordle 🔤',
      currentScore: totalTriesCount,
      scoreFormatted: `${totalTriesCount} essais • ${timeFormatted}`,
      isLowerBetter: true,
      extraMetrics: {
        tries: totalTriesCount,
        timeElapsed: elapsedSec,
      },
      onClose: resetFullGame,
    });
    return;
  }

  currentRow++;
  currentCol = 0;
  if (currentRow < MAX_ROWS) appendRow();
  updateCaret();
}

function resetFullGame() {
  wordsCompleted   = 0;
  totalTriesCount  = 0;
  currentWordTries = 0;
  gameStartTime    = performance.now();
  usedWords.clear();
  updateHUD();
  resetKeyboardColors();
  pickRandomSecret();
  buildGrid();
}

function shakeRow(r) {
  for (let i = 0; i < wordLen; i++) {
    const tile = grid.children[r * wordLen + i];
    if (!tile) continue;
    tile.classList.remove('shake');
    void tile.offsetWidth;
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 600);
  }
}

let messageTimer = null;
function showMessage(text, isError = false) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#b12' : '';
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { if (messageEl) messageEl.textContent = ''; }, 3000);
}

/* ---- Event Listeners ---- */
document.addEventListener('keydown', e => {
  if (isTypingInInput()) return;
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
    e.preventDefault();
    resetFullGame();
  }
});

document.addEventListener('paste', e => {
  if (isTypingInInput() || currentRow >= MAX_ROWS) return;
  handlePaste((e.clipboardData || window.clipboardData).getData('text'));
  e.preventDefault();
});

submitBtn?.addEventListener('click', () => {
  playClickSound();
  submitGuess();
});

window.addEventListener('resize', () => adjustTileSize(wordLen));

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-show-leaderboard')?.addEventListener('click', () => {
    showLeaderboardModal({
      gameId: 'wordle',
      gameTitle: 'Wordle 🔤',
      currentScore: totalTriesCount || 1,
      scoreFormatted: (totalTriesCount || currentWordTries) ? `${totalTriesCount + currentWordTries} essais (${wordsCompleted}/${TARGET_WORDS_COUNT} mots)` : 'En cours',
      isLowerBetter: true,
    });
  });
});

/* ---- Game Initializer ---- */
async function initGame() {
  wordsCompleted   = 0;
  totalTriesCount  = 0;
  currentWordTries = 0;
  gameStartTime    = performance.now();
  usedWords.clear();
  updateHUD();

  renderVirtualKeyboard();

  // Load week answers first so game is instantly playable
  await loadAnswers();
  pickRandomSecret();
  buildGrid();

  // Load the 400k words in background without freezing UI
  loadDictionaryAsync();
}

initGame();
