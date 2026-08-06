// Ultra lightweight GPU-accelerated confetti burst
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('confetti-container');
  if (!container) return;

  const colors = ['#ff4b4b', '#ffcf25', '#4ade80', '#38bdf8', '#ff85c0', '#a855f7', '#22c55e'];
  const confettiCount = 35; // lightweight count for 60fps performance

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < confettiCount; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';

    const left = Math.random() * 100; // 0vw to 100vw
    const duration = 2.5 + Math.random() * 1.5; // 2.5s to 4s
    const delay = Math.random() * 0.4; // 0s to 0.4s
    const color = colors[Math.floor(Math.random() * colors.length)];
    const xEnd = (Math.random() - 0.5) * 200; // horizontal drift
    const rotation = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720);
    const width = 8 + Math.random() * 6;
    const height = 10 + Math.random() * 8;

    el.style.left = `${left}vw`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.backgroundColor = color;
    el.style.setProperty('--duration', `${duration}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--x-end', `${xEnd}px`);
    el.style.setProperty('--rotation', `${rotation}deg`);

    fragment.appendChild(el);
  }

  container.appendChild(fragment);

  // Auto clean-up after animations complete to keep CPU/RAM footprint strictly at 0%
  setTimeout(() => {
    container.replaceChildren();
  }, 4500);
});
