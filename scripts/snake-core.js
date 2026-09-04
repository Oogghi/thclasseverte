// scripts/snake-core.js
// Shared Snake rendering, responsive grid, and movement physics for TH Classe Verte.

export const Dir = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

export function isOpposite(a, b) {
  return Boolean(a && b && a.x + b.x === 0 && a.y + b.y === 0);
}

/**
 * Responsive canvas grid calculator for Snake games.
 */
export function createSnakeGrid(canvas, { topUI = 80, bottomUI = 70, minTile = 18, maxTile = 96 } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let DPR = 1, width = 0, height = 0;
  let cols = 0, rows = 0, tile = 32;
  let offsetX = 0, offsetY = 0;

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;

    const marginX = 24;
    const availW = Math.max(200, width - marginX * 2);
    const availH = Math.max(200, height - topUI - bottomUI);

    const divisor = Math.min(availW, availH) < 600 ? 16 : 18;
    tile = Math.min(maxTile, Math.max(minTile, Math.floor(Math.min(availW, availH) / divisor)));

    cols = Math.max(8, Math.floor(availW / tile));
    rows = Math.max(6, Math.floor(availH / tile));
    tile = Math.floor(Math.min(availW / cols, availH / rows));

    offsetX = Math.floor((width - cols * tile) / 2);
    offsetY = Math.floor(topUI + (availH - rows * tile) / 2);

    canvas.style.width  = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width  = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;

    return { cols, rows, tile, offsetX, offsetY, width, height };
  }

  return {
    resize,
    getContext: () => ctx,
    getMetrics: () => ({ DPR, width, height, cols, rows, tile, offsetX, offsetY }),
  };
}

/**
 * Initializes keyboard (Arrows / ZQSD) and touch swipe controls for Snake.
 */
export function setupSnakeControls({ onDirection, onAction, isInputActive = () => false }) {
  window.addEventListener('keydown', (e) => {
    if (isInputActive()) return;

    if (['Escape', ' '].includes(e.key) && onAction) {
      onAction(e.key);
      return;
    }

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

/**
 * Draws the smooth interpolated snake body, head, eyes, and tongue.
 */
export function drawSnake(ctx, snake, prevCells, interpolation, { tile, offsetX, offsetY }) {
  if (!snake || !snake.cells.length) return;

  const cells = snake.cells;
  const t = Math.max(0, Math.min(1, interpolation));

  function getPos(idx) {
    const cur = cells[idx];
    const prev = prevCells && prevCells[idx] ? prevCells[idx] : cur;
    return {
      x: offsetX + (prev.x + (cur.x - prev.x) * t + 0.5) * tile,
      y: offsetY + (prev.y + (cur.y - prev.y) * t + 0.5) * tile,
    };
  }

  const radius = Math.max(6, Math.floor(tile * 0.42));

  // 1. Draw Snake Body Segments
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = cells.length - 1; i > 0; i--) {
    const p1 = getPos(i);
    const p2 = getPos(i - 1);

    // Segment outline / border
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = radius * 2 + 4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Segment fill (green gradient)
    const ratio = i / cells.length;
    ctx.strokeStyle = ratio > 0.6 ? '#3cb84a' : '#2e9d3a';
    ctx.lineWidth = radius * 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // 2. Draw Snake Head
  const headPos = getPos(0);
  const headRadius = radius + 2;

  // Head shadow / border
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(headPos.x, headPos.y, headRadius + 2, 0, Math.PI * 2);
  ctx.fill();

  // Head body
  ctx.fillStyle = '#227f2c';
  ctx.beginPath();
  ctx.arc(headPos.x, headPos.y, headRadius, 0, Math.PI * 2);
  ctx.fill();

  // 3. Eyes & Tongue
  const dir = snake.dir || Dir.RIGHT;
  const eyeOffset = headRadius * 0.45;
  const perpX = -dir.y;
  const perpY = dir.x;

  const eye1X = headPos.x + dir.x * (headRadius * 0.35) + perpX * eyeOffset;
  const eye1Y = headPos.y + dir.y * (headRadius * 0.35) + perpY * eyeOffset;
  const eye2X = headPos.x + dir.x * (headRadius * 0.35) - perpX * eyeOffset;
  const eye2Y = headPos.y + dir.y * (headRadius * 0.35) - perpY * eyeOffset;

  // White eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(eye1X, eye1Y, Math.max(3, headRadius * 0.32), 0, Math.PI * 2);
  ctx.arc(eye2X, eye2Y, Math.max(3, headRadius * 0.32), 0, Math.PI * 2);
  ctx.fill();

  // Black pupils looking in current direction
  ctx.fillStyle = '#1a1a1a';
  const pupilOffsetX = dir.x * 2;
  const pupilOffsetY = dir.y * 2;
  ctx.beginPath();
  ctx.arc(eye1X + pupilOffsetX, eye1Y + pupilOffsetY, Math.max(1.5, headRadius * 0.16), 0, Math.PI * 2);
  ctx.arc(eye2X + pupilOffsetX, eye2Y + pupilOffsetY, Math.max(1.5, headRadius * 0.16), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export default {
  Dir,
  isOpposite,
  createSnakeGrid,
  setupSnakeControls,
  drawSnake,
};
