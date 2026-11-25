import { GPS_OPTIONS, TARGET_ACCURACY, MAX_CAPTURE_ACCURACY, reading, freshFix, metresBetween,
  scoreStats, newRound, localDate, mapsLink } from './model.js';
import { configureMap, showShots, fitShots } from './map.js';

const $ = id => document.getElementById(id);
const sitePath = new URL('./', document.baseURI).pathname;
const STORAGE = 'fairway-log-v1:' + sitePath;
const MAP_KEY = 'fairway-log-maps-key:' + sitePath;
const dateFormat = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'long' });
const dateLabel = date => dateFormat.format(new Date(date + 'T12:00:00'));
const formatAccuracy = fix => '±' + Math.ceil(fix.accuracy) + ' m';
const distanceLabel = (a, b) => '≈' + Math.round(metresBetween(a, b)) + ' m';
const sample = newRound('North Shore Golf Club', localDate());
sample.holes[0].score = 4;
sample.holes[0].shots = [
  { lat: -36.75886, lng: 174.68970 }, { lat: -36.75725, lng: 174.68830 },
  { lat: -36.75635, lng: 174.68851 }, { lat: -36.75624, lng: 174.68858 }
];
sample.holes[0].finish = { lat: -36.75621, lng: 174.68859, kind: 'finish' };

let state = { activeId: null, rounds: [] };
try {
  const stored = localStorage.getItem(STORAGE);
  if (stored) state = JSON.parse(stored);
} catch { /* Show a storage error if a later write fails. */ }

let active = state.rounds.find(round => round.id === state.activeId) ?? sample;
let tab = 'play';
let fixes = [], watchId = null, gpsError = '', pending = null, watchEpoch = 0, gpsCentred = false;

function save() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(state));
    return true;
  } catch {
    feedback('Device storage is unavailable. This change is available until the app closes.');
    return false;
  }
}

function feedback(message = '') {
  $('feedback').textContent = message;
}

function currentHole() { return active.holes[active.hole]; }
function editable() { return active !== sample && !active.finished; }

function render() {
  const demo = active === sample;
  const hole = currentHole();
  const stats = scoreStats(active);
  $('date').textContent = demo ? 'Demo round' : dateLabel(active.date) + (active.finished ? ' · Finished' : '');
  $('course').textContent = active.course;
  $('summary').textContent = demo ? 'Sample shot locations. Start a new round to record your own.'
    : (stats.scored ? stats.strokes + ' gross strokes' : 'No scores yet') + ' · ' + stats.shots + ' shots marked';
  $('holeMeta').textContent = (active.hole + 1) + ' / 18 holes';
  $('holeTitle').textContent = 'Hole ' + (active.hole + 1);
  $('mapSubtitle').textContent = demo ? 'Sample data · Hole ' + (active.hole + 1) : 'Hole ' + (active.hole + 1) + ' · Recorded shot locations';
  $('prev').disabled = active.hole === 0;
  $('next').disabled = active.hole === 17;
  $('score').disabled = demo;
  $('score').value = hole.score ?? '';
  $('minus').disabled = demo || hole.score === null;
  $('plus').disabled = demo || hole.score >= 99;
  $('shotCount').textContent = '(' + hole.shots.length + ')';
  $('undo').hidden = !editable();
  $('undo').disabled = !hole.shots.length && !hole.finish;
  $('markLabel').textContent = demo ? 'Start tracking' : 'Mark shot';
  $('mark').hidden = !editable() && !demo;
  $('mark').disabled = Boolean(pending || (editable() && hole.finish));
  $('endPosition').hidden = !editable() || !hole.shots.length || Boolean(hole.finish);
  $('endPosition').disabled = Boolean(pending);
  $('finish').hidden = demo || active.finished;
  $('scoreSummary').textContent = stats.scored + ' of 18 scored' + (stats.scored ? ' · ' + stats.strokes + ' gross strokes' : '');
  renderShotList(hole);
  renderScorecard();
  updateGps();
  renderMap();
}

function renderShotList(hole) {
  const points = [...hole.shots, ...(hole.finish ? [hole.finish] : [])];
  $('shots').replaceChildren();
  for (const [index, point] of points.entries()) {
    const row = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = point.kind === 'finish' ? 'F' : String(index + 1);
    const link = document.createElement('a');
    link.textContent = point.kind === 'finish' ? 'Ball finish' : 'Shot ' + (index + 1);
    link.href = mapsLink(point);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', link.textContent + ' in Google Maps');
    const details = document.createElement('span');
    details.textContent = [index ? distanceLabel(points[index - 1], point) : '', point.accuracy ? 'GPS ' + formatAccuracy(point) : '']
      .filter(Boolean).join(' · ');
    row.append(number, link, details);
    $('shots').append(row);
  }
  if (!points.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No locations marked.';
    $('shots').append(empty);
  }
}

function renderScorecard() {
  $('holes').replaceChildren();
  active.holes.forEach((hole, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Hole ' + (index + 1) + ', ' + (hole.score === null ? 'unscored' : hole.score + ' strokes'));
    if (index === active.hole) button.setAttribute('aria-current', 'true');
    const number = document.createElement('span');
    number.textContent = index + 1;
    const score = document.createElement('strong');
    score.textContent = hole.score ?? '–';
    button.append(number, score);
    button.addEventListener('click', () => {
      selectHole(index);
      $('holes').children[index].focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 760px)').matches) $('holeTitle').scrollIntoView({ block: 'center' });
    });
    $('holes').append(button);
  });
}

function renderMap(fit = false) {
  const hole = currentHole();
  const points = [...hole.shots, ...(hole.finish ? [hole.finish] : [])];
  const location = points[0] ?? (editable() ? freshFix(fixes) : null);
  $('openMap').hidden = !location;
  if (location) $('openMap').href = mapsLink(location);
  showShots(points, location, fit);
}

function updateGps() {
  const fix = freshFix(fixes);
  const badge = $('gps');
  let label = 'GPS off', weak = false;
  if (active === sample) label = 'Demo data';
  else if (editable()) {
    if (gpsError) { label = gpsError; weak = true; }
    else if (fix) {
      label = 'GPS ' + formatAccuracy(fix);
      weak = fix.accuracy > TARGET_ACCURACY;
    } else { label = 'Finding GPS…'; weak = true; }
  }
  badge.textContent = label;
  badge.toggleAttribute('data-weak', weak);
}

function startGps() {
  if (!editable() || tab !== 'play' || document.hidden || watchId !== null) return;
  if (!navigator.geolocation) {
    gpsError = 'GPS unavailable';
    updateGps();
    return;
  }
  gpsError = '';
  const epoch = ++watchEpoch;
  watchId = navigator.geolocation.watchPosition(position => {
    if (epoch !== watchEpoch) return;
    const now = Date.now();
    const fix = reading(position, now);
    if (!fix || now - fix.timestamp > 4000) return;
    gpsError = '';
    fixes = fixes.filter(existing => now - existing.timestamp <= 4000);
    fixes.push(fix);
    considerCaptureFix(fix);
    updateGps();
    if (!gpsCentred && fix.accuracy <= MAX_CAPTURE_ACCURACY) {
      gpsCentred = true;
      renderMap(!currentHole().shots.length);
    }
  }, error => {
    if (epoch !== watchEpoch) return;
    fixes = [];
    gpsError = error.code === 1 ? 'Location denied' : 'GPS unavailable';
    if (error.code === 1) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (pending) {
        cancelCapture();
        feedback('Allow location access for this app in iPhone settings, then tap again.');
      }
    }
    updateGps();
  }, GPS_OPTIONS);
}

function stopGps() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchEpoch++;
  watchId = null;
  fixes = [];
  gpsCentred = false;
  cancelCapture();
  updateGps();
}

function cancelCapture() {
  if (pending) {
    clearTimeout(pending.timer);
    pending = null;
    if ($('feedback').textContent.startsWith('Hold still')) feedback();
    $('mark').disabled = Boolean(editable() && currentHole().finish);
    $('endPosition').disabled = false;
  }
}

function capture(kind) {
  if (!editable() || pending) return;
  const hole = currentHole();
  if (hole.finish || (kind === 'finish' && !hole.shots.length)) return;
  if (!navigator.geolocation) { feedback('Location is unavailable in this browser. Open the app in Safari.'); return; }
  startGps();
  const now = Date.now();
  const fast = freshFix(fixes, now);
  if (kind === 'shot' && now - (hole.shots.at(-1)?.capturedAt ?? 0) < 700) return;
  const request = { kind, started: now, best: null };
  pending = request;
  if (fast && now - fast.timestamp <= 1500 && fast.accuracy <= TARGET_ACCURACY) {
    commitCapture(fast);
    return;
  }
  $('mark').disabled = true;
  $('endPosition').disabled = true;
  feedback('Hold still while the phone gets a location fix…');
  pending.timer = setTimeout(() => {
    const usable = pending.best;
    if (usable && usable.accuracy <= MAX_CAPTURE_ACCURACY) {
      commitCapture(usable);
    } else {
      cancelCapture();
      feedback(gpsError === 'Location denied'
        ? 'Allow location access in iPhone settings, then tap again.'
        : 'No precise fix. Stay at the ball and tap again.');
    }
  }, 5000);
  navigator.geolocation.getCurrentPosition(position => {
    if (pending !== request) return;
    const fix = reading(position);
    if (fix) considerCaptureFix(fix);
  }, error => {
    if (pending !== request || error.code !== 1) return;
    cancelCapture();
    feedback('Allow location access in iPhone settings, then tap again.');
  }, { ...GPS_OPTIONS, timeout: 5000 });
}

function considerCaptureFix(fix) {
  if (!pending || fix.timestamp < pending.started - 250) return;
  if (!pending.best || fix.accuracy < pending.best.accuracy) pending.best = fix;
  if (fix.accuracy <= TARGET_ACCURACY) commitCapture(fix);
}

function commitCapture(fix) {
  const kind = pending.kind;
  const hole = currentHole();
  cancelCapture();
  const point = { ...fix, kind, capturedAt: Date.now() };
  if (kind === 'finish') hole.finish = point;
  else hole.shots.push(point);
  if (save()) {
    const description = kind === 'finish' ? 'Ball finish' : 'Shot ' + hole.shots.length;
    feedback(description + ' marked · GPS ' + formatAccuracy(fix));
  }
  render();
  fitShots();
}

function selectHole(index) {
  if (index < 0 || index > 17) return;
  cancelCapture();
  active.hole = index;
  feedback();
  if (active !== sample) save();
  render();
  fitShots();
}

function setScore(value, refresh = true) {
  if (active === sample) return;
  const score = value === '' ? null : Number(value);
  if (score !== null && (!/^\d{1,2}$/.test(String(value)) || score < 1 || score > 99)) return;
  currentHole().score = score;
  save();
  if (refresh) render();
}

function showTab(nextTab) {
  tab = nextTab;
  $('play').hidden = tab !== 'play';
  $('history').hidden = tab !== 'history';
  document.querySelectorAll('[data-tab]').forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (tab === 'play') {
    render();
    fitShots();
    startGps();
  } else {
    stopGps();
    renderHistory();
  }
}

function renderHistory() {
  $('rounds').replaceChildren();
  if (!state.rounds.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Your recorded rounds will appear here.';
    $('rounds').append(empty);
  }
  for (const round of [...state.rounds].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)) {
    const button = document.createElement('button');
    button.className = 'panel';
    button.type = 'button';
    const left = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = round.course;
    const detail = document.createElement('span');
    detail.className = 'muted';
    detail.textContent = dateLabel(round.date) + (round.finished ? ' · Finished' : ' · In progress');
    left.append(title, detail);
    const stats = scoreStats(round);
    const right = document.createElement('span');
    right.className = 'muted';
    right.textContent = stats.scored ? stats.strokes + ' strokes · ' + stats.scored + '/18' : 'Unscored';
    button.append(left, right);
    button.addEventListener('click', () => {
      stopGps();
      active = round;
      state.activeId = round.id;
      if (save()) feedback();
      showTab('play');
      window.scrollTo(0, 0);
    });
    $('rounds').append(button);
  }
}

function openNewRound() {
  $('roundDate').value = localDate();
  $('courseInput').value = active === sample ? '' : active.course;
  $('courseInput').setCustomValidity('');
  $('roundDialog').showModal();
}

function exportRounds() {
  const rows = [['Round ID', 'Course', 'Date', 'Finished', 'Hole', 'Gross Score', 'Point', 'Latitude', 'Longitude',
    'GPS Accuracy (m)', 'Fix Time (UTC)', 'Saved Time (UTC)', 'Distance from Previous Point (m)']];
  for (const round of state.rounds) {
    round.holes.forEach((hole, index) => {
      const base = [round.id, round.course, round.date, round.finished, index + 1, hole.score ?? ''];
      const points = [...hole.shots, ...(hole.finish ? [hole.finish] : [])];
      if (!points.length) rows.push(base);
      points.forEach((point, i) => rows.push([...base, point.kind === 'finish' ? 'Finish' : i + 1, point.lat,
        point.lng, point.accuracy, new Date(point.timestamp).toISOString(),
        new Date(point.capturedAt).toISOString(), i ? Math.round(metresBetween(points[i - 1], point)) : '']));
    });
  }
  const csv = rows.map(row => Array.from({ length: rows[0].length }, (_, i) => {
    const value = row[i] ?? '';
    const safe = typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? "'" + value : value;
    return '"' + String(safe).replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fairway-log-' + localDate() + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function savedKey() {
  try { return localStorage.getItem(MAP_KEY) ?? ''; } catch { return ''; }
}

$('newRound').addEventListener('click', openNewRound);
$('mark').addEventListener('click', () => active === sample ? openNewRound() : capture('shot'));
$('endPosition').addEventListener('click', () => capture('finish'));
$('roundForm').addEventListener('submit', event => {
  event.preventDefault();
  const course = $('courseInput').value.trim();
  if (!course) {
    $('courseInput').setCustomValidity('Enter a course or layout.');
    $('courseInput').reportValidity();
    return;
  }
  stopGps();
  active = newRound(course, $('roundDate').value);
  state.rounds.push(active);
  state.activeId = active.id;
  if (save()) feedback();
  $('roundDialog').close();
  showTab('play');
});
$('courseInput').addEventListener('input', () => $('courseInput').setCustomValidity(''));
$('settings').addEventListener('click', () => {
  $('key').value = savedKey();
  $('settingsDialog').showModal();
});
$('settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  const key = $('key').value.trim();
  if (key === savedKey()) { $('settingsDialog').close(); return; }
  try { localStorage.setItem(MAP_KEY, key); }
  catch {
    $('key').setCustomValidity('This browser could not save the key.');
    $('key').reportValidity();
    return;
  }
  location.reload();
});
$('key').addEventListener('input', () => $('key').setCustomValidity(''));
$('export').addEventListener('click', exportRounds);
document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => $(button.dataset.close).close());
});
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => showTab(button.dataset.tab));
});
$('prev').addEventListener('click', () => selectHole(active.hole - 1));
$('next').addEventListener('click', () => selectHole(active.hole + 1));
$('fit').addEventListener('click', fitShots);
$('minus').addEventListener('click', () => setScore(currentHole().score > 1 ? currentHole().score - 1 : ''));
$('plus').addEventListener('click', () => setScore((currentHole().score ?? 0) + 1));
$('score').addEventListener('input', event => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 2);
  setScore(event.target.value, false);
});
$('score').addEventListener('blur', () => {
  if (tab === 'play') {
    $('score').value = currentHole().score ?? '';
    const stats = scoreStats(active);
    $('summary').textContent = (stats.scored ? stats.strokes + ' gross strokes' : 'No scores yet') + ' · ' + stats.shots + ' shots marked';
    $('scoreSummary').textContent = stats.scored + ' of 18 scored' + (stats.scored ? ' · ' + stats.strokes + ' gross strokes' : '');
    const selected = $('holes').children[active.hole];
    selected.lastElementChild.textContent = currentHole().score ?? '–';
    selected.setAttribute('aria-label', 'Hole ' + (active.hole + 1) + ', ' + (currentHole().score === null ? 'unscored' : currentHole().score + ' strokes'));
    $('minus').disabled = currentHole().score === null;
    $('plus').disabled = currentHole().score >= 99;
  }
});
$('undo').addEventListener('click', () => {
  cancelCapture();
  const hole = currentHole();
  if (hole.finish) hole.finish = null;
  else hole.shots.pop();
  if (save()) feedback('Last location removed.');
  render();
  fitShots();
});
$('finish').addEventListener('click', () => {
  const { scored } = scoreStats(active);
  if (scored < 18 && !window.confirm('Save this round with ' + (18 - scored) + ' holes unscored?')) return;
  stopGps();
  active.finished = true;
  if (save()) feedback('Round saved to History.');
  render();
});
document.addEventListener('visibilitychange', () => document.hidden ? stopGps() : startGps());
window.addEventListener('pagehide', stopGps);
window.addEventListener('pageshow', startGps);
setInterval(() => { if (editable() && tab === 'play' && !document.hidden) updateGps(); }, 1000);

configureMap(savedKey());
showTab('play');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
