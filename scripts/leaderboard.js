// scripts/leaderboard.js
// Universal Global Leaderboard system powered by JSONBin.io for TH Classe Verte games.
import { playHoverSound, playClickSound } from './sound.js';

const API_KEY = '$2a$10$dteCnNJw2l8XJtW/rGVlB.5Fe1I4izviOgeaDDg3B60j30rTvZzcW';
const BIN_ID = '6a74a30eda38895dfec1d714';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Access-Key': API_KEY,
  'X-Bin-Versioning': 'false',
};

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

export async function fetchGlobalLeaderboard() {
  try {
    const res = await fetch(`${JSONBIN_URL}/latest`, { headers: HEADERS });
    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    const record = (await res.json()).record || {};
    saveLocalLeaderboard(record);
    return record;
  } catch (err) {
    console.warn('Impossible de charger JSONBin, utilisation de la sauvegarde locale:', err);
    return loadLocalLeaderboard();
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
    yearKey: `${year}`,
    timestamp: date.getTime(),
  };
}

function filterScores(entries = [], period = 'week', isLowerBetter = false) {
  const now = new Date();
  const { weekKey, monthKey, yearKey } = getPeriodKeys(now);

  let filtered = entries.filter(e => {
    if (!e || typeof e.score !== 'number') return false;
    if (period === 'week') return e.weekKey === weekKey || (now.getTime() - e.timestamp) <= 7 * 86400 * 1000;
    if (period === 'month') return e.monthKey === monthKey;
    if (period === 'year') return e.yearKey === yearKey || (e.timestamp >= new Date(now.getFullYear(), 0, 1).getTime());
    return true;
  });

  filtered.sort((a, b) => {
    if (isLowerBetter) return a.score - b.score;
    return b.score - a.score;
  });

  return filtered.slice(0, 10);
}

export function getTopScores(gameId, period = 'week', isLowerBetter = false) {
  const allData = loadLocalLeaderboard();
  const gameEntries = allData[gameId] || [];
  return filterScores(gameEntries, period, isLowerBetter);
}

export async function getTopScoresAsync(gameId, period = 'week', isLowerBetter = false) {
  const allData = await fetchGlobalLeaderboard();
  const gameEntries = allData[gameId] || [];
  return filterScores(gameEntries, period, isLowerBetter);
}

export async function addScoreRecord(gameId, playerName, scoreVal, scoreFormatted, isLowerBetter = false) {
  const name = (playerName || '').trim() || 'Anonyme';
  const { weekKey, monthKey, yearKey, timestamp } = getPeriodKeys();

  const newEntry = {
    id: `${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    score: Number(scoreVal),
    scoreFormatted: scoreFormatted || String(scoreVal),
    timestamp,
    weekKey,
    monthKey,
    yearKey,
  };

  // Immediate local update
  const localData = loadLocalLeaderboard();
  if (!localData[gameId]) localData[gameId] = [];
  localData[gameId].push(newEntry);
  saveLocalLeaderboard(localData);

  // Background sync to JSONBin with retries
  (async () => {
    for (let i = 0; i < 3; i++) {
      try {
        const getRes = await fetch(`${JSONBIN_URL}/latest`, { headers: HEADERS });
        let currentData = {};
        if (getRes.ok) {
          currentData = (await getRes.json()).record || {};
        }
        if (!currentData[gameId]) currentData[gameId] = [];

        const existingIds = new Set(currentData[gameId].map(e => e.id));
        if (!existingIds.has(newEntry.id)) {
          currentData[gameId].push(newEntry);
        }

        currentData.version = (currentData.version || 0) + 1;

        const putRes = await fetch(JSONBIN_URL, {
          method: 'PUT',
          headers: HEADERS,
          body: JSON.stringify(currentData),
        });

        if (putRes.ok) {
          const updated = (await putRes.json()).record || {};
          saveLocalLeaderboard(updated);
          return;
        }
      } catch (err) {
        console.warn(`Tentative ${i + 1} de synchronisation JSONBin a échoué:`, err);
      }
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  })();

  return newEntry;
}

/**
 * Step 1: Prompt user for name upon game completion.
 * Cleanly closes before launching Step 2 Leaderboard.
 */
export function triggerEndGameSequence({
  gameId = 'game',
  gameTitle = 'Partie',
  currentScore = 0,
  scoreFormatted = '',
  isLowerBetter = false,
  onClose = null,
}) {
  ensureCssLoaded();
  closeAllOverlays();

  const cleanTitle = (gameTitle || 'Partie').replace(/—/g, ':');
  const overlay = document.createElement('div');
  overlay.className = 'leaderboard-overlay endgame-step1-overlay';

  overlay.innerHTML = `
    <div class="leaderboard-card" role="dialog" aria-modal="true">
      <div class="leaderboard-header">
        <h2 class="leaderboard-title">🏆 Classement : ${cleanTitle}</h2>
        <div class="leaderboard-subtitle">Ton score : <strong>${scoreFormatted || currentScore}</strong></div>
      </div>

      <div class="leaderboard-body">
        <div class="name-prompt-box">
          <label for="player-name-input" style="font-weight: 800; font-size: 1.15rem; color: #002000;">Entre ton prénom :</label>
          <div class="name-input-wrapper">
            <input type="text" id="player-name-input" class="name-input" placeholder="Ton prénom..." maxlength="18" autocomplete="off" autofocus />
          </div>
          <div class="name-prompt-actions">
            <button type="button" id="btn-save-score" class="btn-save-score">Enregistrer</button>
            <button type="button" id="btn-skip-score" class="btn-skip-grey">Ignorer</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const inputEl = overlay.querySelector('#player-name-input');
  const btnSave = overlay.querySelector('#btn-save-score');
  const btnSkip = overlay.querySelector('#btn-skip-score');

  if (inputEl) {
    inputEl.focus();
  }

  const finishStep1 = async (shouldSave = false) => {
    let savedId = null;
    if (shouldSave && inputEl) {
      const pName = inputEl.value.trim() || 'Anonyme';
      const entry = await addScoreRecord(gameId, pName, currentScore, scoreFormatted, isLowerBetter);
      savedId = entry.id;
    }

    overlay.remove();

    showLeaderboardModal({
      gameId,
      gameTitle,
      currentScore,
      scoreFormatted,
      isLowerBetter,
      newlySavedId: savedId,
      onClose,
    });
  };

  btnSave?.addEventListener('click', () => finishStep1(true));
  btnSkip?.addEventListener('click', () => finishStep1(false));

  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishStep1(true);
  });
}

/**
 * Step 2: Show leaderboard modal with Tabs (Week, Month, Year).
 */
export function showLeaderboardModal({
  gameId = 'game',
  gameTitle = 'Partie',
  currentScore = 0,
  scoreFormatted = '',
  isLowerBetter = false,
  newlySavedId = null,
  onClose = null,
}) {
  ensureCssLoaded();
  closeAllOverlays();

  const cleanTitle = (gameTitle || 'Partie').replace(/—/g, ':');
  const overlay = document.createElement('div');
  overlay.className = 'leaderboard-overlay';

  overlay.innerHTML = `
    <div class="leaderboard-card" role="dialog" aria-modal="true">
      <div class="leaderboard-header">
        <h2 class="leaderboard-title">🏆 Classement Général</h2>
        <div class="leaderboard-subtitle">${cleanTitle}</div>
      </div>

      <div class="leaderboard-body">
        <div class="tabs-container">
          <button type="button" class="tab-btn active" data-period="week">Semaine</button>
          <button type="button" class="tab-btn" data-period="month">Mois</button>
          <button type="button" class="tab-btn" data-period="year">Année</button>
        </div>

        <div class="scores-table-wrapper">
          <table class="scores-table">
            <thead>
              <tr>
                <th style="width:50px;">Rang</th>
                <th>Joueur</th>
                <th style="text-align:right;">Score</th>
              </tr>
            </thead>
            <tbody id="leaderboard-scores-body">
              <tr><td colspan="3" class="empty-msg">Chargement du classement global... ⏳</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="leaderboard-footer">
        <button type="button" id="btn-close-leaderboard" class="btn-close-leaderboard">Fermer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const tableBody = overlay.querySelector('#leaderboard-scores-body');
  const tabBtns = overlay.querySelectorAll('.tab-btn');
  const btnClose = overlay.querySelector('#btn-close-leaderboard');

  let currentPeriod = 'week';

  async function renderTable() {
    const populate = (entries) => {
      const topScores = filterScores(entries, currentPeriod, isLowerBetter);
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
    };

    // 1. Instantly display local cache including newly saved score
    const localData = loadLocalLeaderboard();
    const localEntries = localData[gameId] || [];
    populate(localEntries);

    // 2. Fetch fresh online scores from JSONBin and merge
    try {
      const globalData = await fetchGlobalLeaderboard();
      const globalEntries = globalData[gameId] || [];

      const entriesMap = new Map();
      localEntries.forEach(e => { if (e && e.id) entriesMap.set(e.id, e); });
      globalEntries.forEach(e => { if (e && e.id) entriesMap.set(e.id, e); });

      const mergedEntries = Array.from(entriesMap.values());
      populate(mergedEntries);
    } catch (err) {
      console.warn('Impossible de charger le classement global en ligne:', err);
    }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.getAttribute('data-period');
      renderTable();
    });
  });

  const closeModal = () => {
    playClickSound();
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

function ensureCssLoaded() {
  if (!document.querySelector('link[href*="leaderboard.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'styles/leaderboard.css';
    document.head.appendChild(link);
  }
}

function closeAllOverlays() {
  document.querySelectorAll('.leaderboard-overlay').forEach(el => el.remove());
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, match => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[match];
  });
}

export default {
  fetchGlobalLeaderboard,
  getTopScores,
  getTopScoresAsync,
  addScoreRecord,
  triggerEndGameSequence,
  showLeaderboardModal,
};
