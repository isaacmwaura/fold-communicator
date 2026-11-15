/* Fold Communicator — the outside: leaf bodies, glass, cover screen, keys and key web, side keys, edge openings,
   antenna bands, gasket lines, camera island, and the fold itself. Positions are front coords (parts.js); the deck
   mirrors x. */
import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { props, S, GEO, fin, onFinish, invalidate, params } from "./state.js";
import { $, cv, tex, rrShape, leafShape, ext, curveSegs, polyHole, shapePoints, flatUV, mark, insetLoop } from "./util.js";
import { mat } from "./materials.js";
import { tag } from "./teardown.js";
import { HV, coverOutline, updateHinge } from "./hinge.js";

const stEl = $("state"), dimEl = $("dims"), angEl = $("angle"), slider = $("hinge"), playBtn = $("v-play");

/* keyboard layout, front coords: x from hinge (0 → L), y up */
function keyLayout() {
  const { L, KW, KH, PX, ROWS } = GEO, span = 9 * PX + KW, kx0 = L / 2 - span / 2 + KW / 2;
  S.KB = { x0: L / 2 - 36, y0: -54, W: 72, H: 32 };
  const letters = [
    [["Q", "#"], ["W", "1"], ["E", "2"], ["R", "3"], ["T", "("], ["Y", ")"], ["U", "_"], ["I", "-"], ["O", "+"], ["P", "@"]],
    [["A", "*"], ["S", "4"], ["D", "5"], ["F", "6"], ["G", "/"], ["H", ":"], ["J", ";"], ["K", "'"], ["L", "\""], ["⌫", null]],
    [["⇧", null], ["Z", "7"], ["X", "8"], ["C", "9"], ["V", "%"], ["B", "?"], ["N", "!"], ["M", ","], [".", "$"], ["↵", null]]];
  const keys = [];
  letters.forEach((row, ri) => row.forEach((k, i) => keys.push({ x: kx0 + i * PX, y: ROWS[ri], w: KW, h: KH, ch: k[0], sub: k[1] })));
  // front row: [legend, small legend, width, red, mark]; the red key is the voice assistant's, marked with a sparkle
  const fr = [["123", null, KW], ["0", "ctrl", KW], ["⌕", null, KW], [null, null, span - 6 * KW - 6 * (PX - KW)], [null, null, KW, 1, "spark"], ["☺", "alt", KW], ["123", null, KW]];
  let fx = L / 2 - span / 2; fr.forEach((k) => { keys.push({ x: fx + k[2] / 2, y: ROWS[3], w: k[2], h: KH, ch: k[0], sub: k[1], red: !!k[3], mark: k[4] }); fx += k[2] + (PX - KW); });
  S.keys = keys;
  return span;
}

// a four-point sparkle centred at (cx, cy), its points r out: each side curves in toward the centre (a mark, not a letter)
function spark(g, cx, cy, r) {
  const tips = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  g.beginPath(); g.moveTo(cx, cy - r);
  // from each point to the next, pulled in through a point 0.18 r out toward the corner between them
  tips.forEach((a, i) => { const b = tips[(i + 1) % 4]; g.quadraticCurveTo(cx + 0.18 * r * (a[0] + b[0]), cy + 0.18 * r * (a[1] + b[1]), cx + b[0] * r, cy + b[1] * r); });
  g.closePath(); g.fill();
}
// key legends (glow = the backlight picture)
function keysTex(T, glow) {
  const KB = S.KB, P = 20, c = cv(KB.W * P, KB.H * P), g = c.getContext("2d");
  g.fillStyle = glow ? "#000" : fin().key; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = "center"; g.textBaseline = "middle";
  S.keys.forEach((k) => { const cx = (k.x - KB.x0) * P, cy = (KB.y0 + KB.H - k.y) * P, hw = k.w / 2 * P, hh = k.h / 2 * P;
    if (!glow) {
      if (k.red) { g.fillStyle = "#8e4047"; g.fillRect(cx - hw - 6, cy - hh - 6, 2 * hw + 12, 2 * hh + 12); }
      const gr = g.createLinearGradient(0, cy - hh, 0, cy + hh); gr.addColorStop(0, "rgba(255,255,255,0.06)"); gr.addColorStop(1, "rgba(0,0,0,0.08)");
      g.fillStyle = gr; g.fillRect(cx - hw, cy - hh, 2 * hw, 2 * hh);
    }
    const main = glow ? "#c8d7de" : "#f1f2f3", sub = glow ? "#6f7d84" : "#a4a9af";
    if (k.sub) { g.fillStyle = sub; g.font = "500 29px 'IBM Plex Sans',sans-serif"; g.fillText(k.sub, cx, cy - 27);
      g.fillStyle = main; g.font = "500 50px 'IBM Plex Sans',sans-serif"; g.fillText(k.ch, cx, cy + 18); }
    else if (k.mark === "spark") { g.fillStyle = main; spark(g, cx, cy + 2, 23); }
    else if (k.ch) { g.fillStyle = main; g.font = (k.ch.length > 2 ? "500 32px" : "500 46px") + " 'IBM Plex Sans',sans-serif"; g.fillText(k.ch, cx, cy + 2); }
  });
  return tex(T, c);
}
/* key tops, same layout as the legends (white = high): each a faint dish, the middle a little lower than a
   ring at 0.8 of the way out, the edge rolling off from there into the crown's bevel, as a sculpted keycap the finger
   settles into */
const DISH = [[0, 0.8], [0.3, 0.83], [0.55, 0.91], [0.8, 1], [0.92, 0.8], [1, 0.45]];
function keysBump(T) {
  const KB = S.KB, P = 10, c = cv(KB.W * P, KB.H * P), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  S.keys.forEach((k) => { const cx = (k.x - KB.x0) * P, cy = (KB.y0 + KB.H - k.y) * P;
    g.save(); g.translate(cx, cy); g.scale((k.w / 2 - 0.42) * P, (k.h / 2 - 0.42) * P);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    DISH.forEach(([r, h]) => { const v = Math.round(255 * h); gr.addColorStop(r, "rgb(" + v + "," + v + "," + v + ")"); });
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore(); });
  return tex(T, c, { color: false });
}
/* the backlight's brightness when it is on: the one place it is set. materials.js (setBacklightLook, from the backdrop)
   scales it by its emissiveIntensity: full on the dark backdrop (0.55), 0.22 of it on the light one (0.12), where a
   real backlight is all but invisible. Only the key tops glow: the sides' copy has no emissive. */
const BACKLIGHT = 0.55;
function setBacklight() { if (S.keyMat) S.keyMat.emissive.setScalar(props.keyBacklight === false ? 0 : BACKLIGHT); invalidate(); }
// redraw both key pictures (after the fonts load)
export function repaintKeys() { if (!S.keyMat) return;
  S.keyMat.map.dispose(); S.keyMat.map = keysTex(THREE, false); S.keyMat.emissiveMap.dispose(); S.keyMat.emissiveMap = keysTex(THREE, true); S.keyMat.needsUpdate = true; invalidate(); }
// a finish change recolours the key legend map (applyFinish keeps the keycap colour white once it has a map)
onFinish(() => { if (!S.keyMat) return; S.keyMat.map.dispose(); S.keyMat.map = keysTex(THREE, false); S.keyMat.needsUpdate = true;
  S.keyPlain.color.set(fin().key); invalidate(); });

// util.ext() with fewer corner segments, for the many small rounded keys and key openings (saves triangles)
function extLo(T, shape, depth, bev, segs, curve) {
  const g = new T.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: segs, curveSegments: curve });
  g.translate(0, 0, bev); return g; }
// rounded rectangle centred at (cx, cy), as a Shape or as a Path (a hole)
function rrAt(T, w, h, r, cx, cy, hole) { const s = hole ? new T.Path() : new T.Shape(), x = cx - w / 2, y = cy - h / 2; r = Math.min(r, h / 2, w / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }

/* ---------- the frame's edges: openings, antenna bands, gasket lines ----------
   Openings are real holes: the frame's flat edge band is cut round each one (frameGeo), and each hole is lined with
   walls going in and closed by a floor, its first part frame metal (the lit rim), then dark. All in the frame body's
   own coords (z 0 at the back face, t at the screen face); the meshes sit at z −t, as the body. */
// faces meeting at under 30° share a normal: the frame's corner and bevel steps read as one smooth surface (with the
// extrusion's normals per face, the 9.2 mm corners' 28 steps showed as bands in the `usb` still)
const SMOOTH = Math.PI / 6;
/* a rounded rectangle w × h (along × across), corner r (clamped: a stadium or a circle), centred at (cx, cy), as points
   anticlockwise, n steps per corner. Every ring of one opening has the same w/h/r pattern and n, so two rings at two
   depths join point by point. */
function rrRing(w, h, r, cx, cy, n) {
  r = Math.min(r, w / 2, h / 2); const hx = w / 2 - r, hy = h / 2 - r, pts = [], far = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  [[hx, hy], [-hx, hy], [-hx, -hy], [hx, -hy]].forEach(([ox, oy], q) => {
    for (let k = 0; k <= n; k++) { const a = (q + k / n) * Math.PI / 2, p = [cx + ox + r * Math.cos(a), cy + oy + r * Math.sin(a)];
      if (!pts.length || far(p, pts[pts.length - 1])) pts.push(p); } });
  if (!far(pts[0], pts[pts.length - 1])) pts.pop();
  return pts;
}
// a triangle list; each triangle is turned to face `w` (a direction), so its builder need not mind the winding.
// uv in mm (the frame's grain map is tiled in mm): (x + z, y + z), which spreads the grain on a wall in any direction
function soup() {
  const p = [], uv = [];
  return { p,
    tri(a, b, c, w) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      if ((u[1] * v[2] - u[2] * v[1]) * w[0] + (u[2] * v[0] - u[0] * v[2]) * w[1] + (u[0] * v[1] - u[1] * v[0]) * w[2] < 0) { const q = b; b = c; c = q; }
      [a, b, c].forEach((q) => { p.push(q[0], q[1], q[2]); uv.push(q[0] + q[2], q[1] + q[2]); }); },
    quad(a, b, c, d, w) { this.tri(a, b, c, w); this.tri(a, c, d, w); },
    geo(T) { const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      return toCreasedNormals(g, SMOOTH); } };
}
/* the three straight edges of a half that carry openings, s = −1 mirrors x: at(a, z, d) is the point a along the edge
   (x on the top and bottom edges, y on the free edge), z across it, d in from the outer face; n its outward normal */
function edgeOf(s, k) {
  const { H, L } = GEO;
  if (k === "top") return { k, at: (a, z, d) => [a, H / 2 - d, z], n: [0, 1, 0] };
  if (k === "bot") return { k, at: (a, z, d) => [a, -H / 2 + d, z], n: [0, -1, 0] };
  return { k, at: (a, z, d) => [s * (L - d), a, z], n: [s, 0, 0] };
}
/* an opening on edge E, centred at (ca, cz): rings, outer face first, each { pts, d (depth in), m (the soup the walls
   from the ring before go to; none: no wall) }. Walls face the opening's axis (away from it if `solid`: a part standing
   in the opening); two rings at one depth make a flat step facing out (a lip). The last ring is closed by a floor in
   soup `floor` (facing out). */
function loft(T, E, ca, cz, rings, floor, solid) {
  for (let i = 1; i < rings.length; i++) { const A = rings[i - 1], B = rings[i], n = A.pts.length; if (!B.m) continue;
    if (B.pts.length !== n) throw new Error("loft: rings of " + n + " and " + B.pts.length + " points");
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n;
      const q = [E.at(A.pts[k][0], A.pts[k][1], A.d), E.at(A.pts[k1][0], A.pts[k1][1], A.d), E.at(B.pts[k1][0], B.pts[k1][1], B.d), E.at(B.pts[k][0], B.pts[k][1], B.d)];
      let w = E.n;
      if (Math.abs(A.d - B.d) > 1e-9) { const ax = E.at(ca, cz, (A.d + B.d) / 2), sg = solid ? -1 : 1;
        w = [0, 1, 2].map((j) => sg * (ax[j] - (q[0][j] + q[1][j] + q[2][j] + q[3][j]) / 4)); }
      B.m.quad(q[0], q[1], q[2], q[3], w); } }
  if (!floor) return;
  const R = rings[rings.length - 1], v = R.pts.map((p) => new T.Vector2(p[0], p[1]));
  T.ShapeUtils.triangulateShape(v, []).forEach((f) => floor.tri(...f.map((j) => E.at(R.pts[j][0], R.pts[j][1], R.d)), E.n));
}
/* a half's edge openings: for each edge, the outer outlines frameGeo cuts out of the flat band; and the
   soups: rim (frame metal, merged into the frame body), grille (the speaker's holes, marked for the `top` / `botedge`
   stills), dark (the other holes, the key slots, the USB-C shell), lip (the USB-C shell's polished front edge), tongue
   (the USB-C tongue). The flat band is t − 2B = 3.1 tall, centred at z = t/2.
   - speaker grilles: 6 round holes Ø0.9 at 1.8 pitch, 0.8 deep, at the same place on both halves' outer ends (x 55,
     over the speaker boxes, x 44 to 67), so the two ends match;
   - mics: Ø0.8, 0.6 deep;
   - USB-C: 8.6 × 2.7 (a real opening is about 8.3 × 2.6) with a 0.15 chamfer round it, frame metal 0.5 deep, then the
     shell's polished lip, the dark shell to 3 mm, and the tongue (6.7 × 0.7) from 0.9 in;
   - side keys (the panel's free edge), each with a 0.1 gap all round: power and fingerprint 2.6 × 12, its top 0.15
     below the edge in its slot (flush and flat, a fingertip finds it); volume 2.0 × 18, standing 0.25 proud. Volume at
     y 35, clear of the antenna band at 46. */
const RIM = 0.15;
function edgeOpenings(T, s) {
  const t = GEO.t, zc = t / 2, cut = { top: [], bot: [], side: [] }, o = { cut, rim: soup(), grille: soup(), dark: soup(), lip: soup(), tongue: soup() };
  const E = { top: edgeOf(s, "top"), bot: edgeOf(s, "bot"), side: edgeOf(s, "side") };
  // a round hole (12 steps round): the lit rim (0.3 of frame metal, the far wall's crescent that says "hole"), then
  // dark walls to its floor
  const hole = (k, a, dia, deep, m) => { const pts = rrRing(dia, dia, dia / 2, a, zc, 3); cut[k].push(pts);
    loft(T, E[k], a, zc, [{ pts, d: 0 }, { pts, d: 0.3, m: o.rim }, { pts, d: deep, m }], m); };
  const row = (k, a, n) => { for (let j = 0; j < n; j++) hole(k, a + s * (j - (n - 1) / 2) * 1.8, 0.9, 0.8, o.grille); };
  // a key's slot (along × across): its top `lit` mm frame metal, then the dark gap down past the key's foot
  const slot = (a, len, w, lit) => { const pts = rrRing(len + 0.2, w + 0.2, (w + 0.2) / 2, a, zc, 6); cut.side.push(pts);
    loft(T, E.side, a, zc, [{ pts, d: 0 }, { pts, d: lit, m: o.rim }, { pts, d: 1.3, m: o.dark }], o.dark); };
  if (s > 0) {
    row("bot", 55, 6); hole("bot", 25, 0.8, 0.6, o.dark); hole("top", 30, 0.8, 0.6, o.dark);
    slot(14, 12, 2.6, RIM); slot(35, 18, 2.0, 0.05);
  } else {
    const L = GEO.L, ux = -L / 2, ring = (w, h, r, d, m) => ({ pts: rrRing(w, h, r, ux, zc, 6), d, m });
    row("top", -55, 6); hole("top", -24, 0.8, 0.6, o.dark); hole("bot", -L / 2 + 9, 0.8, 0.6, o.dark);
    const mouth = ring(8.9, 3.0, 1.5, 0); cut.bot.push(mouth.pts);
    loft(T, E.bot, ux, zc, [mouth, ring(8.6, 2.7, 1.35, RIM, o.rim), ring(8.6, 2.7, 1.35, 0.5, o.rim), ring(8.3, 2.4, 1.2, 0.5, o.lip),
      ring(8.3, 2.4, 1.2, 3.0, o.dark)], o.dark);
    loft(T, E.bot, ux, zc, [{ pts: rrRing(6.7, 0.7, 0.3, ux, zc, 3), d: 0.9 }, { pts: rrRing(6.7, 0.7, 0.3, ux, zc, 3), d: 3.0, m: o.tongue }], null, true);
    const tip = rrRing(6.7, 0.7, 0.3, ux, zc, 3).map((p) => new T.Vector2(p[0], p[1]));
    T.ShapeUtils.triangulateShape(tip, []).forEach((f) => o.tongue.tri(...f.map((j) => E.bot.at(tip[j].x, tip[j].y, 0.9)), E.bot.n));
  }
  return o;
}
/* antenna bands: a plastic-filled cut through the whole frame wall, so each wraps the edge's whole section: the
   back bevel, the flat band and the screen-side bevel, from cap to cap (the frame's bevel is a quarter circle of radius
   B in 7 steps, util.ext). 1.0 wide, standing 0.006 proud (and drawn pulled toward the camera). Six per half, at the
   same places on both so they line up when shut: the free edge at y ±46, the top and bottom edges at x 20 and 62.5
   (near the outer corner; the corners' curve starts at x 67.3). */
function antennaBands(T, s) {
  const { B, t } = GEO, sp = soup(), prof = [], e = 0.006;
  for (let b = 0; b <= 7; b++) { const th = b / 7 * Math.PI / 2; prof.push([-B + B * Math.sin(th), B - B * Math.cos(th), Math.sin(th), -Math.cos(th)]); }
  for (let b = 7; b >= 0; b--) { const th = b / 7 * Math.PI / 2; prof.push([-B + B * Math.sin(th), t - B + B * Math.cos(th), Math.sin(th), Math.cos(th)]); }
  const band = (E, a) => { const pt = (p, da) => E.at(a + da, p[1] + e * p[3], -(p[0] + e * p[2]));
    for (let k = 0; k + 1 < prof.length; k++) { const P = prof[k], Q = prof[k + 1], nn = [(P[2] + Q[2]) / 2, (P[3] + Q[3]) / 2];
      sp.quad(pt(P, -0.5), pt(P, 0.5), pt(Q, 0.5), pt(Q, -0.5), [E.n[0] * nn[0], E.n[1] * nn[0], nn[1]]); } };
  [46, -46].forEach((y) => band(edgeOf(s, "side"), y));
  ["top", "bot"].forEach((k) => [20, 62.5].forEach((x) => band(edgeOf(s, k), s * x)));
  return sp;
}
/* gasket lines: the thin black seal where a glass or plate meets the frame. A strip on the frame's cap along
   the outline at insets ins0 to ins1 (util.leafShape's outline: its outer corners are quadratic curves, here 16 steps
   each), from x = xc on the hinge side round the free edge and back, at height z, facing `up` (+1 the screen side, −1
   the back). With `skirt` it stands up instead: at inset ins0, from z to z + skirt, facing out. */
function rimPts(s, ins, xc) {
  const { L, H, R } = GEO, x1 = L - ins, y0 = -H / 2 + ins, y1 = H / 2 - ins, ro = Math.max(0.3, R - ins), pts = [[xc, y0], [x1 - ro, y0]];
  const q = (p0, c, p1) => { for (let k = 1; k <= 16; k++) { const u = k / 16, v = 1 - u; pts.push([v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]]); } };
  q([x1 - ro, y0], [x1, y0], [x1, y0 + ro]); pts.push([x1, y1 - ro]); q([x1, y1 - ro], [x1, y1], [x1 - ro, y1]); pts.push([xc, y1]);
  return pts.map((p) => [s * p[0], p[1]]);
}
function gasketStrip(sp, s, ins0, ins1, xc, z, up, skirt) {
  const A = rimPts(s, ins0, xc), Bp = rimPts(s, skirt ? ins0 + 0.1 : ins1, xc);
  for (let k = 0; k + 1 < A.length; k++) {
    if (!skirt) { sp.quad([A[k][0], A[k][1], z], [A[k + 1][0], A[k + 1][1], z], [Bp[k + 1][0], Bp[k + 1][1], z], [Bp[k][0], Bp[k][1], z], [0, 0, up]); continue; }
    const w = [A[k][0] - Bp[k][0] + A[k + 1][0] - Bp[k + 1][0], A[k][1] - Bp[k][1] + A[k + 1][1] - Bp[k + 1][1], 0];
    sp.quad([A[k][0], A[k][1], z], [A[k + 1][0], A[k + 1][1], z], [A[k + 1][0], A[k + 1][1], z + skirt], [A[k][0], A[k][1], z + skirt], w); }
}

/* leaf frame (front coords, s = −1 mirrors x): a hollow ring whose hinge side is cut away, so the hinge shows once the
   screen or the back comes off. The ring starts at x = FX all the way round, end walls included: nearer the hinge each
   half turns about its pivot (P, −P; hinge.js) round the spine cover, and a corner left square there would swing
   across it. The end walls' hinge ends are built to fit the cover (elbowGeo). The cut runs the full straight wall (|y| < 59.33) and the top and bottom walls stay closed. Built from the ring's extrusion: drop its caps
   and the two long hinge-side faces, add caps for the C-shaped outline and an end face across each cut.
   Both outlines run clockwise, so the bevel moves the wall's outer and inner faces together: the wall stays 1.45 thick
   through its depth on both halves. (A plain ring made the panel's walls bulge 2.3 mm inward at mid-depth and fold
   over at the hinge-side corners, and turned the deck's inner faces inside out.)
   cut (edgeOpenings): per straight edge, the outlines of its openings. That edge's flat band (one quad from corner to
   corner, z B to t − B) is drawn again as a flat face with those holes in it. Normals: smooth across the corner and
   bevel steps (SMOOTH), sharp at the cut's end faces. */
function frameGeo(T, s, cut) {
  const { B, R, RH, t } = GEO;
  // each corner at its own step count (the 9.2 mm outer corners 28, the 1.6 mm hinge-side corners 8, util.shapePoints)
  const loop = (sh) => { const p = shapePoints(sh); if (p[0].distanceTo(p[p.length - 1]) < 1e-9) p.pop(); return T.ShapeUtils.isClockWise(p) ? p : p.reverse(); };
  // the outline's hinge side at x = FX (its square corners there meet the end walls' hinge ends, elbowGeo, clear of
  // the spine cover's shoulder as the half turns), the hole's 1.45 further in
  const O = loop(leafShape(T, s, B, R, 0.05, FX + B)), I = loop(leafShape(T, s, 2.6, R, RH, FX + B + 1.45)), m = I.length;
  // the hinge-side straight edge of a loop: the pair (k, k + 1) on the hinge side, one end above and one below
  const gap = (P) => P.findIndex((a, k) => { const b = P[(k + 1) % P.length]; return Math.abs(a.x) < 9 && Math.abs(b.x) < 9 && a.y * b.y < 0; });
  let ko = gap(O); const ki = gap(I);
  if (ko < 0 || ki < 0 || O[ko].y * I[ki].y < 0) throw new Error("frameGeo: hinge edge not found");
  // split the outline's hinge edge where the hole's ends are, so each cut is square across the wall
  { const a = O[ko], b = O[(ko + 1) % O.length], ye = Math.abs(I[ki].y);
    O.splice(ko + 1, 0, new T.Vector2(a.x, Math.sign(a.y) * ye), new T.Vector2(a.x, Math.sign(b.y) * ye)); ko++; }
  const n = O.length;
  const ring = new T.Shape(O); ring.holes.push(new T.Path(I));
  const g = ext(T, ring, t, B, 7), gp = g.attributes.position, guv = g.attributes.uv, side = g.groups[1];
  const sl = side.count / 6 / (n + m);   // bevel and step layers: the side faces are n·sl quads (outline), then m·sl (hole)
  if (sl !== Math.round(sl)) throw new Error("frameGeo: unexpected side layout");
  const pos = [], uv = [], ends = { o: [new Map(), new Map()], i: [new Map(), new Map()] };
  const put = (x, y, z, u, v) => { pos.push(x, y, z); uv.push(u, v); };
  // which straight edge's flat band a face of the outline lies on, if that edge has openings
  const span = {}, onBand = (v) => {
    let k = null;
    for (let q = 0; q < 3; q++) { const x = gp.getX(v + q), y = gp.getY(v + q), z = gp.getZ(v + q);
      if (z < B - 1e-4 || z > t - B + 1e-4) return null;
      const e = Math.abs(y - GEO.H / 2) < 1e-4 ? "top" : Math.abs(y + GEO.H / 2) < 1e-4 ? "bot" : Math.abs(x - s * GEO.L) < 1e-4 ? "side" : null;
      if (!e || (k && e !== k)) return null; k = e; }
    return cut && cut[k] && cut[k].length ? k : null; };
  for (let v = side.start; v < side.start + side.count; v += 3) {
    if (v - side.start < n * sl * 6) { const k = onBand(v);
      if (k) { const sp = span[k] || (span[k] = { a0: 1e9, a1: -1e9, n: 0 }); sp.n++;
        for (let q = 0; q < 3; q++) { const a = k === "side" ? gp.getY(v + q) : gp.getX(v + q); sp.a0 = Math.min(sp.a0, a); sp.a1 = Math.max(sp.a1, a); }
        continue; } }
    let lo = false, hi = false, near = true;
    for (let k = 0; k < 3; k++) { const y = gp.getY(v + k); if (y > 50) hi = true; if (y < -50) lo = true; if (Math.abs(gp.getX(v + k)) > 9) near = false; }
    if (lo && hi && near) {   // a long hinge-side face: drop it, keep its end points (by depth) for the end faces
      const which = v - side.start < n * sl * 6 ? "o" : "i";
      for (let k = 0; k < 3; k++) { const x = gp.getX(v + k), y = gp.getY(v + k), z = gp.getZ(v + k); ends[which][y > 0 ? 0 : 1].set(Math.round(z * 1e5), [x, y, z]); }
      continue; }
    // the hole's faces come out wound like the outline's, so they face into the wall: turn them round
    (v - side.start < n * sl * 6 ? [0, 1, 2] : [0, 2, 1]).forEach((k) => put(gp.getX(v + k), gp.getY(v + k), gp.getZ(v + k), guv.getX(v + k), guv.getY(v + k)));
  }
  g.dispose();
  // caps: the C outline = the outline the long way round, then the hole the long way round backwards
  const C = [];
  for (let k = 1; k <= n; k++) C.push(O[(ko + k) % n]);
  for (let k = 0; k < m; k++) C.push(I[(ki - k + m) % m]);
  const cg = new T.ShapeGeometry(new T.Shape(C)), cap = cg.toNonIndexed(), cp = cap.attributes.position;
  cg.dispose();
  for (let v = 0; v < cp.count; v += 3) {
    [0, 1, 2].forEach((k) => put(cp.getX(v + k), cp.getY(v + k), t, cp.getX(v + k), cp.getY(v + k)));
    [0, 2, 1].forEach((k) => put(cp.getX(v + k), cp.getY(v + k), 0, cp.getX(v + k), cp.getY(v + k)));
  }
  cap.dispose();
  // end faces: join the outline's and the hole's end points layer by layer, facing the cut
  [0, 1].forEach((e) => {
    const P = [...ends.o[e].values()].sort((a, b) => a[2] - b[2]), Q = [...ends.i[e].values()].sort((a, b) => a[2] - b[2]);
    if (P.length !== Q.length || P.length < 2) throw new Error("frameGeo: end profiles differ");
    for (let k = 0; k + 1 < P.length; k++) {
      let tri = [P[k], P[k + 1], Q[k + 1], P[k], Q[k + 1], Q[k]];
      const a = new T.Vector3(...tri[0]), ny = new T.Vector3(...tri[1]).sub(a).cross(new T.Vector3(...tri[2]).sub(a)).y;
      if (e === 0 ? ny > 0 : ny < 0) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
      tri.forEach((q) => put(q[0], q[1], q[2], q[0], 1 - q[2]));
    }
  });
  // the cut bands: the band's rectangle with the openings' outlines as holes, facing out; uv as the extrusion's side
  // walls (along the edge, 1 − z, z as before ext() lifted it by B)
  Object.keys(cut || {}).forEach((k) => { if (!cut[k].length) return;
    const sp = span[k]; if (!sp || sp.n !== 2) throw new Error("frameGeo: the " + k + " edge's band is not one quad");
    const E = edgeOf(s, k), V = (p) => new T.Vector2(p[0], p[1]);
    const rect = [[sp.a0, B], [sp.a1, B], [sp.a1, t - B], [sp.a0, t - B]], all = rect.concat(...cut[k]);
    T.ShapeUtils.triangulateShape(rect.map(V), cut[k].map((h) => h.map(V))).forEach((f) => {
      const q = f.map((j) => new T.Vector3(...E.at(all[j][0], all[j][1], 0)));
      const ix = q[1].clone().sub(q[0]).cross(q[2].clone().sub(q[0])).dot(new T.Vector3(...E.n)) < 0 ? [0, 2, 1] : [0, 1, 2];
      ix.forEach((j) => { const a = all[f[j]]; put(q[j].x, q[j].y, q[j].z, a[0], 1 - (a[1] - B)); });
    }); });
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  return toCreasedNormals(out, SMOOTH);
}

// a section [x, z] (front coords) extruded along y from y0 to y1, with an optional round hole [x, z, r] (segs: its steps
// per half turn, 24 unless given)
function prismY(T, pts, y0, y1, hole, segs) {
  const sh = new T.Shape(pts.map((q) => new T.Vector2(q[0], -q[1])));
  if (hole) sh.holes.push(new T.Path().absarc(hole[0], -hole[1], hole[2], 0, Math.PI * 2, false));
  const g = new T.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: segs || 24 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}

/* a half's end wall at the hinge, at the top (e = 1) or bottom (e = −1), in the frame body's own coords (z = 0 at its
   back face): what joins the ring (which starts at x FX) to the hinge. From outside only its outer part shows, and
   that is a plain end of the frame; the part that turns on the pivot pin is inside the spine cover, as on real book
   foldables. Three pieces, front coords across the hinge (x, depth):
   - the lid, from YB (where the cover ends in its plain end face, hinge.js) to the frame's end face: the end wall run
     on to the fold, in front of the cover's end. Its corner at the fold on the screen side is rounded to P about the
     half's pivot (P, −P): a point further than P from the pivot there would swing across the middle, into the other
     half's wall, as the phone shuts; at P the two walls roll on each other at the fold's middle, touching at every
     angle (with a hairline between them the screen showed through it from behind, part open). Below the pivot it
     ends straight, on the fold's middle (open flat the two walls meet there; shut, that edge is the frame's square
     end, with the spine cover's end showing below it), and its corner at the back is rounded
     about the pivot too, so it never stands out past the spine cover's back as the half turns. The end follows the
     frame's own end profile: from y = H/2 − B, where the frame's 1.15 bevel starts, each section is cut between the
     bevels toward the screen and the back at that y, and the edges toward the hinge are rounded, ER: over the last
     ER along y the section moves in by ER(1 − cos θ) as y runs ER sin θ (open flat, that round is the seam between
     the two walls; they touch through the rest of their thickness).
   - the body, from the end wall's inner face (YE) to YB, behind the cover's end face: beside and above the pivot (a
     point there only turns up and in as the phone shuts, never into the cover), and below the pivot's height only
     outside the cover's shoulder, NG off it, as the back plates are. Its top: just under the glass ears where they
     run (to y SY to H/2 − B − 0.2), the frame's top face (z 0) past them.
   - the knuckle, the same length: a disc of radius EL about the pivot, bored for the pivot pin (hinge.js). It turns
     inside the cover's shell and behind its end face, and never shows from outside; it is drawn in the dark look with
     the hinge's other hidden faces (build/shoot.py's mechanism check counts those pixels).
   Returns { body (the lid and the body), knuckle }. */
const ER = 0.25, BORE = 0.5, FX = 5.0;
// the cover's shoulder (its outline's right half) moved out by NG, from the rim down to 0.45 over the wall's back
function shoulderOff() {
  const h = coverOutline().filter((q) => q[0] >= 0), n = h.length, zl = 0.55 - GEO.t, out = [];
  for (let i = n - 1; i > 0; i -= 6) { const a = h[Math.max(0, i - 1)], b = h[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const q = [h[i][0] + (b[1] - a[1]) / l * HV.NG, h[i][1] - (b[0] - a[0]) / l * HV.NG];
    if (q[1] < zl) break; out.push(q); }
  return out;
}
function elbowGeo(T, s, e) {
  const { P, EL, YE, YB } = HV, LR = P, { t, B } = GEO, y1 = GEO.H / 2, y0 = y1 - B, ye = y1 - B - 0.2 + 0.02, xr = FX + B, RB = t - 0.1 - P;
  const mir = (pts) => pts.map((q) => [s * q[0], q[1]]);
  // (sections before the mirror: anticlockwise in x, z)
  const sh = shoulderOff(), a0 = Math.asin(0.1 / EL);
  const bodySec = (zt) => { const pts = [[xr, 0.1 - t], [xr, zt]], a1 = zt > EL - P ? Math.PI / 2 : Math.asin((zt + P) / EL);
    if (zt > EL - P) pts.push([P, zt]);
    for (let i = 0; i <= 10; i++) { const a = a1 + (a0 - a1) * i / 10; pts.push([P + EL * Math.cos(a), -P + EL * Math.sin(a)]); }
    pts.push([sh[0][0], 0.1 - P]); sh.forEach((q) => pts.push(q)); pts.push([sh[sh.length - 1][0], 0.1 - t]); return pts; };
  const along = (pts, ya, yz, hole, segs) => (e > 0 ? prismY(T, mir(pts), ya, yz, hole, segs) : prismY(T, mir(pts), -yz, -ya, hole, segs));
  const disc = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; disc.push([P + EL * Math.cos(a), -P + EL * Math.sin(a)]); }
  // the lid's section: the top face, the corner rounded about the pivot (LR), the straight end beside the fold, the
  // back corner rounded about the pivot (RB: the wall's back, straight under the pivot)
  const base = [[xr, 0.1 - t], [xr, 0], [P + 0.3, 0]], ac = Math.PI + Math.acos(LR / RB);
  for (let i = 0; i <= 10; i++) { const a = (96 + 84 * i / 10) * Math.PI / 180; base.push([P + LR * Math.cos(a), -P + LR * Math.sin(a)]); }
  for (let i = 0; i <= 6; i++) { const a = ac + (1.5 * Math.PI - ac) * i / 6; base.push([P + RB * Math.cos(a), -P + RB * Math.sin(a)]); }
  /* the lid, from YB out: rings of the section, each clamped between the frame's two bevels at its y (so it is the
     frame's own end profile), and moved in by the round's d on every edge but the one at xr, where it meets the ring
     (moved in there, it left a groove between them) */
  const n = base.length, sp = soup();
  const onXr = base.map((q, i) => Math.abs(q[0] - xr) < 1e-9 && Math.abs(base[(i + 1) % n][0] - xr) < 1e-9);
  // the frame's bevel (util.ext: a quarter circle of radius B in 7 steps) as [y, depth in from the face]; between its
  // steps the frame is flat, so the depth there is read off the straight line between them
  const bev = [];
  for (let b = 0; b <= 7; b++) { const th = b / 7 * Math.PI / 2; bev.push([y0 + B * Math.sin(th), B - B * Math.cos(th)]); }
  const depth = (y) => { if (y <= y0) return 0; for (let b = 1; b < bev.length; b++) if (y <= bev[b][0] + 1e-9) { const [ya, da] = bev[b - 1], [yz, dz] = bev[b]; return da + (dz - da) * (y - ya) / (yz - ya); } return B; };
  // rings where the lid starts, at the bevel's steps (so its bevels are the frame's own faces where the two meet at xr)
  // and where the round starts; the round's steps are the bevel's past that
  const ys = [YB].concat(bev.map((q) => q[0]), [y1 - ER]).sort((a, b) => a - b);
  const rings = ys.map((y) => {
    const u = y - (y1 - ER), d = u > 0 ? ER - Math.sqrt(Math.max(0, ER * ER - u * u)) : 0, dz = depth(y);
    return insetLoop(base, onXr.map((x) => (x ? 0 : d))).map((q) => [s * q[0], e * y, Math.min(-dz, Math.max(dz - t, q[1]))]); });
  // walls between rings (a point clamped onto a bevel may meet its neighbour: those triangles have no area, dropped)
  const tri = (a, b, c, w) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-9) sp.tri(a, b, c, w); };
  for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < n; j++) { const j1 = (j + 1) % n, A = rings[k], C = rings[k + 1];
    // (out: the edge's outward normal, its right as the unmirrored section runs, and along the end; from whichever ring
    // has the edge open)
    const [a, b] = Math.hypot(A[j1][0] - A[j][0], A[j1][2] - A[j][2]) > 1e-6 ? [A[j], A[j1]] : [C[j], C[j1]], l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (l < 1e-6) continue;
    const w = [s * (b[2] - a[2]) / l, e, -s * (b[0] - a[0]) / l];
    tri(A[j], A[j1], C[j1], w); tri(A[j], C[j1], C[j], w); }
  // the end face (the last ring, its repeated points dropped) and the face toward the inside (the first), which lies
  // on the cover's end face
  const face = (ring, dir) => T.ShapeUtils.triangulateShape(ring.map((q) => new T.Vector2(q[0], q[2])), []).forEach((f) => tri(ring[f[0]], ring[f[1]], ring[f[2]], [0, dir, 0]));
  face(rings[rings.length - 1].filter((q, j, r) => { const p = r[(j + r.length - 1) % r.length]; return Math.hypot(q[0] - p[0], q[2] - p[2]) > 1e-6; }), e);
  face(rings[0], -e);
  /* the lid's uv as the frame's own side walls' (along the edge, 1 − depth; along y on a face that looks across the
     hinge): the metal's grain then runs on from the rail's end across it (with a mapping of its own it showed as a
     smoother, lighter patch set into the rail) */
  const eg = sp.geo(T), ep = eg.attributes.position, eu = eg.attributes.uv, tv = new T.Triangle(), en = new T.Vector3();
  for (let v = 0; v < ep.count; v += 3) { tv.setFromAttributeAndIndices(ep, v, v + 1, v + 2).getNormal(en);
    for (let q = v; q < v + 3; q++) eu.setXY(q, Math.abs(en.x) < 0.7 ? ep.getX(q) : ep.getY(q), 1 - (ep.getZ(q) + t)); }
  const up = (g) => { g.translate(0, 0, t); return g.index ? g.toNonIndexed() : g; };
  return { body: mergeGeometries([along(bodySec(-0.26), YE, ye), along(bodySec(0), ye, YB), eg].map(up)),
    knuckle: up(along(disc, YE, YB, [s * P, -P, BORE], 8)) };
}
/* a half's two end walls at the hinge: [frame metal, dark]. Frame metal: the lids and the bodies, all but the bodies'
   faces toward the screen between the glass ears (their top face, short of YB): the small dark bumper at each end of
   the fold on the screen side (in frame metal they showed open flat as a pale tick between the ears). Dark: those,
   and the knuckles. Normals smooth round the circle, the bevels and the round (SMOOTH), sharp at the section's
   corners; body coords, so +z is the screen side. */
function elbowParts(T, s) {
  const el = [elbowGeo(T, s, 1), elbowGeo(T, s, -1)], g0 = mergeGeometries(el.map((x) => x.body)), g = toCreasedNormals(g0, SMOOTH);
  const p = g.attributes.position, nm = g.attributes.normal, uv = g.attributes.uv, out = [{ p: [], n: [], u: [] }, { p: [], n: [], u: [] }];
  const tri = new T.Triangle(), nv = new T.Vector3(), yb = HV.YB;
  for (let v = 0; v < p.count; v += 3) {
    tri.setFromAttributeAndIndices(p, v, v + 1, v + 2).getNormal(nv);
    const yc = Math.abs(p.getY(v) + p.getY(v + 1) + p.getY(v + 2)) / 3;
    // (only the top face: the face that follows the cover's shoulder also looks toward the screen, and shows from behind
    // through the hairline beside the cover, where it must be metal, not a black line)
    const zc = (p.getZ(v) + p.getZ(v + 1) + p.getZ(v + 2)) / 3, o = out[nv.z > 0.05 && Math.abs(nv.y) < 0.2 && yc < yb && zc > GEO.t - 0.4 ? 1 : 0];
    for (let q = v; q < v + 3; q++) { o.p.push(p.getX(q), p.getY(q), p.getZ(q)); o.n.push(nm.getX(q), nm.getY(q), nm.getZ(q)); o.u.push(uv.getX(q), uv.getY(q)); } }
  g0.dispose(); g.dispose();
  const b = out.map((o) => { const x = new T.BufferGeometry(); x.setAttribute("position", new T.Float32BufferAttribute(o.p, 3));
    x.setAttribute("normal", new T.Float32BufferAttribute(o.n, 3)); x.setAttribute("uv", new T.Float32BufferAttribute(o.u, 2)); return x; });
  return [b[0], mergeGeometries([b[1]].concat(el.map((x) => x.knuckle)))];
}

/* ---------- the camera island ---------- */
// a profile [inset from the outline, height] swept round a rounded rectangle w × h, corner r, centred at 0, n steps per
// corner; each band faces the profile's outer side (out of the island as the profile runs from the base up and in)
function rimSweep(T, w, h, r, prof, n) {
  const sp = soup(), rings = prof.map(([d, z]) => rrRing(w - 2 * d, h - 2 * d, r - d, 0, 0, n).map((q) => [q[0], q[1], z])), m = rings[0].length;
  for (let k = 0; k + 1 < prof.length; k++) { const dd = prof[k + 1][0] - prof[k][0], dz = prof[k + 1][1] - prof[k][1];
    for (let j = 0; j < m; j++) { const j1 = (j + 1) % m, a = rings[k][j], ol = Math.hypot(a[0], a[1]) || 1;
      sp.quad(a, rings[k][j1], rings[k + 1][j1], rings[k + 1][j], [a[0] / ol * dz, a[1] / ol * dz, dd]); } }
  return sp.geo(T);
}
// a profile [radius, height] turned about the z axis, at (x, y, z): LatheGeometry turns about y, so it is stood up
// (+z its height). Visible from the side to the right of the profile's run, as three.js draws a lathe
function latheZ(T, pts, n, x, y, z) {
  const g = new T.LatheGeometry(pts.map((q) => new T.Vector2(q[0], q[1])), n); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g;
}
const nonIx = (g) => (g.index ? g.toNonIndexed() : g);

export function buildExterior(ctx) {
  const T = ctx.T, { panel, deck } = ctx.G, mk = ctx.mk;
  const { H, t, L, R, RH, B, DB, OZ, CWd, CHt, CY, CX, KR, KH, ROWS } = GEO;
  // hinge-side inset of the outer plates: they stop at x = P, straight under the half's pivot (hinge.js), so
  // as the half turns its back edge stays a hairline off the spine cover's shoulder; open, the cover's ridge fills the
  // 3.6 mm between the two halves' plates (less the bevel, which ends the plate at P)
  const span = keyLayout(), HE = HV.P + 0.1;
  // the glass ears' copy of the black glass: their top shares the frame end walls' top face (z 0), so it is drawn
  // pulled toward the camera (polygon offset, as the antenna bands) and wins the tie; it showed grey patches there
  const earMat = mat("glassBlack").clone(); Object.assign(earMat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  S.keyMat = mat("keycap");
  // before the maps go on (see the keycaps below). The sides are a touch glossier than the soft-touch tops
  S.keyPlain = S.keyMat.clone(); S.keyPlain.color.set(fin().key); S.keyPlain.roughness = 0.38;
  Object.assign(S.keyMat, { map: keysTex(T, false), emissiveMap: keysTex(T, true), bumpMap: keysBump(T), bumpScale: 0.1 });
  S.keyMat.color.setHex(0xffffff); S.keyMat.emissive.setHex(0xffffff); S.keyMat.needsUpdate = true;
  setBacklight();

  /* deck outer face. The deck's plates are turned over (rotation.x = π), so in their shape frame a front-coord point
     (xf, yf) sits at (−xf, −yf). The keyboard pocket is 71.3 × 29.5, r 3.6, around the keys. */
  const PW = span + 2.6, PH = (ROWS[0] - ROWS[3]) + KH + 2.6, PCY = (ROWS[0] + ROWS[3]) / 2;
  // (as a hole, at its own corner steps: the plates round it have 9.2 mm corners that need 28, util.polyHole)
  function pocket(hole, d) { d = d || 0; const p = rrAt(T, PW - 2 * d, PH - 2 * d, 3.6 - d, -L / 2, -PCY, hole); return hole ? polyHole(T, p, curveSegs(3.6 - d)) : p; }

  // the antenna bands' plastic: drawn pulled toward the camera, so they win over the frame face just under them
  const antBand = mat("antennaBand"); Object.assign(antBand, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });

  [panel, deck].forEach((G, i) => { const s = i ? -1 : 1, leaf = i ? "deck" : "panel";
    // the frame is a hollow ring, open over the hinge, so the parts inside show once the covers come off. Its edge
    // openings are cut into it; their lit rims are part of it
    // (build/shoot.py --selftest: with the end walls at the fold drawn in the dark look, the fold-end check, the
    // mechanism check and the see-through check must fail)
    const op = edgeOpenings(T, s), elb = elbowParts(T, s), darkEnd = params.fc_fail === "foldend";
    const body = mk(mergeGeometries([frameGeo(T, s, op.cut)].concat(darkEnd ? [] : [elb[0]], [op.rim.geo(T)]).map(nonIx)), mat("frame"), G); body.position.z = -t;
    // (the knuckles and the dark bumpers: part of the frame for the Mechanical view, by name, and see-through with it)
    const eb = mk(darkEnd ? mergeGeometries([elb[1], elb[0]].map(nonIx)) : elb[1], mat("endCap"), G, false); eb.position.z = -t; eb.name = "frame.elbow-" + leaf;
    /* the openings' insides, the antenna bands and the gasket lines: one mesh per material per half (the speaker grille
       on its own, for the stills that aim at it). Pieces of the outside that only High detail draws in the exploded view
       (detail 2, as the old openings' looks in FC_PARTS.detail), so the Simple view draws no more than before; they stay
       with the frame when the covers come off. */
    const edgeMesh = (sp, m, name) => { if (!sp.p.length) return null; const e = mk(sp.geo(T), m, G, false); e.position.z = -t; e.name = "edge." + name + "-" + leaf; e.userData.detail = 2; return e; };
    mark(edgeMesh(op.grille, mat("portCavity"), "grille"), { grille: i ? "top" : "bot" });
    edgeMesh(op.dark, mat("portCavity"), "openings");
    // (the tongue: what the `usb` still aims at)
    const tg = edgeMesh(op.tongue, mat("usbTongue"), "usb-tongue"); if (tg) mark(tg, { usb: true });
    edgeMesh(op.lip, mat("steelPolished"), "usb-lip");
    edgeMesh(antennaBands(T, s), antBand, "antenna");
    /* gasket lines on the frame's caps: the screen glass (its edge at inset B + 0.1, 0.12 proud) meets the cap
       from inset B; the back glass and the keyboard half's outer plate (edge at B + 0.2, 0.2 proud) likewise on the back.
       On the keyboard half the line also stands up the outer plate's edge, 0.1 tall: the seam under the face plate. The
       screen side's runs to where the glass ends (W1 + 0.1); the back's stops 10.5 short of the hinge, clear of the
       spine's dark-slot and slot-width checks (build/shoot.py), where the plates meet the spine cover instead. */
    { const sp = soup();
      gasketStrip(sp, s, B + 0.02, B + 0.13, HV.W1 + 0.1, t + 0.004, 1);
      gasketStrip(sp, s, i ? B + 0.02 : B + 0.12, B + 0.24, 10.5, -0.004, -1);
      if (i) gasketStrip(sp, s, B + 0.195, 0, 10.5, -0.104, -1, 0.1);
      edgeMesh(sp, mat("gasket"), "gasket"); }
    /* inner walls across the hinge zone, x 5.3–5.5, up from the back plate: to z −2.0 between the hinge modules (the
       hinge flex cables pass over it there) and to z −3.4 under each module's swing arm. Through the hairline between
       the spine cover and a half they show frame metal, not the half's insides; the screen's loop, the wing plates and
       the arms clear them at every angle (hinge.js). */
    { const ys = [-59.33, -53.6, -32.4, -10.6, 10.6, 32.4, 53.6, 59.33], wg = [];
      for (let k = 0; k + 1 < ys.length; k++) { const top = k % 2 ? -3.4 : -2.0, y0 = ys[k] + 0.2, y1 = ys[k + 1] - 0.2;
        wg.push(new T.BoxGeometry(0.2, y1 - y0, top + 5.34).translate(s * 5.4, (y0 + y1) / 2, (top - 5.34) / 2)); }
      mk(mergeGeometries(wg), mat("frame"), G).name = "frame.hinge-wall-" + leaf; }
    // the half's own screen (glass, display) stops at x = W1; from there to the other half the strip carries it (hinge.js)
    const ig = mk(ext(T, leafShape(T, s, B + 0.2, R, RH, HV.W1 + 0.1), 0.24, 0.1, 3), mat("glassBlack"), G, false); ig.position.z = -0.12;
    /* past the strip's ends (|y| > SY) the glass runs on toward the hinge as two ears, so the top and bottom bezels stay
       black across the fold. Their top is the frame's (z 0), not the glass's (0.12): near the pivot, a corner 0.12 proud
       would swing 0.12 past the other half's as the phone shuts. Their inner ends (stopped at x P + 0.1, they left a
       3.8 mm notch in the bezel at each end of the fold; real phones show about 1 mm): the top face runs to the pivot's x, then the end curves down and in on a circle of radius P − 0.03 about the pivot to 0.8
       below the face, the black mask's edge reaching x 0.35. A point within P of its pivot never passes the screens'
       meeting plane (x 0) as the half turns, so the two halves' ears never meet but there (the sweep, hinge.js); the
       spine's end plates sit lower to let their deep corners by when shut. What shows between them, 0.7 mm across, is
       the knuckles' rounded tops, dark, the small step real phones show. */
    { const y0 = HV.SY + 0.02, y1 = H / 2 - B - 0.2, P = HV.P, Rm = P - 0.03, d = 0.8, x1 = HV.W1 + 0.1, a1 = Math.PI - Math.asin((P - d) / Rm), sec = [[x1, 0], [P, 0]];
      for (let k = 0; k <= 12; k++) { const a = Math.PI / 2 + (a1 - Math.PI / 2) * k / 12; sec.push([P + Rm * Math.cos(a), -P + Rm * Math.sin(a)]); }
      sec.push([P + 0.1, -d], [P + 0.1, -0.24], [x1, -0.24]);
      const ms = sec.map((q) => [s * q[0], q[1]]), eg = [prismY(T, ms, y0, y1), prismY(T, ms, -y1, -y0)];
      const ears = mk(mergeGeometries(eg), earMat, G, false); ears.name = "screen.ears-" + leaf; tag(ears, "screen", 5, { leaf }); }
    const dsh = leafShape(T, s, DB, R, 0.02, HV.W1), dg = new T.ShapeGeometry(dsh, 28), DW = L - DB, DH = H - 2 * DB;
    flatUV(dg, (x, y) => [0.5 + x / (2 * DW), (y + DH / 2) / DH]);
    const dm = mk(dg, S.dispMat, G, false); dm.position.z = 0.125;
    /* outer plate: the panel's back, the deck's outer plate under the face plate (with the keyboard pocket open). On the
       hinge side it runs out to 0.05 from the hinge line (HE less its bevel), closing the face over the cut frame wall. */
    const os = leafShape(T, s, B + 0.3, R, RH, HE);
    if (i) os.holes.push(pocket(true));
    const of = mk(ext(T, os, 0.26, 0.1, 3), mat(i ? "face" : "back"), G);
    of.rotation.x = Math.PI; of.position.z = -t + 0.06;
    tag(ig, "screen", 5, { leaf }); tag(dm, "screen", 5, { leaf }); tag(of, i ? "cover" : "back", i ? -5.6 : -5.5, { leaf });
  });

  // deck face plate
  const FZ = OZ + 0.02 - 1.25;   // face plate surface (−6.83)
  { const sh = leafShape(T, -1, B + 0.3, R, RH, HE + 0.12); sh.holes.push(pocket(true));   // hinge edge at P (its 0.22 bevel), as the plate under it
    // cover-screen opening: its narrowest edge (after the 0.22 bevel) is 70.1 × 80.4, r 6.5, so the cover OLED fits
    sh.holes.push(rrAt(T, 70.1 + 0.44, 80.4 + 0.44, 6.5 + 0.22, -CX, -CY, true));
    // earpiece slot, above the cover screen over the top speaker box (x 45–55): 10 × 0.7 at the face, its 0.22 rounded
    // edge narrowing it to a 0.26 slit below; a dark floor 0.5 down (the slot mesh below)
    sh.holes.push(polyHole(T, rrAt(T, 10, 0.7, 0.35, -50, -60, true), 8));
    // (3 steps round its 0.22 mm bevel: 4 cost triangles that did not show)
    const pl = mk(ext(T, sh, 1.25, 0.22, 3), mat("face"), deck); pl.rotation.x = Math.PI; pl.position.z = OZ + 0.02; tag(pl, "cover", -5.6, { leaf: "deck" }); }
  const cg = mk(ext(T, rrShape(T, CWd + 1.6 - 0.2, CHt + 1.6 - 0.2, 7.1), 0.3, 0.1, 3), mat("glassBlack"), deck, false);
  cg.rotation.x = Math.PI; cg.position.set(-CX, CY, OZ - 1.15);
  const cgeo = new T.ShapeGeometry(rrShape(T, CWd, CHt, 6.3), 28); flatUV(cgeo, (x, y) => [x / CWd + 0.5, y / CHt + 0.5]);
  const cs = mk(cgeo, S.coverMat, deck, false); cs.rotation.y = Math.PI; cs.position.set(-CX, CY, OZ - 1.47);
  tag(cg, "coverscreen", -6.2, { leaf: "deck" }); tag(cs, "coverscreen", -6.2, { leaf: "deck" });

  /* key web: a body-coloured plate filling the pocket, z [−6.23, −5.58], one opening per key (key + 0.15 all round).
     The 0.08 bevel grows the outline and shrinks the openings, so the shapes are drawn 0.08 smaller / larger. */
  { const wb = 0.08, ws = pocket(false, wb);
    S.keys.forEach((k) => ws.holes.push(rrAt(T, k.w + 0.3 + 2 * wb, k.h + 0.3 + 2 * wb, KR + 0.15 + wb, -k.x, -k.y, true)));
    // one step round the 0.08 mm bevel (was 2): 40 key openings × 2 bevels × the steps were 13k triangles
    const web = mk(extLo(T, ws, 0.65, wb, 1, 6), mat("web"), deck); web.rotation.x = Math.PI; web.position.z = OZ + 0.02;
    mark(web, { kbd: true }); tag(web, "cover", -5.6, { leaf: "deck" });
    /* gasket line round the pocket's edge, on the web's top (0.6 under the face plate's surface), where the face
       plate's hole wall meets it: that wall stands 0.22 inside the pocket's outline there (past its 0.22 bevel). A child
       of the web, so it lifts off with it; High detail only in the exploded view (detail 2). */
    const rs = pocket(false, 0.2); rs.holes.push(pocket(true, 0.34));
    const pr = new T.Mesh(new T.ShapeGeometry(rs, 8), mat("gasket")); pr.position.z = 0.654; pr.userData.detail = 2; pr.name = "edge.gasket-pocket";
    web.add(pr); mark(pr, { kbd: true }); }

  /* keycaps: one merged mesh, z [−6.63, −5.58]: tops 0.2 below the face plate, 0.4 above the web. Two material groups
     (one draw call each): the legend picture only on the faces that look outward (the crowns and the top of the
     bevel), the plain key colour on the sides and undersides, so from inside (kbdstack, exploded) no mirrored legend
     shows. The plain one is a copy of the same tier's keycap material, so Low stays cheap. */
  { const KB = S.KB, kd = 1.05, kb = 0.42, top = { p: [], n: [], u: [] }, rest = { p: [], n: [], u: [] };
    const tri = new T.Triangle(), nv = new T.Vector3();
    S.keys.forEach((k) => {
      // 4 steps round the 0.42 mm crown bevel (at 5 the 40 keys were 32k triangles, a third of the closed phone; 3 steps
      // showed as bands in the bevel's highlight in the `usb` close-up)
      const geo = extLo(T, rrShape(T, k.w - 2 * kb, k.h - 2 * kb, KR - kb), kd, kb, 4, 8);
      flatUV(geo, (gx, gy) => [(k.x - gx - KB.x0) / KB.W, (k.y - gy - KB.y0) / KB.H]);
      geo.rotateX(Math.PI); geo.translate(-k.x, k.y, OZ + 0.02);
      const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
      for (let v = 0; v < P.count; v += 3) {
        tri.setFromAttributeAndIndices(P, v, v + 1, v + 2).getNormal(nv);
        const o = nv.z < -0.5 ? top : rest;   // the deck's outer side is −z
        for (let q = v; q < v + 3; q++) { o.p.push(P.getX(q), P.getY(q), P.getZ(q)); o.n.push(N.getX(q), N.getY(q), N.getZ(q)); o.u.push(U.getX(q), U.getY(q)); } }
      geo.dispose(); });
    const caps = new T.BufferGeometry(), nt = top.p.length / 3;
    caps.setAttribute("position", new T.Float32BufferAttribute(top.p.concat(rest.p), 3));
    caps.setAttribute("normal", new T.Float32BufferAttribute(top.n.concat(rest.n), 3));
    caps.setAttribute("uv", new T.Float32BufferAttribute(top.u.concat(rest.u), 2));
    caps.addGroup(0, nt, 0); caps.addGroup(nt, rest.p.length / 3, 1);
    const m = mk(caps, [S.keyMat, S.keyPlain], deck);
    mark(m, { kbd: true, keycap: true }); tag(m, "cover", -5.0, { leaf: "deck" }); }

  // earpiece slot's dark floor, 0.5 into the face plate (its slit there is 9.56 × 0.26)
  const ear = mk(new T.ShapeGeometry(rrShape(T, 9.8, 0.5, 0.25), 6), mat("port"), deck, false);
  ear.rotation.y = Math.PI; ear.position.set(-50, 60, FZ + 0.5); tag(ear, "cover", -5.6, { leaf: "deck" });

  /* side keys on the panel's free edge (the right half when open), in their slots (edgeOpenings: 0.1 gap all round).
     Volume 2.0 × 18 in frame metal, standing 0.25 proud, its edges rounded 0.15; power and fingerprint 2.6 × 12, flat,
     its top 0.15 below the edge in its slot, in a matte copy (a fingerprint pad). Built along +z, then turned so +z points
     out of the edge: [y, width, length, depth, bevel, top (+ proud), material]. */
  const matte = mat("frame").clone(); matte.roughness = 0.6;
  onFinish(() => { matte.color.copy(mat("frame").color); invalidate(); });
  [[35, 2.0, 18, 1.3, 0.15, 0.25, mat("frame")], [14, 2.6, 12, 1.0, 0.06, -RIM, matte]].forEach(([y, w, len, d, bv, top, m]) => {
    const g = ext(T, rrShape(T, w - 2 * bv, len - 2 * bv, w / 2 - bv), d, bv, bv > 0.1 ? 4 : 2, 8); g.translate(0, 0, top - d); g.rotateY(Math.PI / 2);
    const b = mk(toCreasedNormals(g, SMOOTH), m, panel); b.position.set(L, y, -t / 2);
    mark(b, { sidekey: true }); tag(b, "frame", 0, { slide: [6, 0, 0], leaf: "panel" }); });

  /* rear camera island on the panel leaf, 25 × 47, 1.8 tall, corners 8.5. Built in its own
     frame (x as front coords from its centre, y the other way, z out of the back glass: each mesh is turned over, as
     the plates), one mesh per material:
     - islandRim: the machined metal rim, a wall rounded over at 0.6 radius into a 0.2 flat (so in profile it reads as
       a machined part, not a square slab), and the three polished lens rings;
     - island: the glossy black glass top inside the rim, a hole under each ring;
     - lensBarrel: behind each ring a stepped black barrel, 2.2 deep from the ring's lip: the cover glass's seat, then
       three treads down a cone, each tread a thin ring of light, each riser dark; and the two small windows (the
       laser-focus sensor and the mic);
     - lensGlass: each ring's cover glass, 0.3 under its lip, clear: drawn adding its reflections over what is behind
       (additive blending), so the barrel shows through it and the softboxes glint off it;
     - lens: at the barrel's foot the front lens, a shallow dome (its highlight moves as the phone turns) carrying the
       coated-lens picture with its blue-purple glint. The periscope (the middle one) is visibly another camera: a
       rounded-square prism window in a flat black mask;
     - flashLens: the flash's ringed lens over its yellow LED.
     Thickness at the camera stays 15.5: the rings top out 3.03 over the back glass, as before. */
  const IX = L - 17.5, IY = H / 2 - 29, IW = 25, IH = 47, IR = 8.5, IT = 1.8, bk = { leaf: "panel" };
  const lensAt = [[3.6, -12.6], [3.6, 0], [3.6, 12.6]], RL = 4.2, U0 = IT - 0.02, PERI = 1, LS = 64;   // (rings sit 0.02 into the top)
  const isle = (geo, m, shadow) => { const o = mk(geo, m, panel, shadow); o.rotation.x = Math.PI; o.position.set(IX, IY, OZ + 0.02); tag(o, "back", -5.5, bk); return o; };
  // lens ring: an outer band 0.15 lower than the inner band, then the bezel lip (radius RL, 1.0 up) down into the barrel
  const ringP = [[RL - 0.05, 0], [RL + 1.0, 0], [RL + 1.2, 0.2], [RL + 1.2, 0.98], [RL + 1.08, 1.1], [RL + 0.8, 1.1], [RL + 0.72, 1.25], [RL + 0.35, 1.25], [RL, 1.0]];
  // the rim: up the wall, a quarter round of 0.6 over 5 steps, a 0.2 flat (the glass top runs on from inset 0.79)
  const rimP = [[0, 0], [0, IT - 0.6]];
  for (let k = 1; k <= 5; k++) { const a = k / 5 * Math.PI / 2; rimP.push([0.6 - 0.6 * Math.cos(a), IT - 0.6 + 0.6 * Math.sin(a)]); }
  rimP.push([0.8, IT]);
  // (the rings' small chamfers at hard edges too: blended across, their highlights broke into specks at High)
  const isl = isle(mergeGeometries([rimSweep(T, IW, IH, IR, rimP, 12)].concat(lensAt.map(([x, y]) => toCreasedNormals(latheZ(T, ringP, LS, x, y, U0), SMOOTH))).map(nonIx)), mat("islandRim"));
  /* gasket line round the island's base, on the back glass (0.02 under the island's base): from 0.03 under the
     island to 0.05 out, a hairline (at 0.15 out it read as a drawn black outline). A child of
     the island, so it lifts off with it; High detail only in the exploded view. */
  { const rs = rrShape(T, IW + 0.1, IH + 0.1, IR + 0.05); rs.holes.push(rrAt(T, IW - 0.06, IH - 0.06, IR - 0.03, 0, 0, true));
    const ir = new T.Mesh(new T.ShapeGeometry(rs, 10), mat("gasket")); ir.position.z = 0.024; ir.userData.detail = 2; ir.name = "edge.gasket-island";
    isl.add(ir); }
  // glass top: from 0.79 in (0.01 under the rim's flat), 0.003 over it; the holes (radius RL + 0.6) are under the rings
  { const sh = new T.Shape(rrRing(IW - 1.58, IH - 1.58, IR - 0.79, 0, 0, 12).map((q) => new T.Vector2(q[0], q[1])));
    lensAt.forEach(([x, y]) => sh.holes.push(new T.Path().absarc(x, y, RL + 0.6, 0, Math.PI * 2, false)));
    isle(new T.ShapeGeometry(sh, 12).translate(0, 0, IT + 0.003), mat("island"), false); }
  /* barrels: [radius, height over the rings' base]: the lip, the glass's seat 0.38 down, then three narrow black treads
     stepping in to the front lens, 2.2 under the lip (1.2 into the island, 0.6 clear of the back glass), each riser
     near upright. Each corner is its own hard edge (creased normals, SMOOTH): blended across, the steps read as one
     grey funnel round a small lens. The front lens (radius RL − 0.9, most of the opening, as a
     real camera's) closes each barrel: a dome 0.85 high (a sphere's cap, radius 6.8: a softbox shows in it as a
     highlight, not a wash across it), its picture mapped flat across it; the periscope's is a flat black mask with the
     prism's window, 4 × 4, corners 0.7. Ring, barrel, glass and lens all at LS steps round, so their shared edges meet
     point for point: at 64, 48 and 32 they left pinholes along the ring's inner edge and the lens's rim at High. */
  const FR = RL - 0.9, FZ0 = U0 - 1.2, barP = [[RL, 1.0], [RL, 0.62], [RL - 0.3, 0.62], [RL - 0.38, 0.1], [RL - 0.58, 0.1], [RL - 0.66, -0.45], [RL - 0.82, -0.45], [FR, -1.2]];
  const DR = (FR * FR + 0.85 * 0.85) / 1.7, domeP = [1, 0.8, 0.6, 0.4, 0.2, 0].map((f) => [FR * f, Math.sqrt(DR * DR - FR * FR * f * f) - Math.sqrt(DR * DR - FR * FR)]);
  const lensUV = (g, x, y) => flatUV(g, (gx, gy) => [(gx - x) / (2 * FR) + 0.5, (gy - y) / (2 * FR) + 0.5]);
  const disc = (r, n, x, y, z) => new T.CircleGeometry(r, n).translate(x, y, z);
  const bars = [], glass = [], fronts = [];
  lensAt.forEach(([x, y], i) => {
    bars.push(toCreasedNormals(latheZ(T, barP, LS, x, y, U0), SMOOTH));
    glass.push(disc(RL, LS, x, y, U0 + 0.7));
    if (i === PERI) { bars.push(disc(FR, LS, x, y, FZ0)); fronts.push(lensUV(new T.ShapeGeometry(rrAt(T, 4, 4, 0.7, x, y), 4).translate(0, 0, FZ0 + 0.01), x, y)); }
    else fronts.push(lensUV(latheZ(T, domeP, LS, x, y, FZ0), x, y)); });
  // the laser-focus window and the mic, on the glass top beside the lenses
  bars.push(disc(1.15, 24, -7.8, -1, IT + 0.013), disc(0.4, 12, -7.8, 8, IT + 0.013));
  isle(mergeGeometries(bars.map(nonIx)), mat("lensBarrel"), false);
  isle(mergeGeometries(fronts.map(nonIx)), mat("lens"), false);
  /* (clear glass: what is behind shows, its reflections add on top, at half strength: a camera's cover glass is
     anti-reflection coated, and at full strength each lens read milky grey in the `back` stills. Only these lenses use
     lensGlass) */
  Object.assign(mat("lensGlass"), { transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5 });
  isle(mergeGeometries(glass.map(nonIx)), mat("lensGlass"), false);
  isle(disc(1.7, 32, -7.8, -9, IT + 0.013), mat("flashLens"), false);

  /* Set the hinge angle (0 = folded, 180 = open flat) and report the live bounding box. The hinge (hinge.js): each half
     turns by φ = (180° − angle) / 2 about its own pivot, the panel about (P, −P), the deck about (−P, −P) in the spine's
     frame. The panel stays put, so the spine turns by φ about the panel's pivot and the deck by φ more about its own.
     three.js turns +y as a clockwise turn in this x–z view: rotation.y = φ is the spine turning about P_A the way the
     panel closes. Size: the halves' corners and the cover's outline (hinge.coverOutline), as placed. */
  const spineG = ctx.G.spine, PA = [HV.P, -HV.P], PB = [-HV.P, -HV.P], COV = coverOutline();
  const rotY = (q, a) => [q[0] * Math.cos(a) + q[1] * Math.sin(a), -q[0] * Math.sin(a) + q[1] * Math.cos(a)];   // three's turn about y
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  S.setFold = (deg) => {
    if (Math.abs(deg - S.ang) > 0.01) S.lastMove = performance.now();
    S.ang = deg; const f = (180 - deg) / 360 * Math.PI;
    // spine: P_A stays where the panel's pivot is; deck: P_B stays where the spine's P_B is
    const sp = sub(PA, rotY(PA, f)), dp = add(sub(add(sp, rotY(PB, f)), rotY(PB, 2 * f)), [0, 0]);
    // (x is also kept in userData.foldX: the teardown adds its exploded sideways move to it each frame, teardown.js)
    spineG.rotation.y = f; spineG.position.set(sp[0], 0, sp[1]); spineG.userData.foldX = sp[0];
    deck.rotation.y = 2 * f; deck.position.set(dp[0], 0, dp[1]); deck.userData.foldX = dp[0];
    updateHinge(deg);
    const pts = [[0, -t - 0.2], [L, -t - 0.2], [0, 0.12], [L, 0.12]];
    [[-L, -t - 1.45], [0, -t - 1.45], [-L, 0.12], [0, 0.12]].forEach((p) => pts.push(add(rotY(p, 2 * f), dp)));
    COV.forEach((p) => pts.push(add(rotY(p, f), sp)));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
    S.center = [-(x0 + x1) / 2, -(z0 + z1) / 2];
    const dx = x1 - x0, dz = z1 - z0, wv = Math.max(dx, dz), dv = Math.min(dx, dz);
    stEl.textContent = deg < 2 ? "Folded" : (deg > 178 ? "Open" : "Flex · " + Math.round(deg) + "°");
    dimEl.textContent = wv.toFixed(1) + " × " + H.toFixed(1) + " × " + dv.toFixed(1) + " mm";
    angEl.textContent = Math.round(deg) + "°";
    if (Math.abs(+slider.value - deg) > 0.6) slider.value = deg;
    if (playBtn) playBtn.textContent = deg < 90 ? "Open ▸" : "Close ▸";
    invalidate();
  };
  S.setFold(0);
}

$("t-backlight").addEventListener("change", (e) => { props.keyBacklight = e.target.checked; setBacklight(); });
