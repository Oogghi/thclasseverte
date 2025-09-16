// scripts/snake.js
// Jeu Snake : grille 15x15, centré, avec beaux visuels et pop-up "Perdu"
// Version clarifiée, structurée et commentée

(function () {
  // --- CANVAS & UI ---
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const popup = document.getElementById('game-over-popup');
  const finalScoreEl = document.getElementById('final-score');
  const popupRestartBtn = document.getElementById('popup-restart');

  // --- PARAMÈTRES GRILLE & JEU ---
  const GRID_COLS = 30;
  const GRID_ROWS = 15;

  const BASE_SPEED = 2.6;        // vitesse de base (en cellules/s)
  const MAX_SPEED = 12.0;         // vitesse max
  const TIME_ACCEL = 0.0012;     // accélération au fil du temps
  const FOOD_HALF_SAT = 80;      // param pour la formule de vitesse selon pommes mangées
  const FOOD_EXP = 0.6;

  const INITIAL_LENGTH = 3;      // longueur de départ
  const SELF_COLLIDE_SKIP = 4;   // segments ignorés au début pour auto-collision

  // Variables calculées
  let GRID = 32;
  let HEAD_RADIUS = 0;
  let SEGMENT_RADIUS = 0;
  let FOOD_RADIUS = 0;

  // Position et taille du canvas
  let width = 0, height = 0;
  let originX = 0, originY = 0;

  // État du jeu
  let running = true;
  let score = 0;
  let foodsEaten = 0;
  let startTimestamp = null;

  // Snake
  let headCell = { x: 0, y: 0 };
  let headPos = { x: 0, y: 0 };
  let dir = { x: 1, y: 0 };         // direction actuelle
  let desiredDir = null;            // direction souhaitée (entrée joueur)
  let path = [];                    // chemin parcouru (positions successives)
  let segmentCount = INITIAL_LENGTH;
  let segments = [];                // positions calculées des segments

  // Nourriture
  let foodCell = null;
  let foodPos = null;
  let goldenFoodCell = null;
  let goldenFoodPos = null;

  const GOLDEN_CHANCE = 0.2; // 1 chance sur 5
  const GOLDEN_BOOST = 3;    // boost en nombre de segments


  // Timing
  let lastTs = null;
  let blinkTimer = 0;
  let nextBlinkIn = 2 + Math.random() * 4;
  let blinking = false;
  let blinkProgress = 0;
  let goldenBlinkTimer = 0;

  // --- COULEURS ---
  const CELL_A = '#fffef0';
  const CELL_B = '#f0f6b8';
  const SNAKE_A = '#0a66ff';
  const SNAKE_B = '#0033cc';
  const SNAKE_HEAD_BASE = '#1a73ff';
  const FOOD_RED = '#d32b2b';
  const FOOD_RED_DARK = '#861919';
  const STEM_COLOR = '#6b3f10';  // brun pour la tige
  const LEAF_COLOR = '#2e8b2e';  // vert pour la feuille

  // --- OUTILS ---
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function distXY(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
  function normalize(v) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
  function cellCenter(cx, cy) { return { x: originX + cx * GRID + GRID / 2, y: originY + cy * GRID + GRID / 2 }; }
  function isSameCell(a, b) { return a !== null && b !== null && a.x === b.x && a.y === b.y; }  

  // Vitesse courante (augmente avec le temps et les pommes mangées)
  function currentSpeedCells() {
    const elapsedSec = startTimestamp ? (performance.now() - startTimestamp) / 1000 : 0;
    let foodFactor = foodsEaten > 0 ? Math.pow(foodsEaten / (foodsEaten + FOOD_HALF_SAT), FOOD_EXP) : 0;
    let s = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * foodFactor + elapsedSec * TIME_ACCEL;
    return Math.min(s, MAX_SPEED);
  }

  // --- INITIALISATION ---
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
  
    // Taille max possible d'une case pour remplir l'écran sans déborder
    const gridWidth = Math.floor(width / GRID_COLS);
    const gridHeight = Math.floor(height / GRID_ROWS);
    GRID = Math.min(gridWidth, gridHeight); // s'assure que les cases restent carrées

    if (GRID < 12) GRID = 12; // garde une taille minimum lisible
  
    // Centrage de la grille
    originX = Math.floor((width - GRID_COLS * GRID) / 2);
    originY = Math.floor((height - GRID_ROWS * GRID) / 2);
  
    HEAD_RADIUS = Math.floor(GRID * 0.45);
    SEGMENT_RADIUS = Math.floor(GRID * 0.42);
    FOOD_RADIUS = Math.floor(GRID * 0.4);
  
    canvas.width = width;
    canvas.height = height;
  
    if (segments.length) {
      // Ajuste positions serpent + pomme
      segments.forEach(s => { s.x = originX + (s.x - originX) * GRID / GRID; s.y = originY + (s.y - originY) * GRID / GRID; });
      headPos = cellCenter(headCell.x, headCell.y);
      foodPos = cellCenter(foodCell.x, foodCell.y);
      computeSegmentsFromPath();
    } else {
      initGame();
    }
  }  

  function initGame() {
    // Positionne le serpent au centre
    const cx = Math.floor(GRID_COLS / 2), cy = Math.floor(GRID_ROWS / 2);
    headCell = { x: cx, y: cy };
    headPos = cellCenter(cx, cy);
    dir = { x: 1, y: 0 };
    desiredDir = null;

    // Réinitialisation taille du serpent
    segmentCount = INITIAL_LENGTH;
    targetSegmentCount = INITIAL_LENGTH;

    // Initialise le chemin
    path = [{ x: headPos.x, y: headPos.y }];
    for (let i = 1; i < Math.max(segmentCount, 12); i++) {
        path.push({ x: originX + (cx - i) * GRID + GRID / 2, y: originY + cy * GRID + GRID / 2 });
    }
    computeSegmentsFromPath();

    // Reset score et états
    score = 0;
    foodsEaten = 0;
    running = true;
    lastTs = null;
    startTimestamp = performance.now();
    blinkTimer = 0;
    nextBlinkIn = 2 + Math.random() * 4;
    blinking = false;
    blinkProgress = 0;

    placeFood();
    requestAnimationFrame(gameLoop);
  }


  // --- POMME ---
  function placeFood() {
    const occupied = new Set();
    segments.forEach(s => {
      const scx = Math.floor((s.x - originX) / GRID);
      const scy = Math.floor((s.y - originY) / GRID);
      if (scx >= 0 && scx < GRID_COLS && scy >= 0 && scy < GRID_ROWS) {
        occupied.add(scx + ',' + scy);
      }
    });
  
    let fx, fy, attempts = 0;
    do {
      fx = Math.floor(Math.random() * GRID_COLS);
      fy = Math.floor(Math.random() * GRID_ROWS);
      attempts++;
      if (attempts > 1000) break;
    } while (occupied.has(fx + ',' + fy));
  
    // Choix unique : pomme normale OU pomme dorée (jamais les deux)
    const isGolden = Math.random() < GOLDEN_CHANCE;
  
    if (isGolden) {
      goldenFoodCell = { x: clamp(fx, 0, GRID_COLS - 1), y: clamp(fy, 0, GRID_ROWS - 1) };
      goldenFoodPos = cellCenter(goldenFoodCell.x, goldenFoodCell.y);
  
      // aucune pomme normale en même temps
      foodCell = null;
      foodPos = null;
    } else {
      foodCell = { x: clamp(fx, 0, GRID_COLS - 1), y: clamp(fy, 0, GRID_ROWS - 1) };
      foodPos = cellCenter(foodCell.x, foodCell.y);
  
      // pas de golden
      goldenFoodCell = null;
      goldenFoodPos = null;
    }
  }  

  // --- CHEMIN & SEGMENTS ---
  function trimPath(maxLenPx) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], segLen = dist(a, b);
      total += segLen;
      if (total > maxLenPx) {
        path.splice(i + 2);
        break;
      }
    }
  }

  function getPointAtDistance(d) {
    if (d <= 0) return { ...path[0] };
    let traveled = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i], p1 = path[i + 1], segLen = dist(p0, p1);
      if (traveled + segLen >= d) {
        const remain = d - traveled;
        const t = segLen === 0 ? 0 : remain / segLen;
        return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
      }
      traveled += segLen;
    }
    return { ...path[path.length - 1] };
  }

  function computeSegmentsFromPath() {
    const newSegs = [];
    for (let i = 0; i < segmentCount; i++) {
      newSegs.push(getPointAtDistance(i * GRID));
    }
    segments = newSegs;
  }

  // --- BOUCLE PRINCIPALE ---
  function gameLoop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05); // limite dt
    lastTs = ts;

    if (running) {
      update(dt);
      render();
      requestAnimationFrame(gameLoop);
    }
  }

  // --- UPDATE ---
  let targetSegmentCount = segmentCount;      // objectif (nombre de segments souhaité)
const GROW_SEGMENTS_PER_SEC = 2.0;          // vitesse d'allongement (segments par seconde)

// Remplacez computeSegmentsFromPath() par cette version qui gère segmentCount fractionnaire
function computeSegmentsFromPath() {
  const newSegs = [];
  // Nombre de points à afficher : au moins 2, et on arrondit vers le haut pour montrer le segment en croissance
  const displayCount = Math.max(2, Math.ceil(segmentCount));
  for (let i = 0; i < displayCount; i++) {
    // distance le long du chemin pour ce segment.
    // Si on est sur le dernier segment et que segmentCount est fractionnaire,
    // la distance sera entre (floor(segmentCount)-1)*GRID et (ceil-1)*GRID,
    // ce qui crée un déplacement progressif du dernier segment.
    const distance = Math.min(i, Math.max(0, segmentCount - 1)) * GRID;
    newSegs.push(getPointAtDistance(distance));
  }
  segments = newSegs;
}

// Remplacez update(dt) : interpolation de segmentCount vers targetSegmentCount
function update(dt) {
  if (goldenFoodPos) {
    goldenBlinkTimer += dt;
  }

  // Gestion clignement des yeux (inchangé)
  blinkTimer += dt;
  if (!blinking && blinkTimer >= nextBlinkIn) {
    blinking = true;
    blinkProgress = 0;
  }
  if (blinking) {
    blinkProgress += dt * 6;
    if (blinkProgress >= 1) {
      blinking = false;
      blinkTimer = 0;
      nextBlinkIn = 2 + Math.random() * 4;
      blinkProgress = 0;
    }
  }

  // Direction (inchangé)
  const center = cellCenter(headCell.x, headCell.y);
  const atCenter = distXY(headPos.x, headPos.y, center.x, center.y) <= 0.9;
  if (atCenter && desiredDir) {
    if (!(desiredDir.x === -dir.x && desiredDir.y === -dir.y)) {
      dir = { ...desiredDir };
    }
    desiredDir = null;
  }

  // Calcul de la cellule cible (sécurisé car headCell existe)
  const targetCell = {
    x: clamp(headCell.x + dir.x, 0, GRID_COLS - 1),
    y: clamp(headCell.y + dir.y, 0, GRID_ROWS - 1)
  };
  const targetCenter = cellCenter(targetCell.x, targetCell.y);

  const dx = targetCenter.x - headPos.x;
  const dy = targetCenter.y - headPos.y;
  const distToTarget = Math.hypot(dx, dy);

  const move = Math.min(currentSpeedCells() * GRID * dt, distToTarget);

  // Collision avec murs
  if (
    (headCell.x === 0 && dir.x === -1) ||
    (headCell.x === GRID_COLS - 1 && dir.x === 1) ||
    (headCell.y === 0 && dir.y === -1) ||
    (headCell.y === GRID_ROWS - 1 && dir.y === 1)
  ) {
    endGame();
    return;
  }

  // Déplacement vers cible
  if (move >= distToTarget - 0.0001) {
    headPos = { ...targetCenter };
    headCell = { ...targetCell };
    path.unshift({ ...headPos });
    trimPath((segmentCount + 8) * GRID);

    // Collision corps
    for (let i = SELF_COLLIDE_SKIP; i < segments.length; i++) {
      const sCellX = Math.floor((segments[i].x - originX) / GRID);
      const sCellY = Math.floor((segments[i].y - originY) / GRID);
      if (sCellX === headCell.x && sCellY === headCell.y) {
        endGame();
        return;
      }
    }

    // Manger pomme : utilise la comparaison sûre (ne cause plus d'erreur si l'un est null)
    if (isSameCell(headCell, foodCell) || isSameCell(headCell, goldenFoodCell)) {
      eatFood();
    }
  } else {
    const nx = dx / (distToTarget || 1);
    const ny = dy / (distToTarget || 1);
    headPos.x += nx * move;
    headPos.y += ny * move;
    path.unshift({ ...headPos });
    trimPath((segmentCount + 8) * GRID);
  }

  // Interpolation linéaire de la longueur : on approche targetSegmentCount progressivement
  if (segmentCount < targetSegmentCount) {
    segmentCount = Math.min(targetSegmentCount, segmentCount + GROW_SEGMENTS_PER_SEC * dt);
  }

  computeSegmentsFromPath();

  // Collision avec corps (proximité)
  for (let i = SELF_COLLIDE_SKIP; i < segments.length; i++) {
    if (dist(segments[0], segments[i]) < SEGMENT_RADIUS * 0.9) {
      endGame();
      return;
    }
  }
}

// Remplacez eatFood() : on n'augmente plus immédiatement segmentCount, on pousse targetSegmentCount
function eatFood() {
  // Vérifie si le serpent mange la pomme dorée
  if (goldenFoodCell && headCell.x === goldenFoodCell.x && headCell.y === goldenFoodCell.y) {
    score += 10 * GOLDEN_BOOST; // optionnel : score boosté
    foodsEaten += GOLDEN_BOOST;
    targetSegmentCount += GOLDEN_BOOST;
    goldenFoodCell = null;
    goldenFoodPos = null;
  } 
  // Sinon, pomme normale
  else if (headCell.x === foodCell.x && headCell.y === foodCell.y) {
    score += 10;
    foodsEaten++;
    targetSegmentCount = Math.max(targetSegmentCount, segmentCount) + 1;
  }

  // Garantir que le path est suffisamment long
  path.push(path[path.length - 1] || { x: headPos.x - targetSegmentCount * GRID, y: headPos.y });

  // Place de nouvelles pommes après la consommation
  placeFood();
}

  function endGame() {
    running = false;
    finalScoreEl.textContent = 'Score: ' + score;
    popup.classList.remove('hidden');
  }

  // restart via pop-up
  popupRestartBtn.addEventListener('click', () => {
    popup.classList.add('hidden');
    initGame();
  });

  // --- RENDER ---
  function render() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fbffd8';
    ctx.fillRect(0, 0, width, height);

    // Grille en damier
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? CELL_A : CELL_B;
        ctx.fillRect(originX + x * GRID, originY + y * GRID, GRID, GRID);
      }
    }

    // Bordure grille
    ctx.save();
    ctx.lineWidth = Math.max(2, Math.floor(GRID * 0.06));
    ctx.strokeStyle = 'rgba(0,32,0,0.12)';
    ctx.strokeRect(originX + 0.5, originY + 0.5, GRID_COLS * GRID - 1, GRID_ROWS * GRID - 1);
    ctx.restore();

    // --- Pomme normale (si présente) ---
    if (foodPos) {
      ctx.save();
      // Fruit rouge
      ctx.fillStyle = FOOD_RED;
      ctx.beginPath();
      ctx.arc(foodPos.x, foodPos.y, FOOD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      // Tige
      ctx.fillStyle = STEM_COLOR;
      const stemW = Math.max(2, FOOD_RADIUS * 0.18);
      const stemH = Math.max(4, FOOD_RADIUS * 0.6);
      ctx.fillRect(foodPos.x - stemW / 2, foodPos.y - FOOD_RADIUS * 0.9, stemW, stemH);

      // Feuille
      ctx.beginPath();
      ctx.fillStyle = LEAF_COLOR;
      ctx.ellipse(
        foodPos.x + FOOD_RADIUS * 0.3,
        foodPos.y - FOOD_RADIUS * 1.1,
        FOOD_RADIUS * 0.45,
        FOOD_RADIUS * 0.22,
        -0.6,
        0, Math.PI * 2
      );
      ctx.fill();
      ctx.closePath();
      ctx.restore();
    }

    // --- Pomme dorée (si présente) ---
    if (goldenFoodPos) {
      ctx.save();
  
      // --- Calcul du facteur de scintillement ---
      // Oscille entre 0.85 et 1.15 toutes les 0.8 sec environ
      const pulse = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(goldenBlinkTimer * Math.PI * 2.5));
  
      // Corps doré
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(goldenFoodPos.x, goldenFoodPos.y, FOOD_RADIUS * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
  
      // Tige
      ctx.fillStyle = STEM_COLOR;
      const gStemW = Math.max(2, FOOD_RADIUS * 0.18 * pulse);
      const gStemH = Math.max(4, FOOD_RADIUS * 0.6 * pulse);
      ctx.fillRect(goldenFoodPos.x - gStemW / 2, goldenFoodPos.y - FOOD_RADIUS * 0.9 * pulse, gStemW, gStemH);
  
      // Feuille
      ctx.beginPath();
      ctx.fillStyle = LEAF_COLOR;
      ctx.ellipse(
          goldenFoodPos.x + FOOD_RADIUS * 0.3 * pulse,
          goldenFoodPos.y - FOOD_RADIUS * 1.1 * pulse,
          FOOD_RADIUS * 0.45 * pulse,
          FOOD_RADIUS * 0.22 * pulse,
          -0.6,
          0, Math.PI * 2
      );
      ctx.fill();
      ctx.closePath();
  
      ctx.restore();
    }

    // Corps du serpent
    if (segments.length > 1) {
      const headPoint = segments[0], tailPoint = segments[segments.length - 1];
      const grad = ctx.createLinearGradient(headPoint.x, headPoint.y, tailPoint.x, tailPoint.y);
      grad.addColorStop(0, SNAKE_A);
      grad.addColorStop(1, SNAKE_B);

      ctx.save();
      ctx.lineWidth = SEGMENT_RADIUS * 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(segments[0].x, segments[0].y);
      for (let i = 1; i < segments.length; i++) ctx.lineTo(segments[i].x, segments[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // Tête du serpent
    // --- Tête du serpent (même style que le corps, avec yeux) ---
    if (segments.length) {
      const hp = segments[0]; // head point
      const tailP = segments[segments.length - 1];
      const nd = normalize(dir);

      // Dégradé identique au corps
      const gradHead = ctx.createLinearGradient(hp.x, hp.y, tailP.x, tailP.y);
      gradHead.addColorStop(0, SNAKE_A);
      gradHead.addColorStop(1, SNAKE_B);

      // Tête
      ctx.save();
      ctx.fillStyle = gradHead;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, HEAD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      // --- Yeux ---
      const perp = { x: -nd.y, y: nd.x };
      const eyeForward = 0.22 * HEAD_RADIUS;
      const eyeSide = 0.38 * HEAD_RADIUS;

      let ease = 0;
      if (blinking) {
        const t = Math.min(1, blinkProgress);
        ease = Math.sin(t * Math.PI);
      }
      const eyeOpenFactor = 1 - 0.92 * ease;

      const leftEye = {
        x: hp.x + nd.x * eyeForward + perp.x * eyeSide,
        y: hp.y + nd.y * eyeForward + perp.y * eyeSide
      };
      const rightEye = {
        x: hp.x + nd.x * eyeForward - perp.x * eyeSide,
        y: hp.y + nd.y * eyeForward - perp.y * eyeSide
      };

      const rX = Math.max(1, HEAD_RADIUS * 0.22);
      const rY = rX * 0.95 * eyeOpenFactor;

      // Blanc des yeux
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.ellipse(leftEye.x, leftEye.y, rX, rY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.ellipse(rightEye.x, rightEye.y, rX, rY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      // Pupilles
      const pupilRadius = Math.max(1, HEAD_RADIUS * 0.095);
      const pupilMaxOffset = rX * 0.28;
      const pupilNudgeForward = 0.20 * HEAD_RADIUS;
      const pupilNudgeSide = 0.06 * HEAD_RADIUS;

      const leftP = {
        x: clamp(
          leftEye.x + nd.x * pupilNudgeForward - perp.x * pupilNudgeSide,
          leftEye.x - pupilMaxOffset,
          leftEye.x + pupilMaxOffset
        ),
        y: clamp(
          leftEye.y + nd.y * pupilNudgeForward - perp.y * pupilNudgeSide,
          leftEye.y - pupilMaxOffset,
          leftEye.y + pupilMaxOffset
        )
      };

      const rightP = {
        x: clamp(
          rightEye.x + nd.x * pupilNudgeForward + perp.x * pupilNudgeSide,
          rightEye.x - pupilMaxOffset,
          rightEye.x + pupilMaxOffset
        ),
        y: clamp(
          rightEye.y + nd.y * pupilNudgeForward + perp.y * pupilNudgeSide,
          rightEye.y - pupilMaxOffset,
          rightEye.y + pupilMaxOffset
        )
      };

      ctx.beginPath();
      ctx.fillStyle = '#001a2f';
      ctx.arc(leftP.x, leftP.y, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      ctx.beginPath();
      ctx.fillStyle = '#001a2f';
      ctx.arc(rightP.x, rightP.y, pupilRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();

      ctx.restore();
    }
  }

  // --- CONTROLES ---
  window.addEventListener('keydown', function (e) {
    const key = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) e.preventDefault();
    if (!running) return;

    let newDir = null;
    if (key === 'ArrowUp') newDir = { x: 0, y: -1 };
    else if (key === 'ArrowDown') newDir = { x: 0, y: 1 };
    else if (key === 'ArrowLeft') newDir = { x: -1, y: 0 };
    else if (key === 'ArrowRight') newDir = { x: 1, y: 0 };

    if (newDir) {
      const center = cellCenter(headCell.x, headCell.y);
      const atCenter = distXY(headPos.x, headPos.y, center.x, center.y) <= 0.9;
      if (atCenter) {
        if (!(newDir.x === -dir.x && newDir.y === -dir.y)) dir = newDir;
      } else {
        desiredDir = newDir;
      }
    }
  }, { passive: false });

  window.addEventListener('resize', resize);

  // --- START ---
  resize();
})();