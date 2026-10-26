/* Fold Communicator — the outside: leaf bodies, glass, cover screen, keys and key web, side keys, edge openings,
   antenna breaks, camera island, and the fold itself. Owner after B0: B6. Positions are front coords (parts.js); the
   deck mirrors x. Exploded levels and openings follow BUILD-SPEC 6.4. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { props, S, GEO, fin, onFinish, invalidate } from "./state.js";
import { $, cv, tex, rrShape, leafShape, ext, curveSegs, polyHole, shapePoints, flatUV, mark } from "./util.js";
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
  const fr = [["123", null, KW], ["0", "ctrl", KW], ["⌕", null, KW], [null, null, span - 6 * KW - 6 * (PX - KW)], ["G", null, KW, 1], ["☺", "alt", KW], ["123", null, KW]];
  let fx = L / 2 - span / 2; fr.forEach((k) => { keys.push({ x: fx + k[2] / 2, y: ROWS[3], w: k[2], h: KH, ch: k[0], sub: k[1], red: !!k[3] }); fx += k[2] + (PX - KW); });
  S.keys = keys;
  return span;
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
    else if (k.ch) { g.fillStyle = main; g.font = (k.ch.length > 2 ? "500 32px" : "500 46px") + " 'IBM Plex Sans',sans-serif"; g.fillText(k.ch, cx, cy + 2); }
  });
  return tex(T, c);
}
// key crowns: one soft dome per key over its flat top (height 1 − r², white = high), same layout as the legends
function keysBump(T) {
  const KB = S.KB, P = 10, c = cv(KB.W * P, KB.H * P), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  S.keys.forEach((k) => { const cx = (k.x - KB.x0) * P, cy = (KB.y0 + KB.H - k.y) * P;
    g.save(); g.translate(cx, cy); g.scale((k.w / 2 - 0.42) * P, (k.h / 2 - 0.42) * P);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((r) => { const v = Math.round(255 * (1 - r * r)); gr.addColorStop(r, "rgb(" + v + "," + v + "," + v + ")"); });
    g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore(); });
  return tex(T, c, { color: false });
}
function setBacklight() { if (S.keyMat) S.keyMat.emissive.setScalar(props.keyBacklight === false ? 0 : 0.55); invalidate(); }
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

/* leaf frame (front coords, s = −1 mirrors x): a hollow ring whose hinge side is cut away, so the hinge shows once the
   screen or the back comes off (B6b). Hinge v2: the ring starts at x = P + 0.6 (P: the half's pivot, hinge.js) all the
   way round, end walls included: inside x < P each half turns about (P, −P), and a corner left square there would swing
   across the other half (research §11.2 item 3). The end walls' hinge ends are the elbows (elbowGeo). The cut runs the full
   straight wall (|y| < 59.33) and the top and bottom walls stay closed. Built from the ring's extrusion: drop its caps
   and the two long hinge-side faces, add caps for the C-shaped outline and an end face across each cut.
   Both outlines run clockwise, so the bevel moves the wall's outer and inner faces together: the wall stays 1.45 thick
   through its depth on both halves. (A plain ring made the panel's walls bulge 2.3 mm inward at mid-depth and fold
   over at the hinge-side corners, and turned the deck's inner faces inside out.) */
function frameGeo(T, s) {
  const { B, R, RH, t } = GEO;
  // each corner at its own step count (the 9.2 mm outer corners 28, the 1.6 mm hinge-side corners 8, util.shapePoints)
  const loop = (sh) => { const p = shapePoints(sh); if (p[0].distanceTo(p[p.length - 1]) < 1e-9) p.pop(); return T.ShapeUtils.isClockWise(p) ? p : p.reverse(); };
  // the outline's hinge side at x = P + 0.6 (its square corners there meet the elbows, clear of the pivot pin's 0.4
  // radius), the hole's 1.45 further in
  const O = loop(leafShape(T, s, B, R, 0.05, HV.P + 0.6 + B)), I = loop(leafShape(T, s, 2.6, R, RH, HV.P + 0.6 + B + 1.45)), m = I.length;
  // the hinge-side straight edge of a loop: the pair (k, k + 1) on the hinge side, one end above and one below
  const gap = (P) => P.findIndex((a, k) => { const b = P[(k + 1) % P.length]; return Math.abs(a.x) < 6 && Math.abs(b.x) < 6 && a.y * b.y < 0; });
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
  for (let v = side.start; v < side.start + side.count; v += 3) {
    let lo = false, hi = false, near = true;
    for (let k = 0; k < 3; k++) { const y = gp.getY(v + k); if (y > 50) hi = true; if (y < -50) lo = true; if (Math.abs(gp.getX(v + k)) > 6) near = false; }
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
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); out.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  out.computeVertexNormals();
  return out;
}

// a section [x, z] (front coords) extruded along y from y0 to y1, with an optional round hole [x, z, r]
function prismY(T, pts, y0, y1, hole) {
  const sh = new T.Shape(pts.map((q) => new T.Vector2(q[0], -q[1])));
  if (hole) sh.holes.push(new T.Path().absarc(hole[0], -hole[1], hole[2], 0, Math.PI * 2, false));
  const g = new T.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}

/* elbow: the end wall's hinge end on one half, at the top (e = 1) or bottom (e = −1), in the frame body's own coords
   (z = 0 at its back face). Its section across the hinge is the half-disc of radius EL about the half's pivot (P, −P)
   on the hinge side, so it turns inside its own circle and never crosses the other half's (research §11.2 item 3),
   then straight out along the end wall into the ring to P + 0.6 + B, over the ring's rounded hinge-side edge, so the
   rail's end and the elbow are one face from the end (FABLE-REVIEW-2 N3: the elbows read as two separate rounded
   pills, outlined by their own 0.4 rounding and the groove beside them). Its top: just under the glass ears where they
   run (to y SY to H/2 − B − 0.2), the frame's top face (z 0) past them. A point beside the pivot (x ≥ P) may stand as
   high as the screen's face: as the half turns it only comes down toward the screens' meeting plane, never past it.
   Below the half-disc, from P + 0.5 (clear of the spine's end cap, which reaches P + 0.4) it runs down to 0.3 short of
   the back face, filling the ring's rounded bottom edge beside the cap; those points only ever turn away from the cap.
   A bore for the pivot pin (hinge.js) runs to 0.75 short of the end face. It runs from the end wall's inner face (YE)
   to the end face, flat, like the ring's end. The spine's end caps (hinge.js) sit below the two elbows, outside
   radius LR. */
function elbowGeo(T, s, e) {
  const { P, EL, YE } = HV, t = GEO.t, y1 = GEO.H / 2, yb = y1 - 0.75, ye = y1 - GEO.B - 0.2 + 0.02, xr = P + 0.6 + GEO.B;
  const sec = (zt) => { const pts = [];
    for (let i = 0; i <= 24; i++) { const a = Math.PI / 2 + Math.PI * i / 24; pts.push([P + EL * Math.cos(a), -P + EL * Math.sin(a)]); }
    pts.push([P + 0.5, -P - EL], [P + 0.5, 0.3 - t], [xr, 0.3 - t], [xr, zt], [P, zt]); return pts.map((q) => [s * q[0], q[1]]); };
  const bore = [s * P, -P, 0.5];
  // top end: y from the inner face out; the bottom one is the same along −y
  const along = (y0, y1_, zt, hole) => (e > 0 ? prismY(T, sec(zt), y0, y1_, hole) : prismY(T, sec(zt), -y1_, -y0, hole));
  return mergeGeometries([along(YE, ye, -0.26, bore), along(ye, yb, 0, bore), along(yb, y1, 0, null)].map((g) => { g.translate(0, 0, t); return g.index ? g.toNonIndexed() : g; }));
}

export function buildExterior(ctx) {
  const T = ctx.T, { panel, deck } = ctx.G, mk = ctx.mk;
  const { H, t, L, R, RH, B, DB, OZ, CWd, CHt, CY, CX, KR, KH, ROWS } = GEO;
  // hinge-side inset of the outer plates: hinge v2 stops them at x = P, straight under the half's pivot (hinge.js), so
  // as the half turns its back edge stays a hairline off the spine cover's shoulder; open, the cover's ridge fills the
  // 3.6 mm between the two halves' plates (less the bevel, which ends the plate at P)
  const span = keyLayout(), HE = HV.P + 0.1;
  // the glass ears' copy of the black glass: their top shares the frame end walls' top face (z 0), so it is drawn
  // pulled toward the camera (polygon offset, as the antenna breaks) and wins the tie; it showed grey patches there
  const earMat = mat("glassBlack").clone(); Object.assign(earMat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  S.keyMat = mat("keycap");
  S.keyPlain = S.keyMat.clone(); S.keyPlain.color.set(fin().key);   // before the maps go on (see the keycaps below)
  Object.assign(S.keyMat, { map: keysTex(T, false), emissiveMap: keysTex(T, true), bumpMap: keysBump(T), bumpScale: 0.1 });
  S.keyMat.color.setHex(0xffffff); S.keyMat.emissive.setHex(0xffffff); S.keyMat.needsUpdate = true;
  setBacklight();

  /* deck outer face. The deck's plates are turned over (rotation.x = π), so in their shape frame a front-coord point
     (xf, yf) sits at (−xf, −yf). The keyboard pocket is 71.3 × 29.5, r 3.6, around the keys. */
  const PW = span + 2.6, PH = (ROWS[0] - ROWS[3]) + KH + 2.6, PCY = (ROWS[0] + ROWS[3]) / 2;
  // (as a hole, at its own corner steps: the plates round it have 9.2 mm corners that need 28, util.polyHole)
  function pocket(hole, d) { d = d || 0; const p = rrAt(T, PW - 2 * d, PH - 2 * d, 3.6 - d, -L / 2, -PCY, hole); return hole ? polyHole(T, p, curveSegs(3.6 - d)) : p; }

  [panel, deck].forEach((G, i) => { const s = i ? -1 : 1, leaf = i ? "deck" : "panel";
    // the frame is a hollow ring, open over the hinge, so the parts inside show once the covers come off
    const body = mk(mergeGeometries([frameGeo(T, s), elbowGeo(T, s, 1), elbowGeo(T, s, -1)].map((g) => (g.index ? g.toNonIndexed() : g))), mat("frame"), G); body.position.z = -t;
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
       would swing 0.12 past the other half's as the phone shuts. Their inner ends (FABLE-REVIEW-2 N3; they stopped at
       x P + 0.1, a 3.8 mm notch in the bezel at each end of the fold, real phones show about 1 mm, research §7): the top
       face runs to the pivot's x, then the end curves down and in on a circle of radius P − 0.03 about the pivot to 0.8
       below the face, the black mask's edge reaching x 0.35. A point within P of its pivot never passes the screens'
       meeting plane (x 0) as the half turns, so the two halves' ears never meet but there (the sweep, hinge.js); the
       spine's end plates sit lower to let their deep corners by when shut. What shows between them, 0.7 mm across, is
       the elbows' rounded tops and the spine's end cap, the small step real phones show. */
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
    // (3 steps round its 0.22 mm bevel, was 4, F2)
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
    // one step round the 0.08 mm bevel (was 2): 40 key openings × 2 bevels × the steps were 13k triangles, F2
    const web = mk(extLo(T, ws, 0.65, wb, 1, 6), mat("web"), deck); web.rotation.x = Math.PI; web.position.z = OZ + 0.02;
    mark(web, { kbd: true }); tag(web, "cover", -5.6, { leaf: "deck" }); }

  /* keycaps: one merged mesh, z [−6.63, −5.58]: tops 0.2 below the face plate, 0.4 above the web. Two material groups
     (one draw call each): the legend picture only on the faces that look outward (the crowns and the top of the
     bevel), the plain key colour on the sides and undersides, so from inside (kbdstack, exploded) no mirrored legend
     shows (G2-04). The plain one is a copy of the same tier's keycap material, so Low stays cheap. */
  { const KB = S.KB, kd = 1.05, kb = 0.42, top = { p: [], n: [], u: [] }, rest = { p: [], n: [], u: [] };
    const tri = new T.Triangle(), nv = new T.Vector3();
    S.keys.forEach((k) => {
      // 4 steps round the 0.42 mm crown bevel (was 5: the 40 keys were 32k triangles, a third of the closed phone,
      // FABLE-REVIEW-1 F2); 3 steps showed as bands in the bevel's highlight in the `usb` close-up
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

  // earpiece slot on the deck's outer face, above the cover screen, over the top speaker box (x 45–55)
  const ear = mk(new T.ShapeGeometry(rrShape(T, 10, 0.7, 0.35), 12), mat("port"), deck, false);
  ear.rotation.y = Math.PI; ear.position.set(-50, 60, FZ - 0.012); tag(ear, "cover", -5.6, { leaf: "deck" });

  /* side keys on the panel's free edge (the right half when open). Volume in frame metal, power in a matte copy. */
  const matte = mat("frame").clone(); matte.roughness = 0.6;
  onFinish(() => { matte.color.copy(mat("frame").color); invalidate(); });
  [[36, 18, mat("frame")], [14, 11, matte]].forEach(([y, len, m]) => {
    const sl = mk(new T.ShapeGeometry(rrShape(T, 2.3, len + 0.8, 1.15), 16), mat("port"), panel, false); sl.rotation.y = Math.PI / 2; sl.position.set(L + 0.015, y, -t / 2);
    const b = mk(ext(T, rrShape(T, 1.75, len, 0.87), 0.75, 0.28, 4, curveSegs(0.87)), m, panel); b.rotation.y = Math.PI / 2; b.position.set(L - 0.55, y, -t / 2);
    mark(sl, { sidekey: true }); mark(b, { sidekey: true }); tag(b, "frame", 0, { slide: [6, 0, 0], leaf: "panel" }); });

  /* edge openings (dark discs on the edge faces). x is leaf-local: the panel's equals front coords, the deck's is −xf. */
  const edge = (G, geo, x, top) => { const m = mk(geo, mat("port"), G, false); m.rotation.x = top ? -Math.PI / 2 : Math.PI / 2; m.position.set(x, top ? H / 2 + 0.02 : -H / 2 - 0.02, -t / 2); return m; };
  const row = (n, d, pitch) => mergeGeometries(Array.from({ length: n }, (_, i) => new T.CircleGeometry(d / 2, 16).translate((i - (n - 1) / 2) * pitch, 0, 0)));
  const pin = () => new T.CircleGeometry(0.45, 16);
  mark(edge(deck, row(6, 0.9, 1.8), -55, true), { grille: "top" });      // top speaker: deck top edge
  edge(deck, pin(), -24, true);                                           // top mic (clear of the antenna break at x 20)
  mark(edge(deck, new T.ShapeGeometry(rrShape(T, 8.6, 2.7, 1.35), 16), -L / 2, false), { usb: true });   // USB-C (the `usb` still)
  edge(deck, pin(), -L / 2 + 9, false);                                   // USB-C mic
  mark(edge(panel, row(5, 1.0, 2.1), 56.5, false), { grille: "bot" });   // bottom speaker: panel bottom edge
  edge(panel, pin(), 25, false);                                          // bottom mic
  edge(panel, pin(), 30, true);                                           // panel top mic

  /* antenna breaks: 1.0 wide, over the edge's flat band (t − 2B = 3.1 tall), same places on both halves so they line
     up when shut: free edge at y ±46, top and bottom edges at x 20. One merged mesh per half. */
  const ant = mat("antenna"); Object.assign(ant, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  [panel, deck].forEach((G, i) => { const s = i ? -1 : 1, fh = t - 2 * B, geos = [];
    [46, -46].forEach((y) => geos.push(new T.PlaneGeometry(fh, 1.0).rotateY(s * Math.PI / 2).translate(s * (L + 0.01), y, -t / 2)));
    [1, -1].forEach((u) => geos.push(new T.PlaneGeometry(1.0, fh).rotateX(-u * Math.PI / 2).translate(s * 20, u * (H / 2 + 0.01), -t / 2)));
    mk(mergeGeometries(geos), ant, G, false); });

  // rear camera island on the panel leaf
  const IX = L - 17.5, IY = H / 2 - 29, IW = 25, IH = 47, bk = { leaf: "panel" };
  const isl = mk(ext(T, rrShape(T, IW, IH, 8.5), 1.8, 0.5, 6), mat("island"), panel); isl.rotation.x = Math.PI; isl.position.set(IX, IY, OZ + 0.02);
  tag(isl, "back", -5.5, bk);
  const IZ = OZ - 1.78;
  // lens ring: an outer band 0.15 lower than the inner band, then the bezel lip down into the lens
  const ringG = (rl) => { const g = new T.LatheGeometry([[rl - 0.05, 0], [rl + 1.0, 0], [rl + 1.2, 0.2], [rl + 1.2, 0.98], [rl + 1.08, 1.1], [rl + 0.8, 1.1], [rl + 0.72, 1.25], [rl + 0.35, 1.25], [rl, 1.0]].map((p) => new T.Vector2(p[0], p[1])), 72); g.rotateX(-Math.PI / 2); return g; };
  [[IY + 12.6, 4.2], [IY, 4.2], [IY - 12.6, 4.2]].forEach((q) => { const x = IX + 3.6;
    const rg = mk(ringG(q[1]), mat("frame"), panel); rg.position.set(x, q[0], IZ + 0.02);
    const ln = mk(new T.CircleGeometry(q[1] + 0.02, 64), mat("lens"), panel, false); ln.rotation.y = Math.PI; ln.position.set(x, q[0], IZ - 0.95);
    tag(rg, "back", -5.5, bk); tag(ln, "back", -5.5, bk); });
  const dot = (r, m, y) => { const d = mk(new T.CircleGeometry(r, 32), m, panel, false); d.rotation.y = Math.PI; d.position.set(IX - 7.8, y, IZ - 0.01); tag(d, "back", -5.5, bk); };
  dot(1.7, mat("flash"), IY + 9); dot(1.15, mat("port"), IY + 1); dot(0.4, mat("port"), IY - 8);

  /* Set the hinge angle (0 = folded, 180 = open flat) and report the live bounding box. Hinge v2 (hinge.js): each half
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
