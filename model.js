export const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 };
export const TARGET_ACCURACY = 12;
export const MAX_CAPTURE_ACCURACY = 35;

export function reading(position, now = Date.now()) {
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  const { timestamp } = position;
  if (![lat, lng, accuracy, timestamp].every(Number.isFinite) || accuracy <= 0 ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180 || timestamp > now + 1000) return null;
  return { lat, lng, accuracy, timestamp };
}

export function freshFix(fixes, now = Date.now()) {
  return fixes.filter(fix => now - fix.timestamp <= 4000)
    .sort((a, b) => a.accuracy - b.accuracy || b.timestamp - a.timestamp)[0];
}

export function metresBetween(a, b) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function scoreStats(round) {
  return round.holes.reduce((total, hole) => ({
    scored: total.scored + Number(hole.score !== null),
    strokes: total.strokes + (hole.score ?? 0),
    shots: total.shots + hole.shots.length
  }), { scored: 0, strokes: 0, shots: 0 });
}

export function newRound(course, date) {
  return {
    id: crypto.randomUUID(), course, date, created: Date.now(), finished: false, hole: 0,
    holes: Array.from({ length: 18 }, () => ({ score: null, shots: [], finish: null }))
  };
}

export function localDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-');
}

export function mapsLink(point) {
  return 'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(point.lat.toFixed(7) + ',' + point.lng.toFixed(7));
}
