// ---------------------------------------------------------------
// Shared: split a description paragraph into individual sentences.
// Used to turn a single LinkedIn/GitHub description into separate
// bullet lines instead of one dense paragraph.
// ---------------------------------------------------------------
function splitIntoSentences(text){
  if(!text) return [];
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Keep the flight dash compact on phones while preserving the desktop links.
(function mobileDash(){
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('topnav');
  if(!toggle || !nav) return;
  const close = () => {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', event => {
    if(event.target.closest('a')) close();
  });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && nav.classList.contains('is-open')){
      close();
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if(nav.classList.contains('is-open') && !event.target.closest('.topbar-inner')) close();
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', close);
})();

// ---------------------------------------------------------------
// Compass tick marks (drawn once, cheap to generate than to hand-write)
// ---------------------------------------------------------------
(function drawCompassTicks(){
  const g = document.querySelector('.c-ticks');
  if(!g) return;
  const cx = 200, cy = 200, rOuter = 188, rInner = 176;
  for(let deg = 0; deg < 360; deg += 10){
    const rad = (deg - 90) * Math.PI / 180;
    const x1 = cx + rOuter * Math.cos(rad);
    const y1 = cy + rOuter * Math.sin(rad);
    const x2 = cx + rInner * Math.cos(rad);
    const y2 = cy + rInner * Math.sin(rad);
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', x1.toFixed(1));
    tick.setAttribute('y1', y1.toFixed(1));
    tick.setAttribute('x2', x2.toFixed(1));
    tick.setAttribute('y2', y2.toFixed(1));
    tick.setAttribute('stroke', 'currentColor');
    tick.setAttribute('stroke-width', deg % 90 === 0 ? '1.5' : '1');
    tick.setAttribute('opacity', deg % 90 === 0 ? '0.5' : '0.25');
    g.appendChild(tick);
  }
})();

// ---------------------------------------------------------------
// Request a Briefing — keyword-matched Q&A about Nikhil
// ---------------------------------------------------------------
(function briefing(){
  const form = document.getElementById('briefingForm');
  const input = document.getElementById('briefingInput');
  const output = document.getElementById('briefingOutput');
  const chips = document.querySelectorAll('.chip-btn:not(#surpriseBtn)');
  const surpriseBtn = document.getElementById('surpriseBtn');
  if(!form || !input || !output) return;

  const topics = [
    {
      keys: ['built', 'built?', 'project', 'projects', 'work on', 'made', 'portfolio'],
      title: 'BUILDS ON FILE',
      body: 'Four solo builds: StarForge, a procedural 3D space engine generating full star systems from one seed; an N-body orbital mechanics simulator with a symplectic leapfrog integrator running at 60 FPS; a 5-DOF robotic hand controlled by either hand gestures or speech-to-ASL fingerspelling; and a multimodal deep learning study that cut equity forecast error 34% by fusing market data with FinBERT sentiment. See the Builds section above for the full manifest.'
    },
    {
      keys: ['pilot', 'fly', 'flying', 'flight training', 'ppl', 'license', 'plane'],
      title: 'PILOT STATUS',
      body: 'Student pilot, working toward a Private Pilot\'s License (estimated Fall 2026). The flight-plan framing on this page isn\'t just decoration — aerospace and aviation are the actual major and the actual goal.'
    },
    {
      keys: ['study', 'studying', 'major', 'school', 'university', 'education', 'degree', 'gpa'],
      title: 'EDUCATION ON FILE',
      body: 'B.S. Aerospace Engineering and B.S. Mathematics at The University of Texas at Austin, graduating Spring 2029, with a 4.00 GPA.'
    },
    {
      keys: ['intern', 'internship', 'experience', 'job', 'work history', 'career'],
      title: 'FLIGHT HISTORY',
      body: 'Software Development Intern at the City of Austin I.T. Division, where the team built and shipped TradeRoots, a skill-exchange platform that won the 2025 Entrepreneurship Award. Also a longer stint at HearingTracker building a recommendation engine used by 30,000+ users. Full detail is in the Logbook section above.'
    },
    {
      keys: ['contact', 'reach', 'email', 'hire', 'linkedin', 'github', 'connect'],
      title: 'CONTACT INFORMATION',
      body: 'Email: adapalanikhil@gmail.com. LinkedIn: linkedin.com/in/nikhiladapala. GitHub: github.com/onedope512. All three are linked in the Destination section at the bottom of this page.'
    },
    {
      keys: ['code', 'coding', 'program', 'language', 'languages', 'stack', 'tech', 'tools'],
      title: 'INSTRUMENT PANEL',
      body: 'Python, Java, C++, JavaScript, C#, R, SQL, and HTML/CSS, plus TensorFlow/Keras, scikit-learn, MediaPipe, OpenCV, React, and Node.js on the applied side. SolidWorks and Arduino for anything that needs to be physically built. Full list in the Instrument Panel section above.'
    },
    {
      keys: ['robot', 'hand', 'servo', 'arduino', 'gesture', 'asl'],
      title: 'BUILD DETAIL — ROBOTIC HAND',
      body: 'A 5-servo robotic hand, one motor per finger, modeled in SolidWorks and 3D-printed. It runs two independent control pipelines over the same serial protocol: a webcam + MediaPipe gesture recognizer, and a speech-to-text pipeline that fingerspells recognized words in an approximation of the ASL manual alphabet.'
    },
    {
      keys: ['orbit', 'simulator', 'space', 'gravity', 'physics', 'three.js', 'n-body'],
      title: 'BUILD DETAIL — ORBITAL SIMULATOR',
      body: 'A real-time N-body gravitational simulator in vanilla JavaScript and Three.js, about 2,400 lines. Uses a symplectic leapfrog integrator so orbits stay stable indefinitely instead of drifting like a naive Euler integrator would. Models tidal disruption at the Roche limit, momentum-conserving mergers, and a GPU gravitational-well grid. It\'s linked live from the Builds section.'
    },
    {
      keys: ['ai', 'machine learning', 'ml', 'deep learning', 'finance', 'financial', 'finbert', 'stock', 'market'],
      title: 'BUILD DETAIL — FINANCIAL ML RESEARCH',
      body: 'A peer-reviewed study benchmarking six architectures for equity price forecasting. Fusing raw market data with FinBERT-derived sentiment signals cut forecast error by 34% and doubled R² to 0.68, using a custom hybrid architecture with ablations to isolate the top predictive features.'
    },
    {
      keys: ['hobby', 'hobbies', 'interest', 'interests', 'fun', 'free time'],
      title: 'OFF-DUTY',
      body: 'Piloting, basketball, running, and geography, alongside the usual programming and mathematics.'
    },
    {
      keys: ['squawk', 'transponder', '7700', '7600', 'xpdr', 'secret', 'easter egg'],
      title: 'TRANSPONDER CODES',
      body: 'The XPDR box in the corner is a working transponder. Type any four digits from 0 to 7 anywhere on the page, or tap the box for a keypad. 7700 declares an emergency, 7600 is a radio failure, and 1200 puts you back to normal VFR. IDENT makes you blink on the tower radar.'
    },
    {
      keys: ['game', 'land', 'landing', 'papi', 'play'],
      title: 'PATTERN WORK',
      body: 'Scroll down to "Your turn: land it". Fly the approach with the arrow keys or the nose buttons, keep two white and two red on the PAPI lights, and flare just before touchdown. Score 80 or better and you earn the Licensed pilot badge.'
    },
    {
      keys: ['night', 'dark', 'radio', 'atc', 'sound', 'weather', 'sky'],
      title: 'COCKPIT SYSTEMS',
      body: 'The sky at the top follows the time and current forecast conditions in Austin, with a clearly labeled METAR-style readout based on Open-Meteo. The cockpit switches turn on night flight mode and an ATC-inspired radio with ambient sound and tower chatter.'
    },
    {
      keys: ['resume', 'résumé', 'cv', 'boarding pass', 'print'],
      title: 'RÉSUMÉ',
      body: 'Open the boarding-pass résumé from the top menu or contact section. Its Download button gives you Nikhil’s original PDF résumé; you can also print the styled boarding pass.'
    }
  ];

  const fallback = {
    title: 'NO MATCH ON FILE',
    body: 'That one\'s not in the briefing database yet. Try asking about builds, flight training, education, internships, or how to get in touch — or just email adapalanikhil@gmail.com directly.'
  };

  function render(question, topic){
    output.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'briefing-report';

    const head = document.createElement('div');
    head.className = 'briefing-report-head';
    head.textContent = topic.title;
    wrap.appendChild(head);

    const body = document.createElement('div');
    body.className = 'briefing-report-body';
    body.textContent = topic.body;
    wrap.appendChild(body);

    output.appendChild(wrap);
  }

  function answer(question){
    const q = question.toLowerCase().trim();
    if(!q){ return; }
    // short keys like "ai" or "ml" must match whole words, or "email" would count as AI
    const matches = k => k.length <= 3 ? new RegExp('\\b' + k + '\\b').test(q) : q.includes(k);
    const hit = topics.find(t => t.keys.some(matches));
    render(q, hit || fallback);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    answer(input.value);
  });

  chips.forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.q;
      answer(btn.dataset.q);
    });
  });

  if(surpriseBtn){
    surpriseBtn.addEventListener('click', () => {
      const pick = topics[Math.floor(Math.random() * topics.length)];
      input.value = '';
      render('', pick);
    });
  }
})();

// ---------------------------------------------------------------
// Request a flyby — retriggers the hero plane animation on demand
// ---------------------------------------------------------------
(function flyby(){
  const btn = document.getElementById('flybyBtn');
  const plane = document.getElementById('heroPlane');
  if(!btn || !plane) return;

  btn.addEventListener('click', () => {
    plane.classList.remove('flying');
    // eslint-disable-next-line no-unused-expressions
    void plane.getBoundingClientRect(); // force reflow so the animation restarts
    plane.classList.add('flying');
  });

  plane.addEventListener('animationend', (e) => {
    if(e.animationName === 'plane-fly-now') plane.classList.remove('flying');
  });
})();

// ---------------------------------------------------------------
// Terminal — live departures board pulled from the GitHub API,
// seeded with a static snapshot so the board is never empty.
// ---------------------------------------------------------------
(function terminal(){
  const rowsEl = document.getElementById('boardRows');
  if(!rowsEl) return;

  // Snapshot taken from github.com/onedope512 — shown instantly, then
  // replaced by a live fetch if the API responds.
  const seed = [
    { name: 'Star-Forge', description: 'Procedurally generated 3D space exploration engine in Godot 4 — real N-body gravity, life-sized planets, streaming terrain.', language: 'GDScript', html_url: 'https://github.com/onedope512/Star-Forge', updated_at: '2026-08-25' },
    { name: 'Arduino-Hand-Project', description: null, language: 'Python', html_url: 'https://github.com/onedope512/Arduino-Hand-Project', updated_at: '2026-07-25' },
    { name: 'Orbital-Mechanics-Sim', description: null, language: 'JavaScript', html_url: 'https://github.com/onedope512/Orbital-Mechanics-Sim', updated_at: '2026-07-22' },
    { name: 'chess', description: 'A multiplayer chess platform', language: null, html_url: 'https://github.com/onedope512/chess', updated_at: '2025-10-09' },
    { name: 'traderoots', description: null, language: null, html_url: 'https://github.com/onedope512/traderoots', updated_at: '2025-07-31' },
    { name: 'stockPredictionModel', description: null, language: 'Jupyter Notebook', html_url: 'https://github.com/onedope512/stockPredictionModel', updated_at: '2024-11-28' },
    { name: 'imageClassification', description: 'AI image classification', language: 'Python', html_url: 'https://github.com/onedope512/imageClassification', updated_at: '2024-11-28' },
    { name: 'kids4kode', description: 'Kids4kode website', language: 'CSS', html_url: 'https://github.com/onedope512/kids4kode', updated_at: '2024-11-28' }
  ];

  function flightNumber(name){
    let h = 0;
    for(let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return 'NA-' + (100 + (h % 900));
  }

  function statusFor(updatedAt){
    const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
    if(days < 60) return { label: 'ON TIME', cls: 'status-active' };
    if(days < 240) return { label: 'CRUISING', cls: 'status-cruise' };
    return { label: 'ARCHIVED', cls: 'status-archived' };
  }

  function formatDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function render(repos){
    rowsEl.innerHTML = '';
    repos
      .filter(r => !r.fork)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 10)
      .forEach((repo, i) => {
        const status = statusFor(repo.updated_at);
        const row = document.createElement('a');
        row.className = 'board-row';
        row.href = repo.html_url;
        row.target = '_blank';
        row.rel = 'noopener';
        row.style.animationDelay = (i * 0.05) + 's';
        const sentences = splitIntoSentences(repo.description);
        const descHTML = sentences
          .map(s => '<span class="board-desc-line">' + s + '</span>')
          .join('');
        row.innerHTML =
          '<span class="board-flight">' + flightNumber(repo.name) + '</span>' +
          '<span class="board-name">' + repo.name +
            (descHTML ? '<span class="board-desc">' + descHTML + '</span>' : '') +
          '</span>' +
          '<span class="board-stack">' + (repo.language || '—') + '</span>' +
          '<span class="board-updated">' + formatDate(repo.updated_at) + '</span>' +
          '<span class="board-status ' + status.cls + '">' + status.label + '</span>';
        rowsEl.appendChild(row);
      });
  }

  render(seed);

  fetch('https://api.github.com/users/onedope512/repos?sort=updated&per_page=30')
    .then(res => res.ok ? res.json() : Promise.reject(res.status))
    .then(data => { if(Array.isArray(data) && data.length) render(data); })
    .catch(() => { /* seed data already on the board */ });
})();

// ---------------------------------------------------------------
// Project / internship detail modals — one bespoke interactive
// widget per project, lazy-initialized the first time it's opened.
// ---------------------------------------------------------------
(function modals(){
  const overlay = document.getElementById('modalOverlay');
  if(!overlay) return;
  const panels = overlay.querySelectorAll('.modal-panel');
  const triggers = document.querySelectorAll('[data-modal]');
  const hooks = {};
  let activeId = null;
  let lastFocused = null;
  let pushedEntry = false;

  const widgetInit = {
    starforge: initStarforge,
    orbital: initOrbital,
    hand: initHand,
    finml: initFinml,
    traderoots: initTraderoots,
    hearingtracker: initHearing
  };

  // every popup gets its own shareable address, e.g. #builds/robotic-hand
  const ROUTES = {
    starforge: 'builds/starforge',
    orbital: 'builds/orbital-simulator',
    hand: 'builds/robotic-hand',
    finml: 'builds/market-prediction',
    traderoots: 'log/traderoots',
    hearingtracker: 'log/hearingtracker'
  };
  const idForHash = hash => Object.keys(ROUTES).find(id => '#' + ROUTES[id] === hash);

  function showPanel(id){
    const panel = overlay.querySelector('.modal-panel[data-panel="' + id + '"]');
    if(!panel) return;
    if(activeId && activeId !== id) hidePanel();
    if(!overlay.classList.contains('is-open')) lastFocused = document.activeElement;
    panels.forEach(p => p.classList.remove('is-active'));
    panel.classList.add('is-active');
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if(!(id in hooks) && widgetInit[id]) hooks[id] = widgetInit[id](panel) || {};
    if(hooks[id] && hooks[id].onOpen) hooks[id].onOpen();
    activeId = id;
    const closeBtn = panel.querySelector('.modal-close');
    if(closeBtn) closeBtn.focus();
  }

  function hidePanel(){
    if(activeId && hooks[activeId] && hooks[activeId].onClose) hooks[activeId].onClose();
    activeId = null;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    panels.forEach(p => p.classList.remove('is-active'));
    if(lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function openModal(id){
    showPanel(id);
    if(location.hash !== '#' + ROUTES[id]){
      history.pushState(null, '', '#' + ROUTES[id]);
      pushedEntry = true;
    }
  }

  function closeModal(){
    if(!overlay.classList.contains('is-open')) return;
    if(pushedEntry){
      pushedEntry = false;
      history.back();
      return;
    }
    history.replaceState(null, '', location.pathname + location.search);
    hidePanel();
  }

  window.addEventListener('popstate', () => {
    const id = idForHash(location.hash);
    if(id) showPanel(id);
    else if(overlay.classList.contains('is-open')){
      pushedEntry = false;
      hidePanel();
    }
  });

  panels.forEach(panel => {
    const id = panel.dataset.panel;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'modal-share';
    btn.textContent = 'Copy link';
    btn.addEventListener('click', () => {
      const url = location.origin + location.pathname + '#' + ROUTES[id];
      const done = ok => {
        btn.textContent = ok ? 'Link copied' : 'Copy failed';
        setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
      };
      if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try{ ok = document.execCommand('copy'); }catch(e){}
        ta.remove();
        done(ok);
      }
    });
    panel.querySelector('.modal-head').appendChild(btn);
  });

  triggers.forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.modal));
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openModal(el.dataset.modal);
      }
    });
  });

  overlay.addEventListener('click', (e) => {
    if(e.target === overlay) closeModal();
  });
  overlay.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal();
  });

  const initialId = idForHash(location.hash);
  if(initialId) showPanel(initialId);

  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---- StarForge: seeded procedural system generator ----
  function initStarforge(panel){
    const canvas = panel.querySelector('#starforgeCanvas');
    const ctx = canvas.getContext('2d');
    const readout = panel.querySelector('#starforgeReadout');
    const seedInput = panel.querySelector('#starforgeSeed');
    const rerollBtn = panel.querySelector('#starforgeReroll');

    const starClasses = [
      { name: 'Red Dwarf', color: '#ff6b5e' },
      { name: 'Yellow Main-Sequence', color: '#ffd75e' },
      { name: 'Blue Giant', color: '#7ec8ff' },
      { name: 'White Dwarf', color: '#eaf2ff' },
      { name: 'Binary Pair', color: '#ffb0e6' }
    ];
    const planetColors = ['#8ec9a3','#d9a45c','#8892c9','#c96b5a','#5cc9c2','#c9c25c','#a35c8e'];

    function generate(seed){
      const rand = mulberry32(seed >>> 0);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const starClass = starClasses[Math.floor(rand() * starClasses.length)];
      const planetCount = 3 + Math.floor(rand() * 7);
      const cx = w / 2, cy = h / 2;

      const starR = 14 + rand() * 8;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, starR * 4);
      grad.addColorStop(0, starClass.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.beginPath();
      ctx.fillStyle = starClass.color;
      ctx.arc(cx, cy, starR, 0, Math.PI * 2);
      ctx.fill();

      let rocky = 0, gas = 0;
      const maxR = Math.min(w, h) / 2 - 14;
      for(let i = 0; i < planetCount; i++){
        const orbitR = 22 + (i + 1) * (maxR - 22) / planetCount;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.stroke();

        const angle = rand() * Math.PI * 2;
        const px = cx + Math.cos(angle) * orbitR;
        const py = cy + Math.sin(angle) * orbitR * 0.4;
        const isGas = rand() > 0.55;
        if(isGas) gas++; else rocky++;
        const pr = isGas ? 6 + rand() * 5 : 3 + rand() * 3;
        ctx.beginPath();
        ctx.fillStyle = planetColors[Math.floor(rand() * planetColors.length)];
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      readout.textContent = 'Seed ' + seed + ' → ' + starClass.name + ' · ' +
        planetCount + ' worlds · ' + gas + ' gas giant' + (gas === 1 ? '' : 's') +
        ', ' + rocky + ' rocky';
    }

    generate(parseInt(seedInput.value, 10) || 0);
    seedInput.addEventListener('input', () => generate(parseInt(seedInput.value, 10) || 0));
    rerollBtn.addEventListener('click', () => {
      const s = Math.floor(Math.random() * 999999);
      seedInput.value = s;
      generate(s);
    });
  }

  // ---- Orbital simulator: live two-body gravity playground ----
  function initOrbital(panel){
    const canvas = panel.querySelector('#orbitalCanvas');
    const ctx = canvas.getContext('2d');
    const gSlider = panel.querySelector('#orbitalG');
    const resetBtn = panel.querySelector('#orbitalReset');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    let state, trail;
    let running = false;

    function reset(){
      state = { x: cx + 130, y: cy, vx: 0, vy: -2.1 };
      trail = [];
    }
    reset();

    function step(){
      if(!running) return;
      const G = parseFloat(gSlider.value);
      const dx = cx - state.x, dy = cy - state.y;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq) || 1;
      const force = G * 400 / distSq;
      state.vx += (force * dx / dist) * 0.05;
      state.vy += (force * dy / dist) * 0.05;
      state.x += state.vx;
      state.y += state.vy;

      trail.push({ x: state.x, y: state.y });
      if(trail.length > 90) trail.shift();

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(94, 234, 212, 0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      trail.forEach((p, i) => { if(i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.strokeStyle = 'rgba(153, 246, 228, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = '#e0fdf9';
      ctx.arc(state.x, state.y, 5, 0, Math.PI * 2);
      ctx.fill();

      if(dist > Math.max(w, h)) reset();
      requestAnimationFrame(step);
    }

    resetBtn.addEventListener('click', reset);
    return {
      onOpen(){ if(!running){ running = true; step(); } },
      onClose(){ running = false; }
    };
  }

  // ---- Robotic hand: five sliders driving an SVG hand, plus ASL fingerspelling ----
  function initHand(panel){
    const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const sliders = panel.querySelectorAll('[data-finger]');
    const resetBtn = panel.querySelector('#handReset');
    const waveBtn = panel.querySelector('#handWave');
    const aslForm = panel.querySelector('#aslForm');
    const aslInput = panel.querySelector('#aslInput');
    const aslWord = panel.querySelector('#aslWord');
    const aslNote = panel.querySelector('#aslNote');
    const defaultNote = aslNote.textContent;
    let timers = [];

    // Same table as ASL_ANGLES in hand_servo_control.ino:
    // {thumb, index, middle, ring, pinky}, 0 = curled, 180 = extended.
    const ASL = {
      A: [90, 0, 0, 0, 0],       B: [0, 180, 180, 180, 180], C: [90, 90, 90, 90, 90],
      D: [0, 180, 0, 0, 0],      E: [0, 0, 0, 0, 0],         F: [90, 90, 180, 180, 180],
      G: [90, 180, 0, 0, 0],     H: [0, 180, 180, 0, 0],     I: [0, 0, 0, 0, 180],
      J: [0, 0, 0, 0, 180],      K: [90, 180, 180, 0, 0],    L: [180, 180, 0, 0, 0],
      M: [0, 0, 0, 0, 0],        N: [0, 0, 0, 0, 0],         O: [90, 90, 90, 90, 90],
      P: [90, 180, 180, 0, 0],   Q: [90, 180, 0, 0, 0],      R: [0, 180, 180, 0, 0],
      S: [0, 0, 0, 0, 0],        T: [90, 0, 0, 0, 0],        U: [0, 180, 180, 0, 0],
      V: [0, 180, 180, 0, 0],    W: [0, 180, 180, 180, 0],   X: [0, 90, 0, 0, 0],
      Y: [180, 0, 0, 0, 180],    Z: [0, 180, 0, 0, 0]
    };

    function apply(finger, value){
      const el = panel.querySelector('#finger-' + finger);
      if(!el) return;
      if(finger === 'thumb'){
        // extended swings out from the palm, curled tucks across it
        el.style.transform = 'rotate(' + (40 - value / 180 * 75) + 'deg)';
      } else {
        el.style.transform = 'scaleY(' + (0.32 + 0.68 * value / 180) + ')';
      }
    }

    function setPose(values){
      FINGERS.forEach((f, i) => {
        const s = panel.querySelector('[data-finger="' + f + '"]');
        s.value = values[i];
        apply(f, values[i]);
      });
    }

    function stopSpelling(){
      timers.forEach(clearTimeout);
      timers = [];
    }

    sliders.forEach(s => {
      apply(s.dataset.finger, parseInt(s.value, 10));
      s.addEventListener('input', () => {
        stopSpelling();
        apply(s.dataset.finger, parseInt(s.value, 10));
      });
    });

    resetBtn.addEventListener('click', () => {
      stopSpelling();
      setPose([90, 90, 90, 90, 90]);
    });

    waveBtn.addEventListener('click', () => {
      stopSpelling();
      [40, 140, 40, 140, 90].forEach((v, i) => {
        timers.push(setTimeout(() => setPose([v, v, v, v, v]), i * 260));
      });
    });

    function spell(text){
      stopSpelling();
      const letters = text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 16).split('');
      aslWord.innerHTML = '';
      if(!letters.length){
        aslNote.textContent = 'Type a name using the letters A to Z.';
        return;
      }
      const spans = letters.map(ch => {
        const span = document.createElement('span');
        span.className = 'asl-letter';
        span.textContent = ch;
        aslWord.appendChild(span);
        return span;
      });
      const hasMotion = letters.some(ch => ch === 'J' || ch === 'Z');
      aslNote.textContent = hasMotion
        ? 'J and Z trace a motion in real ASL, so this hand holds the closest static shape (I and D), just like the Arduino does.'
        : defaultNote;

      const HOLD = 900;
      letters.forEach((ch, i) => {
        timers.push(setTimeout(() => {
          spans.forEach((s, j) => s.classList.toggle('is-active', j === i));
          setPose(ASL[ch]);
        }, i * HOLD));
      });
      timers.push(setTimeout(() => {
        spans.forEach(s => s.classList.remove('is-active'));
        setPose([90, 90, 90, 90, 90]);
      }, letters.length * HOLD + 200));
    }

    aslForm.addEventListener('submit', (e) => {
      e.preventDefault();
      spell(aslInput.value);
    });

    function prefill(){
      const name = window.cockpit && window.cockpit.passenger;
      if(name && !aslInput.value) aslInput.value = name;
    }
    document.addEventListener('cockpit:passenger', (e) => {
      if(e.detail) aslInput.value = e.detail;
    });

    return {
      onOpen: prefill,
      onClose: () => {
        stopSpelling();
        setPose([90, 90, 90, 90, 90]);
        aslWord.querySelectorAll('.asl-letter').forEach(s => s.classList.remove('is-active'));
      }
    };
  }

  // ---- Financial ML: market-only vs +FinBERT toggle ----
  function initFinml(panel){
    const toggle = panel.querySelector('#finmlToggle');
    const errorBar = panel.querySelector('#finmlErrorBar');
    const errorValue = panel.querySelector('#finmlErrorValue');
    const r2Bar = panel.querySelector('#finmlR2Bar');
    const r2Value = panel.querySelector('#finmlR2Value');
    const archBars = panel.querySelectorAll('.finml-arch-bar');

    function update(on){
      errorBar.style.width = on ? '66%' : '100%';
      errorValue.textContent = on ? '34% lower error' : 'baseline';
      r2Bar.style.width = on ? '68%' : '34%';
      r2Value.textContent = on ? '0.68' : '0.34';
      archBars.forEach(b => { b.style.height = (on ? b.dataset.hOn : b.dataset.hOff) + '%'; });
    }
    update(false);
    toggle.addEventListener('change', () => update(toggle.checked));
  }

  // ---- TradeRoots: messaging / reviews / team tabs ----
  function initTraderoots(panel){
    const tabs = panel.querySelectorAll('.tr-tab');
    const tabPanels = panel.querySelectorAll('[data-tab-panel]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        tabPanels.forEach(p => p.classList.toggle('is-active', p.dataset.tabPanel === tab.dataset.tab));
      });
    });

    const chatForm = panel.querySelector('#trChatForm');
    const chatInput = panel.querySelector('#trChatInput');
    const chat = panel.querySelector('#trChat');
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if(!text) return;
      const bubble = document.createElement('div');
      bubble.className = 'tr-bubble tr-bubble-me';
      bubble.textContent = text;
      chat.appendChild(bubble);
      chat.scrollTop = chat.scrollHeight;
      chatInput.value = '';
    });

    const stars = panel.querySelectorAll('.tr-star');
    const reviewLabel = panel.querySelector('#trReviewLabel');
    const labels = { 1: 'Wouldn’t trade again', 2: 'It was okay', 3: 'Good trade', 4: 'Great trade!', 5: 'Excellent trade!' };
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const n = parseInt(star.dataset.star, 10);
        stars.forEach(s => s.classList.toggle('is-filled', parseInt(s.dataset.star, 10) <= n));
        reviewLabel.textContent = labels[n];
      });
    });

    const avatars = panel.querySelectorAll('.tr-avatar');
    const teamLabel = panel.querySelector('#trTeamLabel');
    avatars.forEach(av => {
      av.addEventListener('click', () => {
        avatars.forEach(a => a.classList.remove('is-active'));
        av.classList.add('is-active');
        teamLabel.textContent = av.textContent + ' — ' + av.dataset.role;
      });
    });
  }

  // ---- HearingTracker: brand + feature filter demo ----
  function initHearing(panel){
    const models = [
      { name: 'Phonak Audéo Lumity', brand: 'Phonak', feats: ['Bluetooth', 'Rechargeable'] },
      { name: 'Phonak Naída Lumity', brand: 'Phonak', feats: ['Bluetooth', 'Water Resistant'] },
      { name: 'Oticon Real', brand: 'Oticon', feats: ['Bluetooth', 'Rechargeable', 'Tinnitus Masking'] },
      { name: 'Oticon Zircon', brand: 'Oticon', feats: ['Tinnitus Masking'] },
      { name: 'Widex Moment Sheer', brand: 'Widex', feats: ['Bluetooth', 'Rechargeable'] },
      { name: 'Widex Enevo', brand: 'Widex', feats: ['Water Resistant'] },
      { name: 'Starkey Genesis AI', brand: 'Starkey', feats: ['Bluetooth', 'Rechargeable', 'Water Resistant'] },
      { name: 'Starkey Evolv AI', brand: 'Starkey', feats: ['Tinnitus Masking', 'Rechargeable'] }
    ];

    const brandSel = panel.querySelector('#htBrand');
    const checks = panel.querySelectorAll('#htChecks input');
    const list = panel.querySelector('#htList');
    const count = panel.querySelector('#htCount');

    function render(){
      const brand = brandSel.value;
      const activeFeats = Array.from(checks).filter(c => c.checked).map(c => c.dataset.feat);
      const matches = models.filter(m =>
        (brand === 'all' || m.brand === brand) &&
        activeFeats.every(f => m.feats.includes(f))
      );
      count.textContent = 'Showing ' + matches.length + ' of 500+ models';
      list.innerHTML = '';
      if(matches.length === 0){
        list.innerHTML = '<p class="ht-empty">No exact matches — the real engine would widen the filter here.</p>';
        return;
      }
      matches.forEach(m => {
        const row = document.createElement('div');
        row.className = 'ht-item';
        row.innerHTML = '<span class="ht-item-name">' + m.name + '</span><span class="ht-item-tags">' +
          m.feats.join(' · ') + '</span>';
        list.appendChild(row);
      });
    }

    brandSel.addEventListener('change', render);
    checks.forEach(c => c.addEventListener('change', render));
    render();
  }
})();

// ---------------------------------------------------------------
// Paper-airplane contact form — folds the message, flies it off,
// and hands it to the visitor's email app via mailto.
// ---------------------------------------------------------------
(function paperPlane(){
  const form = document.getElementById('paperForm');
  if(!form) return;
  const nameInput = document.getElementById('paperName');
  const msgInput = document.getElementById('paperMsg');
  const status = document.getElementById('paperStatus');
  const plane = document.getElementById('paperPlane');
  const EMAIL = 'adapalanikhil@gmail.com';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function prefill(){
    const name = window.cockpit && window.cockpit.passenger;
    if(name && !nameInput.value) nameInput.value = name;
  }
  prefill();
  document.addEventListener('cockpit:passenger', (e) => { if(e.detail && !nameInput.value) nameInput.value = e.detail; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = msgInput.value.trim();
    if(!message){
      status.textContent = 'Write a message first, then fold it up.';
      msgInput.focus();
      return;
    }
    const name = nameInput.value.trim();
    const subject = 'Message from your flight plan' + (name ? ' — ' + name : '');
    const body = message + (name ? '\n\n— ' + name : '');
    const href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

    status.textContent = '';
    form.classList.add('is-folding');
    if(!reduced) plane.classList.add('is-flying');
    window.location.href = href;

    setTimeout(() => {
      form.classList.remove('is-folding');
      plane.classList.remove('is-flying');
      msgInput.value = '';
      status.textContent = 'Folded and handed to your email app. If nothing opened, write to ' + EMAIL + ' directly.';
    }, reduced ? 200 : 1600);
  });
})();
