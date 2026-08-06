// admin.js (module)
// Each row: left line-number + 4 boxes. Each box contains 4 inputs.
// Single add (+) and remove (-) button sits under the grid.
// If the last row has any non-empty input, a confirmation modal appears before removal.
// Save replaces the full weeks array via fetch_json.js.

if(localStorage.getItem("mdpOk") !== "true"){
  alert("Accès interdit : mot de passe requis");
  window.location.href = "index.html"; // redirection
  throw new Error("Accès interdit"); // stoppe le script
}

import { getAllWeeks, saveAllWeeks } from './fetch_json.js';

const grid = document.getElementById('grid');
const template = document.getElementById('row-template');
const addBtn = document.getElementById('add-row-btn');
const removeBtn = document.getElementById('remove-row-btn');
const saveBtn = document.getElementById('save-btn');

// modal elements
const modal = document.getElementById('confirm-modal');
const modalYes = document.getElementById('confirm-yes');
const modalCancel = document.getElementById('confirm-cancel');

// clone a template row and return the element (with optional week data)
function createRow(week = null) {
  const node = document.importNode(template.content, true);
  const rowEl = node.querySelector('.row');
  if (week) {
    if (week.position != null) rowEl.dataset.position = String(week.position);
    if (week.name) rowEl.dataset.name = week.name;
  }
  return rowEl;
}

// seed with empty rows if DB empty
function seed(rows = 1) {
  for (let i = 0; i < rows; i++) {
    grid.appendChild(createRow());
  }
  refreshNumbers();
  updateRemoveState();
}

// Refresh sequential numbering across all boxes (1,2,3,...) and left line numbers (1,2,...)
function refreshNumbers() {
  // update line numbers per row
  const rows = Array.from(grid.querySelectorAll('.row'));
  rows.forEach((row, rowIndex) => {
    const lineEl = row.querySelector('.line-num');
    if (lineEl) lineEl.textContent = String(rowIndex + 1);
    // store position in dataset
    row.dataset.position = String(rowIndex + 1);
  });

  // update box sequential numbers across all rows
  const boxes = grid.querySelectorAll('.box');
  boxes.forEach((box, idx) => {
    const numEl = box.querySelector('.num');
    if (numEl) numEl.textContent = String(idx + 1);
    const inputs = box.querySelectorAll('.box-input');
    inputs.forEach((inp, i) => {
      inp.setAttribute('placeholder', `Mot ${i + 1}`);
    });
  });
}

// Check if a row (element) has any non-empty input
function rowHasContent(rowEl) {
  if (!rowEl) return false;
  const inputs = rowEl.querySelectorAll('.box-input');
  for (const inp of inputs) {
    if (inp.value && inp.value.trim().length > 0) return true;
  }
  return false;
}

// Show modal (custom) and return a promise resolved with true/false
function showConfirm() {
  return new Promise((resolve) => {
    modal.setAttribute('aria-hidden', 'false');
    modalCancel.focus();

    function cleanup(result) {
      modal.setAttribute('aria-hidden', 'true');
      modalYes.removeEventListener('click', onYes);
      modalCancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeyDown);
      resolve(result);
    }

    function onYes() { cleanup(true); }
    function onCancel() { cleanup(false); }

    function onKeyDown(e) {
      if (e.key === 'Escape') { cleanup(false); }
    }

    modalYes.addEventListener('click', onYes);
    modalCancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeyDown);
  });
}

// Handler for add button: append a new row to the end
addBtn.addEventListener('click', function () {
  const newRow = createRow();
  grid.appendChild(newRow);
  refreshNumbers();
  updateRemoveState();

  // focus first input of the newly added row
  const lastRow = grid.lastElementChild;
  if (lastRow) {
    const firstInput = lastRow.querySelector('.box-input');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 30);
    }
  }
  // scroll to new row
  lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Keyboard support for add button
addBtn.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    addBtn.click();
  }
});

// Remove button handler with confirmation logic (operates on last row)
removeBtn.addEventListener('click', async function () {
  const lastRow = grid.lastElementChild;
  if (!lastRow) return;

  // if last row has content, confirm
  if (rowHasContent(lastRow)) {
    const ok = await showConfirm();
    if (!ok) {
      // cancelled
      return;
    }
  }

  // remove the last row
  lastRow.remove();
  refreshNumbers();
  updateRemoveState();
});

// Update remove button disabled state (disabled when no rows)
function updateRemoveState() {
  const hasRows = grid.children.length > 0;
  if (!hasRows) {
    removeBtn.setAttribute('disabled', 'true');
  } else {
    removeBtn.removeAttribute('disabled');
  }
}

// Allow keyboard activation on remove button
removeBtn.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    removeBtn.click();
  }
});

// ---------------- fetch_json.js integration ----------------

// Load all weeks and render them (ordered by position)
async function loadAllWeeks() {
  try {
    const data = await getAllWeeks();

    if (!data || data.length === 0) {
      seed(1);
      return;
    }

    grid.innerHTML = '';

    data.forEach((week) => {
      const row = createRow(week);
      grid.appendChild(row);

      if (Array.isArray(week.boxes)) {
        const boxEls = row.querySelectorAll('.box');
        week.boxes.forEach((boxData, boxIndex) => {
          const boxEl = boxEls[boxIndex];
          if (!boxEl) return;
          const inputs = boxEl.querySelectorAll('.box-input');
          const words = Array.isArray(boxData.words) ? boxData.words : [];
          inputs.forEach((inp, i) => inp.value = words[i] ?? '');
        });
      }
    });

    refreshNumbers();
    updateRemoveState();
  } catch (err) {
    console.error('Erreur loadAllWeeks:', err);
    alert('ERREUR : Prévenir Raphaël (NE RAJOUTE PAS DE MOTS SINON ILS NE SERONT PAS SAUVEGARDÉ)');
    if (!grid.children.length) seed(1);
  }
}

// Build boxes JSON for a given row element
function buildBoxesFromRow(rowEl) {
  const boxes = [];
  const boxEls = rowEl.querySelectorAll('.box');
  boxEls.forEach((boxEl, boxIdx) => {
    const inputs = Array.from(boxEl.querySelectorAll('.box-input'));
    const words = inputs.map(i => i.value?.trim() ?? '');
    boxes.push({ box: boxIdx + 1, words });
  });
  return boxes;
}

// Save all rows: full replace of the weeks array
async function saveAllRows() {
  const rows = Array.from(grid.querySelectorAll('.row'));
  if (!rows.length) {
    alert('Rien à sauvegarder.');
    return;
  }

  const weeks = rows.map((row, idx) => ({
    position: idx + 1,
    name:     row.dataset.name ?? `Week ${idx + 1}`,
    boxes:    buildBoxesFromRow(row),
  }));

  try {
    await saveAllWeeks(weeks);
    alert('✅ Sauvegardé avec succès !');
    await loadAllWeeks();
  } catch (err) {
    console.error('Erreur saveAllRows:', err);
    alert('ERREUR : Prévenir Raphaël (NE FERME PAS LA PAGE SINON RIEN NE SERA SAUVEGARDÉ !!)');
  }
}

// wire up save button
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  await saveAllRows();
  saveBtn.disabled = false;
  saveBtn.textContent = '💾 Save';
});

// initialize: load data
loadAllWeeks();
