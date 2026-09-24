// Interactive regional chart of airports Nikhil has visited.
// Positions are from the FAA Chart Supplement; connecting lines are visual guides,
// not claims that these particular routes were flown.
(function airportMap(){
  const AIRPORTS = [
    { code: 'KEDC', name: 'Austin Executive', lat: 30.3975, lon: -97.5663, anchor: true, labelX: 12, labelY: 20 },
    { code: 'KGTU', name: 'Georgetown Executive', lat: 30.6788, lon: -97.6793, labelX: 11, labelY: -10 },
    { code: 'KACT', name: 'Waco Regional', lat: 31.6122, lon: -97.2303, labelX: 11, labelY: -12 },
    { code: 'KSEP', name: 'Stephenville Clark Regional', lat: 32.2153, lon: -98.1777, labelX: 11, labelY: -10 },
    { code: 'KAQO', name: 'Llano Municipal', lat: 30.7842, lon: -98.6598, labelX: -54, labelY: -10 },
    { code: 'KDZB', name: 'Horseshoe Bay Resort', lat: 30.5270, lon: -98.3588, labelX: -54, labelY: 23 },
    { code: 'KRYW', name: 'Lago Vista / Rusty Allen', lat: 30.4987, lon: -97.9695, labelX: -54, labelY: -10 },
    { code: 'KCLL', name: 'Easterwood Field · College Station', lat: 30.5880, lon: -96.3625, labelX: -56, labelY: -11 }
  ];
  const canvas = document.getElementById('globeCanvas');
  const list = document.getElementById('globePlaces');
  const info = document.getElementById('airportSelection');
  if(!canvas || !list || !info) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const root = document.documentElement;
  const W = 720, H = 500, PAD = 52;
  const BOX = { west: -99.02, east: -96.08, south: 30.10, north: 32.48 };
  const home = AIRPORTS[0];
  let selected = home;
  let zoom = 1, panX = 0, panY = 0;
  let dragging = null;

  function base(a){
    return {
      x: PAD + (a.lon - BOX.west) / (BOX.east - BOX.west) * (W - 2 * PAD),
      y: PAD + (BOX.north - a.lat) / (BOX.north - BOX.south) * (H - 2 * PAD)
    };
  }
  function point(a){
    const b = base(a);
    return { x: W / 2 + (b.x - W / 2) * zoom + panX,
             y: H / 2 + (b.y - H / 2) * zoom + panY };
  }
  function nauticalMiles(a, b){
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(3440.065 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
  }
  function palette(){
    const c = getComputedStyle(root);
    const v = key => c.getPropertyValue(key).trim();
    return { paper: v('--card'), ink: v('--ink'), soft: v('--ink-soft'), grid: v('--line'),
      blue: v('--blue'), magenta: v('--magenta'), amber: v('--amber'), green: v('--green') };
  }
  function line(from, to, color, width, dash){
    const a = point(from), b = point(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const bend = Math.min(40, Math.hypot(dx, dy) * .14) * (dy < 0 ? 1 : -1);
    const cx = (a.x + b.x) / 2 - dy / Math.max(1, Math.hypot(dx, dy)) * bend;
    const cy = (a.y + b.y) / 2 + dx / Math.max(1, Math.hypot(dx, dy)) * bend;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    return { a, b, cx, cy };
  }
  function draw(){
    const c = palette();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = c.paper; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = c.grid; ctx.globalAlpha = .36; ctx.lineWidth = 1;
    for(let lat = 30.5; lat <= 32; lat += .5){
      const y = point({ lat, lon: BOX.west }).y;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = c.soft; ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillText('N' + lat.toFixed(1), 12, y - 5);
    }
    for(let lon = -98.5; lon <= -96.5; lon += .5){
      const x = point({ lat: BOX.south, lon }).x;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = c.soft; ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillText('W' + Math.abs(lon).toFixed(1), x + 5, 20);
    }
    ctx.globalAlpha = 1;

    const origin = point(home);
    [25, 50, 75].forEach(nm => {
      const radius = nm / 60 * (H - 2 * PAD) / (BOX.north - BOX.south) * zoom;
      ctx.beginPath(); ctx.arc(origin.x, origin.y, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = c.blue; ctx.globalAlpha = .18; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    });

    AIRPORTS.slice(1).forEach(a => line(home, a, c.blue, 1.2, [5, 7]));
    if(selected !== home){
      const route = line(home, selected, c.magenta, 3, []);
      // Small route pointer shows the direction toward the selected field.
      const t = .63, x = (1-t)**2*route.a.x + 2*(1-t)*t*route.cx + t*t*route.b.x;
      const y = (1-t)**2*route.a.y + 2*(1-t)*t*route.cy + t*t*route.b.y;
      const vx = 2*(1-t)*(route.cx-route.a.x) + 2*t*(route.b.x-route.cx);
      const vy = 2*(1-t)*(route.cy-route.a.y) + 2*t*(route.b.y-route.cy);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(vy, vx));
      ctx.fillStyle = c.magenta;
      ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(-7,-5); ctx.lineTo(-3,0); ctx.lineTo(-7,5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    AIRPORTS.forEach(a => {
      const p = point(a), active = a === selected;
      ctx.beginPath(); ctx.arc(p.x, p.y, active ? 9 : 6, 0, 2*Math.PI);
      ctx.fillStyle = active ? c.amber : a.anchor ? c.blue : c.magenta;
      ctx.fill(); ctx.strokeStyle = c.paper; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = (active ? '700 ' : '500 ') + '12px "IBM Plex Mono", monospace';
      ctx.fillStyle = c.ink;
      ctx.fillText(a.code, p.x + a.labelX, p.y + a.labelY);
    });

    ctx.fillStyle = c.ink; ctx.font = '700 13px "IBM Plex Mono", monospace';
    ctx.fillText('CENTRAL TEXAS // VISITED AIRFIELDS', 20, H - 20);
    ctx.fillText('N ↑', W - 50, H - 20);
  }

  function select(a){
    selected = a;
    list.querySelectorAll('button').forEach(b => {
      const active = b.dataset.code === a.code;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    info.textContent = a.anchor ? a.code + ' · ' + a.name + ' — chart anchor'
      : a.code + ' · ' + a.name + ' — ' + nauticalMiles(home, a) + ' NM straight-line from KEDC';
    draw();
  }
  AIRPORTS.forEach(a => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'globe-chip'; button.dataset.code = a.code;
    button.innerHTML = '<strong>' + a.code + '</strong><span>' + a.name + '</span>';
    button.addEventListener('click', () => select(a));
    list.appendChild(button);
  });

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function clampPan(){
    const limitX = 60 + (zoom - 1) * W / 2, limitY = 60 + (zoom - 1) * H / 2;
    panX = Math.max(-limitX, Math.min(limitX, panX));
    panY = Math.max(-limitY, Math.min(limitY, panY));
  }
  function setZoom(next){ zoom = Math.max(1, Math.min(2.6, next)); clampPan(); draw(); }
  document.getElementById('mapZoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
  document.getElementById('mapZoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
  document.getElementById('mapReset').addEventListener('click', () => { zoom = 1; panX = panY = 0; select(home); });

  function localPoint(event){
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * W / r.width, y: (event.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener('pointerdown', event => {
    const p = localPoint(event);
    const hit = AIRPORTS.find(a => Math.hypot(point(a).x - p.x, point(a).y - p.y) < 18);
    if(hit){ select(hit); return; }
    dragging = { id: event.pointerId, x: p.x, y: p.y };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if(!dragging || event.pointerId !== dragging.id) return;
    const p = localPoint(event);
    panX += p.x - dragging.x; panY += p.y - dragging.y;
    dragging.x = p.x; dragging.y = p.y;
    clampPan(); draw();
  });
  canvas.addEventListener('pointerup', () => { dragging = null; });
  canvas.addEventListener('pointercancel', () => { dragging = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });

  document.addEventListener('cockpit:theme', draw);
  window.addEventListener('resize', resize);
  resize(); select(home);
})();
