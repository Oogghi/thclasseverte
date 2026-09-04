// scripts/memory.js
// Memory card-matching game for TH Classe Verte.
import { triggerEndGameSequence, showLeaderboardModal } from './leaderboard.js';
import { playWordSuccessSound } from './sound.js';
import { celebrateElement, markError } from './game-feedback.js';
import { loadWeekWords, shuffle } from './words-utils.js';

// --- DOM ---
const GRID = document.getElementById('grid');

// --- State ---
let words        = [];
let tiles        = [];
let firstCard    = null;
let secondCard   = null;
let locked       = false;
let flipsCount   = 0;
let triesCount   = 0;
let matchesCount = 0;
let startTime    = Date.now();

// --- Load words ---
async function loadWords() {
  words = await loadWeekWords();
  // Limit to 8 words (16 cards) for standard 4x4 memory grid
  if (words.length > 8) {
    words = words.slice(0, 8);
  }
  startGame();
}

// --- Font sizing: cleanly fit word on tile without layout thrashing ---
function fitTextToTile(backSpan, tileEl) {
  if (!backSpan || !tileEl) return;
  const tileWidth  = tileEl.clientWidth || 100;
  const tileHeight = tileEl.clientHeight || 100;
  const wordLength = (backSpan.textContent || '').length || 6;

  const maxSize = Math.min(26, Math.floor(tileHeight * 0.4));
  const minSize = 11;

  // Approximate character width ratio for Outfit bold uppercase is ~0.62
  const estimatedSize = Math.floor((tileWidth - 16) / (wordLength * 0.62));
  let fs = Math.max(minSize, Math.min(maxSize, estimatedSize));

  backSpan.style.fontSize   = `${fs}px`;
  backSpan.style.whiteSpace = 'nowrap';
  backSpan.style.lineHeight = '1';

  // Single correction step if text slightly overflows
  if (backSpan.scrollWidth > backSpan.clientWidth && fs > minSize) {
    fs = Math.max(minSize, Math.floor(fs * (backSpan.clientWidth / backSpan.scrollWidth)));
    backSpan.style.fontSize = `${fs}px`;
  }
}

function adjustAllCardFonts() {
  tiles.forEach(tile => {
    const backSpan = tile.querySelector('.back');
    if (backSpan) fitTextToTile(backSpan, tile);
  });
}

// --- Build game board ---
function startGame() {
  flipsCount   = 0;
  triesCount   = 0;
  matchesCount = 0;
  startTime    = Date.now();

  const paired = [...words, ...words];
  shuffle(paired);

  GRID.innerHTML = '';
  tiles = [];

  for (const word of paired) {
    const div = document.createElement('div');
    div.className    = 'tile';
    div.dataset.word = word;

    const front = document.createElement('span');
    front.className = 'front';

    const back = document.createElement('span');
    back.className   = 'back';
    back.textContent = String(word).toUpperCase();

    div.appendChild(front);
    div.appendChild(back);
    div.addEventListener('click', onTileClick);
    GRID.appendChild(div);
    tiles.push(div);
  }

  firstCard  = null;
  secondCard = null;
  locked     = false;

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
    setTimeout(checkMatch, 500);
  }
}

function checkMatch() {
  if (firstCard.dataset.word === secondCard.dataset.word) {
    playWordSuccessSound();
    firstCard.classList.add('matched');
    secondCard.classList.add('matched');
    celebrateElement(firstCard);
    celebrateElement(secondCard, '+1 paire');
    matchesCount++;

    if (matchesCount === words.length) {
      const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
      const m = Math.floor(elapsedSec / 60);
      const s = String(elapsedSec % 60).padStart(2, '0');
      const timeFormatted = `${m}m${s}s`;

      triggerEndGameSequence({
        gameId: 'memory',
        gameTitle: 'Memory 🃏',
        currentScore: flipsCount,
        scoreFormatted: `${flipsCount} coups • ${timeFormatted}`,
        isLowerBetter: true,
        extraMetrics: {
          moves: flipsCount,
          timeElapsed: elapsedSec,
        },
      });
    }
  } else {
    markError(firstCard);
    markError(secondCard);
    firstCard.classList.remove('flipped');
    secondCard.classList.remove('flipped');
  }
  firstCard  = null;
  secondCard = null;
  locked     = false;
}

// --- Events ---
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
  resizeTimer = setTimeout(adjustAllCardFonts, 100);
});

// --- Init ---
loadWords();
