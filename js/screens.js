/* Fold Communicator — what the two screens show, the two selfie-camera holes, and the iPhone Duo-style hand-over.
   Owner after B0: B4 (BUILD-SPEC 6.3). Every picture is drawn with canvas paths in the page font: generic app names
   and line glyphs, no real app names or logos. */
import * as THREE from "three";
import { props, S, GEO, Q, params, invalidate } from "./state.js";
import { $, cv, rr, tex, sm } from "./util.js";
import { mat } from "./materials.js";
import { tag } from "./teardown.js";

const BLUR = [0, 3, 7, 12, 18, 26];   // Duo-style blur steps, in full-size canvas pixels
const FONT = "'IBM Plex Sans',sans-serif", MONO = "'IBM Plex Mono',monospace";
const font = (w, px, mono) => w + " " + px + "px " + (mono ? MONO : FONT);

/* SCREEN CONTENT — edit this object; both displays repaint from it. Generic names only. */
const screen = {
  time: "10:23",
  cover: {
    date: "Monday, 3 August", weather: "18°",
    // one grouped stack of lock-screen notifications
    cards: [
      { app: "Messages",   icon: "chat",  col: "#2a9fd8", when: "now", title: "Mum",            text: "Did you get home okay?", fresh: 1 },
      { app: "Group chat", icon: "chats", col: "#7f8bff", when: "5m",  title: "Football group", text: "3 new messages", count: 3 },
      { app: "Mail",       icon: "mail",  col: "#d9453a", when: "1h",  title: "2 new emails",   text: "Grace W., City Library" }
    ]
  },
  // the inner screen shows one messaging app in its two-pane layout (as foldable messaging apps do): the chat list on
  // the left, the selected chat (sel) open on the right; unread: 1 = a dot, n > 1 = a count
  inner: {
    left:  { kind: "list", app: "Messages", chips: ["All", "Unread", "Groups"],
             rows: [{ name: "Amara K.",       text: "Look at this view!",              time: "10:21", sel: 1, photo: 1 },
                    { name: "Mum",            text: "Did you get home okay?",          time: "09:58", unread: 1 },
                    { name: "Football group", text: "Sam: Thursday 7pm, same pitch?",  time: "09:40", unread: 3 },
                    { name: "David O.",       text: "Thanks for dinner last night",    time: "08:47" },
                    { name: "Grace W.",       text: "Haha yes, see you there",         time: "Sun" },
                    { name: "Pharmacy",       text: "Your order is ready to collect",  time: "Sat" }] },
    right: { kind: "chat", app: "Amara K.", status: "Active now", day: "Today",
             // [who, text] or [who, "photo"]; drawn from the bottom up, like a chat scrolled to its newest message
             msgs: [["in", "photo"], ["in", "Look at this view!"], ["out", "Wow! How long did the climb take?"],
                    ["in", "About three hours. Worth every step"], ["out", "Send me the trail, let's do it together next time"]],
             seen: "Seen 10:22", draft: "Message" }
  },
  // floating taskbar: six pinned apps, a divider, two recent apps; colour null = the accent; 1 = open (dot under it)
  taskbar: { pinned: [["phone", "#2a9fd8"], ["chat", "#2f9e5a", 1], ["mail", "#d9453a"], ["calendar", "#7f8bff"], ["camera", "#3a4048"], ["photo", null]],
             recent: [["music", "#d9453a"], ["pin", "#2f9e5a"]] }
};

/* ---------- where the camera holes are ----------
   Model: front coords in mm (parts.js). Canvas: the same points on the two screen pictures, worked out from the
   display meshes' UV mapping in exterior.js, so the status bars always leave the holes clear. */
const HOLES = {
  inner: { leaf: "panel", x: 69.0, y: 55.0, r: 1.6, ring: 1.8, lens: 0.7,  layer: "screen",      ex: 3 },
  cover: { leaf: "deck",  x: 38.25, y: 54.85, r: 1.3, ring: 1.45, lens: 0.55, layer: "coverscreen", ex: -3.8 }
};
const CV = (() => {
  const { H, L, DB, CWd, CHt, CX, CY } = GEO, DW = L - DB, DH = H - 2 * DB, hi = HOLES.inner, hc = HOLES.cover;
  const inner = { W: 1480, H: 1190, clear: 26, right: 1380 }, cover = { W: 870, H: 1000, clear: 28, right: 822 };
  // inner: u = 0.5 + x / 2DW (the panel is the right half), v = (y + DH/2) / DH; cover: u = (x − CX)/CWd + ½
  inner.hole = [inner.W * (0.5 + hi.x / (2 * DW)), inner.H * (1 - (hi.y + DH / 2) / DH)]; inner.holeR = hi.r * inner.W / (2 * DW);
  cover.hole = [cover.W * ((hc.x - CX) / CWd + 0.5), cover.H * (0.5 - (hc.y - CY) / CHt)]; cover.holeR = hc.r * cover.W / CWd;
  [inner, cover].forEach((c) => { c.sy = Math.round(c.hole[1]);   // the status bar is centred on the hole
    // text sizes as fractions of canvas height (BUILD-SPEC 6.3 item 6); the status bar time is 22 px on both
    c.fs = { status: 22, label: Math.round(c.H * 0.016), title: Math.round(c.H * 0.026), body: Math.round(c.H * 0.021) }; });
  return { inner, cover };
})();

/* ---------- glyphs: line icons on a 24-unit grid with 2-unit strokes (the usual icon grid) ---------- */
// speech bubble with its tail at the bottom left, at x = tx
function bubble(g, x0, y0, x1, y1, r, tx) { g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x1, y0, x1, y1, r); g.arcTo(x1, y1, x0, y1, r);
  g.lineTo(tx + 5, y1); g.lineTo(tx, y1 + 4); g.lineTo(tx, y1); g.arcTo(x0, y1, x0, y0, r); g.arcTo(x0, y0, x1, y0, r); g.closePath(); }
const line = (g, ...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
const ring = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); };
const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const GLYPH = {
  chat(g) { bubble(g, 3, 4, 21, 17, 4, 7); g.stroke(); },
  chats(g, bg) { rr(g, 8.5, 3, 13.5, 10, 3); g.stroke(); bubble(g, 2, 8.5, 15.5, 18, 3, 5); g.fillStyle = bg; g.fill(); g.stroke(); },
  mail(g) { rr(g, 3, 5, 18, 14, 2.5); g.stroke(); line(g, 3.5, 7, 12, 13, 20.5, 7); },
  calendar(g) { rr(g, 4, 5, 16, 15, 2.5); g.stroke(); line(g, 4, 10, 20, 10); line(g, 8, 3, 8, 7); line(g, 16, 3, 16, 7); g.fillRect(13.5, 13.5, 3, 3); },
  camera(g) { rr(g, 3, 7, 18, 13, 3); g.stroke(); line(g, 8.5, 7, 10, 4.5, 14, 4.5, 15.5, 7); ring(g, 12, 13.5, 3.6); },
  phone(g) { g.beginPath(); g.moveTo(7, 3.5); g.lineTo(9.5, 8); g.lineTo(8, 9.8); g.quadraticCurveTo(10, 14.5, 14.2, 16); g.lineTo(16, 14.5);
    g.lineTo(20.5, 17); g.lineTo(19.5, 20); g.quadraticCurveTo(6, 21, 4, 5); g.closePath(); g.stroke(); },
  gear(g) { g.beginPath(); for (let k = 0; k < 32; k++) { const a = (k - 0.5) * Math.PI / 16, r = k % 4 < 2 ? 9.3 : 7;
      g.lineTo(12 + r * Math.cos(a), 12 + r * Math.sin(a)); } g.closePath(); g.stroke(); ring(g, 12, 12, 3); },
  clock(g) { ring(g, 12, 12, 8.5); line(g, 12, 7, 12, 12, 15.5, 14); },
  photo(g) { rr(g, 3, 4, 18, 16, 2.5); g.stroke(); line(g, 3.5, 17, 9, 11.5, 13.5, 16, 16.5, 13, 20.5, 17); dot(g, 16, 8.5, 1.6); },
  music(g) { line(g, 9, 17.5, 9, 5.5, 19, 3.5, 19, 15.5); dot(g, 6.8, 17.5, 2.6); dot(g, 16.8, 15.5, 2.6); },
  pin(g) { g.beginPath(); g.arc(12, 9.5, 6.5, 0.8 * Math.PI, 2.2 * Math.PI); g.lineTo(12, 21.5); g.closePath(); g.stroke(); ring(g, 12, 9.5, 2.3); },
  notes(g) { rr(g, 5, 3, 14, 18, 2.5); g.stroke(); line(g, 8.5, 8, 15.5, 8); line(g, 8.5, 12, 15.5, 12); line(g, 8.5, 16, 12.5, 16); },
  folder(g) { line(g, 3, 18.5, 3, 5.5, 9.5, 5.5, 11.5, 8, 21, 8, 21, 18.5, 3, 18.5); },
  cloud(g) { g.beginPath(); g.moveTo(7, 18); g.lineTo(18, 18); g.arc(18, 14.5, 3.5, 0.5 * Math.PI, -0.5 * Math.PI, true);
    g.arc(12.5, 11.5, 5.5, -0.1 * Math.PI, -Math.PI, true); g.arc(7, 14.5, 3.5, -0.5 * Math.PI, 0.5 * Math.PI, true); g.closePath(); g.stroke(); },
  torch(g) { g.beginPath(); g.moveTo(7, 3); g.lineTo(17, 3); g.lineTo(17, 6); g.lineTo(14.5, 10); g.lineTo(14.5, 21); g.lineTo(9.5, 21); g.lineTo(9.5, 10);
    g.lineTo(7, 6); g.closePath(); g.stroke(); line(g, 7, 6, 17, 6); dot(g, 12, 14, 1.2); },
  search(g) { ring(g, 10.5, 10.5, 6); line(g, 15, 15, 20.5, 20.5); },
  more(g) { dot(g, 12, 5, 1.9); dot(g, 12, 12, 1.9); dot(g, 12, 19, 1.9); },
  back(g) { line(g, 15, 4.5, 7.5, 12, 15, 19.5); },
  pencil(g) { g.beginPath(); g.moveTo(4, 20); g.lineTo(5, 15.5); g.lineTo(15.5, 5); g.lineTo(19, 8.5); g.lineTo(8.5, 19); g.closePath(); g.stroke(); line(g, 13, 7.5, 16.5, 11); },
  plus(g) { line(g, 12, 5, 12, 19); line(g, 5, 12, 19, 12); },
  send(g) { g.beginPath(); g.moveTo(4, 4.5); g.lineTo(20.5, 12); g.lineTo(4, 19.5); g.lineTo(6.5, 12); g.closePath(); g.stroke(); line(g, 6.5, 12, 12, 12); }
};
// draw glyph `name` centred at (x, y), s px across; bg = the colour behind it (for glyphs that overlap themselves)
function glyph(g, name, x, y, s, col, bg) {
  g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 24, s / 24);
  g.strokeStyle = g.fillStyle = col; g.lineWidth = 2; g.lineCap = "round"; g.lineJoin = "round";
  GLYPH[name](g, bg || "#000"); g.restore();
}
// an app icon: a white glyph on a coloured rounded tile with a soft top light
function tile(g, name, x, y, s, col) {
  g.fillStyle = col; rr(g, x - s / 2, y - s / 2, s, s, s * 0.3); g.fill();
  const lt = g.createLinearGradient(0, y - s / 2, 0, y + s / 2); lt.addColorStop(0, "rgba(255,255,255,.16)"); lt.addColorStop(1, "rgba(0,0,0,.06)");
  g.fillStyle = lt; g.fill();
  glyph(g, name, x, y, s * 0.6, "#fff", col);
}

/* ---------- shared drawing ---------- */
function fit(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 3 && g.measureText(s + "…").width > w) s = s.slice(0, -1); return s.trim() + "…"; }
// rounded rectangle with one radius on the top corners and another on the bottom ones (grouped cards)
function rr2(g, x, y, w, h, rt, rb) { g.beginPath(); g.moveTo(x + rt, y); g.arcTo(x + w, y, x + w, y + h, rt); g.arcTo(x + w, y + h, x, y + h, rb);
  g.arcTo(x, y + h, x, y, rb); g.arcTo(x, y, x + w, y, rt); g.closePath(); }
function wall(g, W, H, a) { g.fillStyle = "#08090b"; g.fillRect(0, 0, W, H);
  const gl = (x, y, r, c, al) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = al * a; g.fillStyle = q; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
  gl(W * 0.88, H * 0.02, W * 0.95, S.accent, 0.55); gl(W * 0.02, H * 1.02, W * 0.95, "#c46a3c", 0.5); gl(W * 0.45, H * 0.55, W * 0.55, "#34397f", 0.35);
  // the faint dark band real phones put behind the status bar
  const sc = g.createLinearGradient(0, 0, 0, 96); sc.addColorStop(0, "rgba(0,0,0,.32)"); sc.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sc; g.fillRect(0, 0, W, 96); }
// Wi-Fi: three arcs and a dot fanning up from (cx, by)
function wifi(g, cx, by, s) { for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(cx, by, s * 0.27 * i, -0.75 * Math.PI, -0.25 * Math.PI); g.stroke(); } dot(g, cx, by - 1, 2.2); }

// fail loudly (the page's error collector, so build/shoot.py fails) if a status-bar item reaches into a hole's clear zone
function keepClear(C, x0, x1, y0, y1, what) {
  const [hx, hy] = C.hole, dx = Math.max(x0 - hx, 0, hx - x1), dy = Math.max(y0 - hy, 0, hy - y1);
  if (Math.hypot(dx, dy) < C.holeR + C.clear) console.error("screens.js: status bar " + what + " is inside the camera hole's clear zone");
}
/* status bar, centred on the hole's height: time at x 48 (then optional notification glyphs); on the right, ending at
   C.right: Wi-Fi fan, "5G", segmented signal bars, battery pill and "82" */
function statusBar(g, C, col, notes) {
  const y = C.sy, s = C.fs.status;
  g.save(); g.fillStyle = g.strokeStyle = col; g.lineWidth = 2; g.lineCap = "round"; g.textBaseline = "middle";
  g.font = font(600, s); g.textAlign = "left"; g.fillText(screen.time, 48, y + 1);
  let x = 48 + g.measureText(screen.time).width + 20;
  (notes || []).forEach((n) => { g.globalAlpha = 0.78; glyph(g, n, x + 10, y, 21, col); g.globalAlpha = 1; x += 30; });
  keepClear(C, 48, x, y - s / 2, y + s / 2, "time");
  let r = C.right;
  g.fillStyle = col; g.textAlign = "right"; g.fillText("82", r, y + 1); r -= g.measureText("82").width + 6;
  const bw = 34, bh = 17;
  rr(g, r - 3, y - 4, 3, 8, 1.5); g.fill(); r -= 4;
  rr(g, r - bw, y - bh / 2, bw, bh, bh / 2); g.stroke(); rr(g, r - bw + 3.5, y - bh / 2 + 3.5, (bw - 7) * 0.82, bh - 7, (bh - 7) / 2); g.fill(); r -= bw + 16;
  for (let i = 3; i >= 0; i--) { const h = 6 + i * 4; g.globalAlpha = i === 3 ? 0.35 : 1; rr(g, r - 4.5, y + 9 - h, 4.5, h, 1.5); g.fill(); r -= 7.5; }
  g.globalAlpha = 1; r -= 3;
  g.font = font(600, 17); g.fillText("5G", r, y + 1); r -= g.measureText("5G").width + 16;
  wifi(g, r - 12, y + 9, s); r -= 26;
  keepClear(C, r, C.right, y - s / 2, y + s / 2, "icons");
  g.restore();
}

/* ---------- cover screen: lock screen ---------- */
function coverTex(T) {
  const C = CV.cover, W = C.W, H = C.H, c = cv(W, H), g = c.getContext("2d"), D = screen.cover, fs = C.fs;
  wall(g, W, H, 1);
  statusBar(g, C, "#eceef0");
  g.fillStyle = "#f7f8f9"; g.font = font(300, 178); g.fillText(screen.time, 36, 250);
  // date, then a weather chip
  g.fillStyle = "rgba(240,242,244,.78)"; g.font = font(400, 30); g.fillText(D.date, 46, 302);
  { const x = 46 + g.measureText(D.date).width + 22; g.font = font(500, 26); const w = g.measureText(D.weather).width + 62;
    g.fillStyle = "rgba(255,255,255,.12)"; rr(g, x, 272, w, 42, 21); g.fill();
    glyph(g, "cloud", x + 24, 293, 26, "rgba(240,242,244,.9)"); g.fillStyle = "rgba(240,242,244,.9)"; g.fillText(D.weather, x + 44, 302); }
  // grouped notifications: one stack, big radius at the top and bottom of the group, small between cards
  const x0 = 30, cw = W - 60, ch = 128, gap = 5, n = D.cards.length, hd = Math.round(H * 0.02);
  D.cards.forEach((r, i) => { const y = 344 + i * (ch + gap);
    g.fillStyle = r.fresh ? "rgba(34,38,46,.70)" : "rgba(24,27,33,.62)"; rr2(g, x0, y, cw, ch, i ? 10 : 32, i === n - 1 ? 32 : 10); g.fill();
    g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1.5; g.stroke();
    tile(g, r.icon, x0 + 60, y + ch / 2, 62, r.col);
    const tx = x0 + 112;
    g.fillStyle = "rgba(235,238,240,.62)"; g.font = font(500, hd); g.fillText(r.app + "  ·  " + r.when, tx, y + 38);
    g.fillStyle = "#f4f5f6"; g.font = font(600, fs.title); g.fillText(fit(g, r.title, cw - 200), tx, y + 74);
    g.fillStyle = "rgba(235,238,240,.82)"; g.font = font(400, fs.body); g.fillText(fit(g, r.text, cw - 200), tx, y + 106);
    if (r.count) { g.font = font(600, hd); const t = String(r.count), w = Math.max(34, g.measureText(t).width + 20);
      g.fillStyle = "rgba(255,255,255,.16)"; rr(g, x0 + cw - 30 - w, y + 54, w, 30, 15); g.fill();
      g.fillStyle = "#f4f5f6"; g.textAlign = "center"; g.fillText(t, x0 + cw - 30 - w / 2, y + 76); g.textAlign = "left"; }
    else if (r.fresh) { g.fillStyle = S.accent; dot(g, x0 + cw - 40, y + 68, 7); }
  });
  // lock-screen shortcuts in the bottom corners, and the home bar
  [["torch", 102], ["camera", W - 102]].forEach(([k, x]) => { g.fillStyle = "rgba(20,22,28,.58)"; dot(g, x, H - 104, 46);
    g.strokeStyle = "rgba(255,255,255,.10)"; g.lineWidth = 1.5; ring(g, x, H - 104, 46); glyph(g, k, x, H - 104, 40, "#eef0f2"); });
  g.fillStyle = "rgba(255,255,255,0.5)"; rr(g, W / 2 - 80, H - 28, 160, 7, 4); g.fill();
  return tex(T, c);
}

/* ---------- inner screen: two apps side by side (or one), floating taskbar ---------- */
function innerTex(T) {
  const C = CV.inner, W = C.W, H = C.H, c = cv(W, H), g = c.getContext("2d"), ac = S.accent, single = props.innerLayout === "single";
  // a still's test card (S.testCard, the crease150 still): one flat grey, so only the crease itself can change what the
  // fold looks like
  if (S.testCard) { g.fillStyle = "#5c5f64"; g.fillRect(0, 0, W, H); crease(g, W / 2, H); return tex(T, c); }
  wall(g, W, H, 0.7);
  statusBar(g, C, "#e6e9ec", ["chat", "mail"]);
  const top = 88, bot = H - 140, mid = W / 2;
  if (single) pane(g, C, { x: 40, y: top, w: W - 80, h: bot - top }, screen.inner.right, ac);
  else {
    pane(g, C, { x: 40, y: top, w: mid - 58, h: bot - top }, screen.inner.left, ac);
    pane(g, C, { x: mid + 18, y: top, w: mid - 58, h: bot - top }, screen.inner.right, ac);
    g.fillStyle = "rgba(255,255,255,.28)"; rr(g, mid - 3, (top + bot) / 2 - 36, 6, 72, 3); g.fill();   // divider handle
  }
  taskbar(g, W / 2, H - 82, ac);
  g.fillStyle = "rgba(255,255,255,.5)"; rr(g, W / 2 - 75, H - 26, 150, 6, 3); g.fill();   // gesture bar
  crease(g, mid, H);
  return tex(T, c);
}
/* the crease down the middle: a faint line about 1 mm wide (the canvas is 9.9 px per mm), as real phones show at flat
   (research §7). It was a 5 mm band darkened 22 % with a bright line in it, which read as a trough at every angle
   (FABLE-REVIEW-2 N4); the fold's shape now comes from the strip itself (hinge.js) */
function crease(g, mid, H) {
  const cr = g.createLinearGradient(mid - 6, 0, mid + 6, 0);
  cr.addColorStop(0, "rgba(0,0,0,0)"); cr.addColorStop(.3, "rgba(0,0,0,.07)"); cr.addColorStop(.5, "rgba(255,255,255,.03)");
  cr.addColorStop(.7, "rgba(0,0,0,.07)"); cr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = cr; g.fillRect(mid - 6, 0, 12, H);
}
// floating pill centred at (cx, cy): pinned apps | divider | recent apps; a dot under each open app
function taskbar(g, cx, cy, ac) {
  const tb = screen.taskbar, s = 54, step = 70, pad = 22, div = 24, n = tb.pinned.length + tb.recent.length;
  const w = pad * 2 + n * s + (n - 1) * (step - s) + div, h = 76, x0 = cx - w / 2;
  g.fillStyle = "rgba(18,22,28,.88)"; rr(g, x0, cy - h / 2, w, h, 30); g.fill();
  g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1.5; g.stroke();
  let x = x0 + pad + s / 2;
  const put = (a) => { tile(g, a[0], x, cy - 3, s, a[1] || ac); if (a[2]) { g.fillStyle = "rgba(255,255,255,.7)"; dot(g, x, cy + 31, 3); } x += step; };
  tb.pinned.forEach(put);
  const dx = x - step + s / 2 + (step - s + div) / 2;
  g.fillStyle = "rgba(255,255,255,.22)"; g.fillRect(dx - 1, cy - 22, 2, 44);
  x += div; tb.recent.forEach(put);
}
// contact pictures: initials on a coloured circle; a contact keeps its list colour in the open chat
const AVATAR = ["#d98a3d", "#5fd39a", "#7f8bff", "#e06c75", "#67c6d4", "#c7a76b"];
const avatarCol = (name) => AVATAR[Math.max(0, screen.inner.left.rows.findIndex((r) => r.name === name)) % AVATAR.length];
function avatar(g, name, x, y, r) {
  g.fillStyle = avatarCol(name); dot(g, x, y, r);
  g.fillStyle = "#0b0d10"; g.font = font(600, Math.round(r * 0.75)); g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(name.split(/[ .]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), x, y + 1);
  g.textAlign = "left"; g.textBaseline = "alphabetic";
}
// app bar: back chevron, title, search and more; a chat shows the contact's picture, name and status, and a call glyph
function appBar(g, C, b, a) {
  const y = b.y + 50, col = "#e6e9ec", chat = a.kind === "chat";
  glyph(g, "back", b.x + 46, y, 30, col);
  if (chat) { avatar(g, a.app, b.x + 108, y, 26);
    g.fillStyle = col; g.font = font(600, C.fs.title); g.fillText(fit(g, a.app, b.w - 320), b.x + 148, y - 3);
    g.fillStyle = "#7fd3a4"; g.font = font(400, C.fs.label); g.fillText(a.status, b.x + 148, y + 24); }
  else { g.fillStyle = col; g.font = font(600, C.fs.title); g.fillText(fit(g, a.app, b.w - 270), b.x + 82, y + C.fs.title * 0.36); }
  glyph(g, chat ? "phone" : "search", b.x + b.w - 110, y, 30, col); glyph(g, "more", b.x + b.w - 50, y, 30, col);
}
// split text into lines no wider than w
function wrap(g, s, w) { const out = []; let cur = "";
  s.split(" ").forEach((word) => { const t = cur ? cur + " " + word : word; if (cur && g.measureText(t).width > w) { out.push(cur); cur = word; } else cur = t; });
  return cur ? out.concat(cur) : out; }
// rounded rectangle with its own radius on each corner: top-left, top-right, bottom-right, bottom-left
function rr4(g, x, y, w, h, [a, b, c, d]) { g.beginPath(); g.moveTo(x + a, y); g.arcTo(x + w, y, x + w, y + h, b); g.arcTo(x + w, y + h, x, y + h, c);
  g.arcTo(x, y + h, x, y, d); g.arcTo(x, y, x + w, y, a); g.closePath(); }
/* a holiday photo, painted: an evening sky over layered mountains and a lake, pine trees on the near shore. Smooth
   sine ridges, no random numbers, so every still shows the same picture. */
function photo(g, x, y, w, h, r) {
  g.save(); rr(g, x, y, w, h, r); g.clip();
  const sky = g.createLinearGradient(0, y, 0, y + h * 0.62);
  sky.addColorStop(0, "#3f6aa3"); sky.addColorStop(0.55, "#a7b6cc"); sky.addColorStop(1, "#f2c48f"); g.fillStyle = sky; g.fillRect(x, y, w, h);
  const sx = x + w * 0.68, sy = y + h * 0.5;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.4); sun.addColorStop(0, "rgba(255,232,180,.95)"); sun.addColorStop(1, "rgba(255,210,150,0)");
  g.fillStyle = sun; g.fillRect(x, y, w, h); g.fillStyle = "#fff6e0"; dot(g, sx, sy, w * 0.03);
  // mountain ridges, far (hazy) to near (dark)
  const ridge = (base, amp, ph, col) => { g.beginPath(); g.moveTo(x, y + h);
    for (let i = 0; i <= 64; i++) { const u = i / 64; g.lineTo(x + w * u, y + h * (base - amp * (0.6 * Math.sin(u * 7.1 + ph) + 0.3 * Math.sin(u * 17.3 + ph * 2) + 0.1 * Math.sin(u * 41 + ph)))); }
    g.lineTo(x + w, y + h); g.closePath(); g.fillStyle = col; g.fill(); };
  ridge(0.5, 0.09, 0.4, "#9aa5bf"); ridge(0.57, 0.12, 2.1, "#6c7b98"); ridge(0.64, 0.08, 4.0, "#3f5168");
  // the lake mirrors the sky, with a glitter path under the sun
  const wy = y + h * 0.68, lake = g.createLinearGradient(0, wy, 0, y + h);
  lake.addColorStop(0, "#d9b48c"); lake.addColorStop(0.35, "#8f97a8"); lake.addColorStop(1, "#33465c"); g.fillStyle = lake; g.fillRect(x, wy, w, h);
  for (let i = 0; i < 9; i++) { const ly = wy + 3 + i * i * h * 0.0045, lw = w * (0.03 + i * 0.012);
    g.fillStyle = "rgba(255,236,196," + (0.75 - i * 0.07) + ")"; g.fillRect(sx - lw / 2, ly, lw, 1.6 + i * 0.25); }
  // near shore and pines, bottom left and bottom right
  g.fillStyle = "#1c2b28"; g.beginPath(); g.moveTo(x, y + h * 0.8); g.quadraticCurveTo(x + w * 0.22, y + h * 0.78, x + w * 0.4, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + w, y + h * 0.84); g.quadraticCurveTo(x + w * 0.86, y + h * 0.86, x + w * 0.78, y + h); g.lineTo(x + w, y + h); g.closePath(); g.fill();
  const pine = (px, py, ph) => { g.beginPath(); g.moveTo(px, py - ph);
    for (let k = 1; k <= 4; k++) { const ty = py - ph + ph * k / 4, tw = ph * (0.1 + 0.07 * k); g.lineTo(px + tw, ty); g.lineTo(px + tw * 0.4, ty); }
    for (let k = 4; k >= 1; k--) { const ty = py - ph + ph * k / 4, tw = ph * (0.1 + 0.07 * k); g.lineTo(px - tw * 0.4, ty); g.lineTo(px - tw, ty); }
    g.closePath(); g.fill(); };
  [[0.04, 0.84, 0.42], [0.11, 0.83, 0.3], [0.17, 0.85, 0.36], [0.25, 0.88, 0.2], [0.93, 0.89, 0.3], [0.86, 0.9, 0.2]].forEach(([u, v, s]) => pine(x + w * u, y + h * v, h * s));
  const vig = g.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, w * 0.75); vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.28)");
  g.fillStyle = vig; g.fillRect(x, y, w, h);
  g.restore();
}
function pane(g, C, b, a, ac) {
  const fs = C.fs;
  g.fillStyle = "rgba(12,15,20,0.94)"; rr(g, b.x, b.y, b.w, b.h, 30); g.fill();
  appBar(g, C, b, a);
  let y = b.y + 108;
  if (a.kind === "list") {
    // filter chips, the first one selected
    let cx = b.x + 28; g.font = font(500, fs.label + 1);
    a.chips.forEach((t, i) => { const w = g.measureText(t).width + 40; rr(g, cx, y, w, 44, 22);
      if (i) { g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1.5; g.stroke(); g.fillStyle = "#aab2ba"; }
      else { g.globalAlpha = 0.3; g.fillStyle = ac; g.fill(); g.globalAlpha = 1; g.fillStyle = "#eef7f8"; }
      g.fillText(t, cx + 20, y + 29); cx += w + 12; });
    y += 70;
    const rh = 110;
    a.rows.forEach((r) => {
      // the open chat is highlighted; unread chats have a bold name, a brighter preview and a dot or a count
      if (r.sel) { g.fillStyle = "rgba(255,255,255,.075)"; rr(g, b.x + 14, y, b.w - 28, rh, 20); g.fill(); }
      avatar(g, r.name, b.x + 70, y + rh / 2, 30);
      g.fillStyle = "#e6e9ec"; g.font = font(r.unread ? 600 : 500, fs.title); g.fillText(fit(g, r.name, b.w - 260), b.x + 118, y + 46);
      let tx = b.x + 118;
      if (r.photo) { glyph(g, "photo", tx + 12, y + 76, 24, "#8f98a1"); tx += 34; }
      g.fillStyle = r.unread ? "#c4cbd2" : "#7d868f"; g.font = font(400, fs.body); g.fillText(fit(g, r.text, b.x + b.w - 92 - tx), tx, y + 84);
      g.fillStyle = r.unread ? ac : "#6d7680"; g.font = font(r.unread ? 600 : 400, fs.label); g.textAlign = "right"; g.fillText(r.time, b.x + b.w - 30, y + 44); g.textAlign = "left";
      if (r.unread > 1) { g.font = font(600, fs.label); const t = String(r.unread), w = Math.max(30, g.measureText(t).width + 18);
        g.fillStyle = ac; rr(g, b.x + b.w - 30 - w, y + 62, w, 30, 15); g.fill();
        g.fillStyle = "#071014"; g.textAlign = "center"; g.fillText(t, b.x + b.w - 30 - w / 2, y + 84); g.textAlign = "left"; }
      else if (r.unread) { g.fillStyle = ac; dot(g, b.x + b.w - 42, y + 77, 8); }
      y += rh + 6; });
    // compose button
    const fx = b.x + b.w - 104, fy = b.y + b.h - 104;
    g.fillStyle = ac; rr(g, fx, fy, 76, 76, 24); g.fill(); glyph(g, "pencil", fx + 38, fy + 38, 34, "#071014");
  } else {
    // an open chat: messages stacked up from the compose bar, cut off under the app bar like a scrolled list
    const ch = 72, cy = b.y + b.h - 22 - ch, sw = ch, fx = b.x + 20, fw = b.w - 40 - sw - 14;
    g.fillStyle = "rgba(255,255,255,.075)"; rr(g, fx, cy, fw, ch, ch / 2); g.fill();
    glyph(g, "plus", fx + 40, cy + ch / 2, 30, "#aab2ba"); glyph(g, "camera", fx + fw - 42, cy + ch / 2, 30, "#aab2ba");
    g.fillStyle = "#737c85"; g.font = font(400, fs.body); g.textBaseline = "middle"; g.fillText(a.draft, fx + 76, cy + ch / 2 + 1); g.textBaseline = "alphabetic";
    g.fillStyle = ac; dot(g, b.x + b.w - 20 - sw / 2, cy + ch / 2, sw / 2); glyph(g, "send", b.x + b.w - 20 - sw / 2 + 2, cy + ch / 2, 32, "#071014");
    g.save(); g.beginPath(); g.rect(b.x, b.y + 100, b.w, cy - 12 - b.y - 100); g.clip();
    const maxW = Math.min(b.w * 0.74, 640), lh = 33, pad = 24, R = 26;
    y = cy - 22;
    g.fillStyle = "#6d7680"; g.font = font(400, fs.label); g.textAlign = "right"; g.fillText(a.seen, b.x + b.w - 30, y); g.textAlign = "left";
    y -= fs.label + 14;
    for (let i = a.msgs.length - 1; i >= 0; i--) {
      const [who, s] = a.msgs[i], out = who === "out", prev = a.msgs[i - 1], first = !prev || prev[0] !== who;
      // the corners on the sender's side are tight, except the top one of the first message in a run
      const rad = out ? [R, first ? R : 8, 8, R] : [first ? R : 8, R, R, 8];
      if (s === "photo") { const pw = Math.round(Math.min(b.w * 0.62, 560)), ph = Math.round(pw * 0.68), px = out ? b.x + b.w - 24 - pw : b.x + 24;
        y -= ph; photo(g, px, y, pw, ph, R); }
      else { g.font = font(400, fs.body); const L = wrap(g, s, maxW - 2 * pad), bw = Math.max(...L.map((t) => g.measureText(t).width)) + 2 * pad, bh = 24 + L.length * lh;
        const bx = out ? b.x + b.w - 24 - bw : b.x + 24; y -= bh;
        g.fillStyle = out ? ac : "#1f262e"; rr4(g, bx, y, bw, bh, rad); g.fill();
        g.fillStyle = out ? "#071014" : "#d3d9de"; g.textBaseline = "middle"; L.forEach((t, k) => g.fillText(t, bx + pad, y + 12 + lh * (k + 0.5) + 1)); g.textBaseline = "alphabetic"; }
      y -= first ? 18 : 6;
    }
    // the day the chat starts on
    g.font = font(500, fs.label); const dw = g.measureText(a.day).width + 36; y -= 44;
    g.fillStyle = "rgba(255,255,255,.07)"; rr(g, b.x + b.w / 2 - dw / 2, y, dw, 36, 18); g.fill();
    g.fillStyle = "#9aa3ab"; g.textAlign = "center"; g.fillText(a.day, b.x + b.w / 2, y + 25); g.textAlign = "left";
    g.restore();
  }
}

/* ---------- screen materials ---------- */
export let coverMat = null, dispMat = null;
let screenEnv = null;
// env: the studio environment texture. Screens get their own envMap, because envMapIntensity only scales a
// material's own envMap since three.js r163 (BUILD-SPEC 4.2).
export function createScreens(T, env) {
  const scr = () => { const m = new T.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0xffffff, envMap: env, envMapIntensity: 0.22 }); m.toneMapped = false; return m; };
  screenEnv = env; coverMat = S.coverMat = scr(); dispMat = S.dispMat = scr();
  S.coverMat.emissiveMap = S.baseCover = coverTex(T); S.dispMat.emissiveMap = S.baseInner = innerTex(T);
}

/* ---------- camera holes ----------
   Real holes are cut in the panel, so they are meshes on top of the screen, not paint: the Duo effect zooms and
   slides the screen picture, and the holes must stay put. Inner: top-right corner of the right half, as on the
   Xiaomi 18 Fold (R3 §2). Cover: centred at the top of the cover screen. */
export function addScreenDetails(ctx) {
  const T = ctx.T, { OZ } = GEO;
  const lift = (m, units) => { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = units; return m; };
  // the hole is black under the same glass as the screen round it, so it gets the screen's reflection (4.2), not a
  // stronger one that would turn it grey
  const discM = lift(new T.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMap: screenEnv, envMapIntensity: 0.22 }), -4);
  const lensM = lift(mat("lens").clone(), -8);
  const ringM = lift(new T.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.4 }), -4);
  Object.keys(HOLES).forEach((k) => { const h = HOLES[k], G = ctx.G[h.leaf];
    // inner: on the panel, facing the viewer (+z), just above the display (z 0.125);
    // cover: on the deck (x mirrored), facing out (−z), just outside the cover screen mesh (z OZ − 1.47)
    const out = k === "inner" ? 1 : -1, x = k === "inner" ? h.x : -h.x, z = k === "inner" ? 0.128 : OZ - 1.47 - 0.003;
    [[new T.CircleGeometry(h.r, 48), discM, 0], [new T.RingGeometry(h.r, h.ring, 48), ringM, 0], [new T.CircleGeometry(h.lens, 32), lensM, 0.002]].forEach(([geo, m, dz]) => {
      const o = ctx.mk(geo, m, G, false); o.position.set(x, h.y, z + out * dz); if (out < 0) o.rotation.y = Math.PI;
      o.userData.selfie = k; o.userData.part = window.FC_PARTS.parts.find((p) => p.id === (k === "inner" ? "cam-udc" : "cam-cover")); tag(o, h.layer, h.ex); });
  });
  invalidate();
}

export function repaintScreens() { if (!S.coverMat) return;
  dropBlur();
  [[S.coverMat, () => coverTex(THREE), "baseCover"], [S.dispMat, () => innerTex(THREE), "baseInner"]].forEach(([m, f, k]) => { if (S[k]) S[k].dispose(); S[k] = m.emissiveMap = f(); m.needsUpdate = true; });
  invalidate();
}

/* ---------- iPhone Duo-style screen hand-over ----------
   Apple's iPhone Duo ties its unfold animation to the hinge angle: the picture blurs, stretches and comes into
   focus on the inner screen as the phone opens, instead of cutting from one screen to the other. Here the inner
   screen starts dim, blurred and slightly zoomed and sharpens as the hinge nears 180°; the cover screen blurs out.
   The blurred copies are drawn at Q.duoScale (½ or ¼) size without mipmaps: a blurred picture loses nothing at lower
   resolution (BUILD-SPEC 4.3). */
function blurSet(T, base) {
  const src = base.image, k = Q.duoScale || 0.5, w = Math.round(src.width * k), h = Math.round(src.height * k);
  return BLUR.map((px) => { if (!px) return base; const c = cv(w, h), g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.filter = "blur(" + px * k + "px)"; g.drawImage(src, 0, 0, w, h);
    const t = tex(T, c); t.generateMipmaps = false; t.minFilter = T.LinearFilter; return t; });
}
function makeBlur() { if (S.baseInner && !S.fxInner) { S.fxInner = blurSet(THREE, S.baseInner); S.fxCover = blurSet(THREE, S.baseCover); } }
function dropBlur() { ["fxCover", "fxInner"].forEach((k) => { (S[k] || []).forEach((t, i) => { if (i) t.dispose(); }); S[k] = null; }); S.duoKey = null; }
function setScr(mat, t, k, z, slide) { mat.emissiveMap = t; mat.emissiveIntensity = k; const r = 1 / z; t.repeat.set(r, r); t.offset.set((1 - r) / 2 + slide, (1 - r) / 2); }
// per-frame update; returns true while the effect is still moving
export function updateDuo(dt) {
  if (!S.coverMat) return false;
  // Normally the effect runs while the hinge moves (160 ms after each move). A still (?shot=1) can't catch a move,
  // so with the Duo option on it holds the effect at full strength: the picture shows the screens as they look
  // while the hinge passes through the still's angle (e.g. ?view=open&duo=1&ang=120).
  const hold = props.duo && !!params.shot;
  const tgt = props.duo && (hold || performance.now() - S.lastMove < 160) ? 1 : 0;
  if (hold) S.duoM = 1;
  else { S.duoM += (tgt - S.duoM) * (1 - Math.exp(-dt * (tgt > S.duoM ? 25 : 4))); if (S.duoM < 0.003) S.duoM = 0; }
  const m = S.duoM, p = S.ang / 180;
  if (!m) { if (S.fxOn) { setScr(S.dispMat, S.baseInner, 1, 1, 0); setScr(S.coverMat, S.baseCover, 1, 1, 0); S.fxOn = false; S.duoKey = null; invalidate(); } return tgt > 0; }
  makeBlur();
  if (hold && S.fxOn && S.duoKey === p) return false;   // held and already drawn at this angle
  S.fxOn = true; S.duoKey = hold ? p : null; const N = BLUR.length - 1;
  const ib = m * (1 - sm(0.4, 1, p)), cb = m * sm(0, 0.55, p);
  setScr(S.dispMat, S.fxInner[Math.round(ib * N)], 1 - m * (1 - sm(0, 0.5, p)), 1 + 0.12 * m * Math.pow(1 - p, 1.5), 0.05 * m * (1 - p));
  setScr(S.coverMat, S.fxCover[Math.round(cb * N)], 1 - m * sm(0.1, 0.6, p), 1 + 0.06 * m * p, 0);
  return true;
}

/* ---------- wire up the controls ---------- */
$("t-duo").addEventListener("change", (e) => { props.duo = e.target.checked; if (props.duo) makeBlur(); invalidate(); });
$("t-single").addEventListener("change", (e) => { props.innerLayout = e.target.checked ? "single" : "split"; repaintScreens(); });
// an accent change repaints the screens only (nothing else uses the accent)
document.querySelectorAll("[data-accent]").forEach((b) => b.addEventListener("click", () => {
  props.accent = S.accent = b.dataset.accent; repaintScreens();
  document.querySelectorAll("[data-accent]").forEach((x) => x.setAttribute("aria-pressed", x === b));
}));
