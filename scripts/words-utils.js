// scripts/words-utils.js
// Centralized word utilities for TH Classe Verte games.
import { getBoxes } from './fetch_json.js';

/**
 * Extracts week position from current URL ?cases= query parameter.
 * Default mapping: 4 boxes per week. (cases 1-4 => week 1, 5-8 => week 2, etc.)
 */
export function getWeekPositionFromURL(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  try {
    const params = new URLSearchParams(search);
    const cases = parseInt(params.get('cases') || '1', 10);
    const parsed = isNaN(cases) ? 1 : cases;
    return Math.max(1, Math.floor((parsed - 1) / 4) + 1);
  } catch (_) {
    return 1;
  }
}

/**
 * Normalizes a word by stripping diacritics and converting to lowercase.
 */
export function stripDiacritics(text) {
  if (!text) return '';
  return String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * Normalizes a word by stripping diacritics and converting to uppercase ASCII.
 */
export function normalizeWord(text) {
  if (!text) return '';
  return String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();
}

/**
 * In-place Fisher-Yates array shuffle.
 */
export function shuffle(arr) {
  const array = Array.isArray(arr) ? arr : [];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Standard fallback words if network or bin is unreachable.
 */
export const DEFAULT_FALLBACK_WORDS = [
  'MAISON', 'ARBRE', 'SOLEIL', 'ECOLE', 'JARDIN', 'FLEUR',
  'OISEAU', 'NUAGE', 'ETOILE', 'PLANETE', 'FUSEE', 'ESPACE',
  'FORET', 'RIVIERE', 'MONTAGNE', 'VILLAGE'
];

/**
 * Loads and extracts all words for the active week based on URL parameters.
 */
export async function loadWeekWords(fallbackWords = DEFAULT_FALLBACK_WORDS, search = undefined) {
  try {
    const weekIndex = getWeekPositionFromURL(search);
    const boxes = await getBoxes(weekIndex);
    if (!boxes || !boxes.length) throw new Error(`Semaine ${weekIndex} introuvable ou vide`);

    const extracted = boxes
      .flatMap(box => (Array.isArray(box?.words) ? box.words : []))
      .map(w => (w == null ? '' : String(w).trim()))
      .filter(Boolean);

    if (!extracted.length) throw new Error('Aucun mot valide dans la semaine');
    return shuffle([...extracted]);
  } catch (err) {
    console.warn('Erreur chargement mots semaine:', err);
    return shuffle([...(fallbackWords && fallbackWords.length ? fallbackWords : DEFAULT_FALLBACK_WORDS)]);
  }
}

export default {
  getWeekPositionFromURL,
  stripDiacritics,
  normalizeWord,
  shuffle,
  DEFAULT_FALLBACK_WORDS,
  loadWeekWords,
};
