import { metresBetween } from './model.js';

const canvas = document.getElementById('plot');
const mapNode = document.getElementById('map');
const mapLabel = document.getElementById('mapType');
const mapFooter = document.getElementById('mapStatus');
let current = { points: [], centre: null, fit: false };
let map, googleParts, previousKey, loadTimer;
let mapState = 'unset';
const overlays = [];

new ResizeObserver(() => { if (!canvas.hidden) drawPlot(); }).observe(canvas);
window.addEventListener('offline', drawMap);
window.addEventListener('online', () => { current.fit = true; drawMap(); });

export function configureMap(key) {
  if (key === previousKey) return;
  previousKey = key;
  if (!key) { mapState = 'unset'; drawMap(); return; }
  mapState = 'loading';
  drawMap();
  window.gm_authFailure = () => setMapError();
  const callback = 'loadFairwayGoogleMaps';
  window[callback] = () => {
    if (mapState !== 'loading') return;
    clearTimeout(loadTimer);
    googleParts = window.google.maps;
    map = new googleParts.Map(mapNode, {
      mapTypeId: 'satellite', center: { lat: -36.759, lng: 174.687 }, zoom: 16,
      fullscreenControl: false, streetViewControl: false, mapTypeControl: false,
      clickableIcons: false, gestureHandling: 'cooperative'
    });
    mapState = 'ready';
    current.fit = true;
    drawMap();
  };
  const script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
    key, callback, loading: 'async', v: 'weekly'
  });
  script.async = true;
  script.referrerPolicy = 'strict-origin';
  script.addEventListener('error', setMapError, { once: true });
  loadTimer = setTimeout(setMapError, 12000);
  document.head.append(script);
}

function setMapError() {
  clearTimeout(loadTimer);
  mapState = 'error';
  drawMap();
}

export function showShots(points, centre, fit = false) {
  current = { points, centre, fit };
  drawMap();
}

export function fitShots() {
  current.fit = true;
  drawMap();
}

function drawMap() {
  const googleReady = mapState === 'ready' && navigator.onLine;
  mapNode.hidden = !googleReady;
  canvas.hidden = googleReady;
  mapLabel.textContent = googleReady ? 'Satellite' : 'Shot plot';
  const messages = {
    ready: 'Google Maps satellite',
    unset: 'Add a Maps key in Settings for satellite view.',
    loading: 'Connecting to Google Maps…',
    error: 'Google Maps unavailable. Check the connection and key in Settings.'
  };
  mapFooter.textContent = navigator.onLine ? messages[mapState] : 'Offline · showing saved shot locations';
  if (!googleReady) { drawPlot(); return; }
  for (const overlay of overlays.splice(0)) overlay.setMap(null);
  const points = current.points;
  const path = points.map(({ lat, lng }) => ({ lat, lng }));
  if (path.length > 1) {
    overlays.push(new googleParts.Polyline({
      map, path, geodesic: true, strokeColor: '#d9f594', strokeWeight: 3, strokeOpacity: 1
    }));
  }
  points.forEach((point, index) => {
    const finish = point.kind === 'finish';
    const label = finish ? 'F' : String(index + 1);
    overlays.push(new googleParts.Marker({
      map, position: path[index], title: (finish ? 'Ball finish' : 'Shot ' + label) +
        (point.accuracy ? ' · ±' + Math.ceil(point.accuracy) + ' m' : ''),
      label: { text: label, color: '#1c2920', fontWeight: '700', fontSize: '12px' },
      icon: { path: googleParts.SymbolPath.CIRCLE, scale: 12, fillColor: finish ? '#f7f9eb' : '#d9f594',
        fillOpacity: 1, strokeColor: '#233c2d', strokeWeight: 2 }
    }));
  });
  if (current.fit && path.length > 1) {
    const bounds = new googleParts.LatLngBounds();
    for (const point of path) bounds.extend(point);
    if (!bounds.getSouthWest().equals(bounds.getNorthEast())) {
      map.fitBounds(bounds, 50);
      googleParts.event.addListenerOnce(map, 'idle', () => {
        if (map.getZoom() > 20) map.setZoom(20);
      });
    } else {
      map.setCenter(path[0]);
      map.setZoom(19);
    }
  } else if (current.fit && (path[0] || current.centre)) {
    map.setCenter(path[0] ?? current.centre);
    map.setZoom(18);
  }
  current.fit = false;
}

function drawPlot() {
  if (canvas.hidden || !canvas.clientWidth) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const resolution = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * resolution);
  canvas.height = Math.round(height * resolution);
  const ctx = canvas.getContext('2d');
  ctx.scale(resolution, resolution);
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#233c2d');
  background.addColorStop(1, '#192d25');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const points = current.points;
  const origin = points.at(0);
  const pad = 57;
  let spacing = 30, scale = 1, gridX = width / 2, gridY = height / 2, step = 25;
  let screenPoints = [];
  if (origin) {
    const latScale = 111195;
    const lngScale = latScale * Math.cos(origin.lat * Math.PI / 180);
    const projected = points.map(point => {
      const longitudeOffset = ((point.lng - origin.lng + 540) % 360) - 180;
      return { x: longitudeOffset * lngScale, y: (origin.lat - point.lat) * latScale };
    });
    const maxX = Math.max(...projected.map(p => p.x)), minX = Math.min(...projected.map(p => p.x));
    const maxY = Math.max(...projected.map(p => p.y)), minY = Math.min(...projected.map(p => p.y));
    scale = Math.min((width - pad * 2) / Math.max(28, maxX - minX),
      (height - pad * 2) / Math.max(28, maxY - minY));
    gridX -= (maxX + minX) * scale / 2;
    gridY -= (maxY + minY) * scale / 2;
    const minStep = 26 / scale;
    step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(x => x >= minStep) ?? minStep;
    spacing = step * scale;
    screenPoints = projected.map(p => ({ x: gridX + p.x * scale, y: gridY + p.y * scale }));
  }
  ctx.strokeStyle = '#e1f5cb1c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = (gridX % spacing + spacing) % spacing; x < width; x += spacing) {
    ctx.moveTo(x, 0); ctx.lineTo(x, height);
  }
  for (let y = (gridY % spacing + spacing) % spacing; y < height; y += spacing) {
    ctx.moveTo(0, y); ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#d8e8d5';
  ctx.font = '600 12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('N', width - 35, 76);
  ctx.beginPath();
  ctx.moveTo(width - 35, 83); ctx.lineTo(width - 42, 101); ctx.lineTo(width - 35, 97);
  ctx.lineTo(width - 28, 101); ctx.closePath(); ctx.fill();

  if (!origin) {
    ctx.font = '600 17px system-ui';
    ctx.fillText('No shot locations on this hole yet', width / 2, height / 2);
    ctx.font = '13px system-ui';
    ctx.fillText('Tap Mark shot from where you play the ball.', width / 2, height / 2 + 24);
    return;
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cfe99b';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  screenPoints.forEach(({ x, y }, i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.setLineDash([]);
  screenPoints.forEach(({ x, y }, index) => {
    if (index > 0) {
      const prior = screenPoints[index - 1];
      if (Math.hypot(x - prior.x, y - prior.y) > 72) {
        const label = Math.round(metresBetween(points[index - 1], points[index])) + ' m';
        const labelX = (x + prior.x) / 2, labelY = (y + prior.y) / 2;
        ctx.font = '600 12px system-ui';
        const tagWidth = ctx.measureText(label).width + 14;
        ctx.fillStyle = '#17271e';
        ctx.fillRect(labelX - tagWidth / 2, labelY - 10, tagWidth, 20);
        ctx.fillStyle = '#eff5df';
        ctx.fillText(label, labelX, labelY + 4);
      }
    }
    const finish = points[index].kind === 'finish';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = finish ? '#f7f9eb' : '#d9f594'; ctx.fill();
    ctx.strokeStyle = '#233c2d'; ctx.stroke();
    ctx.fillStyle = '#233c2d';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText(finish ? 'F' : index + 1, x, y + 4);
  });
  ctx.strokeStyle = '#d8e8d5';
  ctx.beginPath();
  ctx.moveTo(17, height - 18);
  ctx.lineTo(17 + spacing, height - 18);
  ctx.stroke();
  ctx.fillStyle = '#d8e8d5';
  ctx.textAlign = 'left';
  ctx.font = '600 11px system-ui';
  ctx.fillText(Math.round(step) + ' m', 17, height - 25);
}
