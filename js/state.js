/* Fold Communicator — shared state and tables.
   Every module reads these; nobody redefines them. Frozen after B0 (BUILD-SPEC 5.1). */

/* ---------- page state (what the controls change) ---------- */
export const props = {
  finish: "porcelain",
  accent: "#67c6d4",
  backdrop: "studio",
  keyBacklight: true,
  autoRotate: false,
  innerLayout: "split",
  duo: false,          // iPhone Duo-style opening: screens blur, zoom and hand over as the hinge moves
  labels: true,
  mode: "whole",       // teardown step, see MODES in teardown.js
  detail: false        // High detail exploded view (Options); off = the Simple exploded view (teardown.js)
};

export const finishes = {
  porcelain: { frame: 0xd9d8d5, face: 0xefece6, back: 0xedebe7, key: "#34373c" },
  graphite:  { frame: 0x5a5c60, face: 0x2c2d30, back: 0x323337, key: "#1b1c1f" },
  sage:      { frame: 0xb3b8ad, face: 0xc2cabb, back: 0xbac3b2, key: "#2f352f" },
  clay:      { frame: 0xc8b09d, face: 0xdbc6b4, back: 0xd4bfad, key: "#3b2f2a" },
  cobalt:    { frame: 0x8290a2, face: 0x34465f, back: 0x3a4c66, key: "#18202c" }
};
export const fin = () => finishes[props.finish] || finishes.porcelain;

// camera presets behind the view buttons. wide: the width (mm, at the target) the view must show; on a narrow portrait
// viewer the camera backs off only that far, so the phone fills the width there (scene.js viewK; FABLE-REVIEW-2 D7).
// Chosen on a 390 × 844 viewer: shut, the phone fills about 65 % of the width, as much as its height allows between the
// readout and the button bar; open, about 75 % (clear of the finish swatches at the right edge)
export const views = {
  hero:  { az: -0.62, el: 0.13, dist: 470, ang: 0,   wide: 110 },
  front: { az: 0,     el: 0.02, dist: 440, ang: 0,   wide: 118 },
  flex:  { az: 0.78,  el: 0.30, dist: 560, ang: 100, wide: 170 },
  open:  { az: 0.22,  el: 0.07, dist: 560, ang: 180, wide: 200 },
  back:  { az: Math.PI + 0.5, el: 0.12, dist: 470, ang: 0, wide: 114 }
};

// runtime scene state, filled in by the modules as they build
export const S = { accent: props.accent, ang: 0, reg: [], parts: [], explode: 0, gap: 22, center: [0, 0], duoM: 0, lastMove: 0 };

/* ---------- geometry constants (mm) ---------- */
export const GEO = (() => {
  const H = 123.9, t = 5.4, L = 76.5, CHt = 80;
  return {
    H, t, L, R: 9.2, RH: 1.6, B: 1.15,   // height, leaf thickness, leaf width, outer and hinge corner radii, frame bevel
    DB: 2.0,                             // inner display bezel
    OZ: -t - 0.2,                        // deck outer face
    CWd: 69.7, CHt, CY: H / 2 - 3.6 - CHt / 2, CX: L / 2,   // cover screen
    KW: 6.15, KH: 5.9, KR: 2.3, PX: 6.95, ROWS: [-27.8, -34.8, -41.8, -48.8]   // keys
  };
})();

/* ---------- URL parameters (BUILD-SPEC 5.3) ---------- */
export const params = {};
new URLSearchParams(location.search).forEach((v, k) => { params[k] = v; });

/* ---------- quality tiers (BUILD-SPEC 4.3; B1 acts on them) ---------- */
export const QUALITY = {
  low:  { dpr: 1.25, physical: "glass", clearcoat: false, aniso: false, iridescence: false, relief: "bump", env: 128,
          shadow: { size: 256, every: 4 }, passives: false, springSegs: 6, duoScale: 0.25,
          tex: { boardUp: 512, boardLo: 256, pouch: 512, can: 128, brushed: 512, tiled: [128, 256] } },
  mid:  { dpr: 1.5, physical: "some", clearcoat: true, aniso: false, iridescence: false, relief: "bump", env: 256,
          shadow: { size: 512, every: 3 }, passives: true, springSegs: 10, duoScale: 0.5,
          tex: { boardUp: 1024, boardLo: 512, pouch: 1024, can: 256, brushed: 1024, tiled: [256, 512] } },
  high: { dpr: 2, physical: "all", clearcoat: true, aniso: true, iridescence: true, relief: "normal", env: 512,
          shadow: { size: 512, every: 3 }, passives: true, springSegs: 16, duoScale: 0.5,
          tex: { boardUp: 1024, boardLo: 512, pouch: 1024, can: 256, brushed: 1024, tiled: [256, 512] } }
};
// the current tier's settings; chooseTier() in scene.js sets it before anything is built
export const Q = { tier: "mid", ...QUALITY.mid };
export function setTier(name) { if (QUALITY[name]) Object.assign(Q, QUALITY[name], { tier: name }); return Q; }

// performance budget per tier (BUILD-SPEC 8); build/shoot.py fails a view over it
export const BUDGET = {
  low:  { calls: 250, tris: 400000,  texMB: 48 },
  mid:  { calls: 350, tris: 800000,  texMB: 120 },
  high: { calls: 450, tris: 1200000, texMB: 144 }
};
// frame-cost budget (FABLE-REVIEW-1 WP0), set for the check PC at 390 × 844, Low, device pixel ratio 3; phones are
// 3 to 5 times slower on the processor, so it is deliberately tight. build/shoot.py --perf presses each mode button
// from Hero with labels on (no ?shot) and reads __fc.perf; its stills run checks `modes` on the hero view and `shots`
// on the named stills.
// `until` names work packages expected to bring the page inside it. While it is set, shoot.py prints FAIL for every
// number over budget but fails the run on them only with --strict-perf. Cleared ("") since WP1 (labels without
// raycasts) and WP2 (draw only what shows) landed: every run now fails on these numbers.
function allTiers(cap) { return { low: cap, mid: cap, high: cap }; }
export const PERF_BUDGET = {
  until: "",
  windowMs: 2200,          // how long a mode move is watched
  longestTaskMs: 50,       // longest main-thread task during the move, labels on
  minFrames: 100,          // frames drawn in windowMs during the move
  labelMs: 4,              // label layout (layoutLabels) per call at rest, any mode
  modes: { whole: allTiers({ calls: 80, tris: 90000 }) },  // per-mode caps; Whole is checked on the hero view
  // per-still caps (FABLE-REVIEW-1 build plan): the Simple exploded view must be cheaper than the old one (199 calls,
  // 296k triangles at Low); High detail keeps every piece. The Mechanical view (WP5) draws only the structure: 90
  // calls (review F8; measured 73 to 75 at Low with hinge v2), and no more triangles than the Simple exploded view.
  // The same caps at every tier (FABLE-REVIEW-2 N9d: High exploded drew 119 calls with no cap): the tiers change maps
  // and shading, not what is drawn, so a still over its cap at Mid or High has grown at Low too
  shots: { exploded: allTiers({ calls: 120, tris: 200000 }), "exploded-detail": allTiers({ calls: 250, tris: 400000 }),
    mechanical: allTiers({ calls: 90, tris: 200000 }), "mechanical-shut": allTiers({ calls: 90, tris: 200000 }),
    "mechanical-zoom": allTiers({ calls: 90, tris: 200000 }) }
};

/* ---------- fixed views for stills (BUILD-SPEC 5.4) ----------
   cam: "mode" takes az, el and dist from that mode's view in teardown.js. ang is the fold angle in degrees.
   focus aims the camera at the matching meshes ("flag", "flag=value" or "part=<id>"); only hides every other mesh.
   detail: 1 = the High detail exploded view (else Simple). testCard: 1 = the inner screen shows a flat grey test card.
   zoom: with cam "mode", a factor on the mode camera's distance. tgt: where the camera looks, world mm. */
export const MODE_CAM = "mode";
export const SHOTS = {
  hero:       { mode: "whole",   ang: 0,   az: -0.62, el: 0.13, dist: 470, labels: 0 },
  front:      { mode: "whole",   ang: 0,   az: 0,     el: 0.02, dist: 440, labels: 0 },
  open:       { mode: "whole",   ang: 180, az: 0.22,  el: 0.07, dist: 560, labels: 0 },
  back:       { mode: "whole",   ang: 0,   az: Math.PI + 0.5, el: 0.12, dist: 470, labels: 0 },
  backoff:    { mode: "back",    ang: 180, cam: MODE_CAM, labels: 0 },
  screensoff: { mode: "screens", ang: 180, cam: MODE_CAM, labels: 0 },
  exploded:   { mode: "explode", ang: 180, cam: MODE_CAM, labels: 1 },
  hinge:      { mode: "explode", detail: 1, ang: 180, az: -0.55, el: 0.55, focus: "hinge", only: "hinge", labels: 0 },
  keyboard:   { mode: "whole",   ang: 0,   az: -0.25, el: 0.35, focus: "keycap", labels: 0 },
  battery:    { mode: "back",    ang: 180, az: Math.PI + 0.3, el: 0.55, focus: "part=battery-p", labels: 0 },
  side:       { mode: "whole",   ang: 180, az: 1.3,   el: 0.1,  focus: "sidekey", dist: 260, labels: 0 },
  top:        { mode: "whole",   ang: 180, az: -0.9,  el: 0.95, focus: "grille=top", dist: 200, labels: 0 },
  botedge:    { mode: "whole",   ang: 180, az: 0.9,   el: -0.95, focus: "grille=bot", dist: 200, labels: 0 },
  kbdstack:   { mode: "explode", detail: 1, ang: 180, az: -0.7,  el: 0.45, focus: "kbd", only: "kbd", labels: 1 },
  hingeblock: { mode: "explode", detail: 1, ang: 180, az: -0.5,  el: 0.75, focus: "part=hinge-1", only: "hinge", dist: 60, labels: 0 },
  usb:        { mode: "whole",   ang: 0,   az: -0.35, el: -0.7, focus: "usb", dist: 120, labels: 0 },
  // the High detail exploded view (WP4)
  "exploded-detail": { mode: "explode", detail: 1, ang: 180, cam: MODE_CAM, labels: 1 },
  // hinge v2 (WP6): the back at part-open angles, where v1 showed a dark slot beside the spine; build/shoot.py counts
  // near-black pixels over the spine on these four (0 allowed)
  back15:     { mode: "whole",   ang: 15,  az: Math.PI + 0.5, el: 0.12, dist: 470, labels: 0 },
  back30:     { mode: "whole",   ang: 30,  az: Math.PI + 0.5, el: 0.12, dist: 470, labels: 0 },
  back45:     { mode: "whole",   ang: 45,  az: Math.PI + 0.5, el: 0.12, dist: 470, labels: 0 },
  back90:     { mode: "whole",   ang: 90,  az: Math.PI + 0.5, el: 0.12, dist: 470, labels: 0 },
  // the Mechanical view (WP5): its own fitted camera, at 90° open and nearly shut
  mechanical:        { mode: "mechanical", ang: 90, cam: MODE_CAM, labels: 1 },
  "mechanical-shut": { mode: "mechanical", ang: 20, cam: MODE_CAM, labels: 1 },
  // zoomed in to half the fitted distance on the middle module (FABLE-REVIEW-2 N2): the labels must stay (LABEL_MIN in
  // build/shoot.py)
  "mechanical-zoom": { mode: "mechanical", ang: 90, cam: MODE_CAM, zoom: 0.5, labels: 1 },
  // the crease at 150° from the front, close up, on a flat grey test card (FABLE-REVIEW-2 N4): build/shoot.py compares
  // the fold band's mean luminance with the halves' display beside it (CREASE_VIEWS)
  crease150:  { mode: "whole",   ang: 150, az: 0.26,  el: 0.02, focus: "hinge", dist: 260, testCard: 1, labels: 0 },
  // the top end of the fold open flat, close up from the screen side (FABLE-REVIEW-2 N3): build/shoot.py measures the
  // step in the black bezel where the two halves meet (STEP_VIEWS). tgt: the bezel over the hinge at 180° (world mm)
  hingetop:   { mode: "whole",   ang: 180, az: 0,     el: 0.5,  tgt: [0, 59.8, 3.37], dist: 120, labels: 0 },
  // the top end of the spine at 30° from above and behind (FABLE-REVIEW-2 N9c: the research's worst angles are end
  // views): the dark-slot and slot-width checks as on back15 ... back90. tgt: the spine's top end at 30° (world mm)
  top30:      { mode: "whole",   ang: 30,  az: Math.PI + 0.5, el: 0.95, tgt: [-35.3, 59, -19], dist: 110, labels: 0 }
};

/* ---------- frame hooks (BUILD-SPEC 4.4) ----------
   invalidate(): call after changing anything visible outside the loop. A no-op until scene.js swaps it in.
   addUpdater(fn): fn(dt) runs every frame before the render and returns true while it is still moving.
   addAfterRender(fn): runs after each main-scene render (label layout). */
let inval = () => {};
export function invalidate() { inval(); }
export function setInvalidate(fn) { inval = fn; }
export const updaters = [];
export const afterRender = [];
export function addUpdater(fn) { updaters.push(fn); }
export function addAfterRender(fn) { afterRender.push(fn); }

// finish changes: materials.js emits, other modules subscribe
const finishSubs = [];
export function onFinish(fn) { finishSubs.push(fn); }
export function emitFinish() { finishSubs.forEach((fn) => fn(fin())); }
