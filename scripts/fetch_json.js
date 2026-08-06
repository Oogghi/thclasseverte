const API_KEY      = '$2a$10$dteCnNJw2l8XJtW/rGVlB.5Fe1I4izviOgeaDDg3B60j30rTvZzcW';
const BIN_ID       = '6a180afaddf5aa59f76f42a3';
const URL          = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const HEADERS      = {
  'Content-Type'     : 'application/json',
  'X-Access-Key'     : API_KEY,
  'X-Bin-Versioning' : 'false',
};

async function _get() {
  const res = await fetch(`${URL}/latest`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET failed: ${res.status}`);
  return (await res.json()).record;
}

async function _update(updater, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const current = await _get();
    const updated = updater(structuredClone(current));
    updated.version = (current.version ?? 0) + 1;
    const res = await fetch(URL, {
      method  : 'PUT',
      headers : HEADERS,
      body    : JSON.stringify(updated),
    });
    if (res.ok) return (await res.json()).record;
    await new Promise(r => setTimeout(r, 150 * (i + 1)));
  }
  throw new Error('Échec écriture après plusieurs tentatives');
}

export async function getAllWeeks() {
  const data = await _get();
  const weeks = Array.isArray(data?.weeks) ? data.weeks : [];
  return [...weeks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export async function getWeekByPosition(position) {
  const weeks = await getAllWeeks();
  return weeks.find(w => w.position === position) ?? null;
}

export async function getBoxes(position) {
  const week = await getWeekByPosition(position);
  return week?.boxes ?? null;
}

export async function getWords(position, box) {
  const boxes = await getBoxes(position);
  return boxes?.find(b => b.box === box)?.words ?? [];
}

export async function addWeek(weekObj) {
  return _update(data => {
    const existingWeeks = Array.isArray(data?.weeks) ? data.weeks : [];
    return {
      ...data,
      weeks: [...existingWeeks, weekObj].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    };
  });
}

export async function updateWeekBoxes(position, newBoxes) {
  return _update(data => {
    const existingWeeks = Array.isArray(data?.weeks) ? data.weeks : [];
    return {
      ...data,
      weeks: existingWeeks.map(w =>
        w.position === position ? { ...w, boxes: newBoxes } : w
      ),
    };
  });
}

// Replace the entire weeks array in one write (used by admin to handle add/edit/delete in one shot).
export async function saveAllWeeks(weeksArray) {
  return _update(data => ({ ...data, weeks: weeksArray }));
}