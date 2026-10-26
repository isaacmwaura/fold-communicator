/* Fold Communicator — internal parts. Geometry and words come from parts.js (window.FC_PARTS). Owner after B0: B2.
   Built to BUILD-SPEC 6.5, with the looks from RC (research/RC-visual.md) and the keyboard stack from R3 §5.
   Each parts.js entry becomes one host mesh (one material, so the part card can highlight it) in its half's group, at
   z = p.z[0]. Its small details (tapes, connectors, brackets, screws, lenses, domes...) are child meshes, so they move
   with it; mark() copies the part to every child, so clicking any piece opens the card. Child geometry is written in
   the half's own coords (front coords with x mirrored on the deck) and the child sits at z = −p.z[0].
   Part map sets (pouch, board, can, chip, foil) use 0..1 UVs laid out as the part is seen from the back, so printing
   reads correctly from behind; tiled detail maps (brushed, dots, grain, flex traces) keep the extrusion's mm UVs.
   Draw calls at High: about 85 (passives are two instanced meshes, domes one). */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { S, Q, props, invalidate } from "./state.js";
import { $, cv, tex, ext, curveSegs, polyHole, flatUV, mark, rng } from "./util.js";
import { mat, matWith, pcbMaps, canMaps, pouchMaps } from "./materials.js";
import { tag, SEEN_OUTSIDE } from "./teardown.js";

/* ---------- small helpers ---------- */
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (gs) => mergeGeometries(gs.map((g) => { g = ni(g); if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }), false);
const grey = (v) => "rgb(" + v + "," + v + "," + v + ")";
const ORM = (ao, rough, metal) => "rgb(" + Math.round(ao * 255) + "," + Math.round(rough * 255) + "," + Math.round(metal * 255) + ")";

// polygon with rounded corners: pts [[x, y]], rad[i] = corner radius at pts[i] (clamped to half of each edge)
function roundPoly(P, pts, rad) {
  const n = pts.length, at = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.max(0.001, Math.min(rad[i], l1 / 2, l2 / 2));
    const p = [b[0] + (a[0] - b[0]) * r / l1, b[1] + (a[1] - b[1]) * r / l1], q = [b[0] + (c[0] - b[0]) * r / l2, b[1] + (c[1] - b[1]) * r / l2];
    if (i === 0) P.moveTo(p[0], p[1]); else P.lineTo(p[0], p[1]);
    P.quadraticCurveTo(b[0], b[1], q[0], q[1]);
  }
  P.closePath(); return P;
}
// a part's plan outline in front coords, with its notch (side cut-out, or corner cut-out when it reaches y[0] or y[1])
function plan(p) {
  const [x0, x1] = p.x, [y0, y1] = p.y, n = p.notch;
  if (!n) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (n.y[0] <= y0 + 1e-6) return [[x0, y0], [n.x[0], y0], [n.x[0], n.y[1]], [x1, n.y[1]], [x1, y1], [x0, y1]];
  if (n.y[1] >= y1 - 1e-6) return [[x0, y0], [x1, y0], [x1, n.y[0]], [n.x[0], n.y[0]], [n.x[0], y1], [x0, y1]];
  return [[x0, y0], [x1, y0], [x1, n.y[0]], [n.x[0], n.y[0]], [n.x[0], n.y[1]], [x1, n.y[1]], [x1, y1], [x0, y1]];
}
// rounded rectangle path in the half's coords (s mirrors x)
const rectPath = (P, s, x, y, r, rh) => roundPoly(P, [[s * x[0], y[0]], [s * x[1], y[0]], [s * x[1], y[1]], [s * x[0], y[1]]],
  [rh === undefined ? r : rh, r, r, rh === undefined ? r : rh]);
// the part's outline (with holes) as a Shape in the half's coords
function outline(T, p, s) {
  const pts = plan(p), r = p.r || 0.01, rad = pts.map((q) => (q[0] === p.x[0] && p.rh !== undefined ? p.rh : r));
  const sh = roundPoly(new T.Shape(), pts.map((q) => [s * q[0], q[1]]), rad);
  // holes (screw holes, the light guide's key holes) at their own corner steps, so they cost 8 even in a big outline
  (p.holes || []).forEach((h) => sh.holes.push(polyHole(T, rectPath(new T.Path(), s, h.x, h.y, h.r || 0.01), curveSegs(h.r))));
  return sh;
}
// the part's outline extruded through its depth (z 0..d, mm UVs); corner steps from its corner radius (util.curveSegs:
// the key holes, screw holes and small corners get 8, the big mid-frame and screen corners keep 28)
const slab = (T, p, s, bev, segs) => ext(T, outline(T, p, s), p.z[1] - p.z[0], Math.min(bev, (p.z[1] - p.z[0]) / 4), segs || 2, curveSegs(Math.max(p.r || 0, p.rh || 0)));

// 0..1 UVs over the part's plan as seen from the back (x runs from the free edge... whichever side is the viewer's
// left from behind). o.readFront: the front cap reads correctly from the front instead. o.y0 / o.h: a sub-band in y.
function planUV(geo, p, s, o) {
  o = o || {};
  const ps = geo.attributes.position, nm = geo.attributes.normal, uv = geo.attributes.uv;
  const xa = Math.min(s * p.x[0], s * p.x[1]), xb = Math.max(s * p.x[0], s * p.x[1]), w = xb - xa;
  const y0 = o.y0 === undefined ? p.y[0] : o.y0, h = o.h || (p.y[1] - p.y[0]);
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i), front = o.readFront && nm.getZ(i) > 0.5;
    uv.setXY(i, front ? (x - xa) / w : (xb - x) / w, (ps.getY(i) - y0) / h);
  }
  uv.needsUpdate = true; return geo;
}
// front coords → the same picture coords (mm, lower-left origin) that planUV uses
const picX = (p, s) => { const xb = Math.max(s * p.x[0], s * p.x[1]); return (xf) => xb - s * xf; };
const picRect = (p, s, x, y) => { const f = picX(p, s), a = f(x[0]), b = f(x[1]); return { x: Math.min(a, b), y: y[0] - p.y[0], w: Math.abs(b - a), h: y[1] - y[0] }; };

/* geometry in the half's coords: front-coord x (mirrored by s), absolute z */
function G(T, s) {
  return {
    box: (x0, x1, y0, y1, z0, z1) => new T.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate(s * (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    rbox: (x, y, z, r, bev) => ext(T, rectPath(new T.Shape(), s, x, y, r), z[1] - z[0], Math.min(bev, (z[1] - z[0]) / 4), 2, curveSegs(r)).translate(0, 0, z[0]),
    cyl: (x, y, r, z0, z1, seg) => new T.CylinderGeometry(r, r, z1 - z0, seg || 32).rotateX(Math.PI / 2).translate(s * x, y, (z0 + z1) / 2),
    disc: (x, y, r, z, out, seg) => { const g = new T.CircleGeometry(r, seg || 32); if (out < 0) g.rotateY(Math.PI); return g.translate(s * x, y, z); },
    ring: (x, y, r0, r1, z, out) => { const g = new T.RingGeometry(r0, r1, 32); if (out < 0) g.rotateY(Math.PI); return g.translate(s * x, y, z); }
  };
}
// a child mesh of a host part, in the half's coords. small: a detail on the part's surface, not drawn into the floor's
// contact shadow (the part under it is, see scene.js). kind: what the piece is, which sets its detail level
// (FC_PARTS.detail.pieces: 2 = drawn only in the High detail exploded view, not the Simple one; teardown.js)
const detailOf = (kind) => ((window.FC_PARTS.detail || {}).pieces || {})[kind] || 1;
function kid(host, p, geo, m, kind) { const o = new THREE.Mesh(geo, m); o.position.z = -p.z[0]; o.castShadow = false; o.userData.small = true;
  o.userData.detail = detailOf(kind); host.add(o); return o; }
function canvasTex(T, c, color) { return tex(T, c, { color: color !== false }); }
const lift = (m, f, u) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });

/* ---------- pictures drawn here (seeded where random) ---------- */
// laser marking on a chip package: part number, a lot line and the pin-1 dot (no maker marks)
function chipTex(T, p, lines, seed) {
  const w = p.x[1] - p.x[0], h = p.y[1] - p.y[0], ppm = Math.max(8, Q.tex.can / 16), c = cv(Math.round(w * ppm), Math.round(h * ppm)), g = c.getContext("2d"), rnd = rng(seed);
  g.fillStyle = "#101113"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 400; i++) { g.fillStyle = "rgba(255,255,255," + (rnd() * 0.035).toFixed(3) + ")"; g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2); }
  g.fillStyle = "rgba(160,166,174,0.6)"; g.textBaseline = "top";
  const fs = Math.min(h * ppm * 0.16, w * ppm / 7); g.font = "600 " + fs.toFixed(1) + "px monospace";
  lines.forEach((t, i) => g.fillText(t, 1.2 * ppm, (h * ppm) * 0.3 + i * fs * 1.35));
  g.beginPath(); g.arc(1.0 * ppm, 1.0 * ppm, 0.35 * ppm, 0, 7); g.fill();
  return canvasTex(T, c);
}
// one colour picture and one ORM picture, drawn by fn(colourCtx, ormCtx, W, H, ppm) in the colour picture's pixels;
// ormScale < 1 draws the ORM picture smaller (it only carries roughness and metalness, which tolerate it)
function pair(T, wMm, hMm, size, fn, ormScale) {
  const ppm = size / Math.max(wMm, hMm), W = Math.max(8, Math.round(wMm * ppm)), H = Math.max(8, Math.round(hMm * ppm)), k = ormScale || 1;
  const c = cv(W, H), o = cv(Math.round(W * k), Math.round(H * k)), oc = o.getContext("2d"); oc.scale(k, k);
  fn(c.getContext("2d"), oc, W, H, ppm);
  const set = { map: canvasTex(T, c), orm: canvasTex(T, o, false) }; set.orm.channel = 0; return set;
}

/* ---------- part builders: each returns the host mesh ---------- */
// pouch cell (RC §1): foil pouch with a printed label on both faces, PCM strip under black tape at the tab end, two
// blue stretch-release pull tabs at the other end (flat on the back face, folded over the end edge), wrinkled edges
// pouchMaps (B1) leaves room for five spec lines above its icon row, so the label has the brand line plus five
function cellLabel(p) {
  return { brand: "Li-ion Polymer Battery", lines: [
    "Model " + (p.id === "battery-p" ? "FC-BA1" : "FC-BB1") + "   Lot " + (p.id === "battery-p" ? "2641A07" : "2641B12"),
    "3.89 V ⎓ " + p.mAh.toLocaleString("en-GB") + " mAh / " + (p.mAh * window.FC_PARTS.cell.volts / 1000).toFixed(2) + " Wh",
    "Limited charge voltage 4.48 V",
    "Rechargeable Li-ion polymer cell",
    "Do not puncture or burn"] };
}
function cellMaps(p) {
  const band = p.notch ? { y0: p.notch.y[1], h: p.y[1] - p.notch.y[1] } : { y0: p.y[0], h: p.y[1] - p.y[0] };
  return { band, set: pouchMaps({ wMm: p.x[1] - p.x[0], hMm: band.h, label: cellLabel(p), seed: p.id === "battery-p" ? 51 : 57 }) };
}
function buildCell(T, p, s, par, ctx) {
  const d = p.z[1] - p.z[0], { band, set } = cellMaps(p);
  // a notched cell carries its label on the full-width block; the strip beside the notch shows the foil edge
  const geo = planUV(slab(T, p, s, 0.3, 3), p, s, { readFront: true, y0: band.y0, h: band.h });
  const host = ctx.mk(geo, matWith("tapeBlack", set, { bumpScale: 0.8, normalScale: 0.8 }), par, true);
  host.userData.cellBand = band;
  const g = G(T, s), z0 = p.z[0], top = p.tabEnd === "top", yT = top ? p.y[1] : p.y[0], yF = top ? p.y[0] : p.y[1], dir = top ? -1 : 1;
  // protection board under black tape: 4 deep at the tab end, a little proud of the back face
  const pcm = g.rbox([p.x[0] + 6.5, p.x[1] - 2], top ? [yT - 4, yT] : [yT, yT + 4], [z0 - 0.15, z0 + 0.02], 0.4, 0.05);
  kid(host, p, pcm, mat("tapeBlack"), "pcm");
  // pull tabs: 9 wide, 0.05 thick, 9 in from the far end on the back face, folded over the top 1.5 of the end face
  const tabs = [];
  (p.tabs || []).forEach((cx) => {
    tabs.push(g.box(cx - 4.5, cx + 4.5, Math.min(yF, yF - dir * 9), Math.max(yF, yF - dir * 9), z0 - 0.05, z0));
    tabs.push(g.box(cx - 4.5, cx + 4.5, Math.min(yF, yF + dir * 0.05), Math.max(yF, yF + dir * 0.05), z0 - 0.05, z0 + 1.5));
  });
  if (tabs.length) kid(host, p, merge(tabs), mat("tapeBlue"), "pullTab");
  void d; return host;
}

// circuit boards: solder mask with traces (pcbMaps), plated edge (the map's edge line lands on the side faces), gold
// rings round the screw holes, passives on board-up's outer face, press-fit connectors under steel brackets
const SCREWS = { "board-up": [[9.7, 22.0], [30.5, 10.2], [39.5, 21.6], [24.0, 35.5]], "board-lo": [[9.7, 22.0], [30.5, 10.2], [39.5, 21.6], [24.0, 35.5]],
  subboard: [[21.2, -46.2], [21.2, -58.0], [32.0, -51.0]] };
// bracket screw ears per flex end on a board (front coords, ear centres), placed clear of the parts round them
const EARS = {
  "fx-oled-p": [[9.3, 10.9], [16.7, 10.9]], "fx-batt-p": [[20.3, 10.4], [27.7, 10.4]], "fx-spk-bot": [[33.3, 10.4], [40.7, 10.4]],
  "fx-hinge-b": [[13.0, 14.3], [13.0, 18.7]], "fx-hinge-a": [[13.0, 24.3], [13.0, 28.7]], "fx-cam-uw": [[43.4, 20.8], [43.4, 25.2]],
  "fx-cam-tele": [[35.8, 24.5], [37.3, 22.4]], "fx-cam-main": [[43.4, 41.1], [43.4, 45.5]], "fx-udc": [[43.4, 47.6], [43.4, 52.0]],
  "fx-hinge-b@subboard": [[23.7, -46.5], [31.1, -46.5]], "fx-batt-d": [[33.8, -46.5], [41.2, -46.5]], "fx-haptic": [[28.0, -49.3], [28.0, -53.7]],
  "fx-kbd": [[25.9, -57.7], [31.4, -55.6]], "fx-cover": [[42.4, -48.6], [42.4, -51.4]], "fx-spk-top": [[42.4, -53.4], [44.6, -59.0]] };
const CONN = { len: 6, depth: 2.8, h: 0.7, br: 0.2 };
// connector footprints (front coords, z range) for every flex end on this board
function connectors(p) {
  const out = [];
  (window.FC_PARTS.flexes || []).forEach((f) => [f.from, f.to].forEach((e) => {
    if (e.part !== p.id) return;
    const n = e.n, w = e.w, a = e.at, back = a[2] < (p.z[0] + p.z[1]) / 2;
    const zf = back ? p.z[0] : p.z[1], z = back ? [zf - CONN.h, zf] : [zf, zf + CONN.h];
    const c = [a[0] - n[0] * CONN.depth / 2, a[1] - n[1] * CONN.depth / 2];   // the body lies behind the cable's end
    const hx = Math.abs(w[0]) * CONN.len / 2 + Math.abs(n[0]) * CONN.depth / 2, hy = Math.abs(w[1]) * CONN.len / 2 + Math.abs(n[1]) * CONN.depth / 2;
    out.push({ id: f.id, x: [c[0] - hx, c[0] + hx], y: [c[1] - hy, c[1] + hy], z, back, w, ears: EARS[f.id + "@" + p.id] || EARS[f.id] || [] });
  }));
  return out;
}
function addConnectors(T, host, p, s) {
  const g = G(T, s), body = [], steel = [], heads = [];
  connectors(p).forEach((c) => {
    const o = c.back ? -1 : 1, zTop = c.back ? c.z[0] : c.z[1];   // o: the direction away from the board
    body.push(g.box(c.x[0], c.x[1], c.y[0], c.y[1], c.z[0], c.z[1]));
    // silver strip along the connector's top, showing past the bracket's ends
    const ins = (u) => [u[0] + 0.25, u[1] - 0.25], sx = Math.abs(c.w[0]) > 0.5 ? ins(c.x) : [(c.x[0] + c.x[1]) / 2 - 0.3, (c.x[0] + c.x[1]) / 2 + 0.3];
    const sy = Math.abs(c.w[1]) > 0.5 ? ins(c.y) : [(c.y[0] + c.y[1]) / 2 - 0.3, (c.y[0] + c.y[1]) / 2 + 0.3];
    steel.push(g.box(sx[0], sx[1], sy[0], sy[1], zTop, zTop + o * 0.03));
    // bracket: a 0.2 plate over the middle of the connector (its ends stay visible) plus two screw ears on standoffs
    const bx = Math.abs(c.w[0]) > 0.5 ? [c.x[0] + 0.8, c.x[1] - 0.8] : [c.x[0] - 0.1, c.x[1] + 0.1];
    const by = Math.abs(c.w[1]) > 0.5 ? [c.y[0] + 0.8, c.y[1] - 0.8] : [c.y[0] - 0.1, c.y[1] + 0.1];
    const zb = [zTop + o * 0.03, zTop + o * (0.03 + CONN.br)].sort((a, b) => a - b);
    steel.push(g.box(bx[0], bx[1], by[0], by[1], zb[0], zb[1]));
    c.ears.forEach(([ex, ey]) => {
      steel.push(g.box(ex - 0.7, ex + 0.7, ey - 0.7, ey + 0.7, zb[0], zb[1]));
      const zs = c.back ? [zb[1], c.z[1]] : [c.z[0], zb[0]];
      steel.push(g.cyl(ex, ey, 0.45, zs[0], zs[1], 12));
      const zh = c.back ? [zb[0] - 0.2, zb[0]] : [zb[1], zb[1] + 0.2];   // under the vapour chamber: 0.07 clear
      heads.push(g.cyl(ex, ey, 0.5, zh[0], zh[1], 16));
    });
  });
  if (!body.length) return [];
  kid(host, p, merge(body), mat("btb"), "connector");
  kid(host, p, merge(steel), mat("steelBracket"), "connector");
  if (heads.length) kid(host, p, merge(heads), mat("screw"), "connector");
  return connectors(p);
}
const boardSets = {};
function buildBoard(T, p, s, par, ctx) {
  const D = window.FC_PARTS, conns = connectors(p), keep = [];
  // keep-outs: everything mounted on this board's outer face, plus the connectors and their brackets
  const onBoard = { "board-up": ["soc", "ufs", "pmic", "rf", "wifi", "can-x"], subboard: ["usb"] }[p.id] || [];
  onBoard.forEach((id) => { const q = D.parts.find((x) => x.id === id); keep.push(picRect(p, s, q.x, q.y)); });
  conns.forEach((c) => keep.push(picRect(p, s, [c.x[0] - 0.1, c.x[1] + 0.1], [c.y[0] - 0.1, c.y[1] + 0.1])));
  const shared = p.id === "board-lo" || p.id === "interposer", key = shared ? "lo" : p.id;
  if (!boardSets[key]) {
    const f = picX(p, s);
    boardSets[key] = pcbMaps({ wMm: p.x[1] - p.x[0], hMm: p.y[1] - p.y[0], outline: plan(p).map((q) => [f(q[0]), q[1] - p.y[0]]),
      keepOut: shared ? [] : keep, seed: { lo: 33, "board-up": 31, subboard: 35 }[key], set: p.id === "board-up" ? "boardUp" : "boardLo" });
  }
  const screws = p.id === "interposer" ? [] : (SCREWS[p.id] || []);
  const q = Object.assign({}, p, { holes: (p.holes || []).concat(screws.map(([x, y]) => ({ x: [x - 0.6, x + 0.6], y: [y - 0.6, y + 0.6], r: 0.6 }))) });
  const host = ctx.mk(planUV(slab(T, q, s, 0.08, 2), p, s), matWith("pcb", boardSets[key], { bumpScale: 0.6 }), par, true);
  const g = G(T, s);
  if (screws.length) kid(host, p, merge(screws.flatMap(([x, y]) => [g.ring(x, y, 0.6, 1.0, p.z[0] - 0.004, -1), g.ring(x, y, 0.6, 1.0, p.z[1] + 0.004, 1)])), mat("pcbGold"), "screwRing");
  addConnectors(T, host, p, s);
  if (p.id === "board-up" && Q.passives) addPassives(T, host, p, s, keep, screws);
  return host;
}
// about 120 beige capacitors and 60 black resistors on board-up's outer face, seeded, clear of keep-outs and screws
function addPassives(T, host, p, s, keep, screws) {
  const rnd = rng(77), f = picX(p, s), xb = Math.max(s * p.x[0], s * p.x[1]);
  const inside = (x, y) => { // inside the outline (front coords), not in the notch
    if (x < p.x[0] + 0.8 || x > p.x[1] - 0.8 || y < p.y[0] + 0.8 || y > p.y[1] - 0.8) return false;
    const n = p.notch; return !(n && x > n.x[0] - 0.8 && y > n.y[0] - 0.8 && y < n.y[1] + 0.8); };
  const clear = (x, y, m) => { const px = f(x), py = y - p.y[0];
    return !keep.some((k) => px > k.x - m && px < k.x + k.w + m && py > k.y - m && py < k.y + k.h + m) &&
      !screws.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 1.4) && Math.hypot(x - 27.75, y - 30.5) > 2.0; };
  const place = (n, w, h, t, color, seedTries) => {
    const geo = new T.BoxGeometry(w, h, t), m = mat("chip").clone(); m.color.setHex(color); m.roughness = color === 0xc9b48a ? 0.5 : 0.6;
    const im = new T.InstancedMesh(geo, m, n), M4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), ax = new T.Vector3(0, 0, 1);
    let k = 0;
    for (let i = 0; i < seedTries && k < n; i++) {
      // cluster round the keep-outs (decoupling parts sit next to the chips they serve), plus some anywhere
      let x, y; const kk = keep[Math.floor(rnd() * keep.length)];
      if (rnd() < 0.7 && kk) { const px = kk.x - 1.2 + rnd() * (kk.w + 2.4), py = kk.y - 1.2 + rnd() * (kk.h + 2.4); x = s * (xb - px); y = py + p.y[0]; }
      else { x = p.x[0] + rnd() * (p.x[1] - p.x[0]); y = p.y[0] + rnd() * (p.y[1] - p.y[0]); }
      if (!inside(x, y) || !clear(x, y, 0.35)) continue;
      q.setFromAxisAngle(ax, rnd() < 0.5 ? 0 : Math.PI / 2);
      M4.compose(new T.Vector3(s * x, y, p.z[0] - t / 2 - p.z[0]), q, sc); im.setMatrixAt(k++, M4);
    }
    im.count = k; im.castShadow = false; im.userData.small = true; im.userData.detail = detailOf("passives"); host.add(im); return im;
  };
  place(120, 1.0, 0.5, 0.35, 0xc9b48a, 4000);
  place(60, 0.6, 0.3, 0.3, 0x1b1c1e, 3000);
}

// package markings: type, speed and a date/lot code only, never a capacity (the 12 + 256 and 16 + 512 tiers use
// different memory and storage chips, so one model must not claim either)
function buildChip(T, p, s, par, ctx) {
  const txt = { soc: ["SM8975", "2641 Q7A"], ram: ["LPDDR6", "5300 2641"], ufs: ["UFS 5.0", "2641 K7"], pmic: ["PM", "8975"] }[p.id];
  const m = txt ? mat("chip").clone() : mat("chip");
  if (txt) { m.map = chipTex(T, p, txt, p.id.length * 7); m.color.setHex(0xffffff); }
  return ctx.mk(planUV(slab(T, p, s, 0.05, 2), p, s), m, par, true);
}

// shield can: lid with a 0.15 bevel standing on a skirt 0.2 wider (the step ring), stamped lid map (canMaps)
function buildCan(T, p, s, par, ctx) {
  const code = { rf: "RF 5G-214", wifi: "WCN 88", "can-x": "S340", mmwave: "QTM565" }[p.id];
  const lid = slab(T, p, s, 0.15, 3), skirt = ext(T, rectPath(new T.Shape(), s, [p.x[0] - 0.2, p.x[1] + 0.2], [p.y[0] - 0.2, p.y[1] + 0.2], (p.r || 0.3) + 0.2), 0.25, 0.04, 1, curveSegs((p.r || 0.3) + 0.2));
  const back = p.z[0] < -2;   // cans on a board's outer face stand on it at their inner side
  if (back) skirt.translate(0, 0, p.z[1] - p.z[0] - 0.25);
  const geo = planUV(merge([lid, skirt]), p, s);
  return ctx.mk(geo, matWith("shieldCan", canMaps({ wMm: p.x[1] - p.x[0], hMm: p.y[1] - p.y[0], code, seed: 41 + p.id.length }), { bumpScale: 0.5 }), par, true);
}

function buildPlain(name, bev) { return (T, p, s, par, ctx) => ctx.mk(slab(T, p, s, bev === undefined ? 0.05 : bev, 2), mat(name), par, p.z[1] - p.z[0] > 0.4); }

// graphite sheet with two blue tape pads and a white label + QR sticker on its back face
function buildGraphite(T, p, s, par, ctx) {
  const host = ctx.mk(slab(T, p, s, 0.03, 1), mat("graphite"), par, false), g = G(T, s), z0 = p.z[0];
  const pads = p.leaf === "panel" ? [[61, 71, -45, -25], [12, 22, -50, -30]] : [[60, 70, 10, 30], [14, 24, 20, 40]];
  kid(host, p, merge(pads.map((a) => g.box(a[0], a[1], a[2], a[3], z0 - 0.03, z0))), mat("tapeBlue"), "tapePad");
  const c = cv(256, 96), x = c.getContext("2d"), rnd = rng(p.leaf === "panel" ? 61 : 62);
  x.fillStyle = "#f1f1ee"; x.fillRect(0, 0, 150, 96); x.fillRect(166, 6, 84, 84);
  x.fillStyle = "#1a1b1d"; x.font = "700 40px sans-serif"; x.textBaseline = "middle"; x.fillText(p.leaf === "panel" ? "MAIN" : "SUB", 14, 36);
  x.font = "500 15px monospace"; x.fillText("GR-" + (4100 + Math.floor(rnd() * 800)) + " 0.1", 14, 72);
  for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) if (rnd() < 0.5 || (i < 7 && j < 7) || (i > 13 && j < 7) || (i < 7 && j > 13)) x.fillRect(170 + i * 3.6, 10 + j * 3.6, 3.6, 3.6);
  const sm = mat("tapeBlack").clone(); sm.map = canvasTex(T, c); sm.color.setHex(0xffffff); sm.roughness = 0.55;
  const at = p.leaf === "panel" ? [40, -4] : [44, 44], sticker = (u0, u1, w, h, dx) => {
    const geo = new T.PlaneGeometry(w, h).rotateY(Math.PI); const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) ? u1 : u0);
    return geo.translate(s * (at[0] + dx), at[1], z0 - 0.035); };
  kid(host, p, merge([sticker(0, 150 / 256, 15, 9.6, 0), sticker(166 / 256, 250 / 256, 8.4, 8.4, s > 0 ? -13 : 13)]), sm, "sticker");
  return host;
}

// wireless coil: 0.22 ferrite disc with a 14-turn copper spiral, the NFC loop round its rim, and a flex tail
function buildCoil(T, p, s, par, ctx) {
  const d = p.z[1] - p.z[0], R = p.rad, Z = Q.tex.tiled[1];
  const set = pair(T, 2 * R, 2 * R, Z, (c, o, W, H, ppm) => {
    c.fillStyle = "#1b1c1e"; c.fillRect(0, 0, W, H); o.fillStyle = ORM(1, 0.6, 0); o.fillRect(0, 0, W, H);
    const m = W / 2, line = (g, style, lw, f) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); f(g); g.stroke(); };
    const spiral = (g) => { for (let a = 0; a <= Math.PI * 2 * 14; a += 0.03) { const r = (5.5 + (18.2 - 5.5) * a / (Math.PI * 2 * 14)) * ppm; const x = m + r * Math.cos(a), y = m + r * Math.sin(a); a ? g.lineTo(x, y) : g.moveTo(x, y); } };
    const pitch = (18.2 - 5.5) / 14 * ppm;
    line(c, "#c47a3e", pitch * 0.62, spiral); line(o, ORM(1, 0.35, 1), pitch * 0.62, spiral);
    for (let k = 0; k < 3; k++) { const r = (19.6 + k * 0.75) * ppm, f = (g) => g.arc(m, m, r, 0, 7);
      line(c, "#b9763f", 0.45 * ppm, f); line(o, ORM(1, 0.35, 1), 0.45 * ppm, f); }
  });
  const geo = new T.CylinderGeometry(R, R, d, 96).rotateX(Math.PI / 2).translate(s * p.cx, p.cy, d / 2);
  const host = ctx.mk(geo, matWith("ferrite", set), par, false), g = G(T, s);
  const tail = ext(T, rectPath(new T.Shape(), s, [p.cx - 2.5, p.cx + 2.5], [p.cy + R - 1.5, p.cy + R + 3.5], 0.3), 0.12, 0.02, 1, curveSegs(0.3)).translate(0, 0, p.z[0] + 0.05);
  kid(host, p, tail, mat("flexAmber"), "coilTail");
  kid(host, p, g.box(p.cx - 2.5, p.cx + 2.5, p.cy + R + 2.0, p.cy + R + 3.5, p.z[0] + 0.17, p.z[0] + 0.42), mat("stiffenerGold"), "coilTail");
  return host;
}

// camera module: rounded body, three stepped lens barrels, top glass; cam-udc and cam-cover face their own way
const LENS = {
  "cam-main": { c: [62.6, 45.6], body: -4.3, steps: [[5.6, -5.2], [4.8, -6.3], [4.3, -7.25]], glass: 3.6 },
  "cam-uw":   { c: [62.5, 20.4], body: -3.8, steps: [[4.4, -4.6], [3.8, -5.6], [3.3, -6.65]], glass: 2.8 },
  "cam-udc":  { c: [69.0, 55.0], body: -0.9, steps: [[1.05, -0.58]], glass: 0.85, out: 1 },
  "cam-cover": { c: [38.25, 54.85], body: -6.3, steps: [[1.4, -6.45], [1.15, -6.58]], glass: 0.95 }
};
function buildCamera(T, p, s, par, ctx) {
  const L = LENS[p.id], g = G(T, s), out = L.out || -1;
  // body: from the module's base to the body line; barrels step out from there
  const zb = out < 0 ? [L.body, p.z[1]] : [p.z[0], L.body];
  const parts = [g.rbox(p.x, p.y, zb, p.r || 1, 0.3)];
  let z = L.body;
  L.steps.forEach(([r, z1]) => { parts.push(g.cyl(L.c[0], L.c[1], r, Math.min(z, z1), Math.max(z, z1), 48)); z = z1; });
  const geo = merge(parts); geo.translate(0, 0, -p.z[0]);
  const host = ctx.mk(geo, mat("cameraBody"), par, true);
  const zg = out < 0 ? Math.min(z, p.z[0]) - 0.01 : Math.max(z, p.z[1]) + 0.01;
  kid(host, p, merge([g.disc(L.c[0], L.c[1], L.glass, zg, out, 48)]), mat("lens"), "lens");
  return host;
}
// periscope zoom: champagne housing; the prism end has a black square window, the long body a lens-tube rib and a tab
function buildPeriscope(T, p, s, par, ctx) {
  const g = G(T, s), prism = p.id === "cam-prism";
  const parts = prism ? [g.rbox(p.x, p.y, p.z, p.r, 0.3)]
    : [g.rbox(p.x, p.y, [-4.9, p.z[1]], p.r, 0.25), new T.CylinderGeometry(1.9, 1.9, 19, 32).rotateZ(Math.PI / 2).translate(s * 44.5, 33, -3.4)];
  const geo = merge(parts); geo.translate(0, 0, -p.z[0]);
  const host = ctx.mk(geo, mat("periscope"), par, true);
  if (prism) {
    const cx = (p.x[0] + p.x[1]) / 2, cy = (p.y[0] + p.y[1]) / 2;
    kid(host, p, g.box(cx - 3.5, cx + 3.5, cy - 3.5, cy + 3.5, p.z[0] - 0.03, p.z[0] + 0.01), mat("lens"), "lens");
  } else kid(host, p, merge([g.box(33.4, 35.4, 38, 39.6, -1.5, -1.3), g.cyl(34.4, 38.9, 0.45, -1.7, -1.5, 12)]), mat("steelBracket"), "tab");
  return host;
}
// stamped steel camera bracket: the plate the three rear modules sit on, with windows and three screw ears
function buildBracket(T, p, s, par, ctx) {
  const g = G(T, s), ears = [[53.6, 16.0], [53.6, 51.4], [71.6, 33.0]];
  const geo = merge([slab(T, p, s, 0.04, 1).translate(0, 0, p.z[0])].concat(ears.map(([x, y]) => g.rbox([x - 1, x + 1], [y - 0.7, y + 0.7], p.z, 0.4, 0.04))));
  geo.translate(0, 0, -p.z[0]);
  const host = ctx.mk(geo, mat("steelBracket"), par, false);
  kid(host, p, merge(ears.map(([x, y]) => g.cyl(x, y, 0.5, p.z[0] - 0.25, p.z[0], 16))), mat("screw"), "screw");
  return host;
}

// sealed speaker box (RC §5, Samsung style): black box, raised window showing the membrane, red gasket rim, screw ears
function buildSpeaker(T, p, s, par, ctx) {
  const g = G(T, s), z0 = p.z[0], cx = (p.x[0] + p.x[1]) / 2, cy = (p.y[0] + p.y[1]) / 2, ww = (p.x[1] - p.x[0]) * 0.7, wh = (p.y[1] - p.y[0]) * 0.7;
  const ears = p.id === "speaker-top" ? [[p.x[0] - 0.7, cy], [p.x[1] + 0.7, cy]] : [[p.x[1] + 0.7, cy + 2.5], [p.x[1] + 0.7, cy - 2.5]];
  const geo = merge([slab(T, p, s, 0.3, 2).translate(0, 0, z0)].concat(ears.map(([x, y]) => g.rbox([x - 0.7, x + 0.7], [y - 0.7, y + 0.7], [-1.4, -1.0], 0.35, 0.04))));
  geo.translate(0, 0, -z0);
  const host = ctx.mk(geo, mat("speakerBox"), par, true);
  const wx = [cx - ww / 2, cx + ww / 2], wy = [cy - wh / 2, cy + wh / 2];
  kid(host, p, g.rbox(wx, wy, [z0 - 0.1, z0 + 0.05], 1.2, 0.03), mat("membrane"), "membrane");
  const rim = rectPath(new T.Shape(), s, [wx[0] - 0.6, wx[1] + 0.6], [wy[0] - 0.6, wy[1] + 0.6], 1.6); rim.holes.push(rectPath(new T.Path(), s, wx, wy, 1.2));
  kid(host, p, ext(T, rim, 0.25, 0.04, 1, curveSegs(1.6)).translate(0, 0, z0 - 0.2), mat("gasketRed"), "gasket");
  kid(host, p, merge(ears.map(([x, y]) => g.cyl(x, y, 0.5, -1.65, -1.4, 16))), mat("screw"), "screw");
  return host;
}

// steel can parts: the vibration motor (laser marking, a screw tab) and the USB-C receptacle shell with side flanges
function buildSteelCan(T, p, s, par, ctx) {
  const g = G(T, s);
  if (p.id === "usb") {
    const sh = roundPoly(new T.Shape(), [[s * p.x[0], p.z[0]], [s * p.x[1], p.z[0]], [s * p.x[1], p.z[1]], [s * p.x[0], p.z[1]]], [1.4, 1.4, 1.4, 1.4]);
    const shell = new T.ExtrudeGeometry(sh, { depth: p.y[1] - p.y[0], bevelEnabled: false, curveSegments: 12 }).rotateX(Math.PI / 2).translate(0, p.y[1], 0);
    const geo = merge([shell, g.box(p.x[0] - 1.5, p.x[0], -58, -56, p.z[0], p.z[0] + 0.2), g.box(p.x[1], p.x[1] + 1.5, -58, -56, p.z[0], p.z[0] + 0.2)]);
    geo.translate(0, 0, -p.z[0]);
    return ctx.mk(geo, mat("steelCan"), par, true);
  }
  const set = pair(T, p.x[1] - p.x[0], p.y[1] - p.y[0], Q.tex.can, (c, o, W, H, ppm) => {
    c.fillStyle = "#b9bcc0"; c.fillRect(0, 0, W, H); o.fillStyle = ORM(1, 0.35, 1); o.fillRect(0, 0, W, H);
    const rnd = rng(71); for (let i = 0; i < 300; i++) { c.fillStyle = "rgba(255,255,255," + (rnd() * 0.15).toFixed(3) + ")"; c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 6, 1); }
    c.fillStyle = "rgba(55,58,64,0.75)"; o.fillStyle = ORM(1, 0.6, 0.6); c.textBaseline = o.textBaseline = "top";
    [["LRA X0815", 0.28], ["2641 K4  1.2V", 0.55]].forEach(([t, fy]) => { const f = "600 " + (H * 0.16).toFixed(1) + "px monospace"; c.font = o.font = f; c.fillText(t, W * 0.08, H * fy); o.fillText(t, W * 0.08, H * fy); });
  });
  const host = ctx.mk(planUV(slab(T, p, s, 0.15, 2), p, s), matWith("steelCan", set), par, true);
  kid(host, p, merge([g.rbox([10.5, 12.3], [-49.1, -47.4], [-1.4, -1.0], 0.4, 0.04)]), mat("steelCan"), "tab");
  kid(host, p, g.cyl(11.4, -48.2, 0.5, -1.65, -1.4, 16), mat("screw"), "screw");
  return host;
}

// mid-frame: brushed aluminium with screw bosses on its back along the hinge edge, black adhesive panels on its
// screen side
const FRAME = { panel: { bosses: [[12.3, 6.0], [12.3, 55.8], [12.3, 30.5]], tapes: [[46.5, 72, 2, 49], [14, 43, 1.5, 10.5]] },
  deck: { bosses: [[12.3, -40.0], [12.3, -30.0], [12.3, 51.5]], tapes: [[14, 69, 47.5, 57.5], [14, 69, -22.5, -16.5]] } };
function buildMidframe(T, p, s, par, ctx) {
  const F = FRAME[p.leaf], g = G(T, s);
  const geo = merge([slab(T, p, s, 0.05, 1).translate(0, 0, p.z[0])].concat(F.bosses.map(([x, y]) => g.cyl(x, y, 1.2, p.z[0] - 0.4, p.z[0], 24))));
  geo.translate(0, 0, -p.z[0]);
  const host = ctx.mk(geo, mat("alu"), par, false);
  kid(host, p, merge(F.tapes.map((a) => g.box(a[0], a[1], a[2], a[3], p.z[1] - 0.02, p.z[1] + 0.002))), lift(mat("tapeBlack").clone(), -1, -2), "tape");
  return host;
}

// inner OLED: matte silver backing plate with a black tape stripe along the fold and black adhesive sheets (painted);
// the screen half's panel has its driver flex folded over the bottom edge, with gold contacts and the driver chip
function buildOled(T, p, s, par, ctx) {
  const w = p.x[1] - p.x[0], h = p.y[1] - p.y[0], f = picX(p, s), rnd = rng(p.leaf === "panel" ? 81 : 82);
  const set = pair(T, w, h, Q.tex.tiled[1], (c, o, W, H, ppm) => {
    const R = (x0, x1, y0, y1) => { const a = f(x0), b = f(x1); return [Math.min(a, b) * ppm, (h - (y1 - p.y[0])) * ppm, Math.abs(b - a) * ppm, (y1 - y0) * ppm]; };
    c.fillStyle = "#c8cbcf"; c.fillRect(0, 0, W, H); o.fillStyle = ORM(1, 0.45, 1); o.fillRect(0, 0, W, H);
    const tape = (r, col) => { c.fillStyle = col; c.fillRect(...r); o.fillStyle = ORM(1, 0.75, 0); o.fillRect(...r); };
    tape(R(p.x[0], 8.0, p.y[0], p.y[1]), "#141518");                       // the fold stripe (RC §9)
    tape(R(14, 44, -50, -8), "#1d1e21"); tape(R(48, 70, 6, 46), "#1d1e21");   // adhesive sheets
    c.fillStyle = "#6b6f75"; for (let i = 0; i < 16; i++) { const y = p.y[0] + 4 + i * (h - 8) / 15, [x0, y0] = R(73.2, 73.2, y, y); c.beginPath(); c.arc(x0, y0, 0.3 * ppm, 0, 7); c.fill(); }
    void rnd;
  }, 0.5);
  const host = ctx.mk(planUV(slab(T, p, s, 0.05, 1), p, s), matWith("oledBack", set), par, false);
  if (p.leaf === "panel") {
    const g = G(T, s), fx = [11.6, 40.4];
    const fc = cv(512, 64), x = fc.getContext("2d");
    x.fillStyle = "#3a3d42"; x.fillRect(0, 0, 512, 64);
    x.strokeStyle = "rgba(160,150,120,0.25)"; x.lineWidth = 2; for (let i = 0; i < 40; i++) { x.beginPath(); x.moveTo(12 + i * 12, 64); x.lineTo(12 + i * 12, 30); x.stroke(); }
    x.fillStyle = "#d9b45a"; for (let i = 0; i < 30; i++) x.fillRect(40 + i * 14.5, 6, 8, 16);
    const fm = mat("flexBlack").clone(); fm.map = canvasTex(T, fc); fm.color.setHex(0xffffff); fm.roughness = 0.5;
    const geo = merge([g.box(fx[0], fx[1], -59.95, -56.5, -0.62, -0.5), g.box(fx[0], fx[1], -60.15, -59.95, -0.62, -0.13)]);
    flatUV(geo, (xx, yy) => [(s * xx - fx[0]) / (fx[1] - fx[0]), (yy + 60.15) / 3.65]);
    kid(host, p, geo, fm, "driverFlex");
    kid(host, p, g.box(22, 30, -58.9, -57.5, -0.87, -0.62), mat("chip"), "driverFlex");
  }
  return host;
}

// cover OLED: rose-copper foil back with a black sheet stuck on it and a black border (RC §6, IFX-P10)
function buildCoverOled(T, p, s, par, ctx) {
  const w = p.x[1] - p.x[0], h = p.y[1] - p.y[0];
  const set = pair(T, w, h, Q.tex.tiled[1], (c, o, W, H, ppm) => {
    c.fillStyle = "#b98a6c"; c.fillRect(0, 0, W, H); o.fillStyle = ORM(1, 0.3, 1); o.fillRect(0, 0, W, H);
    const blk = (x, y, ww, hh) => { c.fillStyle = "#16171a"; c.fillRect(x * ppm, y * ppm, ww * ppm, hh * ppm); o.fillStyle = ORM(1, 0.7, 0); o.fillRect(x * ppm, y * ppm, ww * ppm, hh * ppm); };
    c.lineWidth = o.lineWidth = 1.6 * ppm; c.strokeStyle = "#16171a"; o.strokeStyle = ORM(1, 0.7, 0);
    c.strokeRect(0, 0, W, H); o.strokeRect(0, 0, W, H);
    blk(w * 0.2, h * 0.22, w * 0.6, h * 0.42);
    c.fillStyle = "rgba(240,240,236,0.8)"; c.font = "600 " + (2.2 * ppm).toFixed(1) + "px monospace"; c.fillText("CS-42 R2", w * 0.24 * ppm, h * 0.3 * ppm);
  }, 0.5);
  return ctx.mk(planUV(slab(T, p, s, 0.05, 1), p, s), matWith("copperFoil", set), par, false);
}

/* ---------- keyboard stack (R3 §5; RC §10): mat, light guide, domes, switch flex, steel backer ---------- */
const keyPos = () => (S.keys || []).map((k) => [k.x, k.y]);
// silicone mat: a raised pad under each keycap on its outer side (the caps are glued to these), an actuator nub under
// each key on its inner side
function buildKbdMat(T, p, s, par, ctx) {
  const g = G(T, s), pad = (k) => new T.ExtrudeGeometry(rectPath(new T.Shape(), s, [k.x - k.w / 2 + 0.3, k.x + k.w / 2 - 0.3], [k.y - k.h / 2 + 0.3, k.y + k.h / 2 - 0.3], 1.8),
    { depth: 0.1, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, p.z[0] - 0.1);
  const geo = merge([slab(T, p, s, 0.04, 1).translate(0, 0, p.z[0])].concat((S.keys || []).map(pad), keyPos().map(([x, y]) => g.cyl(x, y, 0.6, p.z[1], p.z[1] + 0.15, 8))));
  geo.translate(0, 0, -p.z[0]);
  return ctx.mk(geo, mat("siliconeMat"), par, false);
}
let ledMat = null;
function setLeds() { if (!ledMat) return; const on = props.keyBacklight !== false; ledMat.emissive.setHex(on ? 0xffb85c : 0x000000); ledMat.emissiveIntensity = on ? 1.6 : 0; invalidate(); }
function buildLgf(T, p, s, par, ctx) {
  const q = Object.assign({}, p, { holes: keyPos().map(([x, y]) => ({ x: [x - 0.7, x + 0.7], y: [y - 0.7, y + 0.7], r: 0.7 })) });
  const host = ctx.mk(slab(T, q, s, 0.03, 1), mat("lgf"), par, false), g = G(T, s);
  ledMat = mat("flash").clone(); setLeds();
  kid(host, p, merge([g.box(3.6, 4.6, -33.8, -33.2, -5.46, -5.06), g.box(3.6, 4.6, -43.8, -43.2, -5.46, -5.06)]), ledMat, "led");
  return host;
}
function domeGeo(T) {
  const seg = Q.tier === "low" ? 12 : 24, prof = [[0, 0.17], [0.6, 0.165], [1.2, 0.145], [1.8, 0.1], [2.3, 0.0], [2.24, 0.0], [1.75, 0.065], [1.17, 0.11], [0.6, 0.125], [0, 0.13]];
  const shell = new T.LatheGeometry(prof.map((q) => new T.Vector2(q[0], q[1])), seg).rotateX(-Math.PI / 2);   // height → −z (toward the keys)
  const leg = (a) => new T.BoxGeometry(5.5, 1.2, 0.06).rotateZ(a).translate(0, 0, -0.03);
  return merge([shell, leg(Math.PI / 4), leg(-Math.PI / 4)]);
}
// carrier sheet on the key side; the domes hang under it (convex toward the keys), legs resting on the switch flex
function buildDomes(T, p, s, par, ctx) {
  const host = ctx.mk(slab(T, Object.assign({}, p, { z: [p.z[0], p.z[0] + 0.08] }), s, 0.02, 1), mat("carrierWhite"), par, false);
  const keys = keyPos(), im = new T.InstancedMesh(domeGeo(T), mat("domeSteel"), keys.length), M4 = new T.Matrix4();
  keys.forEach(([x, y], i) => { M4.makeTranslation(s * x, y, p.z[1]); im.setMatrixAt(i, M4); });
  im.position.z = -p.z[0]; im.castShadow = false; im.userData.small = true; im.userData.detail = detailOf("domes"); host.add(im);
  return host;
}
// switch flex: black cover film with a gold contact ring and a centre pad under every dome, traces between them
function kbdTex(T) {
  const KB = S.KB, P = 12, W = KB.W * P, H = KB.H * P;
  const set = pair(T, KB.W, KB.H, Math.max(W, H), (c, o) => {
    c.fillStyle = "#18191b"; c.fillRect(0, 0, W, H); o.fillStyle = ORM(1, 0.6, 0); o.fillRect(0, 0, W, H);
    c.strokeStyle = "rgba(120,124,130,0.35)"; c.lineWidth = 2;
    S.keys.forEach((k) => { const cx = (k.x - KB.x0) * P, cy = (KB.y0 + KB.H - k.y) * P;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, H); c.stroke();
      [c, o].forEach((g, i) => { g.strokeStyle = i ? ORM(1, 0.3, 1) : "#d8b25c"; g.lineWidth = 0.55 * P; g.beginPath(); g.arc(cx, cy, 1.85 * P, 0, 7); g.stroke();
        g.fillStyle = i ? ORM(1, 0.3, 1) : "#e2bf6a"; g.beginPath(); g.arc(cx, cy, 0.75 * P, 0, 7); g.fill(); }); });
  }, 0.5);
  return set;
}
function buildSwitchFlex(T, p, s, par, ctx) {
  const geo = slab(T, p, s, 0.02, 1), KB = S.KB;
  flatUV(geo, (x, y) => [(s * x - KB.x0) / KB.W, (y - KB.y0) / KB.H]);
  return ctx.mk(geo, matWith("flexBlack", kbdTex(T)), par, false);
}
// steel backer with four screw tabs (holes Ø1.0)
function buildBacker(T, p, s, par, ctx) {
  const tabs = [[12, -23.4], [48, -23.4], [12, -53.2], [48, -53.2]], d = p.z[1] - p.z[0];
  const ears = tabs.map(([x, y]) => { const sh = rectPath(new T.Shape(), s, [x - 1.2, x + 1.2], [y - 0.8, y + 0.8], 0.5); sh.holes.push(new T.Path().absarc(s * x, y, 0.5, 0, Math.PI * 2, true)); return ext(T, sh, d, 0.02, 1, curveSegs(0.5)); });
  return ctx.mk(merge([slab(T, p, s, 0.03, 1)].concat(ears)), mat("steelSatin"), par, false);
}

/* ---------- dispatch ---------- */
const OLD = { battery: "tapeBlack", pcb: "pcb", pcbEdge: "pcbGold", chip: "chip", chip2: "chip", shield: "shieldCan", copper: "copperFoil", coil: "ferrite",
  graphite: "graphite", camera: "cameraBody", alu: "alu", oled: "oledBack", kbd: "siliconeMat", steel: "steelCan", speaker: "speakerBox", titanium: "steelDark", flex: "flexAmber" };
const BY_ID = { "kbd-mat": buildKbdMat, "kbd-lgf": buildLgf, "kbd-domes": buildDomes, kbd: buildSwitchFlex, "kbd-backer": buildBacker,
  "cam-bracket": buildBracket, "cover-oled": buildCoverOled };
const BY_LOOK = { pouch: buildCell, pcb: buildBoard, chip: buildChip, shieldCan: buildCan, vc: buildPlain("vc"), graphite: buildGraphite, ferrite: buildCoil,
  cameraBody: buildCamera, periscope: buildPeriscope, speakerBox: buildSpeaker, steelCan: buildSteelCan, alu: buildMidframe, oledBack: buildOled };

// one parts.js entry as a mesh (with its details as children). Adds it to its half, tags it for the teardown and marks
// it (and every child) with its part. userData.anchors: outer and inner face centres (mesh-local) for the label, just
// outside the part's details so they never hide it.
export function partBox(p, ctx) {
  const T = ctx.T, s = p.leaf === "deck" ? -1 : 1, par = ctx.G[p.leaf];
  const build = BY_ID[p.id] || BY_LOOK[p.look];
  let m;
  if (build) m = build(T, p, s, par, ctx);
  else {   // anything else: a plain extruded part in its look (or its old material's match)
    const name = p.look || OLD[p.mat] || "chip";
    const geo = p.rad ? new T.CylinderGeometry(p.rad, p.rad, p.z[1] - p.z[0], 72).rotateX(Math.PI / 2).translate(s * p.cx, p.cy, (p.z[1] - p.z[0]) / 2) : slab(T, p, s, 0.08, 2);
    m = ctx.mk(geo, mat(name), par, p.z[1] - p.z[0] > 0.4);
  }
  m.receiveShadow = false; m.position.z = p.z[0];
  mark(m, { part: p });
  if (/^kbd/.test(p.id)) mark(m, { kbd: true });
  // anchors: the part's centre, on the outer and inner faces of the box round the part and its details
  const box = new T.Box3(), b = new T.Box3(); m.updateMatrixWorld(true);
  // (an instanced child's box comes from its instances: its geometry's own box is one copy at the origin, which put the
  // dome sheet's inner anchor 5 mm off the sheet, G2-19)
  m.traverse((o) => { if (!o.geometry) return;
    if (o.isInstancedMesh) { o.computeBoundingBox(); b.copy(o.boundingBox); } else { o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox); }
    if (o !== m) b.translate(o.position); box.union(b); });
  const cx = p.rad ? s * p.cx : s * (p.x[0] + p.x[1]) / 2, cy = p.rad ? p.cy : (p.y[0] + p.y[1]) / 2;
  m.userData.anchors = [new T.Vector3(cx, cy, box.min.z - 0.05), new T.Vector3(cx, cy, box.max.z + 0.05)];
  // inside: not drawn in the closed-up phone, unless it shows from outside (SEEN_OUTSIDE, teardown.js)
  tag(m, p.layer, p.ex, { leaf: p.leaf, slide: p.slide || null, inside: !SEEN_OUTSIDE.has(p.id) });
  return m;
}

export function buildInternals(ctx) {
  const D = window.FC_PARTS; if (!D) return;
  D.parts.forEach((p) => {
    if (p.render === "flex") return;   // ribbons: js/teardown.js draws them from FC_PARTS.flexes (B5)
    const m = p.leaf === "spine" ? ctx.spinePart(p, ctx) : ctx.partBox(p, ctx);
    if (!m) return;
    let [a0, a1] = m.userData.anchors || [];
    if (!a0) {   // a part built without anchors: use the centre of its box
      m.geometry.computeBoundingBox(); a0 = m.geometry.boundingBox.getCenter(new THREE.Vector3()); a1 = a0.clone();
    }
    S.parts.push({ p, mesh: m, a0, a1, el: null });
  });
  const bl = $("t-backlight"); if (bl) bl.addEventListener("change", setLeds);
}

// redraw the battery labels (capacity text) after the fonts load
export function repaintInternals() {
  S.parts.forEach((q) => {
    if (q.p.look !== "pouch" || !q.mesh.material.map) return;
    const old = q.mesh.material.map, { set } = cellMaps(q.p);
    q.mesh.material.map = set.map; q.mesh.material.needsUpdate = true; old.dispose();
  });
  invalidate();
}
