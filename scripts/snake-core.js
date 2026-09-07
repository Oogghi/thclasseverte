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
 * Draws the smooth interpolated snake body, head, and eyes.
 * Restored to the clean, smooth dual-stroke continuous polyline style.
 */
export function drawSnake(ctx, snake, prevCells, interpolation, { tile, offsetX, offsetY }) {
  if (!snake || !snake.cells || snake.cells.length === 0) return;

  const gridToPixel = (cell) => ({
    px: offsetX + (cell.x + 0.5) * tile,
    py: offsetY + (cell.y + 0.5) * tile,
  });

  const t     = Math.max(0, Math.min(1, interpolation));
  const cells = snake.cells;

  // Head tip: slides smoothly from prevCells[0] (old head) to cells[0] (new head)
  const headTo   = gridToPixel(cells[0]);
  const headFrom = (prevCells && prevCells.length > 0) ? gridToPixel(prevCells[0]) : headTo;
  const headPt   = {
    px: headFrom.px + (headTo.px - headFrom.px) * t,
    py: headFrom.py + (headTo.py - headFrom.py) * t,
  };

  // Tail trailing edge: smoothly retracts or bounces upon eating
  const tailCell   = cells[cells.length - 1];
  const tailCellPx = gridToPixel(tailCell);
  const isGrowing  = prevCells && prevCells.length < cells.length;

  let tailPt;
  if (isGrowing && cells.length >= 2) {
    const prev2Px = gridToPixel(cells[cells.length - 2]);
    const tdx     = (tailCellPx.px - prev2Px.px) / tile;
    const tdy     = (tailCellPx.py - prev2Px.py) / tile;
    const bounce  = Math.sin(Math.PI * t) * tile * 0.55;
    tailPt = {
      px: tailCellPx.px + tdx * bounce,
      py: tailCellPx.py + tdy * bounce,
    };
  } else {
    const prevTailSrc = (prevCells && prevCells.length > 0)
      ? prevCells[Math.min(prevCells.length - 1, cells.length - 1)]
      : tailCell;
    const tailFrom = gridToPixel(prevTailSrc);
    tailPt = {
      px: tailFrom.px + (tailCellPx.px - tailFrom.px) * t,
      py: tailFrom.py + (tailCellPx.py - tailFrom.py) * t,
    };
  }

  // Point list: [headPt] -> [grid-aligned body joints] -> [tailPt]
  const pts = [headPt];
  for (let i = 1; i < cells.length; i++) pts.push(gridToPixel(cells[i]));
  pts.push(tailPt);

  const strokePts = () => {
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py));
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';

  // Outer border stroke
  strokePts();
  ctx.lineWidth   = tile * 0.78;
  ctx.strokeStyle = '#2d7a2d';
  ctx.stroke();

  // Inner green body stroke
  strokePts();
  ctx.lineWidth   = tile * 0.52;
  ctx.strokeStyle = '#7ecb63';
  ctx.stroke();

  // Sleek minimalist eyes on head
  const eyeOff = tile * 0.18;
  const eyeR   = Math.max(2, tile * 0.06);
  const dir    = snake.dir || Dir.RIGHT;
  ctx.fillStyle = '#001400';
  for (const side of [-1, 1]) {
    const ex = headPt.px - dir.x * eyeOff + dir.y * eyeOff * side;
    const ey = headPt.py - dir.y * eyeOff - dir.x * eyeOff * side;
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export default {
  Dir,
  isOpposite,
  createSnakeGrid,
  setupSnakeControls,
  drawSnake,
};
