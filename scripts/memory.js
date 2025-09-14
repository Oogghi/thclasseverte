import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const GRID = document.getElementById('grid');
const RESET_BTN = document.getElementById('reset');
const MSG = document.getElementById('msg');

// ---- SUPABASE ----
const SUPABASE_URL = "https://rwloeubpmlnrycyzhzuo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let words = [];
let tiles = [];
let first = null;
let second = null;
let lock = false;

// ---- HELPERS ----
function strip(s){
  if(!s) return '';
  return s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
}

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
    // récupérer le paramètre ?cases=
    const urlParams = new URLSearchParams(window.location.search);
    const cases = parseInt(urlParams.get("cases") || "1");

    // calcul de la semaine : (cases - 1) / 4 + 1
    const weekIndex = Math.floor((cases - 1) / 4) + 1;

    const { data, error } = await supabase
      .from("weeks")
      .select("boxes")
      .eq("position", weekIndex)
      .single();

    if(error) throw error;

    // chaque semaine = 4 box × 4 mots
    const allWords = data.boxes.flatMap(b => b.words);
    words = allWords.map(w => strip(w));

    startGame();
  } catch(err) {
    console.error("Erreur chargement supabase", err);
    // fallback
    words = ['pomme','table','chien','fleur','voiture','maison','arbre','ordinateur',
             'stylo','livre','soleil','lune','voile','bateau','plage','montagne'];
    startGame();
  }
}

// ---- BUILD GAME ----
function startGame(){
  const pairWords = [...words, ...words]; // 32 cartes
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
}

// ---- TILE CLICK ----
function onTileClick(e){
  if(lock) return;
  const t = e.currentTarget;
  if(t.classList.contains('flipped') || t.classList.contains('matched')) return;

  t.classList.add('flipped');

  if(!first){
    first = t;
  } else {
    second = t;
    lock = true;
    setTimeout(checkMatch, 600);
  }
}

function checkMatch(){
  if(first.dataset.word === second.dataset.word){
    first.classList.add('matched');
    second.classList.add('matched');
  } else {
    first.classList.remove('flipped');
    second.classList.remove('flipped');
  }
  first = null;
  second = null;
  lock = false;

  if(tiles.every(t=>t.classList.contains('matched'))){
    show('Bravo, tu as trouvé toutes les paires !', 0);
  }
}

// ---- RESET ----
RESET_BTN.addEventListener('click', startGame);

// ---- INIT ----
loadWords();