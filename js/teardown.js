/* Fold Communicator — teardown steps, the two exploded views, flex ribbons, part labels and the part card. Owner: B5.
   Built to BUILD-SPEC 6.6 and 7 (R4 §5), and to FABLE-REVIEW-1 F4, F6, F7, F9, F12 (WP4). Exploded lays the open phone
   flat and lifts its pieces to levels (parts.js `ex`), each level drifting along one fixed screen direction, so the
   stack reads as a diagonal staircase from the default camera. Pieces keep their true thickness: only translation.
   - Simple (the default): the parts.js units, each moved as one piece to its unit's level and labelled once, the way a
     teardown lays a phone out ("there's a motherboard, there are the cameras"). The stack lies back up (run sheet D1):
     the back cover with its camera island on top, the inner screen at the bottom. The small pieces only High detail
     draws (FC_PARTS.detail) are left out.
   - High detail (Options, run sheet D4): every registered piece at its own level, screen up, every piece drawn.
   Flex ribbons (FC_PARTS.flexes) ride the parts they join and stretch between them. Labels sit in side columns. */
import * as THREE from "three";
import { props, S, GEO, params, invalidate, onFinish } from "./state.js";
import { $, fmt, mark } from "./util.js";
import { mat } from "./materials.js";
// B1's floor and shadow hooks. scene.js imports pick() from here; the cycle is safe because neither module uses the
// other's exports while it loads (only later, at run time).
import { setFloor, invalidateShadow } from "./scene.js";

/* Teardown steps: which layers (see parts.js) each one lifts off, and where the camera goes. The exploded view's
   camera is fitted to the stack whenever the step is chosen and whenever the free room on screen changes (fitExplode). */
/* Mechanical (WP5): only the structure (FC_PARTS.mechanical names it), the fold left free so the slider and Play work
   the mechanism (holdCam: Play folds it without moving the camera); its camera is fitted to the structure at 90° open
   (fitMech). */
export const MODES = {
  whole:   { hide: [] },
  back:    { hide: ["back", "cover", "coverscreen"], view: { az: Math.PI + 0.38, el: 0.32, dist: 600, ang: 180 } },
  screens: { hide: ["screen", "midframe", "coverscreen"], view: { az: 0.3, el: 0.38, dist: 600, ang: 180 } },
  explode: { hide: [], view: { az: -0.55, el: 0.5, dist: 700, ang: 180 } },
  mechanical: { hide: [], mech: true, holdCam: true, view: { az: 0.6, el: 0.8, dist: 330, ang: 90 } }
};
// which way a layer flies off when it is removed (+ toward the inner screen, − toward the back). The Mechanical view
// also removes pieces of the other layers: those fly toward the screen when they sit on the screen's side of the
// phone (High detail level above the mid-frames'), else out through the back (see prep: r.ld)
const LIFT = { screen: 1, midframe: 1, back: -1, cover: -1, coverscreen: -1 };

/* Exploded-view method (BUILD-SPEC 7.1): offset = e · (lv·gap·Z + lv·gap·fan·Sd + half·X_leaf + slide), e =
   smoothstep(explode), lv = the piece's level (High detail: its own; Simple: its unit's).
   Sd: the default camera's screen-right direction on the floor, fixed so the fan does not follow the orbit; it is
   taken so that the higher levels drift right in both layouts (screen up and back up).
   half moves each half's whole group (frame included) away from the hinge, so the hinge comes apart sideways.
   High detail keeps the values tuned by eye on `exploded`, `hinge` and `kbdstack` before the units (tried 12 / 0.35 / 8
   and in-between: at the low ends each plate hides most of the one below it). Simple has fewer levels and whole
   units, so it closes up: 11 mm a level, 8 mm apart at the hinge ("less floating", ISAAC-FEEDBACK-26OCT).
   Portrait screens (F7): the camera looks down more (el 0.6) and the fan narrows (× 0.35), so the levels read
   vertically on a tall screen. */
const EXV = {
  simple: { gap: 11, fan: 0.45, half: 8, el: 0.5, back: true },
  detail: { gap: 14, fan: 0.5, half: 10, el: 0.42, back: false }
};
const EX = { az: -0.55, portraitEl: 0.6, portraitFan: 0.35, floorGap: 12, fill: 0.94, lift: 3 };
// the two layouts' turns of the assembly (local (x, y, z) → world): screen up (x, z, −y); back up (−x, −z, −y), the
// phone turned over about its long axis, so its top still points away from the camera
const Q_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const Q_BACK = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0));
const DEF_TGT = new THREE.Vector3(0, -1, 0);                      // where the exploded camera looks (scene.js default)
const FLOOR0 = -GEO.H / 2 - 16;                                   // B1's floor for the assembled phone
// each layout's live numbers: level gap, half move, and the fan direction (gap · fan · Sd, in assembly coords)
const VS = { simple: true, gap: EXV.simple.gap, half: EXV.simple.half, fd: new THREE.Vector2() };
const VD = { simple: false, gap: EXV.detail.gap, half: EXV.detail.half, fd: new THREE.Vector2() };

const root = $("viewer"), mount = $("mount"), labelsEl = $("labels"), leadEl = $("leaders"), cardEl = $("partcard"), detailBox = $("t-detail");
// a still never catches the labels half faded in (their 0.35 s fade raced the capture once the start-up got quicker)
if (params.shot) labelsEl.style.transition = "none";
const mbtns = {};
Object.keys(MODES).forEach((n) => { mbtns[n] = $("m-" + n); });
const FC = () => window.__fc || {};
// the units (parts.js), by id
const UNITS = (window.FC_PARTS && window.FC_PARTS.units) || [], UNIT = {};
UNITS.forEach((u) => { UNIT[u.id] = u; });
// Simple exploded is showing (or being chosen): units, not parts, are what a label or a tap names
const simpleOn = () => props.mode === "explode" && !props.detail;
// the Mechanical view is showing: its own entries (FC_PARTS.mechanical) are what a label or a tap names
const mechOn = () => props.mode === "mechanical";
// the steps whose labels sit in side columns, clear of the model
const colsOn = () => props.mode === "explode" || mechOn();

/* ---------- what the closed-up phone draws (FABLE-REVIEW-1 F2, WP2) ----------
   three.js draws every visible mesh, hidden inside or not (it has no occlusion culling), so the whole phone drew all
   ~200 meshes and ~300k triangles, the chips, springs and screws inside included. In Whole mode, once every part is
   home (no explode, nothing lifted off), the entries registered `inside` are not drawn. Which those are was measured,
   not guessed: id renders of the assembled phone from 400 directions round it and from 48 directions round 45 points
   on it at the closest zoom (220 mm), at fold angles 0° to 180° (the seams, the key gaps and, from 0° to 40°, the slot
   beside the spine cover let a few internal pieces show). A part is `inside` unless SEEN_OUTSIDE names it, and the
   hinge marks its own small pieces (hinge.js). Hidden that way, those renders change no more than slivers in the seams
   and the slot (at worst 0.33 % of the picture, at 10° from 220 mm; 0.1 % at 0°, 0.07 % at 180°; a sliver now shows
   the part behind the hidden one), and at no angle does the background show through the phone.
   SEEN_OUTSIDE: the key mat (between the keys), the inner screen's panels (in the seams) and the spine cover. Since
   hinge v2 closed the slot beside the spine (WP6), the hinge's housings, beam, plates and flex cables show only as
   slivers through the hairlines, and hiding them never lets the background through (re-measured the same way at 0°
   to 180°), so they are inside too; hinge.js marks its own pieces. The ribbons follow their ends, so they go too. When another step is chosen every entry is drawn again before anything moves, so the parts fly out
   as before. */
export const SEEN_OUTSIDE = new Set(["kbd-mat", "inner-oled-p", "inner-oled-d", "hinge-cover"]);

// register a mesh with a teardown layer; ex = exploded-view level (see parts.js)
// opts: { slide: [x, y, z] front coords (the deck mirrors x), leaf: "panel" | "deck" | "spine", inside: true when the
//         closed-up phone hides it entirely (see SEEN_OUTSIDE) }
export function tag(m, layer, ex, opts) {
  opts = opts || {};
  S.reg.push({ obj: m, layer, ex: ex || 0, base: m.position.clone(), slide: opts.slide || null, leaf: opts.leaf, out: 0, hide: false, inside: !!opts.inside });
  return m;
}

// keepCam: change the step without moving the camera (used by the shot hooks)
export function setMode(name, keepCam) {
  const md = MODES[name]; if (!md) return;
  // a unit's card belongs to the view it was opened in (the labels and the taps name other things elsewhere)
  // (a part's card, and its highlight, do not cross into or out of the Mechanical view, which draws other pieces and
  // names its own)
  if (name !== props.mode && S.card && (S.card.u || !!md.mech !== mechOn())) select(null);
  props.mode = name;
  S.reg.forEach((r) => { r.hide = md.mech ? !r.obj.userData.mech : md.hide.indexOf(r.layer) >= 0; if (!r.hide && !r.obj.userData.onlyHidden) r.obj.visible = true; });
  ghosts(!!md.mech);
  caption();   // (before the fit: the caption is part of the readout box the fit keeps clear of)
  S.explodeT = name === "explode" ? 1 : 0;
  S.lockFold = name === "explode"; $("hinge").disabled = S.lockFold;   // the fold stays open flat while exploded, and the slider shows it can't move (F13)
  Object.keys(mbtns).forEach((n) => mbtns[n] && mbtns[n].classList.toggle("on", n === name));
  root.classList.toggle("teardown", name !== "whole");
  labelsEl.classList.toggle("cols", colsOn()); sizesKey = "";
  if (name === "whole") select(null);
  else if (S.sel && S.sel.mesh && md.hide.indexOf(S.sel.p.layer) >= 0) select(null);
  if (name === "explode") { fitExplode(false); if (S.explode < 0.01) fitC.pos.copy(fitT.pos), fitC.minY = fitT.minY; overlapsDue = true; }
  else delete FC().overlaps;
  if (md.mech) fitMech(false);
  if (md.view && !keepCam) { S.goView(md.view); S.markBtn(null); }
  invalidate();
}

// High detail on or off (the Options box, a SHOTS row's `detail`, ?detail=1). In the exploded step the stack turns
// over and re-forms; the camera goes to the new layout's fitted view unless keepCam.
export function setDetail(on, keepCam) {
  on = !!on; if (detailBox) detailBox.checked = on;
  if (on === !!props.detail) return;
  props.detail = on;
  if (S.card && S.card.u) select(null);
  if (props.mode === "explode") {
    sizesKey = ""; overlapsDue = true; fitExplode(false);
    if (!keepCam) { S.goView(MODES.explode.view); S.markBtn(null); }
  }
  invalidate();
}

/* ---------- the halves, the units and each piece's exploded move ---------- */
let G = null;   // { panel, deck, spine }: the three groups under the assembly
function groups() {
  if (G) return G;
  G = {};
  S.reg.forEach((r) => { const par = r.obj.parent; if (r.leaf && par && par.parent === S.asm && !G[r.leaf]) G[r.leaf] = par; });
  return G;
}
function leafOf(o) {
  const g = groups();
  for (let p = o; p && p !== S.asm; p = p.parent) for (const k in g) if (g[k] === p) return k;
  return "spine";
}
const XL = { panel: 1, deck: -1, spine: 0 };
const portrait = () => mount.clientWidth < mount.clientHeight;
const smooth = (x) => x * x * (3 - 2 * x);
const ZERO3 = [0, 0, 0];

/* Level nudges (BUILD-SPEC 6.6 item 6: "small level nudges, ±0.3"), High detail only, by mesh name, found with
   ?explodecheck=1. The swing arms slide 3.5 mm out from the hinge (B3's slide), over the edge of the parts beside them:
   - the arms with their sliders and pins (−1.5) would sit 0.2 mm into the main board (−1.4, only 1.4 mm higher):
     one step lower (−1.8) they float just under it, still between the beam (−3.0) and the cams (−0.9);
   - the arm screws (−0.1) would sit in the cells' edge (0): one step lower (−0.4) they float between their arms and
     the cells, still above the arms, as screws taken out. */
const NUDGE = [[/^hinge\.(arm|sliders|pin)-(panel|deck)/, -0.3], [/^hinge\.(screws|recess)-(panel|deck)/, -0.3]];
/* The inner screen is one laminated plate: glass, lit OLED and backing (F4). It is built as the backing (internals.js,
   the inner-oled parts) plus the glass and the display (exterior.js), per half so it can fold; exploded, all of it
   rises as one plate at the backing's level, and the label and a tap on the lit face name the panel. Across the halves
   it is still one panel (parts.js: "One panel runs across both halves"; G2-03): every "screen" layer entry on a half
   cancels its half's sideways move, so the two halves meet over the hinge's fold strip instead of parting like the
   frames below them. In Simple the unit table says the same (the inner screen is `rigid`). */
const PLATE_LV = 4;
// the hinge's small pieces (FC_PARTS.detail.hinge), by the first word of their mesh name. Matched by name because
// hinge.js names every piece "hinge.<word>-<where>" and does not mark detail itself; a renamed piece just stays drawn.
const HINGE_D2 = (() => { const w = ((window.FC_PARTS || {}).detail || {}).hinge || [];
  return w.length ? new RegExp("^hinge\\.(" + w.join("|") + ")(-|$)") : null; })();

/* Units (parts.js, WP4). Each registered entry belongs to the unit that `take`s it (the outside shell, the screens,
   the keycaps: pieces of no part, or of a part that sits in another unit's layer), else to its part's unit; the unit
   is written on every mesh of the entry (userData.unit), which is how a tap or a label check names it in Simple. */
function unitOf(r) {
  const o = r.obj, p = o.userData.part;
  for (const u of UNITS) for (const t of (u.take || [])) {
    if (t.layer && t.layer !== r.layer) continue;
    if (t.flag && !o.userData[t.flag]) continue;
    if (t.part === false && p) continue;
    return u;
  }
  return (p && UNIT[p.unit]) || null;
}
let prepped = false;
const UQ = {};                 // unit id → its label entry (built for every unit: the card and the taps use it too)
const D2K = [];                // child meshes drawn only in High detail (internals.js detail kinds)
// once, after the build and measureBases: each entry's unit, levels, layout moves; the F4 plate; the detail pieces
function prep() {
  if (prepped) return; prepped = true;
  const plate = {};
  S.parts.forEach((q) => { if (/^inner-oled-/.test(q.p.id) && q.mesh) plate[q.p.leaf] = q; });
  S.reg.forEach((r) => {
    r.lf = r.leaf || leafOf(r.obj); r.mx = r.lf === "deck" ? -1 : 1;
    const nd = NUDGE.find((x) => x[0].test(r.obj.name || ""));
    r.lvD = r.layer === "screen" ? PLATE_LV : r.ex + (nd ? nd[1] : 0);
    r.homeD = r.layer === "screen" && r.lf !== "spine" ? "spine" : null;
    r.u = unitOf(r);
    r.lvS = r.u ? r.u.ex : r.lvD;
    r.homeS = r.u && r.u.rigid ? "spine" : null;
    r.slS = r.u ? (r.u.slide || null) : r.slide;
    r.d2 = d2(r.obj);
    // (build/shoot.py --selftest: one High-detail-only piece drawn in Simple must fail the census)
    if (r.d2 && params.fc_fail === "d2" && !S.reg.some((x) => x.failD2)) { r.d2 = false; r.failD2 = true; }
    r.liftDir = 0;
    r.ld = LIFT[r.layer] || (r.lvD > 1 ? 1 : -1);
    if (r.u) r.obj.traverse((o) => { if (o === r.obj || o.isMesh) o.userData.unit = r.u; });
    // F4: the glass and the lit display of a half are the inner screen's own panel; the backing's box takes them in,
    // so the label can sit on the lit face
    const pq = plate[r.lf];
    if (r.layer === "screen" && pq && !r.obj.userData.part) {
      mark(r.obj, { part: pq.p });
      const pr = S.reg.find((x) => x.obj === pq.mesh); if (pr && pr.lbox && r.lbox) pr.lbox.union(r.lbox);
    }
  });
  // the other High-detail-only meshes: the internals' marked details, and the pieces of no entry that are in a
  // small-piece look or are the hinge's small pieces (by name, FC_PARTS.detail.hinge)
  const regd = new Set(S.reg.map((r) => r.obj));
  S.asm.traverse((o) => { if (o.isMesh && !regd.has(o) && (o.userData.detail === 2 || d2(o))) D2K.push(o); });
  prepMech(regd);
}
// a piece only High detail draws, by its name (the hinge's) or its look (FC_PARTS.detail.looks)
let D2LOOK = null;
function d2(o) {
  if (!D2LOOK) D2LOOK = new Set((((window.FC_PARTS || {}).detail || {}).looks || []).map((n) => mat(n)));
  return !!(HINGE_D2 && HINGE_D2.test(o.name || "")) || D2LOOK.has(o.material);
}

// one entry's exploded offset in layout V at full explode, in its group's frame (the group's own half move is
// separate; at 180° every group frame matches the assembly frame, so a rigid entry undoes it here). lk: how far the
// open unit's members are lifted off it (0 to 1, Simple only; see showUnit)
function offsetIn(r, V, out, lk) {
  const lv = V.simple ? r.lvS : r.lvD, home = V.simple ? r.homeS : r.homeD, sl = (V.simple ? r.slS : r.slide) || ZERO3;
  const h = lv * V.gap, cancel = home ? V.half * (XL[r.lf] - XL[home]) : 0;
  return out.set(h * V.fd.x + r.mx * sl[0] - cancel, h * V.fd.y + sl[1], h + sl[2] + (V.simple ? r.liftDir * EX.lift * (lk || 0) : 0));
}
// the fan direction of both layouts for a camera at az (local Sd = the turn's inverse applied to the screen right,
// signed so the levels above the base drift right: up is +z screen up, −z back up)
const _r3 = new THREE.Vector3(), _qi = new THREE.Quaternion();
function setFans(az, port) {
  const k = port ? EX.portraitFan : 1;
  [[VD, Q_UP, 1, EXV.detail], [VS, Q_BACK, -1, EXV.simple]].forEach(([V, q, up, c]) => {
    _r3.set(Math.cos(az), 0, -Math.sin(az)).applyQuaternion(_qi.copy(q).invert());
    V.fd.set(_r3.x, _r3.y).multiplyScalar(up * c.fan * k); });
}
setFans(EX.az, false);

// each entry's box in its group's frame with the part at its assembled place (children included). Measured once,
// right after the build, when every part sits at its base position.
function measureBases() {
  const g = groups(), inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), b = new THREE.Box3();
  S.asm.updateMatrixWorld(true);
  S.reg.forEach((r) => {
    const par = r.obj.parent; inv.copy(par.matrixWorld).invert(); r.lbox = new THREE.Box3();
    r.obj.traverse((o) => { if (!o.isMesh) return;
      const bb = o.isInstancedMesh ? (o.boundingBox || (o.computeBoundingBox(), o.boundingBox)) : (o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox));
      rel.multiplyMatrices(inv, o.matrixWorld); b.copy(bb).applyMatrix4(rel); r.lbox.union(b); });
    r.lbox.translate(new THREE.Vector3().copy(r.base).sub(r.obj.position));   // in case it was not at its base
  });
  return g;
}

/* ---------- framing (F7) ----------
   The stack's target pose (explode = 1, fold 180°, where every group frame equals the assembly frame) is fitted to the
   free part of the viewer: the viewer less the title and readouts at the top, the button bar at the bottom, the
   finish and zoom pill at the side, the part card while it is open, and on a wide screen the two label columns. Every
   visible piece's box is projected (all eight corners), the camera distance is scaled until the projected stack just
   fills that rectangle, and the assembly is shifted, across the view, so the stack sits in its middle (the camera
   keeps looking at its default target, so a double tap still comes back here). Re-fitted on a resize, when the card
   opens or closes, and when the step or the layout changes. */
const fitT = { pos: new THREE.Vector3(0, 30, 0), minY: FLOOR0, ok: false, key: "", D: 0 };   // target
const fitC = { pos: new THREE.Vector3(0, 30, 0), minY: FLOOR0 };                            // eased, drawn
const _fc = new THREE.PerspectiveCamera(), _pts = [], _bx = new THREE.Box3(), _o = new THREE.Vector3(), _p = new THREE.Vector3();
const _rt = new THREE.Vector3(), _up = new THREE.Vector3();
// (the card's height counts in 16 px steps: a phone's card is a band across the bottom, and a part's card is taller
// than its unit's)
const fitKey = () => (mount.clientWidth || 0) + "x" + (mount.clientHeight || 0) + (cardEl.hidden ? "" : "c" + Math.round(cardEl.offsetHeight / 16)) +
  (props.detail ? "d" : "s") + (S.liftUnit ? S.liftUnit.id : "") + (capText ? "m" : "");
// keepZoom: a re-fit while the step is up keeps any zoom the visitor has made (the distance scales with the fit)
function fitExplode(keepZoom) {
  if (!S.reg.length || !S.asm || !S.cam) return;
  if (!S.reg[0].lbox) measureBases();
  prep();
  const W = mount.clientWidth || 1600, Hh = mount.clientHeight || 1000, port = W < Hh, simple = !props.detail, V = simple ? VS : VD;
  const az = EX.az, el = port ? EX.portraitEl : EXV[simple ? "simple" : "detail"].el, q = simple ? Q_BACK : Q_UP;
  setFans(az, port);
  // the pieces' corners in world orientation, before the assembly is placed
  let n = 0; const ctr = new THREE.Box3();
  S.reg.forEach((r) => { if (r.obj.userData.onlyHidden || !r.lbox || r.lbox.isEmpty() || (simple && r.d2)) return;
    offsetIn(r, V, _o, S.liftUnit ? 1 : 0); _o.x += V.half * XL[r.lf]; _bx.copy(r.lbox).translate(_o);
    for (let i = 0; i < 8; i++) { const v = _pts[n] || (_pts[n] = new THREE.Vector3());
      v.set(i & 1 ? _bx.max.x : _bx.min.x, i & 2 ? _bx.max.y : _bx.min.y, i & 4 ? _bx.max.z : _bx.min.z).applyQuaternion(q); ctr.expandByPoint(v); n++; } });
  if (!n) return;
  const F = freeRect(W, Hh), Fw = F.x1 - F.x0, Fh = F.y1 - F.y0, fov = S.cam.fov, th = Math.tan(fov * Math.PI / 360);
  const pos = DEF_TGT.clone().sub(ctr.getCenter(_p));
  let D = ctr.getSize(_p).length() / 2 / Math.sin(fov * Math.PI / 360);
  _fc.fov = fov; _fc.aspect = W / Hh; _fc.near = 1; _fc.far = 20000; _fc.updateProjectionMatrix();
  for (let it = 0; it < 6; it++) {
    _fc.position.set(DEF_TGT.x + D * Math.cos(el) * Math.sin(az), DEF_TGT.y + D * Math.sin(el), DEF_TGT.z + D * Math.cos(el) * Math.cos(az));
    _fc.lookAt(DEF_TGT); _fc.updateMatrixWorld(); _rt.setFromMatrixColumn(_fc.matrixWorld, 0); _up.setFromMatrixColumn(_fc.matrixWorld, 1);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) { _p.copy(_pts[i]).add(pos).project(_fc);
      const sx = (_p.x + 1) / 2 * W, sy = (1 - _p.y) / 2 * Hh;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    // scale the distance so the projected stack fills the free rectangle; the stack's offset from the view's middle
    // scales with it, then shift the assembly (at the target's depth, wpp mm per px) to centre it in the rectangle
    const s = Math.max((x1 - x0) / Fw, (y1 - y0) / Fh) / EX.fill;
    D *= s;
    const wpp = 2 * D * th / Hh, bx = W / 2 + ((x0 + x1) / 2 - W / 2) / s, by = Hh / 2 + ((y0 + y1) / 2 - Hh / 2) / s;
    const dx = (F.x0 + F.x1) / 2 - bx, dy = (F.y0 + F.y1) / 2 - by;
    pos.addScaledVector(_rt, dx * wpp).addScaledVector(_up, -dy * wpp);
  }
  // the result, on screen: build/shoot.py checks that the stack spans enough of the free height (FC().fit)
  _fc.position.set(DEF_TGT.x + D * Math.cos(el) * Math.sin(az), DEF_TGT.y + D * Math.sin(el), DEF_TGT.z + D * Math.cos(el) * Math.cos(az));
  _fc.lookAt(DEF_TGT); _fc.updateMatrixWorld();
  let minY = 1e9; const sb = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
  for (let i = 0; i < n; i++) { minY = Math.min(minY, _pts[i].y + pos.y); _p.copy(_pts[i]).add(pos).project(_fc);
    const sx = (_p.x + 1) / 2 * W, sy = (1 - _p.y) / 2 * Hh;
    sb.x0 = Math.min(sb.x0, sx); sb.x1 = Math.max(sb.x1, sx); sb.y0 = Math.min(sb.y0, sy); sb.y1 = Math.max(sb.y1, sy); }
  const rd = (b) => ({ x0: Math.round(b.x0), x1: Math.round(b.x1), y0: Math.round(b.y0), y1: Math.round(b.y1) });
  FC().fit = { free: rd(F), stack: rd(sb), card: !cardEl.hidden, hFrac: Math.round((sb.y1 - sb.y0) / Fh * 100) / 100, wFrac: Math.round((sb.x1 - sb.x0) / Fw * 100) / 100 };
  const old = fitT.D;
  fitT.pos.copy(pos); fitT.minY = minY; fitT.ok = true; fitT.key = fitKey(); fitT.D = D;
  MODES.explode.view = { az, el, dist: D / (S.fitK || 1), ang: 180 };
  if (keepZoom && old > 0) { S.view.dist *= D / old; invalidate(); }
}

/* The free rectangle (viewer px). Each page control over the viewer takes a band: along the top if it lies in the top
   40 %, along the bottom if in the bottom 40 %, else a strip at its side; the side pill is always a side strip, and
   the part card a bottom band when it spans the viewer (phones) or a left strip (wide screens). */
function freeRect(W, Hh) {
  const f = { x0: 0, x1: W, y0: 0, y1: Hh }, rb = root.getBoundingClientRect();
  root.querySelectorAll(".hud-tl, .hud-tr, details.tweaks > summary, .side, .bar .pill, .tdhint, #partcard, #mcap").forEach((el) => {
    if (el === cardEl && cardEl.hidden) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).display === "none") return;
    // (the Mechanical caption is a side strip where it is narrow, at the bottom left of a wide viewer; a band on a phone)
    const b = { x0: r.left - rb.left, x1: r.right - rb.left, y0: r.top - rb.top, y1: r.bottom - rb.top },
      strip = el === cardEl || el.classList.contains("side") || (el === capEl && b.x1 - b.x0 < 0.6 * W);
    if (el === cardEl && b.x1 - b.x0 > 0.6 * W) f.y1 = Math.min(f.y1, b.y0);
    else if (!strip && b.y1 <= 0.4 * Hh) f.y0 = Math.max(f.y0, b.y1);
    else if (!strip && b.y0 >= 0.6 * Hh) f.y1 = Math.min(f.y1, b.y0);
    else if ((b.x0 + b.x1) / 2 > W / 2) f.x1 = Math.min(f.x1, b.x0);
    else f.x0 = Math.max(f.x0, b.x1);
  });
  const res = colReserve(W); f.x0 = Math.max(f.x0, res) + 8; f.x1 = Math.min(f.x1, W - res) - 8; f.y0 += 8; f.y1 -= 8;
  // a squeezed viewer (or a page laid out oddly) falls back to the whole viewer rather than a sliver
  if (f.x1 - f.x0 < W * 0.3 || f.y1 - f.y0 < Hh * 0.2) return { x0: 8, x1: W - 8, y0: 8, y1: Hh - 8 };
  return f;
}
// px kept free at each side for the label columns (label width + margin + elbow)
const colReserve = (W) => (W < 600 ? 0 : Math.min(260, W * 0.17));

/* ---------- the Mechanical view (FABLE-REVIEW-1 F8, WP5) ----------
   What it draws is what FC_PARTS.mechanical names: the frames, the mid-frames and the whole hinge. Every mesh one of
   its entries names carries the entry (userData.mech): a registered piece without one is lifted off and hidden, as the
   other steps do it; the frame bodies, their inner walls and the marks on them are not registered (they never leave
   the phone), and the entries' boxes are kept for them here (MX) for the labels and the framing.
   See-through (each entry's `ghost`): the spine cover and the screen's support plates over the hinge. Why that and
   not a cut (a clipping plane through the middle module): the gears, cams and springs sit in pockets open toward the
   screen, under the centre plate, and the swing arms' feet ride the cover's shoulders outside it, so with those
   plates and the cover see-through every working piece shows from either side at every fold angle, and the pieces
   that move in front of them (the wing plates tilting, the centre plate sinking) still show moving. A cut shows one
   section, hides the top half of the hinge, needs a second shader program for every material on screen the first
   time it is pressed (each clipping-plane count is its own program: a long first frame on a phone), and three.js
   draws a cut solid as an open shell. The see-through pieces are drawn after the solid ones, without writing depth,
   at GHOST_OPACITY; their copies of the materials follow the finish. */
const MECH = (window.FC_PARTS && window.FC_PARTS.mechanical) || [], MQ = {}, MX = [], GH = [], GM = new Map();
const GHOST_OPACITY = 0.3;
// the view's camera direction (az: into the open V, whose middle is at 0.785 at 90°, turned a little toward the
// keyboard half so the two halves read as two; el: well above, looking down into the V, so the spine runs up the
// view and the fold angle reads as the V's opening), and how much of the free rectangle the structure at 90° fills
// (less than the exploded stack: the label columns share it on a phone)
const MV = { az: 0.6, el: 0.8, ang: 90, fill: 0.86, portraitFill: 0.7 };
// what the camera is fitted to: the middle hinge module, its swing arms and the halves' hinge ends beside it (each
// piece's box cut to this, in its group's frame), so the gears and the screen's loop are big enough to watch and the
// frames run out of the view (FABLE-REVIEW-2 N1: fitted to the whole hinge, the 2 mm gears were 6 px tall). Earlier
// tries, by eye on the stills: the whole structure (the hinge a thin strip in the middle), the whole hinge (the
// mechanism too small), from the back (the cover hides the gears, which sit in pockets open toward the screen), from
// the side, and lower down into the V (the halves fill the view)
const FOCUS = new THREE.Box3(new THREE.Vector3(-14, -22, -50), new THREE.Vector3(14, 22, 50));
let ghostOn = false;
function prepMech(regd) {
  const rx = MECH.map((u) => ({ u, re: u.match ? new RegExp(u.match) : null, gh: u.ghost ? new RegExp(u.ghost) : null,
    parts: new Set(u.parts || []), looks: new Set((u.looks || []).map((n) => mat(n))) }));
  const within = new Set(); S.reg.forEach((r) => r.obj.traverse((o) => { within.add(o); }));
  S.asm.updateMatrixWorld(true);
  S.asm.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || "", p = o.userData.part, loose = !within.has(o) && !regd.has(o);
    const x = rx.find((e) => (e.re && e.re.test(n)) || (p && e.parts.has(p.id)) || (loose && e.looks.has(o.material)));
    if (!x) return;
    o.userData.mech = x.u;
    if (x.gh && x.gh.test(n)) GH.push({ o, m: o.material });
    // (the halves' frames and mid-frames: see-through on the near half when nearly shut, nearGhost)
    else if (x.u.near) { const lf = leafOf(o); if (NG[lf]) NG[lf].push({ o, m: o.material }); }
    if (loose) { const b = (o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).clone().applyMatrix4(o.matrix);
      MX.push({ obj: o, lbox: b, base: o.position.clone(), out: 0 }); }
  });
}
// the see-through copy of a material (one per material: the door and wing plates share theirs); a material array (the
// fold strip: display and backing) gets one per entry
// (the screen's lit face is a pale sheet instead, its picture faded read as stray marks, ruled across every 4 mm: each
// rule follows the screen's section, so its teardrop shows along the whole hinge, not only at its ends)
let SHEET = null;
function sheet() {
  if (SHEET) return SHEET;
  const c = document.createElement("canvas"); c.width = 4; c.height = 32;
  const g = c.getContext("2d"); g.fillStyle = "#b4c6d8"; g.fillRect(0, 0, 4, 32); g.fillStyle = "#3d5d7c"; g.fillRect(0, 14, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, (GEO.H - 2 * GEO.DB) / 4);   // the strip's v runs over the display's height (hinge.js)
  return (SHEET = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
}
function ghostOf(m) {
  if (Array.isArray(m)) return m.map(ghostOf);
  if (m === S.dispMat) return sheet();
  let g = GM.get(m);
  if (!g) { g = m.clone(); GM.set(m, g); }
  Object.assign(g, { transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
  return g;
}
// the finish changed the originals (the spine cover takes the frame's colour): copy them again
onFinish(() => { GM.forEach((g, m) => { g.copy(m); ghostOf(m); }); invalidate(); });
// one mesh see-through or solid again (its own material is kept aside while it is see-through)
function ghostOne(h, on) {
  if (!!h.on === on) return; h.on = on;
  if (on) { h.m = h.o.material; h.o.material = ghostOf(h.m); } else h.o.material = h.m;
  h.o.userData.ghost = on;
}
function ghosts(on) {
  if (on === ghostOn) return; ghostOn = on;
  GH.forEach((h) => ghostOne(h, on));
  if (!on) nearGhost(null);
  invalidateShadow();
}
/* Below NEAR_DEG the two halves close over the hinge and their frames hide it (FABLE-REVIEW-2 N1: at 0° to 30° the
   labels pointed at slivers). The half nearer the camera is then drawn see-through too, its frame, mid-frame and the
   marks on its frame, so the loop of the screen and the plates round it show through it; which half is nearer is the
   one whose back faces the camera. Re-chosen whenever the view or the fold changes (nearGhost). */
const NEAR_DEG = 60, NG = { panel: [], deck: [] }, _nv = new THREE.Vector3(), _nc = new THREE.Vector3();
let nearOn = null;
function nearGhost(leaf) {
  if (leaf === nearOn) return;
  ["panel", "deck"].forEach((k) => NG[k].forEach((h) => ghostOne(h, k === leaf)));
  nearOn = leaf; invalidateShadow();
}
// the half whose back (−z in its own frame) faces the camera, or null above NEAR_DEG
function nearHalf() {
  if (S.ang >= NEAR_DEG || !S.cam) return null;
  const g = groups(); let best = null, bd = 0;
  ["panel", "deck"].forEach((k) => { const G = g[k]; if (!G) return;
    G.updateMatrixWorld(); _nv.set(0, 0, -1).transformDirection(G.matrixWorld); G.getWorldPosition(_nc);
    const d = _nv.dot(_nc.subVectors(S.cam.position, _nc).normalize()); if (d > bd) { bd = d; best = k; } });
  return best;
}
/* Warm-up: the see-through copies are their own shader programs (three.js compiles a program per material state, and
   transparency is part of it), so they are compiled at start-up, alongside scene.js's own warm-up, on a scene with the
   same lights and environment as the real one; otherwise the first press of Mechanical would compile them in its
   first frame. */
function warmGhosts() {
  if (!GH.length || !S.ren || !S.scene || !S.cam) return;
  const sc = new THREE.Scene(); sc.environment = S.scene.environment;
  S.scene.children.forEach((o) => { if (o.isLight) sc.add(o.clone()); });
  GH.concat(NG.panel, NG.deck).forEach((h) => sc.add(new THREE.Mesh(h.o.geometry, ghostOf(h.o.material))));
  S.ren.compileAsync(sc, S.cam).catch(() => { /* a lost context: the first frame compiles them instead */ });
}

/* Framing: as the exploded view's (fitExplode), for the structure at MV.ang open, the pose the view starts in. The
   fold is set there for a moment to measure it (nothing is drawn in between), then put back; the camera's target is
   moved across the view so the structure sits in the middle of the free rectangle. A double tap comes back to it. */
const fitM = { ok: false, key: "", D: 0, tgt: null };
/* The spine held still. Everywhere else the folding phone is re-centred on its own box at each angle with the screen
   half fixed (exterior.js S.setFold), so the hinge slides across the view as it folds. In the Mechanical view the
   assembly is turned and moved instead so the spine stays where it is at MV.ang and the two halves swing about it by
   the same amount, as a book held by its spine: the camera, aimed into the open V, stays aimed at the mechanism at
   every angle. At MV.ang the held pose is the ordinary one, so the fit (fitMech) holds for both. HOLD: the spine's
   place (wx, wz) and half-fold f at MV.ang. holdPose writes the held pose's turn about y (returned) and position. */
const HOLD = { ok: false, wx: 0, wz: 0, f: 0 }, _hp = new THREE.Vector3();
function holdPose(sp) {
  const th = HOLD.f - (180 - S.ang) / 360 * Math.PI, c = Math.cos(th), s = Math.sin(th), x = sp.position.x, z = sp.position.z;
  _hp.set(HOLD.wx - (x * c + z * s), 0, HOLD.wz - (-x * s + z * c));
  return th;
}
function fitMech(keepZoom) {
  if (!S.reg.length || !S.asm || !S.cam || !S.setFold || !prepped) return;
  const asm = S.asm, g = groups(), a0 = S.ang, p0 = asm.position.clone(), r0 = asm.rotation.clone(), gx = {}, ctr = new THREE.Box3();
  Object.keys(g).forEach((k) => { gx[k] = g[k].position.x; });
  let n = 0;
  // (each box cut to the focus first, in its own group's frame: x is the distance from the hinge on a half)
  const add = (b0, M) => { const b = _bx.copy(b0).intersect(FOCUS); if (b.isEmpty()) return;
    for (let i = 0; i < 8; i++) { const v = _pts[n] || (_pts[n] = new THREE.Vector3());
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(M); ctr.expandByPoint(v); n++; } };
  try {
    S.setFold(MV.ang);
    asm.position.set(S.center[0], 0, S.center[1]); asm.rotation.set(0, 0, 0);
    Object.keys(g).forEach((k) => { g[k].position.x = g[k].userData.foldX || 0; });
    // where the spine sits at MV.ang: the view holds it there at every angle (holdPose)
    HOLD.wx = S.center[0] + g.spine.position.x; HOLD.wz = S.center[1] + g.spine.position.z; HOLD.f = (180 - MV.ang) / 360 * Math.PI; HOLD.ok = true;
    asm.updateMatrixWorld(true);
    S.reg.forEach((r) => { if (r.obj.userData.mech && !r.obj.userData.onlyHidden && r.lbox && !r.lbox.isEmpty()) add(r.lbox, r.obj.parent.matrixWorld); });
    MX.forEach((r) => add(r.lbox, r.obj.parent.matrixWorld));
  } finally {
    S.setFold(a0); asm.position.copy(p0); asm.rotation.copy(r0); Object.keys(g).forEach((k) => { g[k].position.x = gx[k]; }); asm.updateMatrixWorld(true);
  }
  if (!n) return;
  const W = mount.clientWidth || 1600, Hh = mount.clientHeight || 1000, F = freeRect(W, Hh), Fw = F.x1 - F.x0, Fh = F.y1 - F.y0;
  const fov = S.cam.fov, th = Math.tan(fov * Math.PI / 360), fill = W < Hh ? MV.portraitFill : MV.fill, { az, el } = MV;
  const tgt = ctr.getCenter(new THREE.Vector3());
  let D = ctr.getSize(_p).length() / 2 / Math.sin(fov * Math.PI / 360);
  _fc.fov = fov; _fc.aspect = W / Hh; _fc.near = 1; _fc.far = 20000; _fc.updateProjectionMatrix();
  const look = () => { _fc.position.set(tgt.x + D * Math.cos(el) * Math.sin(az), tgt.y + D * Math.sin(el), tgt.z + D * Math.cos(el) * Math.cos(az));
    _fc.lookAt(tgt); _fc.updateMatrixWorld(); };
  const sb = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const proj = () => { sb.x0 = sb.y0 = 1e9; sb.x1 = sb.y1 = -1e9;
    for (let i = 0; i < n; i++) { _p.copy(_pts[i]).project(_fc); const sx = (_p.x + 1) / 2 * W, sy = (1 - _p.y) / 2 * Hh;
      sb.x0 = Math.min(sb.x0, sx); sb.x1 = Math.max(sb.x1, sx); sb.y0 = Math.min(sb.y0, sy); sb.y1 = Math.max(sb.y1, sy); } };
  for (let it = 0; it < 6; it++) {
    look(); _rt.setFromMatrixColumn(_fc.matrixWorld, 0); _up.setFromMatrixColumn(_fc.matrixWorld, 1); proj();
    // scale the distance so the structure fills the free rectangle, then move the target across the view (at its own
    // depth, wpp mm per px) so the structure's middle comes to the rectangle's
    const s = Math.max((sb.x1 - sb.x0) / Fw, (sb.y1 - sb.y0) / Fh) / fill;
    D *= s;
    const wpp = 2 * D * th / Hh, bx = W / 2 + ((sb.x0 + sb.x1) / 2 - W / 2) / s, by = Hh / 2 + ((sb.y0 + sb.y1) / 2 - Hh / 2) / s;
    tgt.addScaledVector(_rt, -((F.x0 + F.x1) / 2 - bx) * wpp).addScaledVector(_up, ((F.y0 + F.y1) / 2 - by) * wpp);
  }
  look(); proj();
  const rd = (b) => ({ x0: Math.round(b.x0), x1: Math.round(b.x1), y0: Math.round(b.y0), y1: Math.round(b.y1) });
  FC().fit = { free: rd(F), stack: rd(sb), card: !cardEl.hidden, hFrac: Math.round((sb.y1 - sb.y0) / Fh * 100) / 100, wFrac: Math.round((sb.x1 - sb.x0) / Fw * 100) / 100 };
  const old = fitM.D, oldT = fitM.tgt;
  fitM.ok = true; fitM.key = fitKey(); fitM.D = D; fitM.tgt = tgt.toArray();
  MODES.mechanical.view = { az, el, dist: D / (S.fitK || 1), ang: MV.ang, tgt: fitM.tgt };
  // a re-fit while the view is up keeps the visitor's zoom; the target moves with the fit unless they moved it
  if (keepZoom && old > 0) {
    S.view.dist *= D / old;
    if (oldT && Math.hypot(S.view.tgt[0] - oldT[0], S.view.tgt[1] - oldT[1], S.view.tgt[2] - oldT[2]) < 0.01) S.view.tgt = fitM.tgt.slice();
    invalidate();
  }
}
/* The caption (FABLE-REVIEW-2 N1): one line on what the mechanism is doing at this fold angle, from
   FC_PARTS.mechCaptions ([up to this angle, text], in order); shown only in the Mechanical view.
   Where it sits (F2; it sat under the readout, crowding the size line, and a label's dot landed on it): on a wide
   viewer at the bottom left, just above the hint line (or the button bar, whichever is higher), inside the room the
   left label column keeps free (colReserve), so it covers none of the rectangle the view is fitted to; on a phone,
   where the hint is hidden and the readout sits at the left under Options, just under the readout. Either way it is
   one of the page controls the fit and the labels keep clear of (freeRect, obstacles), and no label's dot may sit
   under it (layoutLabels). build/shoot.py checks it overlaps nothing (__fc.capClear). */
const CAPS = (window.FC_PARTS && window.FC_PARTS.mechCaptions) || [], capEl = $("mcap");
const PHONE_Q = window.matchMedia ? window.matchMedia("(max-width: 560px)") : null;   // index.html's phone layout
let capText = null;
function caption() {
  if (!capEl) return;
  const c = mechOn() ? CAPS.find((x) => S.ang <= x[0] + 0.5) : null, t = c ? c[1] : "";
  if (t === capText) return; capText = t;
  capEl.textContent = t; capEl.hidden = !t;
  placeCap();
}
function placeCap() {
  if (!capEl || capEl.hidden) return;
  const rb = root.getBoundingClientRect(), s = capEl.style;
  // (shoot.py --selftest: the caption put back on the readout must fail the check)
  if (params.fc_fail === "cap") { const d = $("dims").getBoundingClientRect(); s.top = d.top - rb.top + "px"; s.bottom = "auto"; s.left = d.left - rb.left + "px"; return; }
  if (PHONE_Q && PHONE_Q.matches) {
    const tr = root.querySelector(".hud-tr").getBoundingClientRect();
    s.top = Math.round(tr.bottom - rb.top + 8) + "px"; s.bottom = "auto";
  } else {
    let top = rb.bottom;
    root.querySelectorAll(".tdhint, .bar .pill").forEach((el) => { const r = el.getBoundingClientRect(); if (r.height) top = Math.min(top, r.top); });
    s.top = "auto"; s.bottom = Math.round(rb.bottom - top + 10) + "px";
  }
}
// placed again when the viewer or the readout changes size (a resize, the web fonts arriving)
if (capEl && window.ResizeObserver) { const ro = new ResizeObserver(() => { placeCap(); }); ro.observe(root); ro.observe(root.querySelector(".hud-tr")); }
const NARROW_MAX = 9;   // labels on a phone-sized viewer (the units marked phone first, then the biggest; every piece still opens its card)

/* ---------- teardown easing ----------
   Removed layers lift off then vanish; the exploded view spreads every piece to its level, and turns the stack over
   when the layout changes. snap = jump straight to the targets. Returns true while anything is still moving. */
let lastAng = null, wasMoving = false, wasShut = false, floorY = FLOOR0, ribbonsDirty = true;
const tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
S.simple = 1; S.liftE = 0; S.mechE = 0;
export function updateTeardown(dt, snap) {
  const asm = S.asm, ke = snap ? 1 : 1 - Math.exp(-dt * 5), ko = snap ? 1 : 1 - Math.exp(-dt * 7.5);
  if (!asm) return false;
  // a camera view that folds the phone (Hero, Play...) leaves the exploded view first: exploded means open flat
  if (props.mode === "explode" && S.foldTarget !== undefined && S.foldTarget < 179.5) setMode("whole", true);
  // the free room changed (resize, card, layout): fit again, keeping the visitor's zoom
  if (props.mode === "explode" && fitT.ok && fitKey() !== fitT.key) fitExplode(true);
  if (mechOn() && fitM.ok && fitKey() !== fitM.key) fitMech(true);
  let moving = false;
  const ease = (cur, goal, k) => { const v = cur + (goal - cur) * k; if (Math.abs(goal - v) < 0.001) return goal; moving = true; return v; };
  S.explode = ease(S.explode, S.explodeT || 0, ke);
  S.simple = ease(S.simple, props.detail ? 0 : 1, ke);
  S.liftE = ease(S.liftE, S.liftUnit && simpleOn() ? 1 : 0, ke);
  S.mechE = ease(S.mechE, mechOn() && HOLD.ok ? 1 : 0, ke);
  fitC.pos.lerp(fitT.pos, ke); fitC.minY += (fitT.minY - fitC.minY) * ke;
  if (fitC.pos.distanceToSquared(fitT.pos) > 1e-4 || Math.abs(fitC.minY - fitT.minY) > 0.01) moving = true; else { fitC.pos.copy(fitT.pos); fitC.minY = fitT.minY; }
  const e = smooth(S.explode), s = smooth(S.simple), g = groups();
  S.reg.forEach((r) => { const goal = r.hide ? 1 : 0; r.out += (goal - r.out) * ko; if (Math.abs(goal - r.out) < 0.01) r.out = goal; else moving = true; });
  // closed up: Whole mode with every part home; then the inside entries are not drawn (see SEEN_OUTSIDE)
  const shut = props.mode === "whole" && S.explode === 0 && !moving;
  if (shut !== wasShut) { wasShut = shut; ribbonsDirty = true; }
  // Simple exploded leaves out the High-detail-only pieces (FC_PARTS.detail)
  const noD2 = simpleOn();
  if (prepped) {
    S.reg.forEach((r) => {
      r.obj.visible = r.out < 0.97 && !r.obj.userData.onlyHidden && !(shut && r.inside) && !(noD2 && r.d2);
      offsetIn(r, VD, tmpV); if (s > 0) tmpV.lerp(offsetIn(r, VS, tmpS, S.liftE), s);
      r.obj.position.set(r.base.x + e * tmpV.x, r.base.y + e * tmpV.y, r.base.z + e * tmpV.z + r.ld * r.out * 24); });
    // (the Mechanical view keeps the hinge's small pieces, which are the mechanism, but not the mid-frames' tape)
    const noTape = mechOn();
    for (let i = 0; i < D2K.length; i++) D2K[i].visible = !noD2 && !(noTape && D2K[i].userData.detail === 2) && !D2K[i].userData.onlyHidden;
  }
  const half = VD.half + (VS.half - VD.half) * s;
  // (added to the fold's own offset: with hinge v2 the spine and the deck sit off the origin as they turn, exterior.js)
  Object.keys(g).forEach((k) => { g[k].position.x = (g[k].userData.foldX || 0) + e * half * XL[k]; });
  // exploded: lay the open phone flat so the levels rise straight up: screen up (turn about x), or first turned over
  // about its long axis (y), back up. Between the two layouts it rolls over like a page.
  asm.rotation.set(-Math.PI / 2 * e, Math.PI * s * e, 0);
  asm.position.set(S.center[0] + (fitC.pos.x - S.center[0]) * e, fitC.pos.y * e, S.center[1] + (fitC.pos.z - S.center[1]) * e);
  // the Mechanical view holds the spine still while the halves swing about it (HOLD)
  if (S.mechE > 0) { const th = holdPose(g.spine); asm.rotation.y += th * S.mechE; asm.position.lerp(_hp, S.mechE); }
  // and nearly shut, sees through the half nearer the camera; its caption says what the mechanism is doing
  if (ghostOn) nearGhost(nearHalf());
  caption();
  // the floor (contact shadow) sits EX.floorGap below the lowest piece once exploded
  const fy = FLOOR0 + (fitC.minY - EX.floorGap - FLOOR0) * (fitT.ok ? e : 0);
  if (Math.abs(fy - floorY) > 0.01) { floorY = fy; setFloor(fy); }
  // ribbons ride the parts: rewrite them in every frame in which the fold, the explode or a layer moved
  if (snap || moving || ribbonsDirty || S.ang !== lastAng) { lastAng = S.ang; ribbonsDirty = false; updateRibbons(e); }
  if (wasMoving && !moving) { setFloor(floorY); invalidateShadow(); }
  wasMoving = moving;
  if ((snap || !moving) && props.mode === "explode" && S.explode === 1 && (params.shot || params.explodecheck) && (snap || overlapsDue)) { overlapsDue = false; countOverlaps(); }
  if (moving) overlapsDue = true;
  return moving;
}
let overlapsDue = true;

/* ---------- overlap count (BUILD-SPEC 6.6 item 6, G1-11) ----------
   At explode = 1: every visible registered entry's box in assembly coords (children included; ribbons are not
   registered). Pairs on different levels whose boxes overlap by more than 0.05 mm on all three axes are counted.
   Same-level pieces may nest by design (the camera bracket round the cameras; in Simple, a unit's own members, and
   units that nest in the phone, such as the cover screen in the front cover's window); the level tables keep them
   apart. */
function countOverlaps() {
  const asm = S.asm, inv = new THREE.Matrix4(), list = [], simple = !props.detail;
  asm.updateMatrixWorld(true); inv.copy(asm.matrixWorld).invert();
  S.reg.forEach((r) => { if (!shown(r.obj)) return;
    const b = new THREE.Box3().setFromObject(r.obj); if (b.isEmpty()) return; b.applyMatrix4(inv);
    const p = r.obj.userData.part, lv = simple ? r.lvS : r.lvD;
    list.push({ r, b, lv, n: (r.obj.name || (p ? p.id : r.layer)) + "@" + lv }); });
  const pairs = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], c = list[j]; if (a.lv === c.lv) continue;
    const ox = Math.min(a.b.max.x, c.b.max.x) - Math.max(a.b.min.x, c.b.min.x), oy = Math.min(a.b.max.y, c.b.max.y) - Math.max(a.b.min.y, c.b.min.y),
      oz = Math.min(a.b.max.z, c.b.max.z) - Math.max(a.b.min.z, c.b.min.z);
    if (ox > 0.05 && oy > 0.05 && oz > 0.05) pairs.push(a.n + " / " + c.n + " (" + [ox, oy, oz].map((v) => v.toFixed(2)).join(", ") + ")");
  }
  window.__fc.overlaps = pairs.length;
  if (params.explodecheck) console.log("explodecheck (" + (simple ? "simple" : "detail") + "): " + list.length + " entries, " + pairs.length + " overlaps" + (pairs.length ? ":\n  " + pairs.join("\n  ") : ""));
}
function shown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

/* ---------- flex ribbons (BUILD-SPEC 6.5 item 2, 7.3; R4 5.3) ----------
   One BufferGeometry per cable, rewritten while anything moves. Assembled: a Catmull-Rom route through the ends and
   the via points (each via rides its own group, so the route bends with the fold). Exploded: a cubic Bezier whose
   handles leave each connector along its `n`, long when there is slack and short when pulled tight. The two are
   blended point by point with e. The width axis is interpolated from the ends and the via points that set one.
   A 0.25 mm gold stiffener sits on the first 3 mm at each end (one instanced mesh for all). */
const RIB = [];
let stiff = null;
const STIFF_LEN = 3, STIFF_T = 0.25;
function flexMat(color) {
  const k = color === "black" ? "flexBlack" : "flexAmber";
  const m = mat(k).clone(); m.side = THREE.DoubleSide; return m;
}
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const mir = (a, s) => new THREE.Vector3(s * a[0], a[1], a[2]);

function buildRibbons() {
  const D = window.FC_PARTS; if (!D || !D.flexes || !D.flexes.length) return;
  const g = groups(), host = (id) => S.parts.find((q) => q.p.id === id && q.mesh);
  D.flexes.forEach((f) => {
    const ends = [f.from, f.to].map((x) => {
      const q = host(x.part); if (!q) throw new Error("ribbon " + f.id + ": no mesh for part '" + x.part + "'");
      const reg = S.reg.find((r) => r.obj === q.mesh), s = q.p.leaf === "deck" ? -1 : 1;
      // front coords → the host mesh's own frame (group coords less its assembled position)
      return { q, reg, local: mir(x.at, s).sub(reg ? reg.base : q.mesh.position), n: mir(x.n, s).normalize(), w: mir(x.w, s).normalize() };
    });
    const vias = (f.via || []).map((v) => { const s = v.leaf === "deck" ? -1 : 1, grp = g[v.leaf];
      if (!grp) throw new Error("ribbon " + f.id + ": unknown group '" + v.leaf + "'");
      return { g: grp, p: v.leaf === "spine" ? v3(v.at) : mir(v.at, s), w: v.w ? (v.leaf === "spine" ? v3(v.w) : mir(v.w, s)).normalize() : null }; });
    // samples: every control point is a sample, and the segments between them share the rest by length (at 180°, where
    // all group frames match), so bends keep their shape. At least 24 segments (BUILD-SPEC 7.3).
    const ctrl = [ends[0].reg.base.clone().add(ends[0].local)].concat(vias.map((v) => v.p), [ends[1].reg.base.clone().add(ends[1].local)]);
    const nseg = ctrl.length - 1, N = Math.max(24, 3 * nseg), lens = [];
    for (let i = 0; i < nseg; i++) lens.push(Math.max(0.01, ctrl[i].distanceTo(ctrl[i + 1])));
    const tot = lens.reduce((a, b) => a + b, 0), cnt = lens.map(() => 1); let left = N - nseg;
    while (left > 0) { let best = 0, bv = -1; for (let i = 0; i < nseg; i++) { const v = lens[i] / cnt[i]; if (v > bv) { bv = v; best = i; } } cnt[best]++; left--; }
    const us = []; cnt.forEach((c, j) => { for (let i = 0; i < c; i++) us.push((j + i / c) / nseg); }); us.push(1);
    // geometry: (N + 1) × 2 vertices, rewritten in place
    const geo = new THREE.BufferGeometry(), V = us.length;
    const pos = new THREE.BufferAttribute(new Float32Array(V * 6), 3).setUsage(THREE.DynamicDrawUsage);
    const uv = new THREE.BufferAttribute(new Float32Array(V * 4), 2).setUsage(THREE.DynamicDrawUsage);
    const nor = new THREE.BufferAttribute(new Float32Array(V * 6), 3).setUsage(THREE.DynamicDrawUsage);
    const idx = []; for (let i = 0; i < V - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute("position", pos); geo.setAttribute("uv", uv); geo.setAttribute("normal", nor); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, flexMat(f.color)); mesh.name = "ribbon." + f.id; mesh.castShadow = false; mesh.userData.small = true;   // no contact shadow (scene.js)
    S.asm.add(mesh);
    const rb = { f, ends, vias, us, nseg, mesh, geo, W: f.width || 4, seen: !!f.part && SEEN_OUTSIDE.has(f.part),
      cr: new THREE.CatmullRomCurve3(ctrl.map((c) => c.clone()), false, "centripetal"),
      bz: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
      A: us.map(() => new THREE.Vector3()), P: us.map(() => new THREE.Vector3()), Wv: us.map(() => new THREE.Vector3()), s: new Float32Array(V), mid: new THREE.Vector3() };
    if (f.part) {
      const p = D.parts.find((x) => x.id === f.part);
      if (!p) throw new Error("ribbon " + f.id + ": unknown part '" + f.part + "'");
      mesh.userData.part = p;
      // the label anchor follows the ribbon's middle (updateRibbons moves it)
      S.parts.push({ p, mesh, a0: rb.mid, a1: rb.mid, el: null, rib: rb });
    }
    RIB.push(rb);
  });
  // gold stiffeners: two per ribbon, one draw call
  stiff = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat("stiffenerGold"), RIB.length * 2);
  stiff.name = "ribbon.stiffeners"; stiff.castShadow = false; stiff.userData.small = true; S.asm.add(stiff);
  ribbonsDirty = true;
}

const _M = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(),
  _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function updateRibbons(e) {
  if (!RIB.length) return;
  const asm = S.asm; asm.updateMatrixWorld(true); _inv.copy(asm.matrixWorld).invert();
  let any = false;
  RIB.forEach((rb, ri) => {
    const [ea, eb] = rb.ends;
    // shown while both its ends are, or always for a cable seen from outside (SEEN_OUTSIDE)
    rb.mesh.visible = (ea.q.mesh.visible && eb.q.mesh.visible || rb.seen) && !rb.mesh.userData.onlyHidden;
    // a hidden ribbon keeps its old shape (the frame it is shown again in rewrites it, see ribbonsDirty)
    if (!rb.mesh.visible) { _m4.makeScale(0, 0, 0); stiff.setMatrixAt(ri * 2, _m4); stiff.setMatrixAt(ri * 2 + 1, _m4); return; }
    any = true;
    // control points and width axes in assembly coords
    const pts = rb.cr.points, known = [];
    [ea, eb].forEach((x, k) => { _M.multiplyMatrices(_inv, x.q.mesh.matrixWorld);
      const i = k ? pts.length - 1 : 0; pts[i].copy(x.local).applyMatrix4(_M);
      x.nw = (x.nw || new THREE.Vector3()).copy(x.n).transformDirection(_M); x.ww = (x.ww || new THREE.Vector3()).copy(x.w).transformDirection(_M); });
    known.push([0, ea.ww]);
    rb.vias.forEach((v, k) => { _M.multiplyMatrices(_inv, v.g.matrixWorld); pts[k + 1].copy(v.p).applyMatrix4(_M);
      if (v.w) { v.ww = (v.ww || new THREE.Vector3()).copy(v.w).transformDirection(_M); known.push([(k + 1) / rb.nseg, v.ww]); } });
    known.push([1, eb.ww]);
    // a width axis has no sign: keep each one on the same side as the one before, so the ribbon never flips over
    for (let i = 1; i < known.length; i++) if (known[i][1].dot(known[i - 1][1]) < 0) known[i][1].negate();
    // assembled route and its length
    const V = rb.us.length; let L = 0;
    for (let i = 0; i < V; i++) { rb.cr.getPoint(rb.us[i], rb.A[i]); if (i) L += rb.A[i].distanceTo(rb.A[i - 1]); rb.s[i] = L; }
    for (let i = 0; i < V; i++) rb.s[i] = L > 0 ? rb.s[i] / L : i / (V - 1);
    // exploded route: Bezier, handles along each end's n (R4 5.3)
    if (e > 0) {
      const d = pts[0].distanceTo(pts[pts.length - 1]), h = THREE.MathUtils.clamp(0.35 * d + 0.6 * (L - d), 0.2 * d, 0.8 * L);
      rb.bz.v0.copy(pts[0]); rb.bz.v1.copy(pts[0]).addScaledVector(ea.nw, h);
      rb.bz.v2.copy(pts[pts.length - 1]).addScaledVector(eb.nw, h); rb.bz.v3.copy(pts[pts.length - 1]); rb.bz.needsUpdate = true;
    }
    const wEnd = _q.copy(eb.ww); if (wEnd.dot(ea.ww) < 0) wEnd.negate();
    let kk = 0;
    for (let i = 0; i < V; i++) {
      const u = rb.us[i], P = rb.P[i];
      P.copy(rb.A[i]);
      // assembled width axis: linear between the known ones
      while (kk < known.length - 2 && u > known[kk + 1][0]) kk++;
      const k0 = known[kk], k1 = known[kk + 1], f = k1[0] > k0[0] ? THREE.MathUtils.clamp((u - k0[0]) / (k1[0] - k0[0]), 0, 1) : 0;
      _w.copy(k0[1]).lerp(k1[1], f);
      if (e > 0) { rb.bz.getPointAt(rb.s[i], _b); P.lerp(_b, e); _a.copy(ea.ww).lerp(wEnd, rb.s[i]); _w.lerp(_a, e); }
      rb.Wv[i].copy(_w);
    }
    // keep the width axis square to the route, and lay out the two edges
    const pos = rb.geo.attributes.position.array, uvs = rb.geo.attributes.uv.array, hw = rb.W / 2; let arc = 0;
    for (let i = 0; i < V; i++) {
      const P = rb.P[i];
      _t.copy(rb.P[Math.min(V - 1, i + 1)]).sub(rb.P[Math.max(0, i - 1)]); if (_t.lengthSq() < 1e-10) _t.set(1, 0, 0); _t.normalize();
      const w = rb.Wv[i]; w.addScaledVector(_t, -w.dot(_t)); if (w.lengthSq() < 1e-8) w.copy(i ? rb.Wv[i - 1] : _n.set(0, 0, 1).cross(_t)); w.normalize();
      if (i) arc += P.distanceTo(rb.P[i - 1]);
      pos[i * 6] = P.x - w.x * hw; pos[i * 6 + 1] = P.y - w.y * hw; pos[i * 6 + 2] = P.z - w.z * hw;
      pos[i * 6 + 3] = P.x + w.x * hw; pos[i * 6 + 4] = P.y + w.y * hw; pos[i * 6 + 5] = P.z + w.z * hw;
      // mm UVs: the copper traces run along U (the tiled map repeats every 8 mm)
      uvs[i * 4] = arc; uvs[i * 4 + 1] = -hw; uvs[i * 4 + 2] = arc; uvs[i * 4 + 3] = hw;
    }
    rb.geo.attributes.position.needsUpdate = true; rb.geo.attributes.uv.needsUpdate = true;
    rb.geo.computeVertexNormals(); rb.geo.computeBoundingSphere(); rb.geo.computeBoundingBox();
    rb.mid.copy(rb.P[Math.floor(V / 2)]);
    // stiffeners on the first and last 3 mm
    [0, 1].forEach((k) => {
      const i0 = k ? V - 1 : 0, dir = k ? -1 : 1; let i1 = i0, run = 0;
      while (i1 + dir >= 0 && i1 + dir < V && run < STIFF_LEN) { run += rb.P[i1 + dir].distanceTo(rb.P[i1]); i1 += dir; }
      _t.copy(rb.P[i1]).sub(rb.P[i0]); const len = Math.min(STIFF_LEN, _t.length()) || STIFF_LEN; _t.normalize();
      _w.copy(rb.Wv[i0]); _n.crossVectors(_t, _w).normalize();
      _a.copy(rb.P[i0]).addScaledVector(_t, len / 2);
      _m4.makeBasis(_t.multiplyScalar(len), _w.multiplyScalar(rb.W), _n.multiplyScalar(STIFF_T)).setPosition(_a);
      stiff.setMatrixAt(ri * 2 + k, _m4);
    });
  });
  // no ribbon shown: the stiffeners' mesh is not drawn at all
  stiff.visible = any && !stiff.userData.onlyHidden;
  stiff.instanceMatrix.needsUpdate = true; stiff.computeBoundingBox(); stiff.computeBoundingSphere();
}

/* ---------- part and unit labels ----------
   A part gets a label entry when parts.js says `label`; every unit gets an entry (its card and its taps use it), with a
   label button when it is labelled in Simple (`label`) or stands for its members elsewhere (`oneLabel`). A unit's
   label points at its main part, or, with none, at its biggest piece. Button text: the short name; aria-label: the
   full name (F12). */
const SVGNS = "http://www.w3.org/2000/svg";
const ALLQ = [];   // every entry with a label button
const area = (b) => (b && !b.isEmpty() ? (b.max.x - b.min.x) * (b.max.y - b.min.y) : 0);
function makeLabel(q, text, full) {
  const b = document.createElement("button"); b.className = "plabel"; b.type = "button"; b.textContent = text; b.setAttribute("aria-label", full);
  b.addEventListener("click", (e) => { e.stopPropagation(); select(q); }); labelsEl.appendChild(b); q.el = b;
  q.line = document.createElementNS(SVGNS, "polyline"); leadEl.appendChild(q.line);
  q.dot = document.createElementNS(SVGNS, "circle"); q.dot.setAttribute("r", "2.6"); leadEl.appendChild(q.dot);
  ALLQ.push(q);
}
export function createLabels() {
  measureBases();
  prep();
  buildRibbons();
  S.parts.forEach((q) => { q.key = q.p; q.name = q.p.name; if (q.p.label) makeLabel(q, q.p.short || q.p.name, q.p.name); });
  UNITS.forEach((u) => {
    const mq = u.main ? S.parts.find((x) => x.p.id === u.main && x.mesh) : null, ents = S.reg.filter((r) => r.u === u);
    const reg = mq ? (mq.rib ? null : S.reg.find((r) => r.obj === mq.mesh) || null) : ents.reduce((a, r) => (!a || area(r.lbox) > area(a.lbox) ? r : a), null);
    if (!(mq && mq.rib) && !reg) return;   // nothing of it was built
    const q = { u, key: u, name: u.name, p: mq ? mq.p : null, mesh: mq ? mq.mesh : reg.obj, reg, rib: mq ? mq.rib || null : null, gf: !(mq && mq.rib),
      area: ents.reduce((a, r) => a + area(r.lbox), 0), el: null };
    UQ[u.id] = q;
    if (u.label || u.oneLabel) makeLabel(q, u.short || u.name, u.name);
  });
  // the Mechanical view's entries: one label each, on its main piece (a registered piece's measured box, or a frame
  // body's, MX)
  MECH.forEach((u) => {
    const ms = []; S.asm.traverse((o) => { if (o.isMesh && o.userData.mech === u) ms.push(o); });
    const mesh = (u.main && ms.find((o) => o.name === u.main || (o.userData.part && o.userData.part.id === u.main && S.reg.some((r) => r.obj === o)))) || ms[0];
    if (!mesh) return;
    const reg = S.reg.find((r) => r.obj === mesh) || MX.find((r) => r.obj === mesh);
    if (!reg || !reg.lbox || reg.lbox.isEmpty()) return;
    const q = { u, mech: true, key: u, name: u.name, p: null, mesh, reg, rib: null, gf: true, area: area(reg.lbox), el: null };
    MQ[u.id] = q; makeLabel(q, u.short || u.name, u.name);
  });
  warmPicking();
  warmGhosts();
}

/* ---------- id picking (FABLE-REVIEW-1 F1, WP1) ----------
   Which part is in front at a point on screen? Every visible mesh of the model is drawn once more in a flat colour that
   is its id (24 bits in R, G, B; 0 = nothing), into a small render target, and the pixels are read back once. A label
   anchor is then seen when the id under it is its own part's, and a tap opens the part whose id is under the finger.
   This replaces one three.js raycast per anchor, each of which tested every triangle of every mesh it passed (0.3 to
   1 s per label pass, F1). Ids: one per part (every mesh marked with the part shares it, so any piece of a part counts
   as the part, as the raycasts did), then one per other mesh (they hide what is behind them but open nothing). As with
   the raycasts, anything drawn hides what is behind it, see-through films included. Each id material copies its mesh's
   side and polygon offset, so the faces that draw, and the decal that wins over the face under it, are the ones on
   screen. The render targets live on through a WebGL context loss: three.js sets them up again on their next use. */
const ID_SCALE = 0.5;           // label buffer size, in CSS px of the viewer (a quarter of the pixels at pixel ratio 1)
const ID_AUTO_MS = 500;         // while the view turns by itself (auto-rotate never rests): one label check this often
const IDB = { rt: null, buf: null, w: 0, h: 0, ok: false }, IDT = { rt: null, buf: new Uint8Array(4) };
const partIds = new Map(), idParts = [null], idMats = new Map(), _cc = new THREE.Color();
// what a mesh names (its key): its part; in Simple exploded its unit (a piece of no part names its unit too), so a
// tap or a label check finds the unit wherever on it they land
// (in the Mechanical view: its entry)
function keyOf(o, simple, mech) { const p = o.userData.part;
  return mech ? o.userData.mech || null : simple ? o.userData.unit || (p && UNIT[p.unit]) || p || null : p || null; }
// a key's id (1, 2, ...), the same for every mesh with that key
function partId(p) { let id = partIds.get(p); if (id === undefined) { id = idParts.length; idParts.push(p); partIds.set(p, id); } return id; }
// the flat id material for (id, side, polygon offset, see-through), made once. A see-through piece's id writes no depth
// and is drawn first (drawIds), so a solid piece behind it wins the pixel, as it does to the eye: a tap on a gear seen
// through the centre plate opens the gears, and the plate itself only where nothing solid is behind it.
function idMat(id, m, see) {
  const k = id + "|" + m.side + "|" + (m.polygonOffset ? m.polygonOffsetFactor + "," + m.polygonOffsetUnits : "") + (see ? "|g" : "");
  let im = idMats.get(k);
  if (!im) {
    im = new THREE.MeshBasicMaterial({ side: m.side, toneMapped: false, depthWrite: !see });
    // linear in, linear out (a render target has no output colour space and no tone mapping): the bytes read back are
    // exactly the id
    im.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, THREE.LinearSRGBColorSpace);
    if (m.polygonOffset) Object.assign(im, { polygonOffset: true, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits });
    idMats.set(k, im);
  }
  return im;
}
// draw the model's ids into rt from cam (partsOnly: only meshes marked with a part draw; the rest let the view through,
// as the tap raycast did. bigOnly: meshes marked userData.small (screws, springs, a part's surface details; see
// scene.js) do not draw, unless they are a part's own mesh (the ribbons): the label check needs to know which part is in
// front, and those pieces either belong to the part under them or hide less than a label's dot; it halves the draw
// calls of the check; the Mechanical view draws them all: there they are what its labels point at). Every mesh
// gets its own material back afterwards, the highlight of a selected part included.
const _swap = [];
let hosts = null;
function drawIds(cam, rt, partsOnly, bigOnly) {
  const ren = S.ren, list = pickList(), simple = simpleOn(), mech = mechOn();
  if (mech) bigOnly = false;
  if (!hosts || hosts.size !== S.parts.length) hosts = new Set(S.parts.map((q) => q.mesh));
  list.forEach((o) => { const k = keyOf(o, simple, mech); if (k) partId(k); });
  // the other meshes' ids follow the parts', numbered afresh each pass (nothing looks them up)
  let other = idParts.length;
  _swap.length = 0;
  try {
    list.forEach((o) => {
      const ms = Array.isArray(o.material) ? o.material : [o.material], m = ms.find((x) => x.visible);
      const k = keyOf(o, simple, mech), keep = !!m && (!partsOnly || !!k) && !(bigOnly && o.userData.small && !hosts.has(o)), see = !!o.userData.ghost;
      _swap.push(o, o.material, o.visible, o.renderOrder);
      if (!keep) { o.visible = false; return; }
      o.material = idMat(k ? partId(k) : other++, m, see);
      if (see) o.renderOrder = -1;
    });
    ren.getClearColor(_cc); const ca = ren.getClearAlpha(), prev = ren.getRenderTarget();
    ren.setRenderTarget(rt); ren.setClearColor(0x000000, 0);
    ren.render(S.asm, cam);
    ren.setRenderTarget(prev); ren.setClearColor(_cc, ca);
  } finally {
    for (let i = 0; i < _swap.length; i += 4) { _swap[i].material = _swap[i + 1]; _swap[i].visible = _swap[i + 2]; _swap[i].renderOrder = _swap[i + 3]; }
    _swap.length = 0;
  }
}
const idOf = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
// the label check's buffer: the whole view at ID_SCALE, drawn and read back once per check
function refreshIds(cam, W, Hh) {
  if (S.glLost) return false;
  const w = Math.max(1, Math.round(W * ID_SCALE)), h = Math.max(1, Math.round(Hh * ID_SCALE));
  if (!IDB.rt) IDB.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
  if (IDB.w !== w || IDB.h !== h) { IDB.rt.setSize(w, h); IDB.w = w; IDB.h = h; IDB.buf = new Uint8Array(w * h * 4); }
  drawIds(cam, IDB.rt, false, true);
  S.ren.readRenderTargetPixels(IDB.rt, 0, 0, w, h, IDB.buf);
  return (IDB.ok = true);
}
// the id at a point in normalised device coords (x, y in −1..1, y up, as Vector3.project gives), 0 off the view
function idAtNdc(x, y) {
  if (!IDB.ok || x < -1 || x > 1 || y < -1 || y > 1) return 0;
  const px = Math.min(IDB.w - 1, Math.floor((x + 1) / 2 * IDB.w)), py = Math.min(IDB.h - 1, Math.floor((y + 1) / 2 * IDB.h));
  return idOf(IDB.buf, (py * IDB.w + px) * 4);   // read-back rows run bottom up, like y
}
// the id under one point of the viewer (client px), from a 1 × 1 px render of just that pixel at full resolution
// (the camera's view offset crops the view to it), so taps are exact on the smallest part
function idUnder(cx, cy, partsOnly) {
  if (S.glLost || !S.cam) return 0;
  const r = mount.getBoundingClientRect(), cam = S.cam;
  if (!IDT.rt) IDT.rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  cam.setViewOffset(r.width, r.height, cx - r.left - 0.5, cy - r.top - 0.5, 1, 1);
  try { drawIds(cam, IDT.rt, partsOnly); } finally { cam.clearViewOffset(); }
  S.ren.readRenderTargetPixels(IDT.rt, 0, 0, 1, 1, IDT.buf);
  return idOf(IDT.buf, 0);
}
// is any visible mesh of the model under this point (client px)? (scene.js: a double tap on the background)
export function hitsModel(cx, cy) { return idUnder(cx, cy, false) > 0; }
// one id pass now, so the id material's shader programs are compiled at start-up and not at the first label check
export function warmPicking() { if (S.ren && S.cam && mount.clientWidth) refreshIds(S.cam, mount.clientWidth, mount.clientHeight); IDB.ok = false; }

/* When the label check runs: once the view has come to rest (the camera has stopped as updateCamera judges it, and no
   part moves), and then only if something it depends on has changed since the last check: the camera, the viewer's
   size, the step, the fold, the explode, any part's lift, position or visibility. While anything moves the labels keep
   the anchors they had and follow them on screen. A still (?shot=1) checks every frame. */
let lastMode = "", lastAuto = 0, haveSig = false;
const SIG_N = 38, _sig = new Float64Array(SIG_N), _last = new Float64Array(SIG_N);
function fillSig(cam, W, Hh) {
  let out = 0, pos = 0, vis = 0;
  for (let i = 0; i < S.reg.length; i++) { const r = S.reg[i], p = r.obj.position; out += r.out; pos += p.x * 1.3 + p.y * 1.7 + p.z * 2.1; }
  S.asm.traverseVisible((o) => { if (o.isMesh) vis++; });
  const s = _sig; s[0] = W; s[1] = Hh; s[2] = S.ang; s[3] = S.explode; s[4] = out; s[5] = pos + vis * 1e4;
  cam.updateMatrixWorld();
  for (let i = 0; i < 16; i++) { s[6 + i] = cam.matrixWorld.elements[i]; s[22 + i] = cam.projectionMatrix.elements[i]; }
}
// same as at the last check, to 0.001 (mm, degrees, or a matrix entry): far below a pixel
function sameSig() { if (!haveSig || lastMode !== props.mode + (props.detail ? "d" : "")) return false;
  for (let i = 0; i < SIG_N; i++) if (Math.abs(_sig[i] - _last[i]) > 1e-3) return false;
  return true; }

/* Each drawn frame: project each anchor to the screen, hide hidden or covered ones, then place the labels.
   Exploded: two side columns (BUILD-SPEC 7.4), each sorted by screen y, at least 22 px apart; leaders bend once (a
   short diagonal, then a horizontal run). Other steps: labels beside their anchors, straight leaders (as before).
   force: run the label check now, whatever the view is doing (the page's __fc.perf hook times one). */
let sizesKey = "", obst = null, obstKey = "";
const _c = new THREE.Vector3(), _mw = new THREE.Vector3();
// is this entry's label up in the current view? Simple exploded: the units'; elsewhere the parts' own, except where
// their unit gives one label for them all (oneLabel, F9)
function active(q) {
  if (mechOn()) return !!q.mech;
  if (q.mech) return false;
  if (simpleOn()) return !!(q.u && q.u.label);
  if (q.u) return !!q.u.oneLabel;
  const u = UNIT[q.p.unit]; return !(u && u.oneLabel);
}
// an anchor point in world coords: mesh-local for a part (its builder's frame), the group frame for a unit (laid on
// its main piece's measured box, whatever turn the mesh itself has)
function toW(q, v, out) {
  if (!q.gf || !q.u) return q.mesh.localToWorld(out.copy(v));
  out.copy(v).add(_mw.copy(q.mesh.position).sub(q.reg.base)); return q.mesh.parent.localToWorld(out);
}
// does the key the id pass found under an anchor belong to this entry? (outside Simple a unit's label is seen on any
// of its parts)
const owns = (q, k) => !!k && (k === q.key || (!!q.u && k.unit === q.u.id));
export function layoutLabels(cam, force) {
  const on = props.labels && props.mode !== "whole";
  labelsEl.classList.toggle("on", on);
  if (!on || !colsOn()) delete FC().labelOverlaps;   // only the label columns (exploded, Mechanical) are counted
  if (!on) return;
  const W = mount.clientWidth, Hh = mount.clientHeight, cp = cam.position, cols = colsOn();
  // at rest: the camera has stopped by updateCamera's own test (scene.js) and the teardown easing is still
  const c = S.cur, v = S.view, camOff = Math.abs(v.az - c.az) + Math.abs(v.el - c.el) + Math.abs(v.dist - c.dist) / 100 + Math.abs((v.fk || 0) - (c.fk || 0)) +
    Math.abs(v.tgt[0] - c.tgt[0]) + Math.abs(v.tgt[1] - c.tgt[1]) + Math.abs(v.tgt[2] - c.tgt[2]);
  const resting = !S.dragging && !props.autoRotate && !wasMoving && camOff <= 1e-4;
  // auto-rotate never comes to rest: there the labels are checked every ID_AUTO_MS, so they do not stay on the far side
  const now = performance.now(), auto = props.autoRotate && !S.dragging && now - lastAuto >= ID_AUTO_MS;
  let check = !!(force || params.shot || auto);
  if (check || resting) { fillSig(cam, W, Hh); if (!check) check = !sameSig(); }
  if (check && !refreshIds(cam, W, Hh)) check = false;   // no check while the WebGL context is lost
  if (check) { _last.set(_sig); haveSig = true; lastMode = props.mode + (props.detail ? "d" : ""); lastAuto = now; }
  const key = W + "x" + Hh + (cols ? "c" : "s");
  if (key !== sizesKey) { sizesKey = key; ALLQ.forEach((q) => { q.bw = q.bh = 0; }); }
  let vis = [];
  // (in the label columns a dot under a page control, the Mechanical caption say, is not seen either: F2)
  const ob = cols && check ? obstacles(W, Hh) : null;
  ALLQ.forEach((q) => {
    q.show = false; if (!active(q)) return;
    if (q.reg === undefined) q.reg = S.reg.find((r) => r.obj === q.mesh) || null;
    let ok = shown(q.mesh) && (!q.reg || q.reg.out < 0.05), w = null;
    if (ok) {
      // the first of the entry's anchor points (centre first, then out toward its corners) that the camera can see
      if (check || !q.wl) { q.wl = null; const list = cols && check ? outward(q, anchors(q, cp), cam, W) : anchors(q, cp);
        for (let i = 0; i < list.length && !q.wl; i++) {
          if (!check) { q.wl = list[i]; break; }
          const p = toW(q, list[i], _c).project(cam);
          if (p.z >= -1 && p.z <= 1 && owns(q, idParts[idAtNdc(p.x, p.y)]) && !(ob && underControl(ob, (p.x + 1) / 2 * W, (1 - p.y) / 2 * Hh))) q.wl = list[i]; } }
      ok = !!q.wl; if (ok) w = toW(q, q.wl, new THREE.Vector3());
    }
    if (ok) { const p = w.project(cam); if (p.z > 1 || p.x < -1.05 || p.x > 1.05 || p.y < -1.05 || p.y > 1.05) ok = false; q.sx = (p.x + 1) / 2 * W; q.sy = (1 - p.y) / 2 * Hh; }
    q.show = ok; if (ok) vis.push(q);
  });
  // a phone-sized viewer shows at most NARROW_MAX labels: the units marked `phone` first, then the biggest
  if (cols && W < 600 && vis.length > NARROW_MAX) {
    vis.sort((a, b) => prio(b) - prio(a)); vis.slice(NARROW_MAX).forEach((q) => { q.show = false; }); vis = vis.slice(0, NARROW_MAX); }
  // label sizes (read before any write, so the browser lays out once)
  vis.forEach((q) => { if (!q.bw) { q.el.style.display = ""; q.bw = q.el.offsetWidth || 120; q.bh = q.el.offsetHeight || 20; } });
  if (cols) columns(vis, W, Hh, cam); else beside(vis, W);
  ALLQ.forEach((q) => { const d = q.show ? "" : "none"; q.el.style.display = d; q.line.style.display = q.dot.style.display = d; });
}
// which labels a crowded column keeps: the units marked `phone`, then by size (the big pieces keep theirs)
const prio = (q) => (q.u ? (q.u.phone ? 1e7 : 0) + (q.area || 0) : size(q.p));

// anchor points to try, on the face nearer the camera: the centre, then rings out toward the corners.
// A stacked part is usually covered in the middle by the level above, but shows an edge.
const RING = [[0, 0], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, -0.6], [0, 0.6], [-0.6, 0], [0.6, 0],
  [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8], [0, -0.85], [0, 0.85], [-0.85, 0], [0.85, 0],
  // the outer rim, for frames whose middle is covered (the mid-frames under the one-piece inner screen)
  [-0.96, 0], [0.96, 0], [0, -0.96], [0, 0.96], [-0.96, -0.5], [0.96, -0.5], [-0.96, 0.5], [0.96, 0.5]];
function anchors(q, cp) {
  if (q.rib) { const P = q.rib.P, n = P.length - 1; return [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map((f) => P[Math.round(f * n)]); }
  if (!q.cand) q.cand = q.u ? unitCand(q) : partCand(q);
  if (q.cand.length < 2) return q.cand[0];
  const d0 = toW(q, q.cand[0][0], _c).distanceTo(cp), d1 = toW(q, q.cand[1][0], _c).distanceTo(cp);
  return d0 <= d1 ? q.cand[0] : q.cand[1];
}
/* In the side columns (exploded, Mechanical), the anchor points nearest the label's own column are tried first, so
   the dot lands on the piece's outer edge and its leader crosses as little of the stack as it can (FABLE-REVIEW-2
   N12: from the middle of each piece the leaders ran across the stack). The column is the side of the view the
   piece's middle is on, as columns() decides it. */
const _ow = new THREE.Vector3();
function outward(q, list, cam, W) {
  if (!list || list.length < 2) return list;
  const xs = list.map((v) => { const p = toW(q, v, _ow).project(cam); return p.z >= -1 && p.z <= 1 ? p.x : null; });
  if (xs[0] === null) return list;
  const left = (xs[0] + 1) / 2 * W < W / 2, idx = list.map((v, i) => i).filter((i) => xs[i] !== null);
  idx.sort((a, b) => (left ? xs[a] - xs[b] : xs[b] - xs[a]));
  return idx.map((i) => list[i]);
}
// a part's two faces (mesh-local), from its measured box (children and instanced details included, and for the inner
// screen the glass and display it is laminated to, F4), so a point never floats off the part; the centre is the
// builder's anchor centre
function partCand(q) {
  const r = q.reg, b = r && r.lbox, p = q.p;
  let hx = p.rad ? p.rad * 0.7 : (p.x[1] - p.x[0]) / 2, hy = p.rad ? p.rad * 0.7 : (p.y[1] - p.y[0]) / 2, z0 = q.a0.z, z1 = q.a1.z;
  if (b && !b.isEmpty()) { hx = Math.min(hx, (b.max.x - b.min.x) / 2); hy = Math.min(hy, (b.max.y - b.min.y) / 2);
    const lo = b.min.z - r.base.z - 0.05, hi = b.max.z - r.base.z + 0.05; z0 = q.a0.z <= q.a1.z ? lo : hi; z1 = q.a0.z <= q.a1.z ? hi : lo; }
  const faces = [[q.a0, z0], [q.a1, z1]].map(([a, z]) => RING.map((o) => new THREE.Vector3(a.x + o[0] * hx, a.y + o[1] * hy, z)));
  return q.a1 === q.a0 ? [faces[0]] : faces;
}
// a unit's two faces (group frame), on its main piece's measured box
function unitCand(q) {
  const b = q.reg.lbox, cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2;
  return [b.min.z - 0.05, b.max.z + 0.05].map((z) => RING.map((o) => new THREE.Vector3(cx + o[0] * hx, cy + o[1] * hy, z)));
}
// (an anchor is seen when the id under it is its part's: another part in front hides it, and nothing under it means
// the point is off the part, in a notch or a hole)

// non-exploded steps: each label beside its anchor, on the anchor's side of the screen, stacked so none overlap
function beside(vis, W) {
  const L = [], R = []; vis.forEach((q) => (q.sx < W / 2 ? L : R).push(q));
  [[L, -1], [R, 1]].forEach(([list, side]) => { list.sort((a, b) => a.sy - b.sy); let last = -1e9;
    list.forEach((q) => { const y = Math.max(q.sy - 26, last + 21); last = y;
      const x = side < 0 ? Math.max(4, q.sx - 54 - q.bw) : Math.min(W - q.bw - 4, q.sx + 54), ex = side < 0 ? x + q.bw : x;
      place(q, x, y, [[q.sx, q.sy], [ex, y + 10]]); }); });
}

// exploded: label columns at the viewer's left and right edges. A column only uses the stretches of its edge that
// are clear of the page controls and of the model itself, so a label never covers the phone, even zoomed in or on a
// phone-sized screen (where the stack is wide and the labels go above and below it).
function columns(vis, W, Hh, cam) {
  const parts = stackRects(cam, W, Hh), ob = obstacles(W, Hh).concat(parts), narrow = W < 600, m = narrow ? 8 : 24, gapX = 10;
  // the stack's middle on screen decides the side (the framing shifts the stack off the camera's target, F7)
  const cx = parts.length ? (Math.min(...parts.map((r) => r.x0)) + Math.max(...parts.map((r) => r.x1))) / 2 : W / 2;
  // the right column runs down the edge, or just inside the finish/zoom controls where they sit across the middle
  const side = ob.filter((o) => o.side)[0];
  // (on a phone the pill sits high on the right edge, over the column's top stretch: run inside it there too)
  const xR = side && (narrow || (side.y0 < Hh / 2 && side.y1 > Hh / 2)) ? side.x0 - gapX : W - m;
  const pitch = (q) => Math.max(22, q.bh + 3);
  // the columns end at the button bar's top: below it, beside the bar, a label sat in the corner with its leader run
  // under an open card (FABLE-REVIEW-2 N13); the labels that do not fit move to the other side first (below)
  const bars = ob.filter((o) => o.bar), Hc = bars.length ? Math.min(Hh, Math.min(...bars.map((o) => o.y0)) + 8) : Hh;
  // balance the columns: each side takes its own labels up to what its free stretches hold; the overflow goes to the
  // other side, the labels nearest the middle first (on a phone the stack fills the width, and one side fills up)
  const wAll = vis.reduce((a, q) => Math.max(a, q.bw), 0), ph = vis.length ? vis.reduce((a, q) => a + pitch(q), 0) / vis.length : 22;
  const cap = (sd) => { const I = freeIntervals(ob, sd < 0 ? m : xR - wAll, sd < 0 ? m + wAll : xR, Hc);
    return I.reduce((a, iv) => a + Math.floor((iv[1] - iv[0]) / ph), 0); };
  const cL = cap(-1), cR = cap(1);
  /* zoomed in, the model reaches the edges and the columns have little or no free room: all the labels were dropped
     (FABLE-REVIEW-2 N2). When the columns would keep fewer than half the labels (each side holds what its free
     stretches fit, the overflow moving to the other side as below), every label goes beside its anchor instead, over
     the model (the pills are almost opaque), stacked so none overlap */
  { const n = vis.length, n0 = vis.filter((q) => q.sx < cx).length, lo0 = Math.max(0, n - cR), hi0 = Math.min(n, cL);
    const kept = lo0 <= hi0 ? Math.min(n, cL + cR) : Math.min(n0, cL) + Math.min(n - n0, cR);
    if (kept < n / 2) { overModel(vis, W, Hh, ob); FC().labelOverlaps = labelOverlaps(vis.filter((q) => q.show), []); return; } }
  // (in the Mechanical view, when the two sides together cannot hold every label, the least important go first,
  // whichever side they would sit on: on a phone the moving parts' labels, `phone`, keep theirs over the frames')
  if (mechOn() && vis.length > cL + cR) { vis.sort((a, b) => prio(b) - prio(a)); vis.splice(Math.max(0, cL + cR)).forEach((q) => { q.show = false; }); }
  const byX = vis.slice().sort((a, b) => a.sx - b.sx), nL0 = byX.filter((q) => q.sx < cx).length;
  // (when the two together cannot hold them all, each side keeps its own and drops its smallest, below)
  const lo = Math.max(0, byX.length - cR), hi = Math.min(byX.length, cL), nL = lo <= hi ? Math.min(hi, Math.max(lo, nL0)) : nL0;
  const left = byX.slice(0, nL), right = byX.slice(nL);
  [[left, -1], [right, 1]].forEach(([list, sd]) => {
    if (!list.length) return;
    const maxW = list.reduce((a, q) => Math.max(a, q.bw), 0), bx0 = sd < 0 ? m : xR - maxW, bx1 = sd < 0 ? m + maxW : xR;
    const I = freeIntervals(ob, bx0, bx1, Hc), total = I.reduce((a, iv) => a + iv[1] - iv[0], 0);
    // fit the column: drop the smallest parts' labels while it cannot hold them all
    list.sort((a, b) => a.sy - b.sy);
    let need = list.reduce((a, q) => a + pitch(q), 0);
    const drop = () => { let k = 0; list.forEach((q, i) => { if (prio(q) < prio(list[k])) k = i; }); need -= pitch(list[k]); list[k].show = false; list.splice(k, 1); };
    while (list.length && (need > total || (narrow && list.length > NARROW_MAX))) drop();
    // place on the free stretches joined end to end: each label as near its anchor's height as it can be, in anchor
    // order, at least `pitch` apart; then back onto real heights, moving any label that straddles a gap past it
    const toV = (y) => { let acc = 0; for (const [a, b] of I) { if (y < a) return acc; if (y <= b) return acc + y - a; acc += b - a; } return acc; };
    const toR = (v) => { let acc = 0; for (const [a, b] of I) { if (v <= acc + b - a) return a + v - acc; acc += b - a; } return I.length ? I[I.length - 1][1] : 0; };
    const vs = list.map((q) => toV(q.sy - q.bh / 2));
    for (let i = 0; i < list.length; i++) vs[i] = Math.max(vs[i], 0, i ? vs[i - 1] + pitch(list[i - 1]) : 0);
    for (let i = list.length - 1; i >= 0; i--) vs[i] = Math.min(vs[i], i < list.length - 1 ? vs[i + 1] - pitch(list[i]) : total - list[i].bh);
    for (let i = 0; i < list.length; i++) vs[i] = Math.max(vs[i], 0, i ? vs[i - 1] + pitch(list[i - 1]) : 0);
    let last = -1e9;
    list.forEach((q, i) => {
      let y = Math.max(toR(vs[i]), last), k = I.findIndex((iv) => y < iv[1]);
      while (k >= 0 && k < I.length && Math.max(y, I[k][0]) + q.bh > I[k][1]) k++;
      if (k < 0 || k >= I.length) { q.show = false; return; }
      y = Math.max(y, I[k][0]); last = y + pitch(q);
      const x = sd < 0 ? m : xR - q.bw, yc = y + q.bh / 2, edge = sd < 0 ? x + q.bw + 3 : x - 3;
      // leader: anchor → a short diagonal (45°, at least 12 px long) → horizontal to the label
      const dy = yc - q.sy, run = Math.max(8.5, Math.abs(dy));
      let ex = q.sx + sd * run; if (sd < 0 ? ex < edge : ex > edge) ex = edge;
      place(q, x, y, [[q.sx, q.sy], [ex, yc], [edge, yc]]);
      q.box = { x0: x, x1: x + q.bw, y0: y, y1: y + q.bh };
    });
  });
  FC().labelOverlaps = labelOverlaps(vis.filter((q) => q.show), parts);
}

/* The columns' fallback when zoomed in (FABLE-REVIEW-2 N2): each label beside its anchor, on the anchor's side of the
   screen (as beside() does in the other steps), over the model, within the free height (clear of the readout, the
   button bar and an open card) and clear of the side pill; each side stacked in anchor order, a pitch apart, and
   pushed back up from the bottom if it runs over. A side that cannot hold its labels drops its least important. */
function overModel(vis, W, Hh, ob) {
  const F = freeRect(W, Hh), y0 = F.y0, y1 = F.y1, side = ob.filter((o) => o.side)[0], pitch = (q) => Math.max(22, q.bh + 3);
  const L = [], R = []; vis.forEach((q) => (q.sx < W / 2 ? L : R).push(q));
  [[L, -1], [R, 1]].forEach(([list, sd]) => {
    list.sort((a, b) => a.sy - b.sy);
    let need = list.reduce((a, q) => a + pitch(q), 0);
    while (list.length && need > y1 - y0) { let k = 0; list.forEach((q, i) => { if (prio(q) < prio(list[k])) k = i; }); need -= pitch(list[k]); list[k].show = false; list.splice(k, 1); }
    const ys = list.map((q) => q.sy - q.bh / 2);
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], y0, i ? ys[i - 1] + pitch(list[i - 1]) : y0);
    for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i < ys.length - 1 ? ys[i + 1] - pitch(list[i]) : y1 - list[i].bh);
    list.forEach((q, i) => { const y = ys[i];
      let x = sd < 0 ? q.sx - 40 - q.bw : q.sx + 40;
      x = Math.max(8, Math.min(W - 8 - q.bw, x));
      if (side && y < side.y1 && y + q.bh > side.y0) x = Math.min(x, side.x0 - 6 - q.bw);
      const ex = sd < 0 ? x + q.bw : x;
      place(q, x, y, [[q.sx, q.sy], [ex, y + q.bh / 2]]);
      q.box = { x0: x, x1: x + q.bw, y0: y, y1: y + q.bh }; });
  });
}

/* Label check (G2-12): shown labels whose boxes overlap each other, or overlap the phone on screen: the screen box of
   any visible part, without the layout's 4 px padding. (Not one box round the whole stack: the exploded stack is a
   diagonal staircase, and on a phone-sized viewer the labels rightly sit in the empty corners of that box.)
   build/shoot.py fails an exploded view above 0. With ?explodecheck=1 the offending labels are listed with console.log.
   With the labels over the model (zoomed in, overModel) parts is empty: only label on label counts. */
function labelOverlaps(shownQ, parts) {
  const hit = (a, b, pad) => Math.min(a.x1, b.x1 - pad) - Math.max(a.x0, b.x0 + pad) > 0.5 && Math.min(a.y1, b.y1 - pad) - Math.max(a.y0, b.y0 + pad) > 0.5;
  const bad = [];
  shownQ.forEach((a, i) => {
    if (parts.some((r) => hit(a.box, r, 4))) bad.push(a.name + " / phone");
    for (let j = i + 1; j < shownQ.length; j++) if (hit(a.box, shownQ[j].box, 0)) bad.push(a.name + " / " + shownQ[j].name);
  });
  if (params.explodecheck && bad.length) console.log("explodecheck: " + bad.length + " label overlaps:\n  " + bad.join("\n  "));
  return bad.length;
}
// every visible part's box on screen (padded), from the boxes measured at build time and the parts' current moves
const _corner = new THREE.Vector3(), _mv = new THREE.Vector3();
// one entry's box on screen (viewer px), or null when it is hidden or reaches behind the camera
function rectOf(r, cam, W, Hh) {
  if (!r.lbox || r.lbox.isEmpty() || !shown(r.obj)) return null;
  const b = r.lbox, g = r.obj.parent.matrixWorld; _mv.copy(r.obj.position).sub(r.base);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < 8; i++) {
    _corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).add(_mv).applyMatrix4(g).project(cam);
    if (_corner.z > 1) return null;
    const sx = (_corner.x + 1) / 2 * W, sy = (1 - _corner.y) / 2 * Hh;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
  return { x0, x1, y0, y1 };
}
function stackRects(cam, W, Hh) {
  const out = [], one = (r) => { const b = rectOf(r, cam, W, Hh); if (b) out.push({ x0: b.x0 - 4, x1: b.x1 + 4, y0: b.y0 - 4, y1: b.y1 + 4 }); };
  S.reg.forEach(one);
  // (the Mechanical view's frame bodies, which no registry entry holds)
  if (mechOn()) MX.forEach(one);
  return out;
}
/* For the check (build/shoot.py, FABLE-REVIEW-2 N12): the screen box (viewer px) round every visible piece of a unit
   ({ unit: id }) or of a part ({ part: id }), or null. */
FC().screenBox = (sel) => {
  if (!S.cam) return null;
  const W = mount.clientWidth, Hh = mount.clientHeight; let o = null; S.asm.updateMatrixWorld(true);
  S.reg.forEach((r) => { const p = r.obj.userData.part; if (sel.unit ? !(r.u && r.u.id === sel.unit) : !(p && p.id === sel.part)) return;
    const b = rectOf(r, S.cam, W, Hh); if (!b) return;
    o = o ? { x0: Math.min(o.x0, b.x0), x1: Math.max(o.x1, b.x1), y0: Math.min(o.y0, b.y0), y1: Math.max(o.y1, b.y1) } : b; });
  return o;
};
function place(q, x, y, pts) {
  q.el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
  q.line.setAttribute("points", pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "));
  q.dot.setAttribute("cx", q.sx.toFixed(1)); q.dot.setAttribute("cy", q.sy.toFixed(1));
}
// a part's size, for choosing which labels to drop on a small screen (the big parts keep theirs)
function size(p) { if (p.rad) return Math.PI * p.rad * p.rad; return Math.abs((p.x[1] - p.x[0]) * (p.y[1] - p.y[0])); }

// the page controls over the viewer, as boxes in viewer px (re-read when the size or the Options panel changes)
function obstacles(W, Hh) {
  const tw = root.querySelector("details.tweaks"), card = !cardEl.hidden, k = W + "x" + Hh + (tw && tw.open ? "o" : "") + (card ? "c" + cardEl.offsetHeight : "") + (capText || "");
  if (obst && k === obstKey) return obst;
  obstKey = k; obst = [];
  const rb = root.getBoundingClientRect();
  root.querySelectorAll(".hud-tl, .hud-tr, details.tweaks, .side, .bar .pill, .tdhint, #partcard, #mcap").forEach((el) => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).display === "none") return;
    obst.push({ x0: r.left - rb.left, x1: r.right - rb.left, y0: r.top - rb.top, y1: r.bottom - rb.top, side: el.classList.contains("side"), bar: !!el.closest(".bar") }); });
  return obst;
}
// is a point (viewer px) on or within CTRL_PAD px of a page control, or below the button bar's top? (a dot just beside
// a control has its leader run across it: the Mid-frame's, beside the readout's last line, once the caption had moved
// away; and the columns end at the bar's top, so a dot below it has its leader cross the bar: the Frame's on a phone)
const CTRL_PAD = 24;
function underControl(ob, x, y) {
  let bar = 1e9; for (const o of ob) { if (o.bar) bar = Math.min(bar, o.y0);
    if (x > o.x0 - CTRL_PAD && x < o.x1 + CTRL_PAD && y > o.y0 - CTRL_PAD && y < o.y1 + CTRL_PAD) return true; }
  return y > bar - CTRL_PAD;
}
// the free stretches [y0, y1] of a column band [bx0, bx1], top to bottom, between the boxes that cross it
function freeIntervals(ob, bx0, bx1, Hh) {
  const hit = ob.filter((o) => o.x1 > bx0 && o.x0 < bx1).sort((a, b) => a.y0 - b.y0), out = [];
  let y = 8;
  hit.concat([{ y0: Hh - 8, y1: Hh }]).forEach((o) => { const top = y + 6, bot = o.y0 - 6; if (bot - top >= 18) out.push([top, bot]); y = Math.max(y, o.y1); });
  return out;
}

/* ---------- click a part, a unit or a label to read about it ----------
   A part's card: what it is, its size, spec, note and sources. A unit's card (a unit with `what`, parts.js): what it
   is, then what is on it or in it, one row per member; tapping a row lights that part up and opens its own card, with
   a way back. While a unit's card is open in Simple, its members lift EX.lift mm off its main part, so what is on it
   shows apart (FABLE-REVIEW-1 F6). A unit without `what` opens its main part's card. */
S.card = null;   // { q } a part's card, { u } a unit's, { q, u } a part opened from its unit's card
function sizeText(p) { if (p.rad) return "Ø" + fmt(p.rad * 2) + " × " + fmt(p.z[1] - p.z[0]);
  return fmt(p.x[1] - p.x[0]) + " × " + fmt(p.y[1] - p.y[0]) + " × " + fmt(p.z[1] - p.z[0]); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const srcLinks = (keys) => { const src = window.FC_PARTS.sources;
  return keys.length ? '<p class="pc-s">' + keys.map((k) => '<a href="' + src[k].u + '" target="_blank" rel="noopener">' + esc(src[k].t) + '</a>').join(" · ") + '</p>' : ""; };
// the accent highlight on one mesh; a material array (the keycap pattern) is copied piece by piece (F13)
function lightUp(q) {
  const hl = (m) => { const h = m.clone(); if (h.emissive) { h.emissive = new THREE.Color(S.accent); h.emissiveIntensity = 0.45; } return h; };
  q.orig = q.mesh.material; q.mesh.material = Array.isArray(q.orig) ? q.orig.map(hl) : hl(q.orig); S.sel = q;
}
function lightOff() {
  if (!S.sel) return; const m = S.sel.mesh.material;
  (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()); S.sel.mesh.material = S.sel.orig; S.sel = null;
}
function openCard(html) {
  cardEl.innerHTML = '<button class="x" type="button" aria-label="Close">×</button>' + html;
  cardEl.querySelector(".x").addEventListener("click", () => select(null));
  cardEl.hidden = false; cardEl.scrollTop = 0;
  invalidate();
}
// q: a part's or a unit's entry, or null to close. back: the unit whose card this part was opened from
export function select(q, back) {
  lightOff(); S.card = null; S.liftUnit = null;
  if (!q) { cardEl.hidden = true; invalidate(); return; }
  if (q.u) { showUnit(q.u); return; }
  lightUp(q); S.card = { q, u: back || null };
  const p = q.p;
  openCard((back ? '<button class="pc-back" type="button">‹ ' + esc(back.name) + '</button>' : '') +
    // (the keyboard half's copy of a part, skipTable in parts.js, has no tag: its card shows none rather than throwing)
    '<div class="pc-h"><b>' + esc(p.name) + '</b>' + (p.tag ? '<span class="chip ' + p.tag.toLowerCase() + '">' + p.tag + '</span>' : '') + '</div>' +
    (p.what ? '<p>' + esc(p.what) + '</p>' : '') +
    '<dl><dt>Size</dt><dd>' + sizeText(p) + ' mm</dd>' + (p.mAh ? '<dt>Capacity</dt><dd>' + p.mAh.toLocaleString("en-GB") + ' mAh</dd>' : '') +
    (p.spec ? '<dt>Spec</dt><dd>' + esc(p.spec) + '</dd>' : '') + '</dl>' +
    (p.note ? '<p class="pc-n">' + esc(p.note) + '</p>' : '') + srcLinks(p.src || []));
  if (back) cardEl.querySelector(".pc-back").addEventListener("click", () => select(UQ[back.id]));
}
const partQ = (id) => S.parts.find((x) => x.p.id === id && x.mesh);
function showUnit(u) {
  if (!u.what) { const mq = partQ(u.main); if (mq) select(mq); return; }
  const D = window.FC_PARTS, byId = (id) => D.parts.find((p) => p.id === id), mem = u.members.map(byId).filter(Boolean);
  const mAh = mem.reduce((a, p) => a + (p.mAh || 0), 0), src = [...new Set(mem.reduce((a, p) => a.concat(p.src || []), u.src || []))];
  const rows = (u.list || []).filter((x) => byId(x[0])).map(([id, where, role]) => '<li><button type="button" data-part="' + esc(id) + '">' +
    (where ? '<span class="pc-pos">' + esc(where) + '</span>' : '') + '<b>' + esc(byId(id).name) + '</b><small>' + esc(role) + '</small></button></li>').join("");
  S.card = { u };
  openCard('<div class="pc-h"><b>' + esc(u.name) + '</b>' + (u.tag ? '<span class="chip ' + u.tag.toLowerCase() + '">' + u.tag + '</span>' : '') + '</div><p>' + esc(u.what) + '</p>' + (rows ? '<ul class="pc-list">' + rows + '</ul>' : '') +
    (mAh ? '<dl><dt>Capacity</dt><dd>' + mAh.toLocaleString("en-GB") + ' mAh in all</dd></dl>' : '') + srcLinks(src));
  cardEl.querySelectorAll("[data-part]").forEach((b) => b.addEventListener("click", () => { const q = partQ(b.dataset.part); if (q) select(q, u); }));
  // the lift: each member whose middle lies beyond the main part's back or front face moves EX.lift mm further that
  // way (pieces level with it stay), so the chips leave the board and the boards under it drop away. Depths are the
  // parts' own (parts.js z), else the measured box, not the box with the main part's connectors and screws in it.
  const mr = UQ[u.id] && UQ[u.id].reg, zr = (r) => { const p = r.obj.userData.part; return p && p.z ? p.z : [r.lbox.min.z, r.lbox.max.z]; };
  if (mr && mr.lbox && simpleOn()) {
    S.liftUnit = u; const [m0, m1] = zr(mr);
    S.reg.forEach((r) => { r.liftDir = 0; if (r.u !== u || r === mr || !r.lbox || r.lbox.isEmpty()) return;
      const z = zr(r), mz = (z[0] + z[1]) / 2; r.liftDir = mz < m0 ? -1 : mz > m1 ? 1 : 0; });
  }
}

// visible meshes (the id passes draw these)
const _pl = [];
function pickList() { _pl.length = 0; S.asm.traverseVisible((o) => { if (o.isMesh) _pl.push(o); }); return _pl; }
// a tap: the nearest part (in Simple, unit) under the finger opens its card (any piece of it does; meshes of none let
// the tap through to the part behind them, as before). A tap on nothing closes the card.
export function pick(e) {
  const k = idParts[idUnder(e.clientX, e.clientY, true)], q = !k ? null : MQ[k.id] && MQ[k.id].u === k ? MQ[k.id] : k.members ? UQ[k.id] : S.parts.find((x) => x.p === k);
  if (q) select(q); else if (props.mode === "whole" || !cardEl.hidden) select(null); }

// for the check (build/shoot.py; FABLE-REVIEW-2 N13): the shown labels whose top is below the button bar's top
FC().labelsBelowBar = () => {
  const bars = [...root.querySelectorAll(".bar .pill")].map((e) => e.getBoundingClientRect()).filter((r) => r.height);
  if (!bars.length) return [];
  const top = Math.min(...bars.map((r) => r.top));
  return ALLQ.filter((q) => q.show && q.el.getBoundingClientRect().top > top).map((q) => q.name);
};
/* for the check (build/shoot.py; FABLE-REVIEW-2 N9b): the drawn meshes of the model, counted by kind, so a still can
   prove what a view leaves out. detail2: pieces only High detail draws, by their kind (internals.js detail 2) or look
   (FC_PARTS.detail.looks); hingeD2: the hinge's small pieces, by name (FC_PARTS.detail.hinge); noMech: pieces no
   Mechanical entry names (userData.mech); ribbons: the flex cables and their stiffeners; all: every drawn mesh. A mesh
   counts when it and every parent are visible (as three.js draws it). With names: the first few names of each kind. */
FC().census = (names) => {
  const out = { all: 0, detail2: 0, hingeD2: 0, noMech: 0, ribbons: 0 }, nm = { detail2: [], hingeD2: [], noMech: [] };
  if (!S.asm) return null;
  const add = (k, o) => { out[k]++; if (names && nm[k] && nm[k].length < 8) nm[k].push(o.name || (o.userData.part ? o.userData.part.id : "") || (o.parent && o.parent.name ? "in " + o.parent.name : "unnamed")); };
  if (!D2LOOK) d2(S.asm);
  S.asm.traverseVisible((o) => { if (!o.isMesh) return; out.all++;
    if (o.userData.detail === 2 || D2LOOK.has(o.material)) add("detail2", o);
    if (HINGE_D2 && HINGE_D2.test(o.name || "")) add("hingeD2", o);
    if (!o.userData.mech) add("noMech", o);
    if (/^ribbon\./.test(o.name || "")) out.ribbons++; });
  if (names) out.names = nm;
  return out;
};
/* for the check (build/shoot.py; FABLE-REVIEW-2 N9c): the widest slot beside the spine, in mm, measured by what shows
   there, not by how dark it is. Along the lines across the spine (hinge.js slotLines) each point is either the outside
   skin (the spine cover's outer shell, the back covers and the keyboard half's face: the "back", "cover" and
   "coverscreen" layers; the frames, rails and their ends) or a gap: the inside of the phone (the hinge's own pieces
   but the cover, the cover's inner face, the frames' walls at the hinge, the boards, the mid-frames, the screens, the
   cables) or nothing at all (the backdrop seen through the phone). The view is drawn once more, cropped to the lines'
   box, in flat colours (skin black, each gap mesh its own id colour, the backdrop white, with depth, so the front-most
   surface wins, as on screen), and read back once. The widest run of gap points on a line, in screen px, is turned
   into mm with that line's px per mm. Returns { mm, y (the line's place along the spine), at (the run's middle, CSS
   px), px (one drawn pixel in mm there: a gap reads its width give or take one), what (the meshes seen in that run),
   lines (mm per line) }, or null. */
const GAPM = new Map();
// a flat material: skin (id 0) black; gap mesh id i: R, G = i, B = GAP_B; one per (id, side, polygon offset)
const GAP_B = 77;
function gapMat(id, m) {
  const k = id + "|" + m.side + (m.polygonOffset ? "|" + m.polygonOffsetFactor + "," + m.polygonOffsetUnits : "");
  let g = GAPM.get(k);
  if (!g) { g = new THREE.MeshBasicMaterial({ side: m.side, toneMapped: false });
    g.color.setRGB(id ? (id & 255) / 255 : 0, id ? ((id >> 8) & 255) / 255 : 0, id ? GAP_B / 255 : 0, THREE.LinearSRGBColorSpace);
    if (m.polygonOffset) Object.assign(g, { polygonOffset: true, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits });
    GAPM.set(k, g); }
  return g;
}
const SKIN_LAYERS = new Set(["back", "cover", "coverscreen"]), NOGAP = new THREE.MeshBasicMaterial({ visible: false });
FC().slotGap = () => {
  const lines = FC().slotLines ? FC().slotLines() : null;
  if (!lines || !S.ren || !S.cam || S.glLost) return null;
  const r = mount.getBoundingClientRect(), k = S.ren.getPixelRatio();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  lines.forEach((ln) => ln.pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
  x0 = Math.floor(Math.max(r.left, x0 - 2)); y0 = Math.floor(Math.max(r.top, y0 - 2)); x1 = Math.ceil(Math.min(r.right, x1 + 2)); y1 = Math.ceil(Math.min(r.bottom, y1 + 2));
  const w = x1 - x0, h = y1 - y0; if (w < 1 || h < 1) return null;
  const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k)), buf = new Uint8Array(bw * bh * 4);
  const reg = new Map(); S.reg.forEach((x) => reg.set(x.obj, x));
  const gap = (o) => { const n = o.name || "";
    if (/^hinge\./.test(n)) return n !== "hinge.cover";
    if (/^(frame\.hinge-wall|ribbon\.)/.test(n)) return true;
    for (let p = o; p && p !== S.asm; p = p.parent) { const e = reg.get(p); if (e) return !SKIN_LAYERS.has(e.layer); }
    return false; };
  const list = pickList().slice(), keep = [], ids = [null], rt = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: true }), ren = S.ren;
  ren.getClearColor(_cc); const ca = ren.getClearAlpha(), prev = ren.getRenderTarget();
  try {
    // (a mesh none of whose materials draws is not on screen: it draws nothing here either)
    list.forEach((o) => { const ms = Array.isArray(o.material) ? o.material : [o.material], m = ms.find((x) => x.visible); keep.push(o, o.material);
      let id = 0; if (m && gap(o)) { id = ids.length; ids.push(o); }
      o.material = m ? gapMat(id, m) : NOGAP; });
    S.cam.setViewOffset(r.width, r.height, x0 - r.left, y0 - r.top, w, h);
    ren.setRenderTarget(rt); ren.setClearColor(0xffffff, 1); ren.clear(); ren.render(S.asm, S.cam);
    ren.readRenderTargetPixels(rt, 0, 0, bw, bh, buf);
  } finally {
    S.cam.clearViewOffset(); ren.setRenderTarget(prev); ren.setClearColor(_cc, ca);
    for (let i = 0; i < keep.length; i += 2) keep[i].material = keep[i + 1];
    rt.dispose();
  }
  // what a point shows: 0 skin (or not judged: off the view, or under a page control, where the visitor sees the
  // control: on a phone the end view's far end runs under the button bar), -1 the backdrop, else the gap mesh's id
  const ob = obstacles(mount.clientWidth, mount.clientHeight), rb = root.getBoundingClientRect();
  const seen = (x, y) => { const px = Math.floor((x - x0) * k), py = Math.floor((y1 - y) * k);   // (rows read bottom up)
    if (px < 0 || py < 0 || px >= bw || py >= bh) return 0;
    const vx = x - rb.left, vy = y - rb.top; if (ob.some((o) => vx >= o.x0 && vx <= o.x1 && vy >= o.y0 && vy <= o.y1)) return 0;
    const i = (py * bw + px) * 4; if (buf[i] === 255 && buf[i + 1] === 255 && buf[i + 2] === 255) return -1;
    return buf[i + 2] === GAP_B ? buf[i] | (buf[i + 1] << 8) : 0; };
  const out = { mm: 0, y: null, lines: [] };
  lines.forEach((ln) => {
    let run0 = -1, best = 0, at = null, what = null; const P = ln.pts, cur = new Set();
    for (let j = 0; j <= P.length; j++) {
      const g = j < P.length ? seen(P[j][0], P[j][1]) : 0;
      if (g) { if (run0 < 0) { run0 = j; cur.clear(); } cur.add(g); continue; }
      // (a run of nothing but backdrop that reaches either end of the line is the line running off the phone's outline,
      // at the far end of an end view, not a hole through it)
      const off = (run0 === 0 || j === P.length) && cur.size === 1 && cur.has(-1);
      if (run0 >= 0 && !off) { const d = Math.hypot(P[j - 1][0] - P[run0][0], P[j - 1][1] - P[run0][1]);
        if (d > best || at === null) { best = d; at = P[(run0 + j - 1) >> 1]; what = [...cur].map((i) => (i < 0 ? "(the backdrop)" : ids[i] ? ids[i].name || "?" : "?")); } }
      run0 = -1;
    }
    // (the run from its first gap point to its last: a gap w mm wide reads w give or take one drawn pixel, so the
    // pixel's own size in mm, px, is reported for the check to allow; at 1600 x 1000 about 0.17 mm, on a phone 0.45)
    const mm = best / ln.pxmm, px = 1 / (k * ln.pxmm); out.lines.push(+mm.toFixed(2));
    if (out.y === null || mm > out.mm) Object.assign(out, { mm: +mm.toFixed(2), y: ln.y, at, px: +px.toFixed(2), what: what || [] });
  });
  return out;
};
/* for the check (build/shoot.py; F2): what the Mechanical caption overlaps, as names: the title, the readout, Options,
   the side pill, the button bar, the hint line or an open card; a shown label; a label's leader or dot; or the edge of
   the viewer. [] when it is clear; null when no caption shows. */
FC().capClear = () => {
  if (!capEl || capEl.hidden) return null;
  const c = capEl.getBoundingClientRect(), rb = root.getBoundingClientRect(), out = [];
  const over = (r) => r.width > 0 && r.height > 0 && Math.min(c.right, r.right) - Math.max(c.left, r.left) > 0 && Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top) > 0;
  if (c.left < rb.left || c.right > rb.right || c.top < rb.top || c.bottom > rb.bottom) out.push("the viewer's edge");
  root.querySelectorAll(".hud-tl h1, .hud-tl p, #state, #dims, .hud-tr .k, details.tweaks, .side .pill, .bar .pill, .tdhint, .hint, #partcard").forEach((el) => {
    if (getComputedStyle(el).display === "none" || el.hidden) return;
    if (over(el.getBoundingClientRect())) out.push(el.id ? "#" + el.id : el.className || el.tagName.toLowerCase()); });
  // (a leader: its polyline's segments against the caption's box, in viewer px; a dot: its centre, 3 px round)
  const x0 = c.left - rb.left, x1 = c.right - rb.left, y0 = c.top - rb.top, y1 = c.bottom - rb.top;
  const segHits = (ax, ay, bx, by) => { let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); if (t0 > t1) return false; }
    return true; };
  ALLQ.forEach((q) => { if (!q.show) return;
    if (over(q.el.getBoundingClientRect())) out.push("label " + q.name);
    const pts = (q.line.getAttribute("points") || "").trim().split(/\s+/).map((s) => s.split(",").map(Number));
    for (let i = 0; i + 1 < pts.length; i++) if (segHits(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])) { out.push("leader of " + q.name); break; }
    if (q.sx > x0 - 3 && q.sx < x1 + 3 && q.sy > y0 - 3 && q.sy < y1 + 3) out.push("dot of " + q.name); });
  return out;
};
// for main.js: how many labels show; open a unit's or a part's card by id (?card=)
export function labelCount() { return ALLQ.filter((q) => q.show).length; }
export function showCard(id) { const q = UQ[id] || MQ[id] || partQ(id); if (q) select(q); return !!q; }

/* ---------- wire up the controls ---------- */
Object.keys(mbtns).forEach((n) => mbtns[n] && mbtns[n].addEventListener("click", () => setMode(n)));
$("t-labels").addEventListener("change", (e) => { props.labels = e.target.checked; invalidate(); });
if (detailBox) detailBox.addEventListener("change", (e) => setDetail(e.target.checked));
if (mbtns.whole) mbtns.whole.classList.add("on");
