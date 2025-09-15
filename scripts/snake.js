// scripts/snake.js
// Grid-aligned 15x15, centered, beautified visuals.
// Version simplifiée : langue simple, UI FR, pop-up perdu

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const restartBtn = document.getElementById('restart');

  // --- GRID & GAMEPLAY ---
  const GRID_COLS = 15;
  const GRID_ROWS = 15;

  const BASE_SPEED_CELLS = 1.6;
  const MAX_SPEED_CELLS = 9.0;
  const TIME_ACCEL_PER_SEC = 0.0012;
  const FOOD_HALF_SAT = 80;
  const FOOD_EXP = 0.6;

  let GRID = 32;
  let HEAD_RADIUS = 0;
  let SEGMENT_RADIUS = 0;
  let FOOD_RADIUS = 0;
  const INITIAL_LENGTH = 6;
  const SEGMENT_GAP = () => GRID;
  const MARGIN_CELLS = 0;
  const SELF_COLLIDE_SKIP = 4;

  let width = 0, height = 0;
  let cols = GRID_COLS, rows = GRID_ROWS;
  let originX = 0, originY = 0;

  let running = true;
  let score = 0;
  let foodsEaten = 0;
  let startTimestamp = null;

  let headCell = { x: 0, y: 0 };
  let headPos = { x: 0, y: 0 };
  let dir = { x: 1, y: 0 };
  let desiredDir = null;
  let path = [];
  let segmentCount = INITIAL_LENGTH;
  let segments = [];
  let foodCell = { x: 0, y: 0 };
  let foodPos = { x: 0, y: 0 };
  let lastTs = null;

  let blinkTimer = 0;
  let nextBlinkIn = 2 + Math.random() * 4;
  let blinking = false;
  let blinkProgress = 0;

  const CELL_A = '#fffef0';
  const CELL_B = '#f0f6b8';
  const SNAKE_A = '#0a66ff';
  const SNAKE_B = '#0033cc';
  const SNAKE_HEAD_BASE = '#1a73ff';
  const FOOD_RED = '#d32b2b';
  const FOOD_RED_DARK = '#861919';
  const STEM_COLOR = '#6b3f10';
  const LEAF_COLOR = '#2e8b2e';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy)}
  function distXY(x1,y1,x2,y2){const dx=x1-x2,dy=y1-y2;return Math.sqrt(dx*dx+dy*dy)}
  function cellCenter(cx,cy){return {x:originX+cx*GRID+GRID/2,y:originY+cy*GRID+GRID/2}}
  function normalize(v){const l=Math.sqrt(v.x*v.x+v.y*v.y)||1;return {x:v.x/l,y:v.y/l}}

  function currentSpeedCells(){
    const elapsedSec = startTimestamp?(performance.now()-startTimestamp)/1000:0;
    let foodFactor = foodsEaten>0?Math.pow(foodsEaten/(foodsEaten+FOOD_HALF_SAT),FOOD_EXP):0;
    let s = BASE_SPEED_CELLS + (MAX_SPEED_CELLS-BASE_SPEED_CELLS)*foodFactor + elapsedSec*TIME_ACCEL_PER_SEC;
    return Math.min(s,MAX_SPEED_CELLS);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;

    const oldGrid = GRID || 32;
    const oldOriginX = originX || 0;
    const oldOriginY = originY || 0;

    GRID = Math.floor(Math.min(width / GRID_COLS, height / GRID_ROWS));
    if (GRID < 12) GRID = 12;

    originX = Math.floor((width - GRID_COLS * GRID) / 2);
    originY = Math.floor((height - GRID_ROWS * GRID) / 2);

    HEAD_RADIUS = Math.floor(GRID * 0.45);
    SEGMENT_RADIUS = Math.floor(GRID * 0.42);
    FOOD_RADIUS = Math.floor(GRID * 0.4);

    canvas.width = width;
    canvas.height = height;

    if (segments && segments.length) {
        const scale = GRID / oldGrid;

        // Scale positions
        headPos.x = originX + (headPos.x - oldOriginX) * scale;
        headPos.y = originY + (headPos.y - oldOriginY) * scale;

        segments.forEach(s => {
            s.x = originX + (s.x - oldOriginX) * scale;
            s.y = originY + (s.y - oldOriginY) * scale;
        });

        foodPos.x = originX + (foodPos.x - oldOriginX) * scale;
        foodPos.y = originY + (foodPos.y - oldOriginY) * scale;

        // Recompute the head cell based on the new grid
        headCell.x = Math.floor((headPos.x - originX) / GRID);
        headCell.y = Math.floor((headPos.y - originY) / GRID);

        // Clamp headCell to grid bounds
        headCell.x = Math.max(0, Math.min(GRID_COLS - 1, headCell.x));
        headCell.y = Math.max(0, Math.min(GRID_ROWS - 1, headCell.y));
    } else {
        initGame();
    }
  }


  function initGame(){
    const cx=Math.floor(cols/2), cy=Math.floor(rows/2);
    headCell={x:cx,y:cy};
    headPos=cellCenter(cx,cy);
    dir={x:1,y:0}; desiredDir=null; segmentCount=INITIAL_LENGTH;
    path=[{x:headPos.x,y:headPos.y}];
    for(let i=1;i<Math.max(segmentCount,12);i++){
      path.push({x:originX+(cx-i)*GRID+GRID/2,y:originY+cy*GRID+GRID/2});
    }
    computeSegmentsFromPath();
    score=0; foodsEaten=0; scoreEl.textContent='Score: '+score;
    running=true; lastTs=null; startTimestamp=performance.now();
    blinkTimer=0; nextBlinkIn=2+Math.random()*4; blinking=false; blinkProgress=0;
    placeFood();
    requestAnimationFrame(gameLoop);
  }

  function placeFood(){
    const occupied=new Set();
    segments.forEach(s=>{
      const scx=Math.floor((s.x-originX)/GRID);
      const scy=Math.floor((s.y-originY)/GRID);
      if(scx>=0 && scx<cols && scy>=0 && scy<rows) occupied.add(scx+','+scy);
    });
    let attempts=0,fx,fy;
    do{
      fx=MARGIN_CELLS+Math.floor(Math.random()*Math.max(1,cols-MARGIN_CELLS*2));
      fy=MARGIN_CELLS+Math.floor(Math.random()*Math.max(1,rows-MARGIN_CELLS*2));
      attempts++; if(attempts>1000) break;
    }while(occupied.has(fx+','+fy));
    foodCell={x:clamp(fx,0,cols-1),y:clamp(fy,0,rows-1)};
    foodPos=cellCenter(foodCell.x,foodCell.y);
  }

  function trimPath(maxLenPx){
    let total=0;
    for(let i=0;i<path.length-1;i++){
      const a=path[i],b=path[i+1],seg=dist(a,b); total+=seg;
      if(total>maxLenPx){ path.splice(i+2); break; }
    }
  }

  function getPointAtDistance(d){
    if(d<=0)return {x:path[0].x,y:path[0].y};
    let traveled=0;
    for(let i=0;i<path.length-1;i++){
      const p0=path[i],p1=path[i+1],segLen=dist(p0,p1);
      if(traveled+segLen>=d){ const remain=d-traveled,t=segLen===0?0:remain/segLen; return {x:p0.x+(p1.x-p0.x)*t,y:p0.y+(p1.y-p0.y)*t}; }
      traveled+=segLen;
    }
    const last=path[path.length-1]; return {x:last.x,y:last.y};
  }

  function computeSegmentsFromPath(){
    const newSegs=[];
    const gap=SEGMENT_GAP();
    for(let i=0;i<segmentCount;i++)newSegs.push(getPointAtDistance(i*gap));
    segments=newSegs;
  }

  function gameLoop(ts){
    if(!lastTs)lastTs=ts;
    const dt=Math.min((ts-lastTs)/1000,0.05);
    lastTs=ts;
    if(running){ update(dt); render(); requestAnimationFrame(gameLoop); }
  }

  function update(dt){
    blinkTimer+=dt;
    if(!blinking && blinkTimer>=nextBlinkIn){ blinking=true; blinkProgress=0; }
    if(blinking){ blinkProgress+=dt*6; if(blinkProgress>=1){ blinking=false; blinkTimer=0; nextBlinkIn=2+Math.random()*4; blinkProgress=0; } }

    const center=cellCenter(headCell.x,headCell.y);
    const atCenter=distXY(headPos.x,headPos.y,center.x,center.y)<=0.9;
    if(atCenter && desiredDir){ if(!(desiredDir.x===-dir.x && desiredDir.y===-dir.y)) dir={x:desiredDir.x,y:desiredDir.y}; desiredDir=null; }

    const targetCell = {
        x: clamp(headCell.x + dir.x, 0, cols - 1),
        y: clamp(headCell.y + dir.y, 0, rows - 1)
    };

    const targetCenter=cellCenter(targetCell.x,targetCell.y);
    const dx=targetCenter.x-headPos.x,dy=targetCenter.y-headPos.y;
    const distToTarget=Math.sqrt(dx*dx+dy*dy);
    const speedCells=currentSpeedCells();
    const move=Math.min(speedCells*GRID*dt,distToTarget);

    if (headCell.x === 0 && dir.x === -1 || headCell.x === cols - 1 && dir.x === 1 ||
        headCell.y === 0 && dir.y === -1 || headCell.y === rows - 1 && dir.y === 1) {
        endGame();
        return;
    }

    if(move>=distToTarget-0.0001){
      headPos.x=targetCenter.x; headPos.y=targetCenter.y; headCell={x:targetCell.x,y:targetCell.y};
      path.unshift({x:headPos.x,y:headPos.y});
      trimPath(Math.max((segmentCount+8)*GRID,400));
      for(let i=SELF_COLLIDE_SKIP;i<segments.length;i++){
        const sCellX=Math.floor((segments[i].x-originX)/GRID),sCellY=Math.floor((segments[i].y-originY)/GRID);
        if(sCellX===headCell.x && sCellY===headCell.y){ endGame(); return; }
      }
      if(headCell.x===foodCell.x && headCell.y===foodCell.y) eatFood();
    } else { const nx=dx/(distToTarget||1),ny=dy/(distToTarget||1); headPos.x+=nx*move; headPos.y+=ny*move; path.unshift({x:headPos.x,y:headPos.y}); trimPath(Math.max((segmentCount+8)*GRID,400)); }

    computeSegmentsFromPath();
    for(let i=SELF_COLLIDE_SKIP;i<segments.length;i++){ if(dist(segments[0],segments[i])<SEGMENT_RADIUS*0.9){ endGame(); return; } }
  }

  function eatFood(){ score+=10; foodsEaten+=1; scoreEl.textContent='Score: '+score; segmentCount+=1; path.push(path[path.length-1]||{x:headPos.x-segmentCount*GRID,y:headPos.y}); placeFood(); }

  function endGame(){
    running=false;
    alert('Perdu ! Score: '+score);
    render();
  }

  function render(){
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#fbffd8'; ctx.fillRect(0,0,width,height);

    // checkerboard
    for(let y=0;y<rows;y++){ for(let x=0;x<cols;x++){ ctx.fillStyle=((x+y)%2===0)?CELL_A:CELL_B; ctx.fillRect(originX+x*GRID,originY+y*GRID,GRID,GRID); } }

    // grid border
    ctx.save(); ctx.lineWidth=Math.max(2,Math.floor(GRID*0.06)); ctx.strokeStyle='rgba(0,32,0,0.12)';
    ctx.strokeRect(originX+0.5,originY+0.5,cols*GRID-1,rows*GRID-1); ctx.restore();

    // apple
    ctx.save(); ctx.shadowColor='rgba(0,0,0,0.22)'; ctx.shadowBlur=Math.max(6,GRID*0.18); ctx.shadowOffsetY=Math.max(2,GRID*0.08);
    const gx=ctx.createRadialGradient(foodPos.x-GRID*0.12,foodPos.y-GRID*0.18,FOOD_RADIUS*0.1,foodPos.x,foodPos.y,FOOD_RADIUS*1.2);
    gx.addColorStop(0,'#fff'); gx.addColorStop(0.08,'#ffb3b3'); gx.addColorStop(0.5,FOOD_RED); gx.addColorStop(1,FOOD_RED_DARK);
    ctx.fillStyle=gx; ctx.beginPath(); ctx.arc(foodPos.x,foodPos.y,FOOD_RADIUS,0,Math.PI*2); ctx.fill(); ctx.closePath(); ctx.restore();

    // snake body
    if(segments.length>1){
      const headP=segments[0], tailP=segments[segments.length-1];
      const grad=ctx.createLinearGradient(headP.x,headP.y,tailP.x,tailP.y); grad.addColorStop(0,SNAKE_A); grad.addColorStop(1,SNAKE_B);
      ctx.save(); ctx.lineWidth=SEGMENT_RADIUS*2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle=grad;
      ctx.beginPath(); ctx.moveTo(segments[0].x,segments[0].y); for(let i=1;i<segments.length;i++)ctx.lineTo(segments[i].x,segments[i].y); ctx.stroke(); ctx.restore();
    }

    // head
    if(segments.length){
        const hp=segments[0]; 
        const nd=normalize(dir);
        ctx.save(); 
        ctx.beginPath(); 
        const gradHead=ctx.createRadialGradient(hp.x-HEAD_RADIUS*0.18,hp.y-HEAD_RADIUS*0.32,HEAD_RADIUS*0.12,hp.x,hp.y,HEAD_RADIUS);
        gradHead.addColorStop(0,'#bfe0ff'); 
        gradHead.addColorStop(0.25,SNAKE_HEAD_BASE); 
        gradHead.addColorStop(1,'#072a6a'); 
        ctx.fillStyle=gradHead;
        ctx.arc(hp.x,hp.y,HEAD_RADIUS,0,Math.PI*2); 
        ctx.fill(); 
        ctx.closePath();

        // eyes (unchanged)
        const perp={x:-nd.y,y:nd.x};
        const eyeForward=0.22*HEAD_RADIUS; const eyeSide=0.38*HEAD_RADIUS;
        let ease=0; if(blinking){ const t=Math.min(1,blinkProgress); ease=Math.sin(t*Math.PI); }
        const eyeOpenFactor=1-0.92*ease;
        const leftEye={x:hp.x+nd.x*eyeForward+perp.x*eyeSide,y:hp.y+nd.y*eyeForward+perp.y*eyeSide};
        const rightEye={x:hp.x+nd.x*eyeForward-perp.x*eyeSide,y:hp.y+nd.y*eyeForward-perp.y*eyeSide};
        const rX=Math.max(1,HEAD_RADIUS*0.22), rY=rX*0.95*eyeOpenFactor;
        ctx.beginPath(); ctx.fillStyle='#fff'; ctx.ellipse(leftEye.x,leftEye.y,rX,rY,0,0,Math.PI*2); ctx.fill(); ctx.closePath();
        ctx.beginPath(); ctx.fillStyle='#fff'; ctx.ellipse(rightEye.x,rightEye.y,rX,rY,0,0,Math.PI*2); ctx.fill(); ctx.closePath();

        // pupils (unchanged)
        const pupilRadius=Math.max(1,HEAD_RADIUS*0.095), pupilMaxOffset=rX*0.28;
        const pupilNudgeForward=0.20*HEAD_RADIUS, pupilNudgeSide=0.06*HEAD_RADIUS;
        const leftP={x:clamp(leftEye.x+nd.x*pupilNudgeForward-perp.x*pupilNudgeSide,leftEye.x-pupilMaxOffset,leftEye.x+pupilMaxOffset),
                    y:clamp(leftEye.y+nd.y*pupilNudgeForward-perp.y*pupilNudgeSide,leftEye.y-pupilMaxOffset,leftEye.y+pupilMaxOffset)};
        const rightP={x:clamp(rightEye.x+nd.x*pupilNudgeForward+perp.x*pupilNudgeSide,rightEye.x-pupilMaxOffset,rightEye.x+pupilMaxOffset),
                    y:clamp(rightEye.y+nd.y*pupilNudgeForward+perp.y*pupilNudgeSide,rightEye.y-pupilMaxOffset,rightEye.y+pupilMaxOffset)};
        ctx.beginPath(); ctx.fillStyle='#001a2f'; ctx.arc(leftP.x,leftP.y,pupilRadius,0,Math.PI*2); ctx.fill(); ctx.closePath();
        ctx.beginPath(); ctx.fillStyle='#001a2f'; ctx.arc(rightP.x,rightP.y,pupilRadius,0,Math.PI*2); ctx.fill(); ctx.closePath();
    }
  }

  window.addEventListener('keydown',function(e){
    const key=e.key; if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)) e.preventDefault();
    if(!running)return;
    let newDir=null;
    if(key==='ArrowUp')newDir={x:0,y:-1}; else if(key==='ArrowDown')newDir={x:0,y:1};
    else if(key==='ArrowLeft')newDir={x:-1,y:0}; else if(key==='ArrowRight')newDir={x:1,y:0};
    if(newDir){ const center=cellCenter(headCell.x,headCell.y); const atCenter=distXY(headPos.x,headPos.y,center.x,center.y)<=0.9;
      if(atCenter){ if(!(newDir.x===-dir.x && newDir.y===-dir.y)) dir=newDir; } else desiredDir=newDir; }
  },{passive:false});

  restartBtn.addEventListener('click',function(){initGame();});
  window.addEventListener('resize',resize);
  resize();

})();