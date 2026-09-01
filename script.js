"use strict";

// ================================================================
//  BUBBLE BLAST — Complete Game Logic
//  All game mechanics, rendering, audio, input handling and UI.
//  ================================================================

// ─── DOM REFERENCES ──────────────────────────────────────────────
const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d');
const aimCanvas = document.getElementById('ac');
const aimCtx = aimCanvas.getContext('2d');
const nextCanvas = document.getElementById('nc');
const nextCtx = nextCanvas.getContext('2d');
const currentCanvas = document.getElementById('cc');
const currentCtx = currentCanvas.getContext('2d');

const retryBtn = document.getElementById('btn-retry');
const homeBtn = document.getElementById('btn-home');
const musicBtn = document.getElementById('btn-music');
const musicSlider = document.getElementById('music-slider');
const menuToggle = document.getElementById('menu-toggle');
const menuClose = document.getElementById('menu-close');
const menuOverlay = document.getElementById('menu-overlay');
const menuResume = document.getElementById('menu-resume');
const menuNewGame = document.getElementById('menu-newgame');
const menuHow = document.getElementById('menu-how');
const menuSoundToggle = document.getElementById('menu-sound-toggle');
const menuSoundSlider = document.getElementById('menu-sound-slider');
const menuSound = document.getElementById('menu-sound');
const menuSoundIcon = document.getElementById('menu-sound-icon');
const menuSoundLabel = document.getElementById('menu-sound-label');
const menuBestBadge = document.getElementById('menu-best-badge');
const menuDrawer = document.getElementById('menu-drawer');
const helpModal = document.getElementById('help-modal');
const helpBackdrop = document.getElementById('help-backdrop');
const helpClose = document.getElementById('help-close');
const helpCloser = document.getElementById('help-closer');

const scoreEl = document.getElementById('h-score');
const levelEl = document.getElementById('h-level');
const progressBar = document.getElementById('progress-bar');
const overSub = document.getElementById('over-sub');
const overSc = document.getElementById('over-sc');
const overBest = document.getElementById('over-best');
const levelKicker = document.getElementById('level-kicker');
const levelSub = document.getElementById('level-sub');
const upgradeRow = document.getElementById('upgrade-row');
const levelComplete = document.getElementById('ov-level');
const gameOver = document.getElementById('ov-over');

const touchZone = document.getElementById('tz');

// ─── AUDIO ENGINE ──────────────────────────────────────────────
const SOUND_KEY = 'bb_sound_v1';
let audioCtx = null;
let masterGain = null;
let soundVolume = 0.8;
let lastSoundVolume = 0.8;
let soundMuted = false;

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

function loadSoundSettings() {
    try {
        const raw = localStorage.getItem(SOUND_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved.volume === 'number' && isFinite(saved.volume)) {
            soundVolume = clamp01(saved.volume);
            if (soundVolume > 0) lastSoundVolume = soundVolume;
        }
        if (typeof saved.muted === 'boolean') {
            soundMuted = saved.muted;
        }
        if (soundVolume <= 0) soundMuted = true;
    } catch (_) { }
}

function saveSoundSettings() {
    try {
        localStorage.setItem(SOUND_KEY, JSON.stringify({
            volume: soundVolume,
            muted: soundMuted,
        }));
    } catch (_) { }
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    updateMasterGain();
}

function effectiveSoundLevel() {
    return soundMuted ? 0 : soundVolume;
}

function updateMasterGain() {
    if (!audioCtx || !masterGain) return;
    masterGain.gain.setTargetAtTime(effectiveSoundLevel(), audioCtx.currentTime, 0.015);
}

// Play a single tone with optional glide
function playTone(freq, type, dur, vol = 0.15, glide = null) {
    if (effectiveSoundLevel() <= 0) return;
    try {
        initAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(masterGain);
        o.type = type;
        const now = audioCtx.currentTime;
        o.frequency.setValueAtTime(freq, now);
        if (glide) o.frequency.exponentialRampToValueAtTime(glide, now + dur);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.start(now);
        o.stop(now + dur);
    } catch (_) { /* ignore audio errors */ }
}

// Shortcut functions for game sounds
function playShoot() { playTone(420, 'sine', 0.08, 0.15, 180); }
function playImpact() { playTone(180, 'triangle', 0.09, 0.14, 110); }
function playPop(n) {
    const f = [523, 659, 784, 1047];
    for (let i = 0; i < Math.min(n, 4); i++) {
        setTimeout(() => playTone(f[i % f.length], 'triangle', 0.1, 0.10), i * 40);
    }
}
function playDrop() { playTone(280, 'sawtooth', 0.2, 0.08, 100); }
function playLevelUp() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.15, 0.12), i * 100));
}
function playGameOver() {
    [440, 370, 330, 261].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.25, 0.10), i * 180));
}
function playBounce() { playTone(240, 'sine', 0.04, 0.05); }

// ─── COLOR PALETTE & BUBBLE SPRITES ──────────────────────────
// Six distinct bubble colour schemes
const PALETTE = [
    { fill: '#dc2626', sh: '#fecaca', dk: '#991b1b', glow: '#f87171' },
    { fill: '#2a7fff', sh: '#c6ddff', dk: '#004bb5', glow: '#5a9aff' },
    { fill: '#2ed64a', sh: '#c6ffd0', dk: '#0f8f25', glow: '#5ae87a' },
    { fill: '#ffc800', sh: '#fff5c0', dk: '#c99a00', glow: '#ffd94a' },
    { fill: '#db2777', sh: '#fbcfe8', dk: '#9d174d', glow: '#f472b6' },
    { fill: '#22d3ee', sh: '#c8faff', dk: '#0891b2', glow: '#67e8f9' },
];

// Get the colour spec for a given colour index
function bubbleSpec(ci) { return PALETTE[ci % PALETTE.length]; }

// Special constant for bomb bubbles
const BOMB_BUBBLE = -1;
const BOMB_SPEC = { fill: '#10131f', sh: '#ffe58a', dk: '#05070c', glow: '#ffb52e' };

// Cache for rendered bubble sprites (keyed by colour + radius)
const bubbleSpriteCache = new Map();

function isBombBubble(ci) { return ci === BOMB_BUBBLE; }
function bubbleSpriteKey(ci, r) { return `${ci}|${Math.round(r * 2) / 2}`; }

// Build a canvas sprite for a bubble (with bomb or normal style)
function buildBubbleSprite(ci, r) {
    const c = isBombBubble(ci) ? BOMB_SPEC : bubbleSpec(ci);
    const bomb = isBombBubble(ci);
    const size = Math.ceil(r * 3.4);
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const sctx = sprite.getContext('2d');
    const half = size / 2;
    const R = r;
    const rim = Math.max(1.0, R * 0.04);

    sctx.clearRect(0, 0, size, size);
    sctx.save();
    sctx.translate(half, half);

    // Glow
    const glowSize = R * 1.35;
    const gl = sctx.createRadialGradient(0, 0, R * 0.2, 0, 0, glowSize);
    gl.addColorStop(0, c.glow + '44');
    gl.addColorStop(0.6, c.glow + '18');
    gl.addColorStop(1, 'transparent');
    sctx.beginPath();
    sctx.arc(0, 0, glowSize, 0, Math.PI * 2);
    sctx.fillStyle = gl;
    sctx.fill();

    // Shadow
    sctx.shadowColor = 'rgba(0,0,0,0.22)';
    sctx.shadowBlur = Math.max(6, R * 0.22);
    sctx.shadowOffsetY = Math.max(2, R * 0.08);

    // Main body
    const bodyR = R - rim * 0.3;
    const grad = sctx.createRadialGradient(-R * 0.32, -R * 0.38, R * 0.04, 0, 0, bodyR);
    if (bomb) {
        grad.addColorStop(0.0, '#fff8cf');
        grad.addColorStop(0.16, '#ffdd55');
        grad.addColorStop(0.5, c.fill);
        grad.addColorStop(0.88, '#070a12');
        grad.addColorStop(1.0, '#02040a');
    } else {
        grad.addColorStop(0.0, '#ffffff');
        grad.addColorStop(0.12, c.sh);
        grad.addColorStop(0.48, c.fill);
        grad.addColorStop(0.88, c.dk);
        grad.addColorStop(1.0, darken(c.dk, 0.18));
    }
    sctx.beginPath();
    sctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    sctx.fillStyle = grad;
    sctx.fill();
    sctx.shadowBlur = 0;
    sctx.shadowOffsetY = 0;

    // Bomb-specific details or normal highlights
    if (bomb) {
        // Bomb cap highlights
        const cap = sctx.createRadialGradient(-R * 0.12, -R * 0.18, 0, -R * 0.12, -R * 0.18, R * 0.78);
        cap.addColorStop(0, 'rgba(255,247,193,0.28)');
        cap.addColorStop(0.4, 'rgba(255,225,93,0.10)');
        cap.addColorStop(1, 'rgba(255,225,93,0)');
        sctx.beginPath();
        sctx.arc(0, 0, bodyR, 0, Math.PI * 2);
        sctx.fillStyle = cap;
        sctx.fill();
        sctx.lineCap = 'round';
        sctx.strokeStyle = '#f7d36c';
        sctx.lineWidth = Math.max(1.2, rim * 0.55);
        sctx.beginPath();
        sctx.moveTo(-R * 0.02, -R * 0.82);
        sctx.quadraticCurveTo(-R * 0.24, -R * 1.1, -R * 0.14, -R * 1.28);
        sctx.stroke();
        sctx.fillStyle = '#fff1a5';
        sctx.beginPath();
        sctx.arc(-R * 0.14, -R * 1.3, Math.max(1.8, rim * 0.95), 0, Math.PI * 2);
        sctx.fill();
        sctx.fillStyle = '#8a5521';
        sctx.beginPath();
        sctx.arc(-R * 0.03, -R * 0.92, Math.max(1.2, rim * 0.5), 0, Math.PI * 2);
        sctx.fill();
        sctx.fillStyle = '#ff8a1f';
        sctx.beginPath();
        sctx.arc(R * 0.12, R * 0.08, Math.max(2.1, R * 0.1), 0, Math.PI * 2);
        sctx.fill();
    } else {
        // Normal bubble highlights
        const rimGrad = sctx.createRadialGradient(-R * 0.5, -R * 0.5, R * 0.05, -R * 0.3, -R * 0.3, R * 0.95);
        rimGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
        rimGrad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
        sctx.beginPath();
        sctx.arc(0, 0, bodyR, 0, Math.PI * 2);
        sctx.fillStyle = rimGrad;
        sctx.fill();

        const sh1 = sctx.createRadialGradient(-R * 0.30, -R * 0.32, 0, -R * 0.30, -R * 0.32, R * 0.52);
        sh1.addColorStop(0, 'rgba(255,255,255,0.95)');
        sh1.addColorStop(0.3, 'rgba(255,255,255,0.55)');
        sh1.addColorStop(0.7, 'rgba(255,255,255,0.10)');
        sh1.addColorStop(1, 'rgba(255,255,255,0)');
        sctx.beginPath();
        sctx.arc(0, 0, bodyR * 1.02, 0, Math.PI * 2);
        sctx.fillStyle = sh1;
        sctx.fill();

        const sh2 = sctx.createRadialGradient(-R * 0.15, -R * 0.20, 0, -R * 0.15, -R * 0.20, R * 0.18);
        sh2.addColorStop(0, 'rgba(255,255,255,0.85)');
        sh2.addColorStop(0.6, 'rgba(255,255,255,0.20)');
        sh2.addColorStop(1, 'rgba(255,255,255,0)');
        sctx.beginPath();
        sctx.arc(0, 0, bodyR * 1.02, 0, Math.PI * 2);
        sctx.fillStyle = sh2;
        sctx.fill();

        const bounce = sctx.createRadialGradient(R * 0.15, R * 0.35, 0, R * 0.15, R * 0.35, R * 0.35);
        bounce.addColorStop(0, 'rgba(255,255,255,0.20)');
        bounce.addColorStop(1, 'rgba(255,255,255,0)');
        sctx.beginPath();
        sctx.arc(0, 0, bodyR * 1.02, 0, Math.PI * 2);
        sctx.fillStyle = bounce;
        sctx.fill();

        sctx.beginPath();
        sctx.arc(0, 0, bodyR - rim * 0.2, 0, Math.PI * 2);
        sctx.lineWidth = Math.max(0.8, rim * 0.45);
        sctx.strokeStyle = 'rgba(255,255,255,0.18)';
        sctx.stroke();

        sctx.beginPath();
        sctx.arc(0, 0, bodyR * 0.82, 0, Math.PI * 2);
        sctx.lineWidth = Math.max(0.6, rim * 0.3);
        sctx.strokeStyle = 'rgba(0,0,0,0.08)';
        sctx.stroke();
    }

    sctx.restore();
    return sprite;
}

// Get a cached sprite for a bubble
function getBubbleSprite(ci, r) {
    const key = bubbleSpriteKey(ci, r);
    let sprite = bubbleSpriteCache.get(key);
    if (!sprite) {
        sprite = buildBubbleSprite(ci, r);
        bubbleSpriteCache.set(key, sprite);
    }
    return sprite;
}

// Draw a bubble at (x,y) with given radius and colour
function drawBubble(ctx, x, y, r, ci, alpha = 1, scale = 1, rot = 0) {
    const sprite = getBubbleSprite(ci, r);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
    ctx.restore();
}

// Utility to darken a hex colour
function darken(hex, amt) {
    const r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    const f = v => Math.max(0, Math.round(v - 255 * amt));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ─── PERSISTENCE (Best Score) ────────────────────────────────
const BEST_KEY = 'bb_best_v5';

function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { }
}

// ─── GAME STATE OBJECT ────────────────────────────────────────
const G = {
    score: 0,
    best: loadBest(),
    level: 1,
    nextLevelAt: 300,
    pendingLevel: false,
    leveling: false,
    grid: [],
    colorSet: [],
    parity: 0,
    cur: 0,
    nxt: 0,
    shooting: false,
    bx: 0, by: 0, bvx: 0, bvy: 0, bc: 0,
    loadSquash: 1,
    angle: -Math.PI / 2,
    paused: false,
    combo: 0,
    shotsSincePush: 0,
    pushEvery: 8,
    scoreMult: 1,
    bombChance: 0,
    aimAssist: 0,
    pushVisualOffset: 0,
    gameOverTimer: null,
    popping: [],
    falling: [],
    particles: [],
    floats: [],
};

// ─── CANVAS SETUP ──────────────────────────────────────────────
let CW = 0, CH = 0, BR = 18, NCOLS = 10, OX = 0, OY_BASE = 0;
let SHOOTER_TOP = 0, SHOOTER_X = 0, SHOOTER_Y = 0;


function syncViewportHeight() {
    const vh = window.visualViewport?.height || window.innerHeight;
    if (vh) {
        document.documentElement.style.setProperty('--app-height', Math.round(vh) + 'px');
    }
}
// Measure the game area and compute bubble size, grid layout
function setupCanvas() {
    const area = document.getElementById('game-area');
    const r = area.getBoundingClientRect();
    CW = Math.floor(r.width);
    CH = Math.floor(r.height);
    canvas.width = CW;
    canvas.height = CH;
    aimCanvas.width = CW;
    aimCanvas.height = CH;

    const shortSide = Math.min(CW, CH);
    const targetBR = Math.max(9, Math.min(22, Math.min(CW * 0.036, CH * 0.034, shortSide * 0.032)));
    NCOLS = Math.max(8, Math.round(CW / (targetBR * 2)));
    BR = Math.max(9, Math.min(22, Math.min(CW / (2 * NCOLS), CH * 0.034, shortSide * 0.032)));
    OX = BR + (CW - (2 * BR * NCOLS)) / 2;
    OY_BASE = BR * 0.35;

    positionShooterCluster();
}

// Position the shooter cluster dynamically based on screen size
function positionShooterCluster() {
    const cluster = document.getElementById('shooter-cluster');
    const curRing = document.getElementById('cur-ring');
    const slotNext = document.getElementById('slot-next');
    const swapArrow = document.getElementById('swap-arrow');
    const area = document.getElementById('game-area');
    const shortSide = Math.min(CW, CH);
    const stacked = false; // Always horizontal — never switch to vertical layout
    const curSize = Math.max(34, Math.min(72, Math.min(CW * 0.16, CH * 0.18, shortSide * 0.14)));
    const nxtSize = Math.max(24, Math.min(50, Math.min(CW * 0.1, CH * 0.11, shortSide * 0.095)));
    const swapSize = Math.max(22, Math.min(30, Math.min(CW * 0.06, CH * 0.075, shortSide * 0.06)));
    const gap = Math.max(8, Math.min(16, shortSide * 0.035));
    const totalW = curSize + swapSize + nxtSize + gap * 2;
    const totalH = Math.max(curSize, nxtSize, swapSize);
    const left = Math.max(BR * 0.25, CW / 2 - totalW / 2);
    const bottom = Math.max(24, BR * 0.8); // extra room so NEXT label isn't clipped

    cluster.classList.toggle('stacked', stacked);
    cluster.style.width = totalW + 'px';
    cluster.style.height = totalH + 'px';
    cluster.style.left = left + 'px';
    cluster.style.top = 'auto';
    cluster.style.bottom = bottom + 'px'

    curRing.style.width = curSize + 'px';
    curRing.style.height = curSize + 'px';
    slotNext.style.width = nxtSize + 'px';
    slotNext.style.height = nxtSize + 'px';
    swapArrow.style.width = swapSize + 'px';
    swapArrow.style.height = swapSize + 'px';

    const areaRect = area.getBoundingClientRect();
    const curRect = curRing.getBoundingClientRect();
    const clusterRect = cluster.getBoundingClientRect();
    SHOOTER_X = curRect.left - areaRect.left + curRect.width / 2;
    SHOOTER_Y = curRect.top - areaRect.top + curRect.height * 0.44;
    SHOOTER_TOP = clusterRect.top - areaRect.top;

    renderPreviews();
}

let resizeFrame = 0;
function scheduleResizeRender() {
    syncViewportHeight();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        setupCanvas();
        fullRender();
    });
}

// ─── GRID HELPERS ──────────────────────────────────────────────
// Parity determines whether odd rows are offset
function rowParity(r) { return (r + G.parity) % 2; }

// Get pixel position of a bubble in the grid
function bPos(row, col) {
    const odd = rowParity(row) === 1;
    const xOff = odd ? BR : 0;
    return {
        x: OX + col * BR * 2 + xOff,
        y: OY_BASE + row * BR * 1.70 + G.pushVisualOffset,
    };
}

// Position of the shooter (centre of current bubble ring)
function shooterPos() {
    if (!SHOOTER_X || !SHOOTER_Y) return { x: CW / 2, y: CH - BR * 0.5 };
    return { x: SHOOTER_X, y: SHOOTER_Y };
}

// The y‑coordinate of the danger line (bubbles must stay above this)
function dangerY() {
    if (SHOOTER_TOP > 0) return SHOOTER_TOP - BR * 0.45;
    return CH - BR * 4.2;
}

function shotSpeed() { return Math.max(15, CW * 0.05); }
function hitDist() { return BR * (1.9 + G.aimAssist); }
function shotSubSteps() {
    return Math.max(2, Math.ceil(shotSpeed() / Math.max(7, BR * 0.4)));
}

// Distance squared from a point to a line segment
function distSqPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const sx = x1 + t * dx;
    const sy = y1 + t * dy;
    return (px - sx) ** 2 + (py - sy) ** 2;
}

// Find the closest bubble hit along a shot segment
function findShotImpact(x1, y1, x2, y2) {
    const hd2 = hitDist() * hitDist();
    let hitR = -1, hitC = -1, hitD = Infinity;
    const minY = Math.min(y1, y2) - hitDist() - BR;
    const maxY = Math.max(y1, y2) + hitDist() + BR;
    const approxMin = (minY - OY_BASE - G.pushVisualOffset) / (BR * 1.7);
    const approxMax = (maxY - OY_BASE - G.pushVisualOffset) / (BR * 1.7);
    const rowStart = Math.max(0, Math.floor(approxMin) - 2);
    const rowEnd = Math.min(G.grid.length - 1, Math.ceil(approxMax) + 2);
    for (let r = rowStart; r <= rowEnd; r++) {
        for (let c = 0; c < G.grid[r].length; c++) {
            if (G.grid[r][c] < 0) continue;
            const { x: bx, y: by } = bPos(r, c);
            const dd = distSqPointToSegment(bx, by, x1, y1, x2, y2);
            if (dd < hd2 && dd < hitD) {
                hitD = dd;
                hitR = r;
                hitC = c;
            }
        }
    }
    return hitR >= 0 ? { r: hitR, c: hitC } : null;
}

// Advance a shot by a number of substeps, optionally tracking the path
function advanceShot(state, steps, trackPath = false) {
    const points = trackPath ? [{ x: state.x, y: state.y }] : null;
    let stepVX = state.vx / steps;
    let stepVY = state.vy / steps;

    for (let i = 0; i < steps; i++) {
        const prevX = state.x;
        const prevY = state.y;
        let nextX = state.x + stepVX;
        let nextY = state.y + stepVY;

        // Wall bounce
        if (nextX - BR < 0 || nextX + BR > CW) {
            const wallX = nextX - BR < 0 ? BR : CW - BR;
            const t = (wallX - prevX) / ((nextX - prevX) || 1);
            const wallY = prevY + (nextY - prevY) * t;
            if (trackPath) points.push({ x: wallX, y: wallY });
            else playBounce();
            state.vx *= -1;
            stepVX = state.vx / steps;
            const remain = 1 - t;
            nextX = wallX + stepVX * remain;
            nextY = wallY + stepVY * remain;
            const hitAfterWall = findShotImpact(wallX, wallY, nextX, nextY);
            if (hitAfterWall) {
                state.x = nextX;
                state.y = nextY;
                if (trackPath) points.push({ x: state.x, y: state.y });
                return { hit: hitAfterWall, points };
            }
        }

        state.x = nextX;
        state.y = nextY;

        // Hit top boundary
        if (state.y - BR <= OY_BASE - BR * 0.3) {
            if (trackPath) points.push({ x: state.x, y: state.y });
            return { top: true, points };
        }

        // Check collision with a bubble
        const hit = findShotImpact(prevX, prevY, state.x, state.y);
        if (hit) {
            if (trackPath) points.push({ x: state.x, y: state.y });
            return { hit, points };
        }

        if (trackPath) points.push({ x: state.x, y: state.y });
    }

    return { points };
}

// Compare two bubbles by colour (ignoring bomb status)
function sameBubbleColor(a, b) {
    if (a < 0 || b < 0) return false;
    if (a === b) return true;
    return bubbleSpec(a).fill === bubbleSpec(b).fill;
}

// Determine how many colours are active based on score
function colorCountForScore(score) {
    return Math.min(4 + Math.floor(score / 500), PALETTE.length);
}

function refreshColorSet() {
    const n = colorCountForScore(G.score);
    G.colorSet = Array.from({ length: n }, (_, i) => i);
}

function rnd(cs) { return cs[Math.floor(Math.random() * cs.length)]; }

// ─── GRID INITIALIZATION ──────────────────────────────────────
function buildInitialGrid() {
    const rows = Math.max(5, Math.min(7, Math.floor((CH - BR * 8) / (BR * 1.7))));
    const density = 0.86;
    const grid = [];
    for (let r = 0; r < rows; r++) {
        const odd = rowParity(r) === 1;
        const cols = odd ? NCOLS - 1 : NCOLS;
        const row = [];
        for (let c = 0; c < cols; c++) {
            if (r < 2 || Math.random() < density) {
                row.push(rnd(G.colorSet));
            } else {
                row.push(-1); // empty cell
            }
        }
        grid.push(row);
    }
    return grid;
}

// Push a new row from the top
function pushNewRow() {
    G.parity = 1 - G.parity;
    const cols = rowParity(0) === 1 ? NCOLS - 1 : NCOLS;
    const row = [];
    for (let c = 0; c < cols; c++) row.push(rnd(G.colorSet));
    G.grid.unshift(row);
    const maxRows = Math.max(14, Math.ceil(CH / (BR * 1.7)) + 16);
    if (G.grid.length > maxRows) G.grid.length = maxRows;
    G.pushVisualOffset = -(BR * 1.7);
    gsap.to(G, { pushVisualOffset: 0, duration: 0.32, ease: 'power2.out' });
    playTone(200, 'sawtooth', 0.18, 0.07);
    setTimeout(() => playTone(160, 'sawtooth', 0.2, 0.06), 70);
    flashRowWarning();
}

// Visual warning when a new row appears
function flashRowWarning() {
    const area = document.getElementById('game-area');
    const el = document.createElement('div');
    el.className = 'row-warn';
    el.textContent = '▼ new row ▼';
    el.style.top = OY_BASE - BR * 1.6 + 'px';
    el.style.opacity = '0';
    area.appendChild(el);
    gsap.to(el, {
        opacity: 1, duration: 0.18,
        onComplete: () => {
            gsap.to(el, { opacity: 0, duration: 0.45, delay: 0.35, onComplete: () => el.remove() });
        }
    });
}

// ─── LEVEL & UPGRADE SYSTEM ──────────────────────────────────
function levelGoalFor(level) { return 260 + (level - 1) * 120; }

const UPGRADE_POOL = [{
    id: 'bomb',
    icon: '💣',
    title: 'Bomb Shots',
    copy: 'Some shots become visible bombs that clear nearby bubbles.',
    apply() { G.bombChance = Math.min(0.24, G.bombChance + 0.05); }
}, {
    id: 'score',
    icon: '⭐',
    title: 'More Score',
    copy: 'Every pop earns 30% extra points.',
    apply() { G.scoreMult = Math.min(2, G.scoreMult + 0.3); }
}, {
    id: 'slow',
    icon: '⏳',
    title: 'Slow Pressure',
    copy: 'Rows push less often.',
    apply() { G.pushEvery = Math.min(12, G.pushEvery + 1); }
}, {
    id: 'aim',
    icon: '🎯',
    title: 'Better Aim',
    copy: 'Shooting feels more forgiving.',
    apply() { G.aimAssist = Math.min(0.25, G.aimAssist + 0.08); }
}];

function pickUpgradeChoices() {
    const pool = [...UPGRADE_POOL];
    const out = [];
    while (out.length < 2 && pool.length) {
        const ix = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(ix, 1)[0]);
    }
    return out;
}

function syncLevelUI() {
    const goal = levelGoalFor(G.level);
    const progress = Math.max(0, Math.min(1, (G.score - (G.nextLevelAt - goal)) / goal));
    progressBar.style.width = (progress * 100) + '%';
}

function renderUpgradeChoices() {
    upgradeRow.innerHTML = '';
    const choices = pickUpgradeChoices();
    choices.forEach((choice) => {
        const btn = document.createElement('button');
        btn.className = choice.id === 'bomb' ? 'upgrade-card bomb-card' : 'upgrade-card';
        btn.type = 'button';
        btn.innerHTML = choice.id === 'bomb' ? `
      <div class="upgrade-ico bomb-art"><span class="bomb-mark"></span></div>
      <div class="upgrade-title">${choice.title}</div>
      <div class="upgrade-copy">${choice.copy}</div>
    ` : `
      <div class="upgrade-ico">${choice.icon}</div>
      <div class="upgrade-title">${choice.title}</div>
      <div class="upgrade-copy">${choice.copy}</div>
    `;
        btn.addEventListener('click', () => chooseUpgrade(choice));
        upgradeRow.appendChild(btn);
    });
}

function showLevelOverlay() {
    if (G.leveling) return;
    G.leveling = true;
    G.paused = true;
    G.pendingLevel = false;
    G.level += 1;
    G.pushEvery = Math.max(5, 8 - Math.floor((G.level - 1) / 2));
    const goal = levelGoalFor(G.level);
    G.nextLevelAt = G.score + goal;
    levelKicker.textContent = `level ${G.level}!`;
    levelSub.textContent = 'Choose an upgrade for the next level';
    renderUpgradeChoices();
    levelComplete.classList.add('show');
    syncLevelUI();
    playLevelUp();
}

function chooseUpgrade(choice) {
    choice.apply();
    levelComplete.classList.remove('show');
    G.leveling = false;
    G.paused = false;
    G.shotsSincePush = 0;
    syncLevelUI();
    updateHUD();
    fullRender();
}

// ─── GAME INIT ─────────────────────────────────────────────────
function initGame() {
    refreshColorSet();
    G.grid = buildInitialGrid();
    G.score = 0;
    G.level = 1;
    G.nextLevelAt = levelGoalFor(G.level);
    G.pendingLevel = false;
    G.leveling = false;
    G.combo = 0;
    G.shooting = false;
    G.paused = false;
    G.angle = -Math.PI / 2;
    G.shotsSincePush = 0;
    G.pushEvery = 8;
    G.scoreMult = 1;
    G.bombChance = 0;
    G.aimAssist = 0;
    G.pushVisualOffset = 0;
    G.gameOverTimer = null;
    G.popping = [];
    G.falling = [];
    G.particles = [];
    G.floats = [];
    G.cur = rollBubble();
    G.nxt = rollBubble();

    levelComplete.classList.remove('show');
    gameOver.classList.remove('show');
    updateHUD();
    renderPreviews();
    fullRender();
    syncLevelUI();
}

// ─── RENDER FUNCTIONS ──────────────────────────────────────────
function fullRender() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);
    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#f4f2ff');
    bg.addColorStop(1, '#e0ddfa');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(0, 0, CW, Math.max(18, CH * 0.14));
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fillRect(0, CH - Math.max(30, CH * 0.12), CW, Math.max(30, CH * 0.12));

    // Grid bubbles
    for (let r = 0; r < G.grid.length; r++) {
        for (let c = 0; c < G.grid[r].length; c++) {
            const v = G.grid[r][c];
            if (v < 0) continue;
            const { x, y } = bPos(r, c);
            if (y > -BR * 2 && y < CH + BR * 2) {
                drawBubble(ctx, x, y, BR, v);
            }
        }
    }

    // Falling bubbles
    for (const f of G.falling) {
        drawBubble(ctx, f.x, f.y, f.r, f.ci, f.alpha, 1, f.rot);
    }
    // Popping bubbles (fade out)
    for (const p of G.popping) {
        drawBubble(ctx, p.x, p.y, p.r, p.ci, p.alpha, p.scale);
    }

    // Danger line
    const dy = dangerY();
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(111,105,180,.42)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, dy);
    ctx.lineTo(CW, dy);
    ctx.stroke();
    ctx.restore();

    // Shot bubble
    if (G.shooting) {
        drawBubble(ctx, G.bx, G.by, BR, G.bc, 1, 1);
    }

    // Combo counter
    if (G.combo > 1) {
        ctx.save();
        const fs = Math.min(24, BR * 1.1);
        ctx.font = `800 ${fs}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(249,115,22,.92)';
        ctx.shadowBlur = 18;
        ctx.shadowColor = 'rgba(249,115,22,.4)';
        ctx.fillText(`🔥 ×${G.combo}`, CW / 2, dy - 10);
        ctx.restore();
    }

    // Particles
    for (const p of G.particles) {
        ctx.save();
        ctx.globalAlpha = 1 - p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - p.life / p.maxLife * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Floating score texts
    for (const f of G.floats) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, f.life / 20);
        ctx.fillStyle = f.color;
        ctx.font = `bold ${18 + (1 - f.life / 80) * 6}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
    }

    drawAimLine();
}

function renderPreviews() {
    const curPx = Math.max(40, Math.round(document.getElementById('cur-ring').clientWidth || 58));
    const nxtPx = Math.max(34, Math.round(document.getElementById('slot-next').clientWidth || 44));

    currentCanvas.width = curPx;
    currentCanvas.height = curPx;
    currentCtx.clearRect(0, 0, curPx, curPx);
    if (!G.shooting) {
        drawBubble(currentCtx, curPx / 2, curPx / 2, curPx * 0.36, G.cur, 1, G.loadSquash);
    }

    nextCanvas.width = nxtPx;
    nextCanvas.height = nxtPx;
    nextCtx.clearRect(0, 0, nxtPx, nxtPx);
    drawBubble(nextCtx, nxtPx / 2, nxtPx / 2, nxtPx * 0.36, G.nxt, 1, 1);
}

function rollBubble() {
    return Math.random() < G.bombChance ? BOMB_BUBBLE : rnd(G.colorSet);
}

// ─── AIM LINE ──────────────────────────────────────────────────
let aimActive = false, aimX = 0, aimY = 0;

function predictAimPath(tx, ty) {
    const sp = shooterPos();
    const dx = tx - sp.x;
    const dy = ty - sp.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;

    const sim = {
        x: sp.x,
        y: sp.y,
        vx: (dx / len) * shotSpeed() * 12,
        vy: (dy / len) * shotSpeed() * 12
    };
    const res = advanceShot(sim, shotSubSteps() * 12, true);
    const pts = res.points || [];
    if (pts.length < 2) return null;

    const impact = pts[pts.length - 1];
    const landing = (res.hit || res.top) ? findSnapCell(res.hit ? res.hit.r : -1, res.hit ? res.hit.c : -1, sim.x, sim.y) : null;
    return { pts, impact, landing };
}

function drawAimLine() {
    aimCtx.clearRect(0, 0, CW, CH);
    if (!aimActive || G.shooting || G.paused) return;
    if (aimY >= dangerY() - 2) return;

    const sp = shooterPos();
    const theme = isBombBubble(G.cur) ? BOMB_SPEC : bubbleSpec(G.cur < 0 ? 0 : G.cur);
    const dx = aimX - sp.x, dy = aimY - sp.y;
    if (Math.hypot(dx, dy) < 15 || dy > -10) return;

    const preview = predictAimPath(aimX, aimY);
    const pts = preview ? preview.pts : [{ x: sp.x, y: sp.y }, { x: sp.x, y: sp.y + 1 }];

    if (pts.length < 2) return;
    aimCtx.save();
    aimCtx.beginPath();
    aimCtx.rect(0, 0, CW, dangerY());
    aimCtx.clip();
    aimCtx.setLineDash([9, 11]);
    aimCtx.strokeStyle = `${theme.fill}aa`;
    aimCtx.lineWidth = 2.5;
    aimCtx.lineCap = 'round';
    aimCtx.shadowBlur = 8;
    aimCtx.shadowColor = `${theme.sh}55`;
    aimCtx.beginPath();
    aimCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) aimCtx.lineTo(pts[i].x, pts[i].y);
    aimCtx.stroke();
    aimCtx.setLineDash([]);

    // Arrow tip
    const last = preview ? preview.impact : pts[pts.length - 1];
    const prev = pts[Math.max(0, pts.length - 2)];
    const ax = last.x - prev.x, ay = last.y - prev.y;
    const al = Math.hypot(ax, ay) || 1;
    const ux = ax / al, uy = ay / al;
    const px = -uy, py = ux;
    const aL = Math.max(14, BR * 0.72), aW = Math.max(7, BR * 0.34);
    aimCtx.shadowBlur = 16;
    aimCtx.shadowColor = theme.sh;
    aimCtx.beginPath();
    aimCtx.moveTo(last.x, last.y);
    aimCtx.lineTo(last.x - ux * aL + px * aW, last.y - uy * aL + py * aW);
    aimCtx.lineTo(last.x - ux * aL - px * aW, last.y - uy * aL - py * aW);
    aimCtx.closePath();
    aimCtx.fillStyle = theme.fill;
    aimCtx.fill();
    aimCtx.beginPath();
    aimCtx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    aimCtx.fillStyle = theme.sh;
    aimCtx.fill();
    if (preview && preview.landing) {
        const lp = bPos(preview.landing.r, preview.landing.c);
        aimCtx.save();
        aimCtx.globalAlpha = 0.28;
        drawBubble(aimCtx, lp.x, lp.y, BR * 0.98, G.cur, 0.55, 1);
        aimCtx.globalAlpha = 1;
        aimCtx.lineWidth = 2;
        aimCtx.strokeStyle = `${theme.fill}cc`;
        aimCtx.beginPath();
        aimCtx.arc(lp.x, lp.y, BR * 0.88, 0, Math.PI * 2);
        aimCtx.stroke();
        aimCtx.restore();
    } else if (preview) {
        drawBubble(aimCtx, last.x, last.y, BR, G.cur, 0.35);
    }
    aimCtx.restore();
}

// ─── SHOOTING LOGIC ────────────────────────────────────────────
function shoot(tx, ty) {
    if (G.shooting || G.paused) return;
    if (ty != null && ty >= dangerY() - 2) return;
    initAudio();

    const sp = shooterPos();
    let angle;
    if (tx != null) {
        angle = Math.atan2(ty - sp.y, tx - sp.x);
    } else {
        angle = G.angle;
    }
    // Prevent shooting upward or too horizontal
    if (Math.sin(angle) > -0.08) {
        const side = (tx != null ? tx : sp.x) >= sp.x ? 1 : -1;
        angle = side > 0 ? -0.12 : -(Math.PI - 0.12);
    }

    G.bx = sp.x;
    G.by = sp.y;
    const spd = shotSpeed();
    G.bvx = Math.cos(angle) * spd;
    G.bvy = Math.sin(angle) * spd;
    G.bc = G.cur;
    G.shooting = true;
    G.shotsSincePush++;

    muzzleFlash();
    playShoot();
    renderPreviews();
    gsap.fromTo(document.getElementById('cur-ring'), { scale: 0.9 }, { scale: 1, duration: 0.12, ease: 'power2.out' });
    updateHUD();
    aimCtx.clearRect(0, 0, CW, CH);
    aimActive = false;
}

function muzzleFlash() {
    const sp = shooterPos();
    const area = document.getElementById('game-area');
    for (let i = 0; i < 5; i++) {
        const p = document.createElement('div');
        p.className = 'dpar';
        const sz = Math.random() * 5 + 2.5;
        p.style.cssText = `width:${sz}px;height:${sz}px;background:#fff;left:${sp.x}px;top:${sp.y}px;`;
        area.appendChild(p);
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
        const dist = Math.random() * 20 + 8;
        gsap.to(p, {
            x: Math.cos(ang) * dist,
            y: Math.sin(ang) * dist,
            opacity: 0,
            duration: 0.28,
            ease: 'power2.out',
            onComplete: () => p.remove()
        });
    }
}

function updateBall() {
    if (!G.shooting) return;
    const sim = { x: G.bx, y: G.by, vx: G.bvx, vy: G.bvy };
    const res = advanceShot(sim, shotSubSteps(), false);
    G.bx = sim.x;
    G.by = sim.y;
    G.bvx = sim.vx;
    G.bvy = sim.vy;

    if (res.top) { snapBubble(-1, -1); return; }
    if (res.hit) { snapBubble(res.hit.r, res.hit.c); return; }
}

// Collect cells within a blast radius (for bomb)
function collectBlastCells(r, c, radius = 1) {
    const cells = [];
    for (let rr = r - radius; rr <= r + radius; rr++) {
        for (let cc = c - radius; cc <= c + radius; cc++) {
            if (rr >= 0 && rr < G.grid.length && cc >= 0 && cc < (G.grid[rr] || []).length && G.grid[rr][cc] >= 0) {
                cells.push([rr, cc]);
            }
        }
    }
    return cells;
}

// Place the shot bubble into the grid, then handle matches and falling
function snapBubble(hitR = -1, hitC = -1) {
    const best = findSnapCell(hitR, hitC);
    if (!best) {
        G.shooting = false;
        playImpact();
        fullRender();
        return;
    }

    let bestR = best.r, bestC = best.c;
    while (G.grid.length <= bestR) G.grid.push([]);
    const odd2 = rowParity(bestR) === 1;
    const nc = odd2 ? NCOLS - 1 : NCOLS;
    while (G.grid[bestR].length < nc) G.grid[bestR].push(-1);
    if (bestR >= 0 && bestC >= 0 && bestC < G.grid[bestR].length) {
        G.grid[bestR][bestC] = G.bc;
    }

    G.shooting = false;
    playImpact();
    spawnImpactRing(bPos(bestR, bestC));

    const bombHit = isBombBubble(G.bc);
    const matched = bombHit ? collectBlastCells(bestR, bestC, 1) : floodColor(bestR, bestC, G.bc);
    const canPop = bombHit ? matched.length > 0 : matched.length >= 3;

    if (canPop) {
        G.combo++;
        playPop(matched.length);
        const pts = matched.length * 10 * (G.combo > 1 ? G.combo : 1);
        matched.forEach(([r, c]) => {
            const p = bPos(r, c);
            spawnPopAnim(p, G.grid[r][c]);
            spawnPopParticles(p, G.grid[r][c]);
            G.grid[r][c] = -1;
        });
        addScore(pts);
        showScorePop(G.bx, G.by, `+${pts}`);
        if (G.combo > 1) showComboFlash(G.combo);
        const floats = findFloating();
        if (floats.length > 0) {
            playDrop();
            floats.forEach(([r, c]) => {
                const p = bPos(r, c);
                spawnFallAnim(p, G.grid[r][c]);
                addScore(8);
                G.grid[r][c] = -1;
            });
        }
    } else {
        G.combo = 0;
    }

    refreshColorSet();

    // Check for game over after placement
    if (checkDanger()) {
        scheduleGameOver('The bubbles reached the bottom!', 320);
        fullRender();
        return;
    }
    // Push a new row if enough shots have been fired
    if (G.shotsSincePush >= G.pushEvery) {
        G.shotsSincePush = 0;
        pushNewRow();
        if (checkDanger()) {
            scheduleGameOver('A new row pushed too far!', 420);
            fullRender();
            return;
        }
    }

    // Advance to next bubble
    G.cur = G.nxt;
    G.nxt = rollBubble();
    G.loadSquash = 1;
    renderPreviews();
    updateHUD();
    fullRender();

    // Trigger level-up if pending
    if (G.pendingLevel) showLevelOverlay();
}

// Helper for snapBubble: evaluate a candidate cell
function considerSnapCell(r, c, best, shotX = G.bx, shotY = G.by) {
    if (r < 0) return;
    const isEmpty = r >= G.grid.length || !G.grid[r] || G.grid[r][c] < 0;
    if (!isEmpty) return;
    const hasNbr = r === 0 || adjHasBub(r, c);
    if (!hasNbr) return;
    const { x, y } = bPos(r, c);
    const d = (shotX - x) ** 2 + (shotY - y) ** 2;
    if (d < best.d) {
        best.d = d;
        best.r = r;
        best.c = c;
    }
}

function findSnapCell(hitR = -1, hitC = -1, shotX = G.bx, shotY = G.by) {
    const best = { r: -1, c: -1, d: Infinity };

    if (hitR >= 0 && hitC >= 0) {
        for (const [nr, nc] of getNbrs(hitR, hitC)) {
            considerSnapCell(nr, nc, best, shotX, shotY);
        }
    }
    if (best.r < 0) {
        const maxR = G.grid.length + 1;
        for (let r = 0; r <= maxR; r++) {
            const odd = rowParity(r) === 1;
            const cols = odd ? NCOLS - 1 : NCOLS;
            for (let c = 0; c < cols; c++) considerSnapCell(r, c, best, shotX, shotY);
        }
    }

    return best.r >= 0 ? best : null;
}

function adjHasBub(r, c) {
    for (const [nr, nc] of getNbrs(r, c)) {
        if (nr >= 0 && nr < G.grid.length && nc >= 0 && nc < (G.grid[nr] || []).length && G.grid[nr][nc] >= 0)
            return true;
    }
    return false;
}

// Neighbour offsets for hexagonal grid
function getNbrs(r, c) {
    const odd = rowParity(r) === 1;
    return odd ? [
        [r - 1, c], [r - 1, c + 1], [r, c - 1], [r, c + 1], [r + 1, c], [r + 1, c + 1]
    ] : [
        [r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c + 1], [r + 1, c - 1], [r + 1, c]
    ];
}

// Flood fill to find same-colour connected group
function floodColor(sr, sc, col) {
    const vis = new Set(), q = [[sr, sc]], res = [];
    while (q.length) {
        const [r, c] = q.shift();
        const k = r + ',' + c;
        if (vis.has(k)) continue;
        vis.add(k);
        if (r < 0 || r >= G.grid.length || c < 0 || c >= (G.grid[r] || []).length) continue;
        if (!sameBubbleColor(G.grid[r][c], col)) continue;
        res.push([r, c]);
        for (const [nr, nc] of getNbrs(r, c)) q.push([nr, nc]);
    }
    return res;
}

// Find bubbles that are not connected to the top row (floating)
function findFloating() {
    const con = new Set(), q = [];
    for (let c = 0; c < (G.grid[0] || []).length; c++) {
        if (G.grid[0] && G.grid[0][c] >= 0) { q.push([0, c]); con.add('0,' + c); }
    }
    while (q.length) {
        const [r, c] = q.shift();
        for (const [nr, nc] of getNbrs(r, c)) {
            const k = nr + ',' + nc;
            if (con.has(k)) continue;
            if (nr < 0 || nr >= G.grid.length || nc < 0 || nc >= (G.grid[nr] || []).length) continue;
            if (G.grid[nr][nc] < 0) continue;
            con.add(k);
            q.push([nr, nc]);
        }
    }
    const fl = [];
    for (let r = 0; r < G.grid.length; r++)
        for (let c = 0; c < G.grid[r].length; c++)
            if (G.grid[r][c] >= 0 && !con.has(r + ',' + c)) fl.push([r, c]);
    return fl;
}

// Check if any bubble is below the danger line
function checkDanger() {
    const dy = dangerY();
    for (let r = 0; r < G.grid.length; r++)
        for (let c = 0; c < G.grid[r].length; c++) {
            if (G.grid[r][c] < 0) continue;
            if (bPos(r, c).y + BR * 0.5 >= dy) return true;
        }
    return false;
}

// Schedule a game over after a short delay
function scheduleGameOver(reason, delay = 0) {
    if (G.gameOverTimer || G.paused || gameOver.classList.contains('show')) return;
    G.gameOverTimer = setTimeout(() => {
        G.gameOverTimer = null;
        showGameOver(reason);
    }, delay);
}

// Add score (with multiplier) and check for level-up
function addScore(n) {
    G.score += Math.round(n * G.scoreMult);
    if (G.score > G.best) G.best = G.score;
    if (!G.leveling && !G.pendingLevel && G.score >= G.nextLevelAt) {
        G.pendingLevel = true;
    }
}

// ─── ANIMATION HELPERS ────────────────────────────────────────
function spawnPopAnim(pos, ci) {
    const obj = { x: pos.x, y: pos.y, r: BR, ci, scale: 1, alpha: 1 };
    G.popping.push(obj);
    gsap.to(obj, {
        scale: 1.5, alpha: 0, duration: 0.35, ease: 'power2.out',
        onComplete: () => { const i = G.popping.indexOf(obj); if (i >= 0) G.popping.splice(i, 1); }
    });
}

function spawnFallAnim(pos, ci) {
    G.falling.push({
        x: pos.x, y: pos.y, r: BR, ci,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 1 + Math.random() * 1.5,
        rot: 0, vrot: (Math.random() - 0.5) * 0.32,
        alpha: 1,
    });
}

// Update falling bubbles with gravity and bounce
function tickFalling() {
    if (!G.falling.length) return;
    const dy = dangerY();
    for (let i = G.falling.length - 1; i >= 0; i--) {
        const f = G.falling[i];
        f.vy += 0.35;
        f.y += f.vy;
        f.rot += f.vrot || 0;
        if (f.y + f.r >= dy && f.vy > 0) {
            f.vy = -f.vy * 0.45;
            f.y = dy - f.r - 0.5;
            spawnBounceRing(f.x, dy);
            if (Math.abs(f.vy) < 0.5) {
                const pos = { x: f.x, y: dy };
                spawnPopParticles(pos, f.ci);
                spawnPopAnim(pos, f.ci);
                playPop(1);
                const pts = 5 + Math.floor(Math.random() * 5);
                showScorePop(f.x, dy - BR * 1.2, `+${pts}`);
                addScore(pts);
                G.falling.splice(i, 1);
                continue;
            }
        }
        if (f.y > CH + BR * 2) G.falling.splice(i, 1);
    }
}

function spawnBounceRing(x, y) {
    const area = document.getElementById('game-area');
    const el = document.createElement('div');
    el.className = 'dring';
    const sz = BR * 0.6;
    el.style.cssText =
        `width:${sz}px;height:${sz}px;left:${x - sz / 2}px;top:${y - sz / 2}px;opacity:0.5;border-color:rgba(255,255,255,0.5);border-width:1px;`;
    area.appendChild(el);
    gsap.to(el, { scale: 1.6, opacity: 0, duration: 0.2, ease: 'power2.out', onComplete: () => el.remove() });
}

function spawnPopParticles({ x, y }, ci) {
    const col = ci >= 0 ? PALETTE[ci % PALETTE.length].fill : '#ff8800';
    const area = document.getElementById('game-area');
    for (let i = 0; i < 12; i++) {
        const p = document.createElement('div');
        p.className = 'dpar';
        const sz = Math.random() * 8 + 3;
        p.style.cssText = `width:${sz}px;height:${sz}px;background:${col};left:${x}px;top:${y}px;`;
        area.appendChild(p);
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * 64 + 18;
        gsap.to(p, {
            x: Math.cos(ang) * dist,
            y: Math.sin(ang) * dist,
            opacity: 0,
            scale: 0,
            duration: 0.42 + Math.random() * 0.3,
            ease: 'power2.out',
            onComplete: () => p.remove()
        });
    }
}

function spawnImpactRing({ x, y }) {
    const area = document.getElementById('game-area');
    const el = document.createElement('div');
    el.className = 'dring';
    const sz = BR * 1.4;
    const theme = G.bc < 0 ? BOMB_SPEC : bubbleSpec(G.bc);
    el.style.cssText =
        `width:${sz}px;height:${sz}px;left:${x - sz / 2}px;top:${y - sz / 2}px;opacity:.7;border-color:${theme.fill};box-shadow:0 0 12px ${theme.sh}55;`;
    area.appendChild(el);
    gsap.to(el, { scale: 1.9, opacity: 0, duration: 0.32, ease: 'power2.out', onComplete: () => el.remove() });
}

function showScorePop(x, y, text) {
    const area = document.getElementById('game-area');
    const el = document.createElement('div');
    el.className = 'score-pop';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y - BR * 1.5 + 'px';
    area.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

function showComboFlash(n) {
    const area = document.getElementById('game-area');
    const el = document.createElement('div');
    el.className = 'combo-flash';
    el.textContent = `🔥 COMBO ×${n}!`;
    el.style.top = dangerY() - 44 + 'px';
    area.appendChild(el);
    setTimeout(() => el.remove(), 750);
}

// ─── HUD UPDATE ───────────────────────────────────────────────
function updateHUD() {
    scoreEl.textContent = (G.score || 0).toLocaleString();
    levelEl.textContent = G.level || 1;
    menuBestBadge.textContent = (G.best || 0).toLocaleString();
    syncLevelUI();
}

// ─── GAME OVER ─────────────────────────────────────────────────
function showGameOver(reason) {
    if (G.gameOverTimer) {
        clearTimeout(G.gameOverTimer);
        G.gameOverTimer = null;
    }
    G.paused = true;
    playGameOver();
    const isNewBest = G.score >= G.best && G.score > 0;
    if (G.score > G.best) G.best = G.score;
    saveBest(G.best);

    overSub.textContent = reason;
    overSc.textContent = (G.score || 0).toLocaleString();
    overBest.innerHTML = `Best: <b>${(G.best || 0).toLocaleString()}</b>`;

    const nb = document.getElementById('over-newbest');
    if (isNewBest) {
        nb.style.opacity = 0;
        gsap.to(nb, { opacity: 1, duration: 0.4, delay: 0.3 });
        setTimeout(playTone, 250, 523, 'triangle', 0.15, 0.27);
        setTimeout(playTone, 350, 659, 'triangle', 0.15, 0.27);
        setTimeout(playTone, 450, 784, 'triangle', 0.15, 0.27);
        setTimeout(playTone, 550, 1047, 'triangle', 0.15, 0.27);
    } else {
        nb.style.opacity = 0;
    }

    gameOver.classList.add('show');
    levelComplete.classList.remove('show');
    updateHUD();
}

// ─── MENU / NAVIGATION ────────────────────────────────────────
function toggleMenu(open) {
    if (open === undefined) open = !menuDrawer.classList.contains('open');
    if (open) {
        closeHelp();
        menuDrawer.classList.add('open');
        menuDrawer.setAttribute('aria-hidden', 'false');
        if (!G.paused) G.paused = true;
    } else {
        menuDrawer.classList.remove('open');
        menuDrawer.setAttribute('aria-hidden', 'true');
        const overOpen = gameOver.classList.contains('show') || levelComplete.classList.contains('show');
        if (!overOpen) G.paused = false;
    }
}

function openHelp() {
    menuDrawer.classList.remove('open');
    menuDrawer.setAttribute('aria-hidden', 'true');
    helpModal.classList.add('show');
    helpModal.setAttribute('aria-hidden', 'false');
    G.paused = true;
}

function closeHelp() {
    helpModal.classList.remove('show');
    helpModal.setAttribute('aria-hidden', 'true');
    const overOpen = gameOver.classList.contains('show') || levelComplete.classList.contains('show') || menuDrawer.classList.contains('open');
    if (!overOpen) G.paused = false;
}

function hideAllOverlays() {
    if (G.gameOverTimer) {
        clearTimeout(G.gameOverTimer);
        G.gameOverTimer = null;
    }
    gameOver.classList.remove('show');
    levelComplete.classList.remove('show');
    closeHelp();
    toggleMenu(false);
    G.paused = false;
}

function launchGame() {
    hideAllOverlays();
    if (loopId) { cancelAnimationFrame(loopId); loopId = null; }
    setTimeout(() => {
        setupCanvas();
        initGame();
        bindInput();
        gameLoop();
    }, 50);
}

// ─── SOUND TOGGLE ─────────────────────────────────────────────
function setSoundVolume(nextVolume) {
    soundVolume = clamp01(nextVolume);
    if (soundVolume > 0) {
        lastSoundVolume = soundVolume;
        soundMuted = false;
    } else {
        soundMuted = true;
    }
    updateSoundUI();
    saveSoundSettings();
    updateMasterGain();
}

function toggleSoundMute() {
    if (soundMuted || soundVolume <= 0) {
        soundMuted = false;
        if (soundVolume <= 0) {
            soundVolume = lastSoundVolume > 0 ? lastSoundVolume : 0.8;
        }
    } else {
        lastSoundVolume = soundVolume;
        soundMuted = true;
    }
    updateSoundUI();
    saveSoundSettings();
    updateMasterGain();
}

function updateSoundUI() {
    const pct = Math.round(soundVolume * 100);
    const muted = soundMuted || soundVolume <= 0;
    const icon = muted ? '🔇' : '🔊';
    const label = muted ? 'Muted' : `Volume: ${pct}%`;
    const sliderValue = String(pct);
    const track = `linear-gradient(90deg, #ffd166 0%, #ffd166 ${pct}%, rgba(255, 255, 255, 0.16) ${pct}%, rgba(255, 255, 255, 0.16) 100%)`;
    musicBtn.textContent = icon;
    musicBtn.classList.toggle('sound-off', muted);
    musicBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    musicBtn.setAttribute('aria-pressed', String(muted));
    if (musicSlider) {
        musicSlider.value = sliderValue;
        musicSlider.style.background = track;
    }
    if (menuSoundToggle) {
        menuSoundToggle.textContent = icon;
        menuSoundToggle.classList.toggle('sound-off', muted);
        menuSoundToggle.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
        menuSoundToggle.setAttribute('aria-pressed', String(muted));
    }
    if (menuSoundSlider) {
        menuSoundSlider.value = sliderValue;
        menuSoundSlider.style.background = track;
    }
    menuSoundLabel.textContent = label;
}

// ─── INPUT BINDING ────────────────────────────────────────────
let inputBound = false;

function bindInput() {
    if (inputBound) return;
    inputBound = true;

    function getXY(e) {
        const r = touchZone.getBoundingClientRect();
        const p = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        return { x: p.clientX - r.left, y: p.clientY - r.top };
    }

    function onMove(e) {
        if (G.paused) return;
        const { x, y } = getXY(e);
        aimX = x;
        aimY = y;
        if (y >= dangerY() - 2) {
            aimCtx.clearRect(0, 0, CW, CH);
            return;
        }
        const sp = shooterPos();
        G.angle = Math.atan2(y - sp.y, x - sp.x);
    }

    function onFire(e) {
        if (G.paused) return;
        const { x, y } = getXY(e);
        aimActive = false;
        aimCtx.clearRect(0, 0, CW, CH);
        if (typeof e.pointerId === 'number' && touchZone.releasePointerCapture) {
            try { touchZone.releasePointerCapture(e.pointerId); } catch (_) { }
        }
        const fireX = Number.isFinite(x) ? x : aimX;
        const fireY = Number.isFinite(y) ? y : aimY;
        if (fireY >= dangerY() - 2) return;
        shoot(fireX, fireY);
    }

    touchZone.addEventListener('pointerdown', (e) => {
        if (G.paused) return;
        const { y } = getXY(e);
        if (y >= dangerY() - 2) return;
        aimActive = true;
        onMove(e);
        if (touchZone.setPointerCapture) {
            try { touchZone.setPointerCapture(e.pointerId); } catch (_) { }
        }
    });
    touchZone.addEventListener('pointermove', (e) => { if (!aimActive) return; onMove(e); });
    touchZone.addEventListener('pointerup', onFire);
    touchZone.addEventListener('pointercancel', () => { aimActive = false; aimCtx.clearRect(0, 0, CW, CH); });
    touchZone.addEventListener('pointerleave', () => { if (!aimActive) return; aimActive = false; aimCtx.clearRect(0, 0, CW, CH); });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Space' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!G.shooting && !G.paused) shoot();
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            G.angle = Math.max(G.angle - 0.07, -(Math.PI - 0.08));
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            G.angle = Math.min(G.angle + 0.07, -0.08);
        }
        if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            swapBubble();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (helpModal.classList.contains('show')) {
                closeHelp();
                return;
            }
            if (menuDrawer.classList.contains('open')) toggleMenu(false);
            else toggleMenu(true);
        }
    });

    document.getElementById('slot-next').addEventListener('click', swapBubble);
    document.getElementById('swap-arrow').addEventListener('click', swapBubble);
}

function swapBubble() {
    if (G.shooting || G.paused) return;
    const tmp = G.cur;
    G.cur = G.nxt;
    G.nxt = tmp;
    playTone(600, 'sine', 0.07, 0.13);
    setTimeout(() => playTone(800, 'sine', 0.07, 0.1), 80);
    G.loadSquash = 1;
    renderPreviews();
    fullRender();
}

// ─── GAME LOOP ─────────────────────────────────────────────────
let loopId = null;

function gameLoop() {
    if (!G.paused) {
        updateBall();
        tickFalling();

        // Update particles
        for (let i = G.particles.length - 1; i >= 0; i--) {
            const p = G.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.98;
            p.life++;
            if (p.life > p.maxLife) G.particles.splice(i, 1);
        }
        // Update floating texts
        for (let i = G.floats.length - 1; i >= 0; i--) {
            G.floats[i].y -= 0.5;
            G.floats[i].life--;
            if (G.floats[i].life <= 0) G.floats.splice(i, 1);
        }

        if (checkDanger()) {
            scheduleGameOver('The bubbles reached the bottom!');
        }
        fullRender();
    }
    loopId = requestAnimationFrame(gameLoop);
}

// ─── BUTTON EVENTS ────────────────────────────────────────────
retryBtn.addEventListener('click', () => { hideAllOverlays(); launchGame(); });
// homeBtn.addEventListener('click', () => { hideAllOverlays(); launchGame(); });

musicBtn.addEventListener('click', toggleSoundMute);
if (musicSlider) {
    musicSlider.addEventListener('input', (e) => setSoundVolume(Number(e.target.value) / 100));
}
if (menuSoundToggle) {
    menuSoundToggle.addEventListener('click', toggleSoundMute);
}
if (menuSoundSlider) {
    menuSoundSlider.addEventListener('input', (e) => setSoundVolume(Number(e.target.value) / 100));
}

menuToggle.addEventListener('click', () => toggleMenu());
menuClose.addEventListener('click', () => toggleMenu(false));
menuOverlay.addEventListener('click', () => toggleMenu(false));

menuResume.addEventListener('click', () => toggleMenu(false));

menuNewGame.addEventListener('click', () => {
    toggleMenu(false);
    G.best = loadBest();
    G.score = 0;
    G.level = 1;
    G.bombChance = 0;
    G.scoreMult = 1;
    G.pushEvery = 8;
    G.aimAssist = 0;
    launchGame();
});

menuHow.addEventListener('click', () => { openHelp(); });

helpClose.addEventListener('click', closeHelp);
helpCloser.addEventListener('click', closeHelp);
helpBackdrop.addEventListener('click', closeHelp);

syncViewportHeight();
window.addEventListener('resize', scheduleResizeRender);
window.addEventListener('orientationchange', scheduleResizeRender);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleResizeRender);
}

// ─── BOOT ──────────────────────────────────────────────────────
G.particles = [];
G.floats = [];
syncViewportHeight();
setupCanvas();
refreshColorSet();
G.colorSet = [0, 1, 2, 3];
G.cur = rollBubble();
G.nxt = rollBubble();
renderPreviews();
fullRender();
loadSoundSettings();
updateSoundUI();
menuBestBadge.textContent = (G.best || 0).toLocaleString();

// Start the game
launchGame();

// console.log('🫧 Bubble Blast loaded!');
// console.log('📱 Menu: ☰ button or press ESC');
// console.log('🔊 Sound toggle: top-right icon or in menu');