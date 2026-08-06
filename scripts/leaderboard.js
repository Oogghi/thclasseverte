// scripts/leaderboard.js
// Universal Leaderboard system for TH Classe Verte games.

const LOCAL_KEY = 'th_classe_verte_leaderboards_v1';

function loadLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveLocalLeaderboard(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Erreur sauvegarde locale leaderboard:', err);
  }
}

function getPeriodKeys(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  const tempDate = new Date(date.valueOf());
  const dayNum = (date.getDay() + 6) % 7;
  tempDate.setDate(tempDate.getDate() - dayNum + 3);
  const firstThursday = tempDate.valueOf();
  tempDate.setMonth(0, 1);
  if (tempDate.getDay() !== 4) {
    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.round((firstThursday - tempDate) / 604800000);
  
  return {
    weekKey: `${year}-W${String(weekNum).padStart(2, '0')}`,
    monthKey: `${year}-${month}`,
    timestamp: date.getTime(),
  };
}

function filterScores(entries = [], period = 'allTime', isLowerBetter = false) {
  const now = new Date();
  const { weekKey, monthKey } = getPeriodKeys(now);

  let filtered = entries.filter(e => {
    if (!e || typeof e.score !== 'number') return false;
    if (period === 'week') return e.weekKey === weekKey || (now.getTime() - e.timestamp) <= 7 * 86400 * 1000;
    if (period === 'month') return e.monthKey === monthKey;
    return true;
  });

  filtered.sort((a, b) => {
    if (isLowerBetter) return a.score - b.score;
    return b.score - a.score;
  });

  return filtered.slice(0, 10);
}

export function addScoreRecord(gameId, playerName, scoreVal, scoreFormatted, isLowerBetter = false) {
  const allData = loadLocalLeaderboard();
  if (!allData[gameId]) allData[gameId] = [];

  const name = (playerName || '').trim() || 'Anonyme';
  const { weekKey, monthKey, timestamp } = getPeriodKeys();

  const newEntry = {
    id: `${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    score: Number(scoreVal),
    scoreFormatted: scoreFormatted || String(scoreVal),
    timestamp,
    weekKey,
    monthKey,
  };

  allData[gameId].push(newEntry);
  saveLocalLeaderboard(allData);
  return newEntry;
}

export function showLeaderboardModal({
  gameId = 'game',
  gameTitle = 'Partie',
  currentScore = 0,
  scoreFormatted = '',
  isLowerBetter = false,
  onClose = null,
}) {
  if (!document.querySelector('link[href*="leaderboard.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'styles/leaderboard.css';
    document.head.appendChild(link);
  }

  let overlay = document.querySelector('.leaderboard-overlay');
  if (overlay) overlay.remove();

  // Clean title: replace em-dashes if any
  const cleanTitle = (gameTitle || 'Partie').replace(/—/g, ':');

  overlay = document.createElement('div');
  overlay.className = 'leaderboard-overlay';
  overlay.innerHTML = `
    <div class="leaderboard-card" role="dialog" aria-modal="true">
      <div class="leaderboard-header">
        <h2 class="leaderboard-title">🏆 Classement : ${cleanTitle}</h2>
        <div class="leaderboard-subtitle">Ton score : <strong>${scoreFormatted || currentScore}</strong></div>
      </div>

      <div class="leaderboard-body">
        <!-- Formulaire de saisie simplifié -->
        <div class="name-prompt-box" id="name-form-box">
          <div class="name-input-row">
            <input type="text" class="name-input" id="player-name-input" maxlength="12" placeholder="Ton prénom (ex: Hugo)" autocomplete="off" />
            <button type="button" class="btn-save-score" id="btn-submit-score">Valider 🚀</button>
          </div>
          <div class="warning-note">⚠️ Mets ton vrai prénom ou un pseudo gentil !</div>
          <button type="button" class="btn-skip-anon" id="btn-skip-anon">Continuer en anonyme</button>
        </div>

        <!-- Onglets Période -->
        <div class="tabs-container">
          <button type="button" class="tab-btn active" data-period="week">📅 Semaine</button>
          <button type="button" class="tab-btn" data-period="month">🗓️ Ce mois</button>
          <button type="button" class="tab-btn" data-period="allTime">🏆 Tous les temps</button>
        </div>

        <!-- Tableau simplifié à 3 colonnes -->
        <div class="scores-table-wrapper">
          <table class="scores-table">
            <thead>
              <tr>
                <th style="width:55px;">Rang</th>
                <th>Prénom</th>
                <th style="text-align:right;">Score</th>
              </tr>
            </thead>
            <tbody id="scores-table-body"></tbody>
          </table>
        </div>
      </div>

      <div class="leaderboard-footer">
        <button type="button" class="btn-close-leaderboard" id="btn-close-modal">Fermer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector('#player-name-input');
  const btnSubmit = overlay.querySelector('#btn-submit-score');
  const btnSkip = overlay.querySelector('#btn-skip-anon');
  const btnClose = overlay.querySelector('#btn-close-modal');
  const tableBody = overlay.querySelector('#scores-table-body');
  const formBox = overlay.querySelector('#name-form-box');
  const tabBtns = overlay.querySelectorAll('.tab-btn');

  let currentPeriod = 'week';
  let newlySavedId = null;

  nameInput.value = '';
  nameInput.focus();

  function renderTable() {
    const allData = loadLocalLeaderboard();
    const gameEntries = allData[gameId] || [];
    const topScores = filterScores(gameEntries, currentPeriod, isLowerBetter);

    if (topScores.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="3" class="empty-msg">Aucun score pour le moment. Sois le premier ! 🌟</td></tr>`;
      return;
    }

    tableBody.innerHTML = topScores.map((item, idx) => {
      const rank = idx + 1;
      let rankDisplay = `#${rank}`;
      let rankClass = '';
      if (rank === 1) { rankDisplay = '🥇'; rankClass = 'rank-1'; }
      else if (rank === 2) { rankDisplay = '🥈'; rankClass = 'rank-2'; }
      else if (rank === 3) { rankDisplay = '🥉'; rankClass = 'rank-3'; }

      const isMyScore = newlySavedId && item.id === newlySavedId;

      return `
        <tr class="${isMyScore ? 'highlight-my-score' : ''}">
          <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
          <td>${escapeHTML(item.name)}</td>
          <td style="text-align:right;"><strong>${escapeHTML(item.scoreFormatted)}</strong></td>
        </tr>
      `;
    }).join('');
  }

  function handleSave(playerName) {
    const saved = addScoreRecord(gameId, playerName, currentScore, scoreFormatted, isLowerBetter);
    newlySavedId = saved.id;
    formBox.style.display = 'none';
    renderTable();
  }

  btnSubmit.addEventListener('click', () => {
    handleSave(nameInput.value);
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(nameInput.value);
    }
  });

  btnSkip.addEventListener('click', () => {
    formBox.style.display = 'none';
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.getAttribute('data-period');
      renderTable();
    });
  });

  const closeModal = () => {
    overlay.classList.add('hidden');
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };

  btnClose.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  renderTable();
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, match => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[match];
  });
}
