/* =============================================================
   ORBITAL SIMULATOR 3D â€” Main Script
   Physics: symplectic leapfrog (Velocity-Verlet)
   Renderer: Three.js r134
   ============================================================= */

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const G         = 900;       // gravitational constant (scaled for this sim)
const MAX_TRAIL = 3000;      // maximum trail point capacity per body
const VEL_SCALE = 0.2;       // multiplier converting drag-length to launch velocity

// â”€â”€ Three.js Scene Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200000);
camera.position.set(0, 350, 650);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// =============================================================
// ORBIT CONTROLS
// Manual implementation: left-drag rotates, right-drag pans,
// scroll wheel zooms toward the cursor position on the Y=0 plane.
// =============================================================

const orbitState  = { mode: 'NONE', lx: 0, ly: 0 };
const orbitSph    = new THREE.Spherical().setFromVector3(camera.position.clone());
const orbitTarget = new THREE.Vector3();
let lockCoM    = false;
let followBody = null;

function orbitUpdate() {
  const p = new THREE.Vector3().setFromSpherical(orbitSph).add(orbitTarget);
  camera.position.copy(p);
  camera.lookAt(orbitTarget);
}

renderer.domElement.addEventListener('mousedown', e => {
  if (placementMode) return;
  if (e.button === 0 && trySelectBody(e)) return;
  orbitState.mode = e.button === 2 ? 'PAN' : 'ROTATE';
  orbitState.lx = e.clientX;
  orbitState.ly = e.clientY;
});

renderer.domElement.addEventListener('mousemove', e => {
  if (orbitState.mode === 'NONE') return;
  const dx = e.clientX - orbitState.lx;
  const dy = e.clientY - orbitState.ly;
  orbitState.lx = e.clientX;
  orbitState.ly = e.clientY;

  if (orbitState.mode === 'ROTATE') {
    orbitSph.theta -= dx * 0.005;
    orbitSph.phi    = Math.max(0.05, Math.min(Math.PI - 0.05, orbitSph.phi - dy * 0.005));
  } else {
    // PAN: move the orbit target in the camera's local XY plane
    const k     = orbitSph.radius * 0.001;
    const fwd   = new THREE.Vector3().setFromSpherical(orbitSph).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up    = new THREE.Vector3().crossVectors(right, fwd).normalize();
    orbitTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }
  orbitUpdate();
});

window.addEventListener('mouseup', () => orbitState.mode = 'NONE');

// Zoom-to-cursor: intersect ray with the Y=0 plane to find the world point
// under the cursor, then lerp the orbit target toward it before zooming.
const _zoomPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _zoomRay   = new THREE.Raycaster();
const _zoomPt    = new THREE.Vector3();

renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  const oldR = orbitSph.radius;
  const newR = Math.max(10, Math.min(80000, oldR * (1 + e.deltaY * 0.001)));

  const rect = renderer.domElement.getBoundingClientRect();
  const nx   = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
  const ny   = -((e.clientY - rect.top)  / rect.height) *  2 + 1;
  _zoomRay.setFromCamera(new THREE.Vector2(nx, ny), camera);

  if (_zoomRay.ray.intersectPlane(_zoomPlane, _zoomPt)) {
    // Shift target toward cursor proportionally to how much we're zooming in
    const t = Math.max(0, 1 - newR / oldR) * 0.6;
    orbitTarget.lerp(_zoomPt, t);
  }
  orbitSph.radius = newR;
  orbitUpdate();
}, { passive: false });

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

// =============================================================
// STARS
// Randomly scattered points at a large radius for the background sky.
// =============================================================
(function () {
  const pos = [];
  for (let i = 0; i < 12000; i++) {
    const r = 40000 + Math.random() * 30000;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos.push(
      r * Math.sin(p) * Math.cos(t),
      r * Math.sin(p) * Math.sin(t),
      r * Math.cos(p)
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, sizeAttenuation: false })));
})();

// =============================================================
// NEBULA BACKGROUND
// A large inverted sphere rendered from the inside with a GLSL
// FBM (fractal Brownian motion) noise shader. Domain warping gives
// the swirly, layered look of real emission nebulae.
// A slow time uniform drifts the clouds so the background feels alive.
// =============================================================
const nebulaUni = { uTime: { value: 0 } };

const nebulaMat = new THREE.ShaderMaterial({
  uniforms: nebulaUni,
  side: THREE.BackSide,
  transparent: false,
  depthWrite: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vDir;
    uniform float uTime;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i),               hash(i+vec3(1,0,0)), f.x),
            mix(hash(i+vec3(0,1,0)),   hash(i+vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i+vec3(0,0,1)),   hash(i+vec3(1,0,1)), f.x),
            mix(hash(i+vec3(0,1,1)),   hash(i+vec3(1,1,1)), f.x), f.y),
        f.z
      );
    }

    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 7; i++) {
        v += a * noise(p);
        p = p * 2.1 + vec3(1.7, 9.2, 5.3);
        a *= 0.48;
      }
      return v;
    }

    void main() {
      float t = uTime * 0.00012;
      vec3 d = vDir;

      // Domain warping: warp the sample position by lower-frequency noise
      // so clouds curve and fold into each other.
      float n1 = fbm(d * 2.5 + vec3(t, t * 0.6, 0.0));
      float n2 = fbm(d * 2.5 + vec3(n1 * 1.4, 0.0, t * 0.4) + vec3(3.2, 1.7, 5.1));
      float cloud = fbm(d * 3.5 + vec3(n1 * 0.9, n2 * 1.1, t * 0.3) + vec3(8.3, 2.8, 0.6));

      // Second warp pass for finer detail in bright regions
      float detail = fbm(d * 6.0 + vec3(n2, cloud, n1) + vec3(t * 0.2, 5.5, 3.1));

      float density = pow(max(0.0, cloud - 0.28), 1.4) * 2.2;
      density += pow(max(0.0, detail - 0.38), 1.8) * 0.7;
      density = clamp(density, 0.0, 1.0);

      // Colour zones: purple pillars, blue wisps, pink emission, cyan ionisation, orange dust
      vec3 purple = vec3(0.30, 0.04, 0.55);
      vec3 blue   = vec3(0.02, 0.18, 0.72);
      vec3 pink   = vec3(0.75, 0.07, 0.40);
      vec3 cyan   = vec3(0.00, 0.55, 0.75);
      vec3 orange = vec3(0.65, 0.25, 0.03);

      vec3 col = mix(purple, blue,   clamp(n1 * 1.8, 0.0, 1.0));
      col      = mix(col,    pink,   clamp(n2 * 1.4 - 0.2, 0.0, 1.0));
      col      = mix(col,    cyan,   clamp(detail * 1.2 - 0.3, 0.0, 1.0));
      col      = mix(col,    orange, clamp(cloud * 0.9 - 0.5, 0.0, 1.0));

      // Bright highlights in densest regions
      col += vec3(0.3, 0.2, 0.5) * pow(max(0.0, density - 0.4), 2.0);

      // Sparse background tint so the whole sky has a faint colour even where density=0
      vec3 bgTint = mix(vec3(0.01, 0.0, 0.03), vec3(0.0, 0.01, 0.04), n1);
      col = mix(bgTint, col, density);

      gl_FragColor = vec4(col, 0.92);
    }
  `,
});

const nebulaSphere = new THREE.Mesh(new THREE.SphereGeometry(60000, 64, 48), nebulaMat);
nebulaSphere.renderOrder = -1;
scene.add(nebulaSphere);

// =============================================================
// GRAVITATIONAL WELL GRID (GPU vertex-displaced mesh)
//
// The grid IS the grav well. The vertex shader sums G*m/rÂ² from
// every body and displaces Y downward. Only vertices where the
// total field exceeds gwThresh are displaced â€” the rest are free.
//
// Two meshes:
//   _gridMesh  â€” 16000Ã—16000, 220Ã—220 segments, follows orbitTarget,
//                carries the full grav-well displacement.
//   _gridBg    â€” 200000Ã—200000, 1 segment, flat background grid
//                that extends to the horizon.
// =============================================================

const GW_MAX_B    = 24;   // max bodies the shader supports (uniform array size)
let   showPotential = true;
let   gwThresh      = 71; // displacement threshold; lower = larger wells

// All uniforms for both grid materials â€” the background grid shares
// the same objects (by reference) so one slider update affects both.
const gwUni = {
  camPos:    { value: new THREE.Vector3() },
  fadeStart: { value: 3000  },   // camera distance at which grid starts to fade
  fadeEnd:   { value: 25000 },   // camera distance at which grid fully fades out
  gwEnabled: { value: 1.0   },
  gwThresh:  { value: 71    },
  gwScale:   { value: 120.0 },   // maximum downward displacement in world units
  gwSoft:    { value: 4.0   },   // visual softening radius (prevents infinite spike at origin)
  bPos:      { value: Array.from({ length: GW_MAX_B }, () => new THREE.Vector3()) },
  bMass:     { value: new Array(GW_MAX_B).fill(0) },
  gridAlpha: { value: 0.7   },   // grid line opacity multiplier (0â€“3+)
  gridMajor: { value: 100.0 },   // major grid line spacing in world units
  gridMinor: { value: 20.0  },   // minor grid line spacing in world units
};

// Vertex shader: computes gravitational field at each grid vertex
// and displaces it downward by a log-scaled amount.
const gravWellVertexShader = `
  uniform float gwEnabled, gwThresh, gwScale, gwSoft;
  uniform vec3  bPos[${GW_MAX_B}];
  uniform float bMass[${GW_MAX_B}];
  varying vec3  vWorldPos;
  varying float vDepth;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    float field = 0.0;

    if (gwEnabled > 0.5) {
      for (int i = 0; i < ${GW_MAX_B}; i++) {
        vec2  d  = vWorldPos.xz - bPos[i].xz;
        float r2 = dot(d, d) + gwSoft * gwSoft;  // softened distanceÂ²
        field   += 900.0 * bMass[i] / r2;
      }
    }

    // Log-scale displacement: creates a sharp spike near singularities
    // without an upper saturation ceiling.
    float excess = max(0.0, field - gwThresh);
    float disp   = gwScale * log(1.0 + excess / gwThresh) / 2.303;
    vDepth       = clamp(disp / (gwScale * 4.0), 0.0, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix
                * vec4(position.x, position.y - disp, position.z, 1.0);
  }
`;

// Fragment shader: draws grid lines using screen-space derivatives (fwidth)
// for sub-pixel-accurate anti-aliased lines at any zoom level.
// Color blends from green (flat) through blue to white (deep well).
const gravWellFragmentShader = `
  uniform vec3  camPos;
  uniform float fadeStart, fadeEnd, gridAlpha, gridMajor, gridMinor;
  varying vec3  vWorldPos;
  varying float vDepth;

  void main() {
    vec2 p = vWorldPos.xz;

    // Major grid lines
    vec2  g    = abs(fract(p / gridMajor + 0.5) - 0.5) / fwidth(p / gridMajor);
    float line = 1.0 - min(min(g.x, g.y), 1.0);

    // Minor grid lines (dimmer)
    vec2  g2    = abs(fract(p / gridMinor + 0.5) - 0.5) / fwidth(p / gridMinor);
    float line2 = (1.0 - min(min(g2.x, g2.y), 1.0)) * 0.25;

    // Distance fade so the grid doesn't clutter the far field
    float dist = length(vWorldPos.xz - camPos.xz);
    float fade = 1.0 - smoothstep(fadeStart, fadeEnd, dist);

    // Colour: flat = dark green, well = blueâ†’white
    vec3 flatCol = vec3(0.0, 0.4, 0.25);
    vec3 wellCol = mix(vec3(0.0, 0.15, 0.9), vec3(1.0, 1.0, 1.0), vDepth);
    vec3 col     = mix(flatCol, wellCol, clamp(vDepth * 2.0, 0.0, 1.0));

    float alpha = (line * 0.38 + line2 * 0.14) * fade * gridAlpha;
    gl_FragColor = vec4(col, alpha);
  }
`;

const _gridMat = new THREE.ShaderMaterial({
  transparent:     true,
  depthWrite:      false,
  side:            THREE.DoubleSide,
  uniforms:        gwUni,
  vertexShader:    gravWellVertexShader,
  fragmentShader:  gravWellFragmentShader,
  extensions:      { derivatives: true },
});

// 220Ã—220 segments gives enough vertex density to show smooth wells
const _gridMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(16000, 16000, 220, 220).rotateX(-Math.PI / 2),
  _gridMat
);
scene.add(_gridMesh);

// Background grid â€” flat, infinite-feeling plane beyond the displacement mesh.
// Shares gridAlpha/gridMajor/gridMinor uniforms by reference so sliders affect both.
const _gridBgMat = new THREE.ShaderMaterial({
  transparent:    true,
  depthWrite:     false,
  side:           THREE.DoubleSide,
  uniforms: {
    camPos:    gwUni.camPos,
    fadeStart: { value: 3000  },
    fadeEnd:   { value: 25000 },
    gridAlpha: gwUni.gridAlpha,
    gridMajor: gwUni.gridMajor,
    gridMinor: gwUni.gridMinor,
  },
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vWorldPos   = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3  camPos;
    uniform float fadeStart, fadeEnd, gridAlpha, gridMajor, gridMinor;
    varying vec3  vWorldPos;
    void main() {
      vec2  p     = vWorldPos.xz;
      vec2  g     = abs(fract(p / gridMajor + 0.5) - 0.5) / fwidth(p / gridMajor);
      float line  = 1.0 - min(min(g.x, g.y), 1.0);
      vec2  g2    = abs(fract(p / gridMinor + 0.5) - 0.5) / fwidth(p / gridMinor);
      float line2 = (1.0 - min(min(g2.x, g2.y), 1.0)) * 0.25;
      float d     = length(vWorldPos.xz - camPos.xz);
      float fade  = 1.0 - smoothstep(fadeStart, fadeEnd, d);
      gl_FragColor = vec4(0.0, 0.4, 0.25, (line * 0.38 + line2 * 0.14) * fade * gridAlpha);
    }
  `,
  extensions: { derivatives: true },
});

const _gridBg = new THREE.Mesh(
  new THREE.PlaneGeometry(200000, 200000, 1, 1).rotateX(-Math.PI / 2),
  _gridBgMat
);
_gridBg.position.y = -0.2; // slightly below the displacement mesh to avoid z-fighting
scene.add(_gridBg);

// â”€â”€ Origin Marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// White dot + crosshair at (0, 0, 0) so the origin is always visible.
(function () {
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(4, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  scene.add(dot);

  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-25, 0,   0), new THREE.Vector3(25, 0,  0),
    new THREE.Vector3(  0, 0, -25), new THREE.Vector3( 0, 0, 25),
  ]);
  scene.add(new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xffffff, opacity: .5, transparent: true })
  ));
})();

// â”€â”€ Center-of-Mass Marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const comMesh = new THREE.Mesh(
  new THREE.SphereGeometry(3, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
);
comMesh.visible = false;
scene.add(comMesh);

const comLines = (() => {
  const g = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-15,  0,   0), new THREE.Vector3(15, 0,  0),
    new THREE.Vector3(  0, -15,  0), new THREE.Vector3( 0, 15, 0),
    new THREE.Vector3(  0,  0, -15), new THREE.Vector3( 0, 0, 15),
  ]);
  const l = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0xffffff, opacity: .5, transparent: true })
  );
  l.visible = false;
  scene.add(l);
  return l;
})();

// =============================================================
// MASS TIER LABELS
// Maps a slider value (sqrt scale) to a human-readable tier name.
// Used only for hover tooltips â€” the body's actual name is separate.
// =============================================================

const MASS_TIERS = [
  { max:  8, label: 'Asteroid',     emoji: 'ðŸª¨' },
  { max: 18, label: 'Dwarf Planet', emoji: 'ðŸŒ‘' },
  { max: 28, label: 'Moon',         emoji: 'ðŸŒ•' },
  { max: 42, label: 'Rocky Planet', emoji: 'ðŸŒ' },
  { max: 58, label: 'Large Planet', emoji: 'ðŸª' },
  { max: 70, label: 'Gas Giant',    emoji: 'ðŸŒ€' },
  { max: 80, label: 'Red Dwarf',    emoji: 'ðŸ”´' },
  { max: 88, label: 'Sun-like Star',emoji: 'â˜€ï¸' },
  { max: 94, label: 'Giant Star',   emoji: 'ðŸŒŸ' },
  { max: 100,label: 'Black Hole',   emoji: 'âš«' },
];

function massLabel(sv) {
  for (const t of MASS_TIERS) if (sv <= t.max) return t.emoji + ' ' + t.label;
  return MASS_TIERS.at(-1).label;
}

function tierFromMass(m) {
  const sv = Math.sqrt(m / 100);
  return MASS_TIERS.find(t => sv <= t.max) || MASS_TIERS.at(-1);
}

// =============================================================
// SIMULATION STATE
// =============================================================

let bodies     = [];
let paused     = false;
let reversed   = false;
let simTime    = 0;
let simSpeed   = 1.0;
let trailLen   = 500;
let showVectors = false;
let showLabels  = false;
let showTrails  = true;
let selectedBody  = null;
const selectedBodies = new Set(); // multi-select: Shift+click adds/removes

const keys = {}; // keyboard state map: key â†’ boolean

// Re-trigger the CSS pop animation on the status bar each time text changes
function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'statusPop 0.35s ease';
}

function centerOnOrigin() {
  orbitTarget.set(0, 0, 0);
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  lockCoM = false;
  document.getElementById('btnCoMLock').classList.remove('on');
  orbitUpdate();
  updateList();
}

// =============================================================
// TUTORIAL MODAL
// Shows on first visit. Press ? to reopen. localStorage flag
// suppresses it on subsequent visits if the user clicks
// "Don't show again".
// =============================================================
(function () {
  const overlay = document.getElementById('tut-overlay');

  // Tab switching
  document.querySelectorAll('.ttab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ttab').forEach(t => t.classList.remove('on'));
      document.querySelectorAll('.tpage').forEach(p => p.style.display = 'none');
      btn.classList.add('on');
      document.getElementById('tpage-' + btn.dataset.tab).style.display = 'block';
    });
  });

  function closeTut() { overlay.style.display = 'none'; }

  document.getElementById('tut-close').addEventListener('click', closeTut);
  document.getElementById('tut-skip').addEventListener('click', () => {
    closeTut();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTut(); });

  // Expose opener so the ? key handler below can call it
  window._openTutorial = () => {
    overlay.style.display = 'flex';
    document.querySelectorAll('.ttab').forEach((t, i) => t.classList.toggle('on', i === 0));
    document.querySelectorAll('.tpage').forEach((p, i) => p.style.display = i === 0 ? 'block' : 'none');
  };
})();

// â”€â”€ Global Keyboard Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === 'Escape') {
    // Close tutorial first if open; otherwise deselect/exit modes
    const tut = document.getElementById('tut-overlay');
    if (tut.style.display !== 'none') { tut.style.display = 'none'; return; }
    selectBody(null);
    exitCannon();
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
    updateList();
    updateLockBtn();
  }
  if (e.key === '?') window._openTutorial && window._openTutorial();
  if (e.key === 'c' || e.key === 'C') centerOnOrigin();
});

window.addEventListener('keyup', e => keys[e.key] = false);

// =============================================================
// BODY CLASS
// Each celestial body owns its Three.js meshes (sphere, glow,
// selection ring), trail line, vector arrows, and DOM label.
// =============================================================

class Body {
  constructor(pos, vel, mass, color, name, radius) {
    this.pos   = pos.clone();
    this.vel   = vel.clone();
    this.mass  = mass;
    this.color = color;
    this.acc   = new THREE.Vector3();
    this.id    = Math.random().toString(36).slice(2, 8);
    this.name  = name || tierFromMass(mass).label;
    this.trail = [];
    this._tick = 0;

    // Visual radius: use provided value, or derive from cube root of mass
    this._r = radius != null ? Math.max(2, radius) : Math.max(3, Math.cbrt(mass) * 0.55);

    this._spawnT  = 0;   // 0â†’1 spawn scale-in animation
    this._pulseT  = -1;  // merge glow pulse (-1 = inactive)

    this._buildMesh();
    this._buildTrail();
    this._buildVectors();
    this._buildLabel();
    this._buildAccretionDisk();
    this.mesh.scale.setScalar(0.01); // start tiny, spawn animation grows it
  }

  // Compute glow parameters based on mass tier.
  // Stars use AdditiveBlending so the glow adds light rather than blending.
  // Black holes get a dark shroud + a bright gravitational lensing ring.
  _glowParams() {
    const isBlackHole = this.mass >= 880000;
    const isStellar   = this.mass >= 150000 && !isBlackHole;
    const massT       = Math.min(1, (Math.log10(Math.max(this.mass, 100)) - 2) / 4);
    return {
      radMult:  isBlackHole ? 5       : isStellar ? 3 + massT * 5       : 2.5,
      opacity:  isBlackHole ? 0.45    : isStellar ? 0.08 + massT * 0.22 : 0.03 + massT * 0.05,
      blending: isStellar   ? THREE.AdditiveBlending : THREE.NormalBlending,
      isBlackHole,
    };
  }

  _buildMesh() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this._r, 20, 14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(this.color) })
    );
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);

    // Glow sphere â€” radius and opacity scale with mass
    const gp = this._glowParams();
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(this._r * gp.radMult, 16, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.color), transparent: true,
        opacity: gp.opacity, blending: gp.blending, depthWrite: false,
      })
    );
    this.mesh.add(this.glow);

    // Black hole: bright photon-sphere lensing ring at the event horizon edge
    this.lensingRing = null;
    if (gp.isBlackHole) {
      this.lensingRing = new THREE.Mesh(
        new THREE.RingGeometry(this._r * 1.6, this._r * 2.5, 64),
        new THREE.MeshBasicMaterial({
          color: 0x9966ff, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      this.lensingRing.rotation.x = Math.PI / 2;
      this.mesh.add(this.lensingRing);
    }

    // Wireframe ring shown when the body is selected
    this.selRing = new THREE.Mesh(
      new THREE.SphereGeometry(this._r * 2.2, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true, opacity: 0 })
    );
    this.mesh.add(this.selRing);
  }

  // Spinning particle disk for neutron stars and black holes (mass >= 700 000).
  // Particles cluster toward the inner edge; color runs hot-white â†’ orange â†’ red.
  _buildAccretionDisk() {
    if (this.mass < 700000) return;
    const isBH   = this.mass >= 880000;
    const innerR = this._r * (isBH ? 3.5 : 2.5);
    const outerR = this._r * (isBH ? 14  : 8);
    const count  = isBH ? 2500 : 1200;

    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Power distribution clusters more particles near the inner edge
      const r     = innerR + Math.pow(Math.random(), 1.5) * (outerR - innerR);
      const angle = Math.random() * Math.PI * 2;
      const thick = this._r * 0.35 * (r / outerR); // disk gets thinner toward the edge

      positions[i * 3]     = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * thick;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      const t = (r - innerR) / (outerR - innerR); // 0 = inner (hot), 1 = outer (cool)
      if (isBH) {
        colors[i * 3]     = 1.0;
        colors[i * 3 + 1] = Math.max(0, 0.85 - t * 0.75);
        colors[i * 3 + 2] = Math.max(0, 0.6  - t * 1.2);
      } else {
        // Neutron star: cooler blue-white
        colors[i * 3]     = 0.7 + (1 - t) * 0.3;
        colors[i * 3 + 1] = 0.75 + (1 - t) * 0.2;
        colors[i * 3 + 2] = 1.0;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    this.diskMesh = new THREE.Points(g, new THREE.PointsMaterial({
      size: isBH ? 2.2 : 1.5, vertexColors: true,
      transparent: true, opacity: isBH ? 0.75 : 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.diskMesh.position.copy(this.pos);
    // Slight random tilt so every body looks unique
    this.diskMesh.rotation.x = (Math.random() - 0.5) * 0.3;
    this.diskMesh.rotation.z = (Math.random() - 0.5) * 0.3;
    scene.add(this.diskMesh);
    this._diskRotSpeed = isBH ? 0.006 : 0.013;
  }

  _buildTrail() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    g.setDrawRange(0, 0);
    this.trailLine = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({ color: new THREE.Color(this.color), transparent: true, opacity: .55 })
    );
    scene.add(this.trailLine);
  }

  _buildVectors() {
    this.velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), this.pos, 20, 0x00ff66, 8, 5);
    this.accArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), this.pos, 20, 0xff4400, 8, 5);
    this.velArrow.visible = false;
    this.accArrow.visible = false;
    scene.add(this.velArrow);
    scene.add(this.accArrow);
  }

  _buildLabel() {
    this.labelEl = document.createElement('div');
    this.labelEl.className   = 'blabel';
    this.labelEl.textContent = this.name;
    this.labelEl.style.color = this.color;
    this.labelEl.style.display = 'none';
    document.getElementById('labels').appendChild(this.labelEl);
  }

  // Rebuild geometry after a collision merge (mass and radius change).
  // Re-evaluates glow parameters so a body that merges into a star gets
  // the correct additive stellar glow.
  rebuildMesh() {
    this._r = Math.max(3, Math.cbrt(this.mass) * 0.55);
    this.mesh.geometry.dispose();
    this.mesh.geometry    = new THREE.SphereGeometry(this._r, 20, 14);
    this.selRing.geometry.dispose();
    this.selRing.geometry = new THREE.SphereGeometry(this._r * 2.2, 12, 8);

    // Recompute glow with updated mass and radius
    const gp = this._glowParams();
    this.glow.geometry.dispose();
    this.glow.geometry          = new THREE.SphereGeometry(this._r * gp.radMult, 16, 10);
    this.glow.material.opacity  = gp.opacity;
    this.glow.material.blending = gp.blending;

    // Add lensing ring if this merge created a black hole
    if (gp.isBlackHole && !this.lensingRing) {
      this.lensingRing = new THREE.Mesh(
        new THREE.RingGeometry(this._r * 1.6, this._r * 2.5, 64),
        new THREE.MeshBasicMaterial({
          color: 0x9966ff, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      this.lensingRing.rotation.x = Math.PI / 2;
      this.mesh.add(this.lensingRing);
    }

    // Rebuild accretion disk with updated radius (also creates one if mass crossed threshold)
    if (this.diskMesh) {
      scene.remove(this.diskMesh);
      this.diskMesh.geometry.dispose();
      this.diskMesh.material.dispose();
      this.diskMesh = null;
    }
    this._buildAccretionDisk();
  }

  updateVisual() {
    this.mesh.position.copy(this.pos);

    // â”€â”€ Spawn scale-in (cubic ease-out over 25 frames) â”€â”€â”€â”€â”€â”€â”€â”€
    if (this._spawnT < 1) {
      this._spawnT = Math.min(1, this._spawnT + 0.04);
      const s = 1 - Math.pow(1 - this._spawnT, 3);
      this.mesh.scale.setScalar(s);
    }

    // â”€â”€ Merge glow pulse (scale glow up then back) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (this._pulseT >= 0) {
      this._pulseT = Math.min(1, this._pulseT + 0.035);
      // bell curve: rises to peak at t=0.4, back to 1 at t=1
      const p = Math.sin(this._pulseT * Math.PI);
      this.glow.scale.setScalar(1 + p * 1.8);
      this.glow.material.opacity = this._glowParams().opacity * (1 + p * 2.5);
      if (this._pulseT >= 1) {
        this.glow.scale.setScalar(1);
        this.glow.material.opacity = this._glowParams().opacity;
        this._pulseT = -1;
      }
    }

    // â”€â”€ Accretion Disk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (this.diskMesh) {
      this.diskMesh.position.copy(this.pos);
      this.diskMesh.rotation.y += this._diskRotSpeed;
    }

    // â”€â”€ Trail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (showTrails) {
      this._tick++;
      // Only sample every other frame to save memory
      if (this._tick % 2 === 0) {
        this.trail.push(this.pos.clone());
        if (this.trail.length > trailLen) this.trail.shift();
      }
      const arr = this.trailLine.geometry.attributes.position.array;
      const n   = Math.min(this.trail.length, MAX_TRAIL);
      for (let i = 0; i < n; i++) {
        arr[i * 3]     = this.trail[i].x;
        arr[i * 3 + 1] = this.trail[i].y;
        arr[i * 3 + 2] = this.trail[i].z;
      }
      this.trailLine.geometry.attributes.position.needsUpdate = true;
      this.trailLine.geometry.setDrawRange(0, n);
    } else {
      this.trailLine.geometry.setDrawRange(0, 0);
    }

    // â”€â”€ Velocity / Acceleration Arrows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.velArrow.visible = showVectors;
    this.accArrow.visible = showVectors;
    if (showVectors) {
      const vl = this.vel.length();
      if (vl > 0.01) {
        this.velArrow.position.copy(this.pos);
        this.velArrow.setDirection(this.vel.clone().normalize());
        this.velArrow.setLength(Math.max(15, Math.min(vl * .4, 120)), 10, 6);
      }
      const al = this.acc.length();
      if (al > 0.0001) {
        this.accArrow.position.copy(this.pos);
        this.accArrow.setDirection(this.acc.clone().normalize());
        this.accArrow.setLength(Math.max(15, Math.min(al * 80, 100)), 10, 6);
      }
    }

    // â”€â”€ Selection Ring (animated pulse) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const isSelected = selectedBody === this || selectedBodies.has(this);
    this.selRing.material.color.set(selectedBodies.size > 1 && selectedBodies.has(this) ? 0x00ffff : 0xffaa00);
    this.selRing.material.opacity = isSelected
      ? (.4 + .4 * Math.sin(Date.now() * .005))
      : 0;

    // â”€â”€ Floating Label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.labelEl.textContent   = this.name;
    this.labelEl.style.display = showLabels ? 'block' : 'none';
    if (showLabels) {
      const v = this.pos.clone().project(camera);
      this.labelEl.style.left = ((v.x * .5 + .5) * innerWidth) + 'px';
      this.labelEl.style.top  = ((-v.y * .5 + .5) * innerHeight - this._r * 2 - 6) + 'px';
    }
  }

  // Remove all Three.js objects and the DOM label from the scene
  remove() {
    scene.remove(this.mesh);
    scene.remove(this.trailLine);
    scene.remove(this.velArrow);
    scene.remove(this.accArrow);
    this.mesh.geometry.dispose();
    this.trailLine.geometry.dispose();
    this.labelEl.remove();
    if (this.diskMesh) {
      scene.remove(this.diskMesh);
      this.diskMesh.geometry.dispose();
      this.diskMesh.material.dispose();
    }
  }
}

// =============================================================
// PHYSICS â€” Velocity-Verlet (symplectic leapfrog)
//
// Symplectic integrators conserve a shadow Hamiltonian exactly,
// so energy oscillates around the true value rather than drifting.
// This keeps orbits stable indefinitely (unlike Euler or RK4).
//
// Sequence per step:
//   1. half-kick:  v += a * dt/2
//   2. drift:      x += v * dt
//   3. recompute:  a = accel(x)
//   4. half-kick:  v += a * dt/2
// =============================================================

const _rTmp = new THREE.Vector3(); // reused scratch vector to avoid GC pressure

function accelInto(idx, positions, masses, out) {
  out.set(0, 0, 0);
  const pi = positions[idx];
  for (let j = 0; j < positions.length; j++) {
    if (j === idx) continue;
    _rTmp.subVectors(positions[j], pi);
    const d = _rTmp.length();
    if (d < .5) continue; // skip if bodies are unrealistically close
    out.addScaledVector(_rTmp, G * masses[j] / (d * d * d));
  }
}

// Recompute accelerations for all bodies from current positions.
// Must be called after every body addition/removal/merge.
function initAccelerations() {
  if (!bodies.length) return;
  const pos = bodies.map(b => b.pos);
  const ms  = bodies.map(b => b.mass);
  for (let i = 0; i < bodies.length; i++) accelInto(i, pos, ms, bodies[i].acc);
}

function stepLeapfrog(dt) {
  const n   = bodies.length;
  if (!n) return;
  const hdt = dt * 0.5;

  for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(bodies[i].acc, hdt);  // half-kick
  for (let i = 0; i < n; i++) bodies[i].pos.addScaledVector(bodies[i].vel, dt);   // drift

  const pos = bodies.map(b => b.pos);
  const ms  = bodies.map(b => b.mass);
  for (let i = 0; i < n; i++) accelInto(i, pos, ms, bodies[i].acc);               // recompute

  for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(bodies[i].acc, hdt);  // half-kick
  simTime += dt;
}

// WASD thrust for the selected body. After applying an impulse we must
// call initAccelerations() so the next leapfrog half-kick is consistent.
function applyThrust(dt) {
  if (!selectedBody) return;
  const b  = selectedBody;
  const dv = +document.getElementById('sThrust').value * dt;
  const vd = b.vel.lengthSq() > .01
    ? b.vel.clone().normalize()
    : new THREE.Vector3(1, 0, 0);
  const rd = new THREE.Vector3(-vd.z, 0, vd.x).normalize();

  if (keys['w'] || keys['W']) b.vel.addScaledVector(vd,  dv);
  if (keys['s'] || keys['S']) b.vel.addScaledVector(vd, -dv);
  if (keys['a'] || keys['A']) b.vel.addScaledVector(rd, -dv);
  if (keys['d'] || keys['D']) b.vel.addScaledVector(rd,  dv);
  if (keys['q'] || keys['Q']) b.vel.y +=  dv;
  if (keys['e'] || keys['E']) b.vel.y -=  dv;

  if (Object.values(keys).some(Boolean)) initAccelerations();
}

// Perfect inelastic collision â€” conserves momentum.
// Returns true if a merge/disruption happened (so the step loop can break early).
// Detection runs inside the physics sub-step loop to avoid tunneling.
function checkCollisions() {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const bi = bodies[i];
      const bj = bodies[j];
      const dist = bi.pos.distanceTo(bj.pos);

      const [big, sml] = bi.mass >= bj.mass ? [i, j] : [j, i];
      const B = bodies[big];
      const S = bodies[sml];

      // Tidal disruption: check at the Roche limit, not just physical contact.
      // Must run BEFORE the contact-distance skip so it fires at orbit scale.
      // Skip if the victim is already debris (prevents chain-disruption cascade).
      const isMassive = B.mass >= 700000;
      if (isMassive && !S._isDebris && B.mass / S.mass >= 800) {
        const rocheLimit = S._r * Math.pow(2 * B.mass / S.mass, 1 / 3);
        if (dist < rocheLimit) {
          tidalDisrupt(B, S, sml);
          return true;
        }
      }

      if (dist > (bi._r + bj._r) * .8) continue;

      const tm = bi.mass + bj.mass;

      // Compute merged state into NEW vectors before mutating anything
      const mVel = new THREE.Vector3()
        .addScaledVector(bi.vel, bi.mass / tm)
        .addScaledVector(bj.vel, bj.mass / tm);
      const mPos = new THREE.Vector3()
        .addScaledVector(bi.pos, bi.mass / tm)
        .addScaledVector(bj.pos, bj.mass / tm);

      // Spawn impact flash at the merge point before modifying anything
      createImpactFlash(mPos, new THREE.Color(B.color).lerp(new THREE.Color(S.color), 0.5).getHex());

      B.vel.copy(mVel);
      B.pos.copy(mPos);
      B.mass = tm;
      // Black holes keep their name â€” they simply consume smaller bodies
      if (B.mass < 880000) B.name = B.name + '+' + S.name;
      B.rebuildMesh();
      B._pulseT = 0; // trigger glow burst on the surviving body
      initAccelerations();

      if (selectedBody === S) selectBody(null);
      if (selectedBodies.has(S)) selectedBodies.delete(S);
      if (followBody   === S) {
        followBody = null;
        document.getElementById('btnFollowOff').style.display = 'none';
      }

      S.remove();
      bodies.splice(sml, 1);
      if (recording && bodies.length !== recBodyCount) stopRecording();
      updateList();
      return true;
    }
  }
  return false;
}

// Tidal disruption - the small body is shredded into a debris stream
// that orbits the dominant attractor instead of merging.
function tidalDisrupt(attractor, victim, victimIdx) {
  const debrisCount = 18 + Math.floor(Math.random() * 12);
  const baseVel     = victim.vel.clone();
  const relPos      = victim.pos.clone().sub(attractor.pos);
  const tangent     = new THREE.Vector3(-relPos.z, 0, relPos.x).normalize();

  // Debris stream: spread along the tangent direction with slight velocity scatter
  for (let k = 0; k < debrisCount; k++) {
    const t       = (k / (debrisCount - 1) - 0.5) * 2; // -1 â€¦ +1
    const spread  = relPos.length() * 0.15;
    const pos     = victim.pos.clone()
      .addScaledVector(tangent, t * spread)
      .addScaledVector(relPos.clone().normalize(), (Math.random() - 0.5) * spread * 0.4);
    pos.y += (Math.random() - 0.5) * spread * 0.1;

    // Each fragment inherits victim momentum + small random kick
    const kick = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 1.5
    );
    const vel = baseVel.clone().add(kick);

    const mass  = Math.max(100, Math.round(victim.mass / debrisCount));
    const color = new THREE.Color(victim.color)
      .lerp(new THREE.Color(0xff6600), 0.3 + Math.random() * 0.4).getHex();
    const frag  = new Body(pos, vel, mass, '#' + color.toString(16).padStart(6, '0'), 'Debris ' + (++_debrisN) + ' â€” ' + victim.name);
    frag._isDebris = true; // immune from further tidal disruption
    bodies.push(frag);
  }

  // Big spaghettification flash
  createTidalFlash(victim.pos, victim.color);

  if (selectedBody === victim) selectBody(null);
  if (selectedBodies.has(victim)) selectedBodies.delete(victim);
  if (followBody === victim) {
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
  }

  victim.remove();
  bodies.splice(victimIdx, 1);
  initAccelerations();
  updateList();
}

// Elongated particle stream flash for tidal disruption
function createTidalFlash(pos, color) {
  const count      = 200;
  const positions  = new Float32Array(count * 3);
  const velocities = [];
  const col        = new THREE.Color(color).lerp(new THREE.Color(0xff4400), 0.5).getHex();

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    const angle  = Math.random() * Math.PI * 2;
    const stretch = 8 + Math.random() * 16; // faster along one axis â†’ streaky
    velocities.push(new THREE.Vector3(
      Math.cos(angle) * stretch,
      (Math.random() - 0.5) * 1.5,
      Math.sin(angle) * stretch * 0.3
    ));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color: col, size: 5, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(pts);

  const flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(12, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flashSphere.position.copy(pos);
  scene.add(flashSphere);

  activeFlashes.push({ pts, velocities, flashSphere, age: 0, maxAge: 70 });
}

function computeCoM() {
  if (!bodies.length) return new THREE.Vector3();
  let tm = 0;
  const com = new THREE.Vector3();
  for (const b of bodies) { com.addScaledVector(b.pos, b.mass); tm += b.mass; }
  return com.divideScalar(tm);
}

// =============================================================
// IMPACT FLASH
// When two bodies merge, burst a cloud of particles at the collision
// point that radiates outward and fades over ~50 frames.
// =============================================================

const activeFlashes = [];

function createImpactFlash(pos, color) {
  const count      = 120;
  const positions  = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;
    // Random sphere direction, compressed on Y so the burst reads as planar
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const speed = 2 + Math.random() * 7;
    velocities.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.sin(phi) * Math.sin(theta) * speed * 0.35,
      Math.cos(phi) * speed
    ));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    color, size: 4, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(pts);

  // Expanding flash sphere â€” scales up and fades quickly
  const flashSphere = new THREE.Mesh(
    new THREE.SphereGeometry(8, 10, 8),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  flashSphere.position.copy(pos);
  scene.add(flashSphere);

  activeFlashes.push({ pts, velocities, flashSphere, age: 0, maxAge: 50 });
}

function updateFlashes() {
  for (let i = activeFlashes.length - 1; i >= 0; i--) {
    const f   = activeFlashes[i];
    f.age++;
    const t   = f.age / f.maxAge;
    const arr = f.pts.geometry.attributes.position.array;

    for (let j = 0; j < f.velocities.length; j++) {
      arr[j * 3]     += f.velocities[j].x;
      arr[j * 3 + 1] += f.velocities[j].y;
      arr[j * 3 + 2] += f.velocities[j].z;
      f.velocities[j].multiplyScalar(0.90); // drag
    }
    f.pts.geometry.attributes.position.needsUpdate = true;
    f.pts.material.opacity = Math.max(0, 1 - t * 1.2);

    // Flash sphere expands and fades fast
    f.flashSphere.scale.setScalar(1 + t * 10);
    f.flashSphere.material.opacity = Math.max(0, 0.7 - t * 2);

    if (f.age >= f.maxAge) {
      scene.remove(f.pts);
      scene.remove(f.flashSphere);
      f.pts.geometry.dispose();       f.pts.material.dispose();
      f.flashSphere.geometry.dispose(); f.flashSphere.material.dispose();
      activeFlashes.splice(i, 1);
    }
  }
}

// Total mechanical energy (KE + PE). Leapfrog conserves this to within
// a small oscillation â€” we track drift from the initial snapshot.
let e0 = null;
function totalEnergy() {
  let KE = 0, PE = 0;
  for (let i = 0; i < bodies.length; i++) {
    KE += .5 * bodies[i].mass * bodies[i].vel.lengthSq();
    for (let j = i + 1; j < bodies.length; j++) {
      const d = bodies[i].pos.distanceTo(bodies[j].pos);
      if (d > .5) PE -= G * bodies[i].mass * bodies[j].mass / d;
    }
  }
  return KE + PE;
}

// =============================================================
// SCENARIO RECORDER
// Captures body positions and velocities every RECORD_EVERY frames
// into compact Float32 snapshots for playback scrubbing.
// =============================================================

let recording   = false;
let recBodyCount = 0;
let frames      = [];
let playback    = false;
let pbPlaying   = false;
let pbIdx       = 0;
let pbFrame     = 0;
let recTick     = 0;
const RECORD_EVERY = 2;
const RECORD_MAX   = 9000;

function startRecording() {
  if (bodies.length === 0) {
    document.getElementById('recStatus').textContent = 'No bodies to record';
    return;
  }
  frames       = [];
  recBodyCount = bodies.length;
  recording    = true;
  document.getElementById('btnRecord').classList.add('on');
  document.getElementById('btnStopRec').disabled = false;
  document.getElementById('rec-panel').style.display = 'none';
  document.getElementById('recStatus').textContent   = 'Recording...';
  e0 = null;
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  document.getElementById('btnRecord').classList.remove('on');
  document.getElementById('btnStopRec').disabled = true;
  document.getElementById('recStatus').textContent = frames.length + ' frames captured';
  if (frames.length > 0) {
    document.getElementById('rec-panel').style.display = 'block';
    document.getElementById('pbFrames').textContent    = frames.length;
    document.getElementById('pbSlider').max   = frames.length - 1;
    document.getElementById('pbSlider').value = 0;
  }
}

function captureFrame() {
  if (!recording) return;
  if (bodies.length !== recBodyCount) { stopRecording(); return; }
  recTick++;
  if (recTick % RECORD_EVERY !== 0) return;

  const snap = new Float32Array(recBodyCount * 6);
  bodies.forEach((b, i) => {
    snap[i * 6]     = b.pos.x; snap[i * 6 + 1] = b.pos.y; snap[i * 6 + 2] = b.pos.z;
    snap[i * 6 + 3] = b.vel.x; snap[i * 6 + 4] = b.vel.y; snap[i * 6 + 5] = b.vel.z;
  });
  frames.push(snap);
  if (frames.length >= RECORD_MAX) stopRecording();
  document.getElementById('recStatus').textContent = 'Recording... ' + frames.length + ' frames';
}

function enterPlayback() {
  if (!frames.length) return;
  playback  = true;
  pbIdx     = 0;
  pbPlaying = false;
  pbFrame   = 0;
  paused    = true;
  bodies.forEach(b => b.trail = []);
  document.getElementById('btnPlay').textContent = '▶ PLAY';
  seekPb(0);
}

function exitPlayback() {
  playback  = false;
  pbPlaying = false;
  document.getElementById('rec-panel').style.display  = frames.length ? 'block' : 'none';
  document.getElementById('btnPbPlay').textContent = '▶ Play';
}

function seekPb(idx) {
  if (!frames.length || bodies.length !== recBodyCount) return;
  pbIdx = Math.max(0, Math.min(frames.length - 1, idx));
  const snap = frames[pbIdx];
  bodies.forEach((b, i) => {
    b.pos.set(snap[i * 6], snap[i * 6 + 1], snap[i * 6 + 2]);
    b.vel.set(snap[i * 6 + 3], snap[i * 6 + 4], snap[i * 6 + 5]);
  });
  bodies.forEach(b => b.updateVisual());
  document.getElementById('pbSlider').value = pbIdx;
}

// =============================================================
// TRAJECTORY PREDICTION
// Simple Euler integration of a ghost body alongside real bodies
// to give a dashed yellow preview arc during placement/cannon.
// =============================================================

const PRED_STEPS = 900;
const PRED_MAX   = 900;
let predictLine;

(function () {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRED_MAX * 3), 3));
  g.setDrawRange(0, 0);
  predictLine = new THREE.Line(
    g,
    new THREE.LineDashedMaterial({ color: 0xffff00, transparent: true, opacity: .7, dashSize: 8, gapSize: 5 })
  );
  scene.add(predictLine);
})();

function computePrediction(startPos, startVel, mass) {
  // Ghost copies of all existing bodies plus the new one
  const pp = [...bodies.map(b => b.pos.clone()), startPos.clone()];
  const pv = [...bodies.map(b => b.vel.clone()), startVel.clone()];
  const pm = [...bodies.map(b => b.mass), mass];
  const n  = pp.length;
  const pi = n - 1; // index of the ghost body
  const dt = 0.08;
  const pts = [pp[pi].clone()];

  const startPos2 = startPos.clone();
  for (let s = 0; s < PRED_STEPS; s++) {
    // Advance all ghost bodies (so attractors move too)
    for (let i = 0; i < n; i++) {
      const a = new THREE.Vector3();
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const r = new THREE.Vector3().subVectors(pp[j], pp[i]);
        const d = r.length();
        if (d < .5) continue;
        a.addScaledVector(r, G * pm[j] / (d * d * d));
      }
      pv[i].addScaledVector(a, dt);
    }
    for (let i = 0; i < n; i++) pp[i].addScaledVector(pv[i], dt);
    pts.push(pp[pi].clone());
    // stop if body travels too far from its start point or from origin
    if (pp[pi].distanceToSquared(startPos2) > 4e7) break;
    if (pp[pi].lengthSq() > 9e7) break;
  }

  const arr = predictLine.geometry.attributes.position.array;
  const cnt = Math.min(pts.length, PRED_MAX);
  for (let i = 0; i < cnt; i++) {
    arr[i * 3]     = pts[i].x;
    arr[i * 3 + 1] = pts[i].y;
    arr[i * 3 + 2] = pts[i].z;
  }
  predictLine.geometry.attributes.position.needsUpdate = true;
  predictLine.geometry.setDrawRange(0, cnt);
  predictLine.computeLineDistances();
}

function clearPrediction() {
  predictLine.geometry.setDrawRange(0, 0);
}

// =============================================================
// RAYCASTER HELPERS
// =============================================================

const raycaster   = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Convert a mouse event to a point on the Y=0 world plane
function worldFromMouse(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
}

// =============================================================
// PLACEMENT MODE
// Click to set position, drag to aim velocity, release to place.
// =============================================================

let placementMode = false;
let placing       = false;
let placePos      = new THREE.Vector3();
let velArrowMesh  = null;
let placeMarker   = null;

renderer.domElement.addEventListener('mousedown', e => {
  if (!placementMode || e.button !== 0) return;
  e.stopPropagation();
  const wp = worldFromMouse(e);
  if (!wp) return;
  placePos.copy(wp);
  placing = true;

  if (placeMarker) scene.remove(placeMarker);
  placeMarker = new THREE.Mesh(
    new THREE.SphereGeometry(5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
  );
  placeMarker.position.copy(placePos);
  scene.add(placeMarker);
  setStatus('Drag to set launch velocity, release to place');
}, true);

renderer.domElement.addEventListener('mousemove', e => {
  if (!placing && !cannonPlacing) return;
  const wp = worldFromMouse(e);
  if (!wp) return;

  if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
  const origin = cannonPlacing ? cannonPos : placePos;
  const dir    = new THREE.Vector3().subVectors(wp, origin);

  if (dir.length() > 2) {
    velArrowMesh = new THREE.ArrowHelper(
      dir.clone().normalize(), origin,
      Math.min(dir.length(), 60),
      cannonPlacing ? 0x00ff88 : 0xffff00, 10, 6
    );
    scene.add(velArrowMesh);
    computePrediction(origin, dir.clone().multiplyScalar(VEL_SCALE), getMass());
  } else {
    clearPrediction();
  }
}, true);

renderer.domElement.addEventListener('mouseup', e => {
  if (e.button !== 0) return;

  if (placing) {
    placing       = false;
    placementMode = false;
    document.getElementById('btnAdd').classList.remove('on');

    const wp  = worldFromMouse(e);
    const vel = wp
      ? new THREE.Vector3().subVectors(wp, placePos).multiplyScalar(VEL_SCALE)
      : new THREE.Vector3();

    bodies.push(new Body(
      placePos.clone(), vel,
      getMass(),
      document.getElementById('sColor').value,
      _selectedPreset ? _selectedPreset.n : 'Body ' + (++_bodyN),
      getBodySize()
    ));
    initAccelerations();
    updateList();
    setStatus('Body placed!');

    if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
    if (placeMarker)  { scene.remove(placeMarker);  placeMarker  = null; }
    clearPrediction();
  }

}, true);

function exitCannon() {
  if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
  clearPrediction();
  setStatus('Ready');
}

// =============================================================
// BODY SELECTION & HOVER TOOLTIP
// =============================================================

const bodyRay = new THREE.Raycaster();

function trySelectBody(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  bodyRay.setFromCamera(ndc, camera);
  const hits = bodyRay.intersectObjects(bodies.map(b => b.mesh), false);
  if (hits.length) {
    const b = bodies.find(b => b.mesh === hits[0].object);
    if (e.shiftKey) {
      // Shift+click: toggle this body in the multi-select set
      if (selectedBodies.has(b)) {
        selectedBodies.delete(b);
        if (selectedBodies.size === 0) selectBody(null);
        else updateList();
      } else {
        selectedBodies.add(b);
        selectedBody = b; // most-recently-added is the "primary"
        updateList(); updateLockBtn();
      }
    } else {
      selectedBodies.clear();
      selectBody(b === selectedBody ? null : b);
    }
    return true;
  }
  if (!e.shiftKey) {
    selectedBodies.clear();
    selectBody(null);
  }
  return false;
}

function selectBody(b) {
  selectedBody = b;
  const tp = document.getElementById('thrust-panel');
  if (b) {
    tp.style.display = 'block';
    document.getElementById('tp-name').textContent = b.name;
  } else {
    tp.style.display = 'none';
  }
  updateList();
  updateLockBtn();
}

const tip = document.getElementById('hover-tip');
window.addEventListener('mousemove', e => {
  if (placing || placementMode || cannonMode) { tip.style.display = 'none'; return; }

  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    -((e.clientY - rect.top)  / rect.height) *  2 + 1
  );
  bodyRay.setFromCamera(ndc, camera);
  const hits = bodyRay.intersectObjects(bodies.map(b => b.mesh), false);

  if (hits.length) {
    const b = bodies.find(b => b.mesh === hits[0].object);
    const t = tierFromMass(b.mass);
    document.getElementById('ht-name').textContent = b.name;
    document.getElementById('ht-type').textContent = t.emoji + ' ' + t.label + ' · mass ' + b.mass.toExponential(1);
    document.getElementById('ht-vel').textContent  = '⚡ speed ' + b.vel.length().toFixed(1);
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY - 10) + 'px';
  } else {
    tip.style.display = 'none';
  }
});

// =============================================================
// BODY PRESETS & UI HELPERS
// =============================================================

const BODY_PRESETS = [
  { n: 'Asteroid',   e: '&#x1FA68;', mass: 100,    r:  3, col: '#888888', d: 'Rocky'       },
  { n: 'Moon',       e: '&#x1F315;', mass: 400,    r:  5, col: '#ccccaa', d: 'Rocky'       },
  { n: 'Mars',       e: '&#x1F534;', mass: 600,    r:  6, col: '#cc4422', d: 'Rocky'       },
  { n: 'Earth',      e: '&#x1F30E;', mass: 900,    r:  7, col: '#4477ff', d: 'Rocky'       },
  { n: 'Neptune',    e: '&#x1F535;', mass: 3000,   r: 10, col: '#3355dd', d: 'Ice Giant'   },
  { n: 'Saturn',     e: '&#x1FA90;', mass: 7000,   r: 14, col: '#ddbb77', d: 'Gas Giant'   },
  { n: 'Jupiter',    e: '&#x1F300;', mass: 10000,  r: 16, col: '#cc8855', d: 'Gas Giant'   },
  { n: 'Red Dwarf',  e: '&#x2764;',  mass: 200000, r: 18, col: '#ff4422', d: 'Stellar'     },
  { n: 'Sun',        e: '&#x2600;',  mass: 600000, r: 26, col: '#ffee44', d: 'Stellar'     },
  { n: 'Giant Star', e: '&#x1F31F;', mass: 800000, r: 36, col: '#ffaa22', d: 'Stellar'     },
  { n: 'Neutron *',  e: '&#x26A1;',  mass: 850000, r:  4, col: '#aaddff', d: 'Ultra-Dense' },
  { n: 'Black Hole', e: '&#x26AB;',  mass: 1000000,r:  2, col: '#330044', d: 'Singularity' },
];

function densityLabel(mass, r) {
  const d = mass / (r * r * r);
  if (d > 5000) return 'Singularity';
  if (d > 500)  return 'Ultra-Dense';
  if (d > 50)   return 'Compact';
  if (d > 5)    return 'Stellar';
  if (d > 2)    return 'Rocky';
  if (d > 0.5)  return 'Ice/Gas';
  return 'Gas Cloud';
}

function syncDensityTag() {
  const mass = getMass();
  const r    = +document.getElementById('sSize').value;
  document.getElementById('densityTag').textContent = 'Density: ' + densityLabel(mass, r);
}

// Exponential mass scale: slider 1â†’100 maps to mass 100â†’1,000,000
function getMass() {
  const v = +document.getElementById('sMass').value;
  return Math.round(Math.pow(10, 2 + (v - 1) / 99 * 4));
}

function getBodySize() {
  return +document.getElementById('sSize').value;
}

function fmtMass(m) {
  if (m >= 1e6) return (m / 1e6).toFixed(2) + 'M';
  if (m >= 1e3) return (m / 1e3).toFixed(1) + 'k';
  return m.toFixed(0);
}

function updateLockBtn() {
  const btn = document.getElementById('btnLockOn');
  if (followBody && followBody === selectedBody) {
    btn.disabled = false; btn.style.opacity = '1';
    btn.textContent = 'ðŸ”“ Unlock'; btn.classList.add('on');
  } else if (selectedBody) {
    btn.disabled = false; btn.style.opacity = '1';
    btn.textContent = 'ðŸŽ¯ Lock On'; btn.classList.remove('on');
  } else {
    btn.disabled = true; btn.style.opacity = '0.35';
    btn.textContent = 'ðŸŽ¯ Lock On'; btn.classList.remove('on');
  }
}

let _selectedPreset = null;
let _bodyN          = 0; // counter for auto-naming non-preset bodies
let _debrisN        = 0; // counter for debris fragment names

// Build the 3Ã—4 preset tile grid in the sidebar
(function () {
  const grid = document.getElementById('presetGrid');
  BODY_PRESETS.forEach((p, i) => {
    const t = document.createElement('div');
    t.className   = 'ptile';
    t.dataset.i   = i;
    t.innerHTML   = `<span class="pe">${p.e}</span><span class="pn">${p.n}</span>`;
    t.addEventListener('click', () => {
      document.querySelectorAll('.ptile').forEach(x => x.classList.remove('sel'));
      t.classList.add('sel');
      _selectedPreset = p;
      // Back-calculate the slider value from the preset's mass
      const v = Math.max(1, Math.min(100, Math.round(1 + (Math.log10(p.mass / 100) / 4) * 99)));
      document.getElementById('sMass').value   = v;
      document.getElementById('vMass').textContent = fmtMass(p.mass);
      document.getElementById('sSize').value   = p.r;
      document.getElementById('vSize').textContent = p.r;
      document.getElementById('sColor').value  = p.col;
      syncDensityTag();
    });
    grid.appendChild(t);
  });
})();

// Rebuild the body list panel
function updateList() {
  document.getElementById('nBodies').textContent = bodies.length;
  const multiBar = document.getElementById('multiselect-bar');
  if (selectedBodies.size > 1) {
    multiBar.style.display = 'block';
    document.getElementById('ms-count').textContent = selectedBodies.size + ' selected';
  } else {
    multiBar.style.display = 'none';
  }
  document.getElementById('body-list').innerHTML = bodies.map(b => {
    const inMulti = selectedBodies.has(b);
    const isSel   = b === selectedBody || inMulti;
    return `
    <div class="bitem${isSel ? ' sel' : ''}${inMulti && selectedBodies.size > 1 ? ' multi' : ''}">
      <div class="bdot" style="background:${b.color}"></div>
      <span class="bname" onclick="renameBody('${b.id}')">${b.name}</span>
      <button class="bb thr" onclick="selectBodyById('${b.id}')">${b === selectedBody ? '&#x2713;' : '&#x1F680;'}</button>
      <button class="bb fol" onclick="followBodyById('${b.id}')">${b === followBody ? '&#x1F4CD;' : '&#x1F441;'}</button>
      <button class="bb del" onclick="removeBody('${b.id}')">&#x2715;</button>
    </div>`;
  }).join('');
}

// These are called by inline onclick attributes in the body list HTML
window.removeBody = id => {
  const i = bodies.findIndex(b => b.id === id);
  if (i < 0) return;
  if (selectedBody === bodies[i]) selectBody(null);
  if (followBody   === bodies[i]) {
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
  }
  bodies[i].remove();
  bodies.splice(i, 1);
  if (recording && bodies.length !== recBodyCount) stopRecording();
  updateList();
};

window.renameBody = id => {
  const b = bodies.find(b => b.id === id);
  if (!b) return;
  const n = prompt('Rename:', b.name);
  if (n && n.trim()) { b.name = n.trim(); updateList(); }
};

window.selectBodyById = id => {
  const b = bodies.find(b => b.id === id);
  selectBody(b === selectedBody ? null : b);
};

window.followBodyById = id => {
  const b = bodies.find(b => b.id === id);
  followBody = b === followBody ? null : b;
  document.getElementById('btnFollowOff').style.display = followBody ? 'block' : 'none';
  updateList();
  updateLockBtn();
};

// =============================================================
// EVENT LISTENERS â€” sidebar controls
// =============================================================

document.getElementById('sMass').addEventListener('input', function () {
  document.getElementById('vMass').textContent = fmtMass(getMass());
  // Deselect preset tile when mass is manually adjusted
  document.querySelectorAll('.ptile').forEach(x => x.classList.remove('sel'));
  _selectedPreset = null;
  syncDensityTag();
});

document.getElementById('sSize').addEventListener('input', function () {
  document.getElementById('vSize').textContent = this.value;
  syncDensityTag();
});

document.getElementById('btnAdd').addEventListener('click', () => {
  exitCannon();
  placementMode = !placementMode;
  placing       = false;
  document.getElementById('btnAdd').classList.toggle('on', placementMode);
  setStatus(placementMode)
    ? 'Click in space to set position'
    : 'Cancelled.';
  if (velArrowMesh) { scene.remove(velArrowMesh); velArrowMesh = null; }
  if (placeMarker)  { scene.remove(placeMarker);  placeMarker  = null; }
  clearPrediction();
});


document.getElementById('btnPlay').addEventListener('click', () => {
  if (playback) return;
  paused = !paused;
  document.getElementById('btnPlay').textContent = paused ? '▶ PLAY' : '⏸ PAUSE';
});

document.getElementById('btnStep').addEventListener('click', () => {
  if (paused && !playback) {
    applyThrust(0.018 * (reversed ? -1 : 1));
    stepLeapfrog(0.018 * (reversed ? -1 : 1));
    checkCollisions();
    bodies.forEach(b => b.updateVisual());
  }
});

document.getElementById('btnReverse').addEventListener('click', () => {
  reversed = !reversed;
  document.getElementById('btnReverse').classList.toggle('on', reversed);
  document.getElementById('btnReverse').textContent = reversed ? '◀ REVERSED' : '◀ REVERSE';
});

document.getElementById('btnVectors').addEventListener('click', () => {
  showVectors = !showVectors;
  document.getElementById('btnVectors').classList.toggle('on', showVectors);
});

document.getElementById('btnLabels').addEventListener('click', () => {
  showLabels = !showLabels;
  document.getElementById('btnLabels').classList.toggle('on', showLabels);
});

document.getElementById('btnTrails').addEventListener('click', () => {
  showTrails = !showTrails;
  document.getElementById('btnTrails').classList.toggle('on', showTrails);
  if (!showTrails) bodies.forEach(b => { b.trail = []; b.trailLine.geometry.setDrawRange(0, 0); });
});

document.getElementById('btnPotential').addEventListener('click', () => {
  showPotential = !showPotential;
  gwUni.gwEnabled.value = showPotential ? 1.0 : 0.0;
  document.getElementById('btnPotential').classList.toggle('on', showPotential);
});

document.getElementById('sGwDetail').addEventListener('input', function () {
  // 0% = threshold 100000 (tiny wells), 70% = ~71 (detailed default), 100% = ~3 (enormous, laggy)
  gwThresh = Math.pow(10, 5 - +this.value * 0.045);
  gwUni.gwThresh.value = gwThresh;
  const pct = +this.value;
  document.getElementById('vGwDetail').textContent = pct + '%';
  document.getElementById('gwWarn').style.display  = pct >= 85 ? 'block' : 'none';
});

document.getElementById('sGridAlpha').addEventListener('input', function () {
  // 0â€“100 maps to 0â€“3.0 so lines can fully saturate to white at high values
  gwUni.gridAlpha.value = +this.value / 100 * 3.0;
  document.getElementById('vGridAlpha').textContent = this.value + '%';
});

document.getElementById('sGridFreq').addEventListener('input', function () {
  // 0% = coarse (~400 units), 50% = default (100/20), 100% = fine (~25/5)
  const maj = Math.pow(10, 2.6 - +this.value * 0.012);
  gwUni.gridMajor.value = maj;
  gwUni.gridMinor.value = maj / 5;
  document.getElementById('vGridFreq').textContent = this.value + '%';
});

document.getElementById('btnLockOn').addEventListener('click', () => {
  if (!selectedBody) return;
  if (followBody === selectedBody) {
    followBody = null;
    document.getElementById('btnFollowOff').style.display = 'none';
  } else {
    followBody = selectedBody;
    document.getElementById('btnFollowOff').style.display = 'block';
  }
  updateLockBtn();
  updateList();
});

document.getElementById('btnOrigin').addEventListener('click', centerOnOrigin);

document.getElementById('btnCoMLock').addEventListener('click', () => {
  lockCoM = !lockCoM;
  document.getElementById('btnCoMLock').classList.toggle('on', lockCoM);
});

document.getElementById('btnFollowOff').addEventListener('click', () => {
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  updateList();
});

document.getElementById('sSpeed').addEventListener('input', function () {
  simSpeed = Math.pow(10, +this.value);
  document.getElementById('vSpeed').textContent    = simSpeed.toFixed(simSpeed < 10 ? 2 : 0) + 'x';
  document.getElementById('speedWarn').style.display = simSpeed >= 50 ? 'block' : 'none';
});

document.getElementById('sTrail').addEventListener('input', function () {
  trailLen = +this.value;
  document.getElementById('vTrail').textContent = trailLen;
});

document.getElementById('sThrust').addEventListener('input', function () {
  document.getElementById('vThrust').textContent = this.value;
});

document.getElementById('btnClear').addEventListener('click', () => {
  clearAll();
  setStatus('Cleared.');
});

// â”€â”€ Multi-select bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('ms-delete').addEventListener('click', () => {
  const toRemove = [...selectedBodies];
  selectedBodies.clear();
  selectBody(null);
  toRemove.forEach(b => {
    const i = bodies.indexOf(b);
    if (i < 0) return;
    if (followBody === b) { followBody = null; document.getElementById('btnFollowOff').style.display = 'none'; }
    b.remove();
    bodies.splice(i, 1);
  });
  if (recording && bodies.length !== recBodyCount) stopRecording();
  initAccelerations();
  updateList();
});
document.getElementById('ms-clear').addEventListener('click', () => {
  selectedBodies.clear();
  selectBody(null);
});

// â”€â”€ Recorder controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnRecord').addEventListener('click', startRecording);
document.getElementById('btnStopRec').addEventListener('click', stopRecording);

document.getElementById('btnPbPlay').addEventListener('click', () => {
  if (!playback) enterPlayback();
  pbPlaying = !pbPlaying;
  document.getElementById('btnPbPlay').textContent = pbPlaying ? '⏸ Pause' : '▶ Play';
});

document.getElementById('btnPbExit').addEventListener('click', exitPlayback);
document.getElementById('pbSlider').addEventListener('input', function () { seekPb(+this.value); });

// â”€â”€ Save / Load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('btnSave').addEventListener('click', () => {
  const data = {
    simTime,
    bodies: bodies.map(b => ({
      pos:   { x: b.pos.x, y: b.pos.y, z: b.pos.z },
      vel:   { x: b.vel.x, y: b.vel.y, z: b.vel.z },
      mass:  b.mass,
      color: b.color,
      name:  b.name,
    })),
  };
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'orbit_save.json';
  a.click();
});

document.getElementById('btnLoad').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function () {
  if (!this.files.length) return;
  const fr = new FileReader();
  fr.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      clearAll();
      simTime = d.simTime || 0;
      for (const bd of d.bodies) {
        bodies.push(new Body(
          new THREE.Vector3(bd.pos.x, bd.pos.y, bd.pos.z),
          new THREE.Vector3(bd.vel.x, bd.vel.y, bd.vel.z),
          bd.mass, bd.color, bd.name
        ));
      }
      e0 = null;
      initAccelerations();
      updateList();
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  };
  fr.readAsText(this.files[0]);
  this.value = '';
});

// =============================================================
// SCENARIO PRESETS
// =============================================================

function clearAll() {
  bodies.forEach(b => b.remove());
  bodies   = [];
  simTime  = 0;
  e0       = null;
  selectedBodies.clear();
  selectBody(null);
  followBody = null;
  document.getElementById('btnFollowOff').style.display = 'none';
  stopRecording();
  frames = [];
  document.getElementById('rec-panel').style.display   = 'none';
  document.getElementById('recStatus').textContent     = 'Ready';
  updateList();
}

// Circular orbital speed for a test body orbiting mass M at radius r
function orbV(M, r) { return Math.sqrt(G * M / r); }

document.getElementById('pBinary').addEventListener('click', () => {
  clearAll();
  const m = 6000, r = 160;
  const v = Math.sqrt(G * m / (4 * r)); // mutual orbit speed (center-of-mass frame)
  bodies.push(new Body(new THREE.Vector3(-r, 0,  0), new THREE.Vector3(0, 0,  v), m, '#ff7744', 'Alpha'));
  bodies.push(new Body(new THREE.Vector3( r, 0,  0), new THREE.Vector3(0, 0, -v), m, '#4488ff', 'Beta'));
  initAccelerations(); updateList();
  setStatus('Binary stars - stable mutual orbit');
});

document.getElementById('pSolar').addEventListener('click', () => {
  clearAll();
  const SM = 60000;
  bodies.push(new Body(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), SM, '#ffee44', 'Sun'));
  for (const p of [
    { r:  80, m:  30, col: '#bbbbbb', name: 'Mercury' },
    { r: 130, m:  80, col: '#ffaa55', name: 'Venus'   },
    { r: 185, m: 100, col: '#4477ff', name: 'Earth'   },
    { r: 260, m:  50, col: '#ff5533', name: 'Mars'    },
  ]) {
    const v = orbV(SM, p.r);
    bodies.push(new Body(new THREE.Vector3(p.r, 0, 0), new THREE.Vector3(0, 0, -v), p.m, p.col, p.name));
  }
  initAccelerations(); updateList();
  setStatus('Inner Solar System (scaled)');
});

document.getElementById('pFigure8').addEventListener('click', () => {
  clearAll();
  const m  = 2000, L = 110;
  const vS = Math.sqrt(G * m / L);
  // Known stable figure-8 initial conditions (Chenciner & Montgomery 2000)
  const px  = [-0.97000436, 0,             0.97000436];
  const pz  = [ 0.24308753, 0,            -0.24308753];
  const vx0 = 0.93240737 / 2, vz0 = 0.86473146 / 2;
  const vxA = [vx0, -2 * vx0, vx0];
  const vzA = [vz0, -2 * vz0, vz0];
  [['#ff4455', 'Body A'], ['#44ff66', 'Body B'], ['#4455ff', 'Body C']].forEach(([col, name], i) => {
    bodies.push(new Body(
      new THREE.Vector3(px[i] * L, 0, pz[i] * L),
      new THREE.Vector3(vxA[i] * vS, 0, vzA[i] * vS),
      m, col, name
    ));
  });
  initAccelerations(); updateList();
  setStatus('Figure-8 three-body choreography');
});

document.getElementById('pHohmann').addEventListener('click', () => {
  clearAll();
  const SM = 60000, r1 = 185, r2 = 340;
  bodies.push(new Body(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0), SM, '#ffee44', 'Sun'));

  // Vis-viva launch speed for the transfer ellipse periapsis
  const vT = Math.sqrt(G * SM * 2 * r2 / (r1 * (r1 + r2)));
  bodies.push(new Body(new THREE.Vector3(r1, 0, 0), new THREE.Vector3(0, 0, -vT), 5, '#ffff00', 'Transfer Ship'));

  // Place Mars so it arrives at apoapsis (Î¸=Ï€) when the ship arrives
  const a_tr  = (r1 + r2) / 2;
  const T_tr  = Math.PI * Math.sqrt(a_tr * a_tr * a_tr / (G * SM)); // half-period
  const v2    = orbV(SM, r2);
  const omM   = v2 / r2;
  const mTheta = Math.PI - omM * T_tr;
  bodies.push(new Body(
    new THREE.Vector3(r2 * Math.cos(mTheta), 0, -r2 * Math.sin(mTheta)),
    new THREE.Vector3(-v2 * Math.sin(mTheta), 0, -v2 * Math.cos(mTheta)),
    60, '#ff5533', 'Mars'
  ));
  initAccelerations(); updateList();
  setStatus('Ship launches from Earth orbit - watch it arc out to meet Mars');
});

document.getElementById('pLagrange').addEventListener('click', () => {
  clearAll();
  const SM = 60000, JM = 600, r = 250;
  const omega = Math.sqrt(G * (SM + JM) / (r * r * r));
  const sunX  = -r * JM / (SM + JM);
  const jupX  =  r * SM / (SM + JM);

  bodies.push(new Body(new THREE.Vector3(sunX, 0, 0), new THREE.Vector3(0, 0, -sunX * omega), SM, '#ffee44', 'Sun'));
  bodies.push(new Body(new THREE.Vector3(jupX, 0, 0), new THREE.Vector3(0, 0, -jupX * omega), JM, '#ff8844', 'Jupiter'));

  // Trojans at L4 (+60deg) and L5 (-60deg), slightly scattered
  for (const [theta, col, lname] of [
    [ Math.PI / 3, '#55ffff', 'L4 Trojan'],
    [-Math.PI / 3, '#ff55ff', 'L5 Trojan'],
  ]) {
    for (let k = 0; k < 5; k++) {
      const pr  = r * (0.97 + Math.random() * .06);
      const pa  = theta + (Math.random() - .5) * .1;
      const tx  = pr * Math.cos(pa);
      const tz  = -pr * Math.sin(pa);
      const jit = (Math.random() - .5) * .3;
      bodies.push(new Body(
        new THREE.Vector3(tx, 0, tz),
        new THREE.Vector3(omega * tz + jit, 0, -omega * tx + jit),
        8, col, lname + ' ' + (k + 1)
      ));
    }
  }
  initAccelerations(); updateList();
  setStatus('Sun + Jupiter + Trojan asteroids at L4/L5');
});

document.getElementById('pTidal').addEventListener('click', () => {
  clearAll();

  // Central black hole
  const BH_MASS = 950000;
  bodies.push(new Body(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    BH_MASS, '#220033', 'Black Hole'
  ));

  // Star on a highly elliptical orbit starting at apoapsis (far end).
  // BH _r â‰ˆ 54, star _r â‰ˆ 4.4 â†’ Roche â‰ˆ 68 units.
  // periR = 62: inside Roche limit but outside physical contact (~47),
  // so disruption fires on the first close pass.
  const starMass = 500;
  const periR    = 62;
  const apoR     = 700;
  const a        = (periR + apoR) / 2;
  // vis-viva velocity at apoapsis
  const vApo     = Math.sqrt(G * BH_MASS * (2 / apoR - 1 / a));
  bodies.push(new Body(
    new THREE.Vector3(-apoR, 0, 0),
    new THREE.Vector3(0, 0, vApo),
    starMass, '#ffcc44', 'Doomed Star'
  ));

  // A second star on a wide, stable circular orbit â€” survives for contrast
  const safeR = 850;
  const vSafe = Math.sqrt(G * BH_MASS / safeR);
  bodies.push(new Body(
    new THREE.Vector3(safeR, 0, 0),
    new THREE.Vector3(0, 0, -vSafe),
    800, '#44aaff', 'Safe Star'
  ));

  initAccelerations(); updateList();
  setStatus('Tidal Disruption - watch the Doomed Star pass the black hole');
});

// =============================================================
// MINIMAP
// 2D canvas overlay showing a top-down view of all bodies with
// trails, colour-coded dots, and a camera-target crosshair.
// =============================================================

const minimapCanvas = document.createElement('canvas');
minimapCanvas.id    = 'minimap';
minimapCanvas.width = minimapCanvas.height = 190;
Object.assign(minimapCanvas.style, {
  position: 'fixed', bottom: '10px', left: '285px',
  width: '190px', height: '190px', zIndex: '10', pointerEvents: 'none',
});
document.body.appendChild(minimapCanvas);
const mmCtx = minimapCanvas.getContext('2d');

function updateMinimap() {
  const W = minimapCanvas.width, H = minimapCanvas.height;
  mmCtx.clearRect(0, 0, W, H);

  // Dark background
  mmCtx.fillStyle = 'rgba(0,8,18,0.88)';
  mmCtx.fillRect(0, 0, W, H);
  mmCtx.strokeStyle = 'rgba(0,255,255,0.25)';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // "MAP" label
  mmCtx.fillStyle = 'rgba(0,255,255,0.3)';
  mmCtx.font = '8px Courier New';
  mmCtx.fillText('MAP', 6, 13);

  if (!bodies.length) return;

  // Compute bounds to auto-fit all bodies
  let minX =  Infinity, maxX = -Infinity;
  let minZ =  Infinity, maxZ = -Infinity;
  for (const b of bodies) {
    minX = Math.min(minX, b.pos.x); maxX = Math.max(maxX, b.pos.x);
    minZ = Math.min(minZ, b.pos.z); maxZ = Math.max(maxZ, b.pos.z);
  }
  const pad   = 60;
  const range = Math.max(maxX - minX + pad * 2, maxZ - minZ + pad * 2, 200);
  const cx    = (minX + maxX) / 2;
  const cz    = (minZ + maxZ) / 2;
  const scale = (W - 24) / range;
  const toMM  = (x, z) => ({
    sx: W / 2 + (x - cx) * scale,
    sy: H / 2 + (z - cz) * scale,
  });

  // Origin crosshair
  const o = toMM(0, 0);
  mmCtx.strokeStyle = 'rgba(255,255,255,0.12)';
  mmCtx.lineWidth = 0.5;
  mmCtx.beginPath();
  mmCtx.moveTo(o.sx - 5, o.sy); mmCtx.lineTo(o.sx + 5, o.sy);
  mmCtx.moveTo(o.sx, o.sy - 5); mmCtx.lineTo(o.sx, o.sy + 5);
  mmCtx.stroke();

  // Trails
  if (showTrails) {
    for (const b of bodies) {
      if (b.trail.length < 2) continue;
      mmCtx.strokeStyle = b.color + '55';
      mmCtx.lineWidth   = 0.6;
      mmCtx.beginPath();
      let first = true;
      for (let i = 0; i < b.trail.length; i += 4) { // stride 4 for performance
        const { sx, sy } = toMM(b.trail[i].x, b.trail[i].z);
        first ? mmCtx.moveTo(sx, sy) : mmCtx.lineTo(sx, sy);
        first = false;
      }
      mmCtx.stroke();
    }
  }

  // Body dots
  for (const b of bodies) {
    const { sx, sy } = toMM(b.pos.x, b.pos.z);
    const r = Math.max(2, Math.min(7, b._r * scale * 0.6));

    // Soft glow halo
    const grad = mmCtx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
    grad.addColorStop(0, b.color + 'aa');
    grad.addColorStop(1, b.color + '00');
    mmCtx.fillStyle = grad;
    mmCtx.beginPath(); mmCtx.arc(sx, sy, r * 3, 0, Math.PI * 2); mmCtx.fill();

    // Solid dot
    mmCtx.fillStyle = b.color;
    mmCtx.beginPath(); mmCtx.arc(sx, sy, r, 0, Math.PI * 2); mmCtx.fill();

    // Selection highlight
    if (b === selectedBody) {
      mmCtx.strokeStyle = '#ffaa00';
      mmCtx.lineWidth = 1.2;
      mmCtx.beginPath(); mmCtx.arc(sx, sy, r + 2.5, 0, Math.PI * 2); mmCtx.stroke();
    }
  }

  // Camera target crosshair
  const cam = toMM(orbitTarget.x, orbitTarget.z);
  mmCtx.strokeStyle = 'rgba(0,255,255,0.6)';
  mmCtx.lineWidth   = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(cam.sx - 6, cam.sy); mmCtx.lineTo(cam.sx + 6, cam.sy);
  mmCtx.moveTo(cam.sx, cam.sy - 6); mmCtx.lineTo(cam.sx, cam.sy + 6);
  mmCtx.stroke();
}

// =============================================================
// RENDER LOOP
// =============================================================

let lastT = performance.now();
let fps   = 60;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  fps = fps * .92 + (1000 / (now - lastT)) * .08;
  lastT = now;

  // â”€â”€ Playback scrubbing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (playback) {
    if (pbPlaying) {
      pbFrame++;
      if (pbFrame % 2 === 0) {
        seekPb(pbIdx + 1);
        if (pbIdx >= frames.length - 1) {
          pbPlaying = false;
          document.getElementById('btnPbPlay').textContent = '▶ Play';
        }
      }
    }

  // â”€â”€ Physics tick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  } else if (!paused && bodies.length > 0) {
    const dir     = reversed ? -1 : 1;
    const maxDt   = 0.05;
    const totalDt = 0.0009 * simSpeed;
    // Sub-step count scales with sim speed to keep per-step dt â‰¤ maxDt
    const steps  = Math.max(1, Math.min(400, Math.ceil(totalDt / maxDt)));
    const baseDt = totalDt / steps * dir;

    for (let s = 0; s < steps; s++) {
      applyThrust(baseDt);
      stepLeapfrog(baseDt);
      // Check collisions every sub-step so merges happen before gravity
      // can corrupt velocities during overlap (tunneling fix)
      if (checkCollisions()) break;
    }
    captureFrame();
    bodies.forEach(b => b.updateVisual());
  }

  // â”€â”€ Camera follow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (followBody && !playback) {
    orbitTarget.copy(followBody.pos);
    orbitUpdate();
  } else if (lockCoM && bodies.length >= 2 && !playback) {
    orbitTarget.copy(computeCoM());
    orbitUpdate();
  }

  // â”€â”€ Grid uniforms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // camPos drives the distance-fade in both grid fragment shaders
  gwUni.camPos.value.copy(camera.position);
  _gridBgMat.uniforms.camPos.value.copy(camera.position);

  // Snap the displacement grid to the orbit target in 100-unit steps
  // so it always centres on whatever the camera is looking at
  const _snap = 100;
  _gridMesh.position.set(
    Math.round(orbitTarget.x / _snap) * _snap,
    0,
    Math.round(orbitTarget.z / _snap) * _snap
  );

  // Push body positions and masses into the vertex shader uniforms
  for (let i = 0; i < GW_MAX_B; i++) {
    if (i < bodies.length) {
      gwUni.bPos.value[i].copy(bodies[i].pos);
      gwUni.bMass.value[i] = bodies[i].mass;
    } else {
      gwUni.bMass.value[i] = 0;
    }
  }
  gwUni.bMass.needsUpdate = true;

  // â”€â”€ CoM marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const com = computeCoM();
  if (bodies.length >= 2) {
    comMesh.position.copy(com);  comMesh.visible  = true;
    comLines.position.copy(com); comLines.visible = true;
    document.getElementById('oCoM').textContent = `(${com.x.toFixed(0)},${com.z.toFixed(0)})`;
  } else {
    comMesh.visible  = false;
    comLines.visible = false;
    document.getElementById('oCoM').textContent = '--';
  }

  // â”€â”€ Energy drift readout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (bodies.length >= 2) {
    const e = totalEnergy();
    if (e0 === null) e0 = e;
    const drift = e0 !== 0 ? Math.abs((e - e0) / e0) * 100 : 0;
    document.getElementById('oEnergy').textContent = drift.toFixed(2) + '%';
  } else {
    e0 = null;
    document.getElementById('oEnergy').textContent = '--';
  }

  // â”€â”€ HUD text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  document.getElementById('simtime').textContent =
    `T = ${(simTime / 1000).toFixed(2)}${reversed ? ' â—€' : ''}${playback ? ' [PB]' : ''}`;
  document.getElementById('oBodies').textContent = bodies.length;
  document.getElementById('oFps').textContent    = fps.toFixed(0);

  nebulaUni.uTime.value += 1;
  updateFlashes();
  updateMinimap();
  updateWorldLabels();
  renderer.render(scene, camera);
}

const _labelOriginEl = document.getElementById('label-origin');
const _labelComEl    = document.getElementById('label-com');
const _originPos     = new THREE.Vector3(0, 0, 0);

function updateWorldLabels() {
  function projectToScreen(worldPos, el) {
    const v = worldPos.clone().project(camera);
    if (v.z > 1) { el.style.display = 'none'; return; } // behind camera
    const x = (v.x *  0.5 + 0.5) * innerWidth;
    const y = (v.y * -0.5 + 0.5) * innerHeight;
    el.style.display = 'block';
    el.style.left    = x + 'px';
    el.style.top     = y + 'px';
  }

  projectToScreen(_originPos, _labelOriginEl);

  if (bodies.length >= 2) {
    projectToScreen(computeCoM(), _labelComEl);
  } else {
    _labelComEl.style.display = 'none';
  }
}

// â”€â”€ Initialise UI readouts and start the loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.getElementById('vMass').textContent  = fmtMass(getMass());
document.getElementById('vSize').textContent  = document.getElementById('sSize').value;
document.getElementById('vSpeed').textContent = '1.00x';
syncDensityTag();
updateLockBtn();
animate();
