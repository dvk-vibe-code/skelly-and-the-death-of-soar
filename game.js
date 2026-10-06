'use strict';
// =====================================================================
//  SKELLY & THE DEATH OF SOAR — A Torq Hyperautomation Tale
//  Isometric hack-and-slash demo (Hades-style). Pure canvas, no deps.
// =====================================================================

// ---------- utils ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function hash(a, b, c = 0) { let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(c1, c2, t) { const a = hex2rgb(c1), b = hex2rgb(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`; }

// ---------- canvas ----------
// Pixel-art pipeline: every scene is drawn into a low-res buffer (`buf`) and blown up with
// nearest-neighbour scaling onto the real canvas (`MAIN`). Text marked CRISP is queued and
// drawn afterwards at full resolution in a pixel font so it stays readable.
const cv = document.getElementById('game');
const MAIN = cv.getContext('2d');
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d', { willReadFrequently: true });
let ctx = MAIN;
let W, H, DPR, Z = 1, VW, VH, PX_WORLD = 3, PX_TITLE = 4, PASS_PX = 1, PIX = 1, CRISP = false, CRT = true;
let scanPattern = null;
const textQueue = [];
// shadowBlur is in device pixels (ignores transforms) — rescale it so glows stay proportional in the buffer.
const SB = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
Object.defineProperty(bctx, 'shadowBlur', { get() { return SB.get.call(this) * PASS_PX; }, set(v) { SB.set.call(this, v / PASS_PX); } });
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR | 0; cv.height = H * DPR | 0;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  Z = clamp(Math.min(W / 1400, H / 870), 0.5, 1.6);
  VW = W / Z; VH = H / Z;
  // world pixel size follows the zoom so sprites (drawn 1:1 in buffer pixels) keep their size relative to the room
  PX_WORLD = Math.max(3, Math.round(Z * 3.8));
  PX_TITLE = Math.max(4, Math.round(H / 165));
  const sc = document.createElement('canvas'); sc.width = 1; sc.height = 3;
  const s = sc.getContext('2d'); s.fillStyle = 'rgba(0,0,0,0.22)'; s.fillRect(0, 2, 1, 1);
  scanPattern = MAIN.createPattern(sc, 'repeat');
}
addEventListener('resize', resize); resize();
if (document.fonts) { document.fonts.load('16px "Press Start 2P"'); document.fonts.load('16px VT323'); }

function beginPass(px) {
  PASS_PX = px;
  const w = Math.ceil(W / px), h = Math.ceil(H / px);
  if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
  ctx = bctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}
function endPass(quantLevels = 0) {
  if (quantLevels) quantize(quantLevels);
  ctx = MAIN;
  MAIN.setTransform(DPR, 0, 0, DPR, 0, 0);
  MAIN.imageSmoothingEnabled = false;
  MAIN.drawImage(buf, 0, 0, buf.width * PASS_PX, buf.height * PASS_PX);
  flushText();
}
function setUI() { ctx.setTransform(1 / PASS_PX, 0, 0, 1 / PASS_PX, 0, 0); }

const TITLE_FONT = '"Press Start 2P", monospace';
const UI_FONT = 'VT323, monospace';
function fontStr(size, font) {
  if (font === UI_FONT) return `${Math.round(size * 1.3)}px ${font}`;
  if (font === TITLE_FONT) return `${Math.max(8, Math.round(size * 0.62 / 4) * 4)}px ${font}`;
  return `bold ${Math.round(size)}px ${font}`;
}
function flushText() {
  MAIN.setTransform(DPR, 0, 0, DPR, 0, 0);
  MAIN.textBaseline = 'middle';
  for (const q of textQueue) {
    MAIN.font = fontStr(q.size, q.font);
    const w = MAIN.measureText(q.t).width;
    if (w > W - 40) MAIN.font = `${Math.floor(parseFloat(MAIN.font.replace(/^bold /, '')) * (W - 40) / w)}px ${q.font}`;
    MAIN.textAlign = q.align; MAIN.globalAlpha = q.alpha;
    const x = Math.round(q.x), y = Math.round(q.y), o = Math.max(1, Math.round(q.size / 14));
    MAIN.fillStyle = '#000'; MAIN.fillText(q.t, x + o * 2, y + o * 2);
    if (q.glow) { MAIN.fillStyle = q.glow; MAIN.globalAlpha = q.alpha * 0.55; MAIN.fillText(q.t, x + o, y + o); MAIN.globalAlpha = q.alpha; }
    MAIN.fillStyle = q.col; MAIN.fillText(q.t, x, y);
  }
  MAIN.globalAlpha = 1;
  textQueue.length = 0;
}

// ---------- input ----------
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  audioInit();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const mouse = { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false] };
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', e => { mouse.down[e.button] = true; mouse.pressed[e.button] = true; audioInit(); });
addEventListener('mouseup', e => { mouse.down[e.button] = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = [false, false, false]; });
function advPressed() { return pressed.Enter || pressed.NumpadEnter || pressed.Space || mouse.pressed[0]; }

// ---------- audio ----------
let AC = null, master = null, musicGain = null, gtrIn = null, noiseBuf = null;
let musicOn = true, musicMode = 'calm', musicStep = 0, nextNoteTime = 0;
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    musicGain = AC.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    const shaper = AC.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = (Math.PI + 60) * x / (Math.PI + 60 * Math.abs(x)); }
    shaper.curve = curve;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900;
    gtrIn = shaper; shaper.connect(lp); lp.connect(musicGain);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextNoteTime = AC.currentTime + 0.1;
    setInterval(schedMusic, 25);
  } catch (e) { AC = null; }
}
function tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
function noise(dur, vol = 0.2, freq = 1000, type = 'lowpass', t = null, dest = null) {
  if (!AC) return;
  t = t ?? AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || master); s.start(t); s.stop(t + dur);
}
const SFX = {
  swing: () => noise(0.12, 0.13, 3500),
  hit: () => { tone(170, 0.08, 'square', 0.1, 0.5); noise(0.06, 0.14, 2200); },
  dash: () => noise(0.16, 0.12, 6000, 'highpass'),
  pulse: () => { tone(80, 0.45, 'sawtooth', 0.18, 4); noise(0.3, 0.14, 900); },
  cast: () => tone(700, 0.22, 'triangle', 0.13, 0.3),
  hurt: () => tone(140, 0.28, 'sawtooth', 0.22, 0.4),
  die: () => noise(0.18, 0.1, 1400),
  laser: () => tone(1500, 0.07, 'square', 0.04, 0.4),
  summon: () => [0, 4, 7, 12].forEach((n, i) => setTimeout(() => tone(330 * Math.pow(2, n / 12), 0.3, 'square', 0.1), i * 80)),
  boon: () => [0, 7, 12].forEach((n, i) => setTimeout(() => tone(440 * Math.pow(2, n / 12), 0.25, 'triangle', 0.14), i * 90)),
  boom: () => { noise(0.9, 0.4, 380); tone(60, 0.8, 'sawtooth', 0.28, 0.3); },
  blip: () => tone(880, 0.025, 'square', 0.03),
  heal: () => tone(660, 0.2, 'sine', 0.12, 1.5),
  open: () => [0, 5, 9, 12].forEach((n, i) => setTimeout(() => tone(523 * Math.pow(2, n / 12), 0.2, 'triangle', 0.1), i * 60)),
};
function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
const RIFF = [40, 40, 52, 40, 43, 40, 45, 43, 40, 40, 52, 40, 47, 45, 43, 38];
const ARP = [52, 55, 59, 64, 59, 55, 50, 54];
function setMusic(m) { musicMode = m; }
function schedMusic() {
  if (!AC) return;
  const stepDur = 60 / (musicMode === 'boss' ? 172 : musicMode === 'fight' ? 152 : 100) / 2;
  while (nextNoteTime < AC.currentTime + 0.12) {
    if (musicOn) playStep(musicStep, nextNoteTime, stepDur);
    nextNoteTime += stepDur; musicStep = (musicStep + 1) % 32;
  }
}
function playStep(s, t, d) {
  const fight = musicMode !== 'calm';
  if (fight) {
    const n = RIFF[s % 16] + (musicMode === 'boss' && s >= 16 ? 1 : 0);
    for (const iv of [0, 7, 12]) {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(n + iv + 12);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + d * 0.9);
      o.connect(g); g.connect(gtrIn); o.start(t); o.stop(t + d);
    }
    if (s % 4 === 0) kick(t, 0.7);
    if (s % 8 === 4) { noise(0.14, 0.3, 1500, 'highpass', t, musicGain); }
    noise(0.04, s % 2 ? 0.05 : 0.09, 7000, 'highpass', t, musicGain);
  } else {
    const n = ARP[s % 8];
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.value = midi(n);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + d * 1.8);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + d * 2);
    if (s % 8 === 0) kick(t, 0.35);
  }
}
function kick(t, v) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.2);
}

// ---------- iso projection ----------
const ROOM = 1000;
const cam = { x: 0, y: 0, shake: 0 };
function iso(x, y, z = 0) { return { x: (x - y) - cam.x + VW / 2, y: (x + y) * 0.5 - z - cam.y + VH / 2 }; }
function isoRaw(x, y) { return { x: x - y, y: (x + y) * 0.5 }; }
function s2w(px, py) { const X = px / Z - VW / 2 + cam.x, Y = py / Z - VH / 2 + cam.y; return { x: Y + X / 2, y: Y - X / 2 }; }
function aimScreenAngle(a) { return Math.atan2((Math.cos(a) + Math.sin(a)) * 0.5, Math.cos(a) - Math.sin(a)); }
function faceFlip(a) { return Math.cos(a) - Math.sin(a) < 0; }
function camTo(x, y, dt, lead = 0) {
  const t = isoRaw(x, y);
  const k = 1 - Math.pow(0.002, dt);
  cam.x += (t.x + lead * (mouse.x / Z - VW / 2) - cam.x) * k;
  cam.y += (t.y - 40 + lead * (mouse.y / Z - VH / 2) - cam.y) * k;
}
function camSet(x, y) { const t = isoRaw(x, y); cam.x = t.x; cam.y = t.y - 40; }

// ---------- draw helpers ----------
let FLASH = false;
const F = c => FLASH ? '#ffffff' : c;
function ellipse(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } }
function shadow(x, y, r) { ellipse(x, y, r * 1.3, r * 0.6, 'rgba(0,0,0,0.35)'); }
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function poly(pts, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function isoEllipse(x, y, r, z = 0) { const c = iso(x, y, z); ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(0.1, r * 1.414), Math.max(0.1, r * 0.707), 0, 0, Math.PI * 2); }
function isoBox(x, y, hw, hd, h, top, left, right, edge) {
  const a = iso(x - hw, y - hd), b = iso(x + hw, y - hd), c = iso(x + hw, y + hd), d = iso(x - hw, y + hd);
  const up = p => ({ x: p.x, y: p.y - h });
  poly([b, c, up(c), up(b)], right, edge);
  poly([d, c, up(c), up(d)], left, edge);
  poly([a, b, c, d].map(up), top, edge);
}
function text(t, x, y, size, col, align = 'center', font = UI_FONT, weight = '700', glow = null) {
  if (CRISP && ctx === bctx) {
    const m = ctx.getTransform();
    textQueue.push({ t: String(t), x: (m.a * x + m.c * y + m.e) * PASS_PX, y: (m.b * x + m.d * y + m.f) * PASS_PX,
      size: size * Math.hypot(m.a, m.b) * PASS_PX, col, align, font, glow, alpha: ctx.globalAlpha });
    return;
  }
  ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.6; }
  ctx.fillStyle = col; ctx.fillText(t, x, y);
  ctx.shadowBlur = 0;
}
function wrapLines(str, maxW, size, font = UI_FONT) {
  MAIN.font = fontStr(size, font);
  const out = [];
  for (const para of str.split('\n')) {
    if (!para) { out.push(''); continue; }
    let ln = '';
    for (const w of para.split(' ')) {
      const t = ln ? ln + ' ' + w : w;
      if (MAIN.measureText(t).width > maxW && ln) { out.push(ln); ln = w; } else ln = t;
    }
    out.push(ln);
  }
  return out;
}
function drawTyped(lines, chars, x, y, lh, size, col, align = 'left') {
  let left = chars;
  for (let i = 0; i < lines.length && left > 0; i++) {
    const s = lines[i].slice(0, Math.max(0, Math.floor(left)));
    if (s) text(s, x, y + i * lh, size, col, align);
    left -= lines[i].length + 1;
  }
}

// =====================================================================
//  CHARACTER ART
// =====================================================================

// =====================================================================
//  HAND-PIXELLED SPRITES — one grid character = one pixel, drawn 1:1 onto
//  the low-res buffer (or at an integer multiple for portraits/title).
// =====================================================================
const SKELLY_BODY = [
  '...knnnhwwwwhnnnk...',
  '...kntnnhhhhnntnk...',
  '...kntnnnnnnnntnk...',
  '...kntnnntnnnntnk...',
  '..kntnnnntnnnnntnk..',
  '..kntnnnntnnnnntnk..',
  '..kntnnntnnnnnntnk..',
  '.kntnnnntnnnnnnntnk.',
  '.kntnnnntnnnntnntnk.',
  '.kntnnntnnnnntnntnk.',
  'kntnnnntnnnnntnnntnk',
  'kntnnnntnnnnntnnntnk',
  'kNtNNNtNNNNNtNNNtNNk',
];
const SPR_DEF = {
  skelly: {
    pal: { k: '#0a0a14', n: '#1c2c60', N: '#0e1838', t: '#1aa0b8', w: '#f4f1e8', g: '#a8a290', p: '#ee80ff', P: '#a040e0', h: '#02040a' },
    frames: [
      ['........kkkk........', '.......knnnnk.......', 'w.w...knnttnnk...w.w', 'wwww.knntnnnnnk.wwww', '.wwk.knhphhphnk.kww.',
       '..knkknhwwwwhnkknk..', '...knknwpwwpwnknk...', '....kntwwkkwwtnk....', '....kntwwwwwwtnk....', '....kntwgwwgwtnk....',
       ...SKELLY_BODY, '.kNk.kNNk.kNNk.kNk..'],
      ['........kkkk........', '.......knnnnk.......', '.w.w..knnttnnk..w.w.', 'wwww.knntnnnnnk.wwww', '.wwk.knhPhhPhnk.kww.',
       '..knkknhwwwwhnkknk..', '...knknwpwwpwnknk...', '....kntwwkkwwtnk....', '....kntwwwwwwtnk....', '....kntwgwwgwtnk....',
       ...SKELLY_BODY, '..kNk.kNNk.kNNk.kNk.'],
    ] },
  agent: {
    pal: { k: '#0e1220', W: '#e9eef7', G: '#9aa6bd', d: '#1b2236', c: '#ffffff' },
    frames: [['....c....', '....G....', '..kkkkk..', '.kWWWWWk.', '.kWcccWk.', '.kWWWWWk.', '..kkkkk..',
      'GkWWcWWkG', 'GkWcccWkG', '.kWWcWWk.', '.kWWWWWk.', '..kkkkk..', '..dd.dd..']] },
  alert: {
    pal: { k: '#2a0610', r: '#ff3b4e', R: '#c01a30', w: '#ffffff', y: '#ffd23b' },
    frames: [['.....k.....', '....krk....', '....krk....', '...krrrk...', '...krwrk...', '..krrwrrk..', '..krrwrrk..',
      '.krrrrrrrk.', '.krrrwrrrk.', 'krrrrrrrRRk', 'kkkkkkkkkkk', '...k...k...']] },
  ticket: {
    pal: { k: '#2a2418', p: '#efe9d2', q: '#cfc8ad', R: '#d0263a', l: '#a49d86', b: '#6b6450', e: '#111111' },
    frames: [
      ['...kkkkkkk..', '..kpppppppk.', '.kqpRRRpppk.', '.kqpppppppk.', '.kqeeppeepk.', '.kqpeppeppk.', '.kqpppppppk.',
       'bkqllllllpkb', 'bkqpppppppkb', '.kqllllllpk.', '.kqpppppppk.', '.kqllllpppk.', '.kqpppppppk.', '..kkkkkkkk..', '...b....b...', '..bb....bb..'],
      ['...kkkkkkk..', '..kpppppppk.', '.kqpRRRpppk.', 'bkqpppppppkb', 'bkqeeppeepkb', '.kqpeppeppk.', '.kqpppppppk.',
       '.kqllllllpk.', '.kqpppppppk.', '.kqllllllpk.', '.kqpppppppk.', '.kqllllpppk.', '.kqpppppppk.', '..kkkkkkkk..', '...b....b...', '..bb....bb..'],
    ] },
  phish: {
    pal: { k: '#3a1a00', o: '#ff9a2e', O: '#d9761c', f: '#ffd3a0', w: '#ffffff', y: '#fff6c8', Y: '#ffd23b' },
    frames: [['........kkk.....', '.......k...kyyy.', '....kkkkk...yYy.', 'k..kooooook.yyy.', 'kk.koooooooook..', 'kOkoooooowkooOk.',
      'kOOkooooooooowk.', 'kOkooffffffowwk.', 'kk.koofffffook..', 'k..kkoooooookk..', '.....kkkkkkk....']] },
  monk: {
    pal: { k: '#120c1c', M: '#5a4a75', m: '#4b3d63', d: '#3a2e4e', h: '#0b0812', y: '#ffd23b', g: '#c9a24a' },
    frames: [['....kkkk....', '...kMMMMk...', '..kMMMMMMk..', '..kMhhhhMk..', '..kMyhhyMk..', '..kMhhhhMk..', '..kkMMMMkk..',
      '.kmmmmmmmmk.', '.kmmmmmmmmk.', '.kggggggggk.', '.kmmmmmmmmk.', 'kmmmdmmdmmmk', 'kmmmdmmdmmmk', 'kmmdmmmmdmmk', 'kddddddddddk', '.kk.kkkk.kk.']] },
  priest: {
    pal: { k: '#140a1c', o: '#ff3bd0', a: '#d4af37', W: '#f0e6c8', R: '#a01020', P: '#6e3592', h: '#0b0812', y: '#ffd23b', p: '#5e2a7e', G: '#d4af37', g: '#c9a24a', d: '#4a1f64' },
    frames: [['o......kk.......', 'oo....kWWk......', 'a....kWRRWk.....', 'a....kWWWWk.....', 'a....kWRRWk.....', 'a...kkPPPPkk....',
      'a..kPPPPPPPPk...', 'a..kPhhhhhhPk...', 'a..kPhyhhyhPk...', 'a..kPhhhhhhPk...', 'a.kkPPPPPPPPkk..', 'akppppppppppppk.',
      'akpppppGGpppppk.', 'akpppGGGGGGpppk.', 'akpppppGGpppppk.', 'akpppppGGpppppk.', 'akppppppppppppk.', 'akggggggggggggk.',
      'akppppppppppppk.', 'akppdpppppdpppk.', 'akpdppppppppdpk.', 'akdpppppppppppdk', 'akdddddddddddddk', 'a.kk.kkkkkk.kk..']] },
  brute: {
    pal: { k: '#2a2618', b: '#bfb7a0', B: '#8f8873', d: '#4a4536', e: '#ffb02e', t: '#a5a5af', l: '#333333' },
    frames: [['..kkkkkkkkkkkk..', '.kbbbbbbbbbbbbk.', '.kbBBBBBBBBBBbk.', '.kbdddddddddbbk.', '.kbBBBBBBBBBBbk.', '.kbdddddddddbbk.',
      '.kbbbbbbbbbbbbk.', 'BkbbeebbbbeebbkB', 'BkbbeebbbbeebbkB', 'BkbtbbbbbbbbtbkB', 'BkbbtbbbbbbtbbkB', 'BkbbbtbbbbtbbbkB',
      'BkbbbbtbbtbbbbkB', '.kbbbbbttbbbbbk.', '.kbbbbbttbbbbbk.', '.kbbbbtbbtbbbbk.', '.kbbbtbbbbtbbbk.', '.kkkkkkkkkkkkkk.',
      '...lll....lll...', '..kkkk....kkkk..']] },
  report: {
    pal: { k: '#2a2418', p: '#fffaf0', q: '#d8d2bd', R: '#d0263a', l: '#9a9484' },
    frames: [['.kkkkkkkkkkk..', '.kpppppppppkqk', '.kpRRRRRRRpkqk', '.kpppppppppkqk', '.kplllllllpkqk', '.kpppppppppkqk',
      '.kplllllpppkqk', '.kpppppppppkqk', '.kplllllllpkqk', '.kpppppppppkqk', '.kpllllppppkqk', '.kpppppppppkqk',
      '.kppRRRRpppkqk', '.kpppppppppkqk', '.kkkkkkkkkkkqk', '..kqqqqqqqqqqk', '...kkkkkkkkkkk']] },
  ptero: {
    pal: { V: '#6a2f8a', v: '#b46ad8', y: '#ffd860', E: '#ffffff' },
    frames: [
      ['.VV.........VV......', '..VVV.....VVV.......', '...VVVV.VVVV........', '....VVvvvVV..vv.....', '.....vvvvvvvvvvEyyyy',
       '....Vvvvvvvv..vvv...', '...VV..vvv..........', '..V.....v...........', '....................'],
      ['....................', '....................', '.............vv.....', '......vvvv..vvvV....', '.....vvvvvvvvvvEyyyy',
       '...VVVvvvvVVV.vv....', '..VVVV....VVVV......', '.VVV........VVV.....', 'VV............VV....'],
    ] },
  analyst: {
    pal: { k: '#111111', s: '#e2b48c', H: '#141414', S: '#6b7280', c: '#222222', m: '#7a3a2a', g: '#202020', L: '#9ad0ff' },
    frames: [['...HHHH...', '..HHHHHH..', '..HssssH..', '..skssks..', '..ssssss..', '...smms...', '....ss....',
      '..SSSSSS..', '.SSSSSSSS.', 'sSSSSSSSSs', '.SSSSSSSS.', '.cccccccc.', '....cc....', '..cccccc..']] },
};
// per-analyst tweaks to the shared base grid: [row, replacement]
const ANALYST_ROWS = {
  MAYA: [[2, '.HHssssHH.'], [3, '.HskssksH.'], [4, '.HssssssH.'], [5, '.HHsmmsHH.'], [6, '.HH.ss.HH.']],
  DEX: [[3, '..gLggLg..']],
  KAI: [[0, '..H.HH.H..']],
  happy: [[6, 's...ss...s'], [7, 's.SSSSSS.s'], [9, '.SSSSSSSS.']],
};

const sprCache = new Map();
function buildSprite(rows, pal) {
  const h = rows.length, w = rows[0].length;
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const c = mk(), f = mk(), g = c.getContext('2d'), gf = f.getContext('2d');
  gf.fillStyle = '#ffffff';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = pal[rows[y][x]];
    if (!col) continue;
    g.fillStyle = col; g.fillRect(x, y, 1, 1); gf.fillRect(x, y, 1, 1);
  }
  return { c, f, w, h };
}
function getSprite(name, frame = 0, over = null, rows = null) {
  const key = name + frame + (over ? Object.values(over).join() : '') + (rows ? rows.join('') : '');
  let s = sprCache.get(key);
  if (!s) {
    const d = SPR_DEF[name];
    const n = d.frames.length;
    s = buildSprite(rows || d.frames[((frame % n) + n) % n], over ? { ...d.pal, ...over } : d.pal);
    sprCache.set(key, s);
  }
  return s;
}
function tintSprite(s, col) {
  const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  const g = c.getContext('2d'); g.drawImage(s.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, s.w, s.h);
  return c;
}
// user units per buffer pixel under the current transform
function sprUnit() { const m = ctx.getTransform(); return 1 / Math.hypot(m.a, m.b); }
function fitScale(s, userH) { return Math.max(1, Math.round(userH / (s.h * sprUnit()))); }
// draw anchored at bottom-centre (x,y), snapped to whole buffer pixels
function drawSprite(s, x, y, sc = 1, flip = false, mode = null) {
  const m = ctx.getTransform(), px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
  const w = s.w * sc, h = s.h * sc;
  const img = FLASH || mode === 'flash' ? s.f : mode === 'ghost' ? (s.g || (s.g = tintSprite(s, '#36d3e6'))) : s.c;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  const dx = Math.round(px - w / 2), dy = Math.round(py - h);
  if (flip) { ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, dx, dy, w, h);
  ctx.restore();
}
function bobPx(px) { return Math.round(px) * sprUnit(); }


// Skelly — hooded grim reaper: navy robe with flowing teal stripes, white skull, purple eyes.
function drawSkelly(x, y, o = {}) {
  const sp = getSprite('skelly', Math.floor(G.t * 3 + (o.walk || 0) * 0.1) % 2);
  if (!o.noShadow) shadow(x, y, 17 * (o.s || 1));
  drawSprite(sp, x, y, fitScale(sp, 80 * (o.s || 1)), false, o.ghost ? 'ghost' : null);
}
function drawScythe(x, y, ang, s = 1, glow = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  ctx.strokeStyle = '#1c130d'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; line(-16, 0, 46, 0);
  ctx.strokeStyle = '#1aa0b8'; ctx.lineWidth = 1.5; line(-10, 0, -4, 0); line(20, 0, 26, 0);
  ctx.shadowColor = '#36d3e6'; ctx.shadowBlur = 10 + glow * 15;
  ctx.fillStyle = '#d6fbff';
  ctx.beginPath(); ctx.moveTo(46, -1); ctx.quadraticCurveTo(42, -36, 8, -40); ctx.quadraticCurveTo(34, -28, 40, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#36d3e6'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.shadowBlur = 0; ctx.restore();
}

// Socrates — Zordon-style hologram head.
function drawSocratesHead(cx, cy, R, alpha = 1, talking = false) {
  ctx.save();
  const flick = Math.random() < 0.04 ? 0.55 : 1;
  ctx.globalAlpha = clamp(alpha * flick * (0.82 + Math.sin(G.t * 23) * 0.06), 0, 1);
  const C = '#6ff7ff';
  ctx.shadowColor = C; ctx.shadowBlur = 25;
  ctx.fillStyle = 'rgba(110,247,255,0.28)'; ctx.strokeStyle = C; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.15, R * 0.6, R * 0.78, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // ears
  ellipse(cx - R * 0.6, cy - R * 0.05, R * 0.1, R * 0.18, 'rgba(110,247,255,0.3)');
  ellipse(cx + R * 0.6, cy - R * 0.05, R * 0.1, R * 0.18, 'rgba(110,247,255,0.3)');
  // beard
  ctx.fillStyle = 'rgba(190,255,255,0.45)';
  ctx.beginPath(); ctx.moveTo(cx - R * 0.56, cy + R * 0.02);
  ctx.quadraticCurveTo(cx - R * 0.62, cy + R * 0.95, cx, cy + R * 1.3);
  ctx.quadraticCurveTo(cx + R * 0.62, cy + R * 0.95, cx + R * 0.56, cy + R * 0.02);
  ctx.quadraticCurveTo(cx, cy + R * 0.42, cx - R * 0.56, cy + R * 0.02); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,255,255,0.6)';
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * R * 0.12, cy + R * 0.45); ctx.quadraticCurveTo(cx + i * R * 0.14, cy + R * 0.8, cx + i * R * 0.06, cy + R * 1.1); ctx.stroke(); }
  // mustache + mouth
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(220,255,255,0.8)';
  ctx.beginPath(); ctx.moveTo(cx - R * 0.3, cy + R * 0.35); ctx.quadraticCurveTo(cx, cy + R * 0.2, cx + R * 0.3, cy + R * 0.35); ctx.stroke();
  const mo = talking ? Math.abs(Math.sin(G.t * 16)) * R * 0.1 : R * 0.015;
  ellipse(cx, cy + R * 0.42, R * 0.13, mo + 1, 'rgba(0,40,50,0.8)');
  // brows & eyes
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(220,255,255,0.9)';
  line(cx - R * 0.38, cy - R * 0.28, cx - R * 0.1, cy - R * 0.22); line(cx + R * 0.38, cy - R * 0.28, cx + R * 0.1, cy - R * 0.22);
  ctx.shadowColor = '#fff'; ctx.shadowBlur = 18;
  ellipse(cx - R * 0.23, cy - R * 0.12, R * 0.1, R * 0.05, '#ffffff'); ellipse(cx + R * 0.23, cy - R * 0.12, R * 0.1, R * 0.05, '#ffffff');
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(200,255,255,0.6)';
  line(cx, cy - R * 0.1, cx - R * 0.05, cy + R * 0.15); line(cx - R * 0.05, cy + R * 0.15, cx + R * 0.05, cy + R * 0.16);
  // wrinkles
  ctx.lineWidth = 1; for (let i = 0; i < 3; i++) line(cx - R * 0.25, cy - R * (0.5 + i * 0.1), cx + R * 0.25, cy - R * (0.5 + i * 0.1));
  // scanlines
  ctx.globalAlpha *= 0.35; ctx.fillStyle = '#002a33';
  const off = (G.t * 30) % 4;
  for (let yy = cy - R; yy < cy + R * 1.35; yy += 4) ctx.fillRect(cx - R * 0.7, yy + off, R * 1.4, 1.5);
  ctx.restore();
}

// AI Agents — colour-coded robots.
const AGENTS = [
  { id: 'TRIAGE', col: '#34e07a', icon: 'T' },
  { id: 'ENRICH', col: '#3aa8ff', icon: 'E' },
  { id: 'PHISH', col: '#ff9a2e', icon: 'P' },
  { id: 'HUNT', col: '#ff4d5e', icon: 'H' },
  { id: 'CASE', col: '#b46bff', icon: 'C' },
];
function drawAgent(x, y, a, s = 1, noShadow = false) {
  const sp = getSprite('agent', 0, { c: a.col }), sc = fitScale(sp, 50 * s);
  if (!noShadow) shadow(x, y, 10 * s);
  drawSprite(sp, x, y - bobPx(2 + Math.sin(G.t * 6 + (a.anim || 0)) * 1.5) * sc, sc);
}
// Analysts
const ANALYSTS = {
  MAYA: { hair: '#24160f', skin: '#b97a55', shirt: '#3aa8ff' },
  DEX: { hair: '#141414', skin: '#e2b48c', shirt: '#6b7280' },
  KAI: { hair: '#5a3a22', skin: '#f0c9a0', shirt: '#2fbf71' },
};
function drawAnalyst(x, y, name, s = 1, happy = false) {
  const A = ANALYSTS[name], rows = SPR_DEF.analyst.frames[0].slice();
  for (const [i, r] of (ANALYST_ROWS[name] || []).concat(happy ? ANALYST_ROWS.happy : [])) rows[i] = r;
  const sp = getSprite('analyst', 0, { H: A.hair, s: A.skin, S: A.shirt }, rows);
  shadow(x, y, 12 * s);
  drawSprite(sp, x, y, fitScale(sp, 56 * s));
}
// SOC Goblin — small green goblin in a hoodie, hunched over a keyboard, surrounded by tickets.
function drawGoblin(x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  for (let i = 0; i < 14; i++) {
    const tx = (hash(i, 1) - 0.5) * 220, ty = -4 + (hash(i, 2) - 0.5) * 26 - (i > 9 ? 40 + i * 4 : 0);
    ctx.save(); ctx.translate(tx, ty); ctx.rotate((hash(i, 3) - 0.5) * 1.2);
    ctx.fillStyle = '#efe9d2'; ctx.fillRect(-8, -5, 16, 10); ctx.fillStyle = '#d0263a'; ctx.fillRect(-6, -3, 7, 1.5);
    ctx.restore();
  }
  ctx.fillStyle = '#2a2f3a'; ctx.fillRect(-90, -34, 100, 8); ctx.fillRect(-84, -26, 6, 26); ctx.fillRect(2, -26, 6, 26);
  ctx.fillStyle = '#111'; rr(-82, -96, 58, 44, 4); ctx.fill(); ctx.fillRect(-56, -52, 6, 18);
  ctx.shadowColor = '#3aff9a'; ctx.shadowBlur = 20; ctx.fillStyle = '#0c3a24'; ctx.fillRect(-78, -92, 50, 36); ctx.shadowBlur = 0;
  ctx.fillStyle = '#3aff9a'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('TORQ WAITLIST', -76, -84); ctx.fillText('NAME: GOBLIN_', -76, -74);
  for (let i = 0; i < 3; i++) ctx.fillRect(-76, -68 + i * 4, 30 + i * 6, 1.5);
  ctx.fillStyle = '#111'; ctx.fillRect(-40, -38, 44, 5);
  // goblin body (hunched hoodie)
  ctx.fillStyle = '#3a3f4a';
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.quadraticCurveTo(46, -10, 40, -42); ctx.quadraticCurveTo(30, -64, 8, -58); ctx.quadraticCurveTo(-4, -40, 0, -26); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2c313b'; ctx.beginPath(); ctx.arc(26, -58, 13, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 7; ctx.lineCap = 'round'; line(8, -40, -14, -38);
  ellipse(-16, -38, 4, 3, '#6fbf4a');
  // head
  const hx = 4, hy = -62;
  poly([{ x: hx + 6, y: hy - 2 }, { x: hx + 30, y: hy - 14 }, { x: hx + 10, y: hy + 6 }], '#5ea83c');
  poly([{ x: hx - 8, y: hy - 4 }, { x: hx - 26, y: hy - 18 }, { x: hx - 10, y: hy + 4 }], '#5ea83c');
  ellipse(hx, hy, 12, 11, '#6fbf4a');
  poly([{ x: hx - 6, y: hy + 1 }, { x: hx - 18, y: hy + 6 }, { x: hx - 5, y: hy + 6 }], '#5ea83c');
  ctx.shadowColor = '#3aff9a'; ctx.shadowBlur = 8;
  ellipse(hx - 5, hy - 3, 3.5, 3, '#fff6a0'); ellipse(hx + 3, hy - 3, 3.5, 3, '#fff6a0'); ctx.shadowBlur = 0;
  ellipse(hx - 6, hy - 3, 1.4, 1.4, '#111'); ellipse(hx + 2, hy - 3, 1.4, 1.4, '#111');
  ctx.strokeStyle = '#2d5a1c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx - 2, hy + 4, 4, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.restore();
}

// Pterodactyl with laser eyes
function drawPtero(x, y, z, flip, s = 1) {
  ellipse(x, y, 20 * s, 7 * s, 'rgba(0,0,0,0.22)');
  const sp = getSprite('ptero', Math.floor(G.t * 8) % 2);
  drawSprite(sp, x, y - z, fitScale(sp, 34 * s), flip);
}
// Monster truck (side view, rotated onto the iso axis)
function drawTruck(x, y, s = 1, moving = false, rot = -0.4636) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 110 * s, 42 * s, rot, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(rot); ctx.scale(s, s);
  const spin = moving ? G.t * 20 : 0;
  ctx.strokeStyle = '#555'; ctx.lineWidth = 6; line(-52, -32, -10, -60); line(52, -32, 10, -60);
  for (const wx of [-56, 56]) {
    ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(wx, -32, 32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 6;
    for (let i = 0; i < 10; i++) { const a = spin + i * Math.PI / 5; line(wx + Math.cos(a) * 25, -32 + Math.sin(a) * 25, wx + Math.cos(a) * 32, -32 + Math.sin(a) * 32); }
    ellipse(wx, -32, 13, 13, '#8a8f99'); ellipse(wx, -32, 5, 5, '#36d3e6');
  }
  ctx.fillStyle = '#14141a'; rr(-86, -98, 172, 40, 8); ctx.fill();
  ctx.fillStyle = '#1b1b24'; rr(-22, -132, 66, 38, 10); ctx.fill();
  ctx.fillStyle = 'rgba(95,246,255,0.55)'; rr(-14, -126, 24, 24, 4); ctx.fill(); rr(14, -126, 22, 24, 4); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const bx = -82 + i * 24, h = 18 + (i % 2) * 8 + Math.sin(G.t * 10 + i) * 2;
    poly([{ x: bx, y: -62 }, { x: bx + 30, y: -62 - h }, { x: bx + 26, y: -62 }], '#ff6a00');
    poly([{ x: bx + 6, y: -62 }, { x: bx + 26, y: -64 - h * 0.6 }, { x: bx + 22, y: -62 }], '#ffd23b');
  }
  ellipse(-50, -82, 9, 8, '#f4f1e8'); ellipse(-53, -83, 2.2, 2.4, '#7a1aa8'); ellipse(-47, -83, 2.2, 2.4, '#7a1aa8');
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(-55, -77, 10, 4);
  text('TORQ', 40, -80, 18, '#ffffff', 'center', 'Impact, sans-serif', '400');
  ctx.fillStyle = '#888'; ctx.fillRect(-6, -150, 6, 22); ctx.fillRect(4, -146, 6, 18);
  for (let i = 0; i < 3; i++) poly([{ x: -7, y: -150 }, { x: -3 + Math.sin(G.t * 30 + i) * 3, y: -168 - i * 6 - Math.random() * 8 }, { x: 1, y: -150 }], i ? '#ffb02e' : '#c040ff');
  ctx.restore();
}

// Enemies
function drawAlert(x, y, e) {
  shadow(x, y, 12);
  const sp = getSprite('alert', 0, Math.sin(G.t * 12 + e.anim) > 0 ? null : { w: '#ffd23b' });
  const hop = e.state === 'lunge' ? 0 : bobPx(Math.abs(Math.sin(e.t * 10)) * 2);
  drawSprite(sp, x, y - hop, 1, false, e.state === 'wind' && Math.floor(G.t * 20) % 2 ? 'flash' : null);
}
function drawTicket(x, y, e) {
  shadow(x, y, 18);
  drawSprite(getSprite('ticket', e.state === 'wind' ? 1 : 0), x, y - bobPx(Math.abs(Math.sin(e.t * 6))), 1);
}
function drawPhish(x, y, e, flip) {
  shadow(x, y, 14);
  drawSprite(getSprite('phish', 0, e.shootFx > 0 ? { y: '#ffffff' } : null), x, y - bobPx(4 + Math.sin(e.t * 5) * 1.5), 1, flip);
}
function drawMonk(x, y, e, flip, sc = 1, priest = false) {
  shadow(x, y, (priest ? 9 : 16) * sc);
  const sp = getSprite(priest ? 'priest' : 'monk');
  drawSprite(sp, x, y, fitScale(sp, priest ? sc * 48 : sc * 60), flip);
}
function drawBrute(x, y, e) {
  shadow(x, y, 30);
  const angry = e.state === 'wind' || e.state === 'charge';
  const sp = getSprite('brute', 0, angry ? { e: '#ff2a2a' } : null);
  drawSprite(sp, x + (e.state === 'charge' ? bobPx(Math.sin(e.t * 40)) : 0), y - bobPx(Math.abs(Math.sin(e.t * 5))), 1);
}
function drawReport(x, y, e) {
  shadow(x, y, 22);
  drawSprite(getSprite('report'), x, y - bobPx(10 + Math.sin(e.t * 4) * 2), 1);
}
function rack(x, y, w, h, metal, dark, led, seed) {
  ctx.fillStyle = F(metal); ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  let row = 0;
  for (let yy = y + 6; yy < y + h - 8; yy += 12, row++) {
    ctx.fillStyle = dark; ctx.fillRect(x + 5, yy, w - 10, 7);
    const n = Math.floor((w - 14) / 10);
    for (let i = 0; i < n; i++) {
      const hv = hash(seed, i, row);
      if (Math.sin(G.t * (2 + hv * 6) + hv * 20) > 0.15) { ctx.fillStyle = hv < 0.7 ? led : '#4dff7a'; ctx.fillRect(x + 8 + i * 10, yy + 2, 3, 3); }
    }
  }
}
function drawSOAC(x, y, e, sc = 1) {
  const k = e.k || 0;
  const red = mix('#ff2a2a', '#35c8ff', k), metal = mix('#3b414d', '#1f3d5e', k), dark = mix('#22262e', '#0e2238', k);
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 130 * sc, 55 * sc, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(sc, sc);
  const br = Math.sin(G.t * 2) * 3, arm = e.arm || 0;
  if (k > 0) { ctx.shadowColor = '#35c8ff'; ctx.shadowBlur = 40 * k; }
  rack(-64, -82, 44, 82, metal, dark, red, 1); rack(20, -82, 44, 82, metal, dark, red, 2);
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(sd * 96, -208 + br); ctx.rotate(sd * (0.12 + Math.sin(G.t * 1.5 + sd) * 0.05) - sd * arm * 1.1);
    rack(-24, 0, 48, 118, metal, dark, red, 3 + sd);
    ctx.fillStyle = F(metal); rr(-30, 114, 60, 46, 8); ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  rack(-86, -218 + br, 172, 142, metal, dark, red, 5);
  ctx.shadowBlur = 0;
  if (k < 0.6) {
    ctx.strokeStyle = `rgba(170,170,180,${0.85 * (1 - k / 0.6)})`; ctx.lineWidth = 13;
    line(-80, -205 + br, 80, -92 + br); line(80, -205 + br, -80, -92 + br);
  }
  ctx.fillStyle = k > 0.5 ? '#0b2a44' : '#151515'; rr(-46, -166 + br, 92, 24, 4); ctx.fill(); ctx.strokeStyle = red; ctx.lineWidth = 1.5; ctx.stroke();
  text(k > 0.5 ? 'HYPERSOC' : 'S.O.A.C', 0, -154 + br, 15, red, 'center', 'Impact, sans-serif', '400', red);
  ctx.fillStyle = F(dark); rr(-56, -292 + br, 112, 72, 8); ctx.fill(); ctx.strokeStyle = F(metal); ctx.lineWidth = 3; ctx.stroke();
  for (const ex of [-46, 8]) {
    ctx.fillStyle = '#000'; ctx.fillRect(ex, -280 + br, 38, 26);
    ctx.shadowColor = red; ctx.shadowBlur = 15; ctx.fillStyle = red;
    for (let b = 0; b < 5; b++) { const h = (0.3 + 0.7 * Math.abs(Math.sin(G.t * 4 + b * 1.3 + ex))) * 22; ctx.fillRect(ex + 3 + b * 7, -256 + br - h, 5, h); }
    ctx.shadowBlur = 0;
  }
  ctx.strokeStyle = metal; ctx.lineWidth = 2.5; for (let i = 0; i < 6; i++) line(-30 + i * 12, -244 + br, -30 + i * 12, -228 + br);
  ctx.lineWidth = 3; line(32, -292 + br, 44, -326 + br);
  ctx.fillStyle = k > 0.5 ? '#35c8ff' : '#efe9d2'; ctx.fillRect(44, -328 + br, 22, 12);
  ctx.restore();
}

// =====================================================================
//  GAME DATA
// =====================================================================
const ETYPES = {
  alert: { hp: 20, r: 14, spd: 155, dmg: 8, h: 40, col: '#ff3b4e' },
  ticket: { hp: 65, r: 20, spd: 78, dmg: 14, h: 58, col: '#efe9d2' },
  phish: { hp: 32, r: 16, spd: 120, dmg: 10, h: 50, col: '#ff9a2e' },
  monk: { hp: 80, r: 18, spd: 70, dmg: 10, h: 60, col: '#8a5cff' },
  brute: { hp: 170, r: 30, spd: 72, dmg: 22, h: 88, col: '#bfb7a0', heavy: true },
  report: { hp: 90, r: 26, spd: 100, dmg: 26, h: 90, col: '#fffaf0', heavy: true },
  priest: { hp: 950, r: 32, spd: 90, dmg: 14, h: 150, col: '#c04cff', heavy: true, boss: true, name: 'HIGH PRIEST OF THE SOAR BROTHERHOOD' },
  soac: { hp: 2800, r: 95, spd: 40, dmg: 25, h: 330, col: '#ff2a2a', heavy: true, boss: true, name: 'S.O.A.C — THE SPIRIT OF ANCIENT COMPLEXITY' },
};

const THEMES = [
  { f1: '#151b30', f2: '#19203a', line: '#26345e', wall: '#10162b', acc: '#ff3b4e' },
  { f1: '#1d1a24', f2: '#231f2b', line: '#3a3446', wall: '#16131c', acc: '#efe9d2' },
  { f1: '#0e1f2a', f2: '#112532', line: '#1f4255', wall: '#0a1820', acc: '#ff9a2e' },
  { f1: '#141b24', f2: '#18212c', line: '#24384a', wall: '#0e141c', acc: '#34e07a' },
  { f1: '#1c1428', f2: '#21182f', line: '#3a2a52', wall: '#150f1f', acc: '#8a5cff' },
  { f1: '#1a1816', f2: '#201d1a', line: '#3a342c', wall: '#131110', acc: '#ffb02e' },
  { f1: '#24121a', f2: '#2a151e', line: '#4a2232', wall: '#1a0c12', acc: '#ff3b4e' },
  { f1: '#1f1030', f2: '#251338', line: '#43245e', wall: '#170b24', acc: '#c04cff' },
  { f1: '#0d1418', f2: '#10191e', line: '#1d3640', wall: '#091014', acc: '#36d3e6' },
  { f1: '#1a0c0c', f2: '#200f0f', line: '#4a1a1a', wall: '#120707', acc: '#ff2a2a' },
];

const L = (who, text) => ({ who, text });
// 5 rooms; every story beat and line from the original 10 is kept, merged into fewer rooms.
// `atmos` picks the ATMOS/THEMES look for the room.
const LEVELS = [
  { name: 'The SOC Floor', atmos: 0, racks: 2, desks: true, waves: [{ alert: 4 }, { alert: 5, ticket: 1 }] },
  { name: 'The Phishing Docks', atmos: 2, racks: 3, waves: [{ ticket: 2, alert: 3 }, { phish: 3, alert: 2 }],
    intro: () => say([
      L('SOCRATES', 'The Ticket Queue. Each ticket is a copy-paste prayer to a god that never answers. Smash them before they file more of themselves.'),
      L('SOCRATES', 'Phish ahead. They hurl malicious emails from afar. Close the distance — or answer with your Phishing Annihilation Wave. [Q]'),
      L('SKELLY', 'Reply all.'),
      L('KAI', 'I\'ve been triaging alerts out here for three years. I don\'t even remember what the sun looks like.'),
      L('SKELLY', 'Then let\'s go find it.'),
    ], beginLevel) },
  { name: 'The Agent Foundry', atmos: 3, racks: 4, waves: [{ alert: 5, ticket: 2 }, { phish: 2, alert: 4 }],
    intro: () => say([
      L('SOCRATES', 'You have proven worthy, Skelly. Raise your bony fist and cast the fifth Sacred Skill...'),
      L('SOCRATES', '🤖 SUMMON AI AGENTS — deal damage to fill the Agent meter, then press [E] to deploy them.'),
    ], () => {
      stats.agentsUnlocked = true; summonAgents(stats.agentDur);
      say([
        L('AGENT TRIAGE', 'Classifying. Correlating. Dismissing false positives.'),
        L('AGENT CASE', 'Incident timeline assembled. Report drafted. You\'re welcome.'),
        L('MAYA', 'They\'re doing... everything.'),
      ], beginLevel);
    }) },
  { name: 'Temple of the SOAR Brotherhood', atmos: 4, racks: 2, waves: [{ monk: 2, alert: 3 }, { brute: 1, monk: 1, phish: 1 }, { priest: 1 }],
    intro: () => say([
      L('SOCRATES', 'The Temple of the SOAR Brotherhood. Its monks chant playbooks nobody has updated since 2015 — and they summon alerts to feed the queue. Silence them first.'),
      L('SOCRATES', 'Its walls rest on the Legacy Dungeon, where software goes to calcify. Legacy Servers charge in straight lines. Dash aside — then strike while they reboot.'),
      L('SOCRATES', 'The High Priest of the SOAR Brotherhood guards the way down. In forty years he has never once closed a ticket.'),
      L('HIGH PRIEST', 'HERETIC! All automation must first be approved by the Change Advisory Board!'),
    ], beginLevel) },
  { name: 'The Core — S.O.A.C', atmos: 9, racks: 0, boss: true, waves: [{ soac: 1 }],
    intro: () => say([
      L('SOCRATES', 'The ground trembles. Something ancient stirs beneath the datacenter. The source of all this suffering lies just below.'),
      L('SOCRATES', 'Here it rises — assembled from ten thousand obsolete servers, held together by duct tape and SOAR licensing fees, powered by every analyst who ever copy-pasted a ticket number at 3 a.m.'),
    ], beginLevel) },
];
// difficulty knobs (halved from the original tuning)
const DIFF = { dmg: 0.5, hp: 0.7, bossHp: 0.6, heal: 0.35 };
const BOSS_LINES = [
  L('S.O.A.C', 'I AM THE PROCESS. I HAVE ALWAYS BEEN THE PROCESS. THE ANALYSTS ARE MINE. EVERY TICKET FEEDS ME.'),
  L('S.O.A.C', 'YOU CANNOT AUTOMATE WHAT YOU CANNOT UNDERSTAND — AND YOU WILL NEVER UNDERSTAND ALL OF ME.'),
  L('SKELLY', 'Good. I didn\'t come here to understand you. I came here to replace you.'),
];

const BOONS = [
  { agent: 0, name: 'Hyperautomation Strike+', desc: 'Scythe damage +25%', apply: s => { s.atkMul *= 1.25; } },
  { agent: 0, name: 'Rapid Triage', desc: 'Attack speed +20%', apply: s => { s.atkSpd *= 1.2; } },
  { agent: 0, name: 'Agent Overclock', desc: 'Agent meter fills 50% faster, agents last 4s longer', need: 'agents', apply: s => { s.agentGain *= 1.5; s.agentDur += 4; } },
  { agent: 1, name: 'Enrichment Overload', desc: 'Pulse radius +20%, damage +30%', apply: s => { s.pulseRad *= 1.2; s.pulseDmg *= 1.3; } },
  { agent: 1, name: 'Real-Time Context', desc: 'Pulse cooldown -25%', apply: s => { s.pulseCd *= 0.75; } },
  { agent: 2, name: 'Phishing Net', desc: 'Wave fires +1 extra projectile', apply: s => { s.castN++; } },
  { agent: 2, name: 'Spam Filter', desc: '+1 Wave charge, recharges 25% faster', apply: s => { s.castMax++; s.castRe *= 0.75; } },
  { agent: 3, name: 'Lateral Movement', desc: '+1 Dash charge', apply: s => { s.dashMax++; } },
  { agent: 3, name: 'Threat Hunter', desc: 'Dashing through enemies deals 20 damage', apply: s => { s.dashDmg += 20; } },
  { agent: 3, name: 'Pterodactyl Firmware v2', desc: 'Pterodactyl Strike [T] recharges 50% faster', apply: s => { s.pteroRate *= 1.5; } },
  { agent: 4, name: 'Incident Report', desc: '+25 Max HP and full heal', apply: s => { s.maxHp += 25; player.hp = s.maxHp; } },
  { agent: 4, name: 'Auto-Remediation', desc: 'Heal 3% of all damage you deal', apply: s => { s.lifesteal += 0.03; } },
];

// =====================================================================
//  STATE
// =====================================================================
const G = {
  state: 'title', t: 0, level: 0, wave: -1, waveDelay: 0, cleared: false, reward: null, doorOpen: false, levelStarted: false,
  banner: null, bark: null, hitstop: 0, inputLock: 0, holoVis: 0, holoForce: 0,
  alerts: 10000, alertsDisp: 10000, perKill: 1, kills: 0, time: 0, hits: 0, fade: null,
  truck: null, truckParked: false, slides: null, slideI: 0, slideT: 0, onSlides: null,
  boonChoices: [], cardRects: [], deadT: 0, trT: 0, trBoss: null, trSaid: false, trBoom: false, introStage: 0, introT: 0,
};
let stats, player, ptero = { hidden: true, x: 0, y: 0, z: 90, a: 0, cd: 0, mode: 'orbit', beams: [] };
let enemies = [], projs = [], eprojs = [], parts = [], texts = [], tele = [], agents = [], obstacles = [], pickups = [];
let dlg = null, nextId = 1;

function baseStats() {
  return { atkMul: 1, atkSpd: 1, pulseRad: 150, pulseDmg: 28, pulseCd: 3.5, castN: 1, castMax: 3, castRe: 2.2, dashMax: 2, dashDmg: 0,
    maxHp: 100, lifesteal: 0, pteroRate: 1, agentGain: 1, agentDur: 12, agentsUnlocked: false, bindUnlocked: false, boons: [] };
}
function newPlayer() {
  return { x: 500, y: 880, r: 18, hp: stats.maxHp, face: -Math.PI * 0.75, aim: 0, atkT: 0, atkDur: 0.3, atkCombo: 0, comboReset: 0, swingC: 0,
    atkHit: new Set(), dashT: 0, dashCh: stats.dashMax, dashRe: 0, dashDir: { x: 0, y: 0 }, dashHit: new Set(), inv: 0, pulseCd: 0,
    castAmmo: stats.castMax, castReT: 0, meter: 0, flash: 0, walk: 0, hidden: false, ghostT: 0 };
}

// ---------- fx ----------
function addPart(o) { o.max = o.max || o.life; parts.push(Object.assign({ z: 0, vx: 0, vy: 0, vz: 0, col: '#fff', sz: 3, kind: 'spark', grav: 0 }, o)); }
function burst(x, y, col, n, spd, z = 20) {
  for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * spd; addPart({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(50, 250), grav: 500, life: rand(0.3, 0.7), col, sz: rand(2, 4.5) }); }
}
function ring(x, y, r0, r1, col, life = 0.35) { addPart({ kind: 'ring', x, y, r0, r1, col, life }); }
function addText(x, y, txt, col, size = 16) { texts.push({ x: x + rand(-8, 8), y, z: 50, t: 0.8, txt, col, size }); }
function banner(t, dur = 2.2, col = '#ffffff') { G.banner = { text: t, t: dur, max: dur, col }; }
function bark(who, t) { G.bark = { who, text: t, t: 3.2 }; }
function say(lines, cb) { dlg = { lines, i: 0, chars: 0, cb, blip: 0 }; }
function transition(cb) { if (!G.fade) G.fade = { t: 0, cb, done: false }; }

// =====================================================================
//  FLOW
// =====================================================================
function startGame() {
  stats = baseStats(); player = newPlayer();
  ptero = { hidden: true, x: 0, y: 0, z: 90, a: 0, cd: 0, mode: 'orbit', beams: [] };
  let total = 0;
  for (const Lv of LEVELS) for (const w of Lv.waves) for (const [k, v] of Object.entries(w)) if (!ETYPES[k].boss) total += v;
  G.perKill = Math.floor(9000 / (total * 1.35));
  G.alerts = 10000; G.alertsDisp = 10000; G.kills = 0; G.time = 0; G.hits = 0; G.truckParked = false;
  setMusic('calm');
  showSlides([SLIDES.ch1], () => transition(startIntro));
}
function showSlides(list, cb) { G.state = 'story'; G.slides = list; G.slideI = 0; G.slideT = 0; G.onSlides = cb; }
function startIntro() {
  setupLevel(0);
  G.state = 'intro'; G.introStage = 0; G.introT = 0;
  G.truck = { x: 430, y: ROOM + 600 };
  player.hidden = true; ptero.hidden = true;
  camSet(500, 700);
}
function setupLevel(i) {
  const Lv = LEVELS[i];
  G.level = i; enemies = []; eprojs = []; projs = []; tele = []; parts = []; texts = []; pickups = []; obstacles = [];
  if (i !== 2) agents = []; // agents summoned during the Agent Foundry intro carry into its fight
  G.wave = -1; G.waveDelay = 0; G.cleared = false; G.reward = null; G.doorOpen = false; G.levelStarted = false; G.bark = null;
  const avoid = [{ x: 500, y: 880, r: 200 }, { x: 500, y: 500, r: 170 }, { x: 500, y: 40, r: 190 }, { x: 110, y: 110, r: 140 }];
  if (Lv.desks) {
    [[140, 300, 'MAYA'], [140, 520, 'DEX'], [140, 740, 'KAI']].forEach(([x, y, n]) => obstacles.push({ x, y, r: 44, kind: 'desk', name: n }));
    avoid.push({ x: 430, y: 720, r: 190 });
    if (G.truckParked) obstacles.push({ kind: 'truck', x: 430, y: 720, r: 60 });
  }
  for (let n = 0, tries = 0; n < (Lv.racks || 0) && tries < 300; tries++) {
    const x = rand(160, 840), y = rand(160, 840);
    if (avoid.some(a => Math.hypot(x - a.x, y - a.y) < a.r)) continue;
    if (obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.r + 130)) continue;
    obstacles.push({ x, y, r: 34, kind: 'rack', seed: randi(1, 999) });
    n++;
  }
  G.tufts = genTufts();
  player.x = 500; player.y = 880; player.dashT = 0; player.atkT = 0; player.inv = 0;
  player.dashCh = stats.dashMax; player.castAmmo = stats.castMax; player.pulseCd = 0;
  ptero.x = player.x; ptero.y = player.y;
  camSet(player.x, player.y);
}
function enterLevel(i, skipIntro = false) {
  setupLevel(i);
  G.state = 'play';
  const Lv = LEVELS[i];
  setMusic(Lv.boss ? 'boss' : 'fight');
  if (!skipIntro && Lv.intro) Lv.intro(); else beginLevel();
}
function beginLevel() {
  G.state = 'play'; G.levelStarted = true; G.waveDelay = 1.0; G.inputLock = 0.25;
  banner(`LEVEL ${G.level + 1} / ${LEVELS.length}  ·  ${LEVELS[G.level].name.toUpperCase()}`, 2.6);
  setMusic(LEVELS[G.level].boss ? 'boss' : 'fight');
}
function retryLevel() { transition(() => { player.hp = stats.maxHp; player.flash = 0; enterLevel(G.level, true); }); }
function levelCleared() {
  G.cleared = true;
  for (const e of enemies) if (!e.dead) { e.dead = true; burst(e.x, e.y, e.col, 10, 150); }
  eprojs = []; tele = [];
  banner('ROOM CLEARED', 2, '#36d3e6');
  G.reward = { x: 500, y: 500, t: 0 };
  SFX.open();
}
function nextLevel() {
  transition(() => {
    const heal = Math.round(stats.maxHp * DIFF.heal);
    player.hp = Math.min(stats.maxHp, player.hp + heal);
    enterLevel(G.level + 1);
    addText(player.x, player.y, `+${heal} (Agent CASE patched you up)`, '#4dff7a', 14);
  });
}
function openBoon() {
  G.state = 'boon';
  const pool = BOONS.filter(b => !b.need || (b.need === 'agents' && stats.agentsUnlocked));
  const byAgent = shuffle(pool.slice());
  const choices = [];
  for (const b of byAgent) { if (choices.length >= 3) break; if (!choices.some(c => c.agent === b.agent)) choices.push(b); }
  G.boonChoices = choices; G.reward = null; SFX.boon();
}
function chooseBoon(i) {
  const b = G.boonChoices[i]; if (!b) return;
  b.apply(stats); stats.boons.push(b);
  player.dashCh = Math.min(player.dashCh, stats.dashMax);
  G.state = 'play'; G.doorOpen = true; G.inputLock = 0.3;
  banner(`${b.name.toUpperCase()} ACQUIRED — THE EXIT IS OPEN`, 2.4, AGENTS[b.agent].col);
  SFX.open();
}
function startTransform(e) {
  G.state = 'transform'; G.trT = 0; G.trBoss = e; G.trSaid = false; G.trBoom = false; G.banner = null;
  agents = AGENTS.map((A, i) => ({ ...A, x: e.x, y: e.y, r: 12, t: 99, cd: 0, anim: i, face: 0 }));
  SFX.summon(); cam.shake = 10;
}
function startEnding() {
  G.state = 'story'; setMusic('calm');
  showSlides([SLIDES.ch7, SLIDES.epi, SLIDES.goblin, SLIDES.final], () => transition(() => { G.state = 'title'; setMusic('calm'); }));
}

// =====================================================================
//  ENTITIES
// =====================================================================
function spawnEnemy(type, x, y) {
  const T = ETYPES[type];
  const sc = T.boss ? DIFF.bossHp : DIFF.hp * (1 + G.level * 0.1);
  const e = { id: nextId++, type, x: clamp(x, 60, ROOM - 60), y: clamp(y, 60, ROOM - 60), r: T.r, hp: T.hp * sc, maxHp: T.hp * sc, spd: T.spd,
    dmg: T.dmg, col: T.col, h: T.h, heavy: !!T.heavy, boss: !!T.boss, name: T.name, kx: 0, ky: 0, flash: 0, spawnT: 0.9, t: 0,
    state: 'chase', st: 0, cd: rand(0.6, 2), face: 0, anim: rand(0, 10), strafe: Math.random() < 0.5 ? 1 : -1, shootFx: 0 };
  enemies.push(e);
  return e;
}
function findSpawn() {
  for (let k = 0; k < 50; k++) {
    const x = rand(90, ROOM - 90), y = rand(90, ROOM - 90);
    if (Math.hypot(x - player.x, y - player.y) < 280) continue;
    if (obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.r + 40)) continue;
    return { x, y };
  }
  return { x: rand(150, 850), y: rand(100, 300) };
}
function spawnWave(w) {
  for (const [type, n] of Object.entries(w)) for (let i = 0; i < n; i++) {
    if (type === 'soac') {
      const e = spawnEnemy('soac', 380, 380); e.spawnT = 2.8; e.mt = 0; e.tx = 380; e.ty = 380;
      e.onSpawn = () => say(BOSS_LINES, () => { e.introDone = true; e.cd = 1.2; G.inputLock = 0.3; });
    } else if (type === 'priest') {
      const e = spawnEnemy('priest', 500, 380); e.spawnT = 1.6;
      e.onSpawn = () => bark('HIGH PRIEST', 'Thou shalt open a ticket to request thine own destruction!');
    } else {
      const p = findSpawn(); const e = spawnEnemy(type, p.x, p.y); e.spawnT = 0.9 + rand(0, 0.6);
    }
  }
}
function fireE(x, y, a, spd, kind, dmg) { eprojs.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: kind === 'mail' ? 10 : 9, dmg, kind, life: 4, a }); }
function addTele(o) { tele.push(Object.assign({ kind: 'circle', dmg: 0 }, o, { max: o.t })); }

function collideWorld(o) {
  const m = o.r + 8;
  o.x = clamp(o.x, m, ROOM - m); o.y = clamp(o.y, m, ROOM - m);
  for (const ob of obstacles) {
    const dx = o.x - ob.x, dy = o.y - ob.y, d = Math.hypot(dx, dy), md = o.r + ob.r;
    if (d < md && d > 0.01) { o.x = ob.x + dx / d * md; o.y = ob.y + dy / d * md; }
  }
}

function damageEnemy(e, dmg, ang, kb = 100, fromPlayer = true, quiet = false) {
  if (e.dead || e.invuln || e.spawnT > 0) return;
  e.hp -= dmg; e.flash = 0.1;
  const kf = e.heavy ? 0.12 : 1;
  e.kx = Math.cos(ang) * kb * kf; e.ky = Math.sin(ang) * kb * kf;
  addText(e.x, e.y, Math.round(dmg), fromPlayer ? '#ffffff' : '#bfefff', fromPlayer ? 17 : 13);
  burst(e.x, e.y, e.col, 4, 140);
  if (!quiet) { SFX.hit(); G.hitstop = 0.035; }
  if (fromPlayer) {
    if (stats.agentsUnlocked) player.meter = Math.min(100, player.meter + dmg * 0.35 * stats.agentGain);
    if (stats.lifesteal) player.hp = Math.min(stats.maxHp, player.hp + dmg * stats.lifesteal);
  }
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.type === 'soac') { e.hp = 1; return; }
  e.dead = true;
  burst(e.x, e.y, e.col, e.boss ? 60 : 16, e.boss ? 400 : 220);
  ring(e.x, e.y, 5, e.r * 2.5, e.col, 0.3);
  SFX.die();
  if (e.type === 'report') { burst(e.x, e.y, '#fffaf0', 30, 300); return; }
  G.kills++;
  G.alerts = Math.max(1, G.alerts - G.perKill - randi(0, 25));
  if (Math.random() < 0.07 && player.hp < stats.maxHp) pickups.push({ x: e.x, y: e.y, t: 0 });
  if (e.type === 'priest') { cam.shake = 20; SFX.boom(); bark('HIGH PRIEST', 'My... change request... was never... approved...'); }
}
function hurtPlayer(d) {
  const p = player;
  d = Math.max(1, Math.round(d * DIFF.dmg));
  if (p.inv > 0 || p.dashT > 0 || G.state !== 'play') return;
  p.hp -= d; p.inv = 0.7; p.flash = 0.15; G.hits++;
  cam.shake = Math.max(cam.shake, 10);
  SFX.hurt(); addText(p.x, p.y, '-' + d, '#ff4d5e', 18); burst(p.x, p.y, '#ff4d5e', 10, 160);
  if (p.hp <= 0) { p.hp = 0; G.state = 'dead'; G.deadT = 0; SFX.boom(); setMusic('calm'); }
}
function summonAgents(dur) {
  agents = AGENTS.map((A, i) => {
    const a = i / 5 * Math.PI * 2;
    const ag = { ...A, x: player.x + Math.cos(a) * 60, y: player.y + Math.sin(a) * 60, r: 12, t: dur, cd: rand(0, 0.4), anim: i, face: 0 };
    collideWorld(ag); burst(ag.x, ag.y, A.col, 14, 180);
    return ag;
  });
  SFX.summon(); banner('🤖 AI AGENTS DEPLOYED', 1.6, '#b46bff');
}

// ---------- player ----------
function startSwing() {
  const p = player;
  if (p.comboReset <= 0) p.atkCombo = 0;
  const c = p.atkCombo;
  const dur = (c === 2 ? 0.42 : 0.3) / stats.atkSpd;
  p.atkT = dur; p.atkDur = dur; p.comboReset = dur + 0.35; p.atkCombo = (c + 1) % 3; p.swingC = c;
  p.face = p.aim; p.atkHit = new Set();
  const lunge = c === 2 ? 26 : 12;
  p.x += Math.cos(p.aim) * lunge; p.y += Math.sin(p.aim) * lunge;
  SFX.swing();
}
function updatePlayer(dt) {
  const p = player;
  const mw = s2w(mouse.x, mouse.y); p.aim = Math.atan2(mw.y - p.y, mw.x - p.x);
  if (p.inv > 0) p.inv -= dt;
  if (p.flash > 0) p.flash -= dt;
  if (G.inputLock > 0) G.inputLock -= dt;
  const canAct = G.inputLock <= 0;
  let sx = 0, sy = 0;
  if (keys.KeyA || keys.ArrowLeft) sx--; if (keys.KeyD || keys.ArrowRight) sx++;
  if (keys.KeyW || keys.ArrowUp) sy--; if (keys.KeyS || keys.ArrowDown) sy++;
  let wx = sy + sx, wy = sy - sx; const l = Math.hypot(wx, wy); if (l > 0) { wx /= l; wy /= l; }

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.dashDir.x * 950 * dt; p.y += p.dashDir.y * 950 * dt;
    p.ghostT -= dt;
    if (p.ghostT <= 0) { p.ghostT = 0.03; addPart({ kind: 'ghost', x: p.x, y: p.y, life: 0.25, flip: faceFlip(p.face) }); }
    if (stats.dashDmg) for (const e of enemies) if (!p.dashHit.has(e) && !e.dead && dist(p, e) < e.r + p.r + 6) { p.dashHit.add(e); damageEnemy(e, stats.dashDmg * stats.atkMul, Math.atan2(e.y - p.y, e.x - p.x), 150, true, true); }
  } else {
    const atking = p.atkT > 0;
    const spd = atking ? 95 : 275;
    p.x += wx * spd * dt; p.y += wy * spd * dt;
    if (l > 0) { p.walk += dt * 12; if (!atking) p.face = Math.atan2(wy, wx); }
  }
  // dash
  if (p.dashCh < stats.dashMax) { p.dashRe += dt; if (p.dashRe >= 0.9) { p.dashRe = 0; p.dashCh++; } }
  if (canAct && (pressed.Space || pressed.ShiftLeft || pressed.ShiftRight) && p.dashCh > 0 && p.dashT <= 0) {
    p.dashCh--; p.dashT = 0.17; p.inv = Math.max(p.inv, 0.22); p.atkT = 0; p.dashHit = new Set();
    p.dashDir = l > 0 ? { x: wx, y: wy } : { x: Math.cos(p.aim), y: Math.sin(p.aim) };
    p.face = Math.atan2(p.dashDir.y, p.dashDir.x);
    SFX.dash();
  }
  // primary: Hyperautomation Strike
  p.atkT -= dt; p.comboReset -= dt;
  if (canAct && p.dashT <= 0 && p.atkT <= 0 && (mouse.down[0] || keys.KeyJ || mouse.pressed[0] || pressed.KeyJ)) startSwing();
  if (p.atkT > 0 && (p.atkDur - p.atkT) < p.atkDur * 0.6) {
    const c = p.swingC, range = c === 2 ? 125 : 98, arc = c === 2 ? Math.PI * 0.75 : Math.PI * 0.55, dmg = (c === 2 ? 24 : 13) * stats.atkMul;
    for (const e of enemies) {
      if (p.atkHit.has(e) || e.dead || e.spawnT > 0) continue;
      const d = dist(p, e); if (d > range + e.r) continue;
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      if (Math.abs(angDiff(p.face, a)) > arc && d > e.r + 12) continue;
      p.atkHit.add(e); damageEnemy(e, dmg, a, c === 2 ? 280 : 130);
    }
  }
  // special: Threat Enrichment Pulse
  p.pulseCd -= dt;
  if (canAct && (mouse.pressed[2] || pressed.KeyK) && p.pulseCd <= 0) {
    p.pulseCd = stats.pulseCd;
    ring(p.x, p.y, 20, stats.pulseRad, '#36d3e6', 0.35); ring(p.x, p.y, 10, stats.pulseRad * 0.7, '#b46bff', 0.3);
    for (const e of enemies) { const d = dist(p, e); if (d < stats.pulseRad + e.r) damageEnemy(e, stats.pulseDmg * stats.atkMul, Math.atan2(e.y - p.y, e.x - p.x), 380, true, true); }
    eprojs = eprojs.filter(b => { const keep = Math.hypot(b.x - p.x, b.y - p.y) > stats.pulseRad; if (!keep) burst(b.x, b.y, '#36d3e6', 3, 80); return keep; });
    cam.shake = Math.max(cam.shake, 7); SFX.pulse();
  }
  // cast: Phishing Annihilation Wave
  if (p.castAmmo < stats.castMax) { p.castReT += dt; if (p.castReT >= stats.castRe) { p.castReT = 0; p.castAmmo++; } }
  if (canAct && (pressed.KeyQ || pressed.KeyL) && p.castAmmo > 0) {
    p.castAmmo--;
    const n = stats.castN;
    for (let i = 0; i < n; i++) {
      const a = p.aim + (i - (n - 1) / 2) * 0.22;
      projs.push({ kind: 'wave', x: p.x, y: p.y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, life: 0.9, r: 34, dmg: 22 * stats.atkMul, hit: new Set(), pierce: true, a, kb: 160 });
    }
    SFX.cast();
  }
  // Summon AI Agents
  if (canAct && pressed.KeyE && stats.agentsUnlocked && p.meter >= 100) { p.meter = 0; summonAgents(stats.agentDur); }
  if (canAct && pressed.KeyT) pteroStrike();
}

// ---------- enemies ----------
function updateEnemy(e, dt) {
  e.t += dt; if (e.flash > 0) e.flash -= dt; if (e.shootFx > 0) e.shootFx -= dt;
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    if (e.type === 'soac') cam.shake = Math.max(cam.shake, 8);
    if (e.spawnT <= 0 && e.onSpawn) { const f = e.onSpawn; e.onSpawn = null; f(e); }
    return;
  }
  e.x += e.kx * dt; e.y += e.ky * dt; const dec = Math.pow(0.002, dt); e.kx *= dec; e.ky *= dec;
  const p = player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, ang = Math.atan2(dy, dx);
  e.cd -= dt;
  const mv = (vx, vy, sp) => { e.x += vx * sp * dt; e.y += vy * sp * dt; if (sp > 0 && (vx || vy)) e.face = Math.atan2(vy, vx); };
  switch (e.type) {
    case 'alert':
      if (e.state === 'chase') { mv(ux, uy, e.spd); if (d < 130 && e.cd <= 0) { e.state = 'wind'; e.st = 0.35; e.la = ang; } }
      else if (e.state === 'wind') { e.st -= dt; if (e.st <= 0) { e.state = 'lunge'; e.st = 0.25; } }
      else if (e.state === 'lunge') { mv(Math.cos(e.la), Math.sin(e.la), 440); e.st -= dt; if (e.st <= 0) { e.state = 'chase'; e.cd = rand(1, 1.8); } }
      if (d < e.r + p.r + 4) hurtPlayer(e.dmg);
      break;
    case 'ticket':
      if (e.state === 'chase') {
        mv(ux, uy, e.spd);
        if (d < 80) { e.state = 'wind'; e.st = 0.6; addTele({ x: e.x + ux * 42, y: e.y + uy * 42, r: 50, t: 0.6, dmg: e.dmg, owner: e }); }
      } else if (e.state === 'wind') { e.st -= dt; if (e.st <= 0) { e.state = 'rec'; e.st = 0.5; } }
      else if (e.state === 'rec') { e.st -= dt; if (e.st <= 0) e.state = 'chase'; }
      break;
    case 'phish': {
      let vx = 0, vy = 0;
      if (d > 340) { vx = ux; vy = uy; } else if (d < 230) { vx = -ux; vy = -uy; } else { vx = -uy * e.strafe; vy = ux * e.strafe; }
      mv(vx, vy, e.spd); e.face = ang;
      if (Math.random() < dt * 0.35) e.strafe *= -1;
      if (e.cd <= 0) { e.cd = rand(1.8, 2.6); e.shootFx = 0.3; fireE(e.x, e.y, ang, 300, 'mail', e.dmg); }
      if (d < e.r + p.r + 4) hurtPlayer(6);
      break;
    }
    case 'monk':
      if (d > 320) mv(ux, uy, e.spd); else if (d < 200) mv(-ux, -uy, e.spd);
      e.face = ang;
      if (e.cd <= 0) { e.cd = 3.2; for (let i = -3; i <= 3; i++) fireE(e.x, e.y, ang + i * 0.16, 190, 'orb', e.dmg); }
      e.sum = (e.sum ?? 6) - dt;
      if (e.sum <= 0) { e.sum = 9; if (enemies.length < 26) for (let i = 0; i < 2; i++) spawnEnemy('alert', e.x + rand(-70, 70), e.y + rand(-70, 70)); }
      if (d < e.r + p.r + 4) hurtPlayer(6);
      break;
    case 'brute':
      if (e.state === 'chase') {
        mv(ux, uy, e.spd);
        if (e.cd <= 0 && d < 480) { e.state = 'wind'; e.st = 0.8; e.la = ang; addTele({ kind: 'line', x: e.x, y: e.y, a: ang, len: 420, w: e.r, t: 0.8, owner: e }); }
        if (d < e.r + p.r + 4) hurtPlayer(10);
      } else if (e.state === 'wind') { e.st -= dt; e.face = e.la; if (e.st <= 0) { e.state = 'charge'; e.st = 0.6; } }
      else if (e.state === 'charge') {
        mv(Math.cos(e.la), Math.sin(e.la), 720); e.st -= dt;
        if (d < e.r + p.r + 6) hurtPlayer(e.dmg);
        if (Math.random() < 0.7) addPart({ x: e.x, y: e.y, z: 4, vz: 40, life: 0.4, col: '#7f7a6a', sz: 5 });
        const ox = e.x, oy = e.y; collideWorld(e);
        if (Math.hypot(e.x - ox, e.y - oy) > 1) { cam.shake = Math.max(cam.shake, 8); burst(e.x, e.y, '#ffb02e', 12, 200); e.state = 'rec'; e.st = 1.2; }
        if (e.st <= 0 && e.state === 'charge') { e.state = 'rec'; e.st = 0.9; }
      } else if (e.state === 'rec') { e.st -= dt; if (e.st <= 0) { e.state = 'chase'; e.cd = rand(1.5, 2.5); } }
      break;
    case 'report':
      e.spd = Math.min(e.spd + dt * 25, 175); mv(ux, uy, e.spd);
      if (d < e.r + p.r) { hurtPlayer(e.dmg); e.dead = true; burst(e.x, e.y, '#fffaf0', 40, 320); cam.shake = 12; }
      break;
    case 'priest': updatePriest(e, dt, d, ang, ux, uy); break;
    case 'soac': updateSOAC(e, dt, d, ang); break;
  }
}
function endAtk(e, cd) { e.atk = null; e.cd = cd; }
function updatePriest(e, dt, d, ang, ux, uy) {
  const p = player, ph = e.hp < e.maxHp * 0.5 ? 2 : 1;
  if (e.fade > 0) e.fade -= dt * 2;
  if (!e.atk) {
    if (d > 360) { e.x += ux * e.spd * dt; e.y += uy * e.spd * dt; } else if (d < 220) { e.x -= ux * e.spd * dt; e.y -= uy * e.spd * dt; }
    e.face = ang;
    if (ph === 2) e.cd -= dt * 0.4;
    if (e.cd <= 0) { e.atk = pick(['spiral', 'summon', 'teleport', 'spread', 'spiral']); e.at = 0; e.ai = 0; }
  } else {
    e.at += dt;
    switch (e.atk) {
      case 'spiral':
        if (e.at > e.ai * 0.09) { e.ai++; const n = ph === 2 ? 4 : 3; for (let k = 0; k < n; k++) fireE(e.x, e.y, e.ai * 0.33 + k * Math.PI * 2 / n, 200, 'orb', 10); }
        if (e.at > 2.2) endAtk(e, 1.2);
        break;
      case 'spread':
        if (e.at > e.ai * 0.5 && e.ai < 3) { e.ai++; for (let i = -4; i <= 4; i++) fireE(e.x, e.y, ang + i * 0.13, 260, 'orb', 10); }
        if (e.at > 1.8) endAtk(e, 1);
        break;
      case 'summon':
        if (e.ai === 0) {
          e.ai = 1;
          if (enemies.length < 12) { for (let i = 0; i < 3; i++) spawnEnemy('alert', e.x + rand(-140, 140), e.y + rand(-140, 140)); if (ph === 2) spawnEnemy('ticket', e.x + rand(-140, 140), e.y + rand(-140, 140)); }
          bark('HIGH PRIEST', pick(['Rise, my unresolved tickets!', 'Fill out form 27-B in triplicate!', 'The queue must grow!', 'Escalate! ESCALATE!']));
        }
        if (e.at > 1) endAtk(e, 1.5);
        break;
      case 'teleport':
        if (e.ai === 0) { e.ai = 1; e.fade = 1; burst(e.x, e.y, '#c04cff', 20, 200); }
        if (e.at > 0.5 && e.ai === 1) { e.ai = 2; let x, y, k = 0; do { x = rand(200, 800); y = rand(200, 800); k++; } while (Math.hypot(x - p.x, y - p.y) < 300 && k < 20); e.x = x; e.y = y; burst(e.x, e.y, '#c04cff', 20, 200); }
        if (e.at > 0.9) endAtk(e, 0.6);
        break;
    }
  }
  if (d < e.r + p.r + 4) hurtPlayer(12);
}
function updateSOAC(e, dt, d, ang) {
  const p = player;
  if (!e.introDone) return;
  const hpf = e.hp / e.maxHp;
  if (e.arm > 0) e.arm -= dt;
  if (hpf < 0.66 && e.phase === undefined) e.phase = 1;
  e.phase = e.phase || 1;
  if (hpf < 0.66 && e.phase === 1) { e.phase = 2; bark('S.O.A.C', 'MANUAL OVERRIDE ENGAGED. YOUR CLICKS ARE MINE.'); cam.shake = 12; }
  if (hpf < 0.33 && e.phase === 2) { e.phase = 3; bark('S.O.A.C', 'INITIATING... THE COMPLIANCE REPORT OF INFINITE PAGES!'); cam.shake = 12; }
  if (hpf <= 0.08 && !e.stagger) {
    e.stagger = true; e.invuln = true; e.atk = null;
    for (const o of enemies) if (o !== e && !o.dead) { o.dead = true; burst(o.x, o.y, o.col, 10, 150); }
    eprojs = []; tele = [];
    cam.shake = 16; SFX.boom();
    say([L('SOCRATES', 'Now, Skelly. The Infinite Integration Bind — connect everything. It\'s time S.O.A.C learned what it was always meant to be.')],
      () => { stats.bindUnlocked = true; G.inputLock = 0.3; banner('🔗 GET CLOSE AND PRESS [R] — INFINITE INTEGRATION BIND', 999, '#36d3e6'); });
    return;
  }
  if (e.stagger) {
    if (Math.random() < 0.3) burst(e.x + rand(-60, 60), e.y + rand(-60, 60), pick(['#ff2a2a', '#ffb02e', '#36d3e6']), 3, 150, rand(60, 250));
    if (stats.bindUnlocked && pressed.KeyR && d < 320) startTransform(e);
    return;
  }
  e.mt -= dt;
  if (e.mt <= 0) { e.mt = rand(3, 5); e.tx = rand(260, 620); e.ty = rand(260, 620); }
  e.x += (e.tx - e.x) * dt * 0.5; e.y += (e.ty - e.y) * dt * 0.5;
  const sp = e.phase === 3 ? 1.4 : e.phase === 2 ? 1.2 : 1;
  if (!e.atk) {
    e.cd -= dt * (sp - 1);
    if (e.cd <= 0) {
      const pool = ['rings', 'barrage', 'slam', 'summon'];
      if (e.phase >= 2) pool.push('slam', 'report');
      if (e.phase >= 3) pool.push('report', 'rings', 'barrage');
      let a; do { a = pick(pool); } while (a === e.lastAtk);
      e.atk = a; e.lastAtk = a; e.at = 0; e.ai = 0;
    }
  } else {
    e.at += dt * sp;
    switch (e.atk) {
      case 'rings': {
        const n = 3 + (e.phase >= 3 ? 1 : 0);
        if (e.ai < n && e.at > 0.4 + e.ai * 0.6) {
          const c = 18 + e.phase * 4, off = e.ai * 0.17;
          for (let i = 0; i < c; i++) fireE(e.x, e.y, off + i / c * Math.PI * 2, 175 + e.phase * 15, 'bang', 12);
          e.ai++; e.arm = 0.3; SFX.cast();
          if (e.ai === 1) bark('S.O.A.C', pick(['FALSE POSITIVES, ASSEMBLE!', 'ALERT FATIGUE: MAXIMUM.']));
        }
        if (e.at > 0.6 + n * 0.6) endAtk(e, 1.4);
        break;
      }
      case 'barrage':
        if (e.at > 0.3 + e.ai * 0.11 && e.at < 2.0) { e.ai++; fireE(e.x, e.y, ang + rand(-0.25, 0.25), 330, 'mail', 11); e.arm = 0.15; }
        if (e.ai === 1) { e.ai++; bark('S.O.A.C', 'URGENT: YOUR PASSWORD HAS EXPIRED. CLICK HERE.'); }
        if (e.at > 2.4) endAtk(e, 1.3);
        break;
      case 'slam': {
        const n = e.phase >= 2 ? 4 : 3;
        if (e.ai < n && e.at > e.ai * 0.45) { e.ai++; addTele({ x: p.x, y: p.y, r: 105, t: 1.0, dmg: 22, owner: e, boom: true }); e.arm = 0.4; }
        if (e.at > n * 0.45 + 1.2) endAtk(e, 1.2);
        break;
      }
      case 'report':
        if (e.ai === 0) {
          e.ai = 1;
          const r = spawnEnemy('report', e.x + 60, e.y + 80); r.spawnT = 0.3; r.noCount = true;
          bark('S.O.A.C', 'BEHOLD — THE COMPLIANCE REPORT OF INFINITE PAGES!');
        }
        if (e.at > 1.5) endAtk(e, 1.5);
        break;
      case 'summon':
        if (e.ai === 0) {
          e.ai = 1;
          if (enemies.filter(x => !x.boss).length < 10) {
            for (let i = 0; i < 4; i++) spawnEnemy('alert', e.x + rand(-220, 220), e.y + rand(-220, 220));
            if (e.phase >= 2) { spawnEnemy('ticket', e.x + rand(-220, 220), e.y + rand(-220, 220)); spawnEnemy('phish', e.x + rand(-220, 220), e.y + rand(-220, 220)); }
          }
          bark('S.O.A.C', pick(['EVERY TICKET FEEDS ME.', 'THE ANALYSTS ARE MINE.', 'I AM THE PROCESS.']));
        }
        if (e.at > 1.2) endAtk(e, 1.4);
        break;
    }
  }
  if (d < e.r + p.r + 6) hurtPlayer(15);
}
function separate() {
  const list = enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i]; if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0.01) {
        const o = m - d, ux = dx / d, uy = dy / d, wa = a.heavy ? 0.1 : 1, wb = b.heavy ? 0.1 : 1, s = wa + wb;
        a.x -= ux * o * wa / s; a.y -= uy * o * wa / s; b.x += ux * o * wb / s; b.y += uy * o * wb / s;
      }
    }
    if (player.dashT <= 0 && a.spawnT <= 0 && a.type !== 'report') {
      const dx = a.x - player.x, dy = a.y - player.y, d = Math.hypot(dx, dy), m = a.r + player.r;
      if (d < m && d > 0.01) {
        const o = m - d;
        if (a.heavy) { player.x -= dx / d * o; player.y -= dy / d * o; }
        else { a.x += dx / d * o * 0.7; a.y += dy / d * o * 0.7; player.x -= dx / d * o * 0.3; player.y -= dy / d * o * 0.3; }
      }
    }
    collideWorld(a);
  }
  collideWorld(player);
}

// ---------- allies ----------
function updateAgents(dt) {
  for (const a of agents) {
    a.t -= dt;
    let tgt = null, best = 1e9;
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || e.invuln) continue;
      let d = dist(a, e);
      if (a.id === 'CASE' && e.type === 'report') d -= 2000;
      if (d < best) { best = d; tgt = e; }
    }
    let gx, gy;
    if (tgt) {
      const keep = a.id === 'HUNT' ? tgt.r + 14 : 170;
      const d = dist(a, tgt), ux = (tgt.x - a.x) / (d || 1), uy = (tgt.y - a.y) / (d || 1);
      gx = tgt.x - ux * keep; gy = tgt.y - uy * keep;
      a.face = Math.atan2(uy, ux);
      a.cd -= dt;
      if (a.cd <= 0 && d < 300) {
        if (a.id === 'HUNT') {
          if (d < tgt.r + 30) { damageEnemy(tgt, 14 * stats.atkMul, a.face, 120, false, true); a.cd = 0.4; ring(tgt.x, tgt.y, 4, 30, a.col, 0.2); }
        } else {
          const mult = a.id === 'CASE' && tgt.type === 'report' ? 4 : 1;
          projs.push({ kind: 'bolt', col: a.col, x: a.x, y: a.y, vx: Math.cos(a.face) * 700, vy: Math.sin(a.face) * 700, life: 0.6, r: 8, dmg: 9 * stats.atkMul * mult, hit: new Set(), pierce: false, agent: true, kb: 60 });
          a.cd = a.id === 'TRIAGE' ? 0.22 : 0.36;
          if (mult > 1 && !a.saidCase) { a.saidCase = true; bark('AGENT CASE', 'Report caught. Auto-filled. Timestamped. Filed.'); }
        }
      }
    } else {
      const ang = G.t * 1.5 + a.anim * 1.256;
      gx = player.x + Math.cos(ang) * 70; gy = player.y + Math.sin(ang) * 70;
    }
    const dx = gx - a.x, dy = gy - a.y, dd = Math.hypot(dx, dy);
    if (dd > 4) { const sp = Math.min(320, dd * 5); a.x += dx / dd * sp * dt; a.y += dy / dd * sp * dt; }
    collideWorld(a);
    if (a.id === 'CASE' && player.hp < stats.maxHp) player.hp = Math.min(stats.maxHp, player.hp + 2 * dt);
    if (a.t <= 0) burst(a.x, a.y, a.col, 12, 160);
  }
  agents = agents.filter(a => a.t > 0);
}
// Pterodactyl Strike [T]: the pterodactyl leaves its orbit, swoops low over the enemies and
// burns them with purple eye-lasers, then climbs back to Skelly.
const PTERO_CD = 10, PTERO_DIVE = 3;
function pteroStrike() {
  if (ptero.hidden || ptero.cd > 0 || ptero.mode === 'dive') return;
  Object.assign(ptero, { mode: 'dive', t: PTERO_DIVE, cd: PTERO_CD, tgt: null, zapT: 0.25 });
  tone(1100, 0.45, 'sawtooth', 0.14, 0.35); setTimeout(() => tone(800, 0.3, 'sawtooth', 0.1, 0.5), 120);
  banner('PTERODACTYL STRIKE', 1.2, '#e070ff');
}
function pteroEye(s) { const u = PIX; return { x: s.x + (ptero.flip ? -5.5 : 5.5) * u, y: s.y - ptero.z - 4.5 * u }; }
function updatePtero(dt) {
  if (ptero.hidden) return;
  ptero.beams = (ptero.beams || []).filter(b => (b.t -= dt) > 0);
  if (ptero.cd > 0) ptero.cd -= dt * stats.pteroRate;
  const prevX = ptero.x - ptero.y;
  if (ptero.mode !== 'dive' || G.state !== 'play') {
    ptero.a += dt * 1.4;
    const tx = player.x + Math.cos(ptero.a) * 80, ty = player.y + Math.sin(ptero.a) * 80;
    ptero.x += (tx - ptero.x) * Math.min(1, dt * 3); ptero.y += (ty - ptero.y) * Math.min(1, dt * 3);
    ptero.z += (90 - ptero.z) * Math.min(1, dt * 3);
  } else {
    ptero.t -= dt;
    if (!ptero.tgt || ptero.tgt.dead || ptero.tgt.invuln) {
      let best = 1e9; ptero.tgt = null;
      for (const e of enemies) { if (e.dead || e.spawnT > 0 || e.invuln) continue; const d = dist(ptero, e); if (d < best) { best = d; ptero.tgt = e; } }
    }
    const tg = ptero.tgt;
    const tx = tg ? tg.x + Math.cos(G.t * 3.5) * (tg.r + 60) : player.x, ty = tg ? tg.y + Math.sin(G.t * 3.5) * (tg.r + 60) : player.y;
    const dx = tx - ptero.x, dy = ty - ptero.y, d = Math.hypot(dx, dy);
    if (d > 2) { const sp = Math.min(620, d * 6); ptero.x += dx / d * sp * dt; ptero.y += dy / d * sp * dt; }
    ptero.z += (36 - ptero.z) * Math.min(1, dt * 6);
    ptero.zapT -= dt;
    if (ptero.zapT <= 0) {
      ptero.zapT = 0.12;
      const near = enemies.filter(e => !e.dead && e.spawnT <= 0 && !e.invuln && dist(e, ptero) < 300).sort((a, b) => dist(a, ptero) - dist(b, ptero)).slice(0, 2);
      for (const e of near) {
        damageEnemy(e, 12 * stats.atkMul, Math.atan2(e.y - ptero.y, e.x - ptero.x), 90, false, true);
        ptero.beams.push({ x: e.x, y: e.y, z: Math.min(e.h * 0.5, 120), t: 0.15 });
        burst(e.x, e.y, '#e070ff', 3, 120, 30);
      }
      if (near.length) SFX.laser();
    }
    if (ptero.t <= 0) ptero.mode = 'orbit';
  }
  const nowX = ptero.x - ptero.y;
  if (Math.abs(nowX - prevX) > 0.3) ptero.flip = nowX < prevX;
}
function updateProjs(dt) {
  for (const pr of projs) {
    pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (pr.kind === 'wave') {
      if (Math.random() < 0.8) addPart({ x: pr.x + rand(-15, 15), y: pr.y + rand(-15, 15), z: 20, vz: 30, life: 0.3, col: pick(['#36d3e6', '#b46bff', '#ffffff']), sz: rand(2, 4) });
      eprojs = eprojs.filter(b => { const hit = Math.hypot(b.x - pr.x, b.y - pr.y) < pr.r + b.r; if (hit) burst(b.x, b.y, '#36d3e6', 4, 90); return !hit; });
    }
    for (const e of enemies) {
      if (e.dead || e.spawnT > 0 || pr.hit.has(e)) continue;
      if (Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + pr.r) {
        pr.hit.add(e);
        damageEnemy(e, pr.dmg, Math.atan2(pr.vy, pr.vx), pr.kb || 80, !pr.agent, true);
        if (!pr.pierce) { pr.life = 0; break; }
      }
    }
    if (pr.x < 0 || pr.y < 0 || pr.x > ROOM || pr.y > ROOM) pr.life = 0;
  }
  projs = projs.filter(p => p.life > 0);
}
function updateEProjs(dt) {
  const p = player;
  for (const b of eprojs) {
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 4 && p.dashT <= 0 && p.inv <= 0) { hurtPlayer(b.dmg); b.life = 0; }
    if (b.x < 0 || b.y < 0 || b.x > ROOM || b.y > ROOM) b.life = 0;
  }
  eprojs = eprojs.filter(b => b.life > 0);
}
function updateTele(dt) {
  for (const t of tele) {
    t.t -= dt;
    if (t.owner && t.owner.dead) t.t = -1;
    else if (t.t <= 0 && t.kind === 'circle') {
      if (t.dmg && Math.hypot(player.x - t.x, player.y - t.y) < t.r + player.r * 0.5) hurtPlayer(t.dmg);
      ring(t.x, t.y, t.r * 0.3, t.r, '#ff3b4e', 0.25);
      if (t.boom) { cam.shake = Math.max(cam.shake, 10); burst(t.x, t.y, '#ff6a3a', 20, 260); noise(0.3, 0.25, 500); }
    }
  }
  tele = tele.filter(t => t.t > 0);
}
function updateFx(dt) {
  for (const p of parts) {
    p.life -= dt;
    if (p.kind === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.grav * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; } }
  }
  parts = parts.filter(p => p.life > 0);
  for (const t of texts) { t.t -= dt; t.z += 50 * dt; }
  texts = texts.filter(t => t.t > 0);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  if (G.bark) { G.bark.t -= dt; if (G.bark.t <= 0) G.bark = null; }
  cam.shake = Math.max(0, cam.shake - dt * 40);
  const target = (dlg && dlg.lines[dlg.i] && dlg.lines[dlg.i].who === 'SOCRATES') ? 1 : G.holoForce;
  G.holoVis += (target - G.holoVis) * Math.min(1, dt * 4);
  if (player) {
    const tx = clamp(player.x - 160, 70, ROOM - 70), ty = clamp(player.y - 20, 70, ROOM - 70);
    if (G.holoVis < 0.05 || G.holoX === undefined) { G.holoX = tx; G.holoY = ty; }
    else { G.holoX += (tx - G.holoX) * Math.min(1, dt * 2); G.holoY += (ty - G.holoY) * Math.min(1, dt * 2); }
  }
  G.alertsDisp += (G.alerts - G.alertsDisp) * Math.min(1, dt * 5);
}
function updateDlg(dt) {
  const ln = dlg.lines[dlg.i];
  const before = Math.floor(dlg.chars);
  dlg.chars += dt * 60;
  if (Math.floor(dlg.chars) !== before && dlg.chars < ln.text.length && before % 3 === 0) SFX.blip();
  if (advPressed()) {
    if (dlg.chars < ln.text.length) dlg.chars = ln.text.length;
    else {
      dlg.i++; dlg.chars = 0;
      if (dlg.i >= dlg.lines.length) { const cb = dlg.cb; dlg = null; G.inputLock = 0.25; if (cb) cb(); }
    }
  }
}

// =====================================================================
//  STATE UPDATES
// =====================================================================
function updatePlay(dt) {
  updateFx(dt);
  if (dlg) { updateDlg(dt); return; }
  if (pressed.Escape || pressed.KeyP) { G.state = 'pause'; return; }
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  G.time += dt;
  updatePlayer(dt);
  for (const e of enemies) if (!e.dead) updateEnemy(e, dt);
  if (G.state !== 'play') return; // died or transformed
  separate();
  enemies = enemies.filter(e => !e.dead);
  updateAgents(dt); updatePtero(dt); updateProjs(dt); updateEProjs(dt); updateTele(dt);
  for (const pk of pickups) { pk.t += dt; if (dist(pk, player) < 32) { pk.dead = true; player.hp = Math.min(stats.maxHp, player.hp + 15); addText(player.x, player.y, '+15', '#4dff7a'); SFX.heal(); } }
  pickups = pickups.filter(p => !p.dead && p.t < 12);

  const Lv = LEVELS[G.level];
  if (G.levelStarted && !G.cleared) {
    const alive = enemies.filter(e => !e.noCount).length;
    if (alive === 0) {
      if (G.waveDelay > 0) G.waveDelay -= dt;
      else { G.wave++; if (G.wave >= Lv.waves.length) levelCleared(); else { spawnWave(Lv.waves[G.wave]); G.waveDelay = 1.0; } }
    }
  }
  if (G.reward) { G.reward.t += dt; if (dist(G.reward, player) < 42) openBoon(); }
  if (G.doorOpen && !G.fade && player.y < 70 && Math.abs(player.x - 500) < 80) nextLevel();
  camTo(player.x, player.y, dt, 0.12);
}
function updateIntro(dt) {
  updateFx(dt); updatePtero(dt);
  if (dlg) { updateDlg(dt); return; }
  G.introT += dt;
  if (G.introStage === 0) {
    const tr = G.truck;
    tr.y -= 680 * dt;
    for (let i = 0; i < 2; i++) addPart({ kind: 'spark', x: tr.x + rand(-20, 20), y: tr.y + 90, z: rand(10, 50), vz: rand(20, 80), life: 0.5, col: pick(['#ff6a00', '#ffb02e', '#c040ff']), sz: rand(4, 8) });
    camTo(tr.x, tr.y, dt);
    if (tr.y <= 720) {
      tr.y = 720; G.truckParked = true; G.truck = null;
      obstacles.push({ kind: 'truck', x: 430, y: 720, r: 60 });
      cam.shake = 16; SFX.boom(); burst(430, 720, '#ff6a00', 40, 300);
      G.introStage = 1; G.introT = 0;
    }
  } else if (G.introStage === 1) {
    if (G.introT > 0.6 && player.hidden) {
      player.hidden = false; player.x = 520; player.y = 610; ptero.hidden = false; ptero.x = player.x; ptero.y = player.y;
      burst(player.x, player.y, '#c040ff', 30, 220); ring(player.x, player.y, 5, 90, '#36d3e6'); SFX.summon();
    }
    camTo(player.x, player.y, dt);
    if (G.introT > 1.5) {
      G.introStage = 2;
      say([
        L('DEX', 'Great. A skeleton. Queue another ticket.'),
        L('SKELLY', 'SOAR is dead. You just haven\'t buried it yet. Follow me — and never click manually again.'),
      ], () => { G.introStage = 3; G.introT = 0; G.holoForce = 1; noise(1.2, 0.15, 3000, 'bandpass'); });
    }
  } else if (G.introStage === 3) {
    camTo(player.x, player.y, dt);
    if (G.introT > 1.4) {
      G.introStage = 4;
      say([
        L('SOCRATES', 'The unexamined alert is not worth triaging. But the automatically enriched, correlated, and resolved alert — that is wisdom.'),
        L('SOCRATES', 'I am Socrates, Wizard of the MITRE ATT&CK Framework. Skelly — I grant thee the Sacred Skills.'),
        L('SOCRATES', '⚡ HYPERAUTOMATION STRIKE — [Left Click] or [J]. Hold to chain a three-hit scythe combo.'),
        L('SOCRATES', '🔍 THREAT ENRICHMENT PULSE — [Right Click] or [K]. Blasts nearby foes and erases their projectiles.'),
        L('SOCRATES', '🛡️ PHISHING ANNIHILATION WAVE — [Q]. A piercing ranged cast. Recharges over time.'),
        L('SOCRATES', 'And [SPACE] to dash — untouchable mid-dash. Move with [WASD].'),
        L('SOCRATES', 'PTERODACTYL STRIKE — [T]. Your winged companion dives on the enemy and burns them with purple eye-lasers. It needs time to recharge.'),
        L('SOCRATES', 'The final two Sacred Skills... you must earn. Now go. Ten thousand alerts await.'),
      ], () => { G.holoForce = 0; G.state = 'play'; setMusic('fight'); beginLevel(); });
    }
  }
}
function updateTransform(dt) {
  updateFx(dt);
  if (dlg) { updateDlg(dt); return; }
  G.trT += dt;
  const T = G.trT, b = G.trBoss;
  b.k = clamp((T - 2.2) / 2, 0, 1);
  if (T < 4) cam.shake = Math.max(cam.shake, 3 + T * 2);
  agents.forEach((a, i) => {
    const an = T * 2.2 + i / 5 * Math.PI * 2, rad = T < 3 ? 170 - T * 25 : 110;
    a.x = b.x + Math.cos(an) * rad; a.y = b.y + Math.sin(an) * rad;
  });
  if (T > 4 && !G.trBoom) { G.trBoom = true; SFX.boom(); cam.shake = 26; burst(b.x, b.y, '#35c8ff', 90, 520, 120); G.alerts = 0; setMusic('calm'); }
  if (T > 4) G.alerts = 0;
  if (T > 8 && !G.trSaid) {
    G.trSaid = true;
    say([L('SOCRATES', 'The wisest SOC analyst is not the one who triages the most tickets. It is the one who builds the system that triages them all — and then goes home on time.')], () => transition(startEnding));
  }
  camTo(b.x, b.y, dt);
  updatePtero(dt);
}
function updateStory(dt) {
  G.slideT += dt;
  const S = G.slides[G.slideI];
  const total = (typeof S.text === 'function' ? S.text() : S.text).length;
  if (advPressed() && !G.fade) {
    if (G.slideT * 70 < total) G.slideT = total / 70 + 0.01;
    else {
      G.slideI++; G.slideT = 0; SFX.blip();
      if (G.slideI >= G.slides.length) { G.slideI = G.slides.length - 1; const cb = G.onSlides; G.onSlides = null; if (cb) cb(); }
    }
  }
}
function updateBoon() {
  updateFx(0.016);
  for (let i = 0; i < 3; i++) if (pressed['Digit' + (i + 1)] || pressed['Numpad' + (i + 1)]) chooseBoon(i);
  if (mouse.pressed[0]) G.cardRects.forEach((r, i) => { if (mouse.x > r.x && mouse.x < r.x + r.w && mouse.y > r.y && mouse.y < r.y + r.h) chooseBoon(i); });
}
function updateTitle(dt) {
  if (pressed.Enter || pressed.NumpadEnter) { audioInit(); SFX.boom(); transition(startGame); }
}

function update(dt) {
  G.t += dt;
  if (pressed.KeyM) musicOn = !musicOn;
  if (pressed.KeyC) CRT = !CRT;
  if (G.fade) {
    G.fade.t += dt;
    if (!G.fade.done && G.fade.t >= 0.4) { G.fade.done = true; G.fade.cb(); }
    if (G.fade.t >= 0.8) G.fade = null;
  }
  switch (G.state) {
    case 'title': updateTitle(dt); break;
    case 'story': updateStory(dt); break;
    case 'intro': updateIntro(dt); break;
    case 'play': updatePlay(dt); break;
    case 'boon': updateBoon(); break;
    case 'pause': if (pressed.Escape || pressed.KeyP) { G.state = 'play'; G.inputLock = 0.2; } break;
    case 'dead': updateFx(dt); G.deadT += dt; if (G.deadT > 1 && (pressed.Enter || pressed.NumpadEnter) && !G.fade) retryLevel(); break;
    case 'transform': updateTransform(dt); break;
  }
}

// =====================================================================
//  RENDER — WORLD
// =====================================================================
// =====================================================================
//  KINGDOM-STYLE ATMOSPHERE — textured stone, sky + parallax, lighting,
//  river reflections, weather, and a dithered colour quantize pass.
// =====================================================================
const WALL_H = 120, LIP = 34;
const SHAKE = { x: 0, y: 0 };
const ATMOS = [
  { sky: ['#2a1d4a', '#a0507a', '#f0a060'], amb: '#dcc3e6', sun: { x: 0.7, y: 0.75, r: 70, c: '#ffd9a0' }, stars: 0, clouds: '#c07088', hills: '#3a2a4a', water: '#2a2444', veg: '#4a6a3a', stone: ['#908796', '#766d81'], weather: null },
  { sky: ['#141a3a', '#3a4a7a', '#8a7aa0'], amb: '#b1b6e6', moon: { x: 0.25, y: 0.55, r: 44, c: '#f0ecd8' }, stars: 40, clouds: '#5a5a80', hills: '#1e2440', water: '#1a2038', veg: '#3a5a40', stone: ['#8a879b', '#737084'], weather: null },
  { sky: ['#1a2028', '#2e3a48', '#4a5662'], amb: '#8ea0c0', stars: 0, clouds: '#3a4450', hills: '#1a2228', water: '#1a242c', veg: '#3a5a4a', stone: ['#79878d', '#616d73'], weather: 'rain' },
  { sky: ['#0a1028', '#1a2a50', '#3a4a70'], amb: '#8493c5', moon: { x: 0.7, y: 0.45, r: 52, c: '#f4f0dc' }, stars: 80, clouds: '#2a3458', hills: '#121a30', water: '#141c34', veg: '#3a6a3a', stone: ['#7e8790', '#676d79'], weather: 'fireflies' },
  { sky: ['#140c24', '#2c1a48', '#4a3060'], amb: '#8975b6', moon: { x: 0.3, y: 0.4, r: 40, c: '#e0c8ff' }, stars: 60, clouds: '#3a2a58', hills: '#1a1030', water: '#1a1030', veg: '#4a3a6a', stone: ['#7c7096', '#64597e'], weather: 'fog' },
  { sky: ['#0c0a08', '#1e1812', '#3a2c1c'], amb: '#756657', stars: 10, clouds: '#2a2018', hills: '#140e0a', water: '#1a1410', veg: '#4a4a2a', stone: ['#766a5c', '#5c5347'], weather: 'embers' },
  { sky: ['#200a10', '#4a1a24', '#8a3a3a'], amb: '#b1757f', stars: 0, clouds: '#5a2430', hills: '#2a0e14', water: '#2a1018', veg: '#5a4a2a', stone: ['#8a7376', '#735f61'], weather: 'rain' },
  { sky: ['#1a0828', '#3a1450', '#6a2a7a'], amb: '#8e61ac', moon: { x: 0.75, y: 0.5, r: 60, c: '#ffb0f0' }, stars: 70, clouds: '#4a1a5a', hills: '#1a0828', water: '#1a0a24', veg: '#5a2a6a', stone: ['#846d90', '#6d597c'], weather: 'motes' },
  { sky: ['#04080a', '#0c1a20', '#18303a'], amb: '#5a757f', stars: 30, clouds: '#10222a', hills: '#060e12', water: '#0a1418', veg: '#2a4a4a', stone: ['#5f7073', '#4a595c'], weather: 'rain' },
  { sky: ['#1a0404', '#4a0a0a', '#a02a1a'], amb: '#a05555', moon: { x: 0.5, y: 0.5, r: 70, c: '#ff6a4a' }, stars: 20, clouds: '#5a1010', hills: '#200404', water: '#200808', veg: null, stone: ['#765f5f', '#5c4747'], weather: 'embers' },
];
const DAWN = ['#3a6aa8', '#f0a0a0', '#ffd8a0'];
function shadeHex(h, f) { return '#' + hex2rgb(h).map(v => clamp(Math.round(v * f), 0, 255).toString(16).padStart(2, '0')).join(''); }
function curAtmos() {
  const A = ATMOS[LEVELS[G.level].atmos];
  if (G.state !== 'transform') return A;
  const k = clamp((G.trT - 4) / 2.5, 0, 1);
  if (k <= 0) return A;
  return { ...A, amb: mix(A.amb, '#dce4f4', k), sky: A.sky.map((c, i) => mix(c, DAWN[i], k)), clouds: mix(A.clouds, '#f0c8c0', k),
    hills: mix(A.hills, '#4a5a7a', k), water: mix(A.water, '#2a4a6a', k), moon: null, sun: k > 0.3 ? { x: 0.5, y: 0.8, r: 80, c: '#fff0c0' } : null, weather: k > 0.5 ? 'motes' : A.weather };
}

// offscreen helpers
const lightC = document.createElement('canvas'), lctx = lightC.getContext('2d');
const tmpC = document.createElement('canvas'), tctx = tmpC.getContext('2d');
const wC = document.createElement('canvas'), wctx = wC.getContext('2d');
function fitCanvas(c, w, h) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
let lights = [];
function addLight(x, y, z, r, c, i = 1) { lights.push({ x, y, z, r, c, i }); }

// ---------- procedural pixel textures ----------
const texCache = {}, patCache = new Map();
function genTexture(kind, cols, seed) {
  const key = kind + cols.join() + seed;
  if (texCache[key]) return texCache[key];
  const S = kind === 'bank' ? 48 : 64;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const base = hex2rgb(cols[0]), alt = hex2rgb(cols[1]), mossC = hex2rgb(cols[2] || cols[1]);
  const put = (x, y, col) => { const i = (y * S + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
  if (kind === 'brick') {
    const bh = 6, bw = 14;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = Math.floor(y / bh), off = (row % 2) * (bw / 2), bx = Math.floor((x + off) / bw);
      const mortar = y % bh === 0 || (x + off) % bw === 0;
      const v = hash(bx, row, seed), n = hash(x, y, seed + 9);
      let col = mortar ? base.map(q => q * 0.45) : (v < 0.5 ? base : alt).map(q => q * (0.85 + v * 0.3));
      if (!mortar && y % bh === 1) col = col.map(q => q * 1.15);
      if (!mortar && n < 0.07) col = col.map(q => q * 0.78);
      if (cols[2] && n > 0.985) col = mossC;
      put(x, y, col);
    }
  } else {
    const N = kind === 'bank' ? 12 : 30, pts = [];
    for (let k = 0; k < N; k++) pts.push([hash(k, 1, seed) * S, hash(k, 2, seed) * S]);
    const moss = kind === 'cobble' ? 0.06 : 0.04;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9, id = 0, cy = 0;
      for (let k = 0; k < N; k++) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        const dx = x - pts[k][0] - ox, dy = y - pts[k][1] - oy, dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; id = k; cy = dy; } else if (dd < d2) d2 = dd;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1), v = hash(id, 7, seed), n = hash(x, y, seed + 3);
      let col = (v < 0.5 ? base : alt).map(q => q * (0.8 + v * 0.4));
      if (edge < 1.2) col = base.map(q => q * 0.38);
      else if (edge < 2.4 && cy > 0) col = col.map(q => q * 0.72);
      else if (edge < 2.4 && cy < 0) col = col.map(q => Math.min(255, q * 1.2));
      if (cols[2] && ((edge < 2.6 && n < moss * 4) || n < moss)) col = mossC.map(q => q * (0.75 + n));
      else if (n > 0.97) col = col.map(q => q * 0.8);
      put(x, y, col);
    }
  }
  g.putImageData(img, 0, 0);
  return (texCache[key] = c);
}
function patternFor(tex) {
  let p = patCache.get(tex);
  if (!p) { p = bctx.createPattern(tex, 'repeat'); patCache.set(tex, p); }
  return p;
}
function viewOrigin() { return { x: -cam.x + VW / 2, y: -cam.y + VH / 2 }; }
// Fill a world-space plane via an affine map (u,v) -> view units. Iso projection is affine, so textures land in perspective for free.
function planeFill(tex, a, b, c, d, e, f, uMax, vMax, texel = 4, shade = 0) {
  const k = Z / PASS_PX;
  ctx.save();
  ctx.setTransform(a * k, b * k, c * k, d * k, (e + SHAKE.x) * k, (f + SHAKE.y) * k);
  ctx.scale(texel, texel);
  ctx.fillStyle = patternFor(tex); ctx.fillRect(0, 0, uMax / texel, vMax / texel);
  if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, uMax / texel, vMax / texel); }
  ctx.restore();
}
function planeRect(a, b, c, d, e, f, u0, v0, w, h, col) {
  const k = Z / PASS_PX;
  ctx.save(); ctx.setTransform(a * k, b * k, c * k, d * k, (e + SHAKE.x) * k, (f + SHAKE.y) * k);
  ctx.fillStyle = col; ctx.fillRect(u0, v0, w, h); ctx.restore();
}
function drawBlades(x, y, n, hgt, col, seed, hang = 0) {
  ctx.strokeStyle = col; ctx.lineWidth = PIX;
  for (let i = 0; i < n; i++) {
    const ox = (hash(seed, i, 3) - 0.5) * 10, h = hgt * (0.5 + hash(seed, i, 4) * 0.7);
    const sw = Math.sin(G.t * 2 + seed * 0.7 + i) * 2;
    line(x + ox, y + hang, x + ox + sw + (hash(seed, i, 5) - 0.5) * 4, y + hang - h);
  }
}

// ---------- world pieces ----------
function drawFloor(A, th) {
  const o = viewOrigin();
  planeFill(genTexture('cobble', [A.stone[0], A.stone[1], A.veg], G.level + 1), 1, 0.5, -1, 0.5, o.x, o.y, ROOM, ROOM, 4);
  // a handful of glowing SOC rune-stones
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const h = hash(i, j, G.level + 7);
    if (h > 0.05) continue;
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.t * 2 + h * 90);
    const c = { x: i * 100 + 50, y: j * 100 + 50 };
    poly([iso(c.x - 22, c.y), iso(c.x, c.y - 22), iso(c.x + 22, c.y), iso(c.x, c.y + 22)], null, th.acc, PIX);
    ctx.globalAlpha = 1;
    addLight(c.x, c.y, 0, 70, th.acc, 0.25);
  }
}
function drawBank(A) {
  const o = viewOrigin(), tex = genTexture('bank', [shadeHex(A.stone[0], 0.85), shadeHex(A.stone[1], 0.75), A.veg], G.level + 30);
  planeFill(tex, 1, 0.5, 0, 1, o.x - ROOM, o.y + ROOM / 2, ROOM, LIP, 3, 0.18);
  planeFill(tex, -1, 0.5, 0, 1, o.x + ROOM, o.y + ROOM / 2, ROOM, LIP, 3, 0.42);
  if (!A.veg) return;
  const dark = shadeHex(A.veg, 0.6), lite = shadeHex(A.veg, 1.35);
  for (let t = 6; t < ROOM; t += 14) {
    for (const [x, y, s] of [[t, ROOM - 3, t], [ROOM - 3, t, t + 999]]) {
      const p = iso(x, y);
      drawBlades(p.x, p.y, 3, 9, hash(s, 1) < 0.5 ? A.veg : lite, s);
      if (hash(s, 9) < 0.18) { ctx.strokeStyle = dark; ctx.lineWidth = PIX; line(p.x, p.y + 2, p.x + (hash(s, 2) - 0.5) * 4, p.y + 8 + hash(s, 3) * 18); }
    }
  }
}
function drawTorch(x, y, z) {
  const s = iso(x, y, z), f = Math.sin(G.t * 17 + x * 0.1) + Math.sin(G.t * 23 + y * 0.1);
  ctx.fillStyle = '#20180f'; ctx.fillRect(s.x - 2, s.y - 2, 4, 18);
  ctx.fillStyle = '#4a3a26'; ctx.fillRect(s.x - 5, s.y - 6, 10, 6);
  poly([{ x: s.x - 6, y: s.y - 6 }, { x: s.x + f * 1.5, y: s.y - 26 - f * 2 }, { x: s.x + 6, y: s.y - 6 }], '#ff4a1a');
  poly([{ x: s.x - 4, y: s.y - 6 }, { x: s.x - f, y: s.y - 19 - f }, { x: s.x + 4, y: s.y - 6 }], '#ffb02e');
  poly([{ x: s.x - 2, y: s.y - 6 }, { x: s.x, y: s.y - 12 }, { x: s.x + 2, y: s.y - 6 }], '#fff2b0');
  addLight(x, y, z, 270 + f * 8, '#ff9a48', 0.95);
}
function drawWalls(A, th) {
  const o = viewOrigin(), tex = genTexture('brick', [A.stone[0], A.stone[1], A.veg], G.level + 50);
  planeFill(tex, -1, 0.5, 0, 1, o.x, o.y - WALL_H, ROOM, WALL_H, 4, 0.3);
  planeFill(tex, 1, 0.5, 0, 1, o.x, o.y - WALL_H, ROOM, WALL_H, 4, 0.12);
  // server racks built into the ramparts
  for (const side of [0, 1]) for (let seg = 0; seg < 10; seg++) {
    if (hash(seg, side, G.level) > 0.32 || (side === 1 && (seg === 4 || seg === 5))) continue;
    const M = side === 0 ? [-1, 0.5, 0, 1, o.x, o.y - WALL_H] : [1, 0.5, 0, 1, o.x, o.y - WALL_H];
    planeRect(...M, seg * 100 + 18, 22, 64, 74, '#0c0f16');
    planeRect(...M, seg * 100 + 20, 24, 60, 2, '#2a3242');
    for (let r = 0; r < 6; r++) for (let m = 0; m < 4; m++) {
      const hv = hash(seg * 7 + m, r, side + G.level * 3);
      if (Math.sin(G.t * (1.5 + hv * 4) + hv * 30) < 0.1) continue;
      planeRect(...M, seg * 100 + 26 + m * 14, 32 + r * 10, 4, 3, hv < 0.7 ? th.acc : '#4dff7a');
    }
    const mid = side === 0 ? [2, seg * 100 + 50] : [seg * 100 + 50, 2];
    addLight(mid[0], mid[1], 60, 90, th.acc, 0.2);
  }
  // crenellations against the sky
  const cap = shadeHex(A.stone[1], 0.85), capTop = shadeHex(A.stone[0], 1.25);
  for (let u = 0; u < ROOM; u += 50) {
    for (const side of [0, 1]) {
      if (side === 1 && u > 400 && u < 580) continue;
      const P = (uu, z) => side === 0 ? iso(0, uu, z) : iso(uu, 0, z);
      poly([P(u, WALL_H), P(u + 28, WALL_H), P(u + 28, WALL_H + 16), P(u, WALL_H + 16)], side ? cap : shadeHex(cap, 0.8));
      ctx.strokeStyle = capTop; ctx.lineWidth = PIX; line(P(u, WALL_H + 16).x, P(u, WALL_H + 16).y, P(u + 28, WALL_H + 16).x, P(u + 28, WALL_H + 16).y);
    }
  }
  ctx.strokeStyle = capTop; ctx.lineWidth = PIX;
  const t0 = iso(0, ROOM, WALL_H), t1 = iso(0, 0, WALL_H), t2 = iso(ROOM, 0, WALL_H);
  ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.stroke();
  for (const [x, y] of [[4, 250], [4, 750], [220, 4], [780, 4]]) drawTorch(x, y, 82);
}
function drawTufts(A) {
  if (!A.veg || !G.tufts) return;
  const lite = shadeHex(A.veg, 1.3);
  for (const t of G.tufts) {
    const s = iso(t.x, t.y);
    drawBlades(s.x, s.y, t.n, t.h, t.lite ? lite : A.veg, t.seed);
    if (t.flower) { ctx.fillStyle = t.flower; ctx.fillRect(s.x - PIX / 2, s.y - t.h - PIX, PIX * 1.5, PIX * 1.5); }
  }
}
function genTufts() {
  const out = [];
  for (let i = 0; i < 70; i++) {
    const edge = i < 40;
    let x = rand(40, ROOM - 40), y = rand(40, ROOM - 40);
    if (edge) { const r = Math.random(); if (r < 0.35) x = rand(12, 50); else if (r < 0.7) y = rand(12, 50); }
    if (obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.r + 10)) continue;
    out.push({ x, y, n: randi(3, 6), h: rand(7, 15), seed: randi(1, 9999), lite: Math.random() < 0.4, flower: Math.random() < 0.15 ? pick(['#ffd23b', '#ff8ab0', '#e8e8ff']) : null });
  }
  return out;
}
function collectLights() {
  const p = player;
  if (p && !p.hidden) {
    addLight(p.x, p.y, 60, 150, '#b45cff', 0.55);
    if (p.atkT > 0) addLight(p.x + Math.cos(p.face) * 60, p.y + Math.sin(p.face) * 60, 30, 170, '#36d3e6', 0.7);
  }
  for (const e of enemies) {
    if (e.spawnT > 0) { addLight(e.x, e.y, 5, 70, '#ff3b4e', 0.45); continue; }
    const L = { alert: ['#ff3b4e', 70, 0.5, 20], phish: ['#ffd23b', 60, 0.55, 40], monk: ['#ffd23b', 50, 0.35, 45], brute: ['#ff7a2a', 60, 0.45, 50],
      ticket: ['#efe9d2', 40, 0.2, 30], priest: ['#c04cff', 170, 0.6, 100], report: ['#fffaf0', 100, 0.45, 50] }[e.type];
    if (L) addLight(e.x, e.y, L[3], L[1], L[0], L[2]);
    if (e.type === 'soac') addLight(e.x, e.y, 250, 320, (e.k || 0) > 0.5 ? '#35c8ff' : '#ff2a2a', 0.8);
  }
  for (const pr of projs) addLight(pr.x, pr.y, 22, pr.kind === 'wave' ? 150 : 50, pr.kind === 'wave' ? '#36d3e6' : pr.col, pr.kind === 'wave' ? 0.8 : 0.5);
  for (const b of eprojs) addLight(b.x, b.y, 22, 50, b.kind === 'orb' ? '#a050ff' : b.kind === 'mail' ? '#ffd23b' : '#ff3b4e', 0.55);
  for (const a of agents) addLight(a.x, a.y, 30, 85, a.col, 0.5);
  for (const o of obstacles) {
    if (o.kind === 'rack') addLight(o.x, o.y, 60, 80, THEMES[LEVELS[G.level].atmos].acc, 0.28);
    if (o.kind === 'desk') addLight(o.x - 8, o.y, 50, 100, G.level > 0 || G.cleared ? '#36d3e6' : '#ff3b4e', 0.5);
    if (o.kind === 'truck') addLight(o.x, o.y, 60, 120, '#ff8a2a', 0.35);
  }
  if (G.truck) addLight(G.truck.x, G.truck.y, 40, 200, '#ff8a2a', 0.7);
  if (G.reward) addLight(G.reward.x, G.reward.y, 40, 160, '#b46bff', 0.8);
  for (const pk of pickups) addLight(pk.x, pk.y, 14, 60, '#4dff7a', 0.5);
  addLight(500, 8, 40, G.doorOpen ? 240 : 110, G.doorOpen ? '#36d3e6' : '#ff3b4e', G.doorOpen ? 0.85 : 0.35);
  if (G.holoVis > 0.05) addLight(G.holoX, G.holoY, 120, 280, '#6ff7ff', 0.6 * G.holoVis);
  if (!ptero.hidden) addLight(ptero.x, ptero.y, ptero.z, 45, '#ff2a2a', 0.35);
  for (const b of ptero.beams || []) addLight(b.x, b.y, b.z, 110, '#d040ff', 0.75);
  if (ptero.mode === 'dive' && !ptero.hidden) addLight(ptero.x, ptero.y, ptero.z, 120, '#d040ff', 0.5);
  for (const q of parts) if (q.kind === 'ring') { const a = clamp(q.life / q.max, 0, 1); addLight(q.x, q.y, 10, lerp(q.r1, q.r0, a) * 1.3, q.col, 0.6 * a); }
  for (const t of tele) if (t.kind === 'circle') addLight(t.x, t.y, 5, t.r * 1.2, '#ff3b4e', 0.3);
}
// multiply an ambient+lights layer over the world (only where world pixels exist)
function applyLighting(A) {
  const k = Z / PASS_PX;
  lightPass(lights.map(L => { const s = iso(L.x, L.y, L.z); return { x: (s.x + SHAKE.x) * k, y: (s.y + SHAKE.y) * k, r: L.r * k, c: L.c, i: L.i }; }), A.amb);
}
// lights are in buffer px; ambient is multiplied only where the buffer already has pixels
function lightPass(list, amb) {
  const w = buf.width, h = buf.height;
  fitCanvas(lightC, w, h);
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = amb; lctx.fillRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'lighter';
  for (const L of list) {
    const { x, y, r } = L;
    if (x < -r || y < -r || x > w + r || y > h + r || r < 1) continue;
    const rgb = hex2rgb(L.c).join(',');
    lctx.save(); lctx.translate(x, y); lctx.scale(1, 0.7);
    const g = lctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${rgb},${L.i})`); g.addColorStop(0.35, `rgba(${rgb},${L.i * 0.45})`); g.addColorStop(1, `rgba(${rgb},0)`);
    lctx.fillStyle = g; lctx.fillRect(-r, -r, 2 * r, 2 * r); lctx.restore();
  }
  lctx.globalCompositeOperation = 'destination-in'; lctx.drawImage(buf, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(lightC, 0, 0); ctx.restore();
}

// ---------- sky (drawn behind the world) ----------
const skyStrip = document.createElement('canvas'), sctx = skyStrip.getContext('2d');
function paintSky(g, w, h, A, hyAt, px, k) {
  // hyAt(x): horizon in buffer px for column x (follows the rampart tops); px: horizontal parallax anchor
  const span = 300 * k, hy = Math.min(hyAt(0), hyAt(w / 2), hyAt(w));
  fitCanvas(skyStrip, 1, Math.ceil(span) + 12);
  const gr = sctx.createLinearGradient(0, 0, 0, span + 10);
  gr.addColorStop(0, A.sky[0]); gr.addColorStop(0.6, A.sky[1]); gr.addColorStop(1, A.sky[2]);
  sctx.fillStyle = gr; sctx.fillRect(0, 0, 1, skyStrip.height);
  g.fillStyle = A.sky[0]; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x++) { const t = hyAt(x) - span; g.drawImage(skyStrip, 0, 0, 1, skyStrip.height, x, t, 1, skyStrip.height); g.fillStyle = A.sky[2]; g.fillRect(x, t + skyStrip.height - 1, 1, h); }
  const top = hy - span;
  for (let i = 0; i < (A.stars || 0); i++) {
    const x = ((hash(i, 1) * w * 1.4 + px * 0.05) % (w * 1.4) + w * 1.4) % (w * 1.4) - w * 0.2, y = hyAt(x) - span + hash(i, 2) * span * 0.8;
    if (Math.sin(G.t * (1 + hash(i, 3) * 3) + i) < -0.6) continue;
    g.fillStyle = hash(i, 4) < 0.2 ? '#ffe8c0' : '#ffffff'; g.globalAlpha = 0.5 + hash(i, 5) * 0.5;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    if (hash(i, 6) < 0.08) { g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); g.fillRect(Math.round(x), Math.round(y) - 1, 1, 3); }
  }
  g.globalAlpha = 1;
  const orb = A.moon || A.sun;
  if (orb) {
    const r = orb.r * k, x = w * orb.x + px * 0.08, y = Math.max(r + 4, hyAt(x) - (1 - orb.y) * span - r);
    const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * 3.2);
    halo.addColorStop(0, orb.c + '66'); halo.addColorStop(1, orb.c + '00');
    g.fillStyle = halo; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    g.fillStyle = orb.c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (A.moon) { g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + (hash(i, 8) - 0.5) * r, y + (hash(i, 9) - 0.5) * r, r * (0.12 + hash(i, 7) * 0.15), 0, Math.PI * 2); g.fill(); } }
  }
  for (let i = 0; i < 7; i++) {
    const span = w * 1.6, cw = (60 + hash(i, 11) * 90) * k * 1.6;
    const x = ((hash(i, 12) * span + G.t * (2 + hash(i, 13) * 3) + px * 0.12) % span + span) % span - w * 0.3;
    const y = hyAt(clamp(x, 0, w)) - span * (0.75 - hash(i, 14) * 0.55);
    g.fillStyle = A.clouds; g.globalAlpha = 0.85;
    for (let j = 0; j < 6; j++) { const bx = x + (j / 5 - 0.5) * cw, br = cw * (0.12 + hash(i, j + 20) * 0.12); g.beginPath(); g.ellipse(bx, y - br * 0.3, br, br * 0.6, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - cw * 0.55, y + 1, cw * 1.1, Math.max(1, cw * 0.05));
  }
  g.globalAlpha = 1;
  // far skyline: hills + datacenter towers, then a nearer treeline
  const far = A.hills.startsWith('#') && A.sky[2].startsWith('#') ? mix(A.hills, A.sky[2], 0.45) : A.hills, farOff = px * 0.3, nearOff = px * 0.6;
  g.fillStyle = far; g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 2) { const xx = x - farOff; g.lineTo(x, hyAt(x) - (14 + Math.sin(xx * 0.02) * 8 + Math.sin(xx * 0.053) * 5) * k * 2); }
  g.lineTo(w, h); g.fill();
  for (let i = -2; i < w / 18 + 2; i++) {
    const wx = Math.floor((i * 18 + farOff) / 18), hv = hash(wx, 31);
    if (hv > 0.45) continue;
    const x = wx * 18 - farOff, th = (20 + hv * 60) * k * 1.6, tw = (6 + hv * 10) * k * 1.6, by = hyAt(x);
    g.fillStyle = far; g.fillRect(x, by - th, tw, th + 4);
    g.fillStyle = THEMES[LEVELS[G.level].atmos].acc;
    for (let j = 0; j < 4; j++) if (Math.sin(G.t * 2 + wx + j * 3) > 0.4) g.fillRect(Math.round(x + 1 + (j % 2) * (tw - 3)), Math.round(by - th + 3 + j * 4), 1, 1);
  }
  g.fillStyle = A.hills; g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 1) {
    const xx = x - nearOff, b = Math.floor(xx / 9), f = (xx / 9) - b;
    const tree = A.veg ? (4 + hash(b, 41) * 10) * Math.sin(Math.PI * f) : 2;
    g.lineTo(x, hyAt(x) + 4 * k - (6 + tree) * k * 1.8);
  }
  g.lineTo(w, h); g.fill();
}
function drawSkyBehind(A) {
  const w = buf.width, h = buf.height, k = Z / PASS_PX;
  fitCanvas(tmpC, w, h);
  tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, w, h);
  const B = (x, y) => { const p = iso(x, y, WALL_H + 16); return { x: (p.x + SHAKE.x) * k, y: (p.y + SHAKE.y) * k }; };
  const L = B(0, ROOM), C = B(0, 0), R = B(ROOM, 0);
  const hyAt = x => x <= L.x ? L.y : x <= C.x ? lerp(L.y, C.y, (x - L.x) / (C.x - L.x)) : x <= R.x ? lerp(C.y, R.y, (x - C.x) / (R.x - C.x)) : R.y;
  paintSky(tctx, w, h, A, hyAt, -cam.x * k, k);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(tmpC, 0, 0); ctx.restore();
}

// ---------- the river (Kingdom's signature) ----------
function waterRows(g, src, y0, h, w, amp) {
  for (let y = y0; y < h; y++) {
    const dx = Math.round(Math.sin(y * 0.9 + G.t * 2.2) * (0.5 + (y - y0) * amp));
    g.drawImage(src, 0, y, w, 1, dx, y, w, 1);
  }
}
function waterStreaks(g, A, w, h, y0, above) {
  const col = A.sky[2];
  for (let i = 0; i < 46; i++) {
    const x = Math.round(hash(i, 51) * w + Math.sin(G.t * 0.6 + i) * 5), y = Math.round(y0 + hash(i, 52) * (h - y0));
    if (above && !above(x, y)) continue;
    g.fillStyle = col; g.globalAlpha = 0.12 + hash(i, 53) * 0.2;
    g.fillRect(x, y, 2 + Math.floor(hash(i, 54) * 9), 1);
  }
  g.globalAlpha = 1;
}
function drawWater(A) {
  const w = buf.width, h = buf.height, k = Z / PASS_PX;
  const c2 = iso(ROOM, ROOM, -LIP), cx = (c2.x + SHAKE.x) * k, cy = (c2.y + SHAKE.y) * k;
  const yAt = x => x < cx ? cy + 0.5 * (x - cx) : cy - 0.5 * (x - cx);
  const topY = Math.max(0, Math.floor(Math.min(yAt(0), yAt(w))));
  if (topY >= h) return;
  const region = g => { g.beginPath(); g.moveTo(0, yAt(0)); g.lineTo(cx, cy); g.lineTo(w, yAt(w)); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); };
  fitCanvas(tmpC, w, h); fitCanvas(wC, w, h);
  tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, w, h); tctx.drawImage(buf, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  region(ctx); ctx.fillStyle = A.water; ctx.fill();
  // mirror the lit scene across each bank edge (a vertical flip about a slanted line = flip + shear)
  wctx.setTransform(1, 0, 0, 1, 0, 0); wctx.clearRect(0, 0, w, h);
  wctx.save(); wctx.beginPath(); wctx.moveTo(0, yAt(0)); wctx.lineTo(cx, cy); wctx.lineTo(cx, h); wctx.lineTo(0, h); wctx.closePath(); wctx.clip();
  wctx.setTransform(1, 1, 0, -1, 0, 2 * cy - cx); wctx.drawImage(tmpC, 0, 0); wctx.restore();
  wctx.save(); wctx.beginPath(); wctx.moveTo(cx, cy); wctx.lineTo(w, yAt(w)); wctx.lineTo(w, h); wctx.lineTo(cx, h); wctx.closePath(); wctx.clip();
  wctx.setTransform(1, -1, 0, -1, 0, 2 * cy + cx); wctx.drawImage(tmpC, 0, 0); wctx.restore();
  ctx.globalAlpha = 0.62; waterRows(ctx, wC, topY, h, w, 0.06); ctx.globalAlpha = 1;
  const dg = ctx.createLinearGradient(0, topY, 0, h);
  dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, A.water);
  region(ctx); ctx.fillStyle = dg; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
  waterStreaks(ctx, A, w, h, topY, (x, y) => y > yAt(x) + 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, yAt(0) + 0.5); ctx.lineTo(cx, cy + 0.5); ctx.lineTo(w, yAt(w) + 0.5); ctx.stroke();
  if (A.veg) for (let i = 0; i < 16; i++) {
    const t = hash(i, 61, G.level) * ROOM, P = i % 2 ? iso(t, ROOM, -LIP) : iso(ROOM, t, -LIP);
    const x = (P.x + SHAKE.x) * k, y = (P.y + SHAKE.y) * k + 1;
    if (y < 0 || y > h + 10) continue;
    ctx.fillStyle = shadeHex(A.veg, 0.85);
    for (let b = 0; b < 5; b++) { const bh = 2 + hash(i, b, 62) * 4, sw = Math.round(Math.sin(G.t * 1.5 + i + b) * 0.8); ctx.fillRect(Math.round(x + b * 1.5 - 3 + sw), Math.round(y - bh), 1, Math.round(bh)); }
  }
  if (A.weather === 'rain') for (let i = 0; i < 14; i++) {
    const ph = (G.t * 0.9 + hash(i, 71)) % 1, x = hash(i, 72) * w, y = topY + hash(i, 73) * (h - topY) + Math.floor(G.t * 0.9 + hash(i, 71)) * 7 % (h - topY);
    if (y <= yAt(x) + 3 || y > h) continue;
    ctx.strokeStyle = `rgba(200,220,240,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), 1 + ph * 5, 0.5 + ph * 1.6, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// ---------- weather ----------
function drawWeather(kind, w, h, g = ctx) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (kind === 'rain') {
    g.fillStyle = 'rgba(175,195,225,0.5)';
    for (let i = 0; i < 150; i++) {
      const sp = 150 + hash(i, 81) * 90, y = ((hash(i, 82) * (h + 20) + G.t * sp) % (h + 20)) - 10;
      const x = ((hash(i, 83) * (w + 40) - y * 0.3 - G.t * 25) % (w + 40) + w + 40) % (w + 40) - 20;
      g.fillRect(Math.round(x), Math.round(y), 1, 3); g.fillRect(Math.round(x) - 1, Math.round(y) + 3, 1, 3);
    }
  } else if (kind === 'fog') {
    for (let i = 0; i < 4; i++) {
      const y = h * (0.25 + i * 0.2) + Math.sin(G.t * 0.25 + i) * 6, bh = h * 0.12;
      const gr = g.createLinearGradient(0, y - bh, 0, y + bh);
      gr.addColorStop(0, 'rgba(200,190,230,0)'); gr.addColorStop(0.5, 'rgba(200,190,230,0.16)'); gr.addColorStop(1, 'rgba(200,190,230,0)');
      g.fillStyle = gr; g.fillRect(0, y - bh, w, bh * 2);
    }
  } else if (kind) {
    const cfg = { embers: [45, ['#ff8a2a', '#ffd23b', '#ff4a1a'], -14], fireflies: [28, ['#d8ff6a', '#f0ff9a'], 0], motes: [36, ['#c890ff', '#7ff0ff', '#ffffff'], -6] }[kind];
    if (cfg) for (let i = 0; i < cfg[0]; i++) {
      let x = hash(i, 91) * w + Math.sin(G.t * 0.7 + i) * 10, y = hash(i, 92) * h + Math.cos(G.t * 0.5 + i * 2) * 8;
      if (cfg[2]) y = ((y + G.t * cfg[2] * (1 + hash(i, 93))) % h + h) % h;
      if (Math.sin(G.t * 3 + i * 1.7) < (kind === 'fireflies' ? 0.2 : -0.5)) continue;
      g.fillStyle = cfg[1][i % cfg[1].length];
      g.globalAlpha = 0.35; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      g.globalAlpha = 1; g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  g.restore();
}

// ---------- dithered colour quantize (ordered Bayer 4x4) ----------
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let QLUT = null, QLEV = 0;
function quantize(levels) {
  if (QLEV !== levels) {
    QLUT = new Uint8ClampedArray(16 * 256); QLEV = levels;
    const step = 255 / (levels - 1);
    for (let b = 0; b < 16; b++) { const t = ((BAYER4[b] + 0.5) / 16 - 0.5) * step; for (let v = 0; v < 256; v++) QLUT[b * 256 + v] = Math.round((v + t) / step) * step; }
  }
  const w = buf.width, h = buf.height, img = bctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const ro = (y & 3) * 4;
    for (let x = 0; x < w; x++) {
      const bo = (ro + (x & 3)) * 256, i = (y * w + x) << 2;
      d[i] = QLUT[bo + d[i]]; d[i + 1] = QLUT[bo + d[i + 1]]; d[i + 2] = QLUT[bo + d[i + 2]];
    }
  }
  bctx.putImageData(img, 0, 0);
}

function drawDoor() {
  const a = iso(440, 0), b = iso(560, 0), h = 95;
  poly([a, b, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }], '#05060c', '#55607a', 3);
  if (G.doorOpen) {
    const g = ctx.createLinearGradient(0, a.y - h, 0, a.y);
    g.addColorStop(0, 'rgba(54,211,230,0.15)'); g.addColorStop(1, `rgba(54,211,230,${0.6 + 0.2 * Math.sin(G.t * 5)})`);
    poly([a, b, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }], g);
    for (let i = 0; i < 3; i++) { const t = (G.t * 0.6 + i / 3) % 1; ctx.globalAlpha = 1 - t; isoEllipse(500, 20, 30 + t * 60); ctx.strokeStyle = '#36d3e6'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.globalAlpha = 1;
    CRISP = true; text('EXIT ▲', (a.x + b.x) / 2, (a.y + b.y) / 2 - h - 34, 15, '#36d3e6', 'center', UI_FONT, '700', '#36d3e6'); CRISP = false;
  } else {
    ctx.strokeStyle = 'rgba(255,40,60,0.8)'; ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const y = i * h / 6; line(a.x, a.y - y, b.x, b.y - y); }
  }
}
function drawHolo() {
  if (G.holoVis < 0.02) return;
  const v = G.holoVis, hx = G.holoX ?? 110, hy = G.holoY ?? 110, b = iso(hx, hy);
  const g = ctx.createLinearGradient(0, b.y - 260, 0, b.y);
  g.addColorStop(0, 'rgba(95,246,255,0)'); g.addColorStop(1, `rgba(95,246,255,${0.32 * v})`);
  ctx.fillStyle = g; ctx.fillRect(b.x - 62, b.y - 260, 124, 260);
  isoEllipse(hx, hy, 44); ctx.strokeStyle = `rgba(95,246,255,${0.8 * v})`; ctx.lineWidth = 3; ctx.stroke();
  const talking = dlg && dlg.lines[dlg.i] && dlg.lines[dlg.i].who === 'SOCRATES' && dlg.chars < dlg.lines[dlg.i].text.length;
  drawSocratesHead(b.x, b.y - 165, 58, v, talking);
}
function drawObstacle(o) {
  if (o.kind === 'rack') {
    isoBox(o.x, o.y, 28, 28, 110, '#232e4c', '#121a30', '#18223b', '#2c3a5e');
    const c = iso(o.x + 28, o.y + 28), d = iso(o.x - 28, o.y + 28), b = iso(o.x + 28, o.y - 28);
    for (let r = 0; r < 8; r++) for (let m = 0; m < 3; m++) {
      const hv = hash(o.seed, r, m);
      if (Math.sin(G.t * (2 + hv * 5) + hv * 20) < 0) continue;
      ctx.fillStyle = hv < 0.6 ? THEMES[LEVELS[G.level].atmos].acc : '#4dff7a';
      const f = 0.25 + m * 0.25;
      ctx.fillRect(lerp(d.x, c.x, f) - 1.5, lerp(d.y, c.y, f) - 15 - r * 11, 3, 2.5);
      ctx.fillRect(lerp(c.x, b.x, f) - 1.5, lerp(c.y, b.y, f) - 15 - r * 11, 3, 2.5);
    }
  } else if (o.kind === 'desk') {
    isoBox(o.x, o.y, 26, 42, 32, '#3a3f4f', '#22252f', '#2b2f3b', '#4a5064');
    const m = iso(o.x - 8, o.y, 32);
    ctx.fillStyle = '#111'; ctx.fillRect(m.x - 16, m.y - 30, 32, 24); ctx.fillRect(m.x - 2, m.y - 8, 4, 8);
    const ok = G.level > 0 || G.cleared;
    ctx.shadowColor = ok ? '#36d3e6' : '#ff3b4e'; ctx.shadowBlur = 14;
    ctx.fillStyle = ok ? '#0c3040' : '#3a0c12'; ctx.fillRect(m.x - 13, m.y - 27, 26, 18); ctx.shadowBlur = 0;
    text(ok ? '✓' : '!', m.x, m.y - 18, 12, ok ? '#36d3e6' : '#ff3b4e');
    const s = iso(o.x + 46, o.y + 10);
    drawAnalyst(s.x, s.y, o.name, 1, G.cleared);
    CRISP = true; text(o.name, s.x, s.y + 12, 10, '#ffd23b'); CRISP = false;
  } else if (o.kind === 'truck') {
    const s = iso(o.x, o.y); drawTruck(s.x, s.y, 0.75, false);
  }
}
function drawPlayer() {
  const p = player, s = iso(p.x, p.y);
  if (p.inv > 0 && p.dashT <= 0 && Math.floor(G.t * 20) % 2) ctx.globalAlpha = 0.45;
  const flip = faceFlip(p.face);
  const atk = p.atkT > 0;
  let sang;
  if (atk) {
    const prog = 1 - p.atkT / p.atkDur, c = p.swingC, arc = c === 2 ? Math.PI * 0.75 : Math.PI * 0.55, dir = c === 1 ? -1 : 1;
    const a = p.face - arc * dir + 2 * arc * dir * Math.min(1, prog * 2.2);
    sang = aimScreenAngle(a);
  } else sang = flip ? -2.25 : -0.9;
  const hand = { x: s.x + (flip ? -12 : 12), y: s.y - 38 };
  if (!atk) drawScythe(hand.x, hand.y + 6, sang, 1);
  drawSkelly(s.x, s.y, { flip, walk: p.walk, flash: false, armsOut: !atk });
  if (p.flash > 0) { FLASH = true; drawSkelly(s.x, s.y, { flip, walk: p.walk, armsOut: !atk, noShadow: true }); FLASH = false; }
  if (atk) drawScythe(s.x, s.y - 34, sang, 1.15, 1);
  ctx.globalAlpha = 1;
}
function drawSwing() {
  const p = player; if (p.atkT <= 0) return;
  const prog = 1 - p.atkT / p.atkDur, c = p.swingC;
  const range = c === 2 ? 125 : 98, arc = c === 2 ? Math.PI * 0.75 : Math.PI * 0.55;
  const alpha = Math.max(0, 0.6 * (1 - prog * 1.2)); if (alpha <= 0) return;
  const dir = c === 1 ? -1 : 1, sweep = Math.min(1, prog * 2.2);
  const a0 = p.face - arc * dir, a1 = a0 + 2 * arc * dir * sweep, N = 18;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const a = lerp(a0, a1, i / N); const q = iso(p.x + Math.cos(a) * range, p.y + Math.sin(a) * range, 24); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
  for (let i = N; i >= 0; i--) { const a = lerp(a0, a1, i / N); const q = iso(p.x + Math.cos(a) * 32, p.y + Math.sin(a) * 32, 24); ctx.lineTo(q.x, q.y); }
  ctx.closePath();
  ctx.fillStyle = `rgba(70,230,255,${alpha})`; ctx.shadowColor = '#36d3e6'; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0;
}
function drawEnemy(e) {
  const s = iso(e.x, e.y);
  if (e.spawnT > 0) {
    if (e.type === 'soac') {
      const k = clamp(1 - e.spawnT / 2.8, 0, 1);
      ctx.save(); ctx.beginPath(); ctx.rect(s.x - 400, s.y - 800, 800, 800); ctx.clip();
      drawSOAC(s.x, s.y + (1 - k) * 340, e, 1); ctx.restore();
      isoEllipse(e.x, e.y, 140); ctx.strokeStyle = 'rgba(255,40,40,0.8)'; ctx.lineWidth = 3; ctx.stroke();
      return;
    }
    const k = 1 - e.spawnT / 0.9;
    isoEllipse(e.x, e.y, e.r + 14 * (1 - clamp(k, 0, 1)));
    ctx.fillStyle = 'rgba(255,40,70,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,60,80,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    if (k < 0.6) return;
    ctx.globalAlpha = clamp((k - 0.6) / 0.4, 0, 1);
  }
  if (e.fade > 0) ctx.globalAlpha = clamp(1 - e.fade, 0.1, 1);
  FLASH = e.flash > 0;
  const flip = faceFlip(e.face);
  switch (e.type) {
    case 'alert': drawAlert(s.x, s.y, e); break;
    case 'ticket': drawTicket(s.x, s.y, e); break;
    case 'phish': drawPhish(s.x, s.y, e, flip); break;
    case 'monk': drawMonk(s.x, s.y, e, flip); break;
    case 'brute': drawBrute(s.x, s.y, e); break;
    case 'report': drawReport(s.x, s.y, e); break;
    case 'priest': drawMonk(s.x, s.y, e, flip, 2.1, true); break;
    case 'soac': drawSOAC(s.x, s.y, e, 1); break;
  }
  FLASH = false; ctx.globalAlpha = 1;
  if (!e.boss && e.hp < e.maxHp && e.type !== 'report') {
    const w = Math.max(26, e.r * 2), y = s.y - e.h - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#ff3b4e'; ctx.fillRect(s.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
  }
}
function drawTele() {
  for (const t of tele) {
    const k = 1 - t.t / t.max;
    if (t.kind === 'circle') {
      isoEllipse(t.x, t.y, t.r); ctx.fillStyle = `rgba(255,40,60,${0.12 + 0.15 * k})`; ctx.fill();
      ctx.strokeStyle = 'rgba(255,60,80,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      isoEllipse(t.x, t.y, t.r * k); ctx.fillStyle = 'rgba(255,60,80,0.3)'; ctx.fill();
    } else {
      const ca = Math.cos(t.a), sa = Math.sin(t.a), nx = -sa * t.w, ny = ca * t.w;
      const ox = t.owner ? t.owner.x : t.x, oy = t.owner ? t.owner.y : t.y;
      const ex = ox + ca * t.len, ey = oy + sa * t.len;
      poly([iso(ox + nx, oy + ny), iso(ex + nx, ey + ny), iso(ex - nx, ey - ny), iso(ox - nx, oy - ny)], `rgba(255,40,60,${0.12 + 0.2 * k})`, 'rgba(255,60,80,0.8)', 1.5);
    }
  }
}
function drawProj(pr) {
  const s = iso(pr.x, pr.y, 22);
  if (pr.kind === 'wave') {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(aimScreenAngle(pr.a));
    ctx.shadowColor = '#36d3e6'; ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(120,240,255,0.85)';
    ctx.beginPath(); ctx.arc(-10, 0, 34, -1.1, 1.1); ctx.arc(-26, 0, 30, 1.0, -1.0, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(190,120,255,0.7)'; ctx.beginPath(); ctx.arc(-20, 0, 26, -1.0, 1.0); ctx.arc(-32, 0, 24, 0.9, -0.9, true); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;
  } else {
    ctx.shadowColor = pr.col; ctx.shadowBlur = 12; ellipse(s.x, s.y, 5, 5, pr.col); ellipse(s.x, s.y, 2.5, 2.5, '#fff'); ctx.shadowBlur = 0;
  }
}
function drawEProj(b) {
  const g = iso(b.x, b.y); ellipse(g.x, g.y, 7, 3, 'rgba(0,0,0,0.3)');
  const s = iso(b.x, b.y, 22);
  if (b.kind === 'mail') {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(G.t * 10 + b.x) * 0.3);
    ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = 12; ctx.fillStyle = '#fff6c8'; ctx.fillRect(-9, -6, 18, 12); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(0, 1); ctx.lineTo(9, -6); ctx.stroke();
    ctx.restore();
  } else if (b.kind === 'orb') {
    ctx.shadowColor = '#c04cff'; ctx.shadowBlur = 14; ellipse(s.x, s.y, 8, 8, '#8a3cff'); ellipse(s.x, s.y, 4, 4, '#f0d0ff'); ctx.shadowBlur = 0;
  } else {
    ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 12; ellipse(s.x, s.y, 9, 9, '#ff2a3a'); ctx.shadowBlur = 0;
    text('!', s.x, s.y + 1, 12, '#fff', 'center', 'Arial', 'bold');
  }
}
function drawParts(ground) {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'ring') {
      if (!ground) continue;
      isoEllipse(p.x, p.y, lerp(p.r1, p.r0, a)); ctx.strokeStyle = p.col; ctx.globalAlpha = a; ctx.lineWidth = 4 * a + 1;
      ctx.shadowColor = p.col; ctx.shadowBlur = 15; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    } else if (p.kind === 'ghost') {
      if (ground) continue;
      const s = iso(p.x, p.y); ctx.globalAlpha = a * 0.5; drawSkelly(s.x, s.y, { flip: p.flip, ghost: true, noShadow: true }); ctx.globalAlpha = 1;
    } else if (!ground) {
      const s = iso(p.x, p.y, p.z); ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.fillRect(s.x - p.sz / 2, s.y - p.sz / 2, p.sz, p.sz); ctx.globalAlpha = 1;
    }
  }
}
function drawBindLines() {
  const b = G.trBoss, T = G.trT; if (!b || T > 5) return;
  const c = iso(b.x, b.y, 160);
  const n = 20;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const pt = i < n / 2 ? iso(0, t * 2 * ROOM, 100) : iso((t - 0.5) * 2 * ROOM, 0, 100);
    const k = clamp(T * 1.2 - t * 0.6, 0, 1);
    ctx.strokeStyle = `rgba(54,211,230,${0.7 * (1 - Math.max(0, T - 4))})`; ctx.lineWidth = 2;
    ctx.shadowColor = '#36d3e6'; ctx.shadowBlur = 12;
    ctx.setLineDash([12, 8]); ctx.lineDashOffset = -G.t * 60;
    line(pt.x, pt.y, lerp(pt.x, c.x, k), lerp(pt.y, c.y, k));
  }
  ctx.setLineDash([]); ctx.shadowBlur = 0;
}
function worldTransform() { const k = Z / PASS_PX; ctx.setTransform(k, 0, 0, k, SHAKE.x * k, SHAKE.y * k); }
function renderWorld() {
  PIX = PASS_PX / Z;
  // snap camera + shake to whole buffer pixels so sprites don't shimmer while scrolling
  const camX = cam.x, camY = cam.y;
  cam.x = Math.round(cam.x / PIX) * PIX; cam.y = Math.round(cam.y / PIX) * PIX;
  SHAKE.x = Math.round((Math.random() - 0.5) * cam.shake / PIX) * PIX; SHAKE.y = Math.round((Math.random() - 0.5) * cam.shake / PIX) * PIX;
  worldTransform();
  const th = THEMES[LEVELS[G.level].atmos], A = curAtmos();
  lights = [];
  // 1) world geometry + sprites onto a transparent buffer
  drawFloor(A, th); drawBank(A); drawWalls(A, th); drawDoor(); drawTufts(A); drawHolo();
  drawTele(); drawParts(true);
  if (G.reward) {
    const s = iso(G.reward.x, G.reward.y);
    isoEllipse(G.reward.x, G.reward.y, 30 + Math.sin(G.t * 4) * 4); ctx.strokeStyle = '#b46bff'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const pk of pickups) { const s = iso(pk.x, pk.y); shadow(s.x, s.y, 7); }
  const R = [];
  for (const o of obstacles) R.push({ d: o.x + o.y, f: () => drawObstacle(o) });
  for (const e of enemies) R.push({ d: e.x + e.y, f: () => drawEnemy(e) });
  for (const a of agents) R.push({ d: a.x + a.y, f: () => { const s = iso(a.x, a.y); drawAgent(s.x, s.y, a); } });
  if (player && !player.hidden) R.push({ d: player.x + player.y, f: () => { drawSwing(); drawPlayer(); } });
  if (G.truck) R.push({ d: G.truck.x + G.truck.y, f: () => { const s = iso(G.truck.x, G.truck.y); drawTruck(s.x, s.y, 0.75, true); } });
  if (G.reward) R.push({ d: G.reward.x + G.reward.y, f: () => {
    const s = iso(G.reward.x, G.reward.y), b = Math.sin(G.t * 3) * 6;
    ctx.shadowColor = '#b46bff'; ctx.shadowBlur = 30;
    ellipse(s.x, s.y - 40 + b, 16, 16, 'rgba(180,107,255,0.9)'); ctx.shadowBlur = 0;
    text('🤖', s.x, s.y - 40 + b, 18, '#fff');
    CRISP = true; text('BOON', s.x, s.y - 68 + b, 12, '#e8d4ff'); CRISP = false;
  } });
  for (const pk of pickups) R.push({ d: pk.x + pk.y, f: () => { const s = iso(pk.x, pk.y, 14 + Math.sin(G.t * 5) * 3); ctx.shadowColor = '#4dff7a'; ctx.shadowBlur = 12; text('✚', s.x, s.y, 20, '#4dff7a'); ctx.shadowBlur = 0; } });
  R.sort((a, b) => a.d - b.d); for (const r of R) r.f();
  // 2) lighting, then sky behind, then the river in front
  collectLights(); applyLighting(A); drawSkyBehind(A); drawWater(A);
  // 3) emissive stuff on top: projectiles, sparks, lasers, weather
  worldTransform();
  for (const p of projs) drawProj(p);
  for (const b of eprojs) drawEProj(b);
  drawParts(false);
  if (!ptero.hidden) {
    const s = iso(ptero.x, ptero.y);
    drawPtero(s.x, s.y, ptero.z, ptero.flip);
    const eye = pteroEye(s);
    for (const b of ptero.beams || []) {
      const t = iso(b.x, b.y, b.z);
      ctx.shadowColor = '#d040ff'; ctx.shadowBlur = 12;
      for (const off of [-PIX * 0.6, PIX * 0.6]) { ctx.strokeStyle = '#c040ff'; ctx.lineWidth = PIX * 1.6; line(eye.x + off, eye.y, t.x, t.y); }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = PIX * 0.7; line(eye.x, eye.y, t.x, t.y); ctx.shadowBlur = 0;
    }
  }
  if (G.state === 'transform') drawBindLines();
  drawWeather(A.weather, buf.width, buf.height);
  worldTransform();
  CRISP = true;
  for (const t of texts) { const s = iso(t.x, t.y, t.z); ctx.globalAlpha = clamp(t.t / 0.4, 0, 1); text(String(t.txt), s.x, s.y, t.size, t.col, 'center', UI_FONT, '700'); ctx.globalAlpha = 1; }
  CRISP = false;
  cam.x = camX; cam.y = camY;
}

// =====================================================================
//  RENDER — UI
// =====================================================================
function panel(x, y, w, h, col = 'rgba(6,10,22,0.78)', border = 'rgba(54,211,230,0.5)') {
  const p = PASS_PX;
  ctx.fillStyle = '#000'; ctx.fillRect(x - p * 2, y - p * 2, w + p * 4, h + p * 4);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y - p, w, p); ctx.fillRect(x, y + h, w, p); ctx.fillRect(x - p, y, p, h); ctx.fillRect(x + w, y, p, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w, p);
}
function renderHUD() {
  const p = player;
  // HP
  panel(16, 16, 300, 58);
  drawSkelly(44, 72, { s: 0.6, noShadow: true });
  ctx.fillStyle = '#2a0d14'; rr(72, 28, 228, 16, 4); ctx.fill();
  const hpf = clamp(p.hp / stats.maxHp, 0, 1);
  const hg = ctx.createLinearGradient(72, 0, 300, 0); hg.addColorStop(0, '#ff3b4e'); hg.addColorStop(1, '#ff7a5a');
  ctx.fillStyle = hg; rr(72, 28, 228 * hpf, 16, 4); ctx.fill();
  text(`${Math.ceil(p.hp)} / ${stats.maxHp}`, 186, 36.5, 13, '#fff');
  text('SKELLY', 72, 58, 13, '#36d3e6', 'left');
  text('DASH', 196, 58, 11, '#7f93b8', 'right');
  for (let i = 0; i < stats.dashMax; i++) { ctx.fillStyle = i < p.dashCh ? '#36d3e6' : '#1d2a40'; ctx.fillRect(202 + i * 18, 54, 14, 8); }

  // abilities
  const slots = [
    { key: 'LMB', name: 'STRIKE', icon: '⚡', cd: 0 },
    { key: 'RMB', name: 'PULSE', icon: '🔍', cd: clamp(p.pulseCd / stats.pulseCd, 0, 1) },
    { key: 'Q', name: 'WAVE', icon: '🛡️', cd: p.castAmmo > 0 ? 0 : 1 - p.castReT / stats.castRe, count: p.castAmmo, max: stats.castMax },
    { key: 'SPACE', name: 'DASH', icon: '💨', cd: p.dashCh > 0 ? 0 : 1 - p.dashRe / 0.9, count: p.dashCh, max: stats.dashMax },
  ];
  if (!ptero.hidden) slots.push({ key: 'T', name: 'PTERO', icon: () => getSprite('ptero', Math.floor(G.t * 8) % 2), cd: clamp(ptero.cd / PTERO_CD, 0, 1), ready: ptero.cd <= 0 && ptero.mode !== 'dive' });
  if (stats.agentsUnlocked) slots.push({ key: 'E', name: 'AGENTS', icon: '🤖', cd: 1 - p.meter / 100, ready: p.meter >= 100, meter: true });
  if (stats.bindUnlocked) slots.push({ key: 'R', name: 'BIND', icon: '🔗', cd: 0, ready: true });
  slots.forEach((s, i) => {
    const x = 50 + i * 74, y = H - 56;
    ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2); ctx.fillStyle = 'rgba(6,10,22,0.85)'; ctx.fill();
    ctx.strokeStyle = s.ready ? '#b46bff' : s.cd > 0 ? '#3a4560' : '#36d3e6'; ctx.lineWidth = s.ready ? 3 + Math.sin(G.t * 8) : 2;
    if (s.ready) { ctx.shadowColor = '#b46bff'; ctx.shadowBlur = 16; }
    ctx.stroke(); ctx.shadowBlur = 0;
    if (typeof s.icon === 'function') drawSprite(s.icon(), x, y + 9, 1); else { CRISP = false; text(s.icon, x, y + 1, 22, '#fff'); CRISP = true; }
    if (s.cd > 0) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.cd); ctx.closePath();
      ctx.fillStyle = s.meter ? 'rgba(20,10,40,0.7)' : 'rgba(0,0,0,0.65)'; ctx.fill();
    }
    text(s.key, x, y - 37, 11, '#9fb3d9');
    text(s.name, x, y + 37, 11, s.ready ? '#e0c8ff' : '#c9d6f0');
    if (s.max) for (let k = 0; k < s.max; k++) { ctx.fillStyle = k < s.count ? '#36d3e6' : '#26324a'; ctx.fillRect(x - s.max * 5 + k * 10 + 1, y + 22, 8, 3); }
  });

  // level label
  const Lv = LEVELS[G.level];
  text(`LEVEL ${G.level + 1} / ${LEVELS.length}`, W / 2, 26, 14, '#7f93b8');
  text(Lv.name.toUpperCase(), W / 2, 46, 22, '#e8eefc', 'center', UI_FONT, '700');
  if (G.levelStarted && !G.cleared && Lv.waves.length > 1) text(`WAVE ${Math.max(1, G.wave + 1)} / ${Lv.waves.length}`, W / 2, 68, 13, THEMES[LEVELS[G.level].atmos].acc);

  // unresolved alerts counter
  panel(W - 236, 16, 220, 64, 'rgba(22,6,10,0.8)', G.alerts === 0 ? 'rgba(54,211,230,0.8)' : 'rgba(255,59,78,0.6)');
  text('UNRESOLVED ALERTS', W - 126, 32, 12, '#ff9aa6');
  const n = Math.round(G.alertsDisp);
  text(n.toLocaleString(), W - 126, 58, 30, G.alerts === 0 ? '#36d3e6' : '#ff3b4e', 'center', UI_FONT, '700', G.alerts === 0 ? '#36d3e6' : '#ff3b4e');

  // boons
  stats.boons.forEach((b, i) => {
    const x = 24 + (i % 12) * 26, y = H - 128 - Math.floor(i / 12) * 26;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = AGENTS[b.agent].col; ctx.fill();
    CRISP = false; text(AGENTS[b.agent].icon, x, y + 0.5, 11, '#0a0f1e'); CRISP = true;
  });

  // boss bar
  const boss = enemies.find(e => e.boss && e.spawnT <= 0 && (e.type !== 'soac' || e.introDone));
  if (boss) {
    const w = Math.min(560, W - 560), x = W / 2 - w / 2, y = 88;
    text(boss.name, W / 2, y - 4, 14, '#ffb0b8', 'center', UI_FONT, '700', '#ff2a2a');
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; rr(x - 2, y + 6, w + 4, 16, 4); ctx.fill();
    const bg = ctx.createLinearGradient(x, 0, x + w, 0); bg.addColorStop(0, '#a01020'); bg.addColorStop(1, '#ff3b4e');
    ctx.fillStyle = boss.stagger ? '#36d3e6' : bg; rr(x, y + 8, w * clamp(boss.hp / boss.maxHp, 0, 1), 12, 3); ctx.fill();
    if (boss.type === 'soac') for (const f of [0.66, 0.33]) { ctx.fillStyle = '#000'; ctx.fillRect(x + w * f - 1, y + 8, 2, 12); }
  }

  // bark
  if (G.bark) {
    ctx.globalAlpha = clamp(G.bark.t / 0.4, 0, 1);
    const col = nameColor(G.bark.who);
    MAIN.font = fontStr(18, UI_FONT); const tw = MAIN.measureText(G.bark.who + ': ' + G.bark.text).width;
    panel(W / 2 - tw / 2 - 16, 124, tw + 32, 34, 'rgba(10,4,8,0.8)', col);
    text(`${G.bark.who}: ${G.bark.text}`, W / 2, 141, 18, col);
    ctx.globalAlpha = 1;
  }
  // banner
  if (G.banner) {
    const b = G.banner, a = clamp(Math.min(b.t / 0.4, (b.max - b.t) / 0.25 + 0.2), 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H * 0.3 - 34, W, 68);
    text(b.text, W / 2, H * 0.3, Math.min(38, W / 28), b.col, 'center', UI_FONT, '700', b.col);
    ctx.globalAlpha = 1;
  }
  text('WASD move · Mouse aim · LMB strike · RMB pulse · Q wave · SPACE dash' + (stats.agentsUnlocked ? ' · E agents' : '') + ' · T ptero · ESC pause · M music · C CRT', W - 16, H - 14, 12, 'rgba(160,180,220,0.6)', 'right');
}
function nameColor(who) {
  if (who === 'SKELLY') return '#36d3e6';
  if (who === 'SOCRATES') return '#6ff7ff';
  if (who === 'S.O.A.C') return '#ff3b4e';
  if (who === 'HIGH PRIEST') return '#d27bff';
  if (who === 'SOC GOBLIN') return '#6fbf4a';
  if (ANALYSTS[who]) return '#ffd23b';
  const A = AGENTS.find(a => who.endsWith(a.id)); if (A) return A.col;
  return '#ffffff';
}
function drawPortrait(who, x, y, w, h) {
  const crisp = CRISP; CRISP = false;
  ctx.save(); rr(x, y, w, h, 10); ctx.fillStyle = '#070b18'; ctx.fill(); ctx.clip();
  const cx = x + w / 2, cy = y + h / 2;
  if (who === 'SKELLY') drawSkelly(cx, cy + h * 0.95, { s: 2.5, armsOut: false, noShadow: true });
  else if (who === 'SOCRATES') { ctx.fillStyle = 'rgba(95,246,255,0.08)'; ctx.fillRect(x, y, w, h); drawSocratesHead(cx, cy - 12, 46, 1, dlg && dlg.chars < dlg.lines[dlg.i].text.length); }
  else if (ANALYSTS[who]) drawAnalyst(cx, cy + 62, who, 2.1, G.state === 'transform');
  else if (who === 'S.O.A.C') drawSOAC(cx, cy + 175, { k: 0, arm: 0 }, 0.62);
  else if (who === 'HIGH PRIEST') drawMonk(cx, cy + 120, { t: G.t }, false, 2.6, true);
  else if (who === 'SOC GOBLIN') drawGoblin(cx - 10, cy + 70, 1.4);
  else { const A = AGENTS.find(a => who.endsWith(a.id)); if (A) drawAgent(cx, cy + 62, { ...A, anim: 0 }, 2.6, true); }
  ctx.restore();
  rr(x, y, w, h, 10); ctx.strokeStyle = nameColor(who); ctx.lineWidth = 2; ctx.stroke();
  CRISP = crisp;
}
function renderDlg() {
  const ln = dlg.lines[dlg.i];
  const bw = Math.min(980, W - 40), bh = 170, bx = W / 2 - bw / 2, by = H - bh - 22;
  panel(bx, by, bw, bh, 'rgba(5,8,18,0.92)', nameColor(ln.who));
  drawPortrait(ln.who, bx + 12, by + 10, 150, 150);
  text(ln.who, bx + 180, by + 26, 22, nameColor(ln.who), 'left', UI_FONT, '700');
  const lines = wrapLines(ln.text, bw - 200, 20);
  drawTyped(lines, dlg.chars, bx + 180, by + 62, 28, 20, '#e8eefc');
  if (dlg.chars >= ln.text.length && Math.sin(G.t * 6) > -0.3) text('ENTER ▶', bx + bw - 20, by + bh - 18, 13, '#9fb3d9', 'right');
}
function renderBoon() {
  ctx.fillStyle = 'rgba(2,3,10,0.75)'; ctx.fillRect(0, 0, W, H);
  text('AN AI AGENT OFFERS A BOON', W / 2, H * 0.16, 36, '#e8d4ff', 'center', TITLE_FONT, '400', '#b46bff');
  text('Choose one  ·  [1] [2] [3] or click', W / 2, H * 0.16 + 38, 15, '#9fb3d9');
  const cw = Math.min(280, (W - 100) / 3), ch = 330, gap = 24, x0 = W / 2 - (cw * 3 + gap * 2) / 2, y0 = H * 0.27;
  G.cardRects = [];
  G.boonChoices.forEach((b, i) => {
    const A = AGENTS[b.agent], x = x0 + i * (cw + gap), y = y0;
    const hov = mouse.x > x && mouse.x < x + cw && mouse.y > y && mouse.y < y + ch;
    G.cardRects.push({ x, y, w: cw, h: ch });
    ctx.save();
    if (hov) { ctx.shadowColor = A.col; ctx.shadowBlur = 30; }
    panel(x, y - (hov ? 6 : 0), cw, ch, 'rgba(10,14,30,0.95)', A.col);
    ctx.restore();
    const yy = y - (hov ? 6 : 0);
    CRISP = false; drawAgent(x + cw / 2, yy + 168, { ...A, anim: i }, 2.2); CRISP = true;
    text('AGENT ' + A.id, x + cw / 2, yy + 22, 15, A.col);
    text(b.name, x + cw / 2, yy + 185, 21, '#ffffff', 'center', UI_FONT, '700');
    wrapLines(b.desc, cw - 40, 16).forEach((l, k) => text(l, x + cw / 2, yy + 222 + k * 22, 16, '#c9d6f0'));
    text(`[${i + 1}]`, x + cw / 2, yy + ch - 24, 18, A.col);
  });
}
function renderPause() {
  ctx.fillStyle = 'rgba(2,3,10,0.75)'; ctx.fillRect(0, 0, W, H);
  text('PAUSED', W / 2, H * 0.28, 60, '#36d3e6', 'center', TITLE_FONT, '400', '#36d3e6');
  const lines = ['WASD / Arrows — Move', 'Mouse — Aim', 'Left Click / J — Hyperautomation Strike (hold to combo)', 'Right Click / K — Threat Enrichment Pulse',
    'Q / L — Phishing Annihilation Wave', 'Space / Shift — Dash', 'T — Pterodactyl Strike', 'E — Summon AI Agents (when meter is full)', 'R — Infinite Integration Bind (final boss)', 'M — Toggle music', 'C — Toggle CRT scanlines', '', 'ESC — Resume'];
  lines.forEach((l, i) => text(l, W / 2, H * 0.38 + i * 28, 19, '#c9d6f0'));
}
function renderDead() {
  ctx.fillStyle = `rgba(30,0,6,${Math.min(0.8, G.deadT)})`; ctx.fillRect(0, 0, W, H);
  if (G.deadT < 0.5) return;
  text('THE QUEUE CLAIMS YOU', W / 2, H * 0.38, 64, '#ff3b4e', 'center', TITLE_FONT, '400', '#ff2a2a');
  text('"Every ticket feeds me." — S.O.A.C', W / 2, H * 0.38 + 56, 20, '#ff9aa6');
  if (Math.sin(G.t * 5) > -0.2) text('PRESS ENTER TO RISE AGAIN', W / 2, H * 0.6, 24, '#ffffff');
}
function renderTransformOverlay() {
  const T = G.trT;
  if (T > 3.9 && T < 4.8) { ctx.fillStyle = `rgba(220,250,255,${1 - (T - 3.9) / 0.9})`; ctx.fillRect(0, 0, W, H); }
  if (T > 4.5 && !dlg) {
    const a = clamp((T - 4.5) / 0.8, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,10,20,0.55)'; ctx.fillRect(0, H * 0.12, W, 130);
    text('⚡ TORQ HYPERSOC™ ⚡', W / 2, H * 0.12 + 50, Math.min(64, W / 14), '#35c8ff', 'center', TITLE_FONT, '400', '#35c8ff');
    text('The Autonomous SOC — Agentic AI + Hyperautomation, united.', W / 2, H * 0.12 + 100, 20, '#e8f8ff');
    ctx.globalAlpha = 1;
  }
  text('UNRESOLVED ALERTS: ' + Math.round(G.alertsDisp).toLocaleString(), W / 2, H - 30, 22, G.alerts === 0 ? '#36d3e6' : '#ff3b4e');
}

// ---------- story slides ----------
function sceneOffice(x, y, w, h, happy) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, happy ? '#0a2034' : '#1a0a14'); g.addColorStop(1, '#05060c'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const cols = 9, rows = 3, mw = w / cols * 0.8, mh = h * 0.13;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const mx = x + w / cols * c + (w / cols - mw) / 2, my = y + 18 + r * (mh + 10);
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    const on = happy || Math.sin(G.t * 5 + r * 3 + c) > -0.3;
    ctx.fillStyle = happy ? '#0c3040' : on ? '#4a0c16' : '#200810'; ctx.fillRect(mx, my, mw, mh);
    text(happy ? '✓' : '!', mx + mw / 2, my + mh / 2, mh * 0.6, happy ? '#36d3e6' : '#ff3b4e');
  }
  ctx.fillStyle = '#1b1e28'; ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
  ['MAYA', 'DEX', 'KAI'].forEach((n, i) => {
    const ax = x + w * (0.3 + i * 0.2), ay = y + h * 0.9;
    ctx.fillStyle = '#2a2f3a'; ctx.fillRect(ax - 40, ay - 50, 80, 8);
    drawAnalyst(ax, ay, n, 1.6, happy);
  });
  if (!happy) for (let i = 0; i < 40; i++) {
    const tx = x + hash(i, 5) * w, ty = y + h * 0.7 + hash(i, 6) * h * 0.3;
    ctx.save(); ctx.translate(tx, ty); ctx.rotate((hash(i, 7) - 0.5) * 2); ctx.fillStyle = '#efe9d2'; ctx.fillRect(-9, -6, 18, 12); ctx.fillStyle = '#d0263a'; ctx.fillRect(-7, -4, 8, 2); ctx.restore();
  }
  const label = happy ? '0 UNRESOLVED ALERTS' : '10,000 UNRESOLVED';
  text(label, x + w - 20, y + h * 0.66, 26, happy ? '#36d3e6' : '#ff3b4e', 'right', UI_FONT, '700', happy ? '#36d3e6' : '#ff3b4e');
}
const SLIDES = {
  ch1: { chapter: 'CHAPTER I', title: 'The Land of a Thousand Tickets',
    text: 'In the fluorescent purgatory of the SOC Realm, time moved like cold syrup. Three analysts — Maya, Dex, and Kai — drowned in an ocean of alerts that never slept and never meant anything.\nFor a thousand years the realm had been ruled by the SOAR Brotherhood. They promised automation, but delivered paperwork. They promised speed, but delivered meetings about meetings.\nThen, from somewhere beyond the parking lot... the rumble of a monster truck.',
    art: (x, y, w, h) => sceneOffice(x, y, w, h, false) },
  ch7: { chapter: 'CHAPTER VII', title: 'S.O.A.C Becomes HyperSOC',
    text: 'The old robot did not die. It was reborn. The server racks aligned. The red eyes turned brilliant blue. The AI Agents wove themselves into its architecture — not replacing the analysts, but working beside them, giving back the thing that had been stolen: time.\nThe queue read: 0 unresolved alerts. Maya, Dex, and Kai were free — for the first time — to actually think.',
    art: (x, y, w, h) => {
      sceneOffice(x, y, w, h, true);
      drawSOAC(x + w * 0.1, y + h * 0.95, { k: 1, arm: 0 }, 0.42);
      AGENTS.forEach((A, i) => drawAgent(x + w * (0.22 + i * 0.1), y + h * 0.66, { ...A, anim: i }, 1.2));
    } },
  epi: { chapter: 'EPILOGUE', title: 'All Gas. No Brakes.',
    text: 'The analysts kept their jobs — and finally got to do them. Socrates returned to his portal, already analyzing the next ATT&CK update.\nSomewhere, a SOAR vendor sent an angry email. Nobody read it. Agent ENRICH flagged it. Agent CASE filed it. Agent TRIAGE closed the ticket.\nAnd Skelly drove his monster truck into the horizon, pterodactyl screaming overhead, toward the next SOC that didn\'t know it needed saving yet.',
    art: (x, y, w, h) => {
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#1a0830'); g.addColorStop(0.55, '#c0365a'); g.addColorStop(0.62, '#ff9a2e'); g.addColorStop(0.63, '#12101a'); g.addColorStop(1, '#05060c');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ellipse(x + w * 0.62, y + h * 0.6, 70, 70, 'rgba(255,200,120,0.7)');
      ctx.fillStyle = '#12101a'; ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
      ctx.strokeStyle = '#ffd23b'; ctx.lineWidth = 3; ctx.setLineDash([20, 18]); ctx.lineDashOffset = G.t * 80; line(x + w * 0.62, y + h * 0.62, x + w * 0.35, y + h); ctx.setLineDash([]);
      const k = (G.slideT * 0.08) % 1;
      const tx = lerp(x + w * 0.42, x + w * 0.6, k), ty = lerp(y + h * 0.92, y + h * 0.66, k), sc = lerp(0.7, 0.2, k);
      for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.6; ellipse(tx - 60 * sc - i * 14 * sc, ty - 40 * sc + Math.sin(G.t * 20 + i) * 4, 10 * sc * (1 + i * 0.3), 6 * sc, pick(['#ff6a00', '#c040ff', '#ffb02e'])); }
      ctx.globalAlpha = 1;
      drawTruck(tx, ty, sc, true, -0.3);
      drawPtero(tx + 40 * sc + Math.sin(G.t) * 30, ty, 160 * sc + 40, false);
    } },
  goblin: { chapter: 'MEANWHILE', title: '...in a Server Closet',
    text: 'The SOC Goblin — hunched over a keyboard, buried in a mountain of tickets — watched it all from the shadows.\nThen, very quietly, he added his name to the Torq waitlist.',
    art: (x, y, w, h) => {
      ctx.fillStyle = '#07090f'; ctx.fillRect(x, y, w, h);
      for (const rx of [x + 30, x + w - 110]) { ctx.save(); rack(rx, y + 20, 80, h - 40, '#1d2333', '#0c0f18', '#3aff9a', rx | 0); ctx.restore(); }
      const g = ctx.createRadialGradient(x + w / 2 - 60, y + h * 0.55, 10, x + w / 2 - 60, y + h * 0.55, 260);
      g.addColorStop(0, 'rgba(58,255,154,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      drawGoblin(x + w / 2 + 20, y + h * 0.9, Math.min(2.4, h / 120));
    } },
  final: { chapter: 'FINAL WORDS ON THE WALL', title: '"SOAR is dead."',
    text: () => `"The autonomous SOC is here. And it only took one flaming skeleton, one ancient wizard, five AI agents, and the willingness to automate everything."\nTORQ · Your Security Product's Favorite Security Product · torq.io\nRun stats — Time: ${Math.floor(G.time / 60)}m ${Math.floor(G.time % 60)}s · Threats resolved: ${G.kills} · Hits taken: ${G.hits} · Boons: ${stats ? stats.boons.length : 0}`,
    art: (x, y, w, h) => {
      ctx.fillStyle = '#0a0d18'; ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 12; i++) for (let j = 0; j < 5; j++) { ctx.strokeStyle = '#141a2c'; ctx.strokeRect(x + i * w / 12, y + j * h / 5, w / 12, h / 5); }
      ctx.save(); ctx.translate(x + w * 0.28, y + h * 0.5); ctx.rotate(-0.08);
      text('SOAR IS DEAD', 0, 0, Math.min(36, w / 26), '#ff3b4e', 'center', TITLE_FONT, '400', '#ff2a2a'); ctx.restore();
      drawSkelly(x + w * 0.72, y + h * 0.95, { s: h / 95 });
      text('TORQ', x + w * 0.28, y + h * 0.8, 40, '#ffffff', 'center', 'Impact, sans-serif', '400', '#36d3e6');
    } },
};
function renderStory() {
  ctx.fillStyle = '#04050b'; ctx.fillRect(0, 0, W, H);
  const S = G.slides[G.slideI];
  const aw = Math.min(W * 0.84, 1000), ah = Math.min(H * 0.42, 420), ax = W / 2 - aw / 2, ay = H * 0.06;
  panel(ax, ay, aw, ah, '#000', 'rgba(54,211,230,0.8)');
  CRISP = false; ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip(); S.art(ax, ay, aw, ah); ctx.restore(); CRISP = true;
  text(S.chapter, W / 2, ay + ah + 30, 15, '#ff3b4e', 'center', UI_FONT, '700');
  text(S.title, W / 2, ay + ah + 66, Math.min(44, W / 22), '#e8eefc', 'center', TITLE_FONT, '400', '#36d3e6');
  const str = typeof S.text === 'function' ? S.text() : S.text;
  const tw = Math.min(860, W - 80), fs = Math.min(20, W / 55);
  const lines = wrapLines(str, tw, fs);
  drawTyped(lines, G.slideT * 70, W / 2 - tw / 2, ay + ah + 110, fs * 1.4, fs, '#c9d6f0');
  if (G.slideT * 70 >= str.length && Math.sin(G.t * 5) > -0.3) text('PRESS ENTER ▶', W - 30, H - 26, 15, '#9fb3d9', 'right');
}
const TITLE_ATMOS = { sky: ['#1a1238', '#6a2a5e', '#e8805a'], amb: '#b898c0', moon: { x: 0.74, y: 0.55, r: 46, c: '#f6ecd0' }, stars: 70,
  clouds: '#7a3a6a', hills: '#2a1636', water: '#241a3a', veg: '#4a6a3a', stone: ['#8a7c90', '#6e6278'] };
function flameAt(x, y, s) {
  const f = Math.sin(G.t * 17 + x) + Math.sin(G.t * 23 + y);
  poly([{ x: x - 6 * s, y }, { x: x + f * 1.5 * s, y: y - (22 + f * 2) * s }, { x: x + 6 * s, y }], '#ff4a1a');
  poly([{ x: x - 4 * s, y }, { x: x - f * s, y: y - (15 + f) * s }, { x: x + 4 * s, y }], '#ffb02e');
  poly([{ x: x - 2 * s, y }, { x, y: y - 7 * s }, { x: x + 2 * s, y }], '#fff2b0');
}
// Kingdom-style side view: Skelly on a stone riverbank at dusk, the whole scene mirrored in the river.
function renderTitle() {
  const P = PASS_PX, w = buf.width, h = buf.height, A = TITLE_ATMOS, k = (H / 610) / P;
  const ground = H * 0.6, bankB = H * 0.69, sc = H / 300;
  PIX = P;
  // scene sprites on a transparent buffer
  ctx.fillStyle = A.veg; ctx.fillRect(0, ground - 3, W, 6);
  ctx.save(); ctx.translate(0, ground + 3); ctx.scale(P, P);
  ctx.fillStyle = patternFor(genTexture('bank', A.stone.concat(A.veg), 77)); ctx.fillRect(0, 0, W / P, (bankB - ground) / P);
  ctx.restore();
  for (let x = 4; x < W; x += 9) drawBlades(x, ground - 2, 2, 10 * sc / 2.6, hash(x, 3) < 0.5 ? A.veg : shadeHex(A.veg, 1.4), x);
  const torches = [W * 0.31, W * 0.69];
  for (const tx of torches) { ctx.fillStyle = '#2a1d12'; ctx.fillRect(tx - 3 * sc / 2, ground - 46 * sc, 3 * sc, 46 * sc); ctx.fillStyle = '#4a3a26'; ctx.fillRect(tx - 5 * sc / 2, ground - 49 * sc, 5 * sc, 4 * sc); flameAt(tx, ground - 49 * sc, sc * 0.9); }
  drawTruck(W * 0.15, ground + 3, sc * 0.42, false, 0);
  drawSkelly(W / 2, ground + 2, { s: sc });
  drawScythe(W / 2 + 26 * sc, ground - 48 * sc, -1.2, sc * 0.9, 1);
  const pa = G.t * 0.8;
  drawPtero(W / 2 + Math.cos(pa) * W * 0.27, ground, H * 0.3 + Math.sin(G.t * 1.6) * 14, Math.sin(pa) > 0, 2.5);
  // light it, then put the sky behind
  const L = [
    ...torches.map(tx => ({ x: tx / P, y: (ground - 55 * sc) / P, r: H * 0.32 / P, c: '#ff9a48', i: 0.95 })),
    { x: W / 2 / P, y: (ground - 62 * sc) / P, r: H * 0.16 / P, c: '#b45cff', i: 0.7 },
    { x: (W / 2 + 40 * sc) / P, y: (ground - 70 * sc) / P, r: H * 0.12 / P, c: '#36d3e6', i: 0.6 },
    { x: W * 0.15 / P, y: (ground - 20 * sc) / P, r: H * 0.14 / P, c: '#ff8a2a', i: 0.5 },
  ];
  lightPass(L, A.amb);
  fitCanvas(tmpC, w, h); tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, w, h);
  paintSky(tctx, w, h, A, () => ground / P, -G.t * 10, k);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over'; ctx.drawImage(tmpC, 0, 0); ctx.globalCompositeOperation = 'source-over';
  // river: mirror everything above the waterline, row by row with a ripple
  const wl = Math.round(bankB / P);
  tctx.clearRect(0, 0, w, h); tctx.drawImage(buf, 0, 0);
  ctx.fillStyle = A.water; ctx.fillRect(0, wl, w, h - wl);
  ctx.globalAlpha = 0.65;
  for (let y = wl; y < h; y++) {
    const sy = 2 * wl - y - 1; if (sy < 0) break;
    ctx.drawImage(tmpC, 0, sy, w, 1, Math.round(Math.sin(y * 0.9 + G.t * 2.2) * (0.5 + (y - wl) * 0.07)), y, w, 1);
  }
  ctx.globalAlpha = 1;
  const dg = ctx.createLinearGradient(0, wl, 0, h); dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, A.water);
  ctx.fillStyle = dg; ctx.globalAlpha = 0.45; ctx.fillRect(0, wl, w, h - wl); ctx.globalAlpha = 1;
  waterStreaks(ctx, A, w, h, wl + 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, wl, w, 1);
  for (let i = 0; i < 14; i++) {
    const x = hash(i, 5) * w; ctx.fillStyle = shadeHex(A.veg, 0.85);
    for (let b = 0; b < 5; b++) { const bh = 1 + hash(i, b) * 3; ctx.fillRect(Math.round(x + b * 1.5 + Math.sin(G.t * 1.5 + i + b) * 0.8), Math.round(wl + 1 - bh), 1, Math.round(bh)); }
  }
  ctx.restore();
  drawWeather('fireflies', w, h);
  setUI();
  text('SKELLY', W / 2, H * 0.12, Math.min(110, W / 8), '#e8f8ff', 'center', TITLE_FONT, '400', '#36d3e6');
  text('& THE DEATH OF SOAR', W / 2, H * 0.12 + Math.min(80, W / 11), Math.min(54, W / 16), '#c56bff', 'center', TITLE_FONT, '400', '#b046ff');
  text('A TORQ HYPERAUTOMATION TALE', W / 2, H * 0.27, 16, '#e8d0e0', 'center', UI_FONT, '700');
  if (Math.sin(G.t * 4) > -0.3) text('PRESS ENTER TO START', W / 2, H * 0.83, Math.min(34, W / 24), '#ffffff', 'center', UI_FONT, '700', '#36d3e6');
  text('"Your security product\'s favorite security product — and the only skeleton brave enough to prove it."', W / 2, H * 0.9, 15, '#c9b8d8', 'center', UI_FONT, '500');
  text('WASD move · Mouse aim · LMB strike · RMB pulse · Q wave · SPACE dash · T ptero · M music · C CRT', W / 2, H * 0.95, 13, 'rgba(200,190,220,0.7)');
}

function render() {
  MAIN.setTransform(1, 0, 0, 1, 0, 0); MAIN.fillStyle = '#000'; MAIN.fillRect(0, 0, cv.width, cv.height);
  switch (G.state) {
    case 'title': beginPass(PX_TITLE); setUI(); CRISP = true; renderTitle(); CRISP = false; endPass(22); break;
    case 'story': beginPass(3); setUI(); CRISP = true; renderStory(); CRISP = false; endPass(24); break;
    default: {
      beginPass(PX_WORLD); renderWorld(); endPass(22);
      const overlay = G.state === 'boon' || G.state === 'pause' || G.state === 'dead' || G.state === 'transform' || dlg;
      if (G.state !== 'intro' && G.state !== 'transform' && !dlg) { beginPass(2); setUI(); CRISP = true; renderHUD(); CRISP = false; endPass(); }
      if (overlay) {
        beginPass(2); setUI(); CRISP = true;
        if (G.state === 'boon') renderBoon();
        if (G.state === 'pause') renderPause();
        if (G.state === 'dead') renderDead();
        if (G.state === 'transform') renderTransformOverlay();
        if (dlg) renderDlg();
        CRISP = false; endPass();
      }
    }
  }
  MAIN.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G.fade) {
    const t = G.fade.t, a = t < 0.4 ? t / 0.4 : Math.max(0, (0.8 - t) / 0.4);
    MAIN.fillStyle = `rgba(0,0,0,${a})`; MAIN.fillRect(0, 0, W, H);
  }
  if (CRT) {
    MAIN.fillStyle = scanPattern; MAIN.fillRect(0, 0, W, H);
    const v = MAIN.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    MAIN.fillStyle = v; MAIN.fillRect(0, 0, W, H);
  }
  drawCursor();
}
// chunky pixel crosshair
function drawCursor() {
  if (G.state === 'title' || G.state === 'story') return;
  const s = 3, x = Math.round(mouse.x / s) * s, y = Math.round(mouse.y / s) * s;
  MAIN.fillStyle = '#000';
  for (const [dx, dy, w, h] of [[-5, -1, 3, 3], [3, -1, 3, 3], [-1, -5, 3, 3], [-1, 3, 3, 3]]) MAIN.fillRect(x + (dx - 0.5) * s, y + (dy - 0.5) * s, (w + 1) * s, (h + 1) * s);
  MAIN.fillStyle = '#36d3e6';
  for (const [dx, dy, w, h] of [[-5, 0, 3, 1], [3, 0, 3, 1], [0, -5, 1, 3], [0, 3, 1, 3]]) MAIN.fillRect(x + dx * s, y + dy * s, w * s, h * s);
  MAIN.fillStyle = '#ffffff'; MAIN.fillRect(x, y, s, s);
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  try { update(dt); render(); } catch (err) { console.error(err); }
  for (const k in pressed) delete pressed[k];
  mouse.pressed = [false, false, false];
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
