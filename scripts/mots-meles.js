import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://rwloeubpmlnrycyzhzuo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


const gridSize = 12;
const grid = document.getElementById("grid");
const secretSpan = document.getElementById("secret");
let tiles = [];
let selectedWords = [];
let selection = [];
let selecting = false;
let selDirection = null; // [dx, dy] ou null

function getWeekPositionFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cases = parseInt(params.get('cases') || '1', 10);
  return Math.floor((cases - 1) / 4) + 1;
}

// création grille vide
function createGrid(){
  grid.innerHTML = "";
  tiles = [];
  for(let x=0;x<gridSize;x++){
    for(let y=0;y<gridSize;y++){
      const t = document.createElement("div");
      t.className = "tile";
      t.dataset.x = x;
      t.dataset.y = y;
      t.textContent = "";
      grid.appendChild(t);
      tiles.push(t);
    }
  }
}

// utilitaire pour sanitizer id de li
function sanitizeId(s){
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

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
    
    shuffleArray(words); // shuffle before selecting
    selectedWords = words.slice(0, Math.min(10, words.length));

    console.log(`Loaded ${selectedWords.length} words from week position ${weekPosition}`);
  } catch (e) {
    console.error("Erreur Supabase:", e);
  }
}

// directions possibles (8 directions)
const directions = [
  [0,1],   // droite
  [1,0],   // bas
  [0,-1],  // gauche
  [-1,0],  // haut
  [1,1],   // diag bas-droite
  [-1,1],  // diag bas-gauche
  [1,-1],  // diag haut-droite
  [-1,-1], // diag haut-gauche
];

// Vérifie si un mot peut être placé à x,y dans la direction dx,dy
function canPlace(word, x, y, dx, dy){
  for(let i=0;i<word.length;i++){
    let nx = x + dx*i;
    let ny = y + dy*i;
    if(nx<0 || ny<0 || nx>=gridSize || ny>=gridSize) return false;
    let tile = tiles[nx*gridSize + ny];
    // si case remplie, la lettre doit matcher
    if(tile.textContent !== "" && tile.textContent !== word[i]) return false;
  }
  return true;
}

// place un mot à x,y avec direction dx,dy (word doit être en majuscule)
function placeWord(word, x, y, dx, dy){
  for(let i=0;i<word.length;i++){
    let nx = x + dx*i;
    let ny = y + dy*i;
    tiles[nx*gridSize + ny].textContent = word[i];
  }
}

// placement aléatoire pour tous les mots avec retries
function placeWords(words){
  // on travaille sur une copie en majuscule
  const wordsUpper = words.map(w => w.toUpperCase()).sort((a,b)=>b.length - a.length);

  const maxOverallAttempts = 80; // si on n'y arrive pas, on recommence la grille
  let overallAttempts = 0;

  while(true){
    // vide la grille (avant tentative)
    tiles.forEach(t => t.textContent = "");
    let failed = false;

    for(const word of wordsUpper){
      let placed = false;
      // générer toutes les positions valides mais randomisées
      let positions = [];
      for(let x=0;x<gridSize;x++){
        for(let y=0;y<gridSize;y++){
          for(const [dx,dy] of directions){
            if(canPlace(word, x, y, dx, dy)) positions.push({x,y,dx,dy});
          }
        }
      }
      // shuffle positions
      for(let i=positions.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }

      // essayer les positions jusqu'à en trouver une
      for(const pos of positions){
        placeWord(word, pos.x, pos.y, pos.dx, pos.dy);
        placed = true;
        break;
      }

      if(!placed){
        // échec pour ce mot → on marque failed et quitter la boucle pour refaire un essai
        console.warn("Échec placement pour", word);
        failed = true;
        break;
      }
    }

    overallAttempts++;
    if(!failed){
      // tout placé -> remplir les vides et break
      tiles.forEach(t=>{
        if(!t.textContent) t.textContent = String.fromCharCode(65 + Math.floor(Math.random()*26));
      });
      break;
    } else if(overallAttempts >= maxOverallAttempts){
      console.error("Impossible de placer tous les mots après", overallAttempts, "tentatives");
      // pour éviter boucle infinie on place ce qu'on a et on remplit
      tiles.forEach(t=>{
        if(!t.textContent) t.textContent = String.fromCharCode(65 + Math.floor(Math.random()*26));
      });
      break;
    } // else recommence la boucle
  }
}

// Afficher la liste de mots
function showWordList(words) {
  const ul = document.getElementById("wordList");
  ul.innerHTML = "";
  words.forEach(m => {
    const li = document.createElement("li");
    li.textContent = m.toUpperCase();
    li.id = "word-" + sanitizeId(m);
    ul.appendChild(li);
  });
}

// ---------------- sélection souris améliorée ----------------

// helper pour lire coords d'une tile
function coordsOf(tile){
  return [parseInt(tile.dataset.x,10), parseInt(tile.dataset.y,10)];
}

// vérifie si b est adjacent à a selon une direction (dx,dy)
function isAdjacent(a,b){
  const [ax,ay] = coordsOf(a);
  const [bx,by] = coordsOf(b);
  const dx = bx-ax;
  const dy = by-ay;
  // normalise à -1,0,1
  if(Math.abs(dx)>1 || Math.abs(dy)>1) return false;
  if(dx===0 && dy===0) return false;
  return true;
}

// calcule direction normalisée entre t1->t2
function directionBetween(t1,t2){
  const [x1,y1] = coordsOf(t1);
  const [x2,y2] = coordsOf(t2);
  const dx = x2-x1;
  const dy = y2-y1;
  return [dx===0?0:dx/Math.abs(dx), dy===0?0:dy/Math.abs(dy)];
}

function addSelection(tile){
  // si tile déjà sélectionnée -> gérer désélection/backtrack
  if(selection.includes(tile)){
    const first = selection[0];
    const last = selection[selection.length-1];
    if(tile === last){
      // désélection du dernier
      last.classList.remove("selected");
      selection.pop();
      // si plus qu'un élément, recalculer selDirection, sinon null
      if(selection.length >= 2){
        selDirection = directionBetween(selection[0], selection[1]);
      } else {
        selDirection = null;
      }
    } else if(tile === first){
      // désélection du premier
      first.classList.remove("selected");
      selection.shift();
      if(selection.length >= 2){
        selDirection = directionBetween(selection[0], selection[1]);
      } else {
        selDirection = null;
      }
    }
    return;
  }

  // nouvelle sélection
  if(selection.length === 0){
    selection.push(tile);
    tile.classList.add("selected");
    selDirection = null;
    return;
  }

  if(selection.length === 1){
    // deuxième tile → accept only if adjacent
    if(!isAdjacent(selection[0], tile)) return;
    selDirection = directionBetween(selection[0], tile);
    selection.push(tile);
    tile.classList.add("selected");
    return;
  }

  // length >= 2 -> on peut ajouter à la fin OU au début si ça suit la ligne
  const first = selection[0];
  const last = selection[selection.length-1];
  const [fx,fy] = coordsOf(first);
  const [lx,ly] = coordsOf(last);
  const [dx,dy] = selDirection;

  // candidate pour la fin
  if(parseInt(tile.dataset.x) === lx + dx && parseInt(tile.dataset.y) === ly + dy){
    selection.push(tile);
    tile.classList.add("selected");
    return;
  }

  // candidate pour le début (extension à l'avant)
  if(parseInt(tile.dataset.x) === fx - dx && parseInt(tile.dataset.y) === fy - dy){
    selection.unshift(tile);
    tile.classList.add("selected");
    return;
  }

  // sinon ignorer (force les lignes droites/diagonales)
}

// reset la selection
function clearSelection(){
  selection.forEach(t=>t.classList.remove("selected"));
  selection=[];
  selDirection=null;
}

// validation de la sélection quand on lâche la souris
function validateSelection(){
  if(selection.length===0) return;
  const mot = selection.map(t=>t.textContent).join("");
  const rev = selection.map(t=>t.textContent).reverse().join("");
  const upperWords = selectedWords.map(w=>w.toUpperCase());

  if(upperWords.includes(mot) || upperWords.includes(rev)){
    selection.forEach(t=>{ t.classList.remove("selected"); t.classList.add("found"); });
    const foundWord = upperWords.includes(mot)?mot:rev;
    const li = document.getElementById("word-"+sanitizeId(foundWord));
    if(li) li.classList.add("found");
    checkWin();
  }
  clearSelection();
  selecting = false;
}

// ---------------- extract secret ----------------
function checkWin(){
  let allFound = selectedWords.every(w => {
    const li = document.getElementById("word-"+sanitizeId(w));
    return li && li.classList.contains("found");
  });
  if(allFound){
    secretSpan.textContent = "Bravo !"
  }
}

// --------- events souris ----------
grid.addEventListener("mousedown", e=>{
  if(e.target.classList.contains("tile")){
    selecting = true;
    clearSelection();
    addSelection(e.target);
  }
});
grid.addEventListener("mouseover", e=>{
  if(selecting && e.target.classList.contains("tile")){
    addSelection(e.target);
  }
});
document.addEventListener("mouseup", ()=>{
  if(selecting){
    validateSelection();
    selecting = false;
  }
});

// bouton générer
document.getElementById("generate").addEventListener("click", async () => {
  if(selectedWords.length === 0){
    return;
  }

  // Shuffle and pick 10 words each time
  const shuffled = [...selectedWords];
  shuffleArray(shuffled);
  const wordsForThisGrid = shuffled.slice(0, Math.min(10, shuffled.length));

  createGrid();
  placeWords(wordsForThisGrid);
  showWordList(wordsForThisGrid); // pass words for this grid
  secretSpan.textContent="";
});

async function init() {
  createGrid();                    // create empty grid
  await loadWordsFromSupabase();   // load words from supabase
  if(selectedWords.length > 0){
    placeWords(selectedWords);     // place words on grid
    showWordList(selectedWords);   // display word list
  }
  secretSpan.textContent = "";
}

init();  // call on page load