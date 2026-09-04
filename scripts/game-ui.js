// scripts/game-ui.js
// Shared UI components and controller utilities for TH Classe Verte games.
import { getTopScores, getTopScoresAsync, showLeaderboardModal } from './leaderboard.js';
import { playClickSound, playDamageSound } from './sound.js';
import { bump } from './game-feedback.js';

/**
 * Checks if the user is currently typing in an input field or interacting with an open overlay modal.
 */
export function isTypingInInput() {
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
  if (document.querySelector('.leaderboard-overlay:not(.hidden)')) return true;
  return false;
}

/**
 * Universal Pause Manager.
 * Connects pause button, pause overlay, P/Escape keyboard shortcuts, and tab visibility switching.
 */
export function setupPauseManager({
  onPause = () => {},
  onResume = () => {},
  isGameRunning = () => true,
  pauseButton = document.querySelector('#btn-pause'),
  pauseOverlay = document.querySelector('#pause-overlay'),
} = {}) {
  let paused = false;

  // Ensure initial hidden state
  if (pauseOverlay) {
    pauseOverlay.classList.add('hidden');
    pauseOverlay.style.display = 'none';
  }

  function setPaused(val) {
    const shouldPause = Boolean(val);
    // Only check isGameRunning when trying to pause, not when unpausing or resetting
    if (shouldPause && !isGameRunning()) return;
    paused = shouldPause;

    if (pauseOverlay) {
      pauseOverlay.classList.toggle('hidden', !paused);
      pauseOverlay.style.display = paused ? 'block' : 'none';
    }
    if (pauseButton) {
      pauseButton.textContent = paused ? '▶ Reprendre' : '⏸ Pause';
    }

    if (paused) {
      onPause();
    } else {
      onResume();
    }
  }

  function togglePause() {
    if (!isGameRunning() && !paused) return;
    if (isTypingInInput()) return;
    playClickSound();
    setPaused(!paused);
  }

  if (pauseButton) {
    pauseButton.addEventListener('click', (e) => {
      e.preventDefault();
      togglePause();
    });
  }

  if (pauseOverlay) {
    pauseOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      if (paused) togglePause();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (isTypingInInput()) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (isGameRunning() || paused) {
        e.preventDefault();
        togglePause();
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isGameRunning() && !paused) {
      setPaused(true);
    }
  });

  return {
    isPaused: () => paused,
    setPaused,
    togglePause,
  };
}

/**
 * Difficulty & Side-by-Side Leaderboard Menu Manager.
 */
export function setupDifficultyMenu({
  gameId,
  gameTitle = '',
  defaultDiff = 0,
  onStart = () => {},
  overlayEl = document.querySelector('#difficulty-menu-overlay'),
  diffButtons = document.querySelectorAll('.btn-diff'),
  sideScoresBody = document.querySelector('#side-scores-body'),
  btnOpenFullLeaderboard = document.querySelector('#btn-open-full-leaderboard'),
  isLowerBetter = false,
}) {
  const urlParams = new URLSearchParams(window.location.search);
  let difficulty = Math.max(0, Math.min(2, parseInt(urlParams.get('difficulte') || String(defaultDiff), 10)));

  function renderSideScores(entries) {
    if (!sideScoresBody) return;
    if (!entries || !entries.length) {
      sideScoresBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:12px; font-weight:700; color:#5c7860;">Aucun score cette semaine. Sois le premier ! 🌟</td></tr>`;
      return;
    }

    const rows = entries.slice(0, 5).map((item, idx) => {
      const rank = idx + 1;
      let badge = `#${rank}`;
      let rankClass = '';
      if (rank === 1) { badge = '🥇'; rankClass = 'rank-1'; }
      else if (rank === 2) { badge = '🥈'; rankClass = 'rank-2'; }
      else if (rank === 3) { badge = '🥉'; rankClass = 'rank-3'; }

      const safeName = String(item.name || 'Anonyme').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
      const safeScore = String(item.scoreFormatted || item.score || '0').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

      return `
        <tr>
          <td><span class="rank-badge ${rankClass}">${badge}</span></td>
          <td class="player-name">${safeName}</td>
          <td style="text-align:right;"><strong>${safeScore}</strong></td>
        </tr>
      `;
    });

    sideScoresBody.innerHTML = rows.join('');
  }

  async function loadSideScores() {
    if (!sideScoresBody) return;
    // 1. Instant local render
    const localScores = getTopScores(gameId, 'week', isLowerBetter);
    renderSideScores(localScores);

    // 2. Fresh online fetch
    try {
      const onlineScores = await getTopScoresAsync(gameId, 'week', isLowerBetter);
      if (onlineScores && onlineScores.length) {
        renderSideScores(onlineScores);
      }
    } catch (_) {}
  }

  function highlightButton(diff) {
    diffButtons.forEach(btn => {
      const d = parseInt(btn.dataset.diff, 10);
      btn.classList.toggle('selected', d === diff);
    });
  }

  function showMenu() {
    if (overlayEl) {
      overlayEl.classList.remove('hidden');
      overlayEl.style.display = 'flex';
    }
    highlightButton(difficulty);
    loadSideScores();
  }

  function hideMenu() {
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.style.display = 'none';
    }
  }

  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      const chosen = parseInt(btn.dataset.diff, 10);
      difficulty = isNaN(chosen) ? 0 : chosen;
      highlightButton(difficulty);
      hideMenu();
      onStart(difficulty);
    });
  });

  if (btnOpenFullLeaderboard) {
    btnOpenFullLeaderboard.addEventListener('click', () => {
      playClickSound();
      showLeaderboardModal({
        gameId,
        gameTitle: gameTitle || 'Classement',
        isLowerBetter,
      });
    });
  }

  return {
    getDifficulty: () => difficulty,
    setDifficulty: (d) => { difficulty = d; highlightButton(d); },
    showMenu,
    hideMenu,
    refreshScores: loadSideScores,
  };
}

/**
 * 5-Second Countdown Overlay Manager for word games.
 */
export function setupWordCountdown({
  overlayEl = document.querySelector('#countdown-overlay'),
  textEl = document.querySelector('#countdown-text'),
  numberEl = document.querySelector('#countdown-number'),
} = {}) {
  let interval = null;
  let active = false;

  function hide() {
    active = false;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (overlayEl) {
      overlayEl.style.display = 'none';
      overlayEl.classList.add('hidden');
    }
    if (textEl) textEl.textContent = '';
    if (numberEl) numberEl.textContent = '';
  }

  function show() {
    if (overlayEl) {
      overlayEl.style.display = 'flex';
      overlayEl.classList.remove('hidden');
    }
  }

  function runCountdown(word, difficulty, onTick = () => {}, onComplete = () => {}) {
    return new Promise((resolve) => {
      if (!overlayEl || !numberEl || !textEl) {
        onComplete();
        resolve();
        return;
      }

      active = true;
      const normalized = String(word || '').toUpperCase();

      if (difficulty === 0 || difficulty === 1) {
        textEl.textContent = `Tu dois reconstruire le mot : "${normalized}"`;
      } else {
        textEl.textContent = `Tu dois reconstruire un mot mystère (${normalized.length} lettres) !`;
      }

      onTick(5);
      numberEl.textContent = '5';
      show();
      let n = 5;

      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        n--;
        if (n > 0) {
          numberEl.textContent = String(n);
          onTick(n);
        } else {
          hide();
          onComplete();
          resolve();
        }
      }, 1000);
    });
  }

  return {
    isActive: () => active,
    runCountdown,
    cancel: hide,
  };
}

/**
 * Word Target Display Manager.
 * Renders letters in spelling slots according to difficulty level and handles animations.
 */
export function createWordTargetDisplay({
  containerEl = document.querySelector('#word-display'),
  wordsCounterEl = document.querySelector('#words-counter'),
  livesCounterEl = document.querySelector('#lives-counter'),
  maxLives = 3,
} = {}) {
  let lastLives = maxLives;

  function renderWord(word, nextLetterIndex, difficulty, isPreview = false) {
    if (!containerEl) return;
    const letters = String(word || '').toUpperCase().split('');
    containerEl.innerHTML = '';

    letters.forEach((char, idx) => {
      const slot = document.createElement('span');
      slot.className = 'letter-slot';

      if (idx < nextLetterIndex) {
        slot.textContent = char;
        slot.classList.add('collected');
      } else if (difficulty === 0) {
        slot.textContent = char;
        slot.classList.add('pending');
        if (idx === nextLetterIndex) slot.classList.add('active');
      } else if (difficulty === 1) {
        if (isPreview) {
          slot.textContent = char;
          slot.classList.add('countdown-preview');
        } else {
          slot.textContent = '_';
          slot.classList.add('hidden-slot');
          if (idx === nextLetterIndex) slot.classList.add('active');
        }
      } else {
        slot.textContent = '?';
        slot.classList.add('mystery');
        if (idx === nextLetterIndex) slot.classList.add('active');
      }

      containerEl.appendChild(slot);
    });
  }

  function updateWordsCounter(currentWordIndex, totalWords) {
    if (wordsCounterEl) {
      wordsCounterEl.textContent = `Mots : ${Math.min(currentWordIndex + 1, totalWords)}/${totalWords}`;
    }
  }

  function updateLives(lives) {
    if (!livesCounterEl) return;
    const curLives = Math.max(0, lives);

    if (curLives < lastLives) {
      livesCounterEl.classList.remove('lives-lost');
      void livesCounterEl.offsetWidth;
      livesCounterEl.classList.add('lives-lost');
      playDamageSound();
    }
    lastLives = curLives;

    livesCounterEl.innerHTML = Array.from({ length: maxLives }, (_, i) =>
      `<span class="heart ${i < curLives ? 'full' : 'empty'}">♥</span>`
    ).join(' ');
  }

  function bumpTarget() {
    if (containerEl) bump(containerEl);
  }

  return {
    renderWord,
    updateWordsCounter,
    updateLives,
    bumpTarget,
  };
}

export default {
  isTypingInInput,
  setupPauseManager,
  setupDifficultyMenu,
  setupWordCountdown,
  createWordTargetDisplay,
};
