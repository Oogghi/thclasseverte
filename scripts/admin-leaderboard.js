// scripts/admin-leaderboard.js
// Moderation & management of game leaderboards on JSONBin.io for TH Classe Verte.

import { getAdminKey } from './crypto-auth.js?v=20260903_v4';

const BIN_ID = '6a74a30eda38895dfec1d714';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const LOCAL_KEY = 'th_classe_verte_leaderboards_v1';

export const GAME_DEFINITIONS = [
  { id: 'memory', title: 'Memory 🃏' },
  { id: 'mots-meles', title: 'Mots Mêlés 🧩' },
  { id: 'wordle', title: 'Wordle 🔤' },
  { id: 'snakemots', title: 'Snake Mots 🐍' },
  { id: 'pacman-mots', title: 'Pac-Man Mots 👻' },
  { id: 'space-invaders-mots', title: 'Space Invaders Mots 👾' },
  { id: 'snake', title: 'Snake Classique 🍎' },
  { id: 'pacman', title: 'Pac-Man Classique 🟡' },
  { id: 'space-invaders', title: 'Space Invaders Classique 🚀' },
];

function getHeaders() {
  const adminKey = getAdminKey() || '$2a$10$dteCnNJw2l8XJtW/rGVlB.5Fe1I4izviOgeaDDg3B60j30rTvZzcW';
  return {
    'Content-Type': 'application/json',
    'X-Access-Key': adminKey,
    'X-Bin-Versioning': 'false',
  };
}

let cachedData = null;

/**
 * Fetch all leaderboards from JSONBin.
 */
export async function fetchAllScores() {
  try {
    const res = await fetch(`${JSONBIN_URL}/latest`, { headers: getHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()).record || {};
    cachedData = data;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (_) {}
    return data;
  } catch (err) {
    console.warn('Erreur chargement distant, fallback local:', err);
    try {
      const local = localStorage.getItem(LOCAL_KEY);
      cachedData = local ? JSON.parse(local) : {};
      return cachedData;
    } catch (_) {
      return {};
    }
  }
}

/**
 * Saves full record back to JSONBin and local cache.
 */
async function saveScoresToRemote(record) {
  record.version = (record.version || 0) + 1;
  const res = await fetch(JSONBIN_URL, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(record),
  });

  if (!res.ok) throw new Error(`Échec sauvegarde (HTTP ${res.status})`);
  const updated = (await res.json()).record || record;
  cachedData = updated;
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(updated)); } catch (_) {}
  return updated;
}

/**
 * Deletes a single score entry from a game.
 */
export async function deleteScoreRecord(gameId, scoreId) {
  const data = cachedData || await fetchAllScores();
  if (!Array.isArray(data[gameId])) return;

  data[gameId] = data[gameId].filter(entry => entry.id !== scoreId);
  return await saveScoresToRemote(data);
}

/**
 * Renames the player for a specific score entry.
 */
export async function renameScorePlayer(gameId, scoreId, newPlayerName) {
  const cleanName = (newPlayerName || '').trim();
  if (!cleanName) throw new Error('Le nom du joueur ne peut pas être vide.');

  const data = cachedData || await fetchAllScores();
  if (!Array.isArray(data[gameId])) return;

  const target = data[gameId].find(entry => entry.id === scoreId);
  if (!target) throw new Error('Score introuvable.');

  target.name = cleanName;
  return await saveScoresToRemote(data);
}

/**
 * Clears all scores for a given game.
 */
export async function clearGameScores(gameId) {
  const data = cachedData || await fetchAllScores();
  data[gameId] = [];
  return await saveScoresToRemote(data);
}

/**
 * Resets all scores across all games to empty arrays.
 */
export async function resetAllScores() {
  const data = cachedData || await fetchAllScores();
  GAME_DEFINITIONS.forEach(g => {
    data[g.id] = [];
  });
  return await saveScoresToRemote(data);
}

/**
 * Toast feedback helper.
 */
export function showAdminToast(msg, type = 'success') {
  let toast = document.getElementById('admin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'admin-toast';
    toast.className = 'admin-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.className = `admin-toast visible ${type}`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.className = 'admin-toast';
  }, 3200);
}
