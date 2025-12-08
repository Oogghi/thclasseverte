import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRID = document.getElementById('grid');
const MSG = document.getElementById('msg');
const POPUP = document.getElementById('game-over-popup');
const FINAL_SCORE_TITLE = document.getElementById('final-score');
const FINAL_DETAILS = document.getElementById('final-details');
//const POPUP_CLOSE = document.getElementById('popup-close');

// ---- SUPABASE ----
const SUPABASE_URL = "https://rwloeubpmlnrycyzhzuo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let words = [];
let tiles = [];
let first = null;
let second = null;
let lock = false;

// scoring
let flipsCount = 0;   // number of individual card clicks
let triesCount = 0;   // number of attempts (every time a second card is flipped)
let matchesCount = 0; // number of matched pairs

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

function show(msg, timeout=2000){
  MSG.textContent = msg;
  if(timeout>0){
    setTimeout(()=>{ MSG.textContent=''; }, timeout);
  }
}

// ---- LOAD WORDS FROM SUPABASE ----
async function loadWords(){
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const cases = parseInt(urlParams.get("cases") || "1");
    const weekIndex = Math.floor((cases - 1) / 4) + 1;

    const { data, error } = await supabase
      .from("weeks")
      .select("boxes")
      .eq("position", weekIndex)
      .single();

    if(error) throw error;

    const allWords = data.boxes.flatMap(b => b.words);
    words = allWords; // <-- keep words as-is (with accents)

    startGame();
  } catch(err) {
    console.error("Erreur chargement supabase", err);
    alert("Préviens le maitre si tu vois ceci !")
    words = ["Erreur", "Erreur", "Erreur", "Erreur", "Erreur", "Erreur", "Erreur", "Erreur",  
              "Erreur", "Erreur", "Erreur", "Erreur", "Erreur", "Erreur", "Erreur", "Erreur"];
    startGame();
  }
}

// ---- FIT TEXT TO TILE (single-line guaranteed) ----
function fitTextToTileSingleLine(backSpan, tileEl){
  const txt = backSpan.textContent || '';
  const tileStyle = getComputedStyle(tileEl);
  const paddingLeft = parseFloat(tileStyle.paddingLeft || 8);
  const paddingRight = parseFloat(tileStyle.paddingRight || 8);

  // compute available width inside the tile for the text
  const tileWidth = tileEl.clientWidth - paddingLeft - paddingRight;
  const tileHeight = tileEl.clientHeight;

  // start font-size relative to tile size (max)
  let fs = Math.floor(tileHeight * 0.5); // initial guess: 50% of tile height
  const minFs = 10;
  const maxFs = 22;  // taille maximum (modifiable)

  fs = Math.min(maxFs, Math.max(minFs, fs));

  // apply font-size, then shrink until the text fits in one line (scrollWidth <= clientWidth)
  backSpan.style.fontSize = fs + 'px';
  backSpan.style.whiteSpace = 'nowrap'; // ensure single line (redundant with CSS)
  backSpan.style.lineHeight = '1';

  // If scrollWidth is larger than available width, reduce font size until it fits (or min)
  // Use a loop that reduces by 1px increments for precision.
  // A safety cap on iterations prevents accidental infinite loops.
  let attempts = 0;
  const maxAttempts = 100;
  while(attempts < maxAttempts){
    const scrollW = backSpan.scrollWidth;
    const clientW = backSpan.clientWidth;
    // scrollWidth includes padding; compare to the visible width (clientWidth)
    if(scrollW <= clientW || fs <= minFs) break;
    fs = fs - 1;
    backSpan.style.fontSize = fs + 'px';
    attempts++;
  }

  // If the resulting font-size is tiny and still doesn't fit, we keep it at minFs (rare)
  if(fs < minFs) backSpan.style.fontSize = minFs + 'px';
}

// adjust all backs (called after grid created and on resize)
function adjustAllCardFonts(){
  tiles.forEach(tile => {
    const backSpan = tile.querySelector('.back');
    fitTextToTileSingleLine(backSpan, tile);
  });
}

// ---- BUILD GAME ----
function startGame(){
  // reset scoring
  flipsCount = 0;
  triesCount = 0;
  matchesCount = 0;

  const pairWords = [...words, ...words]; // duplicated words
  shuffle(pairWords);

  GRID.innerHTML = '';
  tiles = [];

  for(let i=0;i<pairWords.length;i++){
    const div = document.createElement('div');
    div.className = 'tile';
    div.dataset.word = pairWords[i];

    const front = document.createElement('span');
    front.className = 'front';
    front.textContent = '';

    const back = document.createElement('span');
    back.className = 'back';
    back.textContent = pairWords[i].toUpperCase();

    div.appendChild(front);
    div.appendChild(back);

    div.addEventListener('click', onTileClick);
    GRID.appendChild(div);
    tiles.push(div);
  }

  first = null;
  second = null;
  lock = false;

  // wait a frame so layout is settled, then fit fonts
  requestAnimationFrame(() => {
    adjustAllCardFonts();
  });

  hideGameOver();
}

// ---- TILE CLICK ----
function onTileClick(e){
  if(lock) return;
  const t = e.currentTarget;
  if(t.classList.contains('flipped') || t.classList.contains('matched')) return;

  // increment flips
  flipsCount++;

  t.classList.add('flipped');

  if(!first){
    first = t;
  } else {
    // second card chosen
    second = t;
    triesCount++;
    lock = true;
    setTimeout(checkMatch, 600);
  }
}

function checkMatch(){
  if(first.dataset.word === second.dataset.word){
    first.classList.add('matched');
    second.classList.add('matched');
    matchesCount++;
  } else {
    first.classList.remove('flipped');
    second.classList.remove('flipped');
  }
  first = null;
  second = null;
  lock = false;

  if(matchesCount === words.length){
    showGameOver();
  }
}

// ---- GAME OVER POPUP ----
function showGameOver(){
  // calculs de base
  const efficiency = triesCount > 0 ? Math.round((matchesCount / triesCount) * 100) : 0;
  const approxTriesFromFlips = Math.round(flipsCount / 2);

  // === FORMULE DE SCORE (modifiable) ===
  // Option B: mix efficacité (80%) + bonus rapidité (20%)
  // minPossibleFlips = matchesCount * 2
  const minPossibleFlips = matchesCount * 2;
  const speedBonus = Math.max(0, (minPossibleFlips / Math.max(1, flipsCount))); // 1 => 1 = meilleur bonus
  const efficiencyPart = (matchesCount / Math.max(1, triesCount)) * 800; // 0..800
  const speedPart = speedBonus * 200; // 0..200
  const score = Math.round(efficiencyPart + speedPart); // total 0..1000

  // affichage principal (gros titre)
  FINAL_SCORE_TITLE.textContent = 'Score : ' + score.toLocaleString();

  // détails (multi-ligne via innerHTML)
  FINAL_DETAILS.innerHTML =
    `Tentatives : ${triesCount} <br>` +
    `Efficacité : ${efficiency}%`;

  // affiche la popup et focus sur le bouton
  POPUP.classList.remove('hidden');
  //POPUP_CLOSE.focus();
}

function hideGameOver(){
  POPUP.classList.add('hidden');
}

// Attempt to close the tab when user clicks "Fermer".
// Many browsers block window.close() unless the page was opened by script.
// We'll try window.close(); if it does not close, fallback to navigate to about:blank and hide the popup.
/* POPUP_CLOSE.addEventListener('click', () => {
  window.location.href = "finish.html";
});*/

// clicking overlay outside content hides popup (keeps current tab open)
POPUP.addEventListener('click', (e) => {
  if(e.target === POPUP){
    window.location.href = "finish.html";
  }
});

// recalc fonts on resize (debounced)
let resizeTimer = null;
window.addEventListener('resize', () => {
  if(resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    adjustAllCardFonts();
    resizeTimer = null;
  }, 120);
});

// ---- INIT ----
loadWords();