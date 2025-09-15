// Light Wordle-like with variable-length words (secret length can change)
// - uses ./mots.txt (guesses) and ./mots_dispo.txt (answers)
// - secret picked & persisted in localStorage per device
// - grid rebuilt dynamically to match secret length
// - accepts guesses only of the secret's length and validates against dict for that length

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://rwloeubpmlnrycyzhzuo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1; // matches 'position' column
}

// ---------- UTILITY: fetch text file and split into stripped words ----------
async function fetchFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(strip); // strip accents & lowercase
}

// CONFIG
const MAX_ROWS = 12;
const DICT_URL = '../mots.txt';

let dictByLen = new Map();  // length -> Set(words)
let answerPool = [];        // array of stripped words (various lengths)
let secret = '';            // stripped secret (e.g. 'ordinateur' -> 'ordinateur')
let secretLen = 5;

let row = 0, col = 0;
let board = [];             // built after grid creation: [ [..], ... ]

// DOM
const grid = document.getElementById('grid');
const submitBtn = document.getElementById('submit');
const resetBtn = document.getElementById('reset');
const msg = document.getElementById('msg');

// accent-stripping
function strip(s){
  if(!s) return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// ---------- TILE MANAGEMENT ----------
function setTile(r,c,ch){
  const idx = r * secretLen + c;
  const tile = grid.children[idx];
  const caret = tile.querySelector && tile.querySelector('.caret');
  if(ch){
    tile.textContent = ch.toUpperCase();
  } else {
    tile.textContent = '';
  }
  if(caret) tile.appendChild(caret);
  tile.classList.toggle('filled', !!ch);
}

// ---------- CARET: blinking underscore inside active tile ----------
function updateCaret(){
  // remove old carets
  grid.querySelectorAll('.caret').forEach(n => n.remove());
  grid.querySelectorAll('.tile.active').forEach(t => t.classList.remove('active'));

  if(row >= MAX_ROWS) return;
  if(col < 0 || col >= secretLen) return;

  const idx = row * secretLen + col;
  const tile = grid.children[idx];
  if(!tile) return;

  // don't make caret active if the tile is missing
  if(tile.classList.contains('missing')) return;

  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.textContent = '_';
  tile.appendChild(caret);

  tile.classList.add('active');
}

// ---------- LOAD LISTS ----------
async function loadAnswerPoolFromSupabase() {
  const weekPosition = getWeekPositionFromURL();
  console.log(`Fetching week from Supabase: position = ${weekPosition}`); // <-- log

  try {
    const { data, error } = await supabase
      .from('weeks')
      .select('boxes')
      .eq('position', weekPosition);

    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No week found');

    // flatten boxes to words
    answerPool = data[0].boxes.flatMap(box => box.words).map(strip);

    console.log(`Loaded ${answerPool.length} words from week ${weekPosition}`); // <-- log

    if (answerPool.length === 0) throw new Error('Empty answer pool');

  } catch (err) {
    console.warn('Failed to load answers from Supabase, falling back to dict', err);
    answerPool = Array.from(dictByLen.get(secretLen) || []);
  }
}

async function loadLists(){
  let dictList = [];
  try{
    dictList = await fetchFile(DICT_URL);
  }catch(err){
    console.warn('Failed to load dict; using fallback small list', err);
    dictList = ['pomme','table','jouer','chien','aimer','fleur','ordinateur','smartphone','voiture','avion'].map(strip);
  }

  dictByLen.clear();
  for(const w of dictList){
    const L = w.length;
    if(!dictByLen.has(L)) dictByLen.set(L, new Set());
    dictByLen.get(L).add(w);
  }

  // load answers from Supabase instead of ANSWER_URL
  await loadAnswerPoolFromSupabase();

  pickOrRestoreSecret();
  buildGridForSecret();
  console.log('secret (device):', secret);
}

// ---------- SECRET MANAGEMENT ----------
function pickOrRestoreSecret() {
  // always pick a random word from the loaded answerPool
  secret = answerPool[Math.floor(Math.random() * answerPool.length)];
  secret = strip(secret);
  secretLen = secret.length;
}

function resetSecretAndState(){
  pickOrRestoreSecret();
  buildGridForSecret();
  show('Actualisation du mot');
}

// ---------- GRID BUILDING ----------
// on ne crée qu'une seule ligne au départ
function buildGridForSecret(){
  grid.innerHTML = '';
  fitTileSize(secretLen);
  board = [];
  addNewRow();          // ajoute la première ligne
  row = 0; col = 0;
  updateCaret();
}

// ajoute une ligne de tiles dans le DOM et dans le board
function addNewRow(){
  const r = board.length; // ligne suivante
  const newRow = Array(secretLen).fill('');
  board.push(newRow);

  for(let c=0;c<secretLen;c++){
    const d = document.createElement('div');
    d.className = 'tile';
    d.dataset.r = r;
    d.dataset.c = c;
    grid.appendChild(d);
  }
}

function fitTileSize(cols){
  const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 8;
  const container = grid.parentElement;
  let containerWidth = container ? container.clientWidth : Math.min(window.innerWidth - 40, 540);
  const size = Math.max(36, Math.min(84, Math.floor((containerWidth - (cols - 1) * gap) / cols)));
  document.documentElement.style.setProperty('--size', size + 'px');
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--size))`;
}

function resetTileClasses(){
  const tiles = grid.children;
  for(let i=0;i<tiles.length;i++){
    tiles[i].className = 'tile';
    tiles[i].textContent = '';
  }
}

// ---------- INPUT HANDLERS ----------
function handleLetter(l){
  if(row >= MAX_ROWS) return;
  if(col >= secretLen) return;
  const letter = strip(l).slice(0,1);
  board[row][col] = letter;
  setTile(row, col, letter);
  col++;
  updateCaret();
}

function handleBack(){
  if(row >= MAX_ROWS) return;
  if(col === 0) return;
  col--;
  board[row][col] = '';
  setTile(row, col, '');
  updateCaret();
}

function handlePaste(text){
  if(row >= MAX_ROWS) return;
  const letters = strip(text).split('').filter(ch => /[a-z]/.test(ch)).slice(0, secretLen);
  for(let i=0;i<letters.length;i++){
    board[row][i] = letters[i];
    setTile(row, i, letters[i]);
  }
  col = Math.min(secretLen, letters.length);
  updateCaret();
}

// ---------- SUBMISSION / VALIDATION ----------
function submitRow() {
  if (row >= MAX_ROWS) return;

  const guess = board[row].join('').trim(); // gather typed letters

  // allow guesses of length 2 up to secretLen
  if (guess.length < 3 || guess.length > secretLen) {
    show(`Le mot doit comporter entre 3 et ${secretLen} lettres`, true);
    shakeRow(row);
    return;
  }

  // validate dictionary for the guess length
  const dictSet = dictByLen.get(guess.length);
  if (!dictSet || !dictSet.has(guess)) {
    show('Mot invalide !', true);
    shakeRow(row);
    return;
  }

  const sArr = secret.split('');
  const status = Array(guess.length).fill('absent');

  // first pass: correct letters in correct positions
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === sArr[i]) {
      status[i] = 'correct';
      sArr[i] = null;
    }
  }

  // second pass: letters present elsewhere
  for (let i = 0; i < guess.length; i++) {
    if (status[i] === 'correct') continue;
    const idx = sArr.indexOf(guess[i]);
    if (idx !== -1) {
      status[i] = 'present';
      sArr[idx] = null;
    }
  }

  // apply colors to typed letters
  for (let i = 0; i < guess.length; i++) {
      const idx = row * secretLen + i;
      const tile = grid.children[idx];
      tile.textContent = guess[i].toUpperCase(); // typed letter
      tile.classList.remove('absent', 'present', 'correct', 'missing');
      tile.classList.add(status[i]); // correct / present / absent
  }

  // fill remaining tiles with red underscores
  for (let i = guess.length; i < secretLen; i++) {
    const idx = row * secretLen + i;
    const tile = grid.children[idx];

    tile.textContent = '';                       // empty
    const oldCaret = tile.querySelector('.caret');
    if (oldCaret) oldCaret.remove();             // remove any caret
    tile.classList.remove('absent','present','correct');
    tile.classList.add('missing');               // red background
  }

  // win check: only if full word matches secret
  if (guess.length === secretLen && status.every(s => s === 'correct')) {
    show(`Bravo ! Trouvé en ${row + 1} essai(s).`);
    row = MAX_ROWS;
    updateCaret();
    return;
  }

  // move to next row
  row++;
  col = 0;

  // n'ajoute une nouvelle ligne que si on n'a pas encore atteint MAX_ROWS
  if(row < MAX_ROWS) addNewRow();

  updateCaret();
}

// ---------- VISUAL HELPERS ----------
function shakeRow(r){
  for(let i=0;i<secretLen;i++){
    const idx = r * secretLen + i;
    const tile = grid.children[idx];
    tile.classList.remove('shake');
    void tile.offsetWidth;
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 600);
  }
}

let tmo = null;
function show(text, isError = false){
  msg.textContent = text;
  msg.style.color = isError ? '#b12' : '';
  clearTimeout(tmo);
  tmo = setTimeout(()=> msg.textContent = '', 3000);
}

// ---------- RESET UI ----------
function resetBoardUI(){
  resetTileClasses();
  board = Array.from({length: MAX_ROWS}, () => Array(secretLen).fill(''));
  row = 0; col = 0;
  show('Partie réinitialisée');
  updateCaret();
}

// ---------- EVENT LISTENERS ----------
document.addEventListener('keydown', e => {
  if(row >= MAX_ROWS && e.key !== 'r') return;
  if(e.key === 'Backspace'){ e.preventDefault(); handleBack(); }
  else if(e.key === 'Enter'){ e.preventDefault(); submitRow(); }
  else if(e.key.length === 1 && /[a-zA-ZÀ-ÖØ-öø-ÿ-]/.test(e.key)){
    e.preventDefault();
    handleLetter(e.key);
  }
});
document.addEventListener('paste', e => {
  if(row >= MAX_ROWS) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  handlePaste(text);
  e.preventDefault();
});

submitBtn.addEventListener('click', submitRow);
resetBtn.addEventListener('click', () => { resetSecretAndState(); });
window.addEventListener('resize', () => { fitTileSize(secretLen); });

// ---------- INIT ----------
loadLists();