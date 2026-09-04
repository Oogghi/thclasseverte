// scripts/admin.js (module)
import { isAdminLoggedIn, logoutAdmin } from './crypto-auth.js?v=20260903_v4';
import { getAllWeeks, saveAllWeeks } from './fetch_json.js?v=20260903_v3';
import {
  GAME_DEFINITIONS,
  fetchAllScores,
  deleteScoreRecord,
  renameScorePlayer,
  clearGameScores,
  resetAllScores,
  showAdminToast,
} from './admin-leaderboard.js?v=20260903_v5';

// Security check
if (!isAdminLoggedIn()) {
  alert("Accès interdit : mot de passe requis");
  window.location.href = "index.html";
  throw new Error("Accès interdit");
}

/* ==========================================================================
   CUSTOM IN-PAGE MODAL DIALOG (REPLACES NATIVE CONFIRM & PROMPT)
   ========================================================================== */
function openConfirmDialog({
  title = 'Confirmation',
  text = '',
  confirmText = 'Confirmer',
  danger = true,
  promptKeyword = null
}) {
  return new Promise((resolve) => {
    const dModal = document.getElementById('danger-modal');
    const dTitle = document.getElementById('danger-modal-title');
    const dText = document.getElementById('danger-modal-text');
    const dInputWrap = document.getElementById('danger-modal-input-wrap');
    const dInput = document.getElementById('danger-modal-input');
    const dConfirmBtn = document.getElementById('danger-modal-confirm-btn');
    const dCancelBtn = document.getElementById('danger-modal-cancel-btn');

    dTitle.textContent = title;
    dText.textContent = text;
    dConfirmBtn.textContent = confirmText;

    if (danger) {
      dConfirmBtn.className = 'btn-tool danger';
      dConfirmBtn.style.background = '';
    } else {
      dConfirmBtn.className = 'btn-tool';
      dConfirmBtn.style.background = 'var(--accent-yellow)';
    }

    if (promptKeyword) {
      dInputWrap.style.display = 'block';
      dInput.value = '';
      dInput.placeholder = `Tapez "${promptKeyword}" pour valider`;
      dInput.style.borderColor = '';
    } else {
      dInputWrap.style.display = 'none';
    }

    dModal.setAttribute('aria-hidden', 'false');
    if (promptKeyword) {
      setTimeout(() => dInput.focus(), 60);
    } else {
      setTimeout(() => dConfirmBtn.focus(), 60);
    }

    function cleanup() {
      dModal.setAttribute('aria-hidden', 'true');
      dConfirmBtn.removeEventListener('click', onConfirmClick);
      dCancelBtn.removeEventListener('click', onCancelClick);
      document.removeEventListener('keydown', onKeyDown);
    }

    function onConfirmClick() {
      if (promptKeyword) {
        if (dInput.value.trim() !== promptKeyword) {
          dInput.style.borderColor = '#c62828';
          dInput.focus();
          return;
        }
      }
      cleanup();
      resolve(true);
    }

    function onCancelClick() {
      cleanup();
      resolve(false);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') onCancelClick();
      if (e.key === 'Enter' && promptKeyword) onConfirmClick();
    }

    dConfirmBtn.addEventListener('click', onConfirmClick);
    dCancelBtn.addEventListener('click', onCancelClick);
    document.addEventListener('keydown', onKeyDown);
  });
}

/* ==========================================================================
   TABS MANAGEMENT
   ========================================================================== */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    tabButtons.forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    tabPanels.forEach(p => {
      p.classList.toggle('active', p.id === `panel-${targetTab}`);
    });

    if (targetTab === 'scores') {
      loadAndRenderScores();
    }
  });
});

/* ==========================================================================
   TAB 1: WORDS MANAGEMENT (WEEKS & BOXES)
   ========================================================================== */
const grid = document.getElementById('grid');
const template = document.getElementById('row-template');
const addBtn = document.getElementById('add-row-btn');
const removeBtn = document.getElementById('remove-row-btn');
const saveBtn = document.getElementById('save-btn');

function createRow(week = null) {
  const node = document.importNode(template.content, true);
  const rowEl = node.querySelector('.row');
  if (week) {
    if (week.position != null) rowEl.dataset.position = String(week.position);
    if (week.name) rowEl.dataset.name = week.name;
  }
  return rowEl;
}

function seed(rows = 1) {
  for (let i = 0; i < rows; i++) {
    grid.appendChild(createRow());
  }
  refreshNumbers();
  updateRemoveState();
}

function refreshNumbers() {
  const rows = grid.querySelectorAll('.row');
  rows.forEach((r, idx) => {
    const numEl = r.querySelector('.line-num');
    if (numEl) numEl.textContent = String(idx + 1);
  });
}

function updateRemoveState() {
  const rows = grid.querySelectorAll('.row');
  removeBtn.disabled = rows.length <= 1;
}

function rowHasContent(rowEl) {
  const inputs = rowEl.querySelectorAll('.box-input');
  for (const input of inputs) {
    if (input.value.trim() !== '') return true;
  }
  return false;
}

function addRowBelow() {
  const newRow = createRow();
  grid.appendChild(newRow);
  refreshNumbers();
  updateRemoveState();
  const firstInput = newRow.querySelector('.box-input');
  if (firstInput) firstInput.focus();
}

function performRemoveLastRow() {
  const rows = grid.querySelectorAll('.row');
  if (rows.length <= 1) return;
  const last = rows[rows.length - 1];
  last.remove();
  refreshNumbers();
  updateRemoveState();
}

async function requestRemoveLastRow() {
  const rows = grid.querySelectorAll('.row');
  if (rows.length <= 1) return;
  const last = rows[rows.length - 1];
  if (rowHasContent(last)) {
    const ok = await openConfirmDialog({
      title: 'Supprimer cette semaine',
      text: 'La dernière ligne contient des mots. La supprimer effacera définitivement cette semaine.',
      confirmText: 'Supprimer',
      danger: true,
    });
    if (ok) {
      performRemoveLastRow();
    }
  } else {
    performRemoveLastRow();
  }
}

addBtn?.addEventListener('click', addRowBelow);
removeBtn?.addEventListener('click', requestRemoveLastRow);

async function loadAllWeeks() {
  grid.innerHTML = '';
  try {
    const weeks = await getAllWeeks();
    if (!weeks || weeks.length === 0) {
      seed(1);
      return;
    }

    weeks.forEach(week => {
      const row = createRow(week);
      const boxesEls = row.querySelectorAll('.box');
      if (Array.isArray(week.boxes)) {
        week.boxes.forEach(boxObj => {
          const boxIdx = (boxObj.box || 1) - 1;
          const targetBox = boxesEls[boxIdx];
          if (targetBox && Array.isArray(boxObj.words)) {
            const inputs = targetBox.querySelectorAll('.box-input');
            boxObj.words.forEach((w, i) => {
              if (inputs[i]) inputs[i].value = w ?? '';
            });
          }
        });
      }
      grid.appendChild(row);
    });

    refreshNumbers();
    updateRemoveState();
  } catch (err) {
    console.error('Erreur chargement weeks:', err);
    seed(1);
  }
}

async function saveAllRows() {
  const rows = Array.from(grid.querySelectorAll('.row'));
  const weeks = rows.map((rowEl, rowIdx) => ({
    position: rowIdx + 1,
    name: rowEl.dataset.name || `Semaine ${rowIdx + 1}`,
    boxes: Array.from(rowEl.querySelectorAll('.box')).map((boxEl, boxIdx) => ({
      box: boxIdx + 1,
      words: Array.from(boxEl.querySelectorAll('.box-input')).map(inp => inp.value.trim()),
    })),
  }));

  try {
    await saveAllWeeks(weeks);
    showAdminToast('Mots enregistrés avec succès.', 'success');
    await loadAllWeeks();
  } catch (err) {
    console.error('Erreur saveAllRows:', err);
    showAdminToast('Erreur : impossible d\'enregistrer les mots.', 'error');
  }
}

saveBtn?.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Enregistrement…';
  await saveAllRows();
  saveBtn.disabled = false;
  saveBtn.textContent = 'Enregistrer les mots';
});

/* ==========================================================================
   TAB 2: LEADERBOARDS MODERATION
   ========================================================================== */
let currentScoresData = {};
let selectedGameId = 'all';
let currentEditingItem = null;

const pillsContainer = document.getElementById('game-pills-container');
const searchInput = document.getElementById('scores-search');
const tableBody = document.getElementById('scores-table-body');
const emptyState = document.getElementById('scores-empty-state');

const btnRefresh = document.getElementById('btn-refresh-scores');
const btnClearGame = document.getElementById('btn-clear-game');
const btnResetAll = document.getElementById('btn-reset-all');

const renameModal = document.getElementById('rename-modal');
const renameScoreLabel = document.getElementById('rename-score-label');
const renameInput = document.getElementById('rename-input');
const renameSaveBtn = document.getElementById('rename-save-btn');
const renameCancelBtn = document.getElementById('rename-cancel-btn');

function getGameTitle(gameId) {
  const g = GAME_DEFINITIONS.find(def => def.id === gameId);
  return g ? g.title : gameId;
}

function updatePillCounts() {
  let totalAll = 0;
  GAME_DEFINITIONS.forEach(def => {
    const list = currentScoresData[def.id] || [];
    totalAll += list.length;
    const pill = pillsContainer.querySelector(`[data-game="${def.id}"]`);
    if (pill) {
      pill.textContent = `${def.title} (${list.length})`;
    }
  });

  const allPill = pillsContainer.querySelector('[data-game="all"]');
  if (allPill) {
    allPill.textContent = `Tous les jeux (${totalAll})`;
  }

  // Update "Vider ce jeu" button state
  if (btnClearGame) {
    btnClearGame.disabled = (selectedGameId === 'all');
    btnClearGame.style.opacity = selectedGameId === 'all' ? '0.4' : '1';
    btnClearGame.style.cursor = selectedGameId === 'all' ? 'not-allowed' : 'pointer';
  }
}

function renderScoresTable() {
  tableBody.innerHTML = '';
  const searchFilter = (searchInput?.value || '').toLowerCase().trim();

  // Aggregate scores to display
  let entries = [];
  if (selectedGameId === 'all') {
    GAME_DEFINITIONS.forEach(def => {
      const list = currentScoresData[def.id] || [];
      list.forEach(entry => {
        entries.push({ ...entry, _gameId: def.id });
      });
    });
  } else {
    const list = currentScoresData[selectedGameId] || [];
    entries = list.map(entry => ({ ...entry, _gameId: selectedGameId }));
  }

  // Apply search query
  if (searchFilter) {
    entries = entries.filter(e =>
      (e.name || '').toLowerCase().includes(searchFilter) ||
      (e.scoreFormatted || '').toLowerCase().includes(searchFilter)
    );
  }

  // Sort by timestamp desc or rank
  entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (entries.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  entries.forEach((entry, idx) => {
    const tr = document.createElement('tr');

    const formattedDate = entry.timestamp
      ? new Date(entry.timestamp).toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : (entry.weekKey || '-');

    tr.innerHTML = `
      <td style="font-weight: 800; color: #667766;">${idx + 1}</td>
      <td>
        <span style="font-weight: 800; font-size: 0.88rem; background: #e8f5e9; border: 1px solid #1b5e20; border-radius: 6px; padding: 2px 8px; color: #1b5e20;">
          ${getGameTitle(entry._gameId)}
        </span>
      </td>
      <td>
        <div class="player-cell">
          <span>${escapeHtml(entry.name)}</span>
        </div>
      </td>
      <td class="score-cell">${escapeHtml(entry.scoreFormatted || String(entry.score))}</td>
      <td class="period-cell">
        <div>${escapeHtml(entry.weekKey || '')}</div>
        <div style="font-size: 0.78rem; opacity: 0.75;">${formattedDate}</div>
      </td>
      <td style="text-align: right;">
        <div class="actions-cell" style="justify-content: flex-end;">
          <button type="button" class="btn-row-action btn-rename" data-game="${entry._gameId}" data-id="${entry.id}">
            Modifier
          </button>
          <button type="button" class="btn-row-action btn-delete-row" data-game="${entry._gameId}" data-id="${entry.id}">
            Supprimer
          </button>
        </div>
      </td>
    `;

    // Row action events
    tr.querySelector('.btn-rename')?.addEventListener('click', () => {
      openRenameModal(entry._gameId, entry);
    });

    tr.querySelector('.btn-delete-row')?.addEventListener('click', async () => {
      const ok = await openConfirmDialog({
        title: 'Supprimer ce score',
        text: `Supprimer définitivement le score de "${entry.name}" (${entry.scoreFormatted || entry.score}) ?`,
        confirmText: 'Supprimer',
        danger: true,
      });

      if (ok) {
        try {
          await deleteScoreRecord(entry._gameId, entry.id);
          showAdminToast(`Score de "${entry.name}" supprimé.`);
          await loadAndRenderScores(false);
        } catch (err) {
          showAdminToast('Erreur lors de la suppression : ' + err.message, 'error');
        }
      }
    });

    tableBody.appendChild(tr);
  });
}

async function loadAndRenderScores(fetchRemote = true) {
  if (btnRefresh) {
    btnRefresh.textContent = 'Chargement…';
    btnRefresh.disabled = true;
  }

  try {
    currentScoresData = fetchRemote ? await fetchAllScores() : (currentScoresData || await fetchAllScores());
    updatePillCounts();
    renderScoresTable();
  } catch (err) {
    console.error('Erreur chargement scores:', err);
    showAdminToast('Erreur lors du chargement des scores.', 'error');
  } finally {
    if (btnRefresh) {
      btnRefresh.textContent = 'Rafraîchir';
      btnRefresh.disabled = false;
    }
  }
}

// Game pill click events
pillsContainer?.addEventListener('click', (e) => {
  const pill = e.target.closest('.game-pill');
  if (!pill) return;

  pillsContainer.querySelectorAll('.game-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  selectedGameId = pill.dataset.game;

  updatePillCounts();
  renderScoresTable();
});

// Search input debounce
searchInput?.addEventListener('input', () => {
  renderScoresTable();
});

// Refresh button
btnRefresh?.addEventListener('click', () => {
  loadAndRenderScores(true);
});

// Clear current game button
btnClearGame?.addEventListener('click', async () => {
  if (selectedGameId === 'all') return;
  const gameName = getGameTitle(selectedGameId);
  const count = (currentScoresData[selectedGameId] || []).length;

  if (count === 0) {
    showAdminToast(`Le classement pour ${gameName} est déjà vide.`);
    return;
  }

  const ok = await openConfirmDialog({
    title: `Vider le jeu ${gameName}`,
    text: `Supprimer l'intégralité des ${count} scores enregistrés pour "${gameName}" ? Cette action est irréversible.`,
    confirmText: 'Vider les scores',
    danger: true,
  });

  if (ok) {
    try {
      await clearGameScores(selectedGameId);
      showAdminToast(`Scores de "${gameName}" supprimés.`);
      await loadAndRenderScores(false);
    } catch (err) {
      showAdminToast('Erreur lors de la suppression : ' + err.message, 'error');
    }
  }
});

// Reset all games button
btnResetAll?.addEventListener('click', async () => {
  const ok = await openConfirmDialog({
    title: 'Réinitialisation globale',
    text: 'Attention : cette action effacera définitivement l\'intégralité des scores de TOUS les jeux.',
    confirmText: 'Tout réinitialiser',
    danger: true,
    promptKeyword: 'RESET',
  });

  if (ok) {
    try {
      await resetAllScores();
      showAdminToast('Tous les classements ont été réinitialisés.');
      await loadAndRenderScores(false);
    } catch (err) {
      showAdminToast('Erreur réinitialisation : ' + err.message, 'error');
    }
  }
});

// Rename Modal
function openRenameModal(gameId, entry) {
  currentEditingItem = { gameId, entry };
  renameScoreLabel.textContent = `${entry.scoreFormatted || entry.score} (${getGameTitle(gameId)})`;
  renameInput.value = entry.name || '';
  renameModal.setAttribute('aria-hidden', 'false');
  renameInput.focus();
  renameInput.select();
}

function closeRenameModal() {
  renameModal.setAttribute('aria-hidden', 'true');
  currentEditingItem = null;
}

renameCancelBtn?.addEventListener('click', closeRenameModal);

renameSaveBtn?.addEventListener('click', async () => {
  if (!currentEditingItem) return;
  const newName = renameInput.value.trim();
  if (!newName) {
    renameInput.focus();
    return;
  }

  renameSaveBtn.disabled = true;
  renameSaveBtn.textContent = 'Enregistrement…';

  try {
    await renameScorePlayer(currentEditingItem.gameId, currentEditingItem.entry.id, newName);
    showAdminToast(`Joueur renommé en "${newName}".`);
    closeRenameModal();
    await loadAndRenderScores(false);
  } catch (err) {
    showAdminToast('Erreur renommage : ' + err.message, 'error');
  } finally {
    renameSaveBtn.disabled = false;
    renameSaveBtn.textContent = 'Enregistrer';
  }
});

renameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') renameSaveBtn.click();
  if (e.key === 'Escape') closeRenameModal();
});

/* ==========================================================================
   TAB 3: SETTINGS & LOGOUT
   ========================================================================== */
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  const ok = await openConfirmDialog({
    title: 'Déconnexion',
    text: 'Voulez-vous fermer votre session administrateur sur cet appareil ?',
    confirmText: 'Déconnexion',
    danger: true,
  });

  if (ok) {
    logoutAdmin();
    window.location.href = 'index.html';
  }
});

document.getElementById('btn-force-sync')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-force-sync');
  btn.disabled = true;
  btn.textContent = 'Synchronisation en cours…';
  try {
    await Promise.all([loadAllWeeks(), loadAndRenderScores(true)]);
    showAdminToast('Synchronisation réussie.');
  } catch (err) {
    showAdminToast('Erreur synchronisation : ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Synchroniser maintenant';
  }
});

// HTML escaping helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
loadAllWeeks();
