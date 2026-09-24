// ---------------------------------------------------------------
// Cockpit: shared state (passenger, weather, radio) plus the
// site-wide systems — live Austin sky, night flight mode, ATC radio,
// transponder squawk codes, scroll route, and passenger check-in.
// ---------------------------------------------------------------
(function(){
  const root = document.documentElement;

  const store = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
    remove(k){ try{ localStorage.removeItem(k); }catch(e){} }
  };

  const NATO = {
    A:'Alfa', B:'Bravo', C:'Charlie', D:'Delta', E:'Echo', F:'Foxtrot', G:'Golf', H:'Hotel',
    I:'India', J:'Juliett', K:'Kilo', L:'Lima', M:'Mike', N:'November', O:'Oscar', P:'Papa',
    Q:'Quebec', R:'Romeo', S:'Sierra', T:'Tango', U:'Uniform', V:'Victor', W:'Whiskey',
    X:'X-ray', Y:'Yankee', Z:'Zulu',
    '0':'Zero', '1':'One', '2':'Two', '3':'Three', '4':'Four', '5':'Five', '6':'Six',
    '7':'Seven', '8':'Eight', '9':'Niner'
  };
  function phonetic(text){
    return String(text).toUpperCase().split('').map(c => NATO[c]).filter(Boolean);
  }
  function spokenDigits(value){
    return String(value).split('').map(d => NATO[d].toLowerCase()).join(' ');
  }

  const cockpit = window.cockpit = {
    store,
    phonetic,
    spokenDigits,
    passenger: store.get('passengerName') || '',
    weather: null,
    say(){}
  };

  // ---------------- night flight mode ----------------
  const nightBtn = document.getElementById('nightToggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const effectiveNight = () => root.classList.contains('night') ||
    (root.dataset.sky === 'night' && !root.classList.contains('force-day'));
  function syncNight(){
    const on = effectiveNight();
    if(nightBtn){
      nightBtn.setAttribute('aria-pressed', String(on));
      nightBtn.title = on ? 'Switch to daytime view for this visit' : 'Switch to night flight mode';
    }
    if(themeMeta) themeMeta.setAttribute('content', on ? '#0b1330' : '#6FA8C9');
  }
  function setNight(on){
    root.classList.toggle('night', on);
    root.classList.toggle('force-day', !on);
    try{ sessionStorage.setItem('themeOverride', on ? 'night' : 'day'); }catch(e){}
    store.remove('night');
    syncNight();
    document.dispatchEvent(new CustomEvent('cockpit:theme'));
  }
  syncNight();
  if(nightBtn) nightBtn.addEventListener('click', () => setNight(!effectiveNight()));

  // ---------------- live Austin sky + METAR ----------------
  const KAUS = { lat: 30.1945, lon: -97.6699 };
  const metarLine = document.getElementById('metarLine');
  const metarPlain = document.getElementById('metarPlain');
  let sun = { rise: 7 * 60 + 15, set: 19 * 60 + 30 };

  function austinMinutes(){
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = type => Number(parts.find(p => p.type === type).value);
    return get('hour') * 60 + get('minute');
  }
  function austinTimeLabel(){
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date());
  }
  function minutesOf(iso){
    const [h, m] = iso.split('T')[1].split(':').map(Number);
    return h * 60 + m;
  }
  function skyPhase(){
    const now = austinMinutes();
    if(now < sun.rise - 40 || now > sun.set + 40) return 'night';
    if(now < sun.rise + 60) return 'dawn';
    if(now > sun.set - 60) return 'dusk';
    return 'day';
  }
  function coverClass(pct){
    if(pct < 10) return 'clear';
    if(pct < 35) return 'few';
    if(pct < 75) return 'scattered';
    return 'overcast';
  }

  const WX = {
    45: ['FG', 'fog'], 48: ['FG', 'freezing fog'],
    51: ['-DZ', 'light drizzle'], 53: ['DZ', 'drizzle'], 55: ['+DZ', 'heavy drizzle'],
    61: ['-RA', 'light rain'], 63: ['RA', 'rain'], 65: ['+RA', 'heavy rain'],
    66: ['-FZRA', 'freezing rain'], 67: ['FZRA', 'freezing rain'],
    71: ['-SN', 'light snow'], 73: ['SN', 'snow'], 75: ['+SN', 'heavy snow'], 77: ['SG', 'snow grains'],
    80: ['-SHRA', 'light showers'], 81: ['SHRA', 'showers'], 82: ['+SHRA', 'heavy showers'],
    85: ['-SHSN', 'snow showers'], 86: ['SHSN', 'snow showers'],
    95: ['TSRA', 'thunderstorms'], 96: ['+TSRA', 'thunderstorms with hail'], 99: ['+TSRA', 'thunderstorms with hail']
  };
  function precipFor(code){
    if(code >= 95) return 'storm';
    if((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if(code === 45 || code === 48) return 'fog';
    return '';
  }

  const pad = (n, w) => String(Math.round(Math.abs(n))).padStart(w, '0');
  const DIRS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast',
    'southeast', 'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest',
    'west', 'west-northwest', 'northwest', 'north-northwest'];

  function buildMetar(c){
    const d = new Date();
    const time = pad(d.getUTCDate(), 2) + pad(d.getUTCHours(), 2) + pad(d.getUTCMinutes(), 2) + 'Z';
    const kt = Math.round(c.wind_speed_10m);
    const gust = Math.round(c.wind_gusts_10m || 0);
    const dir = (Math.round(c.wind_direction_10m / 10) * 10) % 360 || 360;
    const wind = kt < 3 ? '00000KT' : pad(dir, 3) + pad(kt, 2) + (gust >= kt + 10 ? 'G' + pad(gust, 2) : '') + 'KT';

    const miles = c.visibility != null ? c.visibility / 1609.34 : 10;
    const vis = miles >= 10 ? '10SM' : miles >= 1 ? Math.floor(miles) + 'SM' : '1/2SM';

    const wx = WX[c.weather_code] ? ' ' + WX[c.weather_code][0] : '';

    const layers = [];
    [[c.cloud_cover_low, '030'], [c.cloud_cover_mid, '100'], [c.cloud_cover_high, '250']].forEach(([pct, h]) => {
      if(pct == null || pct < 10) return;
      layers.push((pct < 30 ? 'FEW' : pct < 55 ? 'SCT' : pct < 88 ? 'BKN' : 'OVC') + h);
    });
    const clouds = layers.length ? layers.join(' ') : 'CLR';

    const tc = t => (t < 0 ? 'M' : '') + pad(t, 2);
    const altimeter = 'A' + pad(c.pressure_msl * 0.02953 * 100, 4);

    return 'SIM KAUS ' + time + ' ' + wind + ' ' + vis + wx + ' ' + clouds + ' ' +
      tc(c.temperature_2m) + '/' + tc(c.dew_point_2m) + ' ' + altimeter;
  }

  function plainWeather(c){
    const f = Math.round(c.temperature_2m * 9 / 5 + 32);
    const kt = Math.round(c.wind_speed_10m);
    const wind = kt < 3 ? 'calm wind' : 'wind from the ' + DIRS[Math.round(c.wind_direction_10m / 22.5) % 16] + ' at ' + kt + ' kt';
    const coverWords = { clear: 'clear skies', few: 'a few clouds', scattered: 'scattered clouds', overcast: 'overcast' };
    const sky = WX[c.weather_code] ? WX[c.weather_code][1] : coverWords[coverClass(c.cloud_cover)];
    return 'Austin, ' + austinTimeLabel() + ': ' + f + '°F, ' + wind + ', ' + sky + '.';
  }

  function applySky(cover, precip){
    const previous = root.dataset.sky;
    root.dataset.sky = skyPhase();
    if(cover) root.dataset.clouds = cover;
    if(precip !== undefined) root.dataset.precip = precip;
    if(previous !== root.dataset.sky){
      syncNight();
      document.dispatchEvent(new CustomEvent('cockpit:theme'));
    }
  }

  function setWeather(c){
    const kt = Math.round(c.wind_speed_10m);
    const dir = (Math.round(c.wind_direction_10m / 10) * 10) % 360 || 360;
    const south = dir >= 90 && dir < 270;
    cockpit.weather = {
      windDir: dir,
      windKt: kt,
      spokenWind: kt < 3 ? 'wind calm' : 'wind ' + spokenDigits(pad(dir, 3)) + ' at ' + spokenDigits(kt),
      runway: south ? { heading: 180, short: '18 left', spoken: 'one eight left' }
                    : { heading: 360, short: '36 right', spoken: 'three six right' }
    };
    document.dispatchEvent(new CustomEvent('cockpit:weather', { detail: cockpit.weather }));
  }

  function refreshWeather(){
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + KAUS.lat + '&longitude=' + KAUS.lon +
      '&current=temperature_2m,dew_point_2m,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,' +
      'pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility' +
      '&daily=sunrise,sunset&timezone=America%2FChicago&wind_speed_unit=kn&forecast_days=1';
    fetch(url)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        const c = data.current;
        if(data.daily && data.daily.sunrise){
          sun = { rise: minutesOf(data.daily.sunrise[0]), set: minutesOf(data.daily.sunset[0]) };
        }
        applySky(coverClass(c.cloud_cover), precipFor(c.weather_code));
        if(metarLine) metarLine.textContent = buildMetar(c);
        if(metarPlain) metarPlain.textContent = plainWeather(c);
        setWeather(c);
      })
      .catch(() => {
        applySky('scattered', '');
        if(metarLine) metarLine.textContent = 'Live KAUS weather is unavailable right now.';
        if(metarPlain) metarPlain.textContent = 'Austin, ' + austinTimeLabel() + '.';
      });
  }

  applySky('scattered', '');
  refreshWeather();
  setInterval(refreshWeather, 10 * 60 * 1000);
  setInterval(() => applySky(), 60 * 1000);

  // ---------------- ATC radio ----------------
  const radioBtn = document.getElementById('radioToggle');
  const radio = { on: false, ctx: null, master: null, white: null, chatterTimer: null, nordo: false };
  const hasSpeech = 'speechSynthesis' in window;

  function noiseBuffer(ctx, seconds, brown){
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for(let i = 0; i < data.length; i++){
      const white = Math.random() * 2 - 1;
      if(brown){
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buf;
  }

  function startHum(){
    const ctx = radio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 2, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 1.5);
    src.connect(lp).connect(g).connect(radio.master);
    src.start();

    const osc = ctx.createOscillator();
    osc.frequency.value = 92;
    const og = ctx.createGain();
    og.gain.value = 0.018;
    osc.connect(og).connect(radio.master);
    osc.start();
  }

  function squelch(duration){
    if(!radio.ctx) return;
    const ctx = radio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = radio.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bp).connect(g).connect(radio.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function pickVoice(){
    const voices = speechSynthesis.getVoices();
    return voices.find(v => /en-US/i.test(v.lang) && /david|guy|mark|male/i.test(v.name)) ||
           voices.find(v => /^en/i.test(v.lang)) || null;
  }

  function say(text){
    if(!radio.on || radio.nordo || !hasSpeech) return;
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if(voice) u.voice = voice;
    u.rate = 1.1;
    u.pitch = 0.85;
    u.volume = 0.9;
    u.onstart = () => squelch(0.08);
    u.onend = () => squelch(0.22);
    speechSynthesis.speak(u);
  }
  cockpit.say = say;

  const CALLSIGNS = ['Cessna Four Five Two Alpha Charlie', 'Southwest Twenty-Three Eighteen',
    'Skyhawk Seven Niner Kilo', 'Cherokee Eight Six Two Delta', 'Citation Three Three Mike Papa'];

  function chatterLine(){
    const cs = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
    const w = cockpit.weather;
    const wind = w ? w.spokenWind : 'wind one eight zero at one zero';
    const rw = w ? w.runway.spoken : 'one eight left';
    const lines = [
      cs + ', Austin Tower, ' + wind + ', runway ' + rw + ', cleared for takeoff.',
      'Austin Tower, ' + cs + ', ten miles south, inbound for landing with the numbers.',
      cs + ', Austin Tower, make straight in runway ' + rw + ', report two mile final.',
      cs + ", traffic two o'clock, four miles, eastbound, altitude indicates three thousand five hundred.",
      cs + ', contact Austin Departure. Good day.',
      cs + ', runway ' + rw + ', cleared to land, ' + wind + '.'
    ];
    if(cockpit.passenger){
      lines.push(phonetic(cockpit.passenger).slice(0, 3).join(' ') + ', Austin Tower, radar contact. Welcome aboard.');
    }
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function scheduleChatter(){
    clearTimeout(radio.chatterTimer);
    radio.chatterTimer = setTimeout(() => {
      if(radio.on && !document.hidden && hasSpeech && !speechSynthesis.speaking) say(chatterLine());
      scheduleChatter();
    }, 9000 + Math.random() * 9000);
  }

  function radioOn(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC){
      radio.ctx = new AC();
      radio.master = radio.ctx.createGain();
      radio.master.gain.value = 0.9;
      radio.master.connect(radio.ctx.destination);
      radio.white = noiseBuffer(radio.ctx, 1, false);
      startHum();
    }
    radio.on = true;
    radioBtn.setAttribute('aria-pressed', 'true');
    say('Austin Tower. You are loud and clear.');
    scheduleChatter();
  }

  function radioOff(){
    radio.on = false;
    clearTimeout(radio.chatterTimer);
    if(hasSpeech) speechSynthesis.cancel();
    if(radio.ctx){ radio.ctx.close(); radio.ctx = null; }
    radioBtn.setAttribute('aria-pressed', 'false');
  }

  if(radioBtn) radioBtn.addEventListener('click', () => radio.on ? radioOff() : radioOn());

  document.addEventListener('visibilitychange', () => {
    if(!radio.ctx) return;
    if(document.hidden){
      radio.ctx.suspend();
      if(hasSpeech) speechSynthesis.cancel();
    } else {
      radio.ctx.resume();
    }
  });

  // ---------------- transponder / squawk codes ----------------
  const xpdrBtn = document.getElementById('xpdrBtn');
  const xpdrPad = document.getElementById('xpdrPad');
  const xpdrCode = document.getElementById('xpdrCode');
  const banner = document.getElementById('squawkBanner');
  const bannerText = document.getElementById('squawkText');
  const bannerActions = document.getElementById('squawkActions');
  let squawk = '1200';
  let entry = '';
  let entryTimer = null;

  function renderCode(){
    if(!xpdrCode) return;
    xpdrCode.textContent = entry ? (entry + '____').slice(0, 4) : squawk;
    xpdrCode.classList.toggle('is-entering', !!entry);
  }

  function addAction(label, fn){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'squawk-btn';
    b.textContent = label;
    b.addEventListener('click', fn);
    bannerActions.appendChild(b);
  }

  function showBanner(kind){
    bannerActions.innerHTML = '';
    if(kind === 'emergency'){
      bannerText.textContent = 'Squawking 7700: emergency declared. The tower has you in sight and has cleared a straight path to the nearest contact.';
      addAction('Divert to contact', () => document.getElementById('destination').scrollIntoView({ behavior: 'smooth' }));
      addAction('Cancel emergency', () => setSquawk('1200'));
    } else {
      bannerText.textContent = 'Squawking 7600: radio failure. The tower has switched to light-gun signals. Steady green means cleared to land.';
      addAction('Radio fixed', () => setSquawk('1200'));
    }
    banner.dataset.kind = kind;
    banner.hidden = false;
  }

  function hideBanner(){
    banner.hidden = true;
    delete banner.dataset.kind;
  }

  function setSquawk(code){
    const previous = squawk;
    squawk = code;
    renderCode();
    root.classList.remove('squawk-7700', 'squawk-7600');
    radio.nordo = false;

    if(code === '7700'){
      root.classList.add('squawk-7700');
      showBanner('emergency');
      say('Mayday acknowledged. Squawk seven seven zero zero observed. Austin Tower has you in sight, all runways available.');
    } else if(code === '7600'){
      root.classList.add('squawk-7600');
      if(hasSpeech) speechSynthesis.cancel();
      radio.nordo = true;
      showBanner('nordo');
    } else {
      hideBanner();
      if(code === '1200') say(previous === '7700' ? 'Emergency cancelled. Squawk VFR.' : 'Squawk VFR.');
      else say('Squawk ' + spokenDigits(code) + ', radar contact.');
    }
  }

  function pushDigit(d){
    entry += d;
    clearTimeout(entryTimer);
    if(entry.length === 4){
      const code = entry;
      entry = '';
      setSquawk(code);
      return;
    }
    entryTimer = setTimeout(() => { entry = ''; renderCode(); }, 3000);
    renderCode();
  }

  document.addEventListener('keydown', (e) => {
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if(/^[0-7]$/.test(e.key)) pushDigit(e.key);
    if(e.key === 'Escape' && xpdrPad && !xpdrPad.hidden) togglePad(false);
  });

  function togglePad(open){
    xpdrPad.hidden = !open;
    xpdrBtn.setAttribute('aria-expanded', String(open));
  }

  if(xpdrBtn && xpdrPad){
    xpdrBtn.addEventListener('click', () => togglePad(xpdrPad.hidden));
    xpdrPad.querySelectorAll('[data-digit]').forEach(b => b.addEventListener('click', () => pushDigit(b.dataset.digit)));
    document.getElementById('xpdrClr').addEventListener('click', () => { entry = ''; clearTimeout(entryTimer); renderCode(); });
    document.getElementById('xpdrIdent').addEventListener('click', () => {
      root.classList.add('ident');
      setTimeout(() => root.classList.remove('ident'), 4000);
      say('Ident observed. Radar contact.');
    });
    document.addEventListener('click', (e) => {
      if(!xpdrPad.hidden && !e.target.closest('.xpdr')) togglePad(false);
    });
  }

  // ---------------- scroll-driven route ----------------
  const rail = document.getElementById('routeRail');
  const dotsEl = document.getElementById('routeDots');
  const progressEl = document.getElementById('routeProgress');
  const railPlane = document.getElementById('routePlane');
  const barFill = document.getElementById('routeBarFill');
  const WAYPOINTS = [
    ['top', 'Departure: Austin'], ['log', 'Logbook'], ['builds', 'Builds'], ['terminal', 'Terminal'],
    ['ratings', 'Ratings'], ['panel', 'Instrument panel'], ['briefing', 'Briefing'],
    ['pattern', 'Land it'], ['destinations', 'Routes flown'], ['destination', 'Arrival: control tower']
  ];
  let marks = [];
  let ticking = false;

  function scrollMax(){ return Math.max(1, document.documentElement.scrollHeight - window.innerHeight); }

  function layoutRoute(){
    if(!rail) return;
    const max = scrollMax();
    dotsEl.innerHTML = '';
    marks = [];
    const visible = WAYPOINTS.filter(([id]) => {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
    visible.forEach(([id, label], i) => {
      const el = document.getElementById(id);
      const top = el.getBoundingClientRect().top + window.scrollY;
      const p = i === visible.length - 1 ? 1 : Math.min(1, Math.max(0, (top - 80) / max));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dot';
      b.style.top = (p * 100) + '%';
      b.dataset.label = label;
      b.setAttribute('aria-label', 'Fly to ' + label);
      b.addEventListener('click', () => el.scrollIntoView({ behavior: 'smooth' }));
      dotsEl.appendChild(b);
      marks.push({ p, b });
    });
    updateRoute();
  }

  function updateRoute(){
    ticking = false;
    const p = Math.min(1, window.scrollY / scrollMax());
    if(rail){
      progressEl.style.height = (p * 100) + '%';
      railPlane.style.top = (p * 100) + '%';
      marks.forEach(m => m.b.classList.toggle('is-passed', p >= m.p - 0.002));
      rail.classList.toggle('is-landed', p > 0.995);
    }
    if(barFill) barFill.style.width = (p * 100) + '%';
  }

  window.addEventListener('scroll', () => {
    if(!ticking){ ticking = true; requestAnimationFrame(updateRoute); }
  }, { passive: true });
  window.addEventListener('resize', layoutRoute);
  window.addEventListener('load', layoutRoute);
  if('ResizeObserver' in window){
    let t;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(layoutRoute, 150); }).observe(document.body);
  }
  cockpit.relayoutRoute = layoutRoute;
  layoutRoute();

  // ---------------- passenger check-in + phonetic greeting ----------------
  const form = document.getElementById('checkinForm');
  const input = document.getElementById('checkinName');
  const greet = document.getElementById('checkinGreeting');
  const hello = document.getElementById('checkinHello');
  const phon = document.getElementById('checkinPhonetic');
  const reset = document.getElementById('checkinReset');

  function cleanName(s){
    return s.replace(/[^A-Za-zÀ-ɏ' -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  }

  function showGreeting(name, returning){
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    hello.textContent = (returning ? 'Welcome back aboard, ' : 'Welcome aboard, ') + pretty + '.';
    phon.innerHTML = '';
    phonetic(name).forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'phon-word';
      span.style.animationDelay = (i * 0.12) + 's';
      span.textContent = word;
      phon.appendChild(span);
    });
    greet.hidden = false;
    form.hidden = true;
  }

  if(form){
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cleanName(input.value);
      if(!name){ input.focus(); return; }
      cockpit.passenger = name;
      store.set('passengerName', name);
      showGreeting(name, false);
      say(phonetic(name).slice(0, 3).join(' ') + ', Austin Tower, radar contact. Welcome aboard.');
      document.dispatchEvent(new CustomEvent('cockpit:passenger', { detail: name }));
    });
    reset.addEventListener('click', () => {
      cockpit.passenger = '';
      store.remove('passengerName');
      greet.hidden = true;
      form.hidden = false;
      input.value = '';
      input.focus();
      document.dispatchEvent(new CustomEvent('cockpit:passenger', { detail: '' }));
    });
    if(cockpit.passenger) showGreeting(cockpit.passenger, true);
  }
})();
