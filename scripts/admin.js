// admin.js (module)
// Each row: left line-number + 4 boxes. Each box contains 4 inputs.
// Single add (+) and remove (-) button sits under the grid.
// If the last row has any non-empty input, a confirmation modal appears before removal.
// Save uploads all rows to Supabase: update existing weeks, insert new ones.

if(localStorage.getItem("mdpOk") !== "true"){
  alert("Accès interdit : mot de passe requis");
  window.location.href = "index.html"; // redirection
  throw new Error("Accès interdit"); // stoppe le script
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------- CONFIG - remplace par tes infos ----------
const SUPABASE_URL = 'https://rwloeubpmlnrycyzhzuo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bG9ldWJwbWxucnljeXpoenVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDc0NjgsImV4cCI6MjA3MzQyMzQ2OH0.D9xpmy3K8m44O24MvGZYB-CqwX3MtG2ccsf2YpalxlI';
const WEEKS_TABLE = 'weeks'; // nom de la table
// ----------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  if (week && week.id) {
    rowEl.dataset.weekId = week.id;
    // optionally keep name/position in dataset
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

// ---------------- Supabase integration ----------------

// Load all weeks from DB and render them (ordered by position)
async function loadAllWeeks() {
  try {
    const { data, error } = await supabase
      .from(WEEKS_TABLE)
      .select('id, name, position, boxes')
      .order('position', { ascending: true });

    if (error) {
      console.error('Erreur supabase fetch:', error);
      alert('ERREUR : Prévenir Raphaël (NE RAJOUTE PAS DE MOTS SINON ILS NE SERONT PAS SAUVEGARDÉ)');
      // still seed a default row
      if (!grid.children.length) seed(1);
      return;
    }

    // if no data, seed one empty row
    if (!data || data.length === 0) {
      seed(1);
      return;
    }

    // clear grid
    grid.innerHTML = '';

    // for each week, create a row and fill inputs
    data.forEach((week) => {
      const row = createRow(week);
      grid.appendChild(row);

      // fill inputs: boxes is expected to be array of 4 {box, words}
      if (Array.isArray(week.boxes)) {
        const boxEls = row.querySelectorAll('.box');
        // for each box element, fill its 4 inputs
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
    alert('ERREUR : Prévenir Raphaël (NE RAJOUTE PAS DE MOTS SINON ILS NE SERONT PAS SAUVEGARDÉ');
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

// Save all rows: updates existing weeks and inserts new ones
async function saveAllRows() {
  const rows = Array.from(grid.querySelectorAll('.row'));
  if (!rows.length) {
    alert('Rien à sauvegarder.');
    return;
  }

  // prepare arrays
  const toUpdate = []; // { id, boxes, position, name }
  const toInsert = []; // { name, position, boxes }

  rows.forEach((row, idx) => {
    const position = idx + 1;
    const boxes = buildBoxesFromRow(row);
    const name = row.dataset.name ?? `Week ${position}`;

    if (row.dataset.weekId) {
      toUpdate.push({ id: row.dataset.weekId, boxes, position, name });
    } else {
      toInsert.push({ name, position, boxes });
    }
  });

  try {
    // perform updates (parallel)
    const updatePromises = toUpdate.map(u =>
      supabase
        .from(WEEKS_TABLE)
        .update({ boxes: u.boxes, position: u.position, name: u.name })
        .eq('id', u.id)
    );

    const insertPromise = toInsert.length
      ? supabase.from(WEEKS_TABLE).insert(toInsert)
      : Promise.resolve({ data: null, error: null });

    // run all
    const results = await Promise.all([...updatePromises, insertPromise]);

    // check for errors in results
    const errors = results.map(r => r.error).filter(e => e);
    if (errors.length) {
      console.error('Erreur saveAllRows:', err);
      alert('ERREUR : Prévenir Raphaël (NE FERME PAS LA PAGE SINON RIEN NE SERA SAUVEGARDÉ !!)');
    } else {
      alert('✅ Sauvegardé avec succès !');
      // reload to pick up inserted ids and current DB state
      await loadAllWeeks();
    }
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

// expose helpers for debug
window._adminGrid = {
  refreshNumbers,
  createRow,
  gridElement: grid,
  loadAllWeeks,
  saveAllRows
};
