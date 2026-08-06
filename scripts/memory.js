import { getBoxes } from './fetch_json.js';

// --- DOM ---
const GRID          = document.getElementById('grid');
const POPUP         = document.getElementById('game-over-popup');
const SCORE_TITLE   = document.getElementById('final-score');
const SCORE_DETAILS = document.getElementById('final-details');

// --- State ---
let words        = [];
let tiles        = [];
let firstCard    = null;
let secondCard   = null;
let locked       = false;
let flipsCount   = 0;
let triesCount   = 0;
let matchesCount = 0;

// --- Helpers ---
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getWeekPositionFromURL() {
  const cases = parseInt(new URLSearchParams(window.location.search).get('cases') || '1');
  return Math.floor((cases - 1) / 4) + 1;
}

// --- Load words ---
async function loadWords() {
  try {
    const boxes = await getBoxes(getWeekPositionFromURL());
    if (!boxes) throw new Error('Semaine introuvable');
    words = boxes.flatMap(b => b.words);
  } catch (err) {
    console.error('Erreur chargement:', err);
    alert('Préviens le maitre si tu vois ceci !');
    words = Array(16).fill('Erreur');
  }
  startGame();
}

// --- Font sizing: shrink until word fits on one line ---
function fitTextToTile(backSpan, tileEl) {
  const style   = getComputedStyle(tileEl);
  const padH    = parseFloat(style.paddingLeft || 8) + parseFloat(style.paddingRight || 8);
  const maxSize = 22;
  const minSize = 10;

  let fs = Math.min(maxSize, Math.max(minSize, Math.floor(tileEl.clientHeight * 0.5)));
  backSpan.style.fontSize   = fs + 'px';
  backSpan.style.whiteSpace = 'nowrap';
  backSpan.style.lineHeight = '1';

  for (let i = 0; i < 100 && fs > minSize && backSpan.scrollWidth > backSpan.clientWidth; i++) {
    backSpan.style.fontSize = --fs + 'px';
  }
}

function adjustAllCardFonts() {
  tiles.forEach(tile => fitTextToTile(tile.querySelector('.back'), tile));
}

// --- Build game board ---
function startGame() {
  flipsCount   = 0;
  triesCount   = 0;
  matchesCount = 0;

  const paired = [...words, ...words];
  shuffle(paired);

  GRID.innerHTML = '';
  tiles = [];

  for (const word of paired) {
    const div  = document.createElement('div');
    div.className    = 'tile';
    div.dataset.word = word;

    const front = document.createElement('span');
    front.className = 'front';

    const back = document.createElement('span');
    back.className   = 'back';
    back.textContent = word.toUpperCase();

    div.appendChild(front);
    div.appendChild(back);
    div.addEventListener('click', onTileClick);
    GRID.appendChild(div);
    tiles.push(div);
  }

  firstCard  = null;
  secondCard = null;
  locked     = false;

  hidePopup();
  requestAnimationFrame(adjustAllCardFonts);
}

// --- Card interaction ---
function onTileClick(e) {
  if (locked) return;
  const card = e.currentTarget;
  if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

  flipsCount++;
  card.classList.add('flipped');

  if (!firstCard) {
    firstCard = card;
  } else {
    secondCard = card;
    triesCount++;
    locked = true;
    setTimeout(checkMatch, 600);
  }
}

function checkMatch() {
  if (firstCard.dataset.word === secondCard.dataset.word) {
    firstCard.classList.add('matched');
    secondCard.classList.add('matched');
    matchesCount++;
    if (matchesCount === words.length) showPopup();
  } else {
    firstCard.classList.remove('flipped');
    secondCard.classList.remove('flipped');
  }
  firstCard  = null;
  secondCard = null;
  locked     = false;
}

// --- Scoring ---
function computeScore() {
  const minFlips   = matchesCount * 2;
  const speedBonus = Math.max(0, minFlips / Math.max(1, flipsCount));
  const efficiency = (matchesCount / Math.max(1, triesCount)) * 800;
  return Math.round(efficiency + speedBonus * 200);
}

import { showLeaderboardModal } from './leaderboard.js';

let startTime = Date.now();

// --- Popup ---
function showPopup() {
  const score      = computeScore();
  const efficiency = triesCount > 0 ? Math.round((matchesCount / triesCount) * 100) : 0;
  const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));

  SCORE_TITLE.textContent = '🎉 Bravo ! Toutes les paires trouvées ! 🌟';
  SCORE_DETAILS.innerHTML = `Temps : <strong>${elapsedSec}s</strong> | Coups : ${flipsCount}<br><span style="color:#2e7d32; font-weight:700;">Quelle mémoire fantastique !</span>`;
  POPUP.classList.remove('hidden');

  setTimeout(() => {
    showLeaderboardModal({
      gameId: 'memory',
      gameTitle: 'Memory 🃏',
      currentScore: elapsedSec,
      scoreFormatted: `${elapsedSec}s (${flipsCount} coups)`,
      isLowerBetter: true,
    });
  }, 400);
}

function hidePopup() {
  POPUP.classList.add('hidden');
}

// --- Events ---
document.getElementById('popup-restart')?.addEventListener('click', () => {
  hidePopup();
  startTime = Date.now();
  loadWords();
});

document.getElementById('btn-show-leaderboard')?.addEventListener('click', () => {
  const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
  showLeaderboardModal({
    gameId: 'memory',
    gameTitle: 'Memory 🃏',
    currentScore: elapsedSec,
    scoreFormatted: `${elapsedSec}s (${flipsCount} coups)`,
    isLowerBetter: true,
  });
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(adjustAllCardFonts, 120);
});

// --- Init ---
startTime = Date.now();
loadWords();
