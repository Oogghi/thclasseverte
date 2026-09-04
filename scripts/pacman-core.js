// scripts/pacman-core.js
// Shared Pac-Man engine: maze layout, offscreen wall rendering cache, ghost AI, and sprite renderer.

export const MAP_TEMPLATE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,1,1,3,1,3,1,1,1,0,1,1,1,1],
  [1,1,1,1,0,1,3,3,3,3,3,3,3,1,0,1,1,1,1],
  [1,1,1,1,0,1,3,1,1,4,1,1,3,1,0,1,1,1,1],
  [3,3,3,3,0,3,3,1,3,3,3,1,3,3,0,3,3,3,3],
  [1,1,1,1,0,1,3,1,1,1,1,1,3,1,0,1,1,1,1],
  [1,1,1,1,0,1,3,3,3,3,3,3,3,1,0,1,1,1,1],
  [1,1,1,1,0,1,3,1,1,1,1,1,3,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,2,0,1,0,1,1,1,0,3,0,1,1,1,0,1,0,2,1],
  [1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export const COLS = MAP_TEMPLATE[0].length;
export const ROWS = MAP_TEMPLATE.length;

export const Dir = {
  NONE:  { x:  0, y:  0 },
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

export function isOpposite(d1, d2) {
  return Boolean(d1 && d2 && d1.x + d2.x === 0 && d1.y + d2.y === 0);
}

/**
 * Responsive canvas grid calculator for Pac-Man.
 */
export function createPacmanGrid(canvas, { topUI = 75, bottomUI = 65 } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let DPR = 1, width = 0, height = 0, tile = 24, offsetX = 0, offsetY = 0;

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;

    const availW = Math.max(200, width - 30);
    const availH = Math.max(200, height - topUI - bottomUI);

    tile = Math.floor(Math.min(availW / COLS, availH / ROWS));
    tile = Math.max(14, Math.min(48, tile));

    offsetX = Math.floor((width - COLS * tile) / 2);
    offsetY = Math.floor(topUI + (availH - ROWS * tile) / 2);

    canvas.style.width  = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width  = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    return { tile, offsetX, offsetY, width, height, DPR };
  }

  function gridToScreen(x, y) {
    return {
      x: offsetX + (x + 0.5) * tile,
      y: offsetY + (y + 0.5) * tile,
    };
  }

  return {
    resize,
    getContext: () => ctx,
    getMetrics: () => ({ DPR, width, height, tile, offsetX, offsetY }),
    gridToScreen,
  };
}

/**
 * Pre-renders static maze walls to an offscreen canvas.
 * Drastically improves 60fps performance by avoiding repeated line/arc strokes.
 */
export function createMazeWallCache(map, tile, offsetX, offsetY, width, height, DPR) {
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = Math.floor(width * DPR);
  wallCanvas.height = Math.floor(height * DPR);
  const wCtx = wallCanvas.getContext('2d');
  wCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const rootStyle = getComputedStyle(document.documentElement);
  const BG_COLOR = rootStyle.getPropertyValue('--bg').trim() || '#fbffd8';

  // Fill canvas background
  wCtx.fillStyle = BG_COLOR;
  wCtx.fillRect(0, 0, width, height);

  // Draw maze shadow & crisp white floor
  const mazeW = COLS * tile;
  const mazeH = ROWS * tile;

  wCtx.fillStyle = '#1a1a1a';
  wCtx.fillRect(offsetX + 4, offsetY + 4, mazeW, mazeH);

  // Maze floor matches the website body background
  wCtx.fillStyle = BG_COLOR;
  wCtx.fillRect(offsetX, offsetY, mazeW, mazeH);

  // Render walls (vibrant TH Classe Verte green)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = map[r][c];
      const x = offsetX + c * tile;
      const y = offsetY + r * tile;

      if (cell === 1) {
        // Wall block
        wCtx.fillStyle = '#2e7d32';
        wCtx.fillRect(x, y, tile, tile);

        wCtx.strokeStyle = '#1a1a1a';
        wCtx.lineWidth = 1.5;
        wCtx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      } else if (cell === 4) {
        // Ghost House Gate
        wCtx.fillStyle = '#ff66b2';
        wCtx.fillRect(x, y + tile * 0.4, tile, tile * 0.2);
        wCtx.strokeStyle = '#1a1a1a';
        wCtx.lineWidth = 1;
        wCtx.strokeRect(x, y + tile * 0.4, tile, tile * 0.2);
      }
    }
  }

  // Outer bold border
  wCtx.strokeStyle = '#1a1a1a';
  wCtx.lineWidth = 2.5;
  wCtx.strokeRect(offsetX, offsetY, mazeW, mazeH);

  return wallCanvas;
}

/**
 * Initializes ghost entities for a game session.
 */
export function createInitialGhosts(ghostCount = 4) {
  const GHOST_DATA = [
    { id: 'blinky', name: 'Blinky', color: '#e63946', scatter: { x: COLS - 2, y: 1 }, jailX: 9, jailY: 8, releaseDelay: 0 },
    { id: 'pinky',  name: 'Pinky',  color: '#ff85a1', scatter: { x: 1, y: 1 },        jailX: 9, jailY: 10, releaseDelay: 2.0 },
    { id: 'inky',   name: 'Inky',   color: '#4cc9f0', scatter: { x: COLS - 2, y: ROWS - 2 }, jailX: 8, jailY: 10, releaseDelay: 4.5 },
    { id: 'clyde',  name: 'Clyde',  color: '#f77f00', scatter: { x: 1, y: ROWS - 2 }, jailX: 10, jailY: 10, releaseDelay: 7.0 },
  ];

  return GHOST_DATA.slice(0, ghostCount).map(g => ({
    ...g,
    x: g.jailX,
    y: g.jailY,
    dir: Dir.LEFT,
    mode: g.releaseDelay === 0 ? 'chase' : 'jail',
    jailTimer: g.releaseDelay,
    eaten: false,
    _lastTileX: -1,
    _lastTileY: -1,
  }));
}

/**
 * Draws Pac-Man with animated chomping mouth.
 */
export function drawPacman(ctx, pacman, tile, offsetX, offsetY, mouthAngle = 0.2) {
  if (!pacman) return;
  const px = offsetX + (pacman.x + 0.5) * tile;
  const py = offsetY + (pacman.y + 0.5) * tile;
  const r = tile * 0.44;

  let angle = 0;
  if (pacman.dir === Dir.RIGHT) angle = 0;
  else if (pacman.dir === Dir.DOWN) angle = Math.PI * 0.5;
  else if (pacman.dir === Dir.LEFT) angle = Math.PI;
  else if (pacman.dir === Dir.UP) angle = Math.PI * 1.5;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);

  ctx.fillStyle = '#ffd77a';
  ctx.beginPath();
  ctx.arc(0, 0, r, mouthAngle, Math.PI * 2 - mouthAngle);
  ctx.lineTo(0, 0);
  ctx.fill();

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws Ghost sprite with animated eyes and wavy skirt.
 */
export function drawGhost(ctx, ghost, tile, offsetX, offsetY, frightenedTimer = 0) {
  if (!ghost) return;
  const gx = offsetX + (ghost.x + 0.5) * tile;
  const gy = offsetY + (ghost.y + 0.5) * tile;
  const r = tile * 0.44;

  ctx.save();
  ctx.translate(gx, gy);

  const isFrightened = frightenedTimer > 0;
  const isFlashing = isFrightened && frightenedTimer < 1.5 && (Math.floor(frightenedTimer * 5) % 2 === 0);

  if (!ghost.eaten) {
    // Body
    ctx.fillStyle = isFrightened ? (isFlashing ? '#ffffff' : '#3366cc') : ghost.color;
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, Math.PI, 0, false);
    ctx.lineTo(r, r * 0.8);
    // Skirt waves
    ctx.lineTo(r * 0.5, r * 0.4);
    ctx.lineTo(0, r * 0.8);
    ctx.lineTo(-r * 0.5, r * 0.4);
    ctx.lineTo(-r, r * 0.8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Eyes
  const dir = ghost.dir || Dir.RIGHT;
  const eyeR = Math.max(2.5, r * 0.3);
  const pupilR = Math.max(1.2, r * 0.16);

  for (const side of [-1, 1]) {
    const ex = side * (r * 0.4) + dir.x * 2;
    const ey = -r * 0.2 + dir.y * 2;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isFrightened ? '#ff4b4b' : '#1a1a1a';
    ctx.beginPath();
    ctx.arc(ex + dir.x * 2, ey + dir.y * 2, pupilR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Ghost AI pathfinding step.
 */
export function updateGhostAI(ghost, pacman, map, dt, speed, frightenedTimer) {
  if (ghost.mode === 'jail') {
    ghost.jailTimer -= dt;
    if (ghost.jailTimer <= 0) {
      // Exit through gate to row 8
      if (Math.abs(ghost.x - 9) > 0.05) {
        ghost.x += Math.sign(9 - ghost.x) * speed * dt;
      } else {
        ghost.x = 9;
        ghost.y -= speed * dt;
        if (ghost.y <= 8.0) {
          ghost.y = 8.0;
          ghost.mode = 'chase';
          ghost.dir = Dir.LEFT;
          ghost._lastTileX = -1;
          ghost._lastTileY = -1;
        }
      }
    }
    return;
  }

  if (ghost.eaten) {
    // Return to ghost house entrance (col 9, row 8)
    const target = { x: 9, y: 8 };
    moveTowardsTarget(ghost, target, map, speed * 2.2 * dt);
    if (Math.hypot(ghost.x - 9, ghost.y - 8) < 0.6) {
      ghost.eaten = false;
      ghost.mode = 'chase';
      ghost.x = 9;
      ghost.y = 8;
      ghost.dir = Dir.LEFT;
      ghost._lastTileX = -1;
      ghost._lastTileY = -1;
    }
    return;
  }

  const isFrightened = frightenedTimer > 0;
  // Frightened ghosts move at 55% speed so Pac-Man can chase and catch them
  const currentSpeed = (isFrightened ? speed * 0.55 : speed) * dt;

  let target = null;
  if (!isFrightened) {
    if (ghost.id === 'blinky') target = { x: pacman.x, y: pacman.y };
    else if (ghost.id === 'pinky') target = { x: pacman.x + (pacman.dir?.x || 0) * 4, y: pacman.y + (pacman.dir?.y || 0) * 4 };
    else if (ghost.id === 'inky') target = { x: pacman.x - (pacman.dir?.x || 0) * 2, y: pacman.y - (pacman.dir?.y || 0) * 2 };
    else target = Math.hypot(ghost.x - pacman.x, ghost.y - pacman.y) > 8 ? { x: pacman.x, y: pacman.y } : ghost.scatter;
  }

  moveTowardsTarget(ghost, target, map, currentSpeed, isFrightened, pacman);
}

/**
 * Computes shortest corridor distances from a point to all reachable maze tiles.
 */
export function getMazeDistances(sx, sy, map) {
  const dist = Array.from({ length: ROWS }, () => new Int16Array(COLS).fill(-1));
  const qx = (Math.round(sx) + COLS) % COLS;
  const qy = Math.round(sy);
  if (qy < 0 || qy >= ROWS) return dist;
  const queue = [{ x: qx, y: qy }];
  dist[qy][qx] = 0;
  let head = 0;
  while (head < queue.length) {
    const { x, y } = queue[head++];
    const d = dist[y][x];
    for (const dir of [Dir.UP, Dir.DOWN, Dir.LEFT, Dir.RIGHT]) {
      const nx = (x + dir.x + COLS) % COLS;
      const ny = y + dir.y;
      if (ny >= 0 && ny < ROWS && dist[ny][nx] === -1 && map[ny][nx] !== 1 && map[ny][nx] !== 4) {
        dist[ny][nx] = d + 1;
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return dist;
}

function moveTowardsTarget(entity, target, map, stepDist, isFrightened = false, pacmanPos = null) {
  const curTileX = Math.round(entity.x);
  const curTileY = Math.round(entity.y);
  const distToCenter = Math.hypot(entity.x - curTileX, entity.y - curTileY);

  // When approaching or at tile center, evaluate possible directions
  if ((distToCenter <= stepDist * 1.5 || entity.dir === Dir.NONE) && (entity._lastTileX !== curTileX || entity._lastTileY !== curTileY)) {
    entity.x = curTileX;
    entity.y = curTileY;
    entity._lastTileX = curTileX;
    entity._lastTileY = curTileY;

    // Available directions (excluding reversing unless dead end)
    let possibleDirs = [Dir.UP, Dir.LEFT, Dir.DOWN, Dir.RIGHT].filter(d => {
      if (isOpposite(d, entity.dir)) return false;
      const nx = (curTileX + d.x + COLS) % COLS;
      const ny = curTileY + d.y;
      if (ny < 0 || ny >= ROWS) return false;
      return map[ny][nx] !== 1 && map[ny][nx] !== 4;
    });

    if (possibleDirs.length === 0) {
      // Dead end fallback: allow reverse
      possibleDirs = [Dir.UP, Dir.LEFT, Dir.DOWN, Dir.RIGHT].filter(d => {
        const nx = (curTileX + d.x + COLS) % COLS;
        const ny = curTileY + d.y;
        if (ny < 0 || ny >= ROWS) return false;
        return map[ny][nx] !== 1 && map[ny][nx] !== 4;
      });
    }

    if (possibleDirs.length > 0) {
      if (isFrightened && pacmanPos) {
        // AUTHENTIC & SMART FLEE:
        // Use true labyrinth path distance from Pac-Man (not Euclidean which hits walls)
        const distGrid = getMazeDistances(pacmanPos.x, pacmanPos.y, map);
        const curDist = distGrid[curTileY] ? distGrid[curTileY][curTileX] : -1;

        if (curDist > 0 && curDist <= 10) {
          // Pac-Man is within 10 corridor steps: actively escape AWAY from him!
          const awayDirs = possibleDirs.filter(d => {
            const nx = (curTileX + d.x + COLS) % COLS;
            const ny = curTileY + d.y;
            const nd = distGrid[ny] ? distGrid[ny][nx] : -1;
            return nd >= curDist || nd === -1;
          });

          if (awayDirs.length > 0) {
            awayDirs.sort((a, b) => {
              const ndA = distGrid[curTileY + a.y] ? distGrid[curTileY + a.y][(curTileX + a.x + COLS) % COLS] : -1;
              const ndB = distGrid[curTileY + b.y] ? distGrid[curTileY + b.y][(curTileX + b.x + COLS) % COLS] : -1;
              if (ndB !== ndA) return ndB - ndA;
              return Math.random() - 0.5;
            });
            entity.dir = awayDirs[0];
          } else {
            // Cornered: choose the path that maximizes corridor distance
            possibleDirs.sort((a, b) => {
              const ndA = distGrid[curTileY + a.y] ? distGrid[curTileY + a.y][(curTileX + a.x + COLS) % COLS] : -1;
              const ndB = distGrid[curTileY + b.y] ? distGrid[curTileY + b.y][(curTileX + b.x + COLS) % COLS] : -1;
              return ndB - ndA;
            });
            entity.dir = possibleDirs[0];
          }
        } else {
          // Pac-Man is farther away (> 10 steps): classic frightened random wander without reversing
          entity.dir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
        }
      } else if (target) {
        // CHASE TARGET: Choose direction closest to target
        possibleDirs.sort((a, b) => {
          const d1 = Math.hypot((curTileX + a.x) - target.x, (curTileY + a.y) - target.y);
          const d2 = Math.hypot((curTileX + b.x) - target.x, (curTileY + b.y) - target.y);
          return d1 - d2;
        });
        entity.dir = possibleDirs[0];
      }
    }
  }

  // Clamped movement: NEVER cross into a wall!
  const dir = entity.dir || Dir.NONE;
  if (dir.x > 0) {
    entity.y = curTileY;
    const nextWall = (curTileX + 1 >= COLS) ? false : (map[curTileY][(curTileX + 1) % COLS] === 1);
    if (nextWall) {
      entity.x = Math.min(curTileX, entity.x + stepDist);
      entity._lastTileX = -1;
    } else {
      entity.x = (entity.x + stepDist + COLS) % COLS;
    }
  } else if (dir.x < 0) {
    entity.y = curTileY;
    const nextWall = (curTileX - 1 < 0) ? false : (map[curTileY][(curTileX - 1 + COLS) % COLS] === 1);
    if (nextWall) {
      entity.x = Math.max(curTileX, entity.x - stepDist);
      entity._lastTileX = -1;
    } else {
      entity.x = (entity.x - stepDist + COLS) % COLS;
    }
  } else if (dir.y > 0) {
    entity.x = curTileX;
    const nextWall = (curTileY + 1 >= ROWS) || (map[curTileY + 1][curTileX] === 1 || map[curTileY + 1][curTileX] === 4);
    if (nextWall) {
      entity.y = Math.min(curTileY, entity.y + stepDist);
      entity._lastTileY = -1;
    } else {
      entity.y += stepDist;
    }
  } else if (dir.y < 0) {
    entity.x = curTileX;
    const nextWall = (curTileY - 1 < 0) || (map[curTileY - 1][curTileX] === 1 || map[curTileY - 1][curTileX] === 4);
    if (nextWall) {
      entity.y = Math.max(curTileY, entity.y - stepDist);
      entity._lastTileY = -1;
    } else {
      entity.y -= stepDist;
    }
  }
}

/**
 * Binds keyboard and touch controls for Pac-Man.
 */
export function setupPacmanControls({ onDirection, isInputActive = () => false }) {
  window.addEventListener('keydown', (e) => {
    if (isInputActive()) return;
    if (['ArrowUp',    'z', 'Z', 'w', 'W'].includes(e.key)) onDirection(Dir.UP);
    else if (['ArrowDown',  's', 'S'].includes(e.key))       onDirection(Dir.DOWN);
    else if (['ArrowLeft',  'q', 'Q', 'a', 'A'].includes(e.key)) onDirection(Dir.LEFT);
    else if (['ArrowRight', 'd', 'D'].includes(e.key))       onDirection(Dir.RIGHT);
  });

  let touchStart = null;
  window.addEventListener('touchstart', (e) => {
    if (!e.touches.length || isInputActive()) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (!touchStart || isInputActive()) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      onDirection(dx > 0 ? Dir.RIGHT : Dir.LEFT);
    } else {
      onDirection(dy > 0 ? Dir.DOWN : Dir.UP);
    }
  }, { passive: true });
}

export default {
  MAP_TEMPLATE,
  COLS,
  ROWS,
  Dir,
  isOpposite,
  createPacmanGrid,
  createMazeWallCache,
  createInitialGhosts,
  drawPacman,
  drawGhost,
  updateGhostAI,
  setupPacmanControls,
};
