// ---------------------------------------------------------------
// "Land it" — a side-view final approach into Austin. The headwind
// and gusts come from the live KAUS wind when it's available.
// ---------------------------------------------------------------
(function landingGame(){
  const canvas = document.getElementById('gameCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const overlay = document.getElementById('gameOverlay');
  const titleEl = document.getElementById('gameTitle');
  const msgEl = document.getElementById('gameMsg');
  const startBtn = document.getElementById('gameStart');
  const bestEl = document.getElementById('gameBest');
  const badgeEl = document.getElementById('gameBadge');
  const upBtn = document.getElementById('noseUp');
  const downBtn = document.getElementById('noseDown');
  const cockpit = window.cockpit || { store: { get(){ return null; }, set(){} }, say(){}, phonetic: () => [] };

  const W = 800, H = 340;
  const GROUND = 292;
  const START_X = 30, START_ALT = 190;
  const RW0 = 540, RW1 = 780, AIM = 590;
  const IDEAL_SLOPE = START_ALT / (AIM - START_X);

  const cloudImg = new Image();
  cloudImg.src = 'clouds/cloud-2.png';
  cloudImg.onload = () => { if(!running) draw(); };

  let colors = {};
  let wind = { headwind: 8, kt: 8, runway: '18 left', spoken: 'wind one eight zero at eight' };
  let s = null;
  let running = false;
  let finished = null;
  let input = { up: false, down: false };
  let last = 0;
  let frame = 0;

  function fitCanvas(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function readColors(){
    const cs = getComputedStyle(root);
    const v = name => cs.getPropertyValue(name).trim();
    const night = root.classList.contains('night') ||
      (root.dataset.sky === 'night' && !root.classList.contains('force-day'));
    colors = {
      night,
      skyTop: v('--sky-top') || '#6FA8C9',
      skyBottom: v('--sky-bottom') || '#D9E8ED',
      ink: v('--ink') || '#2A2620',
      card: v('--card') || '#EFE7D2',
      magenta: v('--magenta') || '#9C3B6E',
      runwayPaint: v('--runway') || '#D9A62B',
      ground: night ? '#17241a' : '#7f9b5c',
      groundFar: night ? '#1c2b22' : '#93ab6e',
      runway: night ? '#2b2d31' : '#4a4a4d'
    };
  }

  function readWind(){
    const w = cockpit.weather;
    if(!w) return;
    const rel = (w.windDir - w.runway.heading) * Math.PI / 180;
    wind = {
      kt: w.windKt,
      headwind: Math.max(0, Math.min(25, Math.round(w.windKt * Math.cos(rel)))),
      runway: w.runway.short,
      spoken: w.spokenWind
    };
    if(!running && !finished) titleEl.textContent = 'Cleared to land, runway ' + wind.runway;
  }

  function reset(){
    const gs = 1.55 - wind.headwind * 0.014;
    s = {
      x: START_X,
      alt: START_ALT,
      gs,
      vs: gs * IDEAL_SLOPE,
      trim: gs * IDEAL_SLOPE,
      gustTimer: 60 + Math.random() * 60,
      shake: 0,
      rollout: 0,
      papi: 2
    };
  }

  function callsign(){
    const p = cockpit.passenger ? cockpit.phonetic(cockpit.passenger).slice(0, 3).join(' ') : '';
    return p || 'Cessna Four Five Two Alpha Charlie';
  }

  function papiWhites(){
    if(s.x >= AIM - 8) return s.papi;
    const ratio = (s.alt / (AIM - s.x)) / IDEAL_SLOPE;
    if(ratio > 1.25) return 4;
    if(ratio > 1.08) return 3;
    if(ratio > 0.92) return 2;
    if(ratio > 0.75) return 1;
    return 0;
  }
  const PAPI_WORDS = ['low — add power, nose up', 'slightly low', 'on the glide path', 'slightly high', 'high — nose down'];

  // ---------------- simulation ----------------
  function step(dt){
    frame += dt;
    if(finished){
      if(finished.ok && s.rollout < 1){
        s.rollout = Math.min(1, s.rollout + 0.012 * dt);
        s.x += s.gs * (1 - s.rollout) * dt;
      }
      return;
    }

    if(input.up) s.vs -= 0.012 * dt;
    if(input.down) s.vs += 0.012 * dt;
    // a trimmed airplane drifts back toward its trimmed descent rate
    if(!input.up && !input.down) s.vs += (s.trim - s.vs) * 0.004 * dt;

    s.gustTimer -= dt;
    if(s.gustTimer <= 0){
      const g = 0.12 + wind.kt * 0.006;
      s.vs += (Math.random() * 2 - 1) * g;
      s.shake = 10;
      s.gustTimer = 50 + Math.random() * (110 - Math.min(60, wind.kt * 3));
    }
    if(s.shake > 0) s.shake -= dt;

    s.vs = Math.max(-0.3, Math.min(1.6, s.vs));
    s.alt = Math.min(300, s.alt - s.vs * dt);
    s.x += s.gs * dt;
    s.papi = papiWhites();

    if(s.alt <= 0){
      s.alt = 0;
      touchdown();
    } else if(s.x > RW1 - 30){
      end(false, 'Floated past the runway', 'You never got it down. Pilots call that a go-around — line up and try again.', 'Go around. Fly runway heading, climb and maintain two thousand.');
    }
  }

  function touchdown(){
    const fpm = Math.round(s.vs * 1000);
    if(s.x < RW0){
      end(false, 'Landed short', 'You touched down in the grass before the runway. Watch the PAPI — four reds means you are too low.', 'Aircraft short of the runway. Trucks are rolling, everyone is fine.');
      return;
    }
    if(s.vs > 0.75){
      end(false, 'Hard landing', 'You hit at ' + fpm + ' feet per minute and the gear did not survive. Hold the nose up just before touchdown to flare.', 'That was firm. Maintenance will want a word.');
      return;
    }
    if(s.x > RW1 - 60){
      end(false, 'Landed long', 'You touched down too far along to stop before the end of the runway. Aim for the big white markers.', 'Aircraft off the end of the runway. Everyone is fine.');
      return;
    }
    const score = Math.max(0, Math.min(100, Math.round(
      100 - Math.max(0, s.vs - 0.12) * 90 - Math.max(0, Math.abs(s.x - AIM) - 25) * 0.3
    )));
    const grade = fpm <= 180 ? 'Butter' : fpm <= 400 ? 'Smooth landing' : 'Firm landing';
    const who = cockpit.passenger ? ', ' + cockpit.passenger : '';
    end(true, grade + ' — score ' + score, 'Touchdown at ' + Math.max(0, fpm) + ' feet per minute, ' +
      Math.round(Math.abs(s.x - AIM) * 6) + ' feet from the aiming point. Nice flying' + who + '.',
      score >= 90 ? 'Smooth one. Welcome to Austin.' : 'Nice landing. Turn left at the next taxiway, contact ground.', score);
  }

  function end(ok, title, msg, radioLine, score){
    finished = { ok, title, msg, score: score || 0 };
    input.up = input.down = false;
    cockpit.say(radioLine);
    if(ok){
      const best = Number(cockpit.store.get('bestLanding') || 0);
      if(score > best) cockpit.store.set('bestLanding', String(score));
    }
    setTimeout(showResult, ok ? 1300 : 700);
  }

  function showResult(){
    running = false;
    titleEl.textContent = finished.title;
    msgEl.textContent = finished.msg;
    startBtn.textContent = 'Fly it again';
    renderBest();
    overlay.hidden = false;
    startBtn.focus({ preventScroll: true });
  }

  function renderBest(){
    const best = Number(cockpit.store.get('bestLanding') || 0);
    bestEl.textContent = best ? 'Best landing so far: ' + best + ' / 100' : '';
    badgeEl.hidden = best < 80;
  }

  // ---------------- rendering ----------------
  function draw(){
    const sx = s && s.shake > 0 ? (Math.random() - 0.5) * 2 : 0;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, colors.skyTop);
    sky.addColorStop(1, colors.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    if(colors.night){
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for(let i = 0; i < 40; i++){
        const x = (i * 97) % W, y = (i * 53) % 180;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    if(cloudImg.complete && cloudImg.naturalWidth){
      ctx.globalAlpha = colors.night ? 0.25 : 0.8;
      const drift = (frame * 0.15) % (W + 300);
      ctx.drawImage(cloudImg, W - drift, 40, 150, 92);
      ctx.drawImage(cloudImg, (W * 0.55 - drift * 0.6 + W + 300) % (W + 300) - 150, 90, 100, 61);
      ctx.globalAlpha = 1;
    }

    // distant hills
    ctx.fillStyle = colors.groundFar;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    for(let x = 0; x <= W; x += 40){
      ctx.lineTo(x, GROUND - 14 - Math.sin(x * 0.012) * 8 - Math.sin(x * 0.031) * 4);
    }
    ctx.lineTo(W, GROUND);
    ctx.fill();

    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, GROUND, W, H - GROUND);

    // glide path guide
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = colors.night ? 'rgba(255,255,255,0.18)' : 'rgba(42,38,32,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(START_X, GROUND - START_ALT);
    ctx.lineTo(AIM, GROUND);
    ctx.stroke();
    ctx.setLineDash([]);

    // runway
    ctx.fillStyle = colors.runway;
    ctx.fillRect(RW0, GROUND - 3, RW1 - RW0, 7);
    ctx.fillStyle = '#f4f1e8';
    for(let i = 0; i < 4; i++) ctx.fillRect(RW0 + 4 + i * 5, GROUND - 2, 3, 5);
    for(let x = RW0 + 40; x < RW1 - 10; x += 26) ctx.fillRect(x, GROUND - 0.5, 12, 1.5);
    ctx.fillRect(AIM - 12, GROUND - 2.5, 24, 5);

    if(colors.night){
      ctx.fillStyle = '#ffd98a';
      for(let x = RW0; x <= RW1; x += 20){ ctx.beginPath(); ctx.arc(x, GROUND - 4, 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#6dff9a';
      ctx.beginPath(); ctx.arc(RW0, GROUND - 4, 2.4, 0, Math.PI * 2); ctx.fill();
      // approach "rabbit" strobes
      const rabbit = Math.floor(frame / 4) % 8;
      for(let i = 0; i < 8; i++){
        ctx.fillStyle = i === 7 - rabbit ? '#ffffff' : 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(RW0 - 12 - i * 14, GROUND - 3, 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // PAPI lights
    const whites = s ? s.papi : 2;
    for(let i = 0; i < 4; i++){
      const white = i < whites;
      ctx.fillStyle = white ? '#fffdf5' : '#ff3b3b';
      ctx.shadowColor = white ? 'rgba(255,255,255,0.9)' : 'rgba(255,60,60,0.9)';
      ctx.shadowBlur = colors.night ? 10 : 4;
      ctx.beginPath();
      ctx.arc(AIM - 44 + i * 9, GROUND + 10, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // windsock (points downwind — toward the approaching plane)
    const wsX = RW0 - 30, wsTop = GROUND - 30;
    ctx.strokeStyle = colors.night ? '#9aa3b5' : '#5a5344';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wsX, GROUND); ctx.lineTo(wsX, wsTop); ctx.stroke();
    const inflate = Math.min(1, wind.headwind / 15);
    const len = 22, droop = (1 - inflate) * 14;
    for(let i = 0; i < 4; i++){
      ctx.fillStyle = i % 2 ? '#ffffff' : '#f07a2a';
      const a = i / 4, b = (i + 1) / 4;
      ctx.beginPath();
      ctx.moveTo(wsX - len * a, wsTop + droop * a - 5 * (1 - a * 0.5));
      ctx.lineTo(wsX - len * b, wsTop + droop * b - 5 * (1 - b * 0.5));
      ctx.lineTo(wsX - len * b, wsTop + droop * b + 5 * (1 - b * 0.5));
      ctx.lineTo(wsX - len * a, wsTop + droop * a + 5 * (1 - a * 0.5));
      ctx.fill();
    }

    if(s){
      // nose drops when sinking fast, rises in the flare
      const pitch = s.alt <= 0 ? 0 : Math.max(-0.25, Math.min(0.2, (s.vs - 0.35) * 0.35));
      drawPlane(s.x + sx, GROUND - s.alt - 10 + sx, pitch);
      drawHud();
    }
    ctx.restore();
  }

  // side profile of a high-wing trainer, nose to the right, wheels at y≈+10
  function drawPlane(x, y, pitch){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pitch);
    ctx.scale(1.25, 1.25);
    const body = colors.night ? '#dfe3ee' : colors.ink;
    ctx.fillStyle = body;
    ctx.strokeStyle = body;

    ctx.beginPath();
    ctx.moveTo(-26, -6); ctx.lineTo(-10, -4); ctx.lineTo(2, -9); ctx.lineTo(12, -9);
    ctx.lineTo(18, -3); ctx.lineTo(25, -2); ctx.lineTo(27, 1); ctx.lineTo(25, 4);
    ctx.lineTo(10, 5); ctx.lineTo(-10, 3); ctx.lineTo(-26, -1);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-26, -6); ctx.lineTo(-22, -17); ctx.lineTo(-17, -17); ctx.lineTo(-14, -5);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(-28, -3, 12, 1.6);
    ctx.fillRect(-3, -11.5, 17, 2.4);

    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(9, -9.5); ctx.lineTo(4, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(6, 7.5); ctx.moveTo(21, 3.5); ctx.lineTo(21, 7.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, 8.5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(21, 8.5, 1.8, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = colors.night ? 'rgba(20,28,51,0.7)' : 'rgba(217,232,237,0.85)';
    ctx.beginPath();
    ctx.moveTo(3, -8); ctx.lineTo(11, -8); ctx.lineTo(16, -3.5); ctx.lineTo(3, -3.5);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = body;
    ctx.fillRect(27.5, -7, 1.4, 15);
    ctx.restore();
  }

  function drawHud(){
    const fpm = Math.round(s.vs * 1000);
    const rows = [
      'ALT   ' + String(Math.round(s.alt * 6 / 10) * 10).padStart(5) + ' ft',
      'V/S   ' + String(-fpm).padStart(5) + ' fpm',
      'GS    ' + String(Math.round(s.gs * 45)).padStart(5) + ' kt',
      'WIND  ' + String(wind.headwind).padStart(5) + ' kt head',
      'PAPI  ' + PAPI_WORDS[s.papi]
    ];
    const hx = W - 242;
    ctx.fillStyle = colors.card;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(hx, 12, 230, 96);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.ink;
    ctx.font = '12px "IBM Plex Mono", monospace';
    rows.forEach((r, i) => ctx.fillText(r, hx + 10, 32 + i * 17));
    if(fpm > 750 && s.alt < 60 && !finished){
      ctx.fillStyle = colors.magenta;
      ctx.fillText('SINK RATE', hx - 84, 32);
    }
  }

  function loop(t){
    if(!running) return;
    const dt = last ? Math.min(3, (t - last) / 16.67) : 1;
    last = t;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function start(){
    readColors();
    readWind();
    reset();
    finished = null;
    overlay.hidden = true;
    running = true;
    last = 0;
    frame = 0;
    cockpit.say(callsign() + ', Austin Tower, ' + wind.spoken + ', runway ' + wind.runway + ', cleared to land.');
    requestAnimationFrame(loop);
  }

  // ---------------- controls ----------------
  startBtn.addEventListener('click', start);

  function key(e, down){
    if(!running) return;
    if(e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W'){ input.up = down; e.preventDefault(); }
    if(e.key === 'ArrowDown' || e.key === 's' || e.key === 'S'){ input.down = down; e.preventDefault(); }
  }
  window.addEventListener('keydown', e => key(e, true));
  window.addEventListener('keyup', e => key(e, false));

  function hold(btn, prop){
    const on = e => { e.preventDefault(); input[prop] = true; };
    const off = () => { input[prop] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }
  hold(upBtn, 'up');
  hold(downBtn, 'down');

  document.addEventListener('cockpit:theme', () => { readColors(); if(!running) draw(); });
  document.addEventListener('cockpit:weather', () => { readColors(); readWind(); if(!running){ reset(); draw(); } });
  window.addEventListener('resize', () => { fitCanvas(); if(!running) draw(); });

  fitCanvas();
  readColors();
  readWind();
  reset();
  renderBest();
  draw();
})();
