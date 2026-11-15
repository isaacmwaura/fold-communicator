/* Fold Communicator — renderer, camera, studio light, contact shadow, quality switch, the render loop (draws only
   when something changed) and the camera controls. */
import * as THREE from "three";
import { props, S, GEO, Q, BUDGET, params, views, fin, setTier, updaters, afterRender, setInvalidate, invalidate } from "./state.js";
import { $, cv, tex, trackTarget, untrackTarget, texBytes } from "./util.js";
import { studio, mat, setBacklightLook } from "./materials.js";
import { pick, hitsModel, MODES } from "./teardown.js";

const root = $("viewer"), mount = $("mount"), slider = $("hinge"), playBtn = $("v-play"), qSel = $("t-quality"), lostEl = $("gllost");
const btns = {};
["hero", "front", "flex", "open", "back"].forEach((n) => { btns[n] = $("v-" + n); });
const DEF_TGT = [0, -1, 0];   // where the camera looks unless a view focuses on something
// the floor the exploded and Mechanical views keep (16 mm below the phone, teardown.js eases it from there), and the
// floor the standing phone touches: its lowest point, the bottom edge (16 mm below, it floated)
const FLOOR_Y = -GEO.H / 2 - 16, CONTACT_Y = -GEO.H / 2 - 0.05;
let ren, scene, cam, asm, cvs, envRT = null;

function resize() {
  const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
  cam.aspect = w / h; cam.updateProjectionMatrix(); ren.setSize(w, h, false);
  S.fitK = Math.max(1, 1.25 / Math.min(1.25, w / h));
}
const dprFor = () => Math.min(window.devicePixelRatio || 1, Q.dpr);

export function createScene() {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(22, 1, 20, 4000);
  ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); S.ren = ren;
  ren.setPixelRatio(dprFor()); ren.setClearColor(0, 0);
  // Neutral keeps the finish hex colours true; no shadow maps: the floor shadow is the contact shadow below
  ren.toneMapping = THREE.NeutralToneMapping; ren.toneMappingExposure = 1.0;
  cvs = ren.domElement; cvs.style.cssText = "width:100%;height:100%;display:block"; mount.appendChild(cvs);
  asm = new THREE.Group(); scene.add(asm);
  Object.assign(S, { scene, cam, asm, goView, markBtn });

  new ResizeObserver(() => { resize(); invalidate(); }).observe(mount); resize();

  /* Pointers. Every pointer on the viewer is tracked by id. One pointer orbits. Two pinch: the
     zoom factor is the ratio of the finger spacings, about their midpoint (zoomAt), so the point between the fingers
     stays put; a third finger is tracked but the first two pinch. A gesture that ever had two pointers never ends in a
     part tap, and the finger left after a pinch orbits on from where it is, so nothing jumps. On touch screens a
     one-finger vertical swipe still scrolls the page (touch-action: pan-y on #mount; the browser then sends
     pointercancel). pan-y does not allow pinch-zoom, so the browser leaves pinches to the page and their events keep
     coming. A double tap (or double click) on the empty background puts the current step's camera back. */
  const pts = new Map();   // pointerId → { x, y }, the last position seen
  let moved = 0, multi = false, pinchD = 0, lastTap = null;
  const pair = () => { const it = pts.values(), a = it.next().value, b = it.next().value;
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  mount.addEventListener("pointerdown", (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { mount.setPointerCapture(e.pointerId); } catch (err) { /* a pointer that is already up, or a synthetic one */ }
    if (pts.size === 1) { multi = false; moved = 0; } else { multi = true; pinchD = pair().d; }
    S.dragging = true; mount.style.cursor = "grabbing"; invalidate();
  });
  mount.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;   // a mouse hovering, or a pointer the browser took for a scroll
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      S.view.az -= dx * 0.008; S.view.el = Math.max(-1.3, Math.min(1.3, S.view.el + dy * 0.006)); invalidate();
    } else { const q = pair(); if (pinchD > 0 && q.d > 0 && q.d !== pinchD) zoomAt(pinchD / q.d, q.x, q.y); pinchD = q.d; }
  });
  const up = (e) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size >= 2) pinchD = pair().d;   // one of three fingers lifted: the pinch goes on with the next pair
    if (pts.size) return;
    S.dragging = false; mount.style.cursor = "grab"; invalidate();
    if (multi || moved >= 5 || e.type !== "pointerup") { lastTap = null; return; }
    // a tap: two on the empty background within 350 ms and 30 px reset the view; any other tap picks a part
    const now = performance.now(), empty = !hitsModel(e.clientX, e.clientY);
    const dbl = empty && lastTap && lastTap.empty && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
    lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY, empty };
    if (dbl) resetView(); else pick(e);
  };
  mount.addEventListener("pointerup", up); mount.addEventListener("pointercancel", up);
  // Ctrl/⌘ + scroll zooms toward the pointer (Chrome, Edge and Firefox send a trackpad pinch as a Ctrl + wheel);
  // plain scroll keeps scrolling the page. Line and page deltas (Firefox) are turned into pixels first.
  mount.addEventListener("wheel", (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    zoomAt(Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.0012))), e.clientX, e.clientY); }, { passive: false });

  /* WebGL context loss. Phones drop the context under memory pressure or when the tab is in the background.
     three.js stops drawing by itself (it calls preventDefault too, which asks the browser for the context back). The
     viewer says so. On restore three.js re-uploads geometry and the canvas-painted textures by itself; what lived
     only on the GPU is rebuilt here: the studio environment (restoreEnv) and the contact shadow. If the browser never
     gives the context back, tapping the line reloads the page. */
  cvs.addEventListener("webglcontextlost", (e) => { e.preventDefault(); S.glLost = true; if (lostEl) lostEl.hidden = false; }, false);
  cvs.addEventListener("webglcontextrestored", () => { S.glLost = false; restoreEnv(); if (lostEl) lostEl.hidden = true; invalidateShadow(); }, false);
  if (lostEl) lostEl.addEventListener("click", () => location.reload());

  return { T: THREE, ren, scene, cam, asm };
}

/* ---------- quality tier ----------
   URL ?quality=, then the visitor's stored choice, then Auto. Auto reuses the stored probe result for this GPU, or
   measures once on a throwaway scene before anything real is built, so the page is built once at the right tier. */
const TIERS = ["low", "mid", "high"];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
};
function glName(r) { const gl = r.getContext(), ex = gl.getExtension("WEBGL_debug_renderer_info");
  return String(gl.getParameter(ex ? ex.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ""); }

// 300 clear-coated metal spheres filling the view at pixel ratio 1.5: 3 warm-up frames, then 8 timed frames. Each
// 1-pixel readPixels waits for the GPU to finish, so the time is real GPU time. Returns ms per frame.
async function probe(r) {
  const s = new THREE.Scene(), geo = new THREE.SphereGeometry(6, 32, 16), m = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.4, clearcoat: 1 });
  const im = new THREE.InstancedMesh(geo, m, 300), o = new THREE.Object3D();
  for (let i = 0; i < 300; i++) { o.position.set((i % 20 - 9.5) * 12, (Math.floor(i / 20) - 7) * 12, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
  const dl = new THREE.DirectionalLight(0xffffff, 2.5); dl.position.set(1, 2, 3);
  s.add(im, dl, new THREE.AmbientLight(0xffffff, 0.8));
  const pc = new THREE.OrthographicCamera(-120, 120, 90, -90, 1, 100); pc.position.z = 50;
  const gl = r.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  r.setPixelRatio(1.5); resize(); cvs.style.visibility = "hidden";
  try {
    await r.compileAsync(s, pc);
    for (let i = 0; i < 3; i++) { r.render(s, pc); sync(); }
    const t0 = performance.now();
    for (let i = 0; i < 8; i++) r.render(s, pc);
    sync();
    return (performance.now() - t0) / 8;
  } finally {
    cvs.style.visibility = ""; im.dispose(); geo.dispose(); m.dispose();
  }
}

const phoneLike = () => (navigator.maxTouchPoints || 0) > 1 || (root.clientWidth || window.innerWidth) < 900;

export async function chooseTier(r) {
  const url = params.quality, saved = store.get("fc.quality");
  let t, how;
  if (TIERS.indexOf(url) >= 0) { t = url; how = "url"; }
  else if (url !== "auto" && TIERS.indexOf(saved) >= 0) { t = saved; how = "saved"; }
  else {
    how = "auto"; const gl = glName(r); let c = null;
    try { c = JSON.parse(store.get("fc.quality.auto") || "null"); } catch (e) { c = null; }
    if (c && c.gl === gl && TIERS.indexOf(c.tier) >= 0) { t = c.tier; S.probeMs = c.ms; }
    else {
      const ms = await probe(r); S.probeMs = Math.round(ms * 100) / 100;
      t = ms < 6 ? "high" : ms < 12 ? "mid" : "low";   // first-guess thresholds; tune on a real phone
      store.set("fc.quality.auto", JSON.stringify({ tier: t, gl, ms: S.probeMs }));
    }
    /* Phone cap: Auto never picks High on a touch screen or a viewer under 900 CSS px wide. High is pixel
       ratio 2, about 131 MB of textures and 316k triangles, and the probe thresholds above have never been measured on
       a phone: a recent flagship passes the 6 ms probe and would get it. The visitor can still choose High by hand.
       What lifts the cap: a flagship phone (and one mid-range phone) on ?quality=high&perf=1, the frame time while
       orbiting and while the hinge plays, compared with the probe ms the same phone reports under Auto. If High holds
       about 16 ms there, set the probe thresholds from those numbers and delete this cap. */
    if (t === "high" && phoneLike()) { t = "mid"; S.tierCapped = true; }
  }
  setTier(t); S.tierHow = how;
  r.setPixelRatio(dprFor()); resize();
  syncQuality();
  return Q.tier;
}

// the Options panel control: shows the choice; changing it stores it and reloads (one clean rebuild at the new tier)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function syncQuality() {
  if (!qSel) return;
  const saved = store.get("fc.quality");
  qSel.value = TIERS.indexOf(params.quality) >= 0 ? params.quality : (params.quality !== "auto" && TIERS.indexOf(saved) >= 0 ? saved : "auto");
  const a = qSel.querySelector('option[value="auto"]'); if (a) a.textContent = S.tierHow === "auto" ? "Auto (" + cap(Q.tier) + ")" : "Auto";
}
if (qSel) qSel.addEventListener("change", () => {
  const v = qSel.value, u = new URL(location.href);
  u.searchParams.delete("quality");   // otherwise a ?quality= URL would win again after the reload
  if (v === "auto") store.del("fc.quality");
  else if (!store.set("fc.quality", v)) u.searchParams.set("quality", v);   // storage blocked: carry it in the URL
  history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  location.reload();
});

/* ---------- look: environment, lights, contact shadow ---------- */
// the studio, pre-filtered for reflections (PMREM); it is drawn on the GPU, so a context loss wipes it
function envMap() {
  const pm = new THREE.PMREMGenerator(ren), st = studio(THREE);
  const rt = trackTarget(pm.fromScene(st, 0.015, 0.1, 100, { size: Q.env }));
  pm.dispose(); st.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  return rt;
}
// after a context restore: draw the environment again and point everything that used the old one at the new one
// (the scene, the screens' own envMap, and the material a selected part keeps aside while it is highlighted)
function restoreEnv() {
  if (!envRT) return;
  const oldRT = envRT, old = oldRT.texture; envRT = envMap();
  const swap = (m) => { if (m && m.envMap === old) m.envMap = envRT.texture; };
  if (scene.environment === old) scene.environment = envRT.texture;
  scene.traverse((o) => { if (Array.isArray(o.material)) o.material.forEach(swap); else swap(o.material); });
  if (S.sel) swap(S.sel.orig);
  untrackTarget(oldRT);   // not dispose(): its GPU memory went with the old context
  invalidate();
}
export function buildLook() {
  envRT = envMap();
  scene.environment = envRT.texture;
  // the key matches the studio's key softbox; the rim is neutral white (its old blue, 0xcfe0ff, tinted the back and
  // the spine cover blue)
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-200, 300, 250);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(220, 140, -260);
  scene.add(key, rim);
  buildShadow();
  applyBackdrop();
  return envRT.texture;
}

/* ---------- contact shadow (port of three.js webgl_shadow_contact) ----------
   An orthographic camera on the floor looks up and draws the model with a depth material that is darker the nearer
   the floor; two blur passes soften it; a plane on the floor shows it. It is redrawn only when the model changes
   (fold, teardown, explode, visibility, floor), never for orbit, zoom or idle frames, and then at most every
   Q.shadow.every-th changed frame, plus once when the model stops (every changed frame at Mid
   drew the whole model twice per frame while the hinge moved). Only meshes on SHADOW_LAYER are drawn into it: every
   mesh except those marked userData.small (screws, springs and the hinge's other small pieces, the board passives,
   each part's surface details, the ribbons and their stiffeners), which a 1 mm-per-texel, blurred shadow cannot show
   anyway (shadowCasters, run once after the build).
   Two shadows from the one depth picture, as a real contact shadow has: a tight dark core right
   where the phone touches the floor (blur 0.8, opacity 0.7) and the wide soft falloff round it (blur 3.5, opacity
   0.35). They share one render target, one channel each (tight in red, wide in alpha): every blur pass blurs both at
   once, so there are as many blur draws as before (four), and one floor plane draws both (one draw call).
   Under the standing phone (Whole), a soft pool of light on the floor, the way a product stage is lit: one more
   transparent plane, drawn before the shadow. */
const CS = { size: 260, far: 140, blur: 3.5, tight: 0.8, opTight: 0.7, opWide: 0.35, pool: 230 }, SHADOW_LAYER = 1;
export function shadowCasters() {
  asm.traverse((o) => { if (o.isMesh && !o.userData.small) o.layers.enable(SHADOW_LAYER); });
  invalidateShadow();
}
let sh = null, shForce = true, shPending = true, shSkip = 0, shSig = "";
function buildShadow() {
  const n = Q.shadow.size, o = { type: THREE.HalfFloatType };
  const rt = trackTarget(new THREE.WebGLRenderTarget(n, n, o)), rtBlur = trackTarget(new THREE.WebGLRenderTarget(n, n, o));
  rt.texture.generateMipmaps = false; rtBlur.texture.generateMipmaps = false;
  const P = CS.size, geo = new THREE.PlaneGeometry(P, P).rotateX(Math.PI / 2);
  const group = new THREE.Group(); group.position.y = FLOOR_Y; scene.add(group);
  // the floor plane: black, its alpha the two shadows laid over each other
  const plane = new THREE.Mesh(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { map: { value: rt.texture }, tight: { value: CS.opTight }, wide: { value: CS.opWide } },
    vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform sampler2D map; uniform float tight, wide; varying vec2 vUv;\n" +
      "void main() { vec4 s = texture2D(map, vUv); gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - (1.0 - tight * s.r) * (1.0 - wide * s.a)); }" }));
  plane.renderOrder = 2; plane.scale.y = -1; group.add(plane);   // the texture's y is flipped
  // the light pool: a radial gradient (colour and strength per backdrop, applyBackdrop), Whole only (shadowStep)
  const pc = cv(128, 128), pg = pc.getContext("2d"), rg = pg.createRadialGradient(64, 64, 0, 64, 64, 64);
  [[0, 1], [0.35, 0.7], [0.7, 0.22], [1, 0]].forEach(([k, a]) => rg.addColorStop(k, "rgba(255,255,255," + a + ")"));
  pg.fillStyle = rg; pg.fillRect(0, 0, 128, 128);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(CS.pool, CS.pool * 0.75).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex(THREE, pc), transparent: true, depthWrite: false, toneMapped: false }));
  pool.renderOrder = 1; pool.position.y = 0.01; group.add(pool);
  const blurPlane = new THREE.Mesh(geo); blurPlane.visible = false; blurPlane.layers.set(SHADOW_LAYER); group.add(blurPlane);
  const sc = new THREE.OrthographicCamera(-P / 2, P / 2, P / 2, -P / 2, 0, CS.far); sc.rotation.x = Math.PI / 2; sc.layers.set(SHADOW_LAYER); group.add(sc);
  // like MeshDepthMaterial, but black, fading to clear with height. Depth-tested, so the surface nearest the floor
  // wins where tall parts stack up (the example draws without a depth test, fine for its small objects only).
  const depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide }), dark = { value: 1 };
  const from = "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );";
  depth.onBeforeCompile = (s) => {
    if (s.fragmentShader.indexOf(from) < 0) throw new Error("contact shadow: depth shader changed in this three.js version");
    s.uniforms.darkness = dark;
    s.fragmentShader = "uniform float darkness;\n" + s.fragmentShader.replace(from, "gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );");
  };
  // one 9-tap Gaussian pass (the weights of three.js's HorizontalBlurShader) along `dir`, two spreads at once: the
  // tight shadow in red, the wide one in alpha. `raw`: the source is the depth picture (both read its alpha)
  const W9 = "0.051, 0.0918, 0.12245, 0.1531, 0.1633, 0.1531, 0.12245, 0.0918, 0.051";
  const blur = new THREE.ShaderMaterial({ depthTest: false,
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, t: { value: 0 }, w: { value: 0 }, raw: { value: 1 } },
    vertexShader: "varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform sampler2D tDiffuse; uniform vec2 dir; uniform float t, w, raw; varying vec2 vUv;\n" +
      "const float K[9] = float[9](" + W9 + ");\n" +
      "void main() { float a = 0.0, b = 0.0;\n" +
      "  for (int i = 0; i < 9; i++) { float o = float(i - 4);\n" +
      "    vec4 ct = texture2D(tDiffuse, vUv + dir * t * o), cw = texture2D(tDiffuse, vUv + dir * w * o);\n" +
      "    a += K[i] * mix(ct.r, ct.a, raw); b += K[i] * cw.a; }\n" +
      "  gl_FragColor = vec4(a, 0.0, 0.0, b); }" });
  sh = { rt, rtBlur, group, plane, pool, blurPlane, cam: sc, depth, blur };
}
// one blur pass: src → dst along dir, tight spread t and wide spread w (in 1/256 of the texture per tap)
function blurPass(src, dst, dx, dy, t, w, raw) {
  const b = sh.blurPlane, u = sh.blur.uniforms; b.material = sh.blur;
  u.tDiffuse.value = src.texture; u.dir.value.set(dx, dy); u.t.value = t / 256; u.w.value = w / 256; u.raw.value = raw;
  ren.setRenderTarget(dst); ren.render(b, sh.cam);
}
function drawShadow() {
  sh.plane.visible = false; sh.pool.visible = false; scene.overrideMaterial = sh.depth;
  const ca = ren.getClearAlpha(); ren.setClearAlpha(0);
  ren.setRenderTarget(sh.rt); ren.render(scene, sh.cam);
  scene.overrideMaterial = null;
  sh.blurPlane.visible = true;
  blurPass(sh.rt, sh.rtBlur, 1, 0, CS.tight, CS.blur, 1); blurPass(sh.rtBlur, sh.rt, 0, 1, CS.tight, CS.blur, 0);
  // the second, weaker pass removes the wide blur's stepping (the tight one is copied: spread 0)
  blurPass(sh.rt, sh.rtBlur, 1, 0, 0, CS.blur * 0.4, 0); blurPass(sh.rtBlur, sh.rt, 0, 1, 0, CS.blur * 0.4, 0);
  sh.blurPlane.visible = false;
  ren.setRenderTarget(null); ren.setClearAlpha(ca); sh.plane.visible = true; sh.pool.visible = poolOn();
  S.shadowDraws = (S.shadowDraws || 0) + 1;
}
/* The floor. In the exploded and Mechanical views it is where teardown.js puts it (floorReq: 16 mm below the phone,
   easing to under the lowest piece as the phone explodes). Otherwise the phone stands on it: the floor is at its
   lowest point, and as the phone explodes it eases from there to teardown's floor with the explode. The light pool shows
   only in Whole. (fc_fail=float, build/shoot.py --selftest: the old floor 16 mm down, which the grounded check fails) */
let floorReq = FLOOR_Y;
const standing = () => props.mode !== "mechanical" && params.fc_fail !== "float";
const poolOn = () => props.mode === "whole" && S.explode === 0;
function floorY() { return standing() ? floorReq + (CONTACT_Y - FLOOR_Y) * (1 - S.explode) : floorReq; }
// what the shadow depends on; orbit, zoom and screen content are not in it
function modelSig() {
  let vis = 0, out = 0; asm.traverseVisible((o) => { if (o.isMesh) vis++; });
  for (let i = 0; i < S.reg.length; i++) out += S.reg[i].out + S.reg[i].obj.position.z;
  const p = asm.position;
  return [S.ang.toFixed(3), S.explode.toFixed(4), props.mode, out.toFixed(3), vis, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), asm.rotation.x.toFixed(4), sh.group.position.y].join("|");
}
// draws when the model changed: every Q.shadow.every-th changed frame (Low 4th, Mid and High 3rd) and once more when it
// stops; returns true when it skipped, so the loop asks for the frame that draws the final pose.
function shadowStep() {
  if (!sh) return false;
  const fy = floorY(); if (sh.group.position.y !== fy) sh.group.position.y = fy;
  sh.pool.visible = poolOn();
  const sig = modelSig(), changed = shForce || sig !== shSig; shSig = sig; shForce = false;
  if (changed) shPending = true;
  if (!shPending) return false;
  if (!changed || ++shSkip >= Q.shadow.every || params.shot) { drawShadow(); shPending = false; shSkip = 0; return false; }
  return true;
}
export function invalidateShadow() { shForce = true; invalidate(); }

/* Before the first frame: the closed-up phone does not draw what is inside it, so without this the
   first press of Exploded would compile those parts' shader programs and upload their geometry and textures in one
   frame (58 ms on the check PC, a phone 3 to 5 times that). Called once after the build, while every part is still
   drawn: compile walks every mesh and is given the time it needs (KHR_parallel_shader_compile where the GPU has it);
   then one draw of the whole model, from a camera that has all of it in view, into a single pixel of the canvas
   (the first real frame clears it) sends every mesh's geometry and every texture to the GPU, with the same programs
   the real frames use. Textures painted later are sent when their painting ends (materials.js, uploadTexture). */
const _vp = new THREE.Vector4(), _wc = new THREE.PerspectiveCamera(22, 1, 1, 4000), _ws = new THREE.Sphere();
export async function warmUp() {
  await ren.compileAsync(scene, cam);
  new THREE.Box3().setFromObject(asm).getBoundingSphere(_ws);
  _wc.position.copy(_ws.center).add(new THREE.Vector3(0, 0, _ws.radius / Math.sin(11 * Math.PI / 180) * 1.1)); _wc.lookAt(_ws.center);
  _wc.updateMatrixWorld(); ren.getViewport(_vp);
  try { ren.setViewport(0, 0, 1, 1); ren.render(scene, _wc); } finally { ren.setViewport(_vp); }
}
// the floor teardown.js asks for (16 mm below the folded phone, or under the exploded stack); floorY() decides where it
// goes (above, with the contact shadow)
export function setFloor(y) { floorReq = y; invalidateShadow(); }

/* ---------- the render loop: draws only when something changed ----------
   A frame is drawn when invalidate() was called, while an updater says it is still moving, while dragging or
   auto-rotating, and once more for a skipped shadow. Nothing is drawn while the viewer is off screen. */
let started = false, running = false, onScreen = true, live = false, lastT = 0;
function request() { if (!started || running || !onScreen) return; running = true; requestAnimationFrame(tick); }
setInvalidate(request);

// camera easing: time-based, so moves take the same time on a slow device as on a fast one. Returns true while moving.
export function updateCamera(dt) {
  const c = S.cur, v = S.view, k = 1 - Math.exp(-dt * 5.6);
  if (props.autoRotate && !S.dragging) v.az += 0.1 * dt;
  v.fk = viewK(v); if (!(c.fk > 0)) c.fk = v.fk;
  c.az += (v.az - c.az) * k; c.el += (v.el - c.el) * k; c.dist += (v.dist - c.dist) * k; c.fk += (v.fk - c.fk) * k;
  for (let i = 0; i < 3; i++) c.tgt[i] += (v.tgt[i] - c.tgt[i]) * k;
  aim(cam, c);
  const off = Math.abs(v.az - c.az) + Math.abs(v.el - c.el) + Math.abs(v.dist - c.dist) / 100 + Math.abs(v.fk - c.fk) + Math.abs(v.tgt[0] - c.tgt[0]) + Math.abs(v.tgt[1] - c.tgt[1]) + Math.abs(v.tgt[2] - c.tgt[2]);
  return off > 1e-4 || S.dragging || props.autoRotate;
}

function tick(now) {
  running = false;
  const pr = ren.getPixelRatio(); if (Math.abs(mount.clientWidth * pr - cvs.width) > 2 || Math.abs(mount.clientHeight * pr - cvs.height) > 2) resize();
  const dt = live ? Math.min(0.25, (now - lastT) / 1000) : 1 / 60, wasLive = live; lastT = now;
  let moving = false;
  for (let i = 0; i < updaters.length; i++) if (updaters[i](dt)) moving = true;
  if (shadowStep()) moving = true;
  ren.render(scene, cam); window.__fc.frames++;
  S.info = { calls: ren.info.render.calls, tris: ren.info.render.triangles };
  for (let i = 0; i < afterRender.length; i++) afterRender[i](cam);
  perf(now, wasLive);
  live = moving;
  if (moving) request();
}

export function startLoop() {
  // stop drawing while the viewer is scrolled out of sight (shots always draw)
  if (!params.shot && "IntersectionObserver" in window) new IntersectionObserver((es) => {
    onScreen = es[es.length - 1].isIntersecting; if (onScreen) { live = false; request(); } }).observe(root);
  // any input on the page asks for one frame: a control whose handler forgets invalidate() still shows its change,
  // and anything it starts moving keeps the loop going through the updaters
  ["pointerdown", "click", "input", "change", "keydown"].forEach((ev) => document.addEventListener(ev, request, true));
  started = true; request();
}

/* ---------- ?perf=1 overlay: draw calls, triangles, texture memory, frame time, frame counter, tier, DPR, GPU ---------- */
let perfEl = null, perfMs = 0, perfN = 0;
if (params.perf === "1") {
  perfEl = document.createElement("div"); perfEl.id = "perf";
  perfEl.style.cssText = "position:absolute;left:24px;bottom:112px;z-index:5;pointer-events:none;white-space:pre;padding:8px 10px;border-radius:10px;" +
    "font:500 11px/1.5 'IBM Plex Mono',monospace;background:rgba(18,19,22,.72);color:#e6ece6";
  root.appendChild(perfEl);
}
const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + " M" : n >= 1e3 ? Math.round(n / 1e3) + " k" : String(n));
function perf(now, cont) {
  if (!perfEl) return;
  if (cont && perfN) perfMs += (now - perfN - perfMs) * 0.1; perfN = now;
  const i = S.info, b = BUDGET[Q.tier] || {}, gpu = S.gpu || (S.gpu = glName(ren)), mb = texBytes() / 1048576;
  perfEl.textContent = [
    "calls  " + i.calls + " / " + b.calls,
    "tris   " + k(i.tris) + " / " + k(b.tris),
    "tex    " + mb.toFixed(1) + " / " + b.texMB + " MB",
    "frame  " + (perfMs ? perfMs.toFixed(1) + " ms" : "—"),
    "frames " + window.__fc.frames + "   shadow " + (S.shadowDraws || 0),
    "tier   " + Q.tier + " (" + (S.tierHow || "?") + (S.tierCapped ? ", phone cap" : "") + (S.probeMs ? ", probe " + S.probeMs + " ms" : "") + ")   dpr " + ren.getPixelRatio(),
    "gpu    " + (gpu.length > 46 ? gpu.slice(0, 45) + "…" : gpu)].join("\n");
}

/* ---------- camera and fold controls ----------
   A camera state is { az, el, dist, tgt, wide, base, fk }: the camera orbits its target tgt at dist × fk. fk is fitK
   (which widens the view on portrait screens so a view framed for a wide one keeps its width, see resize), except for a
   view that names the width it must show (wide, mm: the Whole presets, state.js views): it then widens only as much
   as that width needs at the view's own distance (base; zooming does not change it), between 1 and fitK, so on a
   phone the closed phone fills the width instead of a third of it (a wide screen never needs more
   than 1, so desktop framing is as before). fk is worked out each frame (viewK), so a turned phone re-frames, and eased
   with the rest. Until the zoom-to-point work the eye orbited tgt − (0, −1, 0), 1 mm above the point it looked at; it
   now orbits the point it looks at, which zoomAt needs to hold the point under the pointer exactly (the stills moved by
   about 2 px). */
function viewK(v) {
  const f = S.fitK || 1; if (!v.wide || !cam) return f;
  const need = v.wide / (2 * Math.tan(cam.fov * Math.PI / 360) * cam.aspect * (v.base || v.dist));
  return Math.max(1, Math.min(f, need));
}
function aim(o, c) {
  const d = c.dist * (c.fk || S.fitK || 1), g = c.tgt;
  o.position.set(g[0] + d * Math.cos(c.el) * Math.sin(c.az), g[1] + d * Math.sin(c.el), g[2] + d * Math.cos(c.el) * Math.cos(c.az));
  o.lookAt(g[0], g[1], g[2]);
  return o;
}
// zoom limits (dist, before fitK); how far (mm) zooming may walk the target. The near limit is 40 (was 220): the
// Mechanical view starts at about 160 on the middle hinge module, and zooming toward a gear must get closer, not jump
// back out; the camera's near plane is 20
const DIST = [40, 1200], TGT_MAX = 150;
const clampDist = (d) => Math.max(DIST[0], Math.min(DIST[1], d));
// the + and − buttons: zoom about the current target
export function zoom(f) { S.view.dist = clampDist(S.view.dist * f); invalidate(); }

/* Zoom toward a point on screen (the cursor, or a pinch's midpoint). The ray under the pointer, from the camera
   the view is heading to (S.view, not the eased one on screen, so quick wheel steps add up correctly), meets the plane
   through the target that faces the camera at P. Then tgt += (P − tgt)(1 − f) and dist ×= f: the eye moves along the
   ray through P and keeps its direction, so P stays under the pointer. f < 1 zooms in. While the view is not also
   turning, the easing keeps this true on the way: it moves the eye in a straight line along that same ray. f is first
   cut to the distance limits; the target may wander at most TGT_MAX from the default, so the phone cannot be lost off
   screen (a double tap resets).
   Returns P as [x, y, z], or null when nothing moved. */
const _vc = new THREE.PerspectiveCamera(), _ray = new THREE.Raycaster(), _pl = new THREE.Plane(), _ndc = new THREE.Vector2(),
  _P = new THREE.Vector3(), _g = new THREE.Vector3(), _n = new THREE.Vector3();
export function zoomAt(f, cx, cy) {
  const v = S.view, d1 = clampDist(v.dist * f), k = d1 / v.dist;
  if (!isFinite(k) || Math.abs(k - 1) < 1e-6) return null;
  aim(_vc.copy(cam, false), v).updateMatrixWorld();
  const r = mount.getBoundingClientRect();
  _ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  _ray.setFromCamera(_ndc, _vc);
  _g.fromArray(v.tgt); _pl.setFromNormalAndCoplanarPoint(_n.subVectors(_vc.position, _g).normalize(), _g);
  v.dist = d1;
  if (!_ray.ray.intersectPlane(_pl, _P)) { invalidate(); return null; }
  _g.lerp(_P, 1 - k);
  _n.set(DEF_TGT[0], DEF_TGT[1], DEF_TGT[2]); if (_g.distanceTo(_n) > TGT_MAX) _g.sub(_n).setLength(TGT_MAX).add(_n);
  v.tgt = _g.toArray();
  invalidate();
  return _P.toArray();
}

// double tap on the background: the current step's camera (or, in the whole phone, the last view button's), with
// its own target (the Mechanical view's is fitted, teardown.js) or the default one; the fold stays where it is
let preset = "hero";
const shortAz = (az) => { const tau = Math.PI * 2; while (az - S.view.az > Math.PI) az -= tau; while (az - S.view.az < -Math.PI) az += tau; return az; };
export function resetView() {
  const mv = (MODES[props.mode] && MODES[props.mode].view) || views[preset] || views.hero;
  Object.assign(S.view, { az: shortAz(mv.az), el: mv.el, dist: mv.dist, tgt: (mv.tgt || DEF_TGT).slice(), wide: mv.wide || 0, base: mv.dist }); S.focusReq = null; invalidate();
}
// (hitsModel, teardown.js: is there a visible mesh of the model under a point? Read from a 1-pixel id render.)

export function animateTo(target) {
  if (!S.setFold) return;
  S.foldTarget = target;
  // standard: an S-curve. Hand-over: a critically damped spring (fast start, long soft settle, no overshoot,
  // because a real hinge can't swing past flat)
  const from = S.ang, t0 = performance.now(), duo = props.duo, dur = duo ? 1350 : 900 + Math.abs(target - from) * 3, W = 7;
  const ease = duo ? (k) => (1 - (1 + W * k) * Math.exp(-W * k)) / (1 - (1 + W) * Math.exp(-W))
                   : (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  if (S.anim) cancelAnimationFrame(S.anim);
  const step = (now) => { const k = Math.min(1, (now - t0) / dur);
    S.setFold(from + (target - from) * ease(k)); if (k < 1) S.anim = requestAnimationFrame(step); };
  S.anim = requestAnimationFrame(step);
}
// v: { az, el, dist, ang, tgt?, wide? }
export function goView(v) {
  // take the short way round
  Object.assign(S.view, { az: shortAz(v.az), el: v.el, dist: v.dist, tgt: (v.tgt || DEF_TGT).slice(), wide: v.wide || 0, base: v.dist }); S.focusReq = null; animateTo(v.ang); invalidate(); }
export function go(name) { goView(views[name]); markBtn(name); }
export function markBtn(k) { if (views[k]) preset = k; Object.keys(btns).forEach((n) => btns[n] && btns[n].classList.toggle("on", n === k)); }
export function applyBackdrop() {
  const dark = props.backdrop === "graphite";
  root.classList.toggle("dark", dark);
  // the shadow a touch lighter on the dark backdrop, where it shows less; the pool a warm white on the light backdrop
  // (lighter than the floor band of the page's backdrop), a soft grey spot on the dark one
  if (sh) { const u = sh.plane.material.uniforms; u.tight.value = CS.opTight * (dark ? 0.85 : 1); u.wide.value = CS.opWide * (dark ? 0.85 : 1);
    sh.pool.material.color.setRGB(dark ? 0.42 : 1, dark ? 0.44 : 0.995, dark ? 0.47 : 0.985); sh.pool.material.opacity = dark ? 0.32 : 0.6; }
  setBacklightLook(dark);
  invalidate();
}

/* ---------- wire up the controls ---------- */
Object.keys(btns).forEach((n) => btns[n].addEventListener("click", () => go(n)));
// (in a step that holds its camera, the Mechanical view, Play only opens or shuts the fold: the camera stays on the
// mechanism)
if (playBtn) playBtn.addEventListener("click", () => {
  if ((MODES[props.mode] || {}).holdCam) { animateTo(S.ang < 90 ? 180 : 0); markBtn(null); } else go(S.ang < 90 ? "open" : "hero"); });
slider.addEventListener("input", (e) => { if (S.lockFold) return; if (S.anim) cancelAnimationFrame(S.anim); if (S.setFold) S.setFold(+e.target.value); markBtn(null); });
$("zoom-in").addEventListener("click", () => zoom(0.85));
$("zoom-out").addEventListener("click", () => zoom(1 / 0.85));
$("t-backdrop").addEventListener("change", (e) => { props.backdrop = e.target.checked ? "graphite" : "studio"; applyBackdrop(); });
$("t-rotate").addEventListener("change", (e) => { props.autoRotate = e.target.checked; invalidate(); });

/* ---------- start state ---------- */
{ const v0 = views.hero; S.view = { az: v0.az, el: v0.el, dist: v0.dist, tgt: DEF_TGT.slice(), wide: v0.wide || 0, base: v0.dist }; S.cur = { ...S.view, tgt: DEF_TGT.slice() }; }
applyBackdrop(); markBtn("hero");

/* camera hooks for build/shoot.py --zoomtest: snap the eased camera to the view, project a world point to client px,
   zoom toward a client point, read the view */
if (window.__fc) window.__fc.camera = {
  snap() { S.cur = { az: S.view.az, el: S.view.el, dist: S.view.dist, tgt: S.view.tgt.slice() }; updateCamera(0); invalidate(); },
  project(p) { cam.updateMatrixWorld(); const r = mount.getBoundingClientRect(), q = new THREE.Vector3().fromArray(p).project(cam);
    return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]; },
  zoomAt, resetView,
  view: () => ({ az: S.view.az, el: S.view.el, dist: S.view.dist, tgt: S.view.tgt.slice() })
};

/* ---------- look checks for build/shoot.py (checks a to g) ----------
   lookPixels draws the frame once more and reads its pixels back at once (in the same task, before the browser shows
   it), then draws the model once more in flat colours, one per kind of surface asked for, into a render target, and
   reads that back: so a check knows which pixel is which surface without guessing from colour. A pixel counts only if
   the pixels 2 px away on all four sides are the same surface, so edges and their antialiasing are left out. The floor
   is not drawn in the flat pass. Runs only when shoot.py asks; nothing here runs per frame.
   kinds: [[name, test(mesh, material)], ...]; the first test that passes names the pixel, any other pixel of the model
   is "other". Returns, per name, the pixels' colours (r, g, b in 0..255, as shown) and their canvas positions (x, y in
   drawing-buffer px from the top left).
   zoom (optional): { x, y, w, h }, a rectangle of the view (drawing-buffer px) to draw magnified to the whole canvas
   instead (camera.setViewOffset): every pixel keeps the ray it has in the still, so it sees the same light, only
   larger. For parts a few pixels wide at phone size (the spine's rails), which the edge rule above would leave out. */
const _flat = new Map();
function flatMat(id, side) { const k = id + ":" + side;
  if (!_flat.has(k)) _flat.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(id / 255, 0, 0), side }));
  return _flat.get(k); }
function lookPixels(kinds, zoom, raw) {
  const w = cvs.width, h = cvs.height, gl = ren.getContext(), col = new Uint8Array(w * h * 4), ids = new Uint8Array(w * h * 4);
  const rt = new THREE.WebGLRenderTarget(w, h), kept = [], fv = sh.group.visible, ca = ren.getClearAlpha();
  const id = (o, m) => { for (let i = 0; i < kinds.length; i++) if (kinds[i][1](o, m)) return i + 1; return 255; };
  try {
    if (zoom) cam.setViewOffset(w, h, zoom.x, zoom.y, zoom.w, zoom.h);
    ren.setRenderTarget(null); ren.render(scene, cam); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, col);
    asm.traverse((o) => { if (!o.isMesh) return; kept.push([o, o.material]);
      o.material = Array.isArray(o.material) ? o.material.map((m) => flatMat(id(o, m), m.side)) : flatMat(id(o, o.material), o.material.side); });
    sh.group.visible = false;
    ren.setRenderTarget(rt); ren.setClearAlpha(0); ren.clear(); ren.render(scene, cam); ren.readRenderTargetPixels(rt, 0, 0, w, h, ids);
  } finally {
    kept.forEach(([o, m]) => { o.material = m; }); sh.group.visible = fv; ren.setRenderTarget(null); ren.setClearAlpha(ca); rt.dispose();
    if (zoom) cam.clearViewOffset();
    invalidate();
  }
  const out = { other: { rgb: [], xy: [] } }; kinds.forEach((k) => { out[k[0]] = { rgb: [], xy: [] }; });
  const at = (x, y) => ids[(y * w + x) * 4];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const k = at(x, y); if (!k || (!raw && (at(x - 2, y) !== k || at(x + 2, y) !== k || at(x, y - 2) !== k || at(x, y + 2) !== k))) continue;
    const o = out[k === 255 ? "other" : kinds[k - 1][0]], i = (y * w + x) * 4;
    o.rgb.push([col[i], col[i + 1], col[i + 2]]); o.xy.push([x, h - 1 - y]);   // (read-back rows run bottom up)
  }
  return out;
}
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
const mean = (a) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length * 10) / 10 : null);
const hex3 = (v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const FCX = () => window.__fc || (window.__fc = {});
// (a) finish-true: the median colour of the back and of the face, with their swatches
FCX().finishLook = () => {
  const L = lookPixels([["back", (o, m) => m === mat("back")], ["face", (o, m) => m === mat("face")]]), f = fin();
  const one = (k) => ({ n: L[k].rgb.length, median: [0, 1, 2].map((c) => median(L[k].rgb.map((p) => p[c]))) });
  return { finish: props.finish, swatch: { back: hex3(f.back), face: hex3(f.face) }, back: one("back"), face: one("face") };
};
// (b) burn-out: of every pixel of the model, how many are near white (all three channels at 250 or more)
FCX().burnLook = () => {
  const px = lookPixels([]).other.rgb;
  return { n: px.length, hot: px.filter((c) => c[0] >= 250 && c[1] >= 250 && c[2] >= 250).length };
};
/* (d) screen black: the mean luminance of a patch of the inner screen whose picture is dark (the open chat's pane,
   right of the holiday photo, screens.js: panel coords x 52 to 65, y 4 to 27 mm, on the right half), as drawn: the
   picture plus what the glass reflects */
const PATCH = [[52, 4], [65, 4], [65, 27], [52, 27]];
FCX().screenLook = () => {
  let disp = null;
  asm.traverse((o) => { if (!o.isMesh || o.material !== S.dispMat) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox.max.x > 30) disp = o; });
  if (!disp) return null;
  asm.updateMatrixWorld(true); cam.updateMatrixWorld();
  const w = cvs.width, h = cvs.height, q = PATCH.map(([x, y]) => { const v = disp.localToWorld(new THREE.Vector3(x, y, 0)).project(cam); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; });
  const side = (x, y, s) => q.every((a, i) => { const b = q[(i + 1) % 4]; return s * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) >= 0; });
  const L = lookPixels([["disp", (o, m) => m === S.dispMat]]), px = L.disp.rgb.filter((c, i) => { const [x, y] = L.disp.xy[i]; return side(x, y, 1) || side(x, y, -1); });
  return { n: px.length, mean: mean(px.map(lum)) };
};
/* (e) one metal across the spine. `same`: the spine cover's material and the frame's, as set (colour, roughness,
   metalness): they must be equal, so neither can be tuned against the other. `cover`, `frame`: the mean luminance of
   each as drawn in this still (every frame-metal pixel in it). They face different ways, so they do not light alike;
   shoot.py allows the same spread as between the fold's end and the rails.
   Until hinge round 2 this compared the cover with "the rails beside it": the frame's pixels within one cover's width
   of the cover. From behind, the back plates reach the cover along its whole run, so that sample was only the scraps
   of frame at the fold's two ends: 11 px at Low, 108 at Mid, reading 160 to 198 of 255 from one tier to the next. The
   cover's look was tuned to it once (roughness 0.46 against the frame's 0.40); that is undone, and this check now
   forbids it. */
const boxOf = (xy) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  xy.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }); return [x0, x1, y0, y1]; };
FCX().railLook = () => {
  const cm = mat("hingeCover"), fm = mat("frame"), L = lookPixels([["cover", (o, m) => m === cm], ["frame", (o, m) => m === fm]]);
  const st = (px) => ({ n: px.length, mean: mean(px.map(lum)) }), set = (m) => [m.color.getHexString(), +m.roughness.toFixed(4), +m.metalness.toFixed(4)].join(" ");
  return { cover: st(L.cover.rgb), frame: st(L.frame.rgb), same: set(cm) === set(fm), set: { cover: set(cm), frame: set(fm) } };
};
/* (i) the mechanism hidden: how many of the still's pixels show the hinge's hidden faces (the dark look, endCap: the
   spine cover's inside and rim, the end plates' tops, the halves' knuckles and the bumpers between the glass ears) or
   any hinge piece but the cover and the screen over the fold, and how many show the model at all. From outside, from
   behind or from an end, none may show: the cover, the two frames and the seams between them are all there is. */
FCX().mechLook = () => {
  const dark = mat("endCap"), L = lookPixels([["mech", (o, m) => m === dark || (/^hinge\./.test(o.name) && !/^hinge\.(cover|fold-strip)$/.test(o.name))]]);
  return { mech: L.mech.rgb.length, model: L.mech.rgb.length + L.other.rgb.length, box: L.mech.xy.length ? boxOf(L.mech.xy) : null };
};
/* what is drawn at a point of the page (CSS px): the nearest mesh on that line of sight, as "name [material] @ x, y, z"
   (its own group's coords, mm). For a failed check's message (build/shoot.py names what a dark-slot pixel shows). */
FCX().whoAt = (x, y) => {
  const r = mount.getBoundingClientRect(), rc = new THREE.Raycaster(); asm.updateMatrixWorld(true); cam.updateMatrixWorld();
  rc.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, 1 - (y - r.top) / r.height * 2), cam);
  const h = rc.intersectObject(asm, true).find((i) => { for (let o = i.object; o; o = o.parent) if (!o.visible) return false; return i.object.layers.mask && [].concat(i.object.material).every((m) => m.visible !== false); });
  if (!h) return null;
  const m = [].concat(h.object.material)[h.face ? h.face.materialIndex || 0 : 0], p = h.object.parent.worldToLocal(h.point.clone());
  return (h.object.name || "(unnamed)") + " [" + (m && m.name || "?") + "] @ " + p.toArray().map((v) => v.toFixed(2)).join(", ");
};
/* (j) nothing seen through the fold's ends: how many of the still's pixels show anything but the spine cover's
   outside and the frames' metal on a line of sight that comes in through an end of the fold (hinge.js, endHits: the
   cover's end face or a half's end wall). Every pixel counts, not only those 2 px inside a patch: a see-through seam
   is a sliver (the cover's solid end once left one each side when shut, the screen and the inside showing through,
   which the mechanism check above, counting the dark look only and only inside patches, passed) */
FCX().seamLook = () => {
  if (!FCX().endHits) return null;
  const ok = [mat("hingeCover"), mat("frame"), mat("antenna")], pl = [mat("back"), mat("face")], dark = mat("endCap");
  const L = lookPixels([["ok", (o, m) => ok.indexOf(m) >= 0], ["plate", (o, m) => pl.indexOf(m) >= 0],
    ["mech", (o, m) => m === dark || (/^hinge\./.test(o.name) && !/^hinge\.(cover|fold-strip)$/.test(o.name))]], null, true);
  const hit = (k) => FCX().endHits(L[k].xy, cvs.width, cvs.height), r = hit("other"), p = hit("plate"), q = hit("mech");
  return r && { seen: r.n + q.n, plate: p.n, mech: q.n, model: L.ok.xy.length + L.plate.xy.length + L.mech.xy.length + L.other.xy.length, box: r.box || q.box, pbox: p.box };
};
/* (f, g) one surface's tone: per registry material name, how many pixels show, their mean
   luminance and their median colour, with the finish's frame swatch (the frame-tone and island-black checks) */
FCX().matLook = (names) => {
  const L = lookPixels(names.map((n) => [n, (o, m) => m === mat(n)])), out = { swatch: { frame: hex3(fin().frame) } };
  names.forEach((n) => { const px = L[n].rgb, l = px.map(lum).sort((a, b) => a - b);
    out[n] = { n: px.length, mean: mean(l), q25: l.length ? Math.round(l[l.length >> 2]) : null, median: [0, 1, 2].map((c) => median(px.map((p) => p[c]))) }; });
  return out;
};
/* (c) grounded: a line down the page from the phone's lowest drawn pixel, through the floor in front of it. x: the
   column through the middle of the phone's bottom edge; yEdge: just below the lowest pixel of the model in that column
   (from the flat pass); yEnd: where a floor point 40 mm in front of the phone (toward the camera) lands. Page CSS px. */
FCX().contactLine = () => {
  asm.updateMatrixWorld(true); cam.updateMatrixWorld();
  // (only what is drawn: teardown.js keeps hidden merged copies of Simple exploded's units in the model, and a box
  // round every object would count them where they lie when the phone is folded)
  const box = new THREE.Box3(); asm.traverseVisible((o) => { if (o.isMesh && o.layers.mask) box.expandByObject(o); });
  const c = box.getCenter(new THREE.Vector3()), fy = sh.group.position.y;
  const w = cvs.width, h = cvs.height, r = mount.getBoundingClientRect(), k = r.width / w;
  const scr = (v) => { v.project(cam); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; };
  const toCam = new THREE.Vector3(cam.position.x - c.x, 0, cam.position.z - c.z).normalize();
  const x = Math.round(scr(new THREE.Vector3(c.x, fy, c.z))[0]);
  const end = scr(new THREE.Vector3(c.x, fy, c.z).addScaledVector(toCam, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 40));
  let yEdge = -1; lookPixels([]).other.xy.forEach(([px, py]) => { if (Math.abs(px - x) <= 1 && py > yEdge) yEdge = py; });
  if (yEdge < 0) return null;
  // (+2: the flat pass's pixels are those 2 px inside the model's outline)
  return { x: r.left + x * k, yEdge: r.top + (yEdge + 2) * k, yEnd: r.top + end[1] * k, floorY: fy };
};
