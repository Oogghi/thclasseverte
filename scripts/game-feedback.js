const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function replayClass(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
}

export function bump(element) {
  replayClass(element, 'feedback-bump');
}

export function markSuccess(element) {
  replayClass(element, 'feedback-success');
}

export function markError(element) {
  replayClass(element, 'feedback-error');
}

export function screenHit() {
  replayClass(document.body, 'feedback-screen-hit');
}

export function floatLabel(text, x, y, { error = false } = {}) {
  if (!text) return;
  const label = document.createElement('span');
  label.className = `feedback-float${error ? ' is-error' : ''}`;
  label.textContent = text;
  label.style.left = `${Math.max(24, Math.min(innerWidth - 24, x))}px`;
  label.style.top = `${Math.max(20, Math.min(innerHeight - 20, y))}px`;
  document.body.appendChild(label);
  label.addEventListener('animationend', () => label.remove(), { once: true });
}

export function burst(x, y, { color = '#f4b942', count = 6, distance = 30 } = {}) {
  if (reduceMotion) return;
  const total = Math.max(3, Math.min(10, count));
  for (let i = 0; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total + (i % 2 ? .14 : 0);
    const particle = document.createElement('i');
    particle.className = 'feedback-particle';
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.setProperty('--particle-color', color);
    particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    document.body.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
  }
}

export function celebrateElement(element, label = '') {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  markSuccess(element);
  burst(x, y, { color: '#f4b942', count: 6, distance: 26 });
  if (label) floatLabel(label, x, rect.top);
}
