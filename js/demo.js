/* Fold Communicator — the brochure's two short clips, posed one frame at a time (build/brochure-clips.py records them).
   __fc.demo(name, t, cam, opts) puts the model, the camera, the touch mark and the cover screen where clip `name` has
   them t seconds in, waits for two drawn frames and returns (cam: a trial framing over the clip's; opts.mark false:
   the same frame without the touch mark). main.js loads this module the first time the hook is called, so a
   visitor never downloads it and nothing here runs per frame until then. Every pose comes from t alone, so a frame
   recorded twice is the same picture, and t = 0 and t = dur are one pose: the clip loops without a seam.
   __fc.demo(name) poses nothing and returns the clip's length, and the middle of each touch-mark stroke (marks).
   - keys: the phone shut, facing the camera, close in on the keys and the list. A fingertip's touch mark swipes up the
     keys and the cover screen's notification list scrolls up with it, mm for mm; then it swipes back down and the list
     comes back.
   - hinge: the phone stands on its edge and opens to 45°, 90° and 120°, stopping at each, then shuts. The screen half
     and the camera stay still and the keyboard half swings, as a book's cover opens with the book standing up. */
import * as THREE from "three";
import { S, fin, params, addUpdater, invalidate } from "./state.js";
import { coverScroll } from "./screens.js";
import { updateCamera } from "./scene.js";

const FC = window.__fc;

// a hand's move from a to b over [t0, t1]: the minimum-jerk curve (the usual model of a reaching movement), its time
// bent so it leaves the start a little quicker than it settles into the end, as a reach does
const mj = (k) => k * k * k * (10 - 15 * k + 6 * k * k);
const reach = (t, t0, t1, a, b) => { const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return a + (b - a) * mj(Math.pow(k, 0.85)); };
// a value through keyframes [[t, v], ...]: held where two neighbours are equal, a reach between them otherwise
function track(keys, t) {
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return reach(t, keys[i - 1][0], keys[i][0], keys[i - 1][1], keys[i][1]);
  return keys[keys.length - 1][1];
}
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

/* ---------- the touch mark: a fingertip-sized disc, with a short trail ----------
   One flat quad on the keyboard half, just outside its face (deck coords, mm: x runs from the hinge the other way, the
   keys face −z). The shader draws, round the fingertip, a disc MARK_R in radius (a fingertip's 9 mm across): white at
   about a third, a brighter ring half a mm wide at its edge, and a hairline of shade just outside it, so it reads on
   the dark keys and on a light face alike; behind it the trail, narrowing and fading toward its end. The finish's
   accent only tints it a little. It has to read at the size a phone shows the clip (356 px wide): build/brochure-clips.py
   checks that. (fc_fail=mark: a quarter as strong, about as faint as the first mark, a soft glow, which that check must
   fail; build/brochure-clips.py --selftest) */
const MARK_Z = -6.95, MARK_R = 4.5;
const FAINT = params.fc_fail === "mark" ? 0.25 : 1;
let mark = null;
function makeMark() {
  let deck = null; S.asm.traverse((o) => { if (o.userData.keycap) deck = groupOf(o); });
  if (!deck) throw new Error("demo: no keyboard to touch");
  const u = { head: { value: new THREE.Vector2() }, tail: { value: new THREE.Vector2() }, r: { value: MARK_R }, op: { value: 0 },
    z: { value: MARK_Z }, col: { value: new THREE.Vector3(1, 1, 1) } };
  // (the quad reaches 0.8 mm past the disc, for the shade round it; aa: the edges' soft width, mm)
  const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: "uniform vec2 head, tail; uniform float r, z; varying vec2 vP;\n" +
      "void main() { vec2 d = head - tail; float L = length(d), R = r + 0.8; vec2 a = L > 1e-4 ? d / L : vec2(0.0, 1.0), n = vec2(-a.y, a.x);\n" +
      "  vP = tail + a * ((position.x + 0.5) * (L + 2.0 * R) - R) + n * (position.y * 2.0 * R);\n" +
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, z, 1.0); }",
    fragmentShader: "uniform vec2 head, tail; uniform float r, op; uniform vec3 col; varying vec2 vP;\n" +
      "void main() { vec2 d = head - tail; float L = max(length(d), 1e-4); vec2 a = d / L; const float aa = 0.2;\n" +
      "  float s = clamp(dot(vP - tail, a) / L, 0.0, 1.0), w = r * mix(0.2, 0.7, s);\n" +
      "  float trail = (1.0 - smoothstep(w - aa, w + aa, length(vP - tail - a * s * L))) * s * 0.3;\n" +
      "  float dh = length(vP - head), disc = 1.0 - smoothstep(r - aa, r + aa, dh);\n" +
      "  float ring = smoothstep(r - 0.5 - aa, r - 0.5 + aa, dh) * disc;\n" +
      "  float shade = (1.0 - smoothstep(r + 0.35 - aa, r + 0.35 + aa, dh)) * (1.0 - disc) * (1.0 - smoothstep(0.0, 0.08, trail));\n" +
      "  float lit = max(disc * mix(0.35, 0.9, ring), trail * (1.0 - disc)), dk = shade * 0.24;\n" +
      "  float al = lit + dk * (1.0 - lit);\n" +
      "  gl_FragColor = vec4(mix(vec3(1.0), col, 0.18) * lit / max(al, 1e-4), al * op); }" });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  o.frustumCulled = false; o.renderOrder = 5; o.name = "demo.touch"; o.visible = false;
  deck.add(o);
  return o;
}
// the accent as the screen shows it (sRGB 0..1: the shader writes it straight out, untouched by colour management)
const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
// front coords (x from the hinge, y up, as parts.js) to the keyboard half's own: x the other way
function setMark(head, tail, op, r) {
  const u = mark.material.uniforms;
  u.head.value.set(-head[0], head[1]); u.tail.value.set(-tail[0], tail[1]); u.op.value = op * FAINT; u.r.value = r;
  u.col.value.set(...rgb(fin().accent)); mark.visible = op > 0.002;
}

/* ---------- keys: swipe up the keys, the list scrolls; swipe back down ----------
   Each stroke: the fingertip lands (down to t0: the mark grows in), slides from `from` to `to` (front mm; a thumb's slight
   bow sideways), and lifts (t1 to up, while it settles). The list moves with the fingertip's height, 12.5 canvas px to
   the mm, which is the cover screen's own scale (screens.js): what scrolls moves as far as the finger did. The second
   stroke undoes the first exactly, so the clip ends where it began. */
const PXMM = 12.5;
const STROKES = [
  { down: 0.42, t0: 0.6, t1: 1.38, up: 1.62, from: [45.5, -50.6], to: [42.0, -27.4], bow: 1.6 },
  { down: 2.62, t0: 2.8, t1: 3.58, up: 3.82, from: [41.0, -27.4], to: [44.5, -50.6], bow: -1.6 }
];
const LAG = 0.16;   // the trail's end: where the fingertip was this many seconds earlier
function strokeAt(s, t) {
  const k = (tt) => mj(Math.pow(Math.min(1, Math.max(0, (tt - s.t0) / (s.t1 - s.t0))), 0.85));
  const at = (q) => [s.from[0] + (s.to[0] - s.from[0]) * q + s.bow * Math.sin(Math.PI * q), s.from[1] + (s.to[1] - s.from[1]) * q];
  return { head: at(k(t)), tail: at(k(Math.max(s.t0, t - LAG))), q: k(t) };
}
function keysPose(t) {
  let scroll = 0, shown = null;
  STROKES.forEach((s) => {
    const p = strokeAt(s, t), dy = (s.to[1] - s.from[1]) * p.q;
    scroll += dy * PXMM;
    if (t >= s.down && t <= s.up) {
      const op = smooth(s.down, s.t0, t) * (1 - smooth(s.t1 - 0.08, s.up, t));
      shown = { head: p.head, tail: p.tail, op, r: MARK_R * (0.82 + 0.18 * smooth(s.down, s.t0, t)) };
    }
  });
  setMark(shown ? shown.head : [0, 0], shown ? shown.tail : [0, 0], shown ? shown.op : 0, shown ? shown.r : MARK_R);
  coverScroll(Math.round(scroll * 100) / 100); scrolled = true;
}
let scrolled = false;

/* ---------- hinge: shut, 45°, 90°, 120°, each held, then shut ----------
   The screen half stands still where it stands shut, and the camera with it: only the keyboard half swings, out from
   the spine and back, as a book's cover opens with the book standing on a table. One thing moves at a time, so each
   held angle reads as held. (An updater after the teardown's, which places the model by its middle at every angle:
   this one keeps it where the middle is shut.) Each hold lasts a second or more. */
const HINGE = [[0, 0], [0.4, 0], [1.2, 45], [2.25, 45], [2.95, 90], [4.0, 90], [4.6, 120], [5.7, 120], [6.75, 0], [7.1, 0]];   // [s, °]
let hold = false, home = null;
// the group of the model a mesh hangs in (panel, deck or spine)
const groupOf = (o) => { while (o && o.parent !== S.asm) o = o.parent; return o; };
function holdPanel() {
  if (!hold) return false;
  S.asm.rotation.set(0, 0, 0); S.asm.position.set(home[0], 0, home[1]);
  return false;
}

/* the hinge clip's angle, in the frame's bottom left corner in the page's mono type and the viewer's ink: it counts
   while the hinge moves and stands still while it holds, which is what the clip shows. null takes it away */
let label = null;
function readout(text) {
  if (!label && !text) return;
  if (!label) { label = document.createElement("div"); label.className = "demo-angle"; document.getElementById("viewer").appendChild(label);
    label.style.cssText = "position:absolute;left:36px;bottom:30px;font:500 30px/1 'IBM Plex Mono',monospace;letter-spacing:-.02em;opacity:.72;pointer-events:none"; }
  label.textContent = text || ""; label.hidden = !text;
}

/* each clip: its length (s), its camera ({ az, el, dist, tgt }, held still), its pose at t, and whether the screen half
   is held (hold) */
const CLIPS = {
  // keys: from the top of the notification list down to just under the keyboard, so the fingertip and the list it
  // moves are both large enough to follow at a phone's 356 px
  keys:  { dur: 4.8, cam: { az: -0.34, el: 0.26, dist: 244, tgt: [-1, -15, 0] }, pose: keysPose, hold: false },
  // hinge: three-quarters from the front, on the screen half's side, so the keyboard half swings toward the camera
  hinge: { dur: HINGE[HINGE.length - 1][0], cam: { az: 0.5, el: 0.3, dist: 415, tgt: [-20, -3, 25] }, pose: hingePose, hold: true }
};
// the clip starts half-way through the hold at 90°, so its first frame (its poster, all a visitor who asks for less
// motion sees) shows the phone standing open, not shut
const HINGE_START = 3.475;
function hingePose(t) { const a = track(HINGE, (t + HINGE_START) % CLIPS.hinge.dur); fold(a); readout(Math.round(a) + "°"); }
function fold(deg) { if (S.anim) cancelAnimationFrame(S.anim); S.anim = null; S.foldTarget = deg; S.setFold(deg); }

let ready = false;
const frames = (n) => new Promise((res) => { const f0 = FC.frames, w = () => { invalidate(); if (FC.frames >= f0 + n) res(); else requestAnimationFrame(w); }; w(); });
export async function demo(name, t, cam, opts) {
  const C = CLIPS[name]; if (!C) throw new Error("demo: no clip '" + name + "' (" + Object.keys(CLIPS).join(", ") + ")");
  if (t === undefined) return { name, dur: C.dur, marks: C === CLIPS.keys ? STROKES.map((s) => (s.t0 + s.t1) / 2) : [] };
  if (!ready) {
    mark = makeMark();
    // where the teardown puts the model's middle shut (exterior.js S.setFold keeps S.center)
    const a0 = S.ang; S.setFold(0); home = S.center.slice(); S.setFold(a0);
    addUpdater(holdPanel); ready = true;
  }
  t = ((+t % C.dur) + C.dur) % C.dur;
  // (what another clip set: the mark, the scrolled list, the held screen half, the fold)
  hold = C.hold;
  if (name !== "keys" && scrolled) { setMark([0, 0], [0, 0], 0, MARK_R); coverScroll(); scrolled = false; }
  if (name !== "hinge") { fold(0); readout(null); }
  C.pose(t);
  // (opts.mark false: the same frame without the touch mark, for the clip script's check that the mark shows)
  if (mark && opts && opts.mark === false) mark.visible = false;
  // the clip's camera (cam: a trial framing over it), snapped: no easing between frames
  const v = Object.assign({}, C.cam, cam || {});
  Object.assign(S.view, { az: v.az, el: v.el, dist: v.dist, tgt: v.tgt.slice(), wide: 0, base: v.dist }); S.focusReq = null;
  S.cur = { az: v.az, el: v.el, dist: v.dist, tgt: v.tgt.slice() }; updateCamera(0);
  await frames(2);
  return { name, t, dur: C.dur };
}
