/* Fold Communicator — the hinge (spine), hinge v2 (WP6; plans/hinge-v2/research/HINGE-EXTERIOR.md §9 and §11).
   Two pivots, as on real book foldables: each half turns about its own axis, set into the spine behind the screen, at
   x ±P, z −P in spine-local coords (x across, + toward the panel when open; y along the axis; z depth, screen face
   z = 0, back negative). For a hinge angle A each half turns by φ = (180° − A) / 2, the panel about (+P, −P) and the
   deck about (−P, −P), so the spine cover always sits half-way between them (exterior.js S.setFold places the groups).
   P = 1.82 makes the shut spine stand 1.9 mm proud of the halves (real phones: 1.1 to 1.6 mm, research §3.1; kept at
   1.9 for now, run sheet D6): folded width 76.5 + 1.9 = 78.4; open flat the cover hides under the halves' back plates, so 153.0 × 7.0 and the
   folded 12.5 stay. Why these numbers: a 2D sweep of every cross-section at 1° steps (WP6 report); the 3D check is
   hingeCheck below (?hingecheck=1).
   Leaf front coords for the parts that belong to a half (the deck mirrors x). What moves besides the three groups
   (updateHinge, called by S.setFold):
   - the screen over the hinge (fold strip): one strip of fixed length 2·W1 between the halves' screens, flat when open
     and a teardrop when shut, solved per angle (stripHalf);
   - each half's wing plate, which tilts with the strip; the centre plate, which drops to stay under it;
   - the middle module's gears and every module's cam, which turn about their shafts.
   Every other piece is baked in place at position 0 and tag() only adds the exploded offset; a moving piece sits in a
   group of its own (wing plates, centre plate) or turns about its own position (gears, cams), so the teardown's moves
   still apply to it. Nothing moves in the exploded view: it is always open flat. */
import { GEO, Q, S, params } from "./state.js";
import { mark, rng } from "./util.js";
import { mat } from "./materials.js";
import { tag, updateTeardown } from "./teardown.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* P pivot offset. W1 where each half's screen ends (the strip spans x ±W1 when open); LK the bend of the strip at the
   half's screen edge, LW the run glued to the wing plate. ZD the display surface's depth, TS the strip's thickness
   (display to backing). SY the strip's half-length along y. The cover: its shell runs to ±YC, closed by an end plate
   out to ±YP that carries the pivot pins, then a narrower end cap out to ±ZE (0.1 inside the frame's end face), between
   the halves' rounded rail ends (elbows, exterior.js) that start at YE, the frame end walls' inner face. RIM the shell's
   top edge (the pivots' height: the halves' back plates end straight under their pivots, so this is where their edges
   meet the cover when shut), WALL its wall, ZR its ridge's face (flush with the back plates when open). BT the
   housings' top. EL the elbows' radius about their pivot, LR the end caps' clearance radius: over the elbows' EL and the
   glass ears' P − 0.03 (exterior.js), and over P, so the two arcs meet (capRuns). It was EL + 0.2, a dark crescent
   round each elbow from the end (FABLE-REVIEW-2 N3). */
export const HV = { P: 1.82, W1: 7.0, LK: 1.5, LW: 2.5, ZD: 0.125, TS: 0.4, SY: 58.85, YC: 59.0, YP: 59.3, YE: 59.35, ZE: 61.85,
  RIM: -1.82, WALL: 0.5, ZR: -5.58, BT: -3.3, EL: 1.77, LR: 1.83 };
const YC_ = [43, 0, -43];            // module centres (hinge-0, -1, -2); each housing spans y_c ± 12
const PF = -4.3, RB = -3.55;         // housing pocket floors; retaining-plate rebate
const GEAR_RATIO = 2, built = { modules: [], cover: null, beam: null, plates: null, strip: null, cplate: null, wings: null, spin: [] };

/* ---------- the cover's outline ----------
   Right half of the outer section, from the bottom centre up to the rim: the largest outline that the halves' back
   plates, the keyboard half's face plate, keyboard stack and graphite sheets never come within 0.2 mm of while they
   turn (a 2D sweep of 0° to 180°), less 0.02 to 0.06. The halves' back plates stop at x = ±P, straight under their
   pivots; between them the cover's ridge (|x| ≤ P − 0.2) is flush with the back when open, the 3.2 mm strip real phones
   show there (research §4, 180°). Above the back plates the shoulders run out and up to the rim at the pivots' height,
   so as a half turns, its back edge slides round the shoulder with a hairline (0.4 to 0.6 mm: the graphite sheets and
   the keyboard stack keep the cover from the full 0.2). Shut, it is the flat-topped dome, 1.9 proud (research §4; run sheet D6).
   The shoulder is corner-cut three times (Chaikin) so it is smooth and still inside; the ridge's corners stay sharp
   (rounding the inner one would push the outline out under the back plates). */
const RIDGE = [[0, HV.ZR], [1.45, HV.ZR], [1.56, -5.55], [1.6, -5.48], [1.6, -5.14]];
const SHOULDER = [[1.6, -5.14], [2.0, -5.13], [2.28, -5.10], [2.58, -5.03], [2.77, -4.91], [3.12, -4.61], [3.59, -4.21], [4.02, -3.81],
  [4.31, -3.41], [4.52, -3.0], [4.68, -2.5], [4.76, -2.0], [4.76, HV.RIM]];
function chaikin(p, n) {
  for (let k = 0; k < n; k++) { const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
    q.push(p[p.length - 1]); p = q; }
  return p;
}
// offset an open polyline [x, z] by d along its left normal (−t_z, t_x); a positive d moves the right outline inward
function offsetL(p, d) {
  return p.map((q, i) => { const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    return [q[0] - tz / l * d, q[1] + tx / l * d]; });
}
// an inward offset of a tight corner folds back on itself (a swallowtail): drop the points that step back, so a right
// outline (bottom centre to rim) only ever moves out and up
const untangle = (p) => { const o = p.filter((q, i, a) => { for (let j = 0; j < i; j++) if (q[0] < a[j][0] - 1e-9 || q[1] < a[j][1] - 1e-9) return false; return true; });
  // (and it starts on the centre line: the offset of the bottom centre can land a hair either side of it)
  const k = o.findIndex((q) => q[0] > 0); return [[0, o[0][1]]].concat(o.slice(k)); };
// keep the part of a bottom-to-top outline at or below z = zc, ending exactly on it
function clipZ(p, zc) {
  const out = [];
  for (let i = 0; i < p.length; i++) { if (p[i][1] <= zc) { out.push(p[i]); continue; }
    const a = p[i - 1]; if (a) { const t = (zc - a[1]) / (p[i][1] - a[1]); out.push([a[0] + (p[i][0] - a[0]) * t, zc]); } break; }
  return out;
}
const OUT_R = RIDGE.slice(0, -1).concat(chaikin(SHOULDER, 3));          // outer, right half, bottom centre -> rim
const IN_R = clipZ(untangle(offsetL(OUT_R, HV.WALL)), HV.RIM);                    // inner, same order
const BLK_R = clipZ(untangle(offsetL(IN_R, 0.15)), HV.BT);                         // housings: 0.15 inside the cover
const full = (r) => r.slice().reverse().map((q) => [-q[0], q[1]]).concat(r.slice(1));   // left rim -> bottom -> right rim
// the outer section (for the size readout and the stills' dark-slot box): left rim to right rim, plus the end caps'
export function coverOutline() { return full(OUT_R); }
// half-width of a right outline at height z
function widthAt(r, z) { for (let i = 1; i < r.length; i++) if (r[i][1] >= z) { const a = r[i - 1], b = r[i], t = b[1] === a[1] ? 1 : (z - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; } return r[r.length - 1][0]; }
// the end caps' section, as runs [x, z] (left to right along the bottom; up the right side; the arcs over the top,
// right to left; down the left side): the cover's outline between the frame rails' end walls (|x| ≤ P + 0.4, 0.2 short
// of them), and on top the two arcs of radius LR about the pivots, which meet in a cusp: the halves' elbows (radius
// EL) turn inside those arcs, and the rails' end walls only ever turn away from the cap
function capRuns() {
  const { P, LR } = HV, xs = P + 0.4, k = OUT_R.findIndex((q) => q[0] > xs), a = OUT_R[k - 1], b = OUT_R[k];
  const right = OUT_R.slice(0, k).concat([[xs, a[1] + (b[1] - a[1]) * (xs - a[0]) / (b[0] - a[0])]]);
  const bottom = right.slice().reverse().map((q) => [-q[0], q[1]]).concat(right.slice(1));
  const z1 = -P - Math.sqrt(LR * LR - (xs - P) * (xs - P)), a1 = Math.atan2(z1 + P, xs - P), a2 = Math.atan2(-Math.sqrt(LR * LR - P * P), -P), arcR = [], arcL = [];
  for (let i = 0; i <= 12; i++) { const t = a1 + (a2 - a1) * i / 12; arcR.push([P + LR * Math.cos(t), -P + LR * Math.sin(t)]); }
  arcR.slice().reverse().forEach((q) => arcL.push([-q[0], q[1]]));
  const top = arcR.concat(arcL.slice(1));                                           // right side's top to left side's top
  return { bottom, right: [bottom[bottom.length - 1], top[0]], top, left: [top[top.length - 1], bottom[0]] };
}
// the end cap from y0 to y1: smooth curved faces (normals from the section) and flat ends
function capGeo(T, y0, y1) {
  const r = capRuns(), poly = r.bottom.concat(r.top);
  return merge([sweepY(T, r.bottom, y0, y1, -1), sweepY(T, r.right, y0, y1, -1), sweepY(T, r.top, y0, y1, -1), sweepY(T, r.left, y0, y1, -1),
    capY(T, poly, y1, 1), capY(T, poly, y0, -1)]);
}

/* ---------- geometry helpers ---------- */
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (gs) => mergeGeometries(gs.map(ni), false);
const poly = (P, pts) => { pts.forEach((q, i) => (i ? P.lineTo(q[0], q[1]) : P.moveTo(q[0], q[1]))); return P; };
const rectP = (P, x0, x1, y0, y1) => poly(P, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const circP = (P, cx, cy, r) => { P.absarc(cx, cy, r, 0, Math.PI * 2, false); return P; };
// rounded rectangle path (stamped windows)
function rrP(P, x0, x1, y0, y1, r) { P.moveTo(x0 + r, y0); P.lineTo(x1 - r, y0); P.quadraticCurveTo(x1, y0, x1, y0 + r); P.lineTo(x1, y1 - r);
  P.quadraticCurveTo(x1, y1, x1 - r, y1); P.lineTo(x0 + r, y1); P.quadraticCurveTo(x0, y1, x0, y1 - r); P.lineTo(x0, y0 + r);
  P.quadraticCurveTo(x0, y0, x0 + r, y0); return P; }
// plan shape (x, y) extruded from z0 to z1
function slab(T, sh, z0, z1, segs) { const g = new T.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: segs || 32 });
  g.translate(0, 0, z0); return g; }
// cross-section [x, z] points extruded along y from y0 to y1
function prismY(T, pts, y0, y1) { const g = new T.ExtrudeGeometry(poly(new T.Shape(), pts.map((q) => [q[0], -q[1]])), { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g; }
function box(T, x0, x1, y0, y1, z0, z1) { const g = new T.BoxGeometry(Math.abs(x1 - x0), y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function cylZ(T, r, x, y, z0, z1, seg) { const g = new T.CylinderGeometry(r, r, z1 - z0, seg || 24); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; }
function cylY(T, r, x, z, y0, y1, seg) { const g = new T.CylinderGeometry(r, r, y1 - y0, seg || 16); g.translate(x, (y0 + y1) / 2, z); return g; }
// lathe about the z axis: profile [r, z] (ordered so the faces point the right way, see LatheGeometry)
function latheZ(T, pts, seg) { const g = new T.LatheGeometry(pts.map((q) => new T.Vector2(q[0], q[1])), seg || 24); g.rotateX(Math.PI / 2); return g; }
/* a smooth surface: the open profile pts [x, z] swept along y from y0 to y1, normals from the profile (side +1: its
   left normal, −1: its right), u along y (the brushed streaks run along the spine), v along the profile */
function sweepY(T, pts, y0, y1, side) {
  const n = pts.length, pos = [], nor = [], uv = [], idx = []; let s = 0;
  pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    if (i) s += Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]);
    [y0, y1].forEach((y) => { pos.push(q[0], y, q[1]); nor.push(-tz / l * side, 0, tx / l * side); uv.push((y + 62) / 124, s / 14); }); });
  for (let i = 0; i + 1 < n; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    if (side > 0) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d); }
  const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
// a closed section [x, z] as a flat face in the plane y, facing +y (dir 1) or −y (dir −1)
function capY(T, pts, y, dir) {
  const g = new T.ShapeGeometry(poly(new T.Shape(), pts.map((q) => [q[0], dir > 0 ? -q[1] : q[1]])));
  g.rotateX(dir > 0 ? -Math.PI / 2 : Math.PI / 2); g.translate(0, y, 0); return g;
}

/* ---------- parts ---------- */
/* spine cover: the outer shell (outline above) along y ±YC with flat ends, and an end cap at each end out to ±ZE, flush
   with the frame's end faces. Returns { out, ins }: the outside in the finish colour, the inside, rim and the shell's
   end faces in dark steel. */
function coverGeo(T) {
  const { YC, YP, ZE, RIM } = HV, o = full(OUT_R), inn = full(IN_R);
  const out = [sweepY(T, o, -YC, YC, -1)];
  /* end plates (YC to YP), holding the pivot pins: the shell's section below z −3.4, and from it a web up to a boss
     round each pin (r 0.9). Nothing else: above them the halves' screen glass runs on to the frame's ends (exterior.js),
     and as the phone shuts its ears' deep inner corners pass between the two bosses, down to z −3.29 (so the floor is
     below that; it was at −2.5 before the ears reached in, FABLE-REVIEW-2 N3). Then the end caps. */
  const P = HV.P, floor = clipZ(OUT_R, -3.4), plate = [prismY(T, full(floor), YC, YP)];
  [1, -1].forEach((s) => { plate.push(prismY(T, [[s * (P - 0.4), -3.5], [s * (P + 0.4), -3.5], [s * (P + 0.4), -P], [s * (P - 0.4), -P]], YC, YP));
    const g = new T.CylinderGeometry(0.9, 0.9, YP - YC, 24); g.translate(s * P, (YC + YP) / 2, -P); plate.push(g); });
  const plateG = merge(plate), plateB = plateG.clone(); plateB.translate(0, -(YC + YP), 0);
  out.push(plateG, plateB);
  [1, -1].forEach((e) => { out.push(capGeo(T, e > 0 ? YP : -ZE, e > 0 ? ZE : -YP)); });
  const ins = [sweepY(T, inn, -YC, YC, 1)];
  // the rim: the flat top edges, facing the screen
  [1, -1].forEach((s) => { const a = OUT_R[OUT_R.length - 1], b = IN_R[IN_R.length - 1];
    ins.push(sweepY(T, s > 0 ? [[a[0], RIM], [b[0], RIM]] : [[-b[0], RIM], [-a[0], RIM]], -YC, YC, -1)); });
  return { out: merge(out), ins: merge(ins) };
}
// the pivot pins: one each side on the halves' pivot axes, from the end plate out through the elbows (the halves' rail
// ends turn on them; nothing else may sit on the axes, which the screen's loop crosses when shut)
// (to 60.6, 0.6 short of where the elbow's bore stops, 61.2)
function pinGeo(T, s) { const { P, YC } = HV; return merge([cylY(T, 0.4, s * P, -P, YC, 60.6, 20), cylY(T, 0.4, s * P, -P, -60.6, -YC, 20)]); }

// housing section below z (0.15 inside the cover), closed along the top
const blkSec = (z) => { const r = clipZ(BLK_R, z); return full(r); };
// centre beam: in the gaps between the modules where no hinge flex cable runs, under the centre plate
function beamGeo(T) {
  const sec = blkSec(-3.75), g = [];
  [[-58, -55.2], [-30.8, -12.2], [20.7, 22.3], [55.2, 58]].forEach((y) => g.push(prismY(T, sec, y[0], y[1])));
  return merge(g);
}

/* housing: a base following the cover's floor, and two layers above it to BT with the pockets (springs, cam, and the
   middle module's gears) and, in the top layer, the rebate for the retaining plate */
function blockGeo(T, yc, gears) {
  const g = [prismY(T, blkSec(PF), yc - 12, yc + 12)];
  const layer = (z0, z1, rebate) => { const w = widthAt(BLK_R, z0) - 0.02, sh = rectP(new T.Shape(), -w, w, yc - 12, yc + 12);
    const spring = rebate ? poly(new T.Path(), [[-2.0, -4.4], [2.0, -4.4], [2.0, -1.75], [3.0, -1.75], [3.0, 1.25], [2.0, 1.25], [2.0, 3.9], [-2.0, 3.9],
      [-2.0, 1.25], [-3.0, 1.25], [-3.0, -1.75], [-2.0, -1.75]].map((q) => [q[0], yc + q[1]])) : rectP(new T.Path(), -2.0, 2.0, yc - 4.4, yc + 3.9);
    sh.holes.push(spring, circP(new T.Path(), 0, yc + 7, 2.4));
    if (gears) sh.holes.push(rectP(new T.Path(), -2.0, 2.0, yc - 11.6, yc - 4.8));
    return slab(T, sh, z0, z1, 24); };
  g.push(layer(PF, RB, false), layer(RB, HV.BT, true));
  return merge(g);
}

// cam disc Ø4.6 with two detent valleys and a bore for its shaft, centred on its shaft (it turns about z)
function camGeo(T) {
  const sh = new T.Shape(), n = 96;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, d = Math.min(Math.abs(Math.sin(a - Math.PI / 2)), 1);
    const v = Math.max(0, 1 - Math.asin(d) / 0.32), r = 2.3 - 0.22 * v;   // V valleys at ±90°, about 36° wide
    (i ? sh.lineTo : sh.moveTo).call(sh, r * Math.cos(a), r * Math.sin(a)); }
  sh.holes.push(circP(new T.Path(), 0, 0, 0.9));
  return slab(T, sh, -4.2, -3.8, 24);
}

// spur gear Ø2.0, 12 teeth (tip r 1.0, root r 0.78), bore Ø0.6, centred on its shaft; phase turns it by half a tooth so
// neighbours mesh
function gearGeo(T, phase) {
  const sh = new T.Shape(), n = 12, pa = Math.PI * 2 / n, at = 4 * Math.PI / 180, ar = 8 * Math.PI / 180, pts = [];
  for (let i = 0; i < n; i++) { const c = i * pa + phase; [[0.78, c - ar], [1.0, c - at], [1.0, c + at], [0.78, c + ar]].forEach((q) => pts.push([q[0] * Math.cos(q[1]), q[0] * Math.sin(q[1])])); }
  poly(sh, pts); sh.holes.push(circP(new T.Path(), 0, 0, 0.3));
  return slab(T, sh, -4.2, -3.8, 12);
}

// coil spring along y: coil radius 0.28 to the wire centre, wire Ø0.14, 10 turns over 7.5 mm, from y = 0 (the
// housings sit low in the cover now, under the screen's loop, so the springs are smaller than v1's 0.55 / 0.22)
function springGeo(T) {
  const R = 0.28, turns = 10, len = 7.5, c = new T.Curve();
  c.getPoint = (t, out) => (out || new T.Vector3()).set(R * Math.cos(t * turns * Math.PI * 2), t * len, R * Math.sin(t * turns * Math.PI * 2));
  return new T.TubeGeometry(c, turns * Q.springSegs, 0.07, 8, false);
}

// countersunk screw head, top face at z = 0: Ø1.8 rim with a cross recess, cone below; the recess floor is a
// separate dark cross (screwCross) whose top sits 0.01 above the cone's top face
function screwGeo(T) {
  const sh = circP(new T.Shape(), 0, 0, 0.9), a = 0.55, w = 0.125;
  sh.holes.push(poly(new T.Path(), [[-a, -w], [-w, -w], [-w, -a], [w, -a], [w, -w], [a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w]]));
  const cone = new T.CylinderGeometry(0.9, 0.5, 0.2, 24); cone.rotateX(Math.PI / 2); cone.translate(0, 0, -0.3);
  return merge([slab(T, sh, -0.2, 0, 16), cone]);
}
function screwCross(T) { return merge([box(T, -0.53, 0.53, -0.115, 0.115, -0.25, -0.19), box(T, -0.115, 0.115, -0.53, 0.53, -0.25, -0.19)]); }

/* swing arm in front coords (s = −1 mirrors x for the deck): a plate screwed into the half's hinge zone (x 5.5 to 8,
   z −2.95 to −2.35) with corner notches for the sliders, two countersunk screw holes and a window, and below it a
   curved shoe that rides the spine cover's shoulder from outside, 0.23 off it, on an arc about the half's pivot
   (r 3.55 to 3.8, 22° to 45° below the pivot's level when open): the cover's shoulder is the arm's rail, as on the
   dual-rail hinges, so the arm turns with its half about the half's pivot and stays on its rail at every angle. Inside
   the cover there is no room for it: the screen's loop and the wing plates take the space over the rim (2D sweep). */
const AZ = [-2.95, -2.35], SHOE = [3.55, 3.8, -45, -22];
function armGeo(T, s, yc) {
  const X = (x) => s * x, { P } = HV;
  const sh = poly(new T.Shape(), [[5.5, -10], [7.0, -10], [7.0, -6], [8, -6], [8, 6], [7.0, 6], [7.0, 10], [5.5, 10]].map((q) => [X(q[0]), yc + q[1]]));
  [-5, 5].forEach((d) => sh.holes.push(circP(new T.Path(), X(6.75), yc + d, 0.75)));
  sh.holes.push(rrP(new T.Path(), Math.min(X(6.0), X(7.5)), Math.max(X(6.0), X(7.5)), yc - 1.8, yc + 1.8, 0.4));
  // the web and shoe: the outer arc, up into the plate, back down the inner arc
  const arc = (r, a0, a1) => { const o = []; for (let i = 0; i <= 10; i++) { const a = (a0 + (a1 - a0) * i / 10) * Math.PI / 180; o.push([s * (P + r * Math.cos(a)), -P + r * Math.sin(a)]); } return o; };
  const [r0, r1, a0, a1] = SHOE;
  const sec = arc(r1, a0, a1).concat([[X(5.9), AZ[0] + 0.05], [X(5.5), AZ[0] + 0.05]], arc(r0, a1, a0));
  return merge([slab(T, sh, AZ[0], AZ[1], 16), prismY(T, s > 0 ? sec : sec.slice().reverse(), yc - 10, yc + 10)]);
}

/* ---------- the screen over the hinge ----------
   Panel half of the strip's display surface, spine coords [x, z], from where the panel's screen ends (x = W1 open) to
   the bottom of the loop on x = 0, for a half-fold φ and a wing tilt ψ: a bend of length LK turning by ψ (toward the
   back), a straight run LW (glued to the wing plate), then one arc that ends on x = 0 heading −x. Open flat (φ = ψ = 0)
   it is a straight line. ψ is solved (stripSolve) so the strip keeps its length per half (stripLen; W1 at 90° and
   below): the teardrop of research §11.2 item 12, with the display at least 1.4 mm in radius when shut (the panels are
   rated to 1.4 to 1.5). */
function stripHalf(phi, psi) {
  const { P, W1, LK, LW, ZD } = HV, c = Math.cos(phi), s = Math.sin(phi), N = 16;
  let x = P + (W1 - P) * c - (ZD + P) * s, z = -P + (W1 - P) * s + (ZD + P) * c;
  const pts = [[x, z]], th = Math.PI + phi;
  for (let i = 1; i <= N; i++) { const a = th + psi * (i - 0.5) / N; x += LK / N * Math.cos(a); z += LK / N * Math.sin(a); pts.push([x, z]); }
  const tw = th + psi, w0 = pts.length - 1; x += LW * Math.cos(tw); z += LW * Math.sin(tw); pts.push([x, z]);
  const D = tw - Math.PI; let l3;
  if (D < 1e-4) { l3 = Math.max(0, x); for (let i = 1; i <= N; i++) pts.push([x - l3 * i / N, z]); }
  else { const R = x / Math.sin(D), cx = x + R * Math.sin(tw), cz = z - R * Math.cos(tw); l3 = R * D;
    for (let i = 1; i <= N; i++) { const h = tw - D * i / N; pts.push([cx - R * Math.sin(h), cz + R * Math.cos(h)]); } }
  return { pts, len: LK + LW + l3, w0 };
}
/* How much screen the strip holds per half (FABLE-REVIEW-2 N4). The halves turn about pivots 1.95 mm below the display,
   so as they close, each half's screen edge comes in toward the fold: the strip has more length than the straight path
   between the two edges. Held at W1 at every angle, that spare length had to sag at once: a 1.4 mm trough already at
   150°, whose sides face away from the viewer and shade dark. Real phones are flat with a faint line there (research §4,
   §7): their hinges keep the screen's length by moving its support plates ("the wing plate opens wider"). Modelled the
   same way: from FLAT_DEG to flat, the strip holds exactly what the halves' own plane needs (ψ = 0: it runs on in each
   half's plane and meets the other in a rounded V, 9.5 mm radius at 150°); from LOOP_DEG down, the full W1, the
   teardrop as before (so the shut loop and its 1.4 mm radius are unchanged); between them it eases from one to the
   other (smoothstep). The difference, at most 0.71 mm per half (at 130°), is screen slid out over the door plate under
   the half's own display, where nothing shows it. */
const FLAT_DEG = 145, LOOP_DEG = 90;
function stripLen(phi) {
  const deg = 180 - 2 * phi * 180 / Math.PI, k = Math.min(1, Math.max(0, (deg - LOOP_DEG) / (FLAT_DEG - LOOP_DEG)));
  return HV.W1 - (HV.W1 - stripHalf(phi, 0).len) * k * k * (3 - 2 * k);
}
function stripSolve(phi) {
  if (phi < 1e-6) return { ...stripHalf(0, 0), psi: 0 };
  const L = stripLen(phi); let lo = 0, hi = 70 * Math.PI / 180;
  if (stripHalf(phi, lo).len >= L - 1e-9) return { ...stripHalf(phi, lo), psi: lo };
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (stripHalf(phi, m).len < L) lo = m; else hi = m; }
  const psi = (lo + hi) / 2; return { ...stripHalf(phi, psi), psi };
}
/* the strip mesh: the display on top (the inner screen's own material, its picture continued across the fold: u from
   the arc length, as the halves' displays map x, spread so both ends meet the halves' pictures when the strip holds
   less than 2·W1), the backing and the two ends below. Rewritten on each fold change. */
function stripMesh(T) {
  const n = 2 * (1 + 16 + 1 + 16) - 1, SY = HV.SY;   // points along the strip: per half the attach, the bend, the run's end, the arc; the bottom point once
  const g = new T.BufferGeometry(), V = n * 2;
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(V * 4 * 3), 3).setUsage(T.DynamicDrawUsage));
  g.setAttribute("normal", new T.BufferAttribute(new Float32Array(V * 4 * 3), 3).setUsage(T.DynamicDrawUsage));
  g.setAttribute("uv", new T.BufferAttribute(new Float32Array(V * 4 * 2), 2).setUsage(T.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i + 1 < n; i++) { const a = 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, c, d, b); }
  const nTop = idx.length;
  for (let i = 0; i + 1 < n; i++) { const a = V + 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, c, b, d); }
  // ends: per point, display and backing at y = −SY (block 2) and +SY (block 3)
  for (let i = 0; i + 1 < n; i++) { const a = 2 * V + 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, c, b, d); }
  for (let i = 0; i + 1 < n; i++) { const a = 3 * V + 2 * i, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, c, d, b); }
  g.setIndex(idx); g.addGroup(0, nTop, 0); g.addGroup(nTop, idx.length - nTop, 1);
  g.userData = { n, SY };
  return g;
}
const DW = GEO.L - GEO.DB, DH = GEO.H - 2 * GEO.DB;   // the inner display's half-width (per half) and height (exterior.js)
function stripFill(g, st) {
  const half = st.pts, full = half.map((q) => [-q[0], q[1]]).concat(half.slice().reverse().slice(1)), n = full.length, SY = g.userData.SY;
  const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, V = n * 2, TS = HV.TS;
  let s = 0, len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]);
  for (let i = 0; i < n; i++) {
    const a = full[Math.max(0, i - 1)], b = full[Math.min(n - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l, q = full[i], bx = q[0] - nx * TS, bz = q[1] - nz * TS;
    if (i) s += Math.hypot(q[0] - full[i - 1][0], q[1] - full[i - 1][1]);
    const u = 0.5 + (s / (len || 1) - 0.5) * HV.W1 / DW;
    [-SY, SY].forEach((y, j) => { const v = (y + DH / 2) / DH;
      let k = (2 * i + j) * 3; P[k] = q[0]; P[k + 1] = y; P[k + 2] = q[1]; N[k] = nx; N[k + 1] = 0; N[k + 2] = nz;
      k = (V + 2 * i + j) * 3; P[k] = bx; P[k + 1] = y; P[k + 2] = bz; N[k] = -nx; N[k + 1] = 0; N[k + 2] = -nz;
      U.set([u, v], (2 * i + j) * 2); U.set([u, v], (V + 2 * i + j) * 2); });
    // ends: display and backing points at each end, facing out along y
    [[2, -SY, -1], [3, SY, 1]].forEach(([blk, y, dir]) => { [[q[0], q[1]], [bx, bz]].forEach((p, j) => {
      const k = (blk * V + 2 * i + j) * 3; P[k] = p[0]; P[k + 1] = y; P[k + 2] = p[1]; N[k] = 0; N[k + 1] = dir; N[k + 2] = 0; U.set([u, j], (blk * V + 2 * i + j) * 2); }); });
  }
  ["position", "normal", "uv"].forEach((k) => { g.attributes[k].needsUpdate = true; });
  g.computeBoundingBox(); g.computeBoundingSphere();
}

/* ---------- build ---------- */
export function buildHinge(ctx) {
  const T = ctx.T, { panel, deck, spine } = ctx.G, rnd = rng(803), { P, W1, LK, LW } = HV;
  built.modules = []; built.spin = [];
  // name: a registry material, or a material made here (the tints below)
  const M = (name) => (typeof name === "string" ? mat(name) : name);
  // (a piece marked inside is also small: it is not drawn into the floor's contact shadow, see scene.js)
  // (pos: a piece that turns about its own centre sits there; it is set before tag() records the piece's home)
  const put = (geo, name, par, layer, ex, opts, id, pos) => { const m = ctx.mk(geo, M(name), par); m.name = "hinge." + id;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    mark(m, { hinge: true }); if (opts.inside) m.userData.small = true; tag(m, layer, ex, opts); return m; };
  // instanced copies of one geometry: list of [x, y, z, turn about z, turn about y]
  const inst = (geo, name, par, list, layer, ex, opts, id) => { const m = new T.InstancedMesh(geo, M(name), list.length), o = new T.Object3D();
    list.forEach((q, i) => { o.position.set(q[0], q[1], q[2]); o.rotation.set(0, q[4] || 0, q[3] || 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingBox(); m.computeBoundingSphere(); m.castShadow = true; m.name = "hinge." + id;
    par.add(m); mark(m, { hinge: true }); if (opts.inside) m.userData.small = true; tag(m, layer, ex, opts); return m; };
  const SP = { leaf: "spine" }, ARM = (leaf) => ({ leaf, slide: [3.5, 0, 0] });
  // inside: not drawn in the closed-up phone (SEEN_OUTSIDE, teardown.js). Hinge v2 closes the slot beside the spine, so
  // that is now everything in the hinge but the cover and the screen: the housings, beam, arms and plates show only as
  // slivers through the hairlines, and hiding them never lets the background through (id renders round the phone at 0°
  // to 180°, far and close; WP6 report)
  const IN = (o) => Object.assign({ inside: true }, o);
  /* tints of registry materials, made here (copies keep the tier's material class and maps): the housings in a darker
     brushed steel, so they read as machined metal, not black plastic, with the gears and shafts; the springs in a
     lighter brushed steel that catches the light (G2-08); the foam pads grey (G2-09); the door and wing plates and the
     strip's backing (the screen's steel support over the fold) mid-grey steel: through the hairline beside the spine
     cover a real phone shows grey metal, never black (research §5) */
  const tint = (name, hex) => { const m = mat(name).clone(); m.color.setHex(hex); return m; };
  const housing = tint("steelSatin", 0x7c8188), spring = tint("steelSatin", 0xaab0b7), foam = tint("foamTan", 0x606367), door = tint("steelSatin", 0x6e7378);

  // spine cover (outside in the finish colour, inside dark) and the centre beam
  const cg = coverGeo(T);
  const cover = put(cg.out, "hingeCover", spine, "back", -5.5, SP, "cover"), coverIn = put(cg.ins, "steelDark", spine, "back", -5.5, SP, "cover-in");
  // (build/shoot.py --selftest: with the cover's outer shell not drawn, the slot-width check must fail)
  if (params.fc_fail === "slot") cover.material = new T.MeshBasicMaterial({ visible: false });
  const pins = [1, -1].map((s) => put(pinGeo(T, s), "steelPolished", spine, "back", -5.5, IN(SP), "pin-" + (s > 0 ? "panel" : "deck") + "-axis"));
  built.cover = { main: cover, members: [cover, coverIn, ...pins], anchors: [new T.Vector3(0, 0, HV.ZR), new T.Vector3(0, 0, HV.ZR + HV.WALL)] };
  const beam = put(beamGeo(T), "steelDark", spine, "internal", -3.0, IN(SP), "beam");
  built.beam = { main: beam, members: [beam], anchors: [new T.Vector3(0, -21.5, -4.4), new T.Vector3(0, -21.5, -3.75)] };

  // three modules: housing, cam, springs, gears, retaining plate and screws turn with the spine; the swing arms
  // (with sliders, pin and screws) turn with their half
  const springG = springGeo(T), screwG = screwGeo(T), crossG = screwCross(T), crosses = { spine: [], panel: [], deck: [] };
  // the retaining plates' screws are M1 (0.6 × the arms' M1.6 heads): the plates are only 0.25 thick, between the springs
  const screwS = screwG.clone().scale(0.6, 0.6, 0.6), crossS = crossG.clone().scale(0.6, 0.6, 0.6);
  YC_.forEach((yc, i) => {
    const gears = i === 1, members = [];
    const block = put(blockGeo(T, yc, gears), housing, spine, "internal", -1.5, IN(SP), "block-" + i);
    members.push(block);
    // the cam turns about its shaft (z), so it is built round its own centre and placed there
    const cam = put(camGeo(T), "steelSatin", spine, "internal", -0.9, IN(SP), "cam-" + i, [0, yc + 7, 0]);
    cam.userData.spin = 1; built.spin.push(cam); members.push(cam);
    // (the shafts a hair under their bores: the cams and gears turn on them)
    const dark = [cylZ(T, 0.86, 0, yc + 7, PF, -3.8, 32)];
    if (gears) [-10.4, -8.2, -6.0].forEach((dy) => [-1, 1].forEach((s, k) => {
      dark.push(cylZ(T, 0.26, s * 0.9, yc + dy, PF, -3.8, 12));
      // the synchroniser: two columns of three gears; each pair meshes across x, so the columns turn opposite ways
      const gm = put(gearGeo(T, s > 0 ? Math.PI / 12 : 0), housing, spine, "internal", -0.9, IN(SP), "gear-" + i + "-" + (["a", "b", "c"][[-10.4, -8.2, -6.0].indexOf(dy)]) + (k ? "r" : "l"), [s * 0.9, yc + dy, 0]);
      gm.userData.spin = -s * GEAR_RATIO; built.spin.push(gm); members.push(gm); }));
    members.push(put(merge(dark), housing, spine, "internal", -0.9, IN(SP), "shafts-" + i));
    // four springs side by side, each turned about its own axis (y) so the wire ends don't line up
    members.push(inst(springG, spring, spine, [-1.35, -0.45, 0.45, 1.35].map((x) => [x, yc - 4.0, -3.92, 0, rnd() * Math.PI * 2]), "internal", -0.9, IN(SP), "springs-" + i));
    const ps = rectP(new T.Shape(), -3.0, 3.0, yc - 1.75, yc + 1.25); [-2.4, 2.4].forEach((x) => ps.holes.push(circP(new T.Path(), x, yc - 0.25, 0.54)));
    members.push(put(slab(T, ps, RB, HV.BT, 16), "steelSatin", spine, "internal", -0.4, IN(SP), "plate-" + i));
    const sp = [-2.4, 2.4].map((x) => [x, yc - 0.25, HV.BT, rnd() * Math.PI]);
    members.push(inst(screwS, "screw", spine, sp, "internal", -0.1, IN(SP), "screws-" + i)); crosses.spine.push(...sp);
    // swing arms, one per half
    [[panel, "panel", 1], [deck, "deck", -1]].forEach(([G, leaf, s]) => { const o = ARM(leaf), id = leaf + "-" + i;
      members.push(put(armGeo(T, s, yc), "steelSatin", G, "internal", -1.5, IN(o), "arm-" + id));
      members.push(put(merge([box(T, s * 7, s * 8, yc + 6, yc + 10, AZ[0], AZ[1]), box(T, s * 7, s * 8, yc - 10, yc - 6, AZ[0], AZ[1])]), "steelDark", G, "internal", -1.5, IN(o), "sliders-" + id));
      const as = [-5, 5].map((d) => [s * 6.75, yc + d, AZ[1], rnd() * Math.PI]);
      members.push(inst(screwG, "screw", G, as, "internal", -0.1, IN(o), "screws-" + id)); crosses[leaf].push(...as); });
    built.modules.push({ main: block, members, anchors: [new T.Vector3(0, yc, -4.4), new T.Vector3(0, yc, HV.BT)] });
  });
  // the dark recess floors of every screw in a group share one mesh (cosmetic; clicks pass through to the screw)
  inst(crossS, "steelDark", spine, crosses.spine, "internal", -0.1, IN(SP), "recess-spine");
  inst(crossG, "steelDark", panel, crosses.panel, "internal", -0.1, IN(ARM("panel")), "recess-panel");
  inst(crossG, "steelDark", deck, crosses.deck, "internal", -0.1, IN(ARM("deck")), "recess-deck");

  /* screen side. On each half: the fixed door plate under the half's own screen (x W1 to 10.6), the foam pads past
     its ends, and the wing plate under the strip's glued run, which tilts with it (in a group of its own, posed by
     updateHinge). On the spine: the centre plate (rivets), which holds the strip flat when open and drops to stay
     under its loop as the phone shuts (also in a group of its own). */
  const plates = [], wings = {};
  [[panel, "panel", 1], [deck, "deck", -1]].forEach(([G, leaf, s]) => {
    plates.push(put(box(T, s * (W1 + 0.05), s * 10.6, -54, 54, -0.75, -0.5), door, G, "midframe", 3, IN({ leaf }), "door-" + leaf));
    plates.push(put(merge([box(T, s * (W1 + 0.05), s * 10.2, 54.2, 58, -0.75, -0.5), box(T, s * (W1 + 0.05), s * 10.2, -58, -54.2, -0.75, -0.5)]), foam, G, "midframe", 3.3, IN({ leaf }), "pads-" + leaf));
    const wg = new T.Group(); wg.name = "hinge.wing-group-" + leaf; G.add(wg);
    const zt = HV.ZD - HV.TS - 0.01;   // just under the strip's backing
    // (in two lengths: where the hinge flex cables cross, y 12.2 to 30.8, there is none, so the cables can pass over the
    // cover's rim under the screen's loop)
    plates.push(put(merge([box(T, s * (W1 - LK - LW + 0.05), s * (W1 - LK - 0.1), -54, 12.2, zt - 0.25, zt), box(T, s * (W1 - LK - LW + 0.05), s * (W1 - LK - 0.1), 30.8, 54, zt - 0.25, zt)]), door, wg, "midframe", 3, IN({ leaf }), "wing-" + leaf));
    wings[leaf] = wg; });
  const CPY = 58.4, rv = [-56, -42, -28, -14, 0, 14, 28, 42, 56], cp = rectP(new T.Shape(), -2.6, 2.6, -CPY, CPY);
  rv.forEach((y) => cp.holes.push(circP(new T.Path(), 0, y, 0.8)));
  const cpg = [slab(T, cp, -0.75, -0.5, 12)];   // rivet holes Ø1.6: 12 steps (FABLE-REVIEW-1 F2)
  rv.forEach((y) => { const g = latheZ(T, [[0, -0.75], [0.8, -0.75], [0.8, -0.6], [0.62, -0.5], [0, -0.5]], 12); g.translate(0, y, 0); cpg.push(g); });
  const dropG = new T.Group(); dropG.name = "hinge.centre-plate-group"; spine.add(dropG);
  const cplate = put(merge(cpg), "plateSilver", dropG, "midframe", 3, IN(SP), "centre-plate"); plates.push(cplate);
  built.plates = { main: plates[0], members: plates, anchors: [new T.Vector3(8.8, 0, -0.75), new T.Vector3(8.8, 0, -0.5)] };
  built.cplate = dropG; built.wings = wings;

  // the screen over the hinge (screen, so not marked hinge): display on top, the steel support plate's grey below
  const sg = stripMesh(T), strip = ctx.mk(sg, [S.dispMat, door], spine, false); strip.name = "hinge.fold-strip";
  tag(strip, "screen", 4, SP); built.strip = strip;
  updateHinge(S.ang);
  if (params.hingecheck) startHingeCheck();
}

/* Pose everything that moves inside the hinge for hinge angle deg (S.setFold calls it). */
let lastKey = null;
export function updateHinge(deg) {
  if (!built.strip || deg === lastKey) return; lastKey = deg;
  const phi = (180 - deg) / 2 * Math.PI / 180, st = stripSolve(phi), { P, ZD, TS, W1, LK } = HV;
  stripFill(built.strip.geometry, st);
  // the centre plate: its top 0.1 under the strip's lowest point (the loop's bottom, on x = 0), never above z −0.5
  const low = st.pts[st.pts.length - 1][1] - TS;
  built.cplate.position.z = Math.min(-0.5, low - 0.1) + 0.5;
  // the wing plates: the run glued to them, back in the panel's frame (the panel turns by φ about (P, −P)), gives the
  // plate's pose; the deck's is the mirror image
  const c = Math.cos(-phi), s = Math.sin(-phi), toPanel = (q) => { const dx = q[0] - P, dz = q[1] + P; return [P + dx * c - dz * s, -P + dx * s + dz * c]; };
  const a = toPanel(st.pts[st.w0]), b = toPanel(st.pts[st.w0 + 1]), a0 = [W1 - LK, ZD];
  const al = Math.atan2(-(b[1] - a[1]), -(b[0] - a[0])), ca = Math.cos(al), sa = Math.sin(al);
  const px = a[0] - (a0[0] * ca - a0[1] * sa), pz = a[1] - (a0[0] * sa + a0[1] * ca);
  built.wings.panel.position.set(px, 0, pz); built.wings.panel.rotation.y = -al;
  built.wings.deck.position.set(-px, 0, pz); built.wings.deck.rotation.y = al;
  // gears and cams turn about their shafts with the fold (± φ × ratio)
  built.spin.forEach((m) => { m.rotation.z = phi * m.userData.spin; });
}

// one parts.js entry with leaf "spine" (called by internals.buildInternals through ctx.spinePart): return the built
// mesh for that id, with every piece of it marked to the part so a click on any piece opens the card
const PART_MAP = { "hinge-0": (b) => b.modules[0], "hinge-1": (b) => b.modules[1], "hinge-2": (b) => b.modules[2],
  "hinge-cover": (b) => b.cover, "hinge-beam": (b) => b.beam, "hinge-plates": (b) => b.plates };
export function buildSpinePart(p, ctx) {
  if (p.render === "flex") return null;   // ribbons: B5 draws them
  const e = PART_MAP[p.id] && PART_MAP[p.id](built);
  if (!e) { const m = ctx.partBox(p, ctx); if (/^hinge-/.test(p.id)) mark(m, { hinge: true }); return m; }
  e.members.forEach((m) => mark(m, { part: p }));
  e.main.userData.anchors = e.anchors;
  return e.main;
}

/* ---------- the stills' spine box (build/shoot.py, dark-slot check) ----------
   The screen rectangle (CSS px of the page) between the two halves' back plates' edges at the hinge, round the spine
   cover: the cover's outer section and each half's hinge-side back-plate corner (the keyboard half's inner plate, not
   its face plate: its dark keys sit just past that), at nine places along y. shoot.py counts near-black pixels inside
   it on the back15 ... back90 stills. */
const FC = () => window.__fc || (window.__fc = {});
FC().spineBox = () => {
  if (!built.cover || !S.cam) return null;
  const cov = built.cover.main, v = cov.position.clone(), r = document.getElementById("mount").getBoundingClientRect();
  const panel = built.wings.panel.parent, deck = built.wings.deck.parent;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  S.asm.updateMatrixWorld(true);
  const add = (g, x, y, z) => { v.set(x, y, z); g.localToWorld(v); v.project(S.cam);
    const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); };
  for (let k = 0; k <= 8; k++) { const y = -HV.YC + 2 * HV.YC * k / 8;
    coverOutline().forEach((q) => add(cov.parent, q[0], y, q[1]));
    add(panel, HV.P, y, -GEO.t - 0.2); add(deck, -HV.P, y, -GEO.t - 0.2); }
  return { x0, x1, y0, y1 };
};
/* the slot's width (build/shoot.py, the dark-slot stills; FABLE-REVIEW-2 N9c). The near-black count above misses a
   grey slot: the halves' inner walls are frame metal, so a 1.5 mm gap beside the spine would show mid-grey. slotLines():
   at nine places along the spine, a line across it on the outside, sampled every 0.05 mm: 3 mm of the screen half's
   back plate, its edge beside the hinge, the cover's outer section from the panel's side to the deck's, and the
   keyboard half's edge. Each line: its points in CSS px of the page, how many of the first are on the back plate, and
   the px per mm there (the larger of the spine's axis and its width, as projected: the one least foreshortened).
   teardown.js (slotGap) finds which of those points show the inside of the phone. */
FC().slotLines = () => {
  if (!built.cover || !S.cam) return null;
  const sp = built.cover.main.parent, panel = built.wings.panel.parent, deck = built.wings.deck.parent, r = document.getElementById("mount").getBoundingClientRect();
  const V = built.cover.main.position.constructor, a = new V(), b = new V(), p = new V(), zb = -GEO.t - 0.2, half = coverOutline().slice().reverse();
  S.asm.updateMatrixWorld(true);
  const W = (g, x, y, z, out) => g.localToWorld(out.set(x, y, z));
  const scr = (v) => { p.copy(v).project(S.cam); return [+(r.left + (p.x + 1) / 2 * r.width).toFixed(2), +(r.top + (1 - p.y) / 2 * r.height).toFixed(2)]; };
  const dist = (u, w) => Math.hypot(u[0] - w[0], u[1] - w[1]);
  const lines = [];
  // (1 mm short of the shell's ends: a line on the seam where the shell meets its end plate runs along the seam's 1 px)
  for (let k = 0; k <= 8; k++) {
    const y = -(HV.YC - 1) + 2 * (HV.YC - 1) * k / 8, path = [[panel, HV.P + 3, zb], [panel, HV.P, zb]].concat(half.map((q) => [sp, q[0], q[1]]), [[deck, -HV.P, zb]]);
    const pts = []; let ref = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      W(path[i][0], path[i][1], y, path[i][2], a); W(path[i + 1][0], path[i + 1][1], y, path[i + 1][2], b);
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.05));
      for (let j = 0; j < n; j++) { pts.push(scr(p.copy(a).lerp(b, j / n))); if (i === 0) ref++; }
    }
    pts.push(scr(b));
    const c = (yy, xx, zz) => scr(W(sp, xx, yy, zz, a));
    const pxmm = Math.max(dist(c(y - 5, 0, HV.ZR), c(y + 5, 0, HV.ZR)) / 10, dist(c(y, -2, HV.ZR), c(y, 2, HV.ZR)) / 4);
    lines.push({ y: +y.toFixed(2), pts, ref, pxmm: +pxmm.toFixed(3) });
  }
  return lines;
};
/* the crease (build/shoot.py, the crease150 still; FABLE-REVIEW-2 N4). strip(deg): the solved strip at that angle, its
   display's lowest point (spine coords, mm), its wing tilt ψ in degrees and the length it holds per half.
   creaseBox(y0, y1): screen rectangles (CSS px), between y0 and y1 along the spine, of the fold band (the strip's
   display within 2.5 mm of the middle) and of each half's display 1 to 6 mm past the strip, for the luminance test, and
   the strip's lowest point at the current angle. */
FC().strip = (deg) => { const st = stripSolve((180 - deg) / 360 * Math.PI);
  return { low: +Math.min(...st.pts.map((q) => q[1])).toFixed(3), psi: +(st.psi * 180 / Math.PI).toFixed(2), len: +st.len.toFixed(3) }; };
FC().creaseBox = (y0, y1) => {
  if (!built.strip || !S.cam) return null;
  const r = document.getElementById("mount").getBoundingClientRect(), st = stripSolve((180 - S.ang) / 360 * Math.PI), v = built.strip.position.clone();
  S.asm.updateMatrixWorld(true);
  const box = (pts, g) => { let x0 = 1e9, x1 = -1e9, ya = 1e9, yb = -1e9;
    pts.forEach((q) => [y0, y1].forEach((y) => { v.set(q[0], y, q[1]); g.localToWorld(v); v.project(S.cam);
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); ya = Math.min(ya, sy); yb = Math.max(yb, sy); }));
    return { x0: +x0.toFixed(1), x1: +x1.toFixed(1), y0: +ya.toFixed(1), y1: +yb.toFixed(1) }; };
  const mid = st.pts.filter((q) => q[0] <= 2.5), half = (s) => [[s * (HV.W1 + 1), HV.ZD], [s * (HV.W1 + 6), HV.ZD]];
  return { band: box(mid.concat(mid.map((q) => [-q[0], q[1]])), built.strip.parent),
    panel: box(half(1), built.wings.panel.parent), deck: box(half(-1), built.wings.deck.parent), low: FC().strip(S.ang).low };
};
/* the hinge's ends (FABLE-REVIEW-2 N3; build/shoot.py, the hingetop stills). spineAt(y): a point on the spine's axis
   between the pivots (spine coords (0, y, −P)) in world mm, to aim a close-up at. bezelLine(y, n): n points across the
   fold on the screen's face (spine coords x −6 to 6, z 0) at y, in CSS px, and the px per mm along it. */
FC().spineAt = (y) => { const v = built.cover.main.position.clone().set(0, y, -HV.P); S.asm.updateMatrixWorld(true); built.cover.main.parent.localToWorld(v); return v.toArray(); };
FC().bezelLine = (y, n) => {
  if (!built.cover || !S.cam) return null;
  const r = document.getElementById("mount").getBoundingClientRect(), v = built.cover.main.position.clone(), out = [];
  S.asm.updateMatrixWorld(true);
  for (let i = 0; i < n; i++) { v.set(-6 + 12 * i / (n - 1), y, 0); built.cover.main.parent.localToWorld(v); v.project(S.cam);
    out.push([+(r.left + (v.x + 1) / 2 * r.width).toFixed(2), +(r.top + (1 - v.y) / 2 * r.height).toFixed(2)]); }
  const a = out[0], b = out[n - 1];
  return { pts: out, pxPerMm: Math.hypot(b[0] - a[0], b[1] - a[1]) / 12 };
};

/* ---------- collision sweep (?hingecheck=1; research §11.2 item 9, B3's 1° method) ----------
   From 0° to 180° in 1° steps: every triangle near the spine (spine coords |x| ≤ 9, z −7.5 to 5) of every mesh is put
   in the spine's frame, and each pair of triangles from two bodies that move against each other (the spine, the
   panel, the deck, the strip, the centre plate, each wing plate, each gear and cam, each hinge flex cable) is tested
   for a crossing (an edge of one passing through the other). Faces that only touch do not count. Named contacts that
   are not failures, listed in the result: the two halves' screen sides where they meet when shut (the published
   12.5 mm counts the two screen faces as touching, and each half's glass stands 0.12 proud of its frame: within 0.25 of the
   screens' plane, at 3° or less), the strip where it
   joins each half's screen, and a cable at its own two connectors. A cable's run inside a half, past the hinge zone
   (beyond x 5.5 in that half's own frame: only the arms, in other places along y, are further in), is that half's
   routing, not the hinge's, and is not tested. Result in
   __fc.hingecheck; a crossing also goes to __fc.errors. */
// (also callable from the console or a test: __fc.hingeCheck(step))
FC().hingeCheck = (step) => hingeCheck(step);
function startHingeCheck() {
  const go = () => { if (!FC().ready) { setTimeout(go, 200); return; } hingeCheck().catch((e) => { console.error("hingecheck: " + e.message); }); };
  setTimeout(go, 200);
}
export async function hingeCheck(step) {
  step = step || 1;
  const T = built.strip.constructor, V3 = built.strip.position.constructor, M4 = built.strip.matrixWorld.constructor;
  const spine = built.strip.parent, panel = built.wings.panel.parent, deck = built.wings.deck.parent, t0 = performance.now();
  const layerOf = new Map(); S.reg.forEach((r) => layerOf.set(r.obj, r.layer));
  const bodyOf = (o) => {
    if (o === built.strip) return "strip";
    if (o.userData.spin) return o.name;
    if (/^ribbon\.fx-hinge/.test(o.name)) return o.name;
    for (let p = o; p; p = p.parent) { if (p === built.cplate) return "centre plate"; if (p === built.wings.panel) return "wing panel";
      if (p === built.wings.deck) return "wing deck"; if (p === spine) return "spine"; if (p === panel) return "panel"; if (p === deck) return "deck"; }
    return null; };
  const ribEnds = { "ribbon.fx-hinge-a": ["board-up", "mmwave"], "ribbon.fx-hinge-b": ["board-up", "subboard"] };
  // the meshes and their triangles in their own frames (instances expanded), once
  const meshes = [];
  S.asm.traverse((o) => { if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; const body = bodyOf(o); if (!body) return;
    meshes.push({ o, body, screen: layerOf.get(o) === "screen", part: o.userData.part ? o.userData.part.id : null }); });
  // a half's triangles in its own frame (its group's): only those in its hinge zone (|x| < 10) can come near the spine
  const groupOf = (o) => { for (let q = o; q; q = q.parent) if (q === panel || q === deck || q === spine) return q; return null; };
  const readTris = (m) => { const g = m.o.geometry, p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count, out = [];
    const mats = m.o.isInstancedMesh ? Array.from({ length: m.o.count }, (_, k) => { const mm = new M4(); m.o.getMatrixAt(k, mm); return mm; }) : [new M4()];
    const half = m.body === "panel" || m.body === "deck", toG = new M4(), gp = groupOf(m.o), v = new V3(), w = new V3(), u = new V3(), q = [v, w, u];
    if (half) { gp.updateMatrixWorld(true); toG.copy(gp.matrixWorld).invert().multiply(m.o.matrixWorld); }
    mats.forEach((mm) => { for (let k = 0; k + 2 < n; k += 3) {
      for (let j = 0; j < 3; j++) q[j].fromBufferAttribute(p, ix ? ix.getX(k + j) : k + j).applyMatrix4(mm);
      if (half) { const x = [v, w, u].map((a) => Math.abs(a.clone().applyMatrix4(toG).x)); if (Math.min(...x) > 10) continue; }
      for (let j = 0; j < 3; j++) out.push(q[j].x, q[j].y, q[j].z); } });
    return new Float32Array(out); };
  meshes.forEach((m) => { m.dynamic = m.o === built.strip || /^ribbon\./.test(m.o.name); m.local = readTris(m); });
  const hits = new Map(), touch = new Map(), inv = new M4(), rel = new M4(), save = S.ang;
  // (each pair keeps where its first crossing was, spine coords, to find it)
  const note = (map, key, deg, A, B) => { const e = map.get(key) || { n: 0, angles: [], at: null }; e.n++; if (e.angles[e.angles.length - 1] !== deg) e.angles.push(deg);
    if (!e.at && A) { const c = [0, 1, 2].map((k) => +((A.t[k] + A.t[k + 3] + A.t[k + 6] + B.t[k] + B.t[k + 3] + B.t[k + 6]) / 6).toFixed(2)); e.at = [deg].concat(c); }
    map.set(key, e); };
  const bodyIx = new Map(); meshes.forEach((m) => { if (!bodyIx.has(m.body)) bodyIx.set(m.body, bodyIx.size); m.bi = bodyIx.get(m.body); });
  for (let deg = 0; deg <= 180; deg += step) {
    S.setFold(deg); updateTeardown(0, true);
    // (build/shoot.py --selftest: the centre plate pushed 1 mm up into the screen's strip must be found)
    if (params.fc_fail === "cross") built.cplate.position.z += 1;
    S.asm.updateMatrixWorld(true);
    inv.copy(spine.matrixWorld).invert();
    // the strip and the cables are rebuilt at each angle: read them again
    meshes.forEach((m) => { if (m.dynamic) m.local = readTris(m); });
    // the halves' frames, for a cable's run inside a half
    const toP = new M4().copy(panel.matrixWorld).invert().multiply(spine.matrixWorld), toD = new M4().copy(deck.matrixWorld).invert().multiply(spine.matrixWorld), cv = new V3();
    const inHalf = (t) => { cv.set((t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3, (t[2] + t[5] + t[8]) / 3);
      const p = cv.clone().applyMatrix4(toP), d = cv.applyMatrix4(toD); return (p.x > 5.5 && p.z > -7 && p.z < 0.3) || (d.x < -5.5 && d.z > -7 && d.z < 0.3); };
    // the strip's two joints with the halves' screens, this angle (spine coords [x, z])
    const st = stripSolve((180 - deg) / 360 * Math.PI), j0 = st.pts[0], joints = [[j0[0], j0[1]], [-j0[0], j0[1]]];
    // triangles in spine coords, near the spine, binned in a 1 mm grid (numeric keys)
    const tris = [], grid = new Map();
    meshes.forEach((m, mi) => {
      rel.multiplyMatrices(inv, m.o.matrixWorld); const e = rel.elements, L = m.local;
      for (let k = 0; k < L.length; k += 9) {
        const t = new Float32Array(9);
        let xmn = 1e9, xmx = -1e9, ymn = 1e9, ymx = -1e9, zmn = 1e9, zmx = -1e9;
        for (let j = 0; j < 9; j += 3) { const x = L[k + j], y = L[k + j + 1], z = L[k + j + 2];
          const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
          t[j] = X; t[j + 1] = Y; t[j + 2] = Z; if (X < xmn) xmn = X; if (X > xmx) xmx = X; if (Y < ymn) ymn = Y; if (Y > ymx) ymx = Y; if (Z < zmn) zmn = Z; if (Z > zmx) zmx = Z; }
        if (xmx < -9 || xmn > 9 || zmx < -7.5 || zmn > 5) continue;
        // a triangle at a strip joint: any corner within 0.6 of a joint line (both the strip's and the screen's)
        if (m.dynamic && m.o !== built.strip && inHalf(t)) continue;
        let jt = false; if (m.body === "strip" || m.screen) for (let j = 0; j < 9 && !jt; j += 3) for (const q of joints) if (Math.hypot(t[j] - q[0], t[j + 2] - q[1]) < 0.6) jt = true;
        const ti = tris.length; tris.push({ t, mi, jt });
        const gx0 = Math.floor(xmn), gx1 = Math.floor(xmx), gy0 = Math.floor(ymn), gy1 = Math.floor(ymx), gz0 = Math.floor(zmn), gz1 = Math.floor(zmx);
        for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) for (let gz = gz0; gz <= gz1; gz++) {
          const key = ((gx + 20) * 160 + (gy + 80)) * 40 + (gz + 20); let c = grid.get(key); if (!c) grid.set(key, c = []); c.push(ti); }
      }
    });
    const done = new Set();
    grid.forEach((c) => {
      if (c.length < 2) return;
      const b0 = meshes[tris[c[0]].mi].bi; let mixed = false; for (let i = 1; i < c.length && !mixed; i++) if (meshes[tris[c[i]].mi].bi !== b0) mixed = true;
      if (!mixed) return;
      for (let i = 0; i < c.length; i++) { const A = tris[c[i]], ma = meshes[A.mi];
        for (let j = i + 1; j < c.length; j++) { const B = tris[c[j]], mb = meshes[B.mi];
          if (ma.bi === mb.bi) continue;
          const pk = c[i] < c[j] ? c[i] * 4194304 + c[j] : c[j] * 4194304 + c[i]; if (done.has(pk)) continue; done.add(pk);
          if (!triTri(A.t, B.t)) continue;
          const nm = (m) => m.o.name || m.part || "[" + ([].concat(m.o.material)[0].name || "?") + "]";
          const key = [ma.body + ":" + nm(ma), mb.body + ":" + nm(mb)].sort().join(" / ");
          // named contacts
          const halves = (ma.body === "panel" || ma.body === "deck") && (mb.body === "panel" || mb.body === "deck");
          if (halves && ma.screen && mb.screen) { note(touch, "screens meet when shut: " + key, deg); continue; }
          if (halves && deg <= 3 && Math.abs(A.t[0] + A.t[3] + A.t[6] + B.t[0] + B.t[3] + B.t[6]) / 6 < 0.25) { note(touch, "screen sides meet when shut: " + key, deg); continue; }
          if ((ma.body === "strip" && mb.screen && A.jt && B.jt) || (mb.body === "strip" && ma.screen && A.jt && B.jt)) { note(touch, "strip joins the screen: " + key, deg); continue; }
          const rb = ribEnds[ma.o.name] ? [ma, mb] : ribEnds[mb.o.name] ? [mb, ma] : null;
          if (rb && rb[1].part && ribEnds[rb[0].o.name].indexOf(rb[1].part) >= 0) { note(touch, "cable at its connector: " + key, deg); continue; }
          note(hits, key, deg, A, B); } }
    });
    if (deg % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  S.setFold(save); updateTeardown(0, true);
  const list = (map) => [...map.entries()].map(([k, e]) => ({ pair: k, tris: e.n, from: e.angles[0], to: e.angles[e.angles.length - 1], angles: e.angles.length, first: e.at }));
  const res = { ok: hits.size === 0, step, ms: Math.round(performance.now() - t0), meshes: meshes.length, hits: list(hits), named: list(touch) };
  FC().hingecheck = res;
  console.log("hingecheck: " + (res.ok ? "no crossing" : hits.size + " crossing pairs") + " in " + res.ms + " ms, " + res.meshes + " meshes" +
    res.hits.map((h) => "\n  CROSSING " + h.pair + " at " + h.from + "-" + h.to + " deg (" + h.angles + " angles, " + h.tris + " triangle pairs; first at deg, x, y, z " + h.first + ")").join("") +
    res.named.map((h) => "\n  named contact: " + h.pair + " at " + h.from + "-" + h.to + " deg").join(""));
  if (!res.ok) (FC().errors || (FC().errors = [])).push("hingecheck: " + hits.size + " crossing pairs");
  return res;
}
// do two triangles (flat arrays of 9) cross? an edge of one passes strictly through the other
export function triTri(a, b) {
  for (let k = 0; k < 9; k += 3) { const k2 = (k + 3) % 9; if (segTri(a[k], a[k + 1], a[k + 2], a[k2], a[k2 + 1], a[k2 + 2], b)) return true; if (segTri(b[k], b[k + 1], b[k + 2], b[k2], b[k2 + 1], b[k2 + 2], a)) return true; }
  return false;
}
function segTri(px, py, pz, qx, qy, qz, t) {
  const ax = t[0], ay = t[1], az = t[2], ux = t[3] - ax, uy = t[4] - ay, uz = t[5] - az, wx = t[6] - ax, wy = t[7] - ay, wz = t[8] - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.hypot(nx, ny, nz); if (nl < 1e-12) return false;
  const dp = (nx * (px - ax) + ny * (py - ay) + nz * (pz - az)) / nl, dq = (nx * (qx - ax) + ny * (qy - ay) + nz * (qz - az)) / nl;
  const E = 1e-4; if (!((dp > E && dq < -E) || (dp < -E && dq > E))) return false;
  const s = dp / (dp - dq), x = px + (qx - px) * s - ax, y = py + (qy - py) * s - ay, z = pz + (qz - pz) * s - az;
  // barycentric coordinates of the crossing point in the triangle
  const uu = ux * ux + uy * uy + uz * uz, uw = ux * wx + uy * wy + uz * wz, ww = wx * wx + wy * wy + wz * wz, xu = x * ux + y * uy + z * uz, xw = x * wx + y * wy + z * wz;
  const den = uu * ww - uw * uw; if (Math.abs(den) < 1e-18) return false;
  const b1 = (ww * xu - uw * xw) / den, b2 = (uu * xw - uw * xu) / den, e = 1e-5;
  return b1 > e && b2 > e && b1 + b2 < 1 - e;
}
