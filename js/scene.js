/* Fold Communicator — renderer, camera, studio light, contact shadow, quality switch, the render loop (draws only
   when something changed) and the camera controls. Owner: B1 (BUILD-SPEC 4.2–4.4, 6.1). */
import * as THREE from "three";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";
import { props, S, GEO, Q, BUDGET, params, views, setTier, updaters, afterRender, setInvalidate, invalidate } from "./state.js";
import { $, trackTarget, untrackTarget, texBytes } from "./util.js";
import { studio } from "./materials.js";
import { pick, hitsModel, MODES } from "./teardown.js";

const root = $("viewer"), mount = $("mount"), slider = $("hinge"), playBtn = $("v-play"), qSel = $("t-quality"), lostEl = $("gllost");
const btns = {};
["hero", "front", "flex", "open", "back"].forEach((n) => { btns[n] = $("v-" + n); });
const DEF_TGT = [0, -1, 0];   // where the camera looks unless a view focuses on something
const FLOOR_Y = -GEO.H / 2 - 16;
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
  // Neutral keeps the finish hex colours true (R4 2.3); no shadow maps: the floor shadow is the contact shadow below
  ren.toneMapping = THREE.NeutralToneMapping; ren.toneMappingExposure = 1.0;
  cvs = ren.domElement; cvs.style.cssText = "width:100%;height:100%;display:block"; mount.appendChild(cvs);
  asm = new THREE.Group(); scene.add(asm);
  Object.assign(S, { scene, cam, asm, goView, markBtn });

  new ResizeObserver(() => { resize(); invalidate(); }).observe(mount); resize();

  /* Pointers (FABLE-REVIEW-1 F3). Every pointer on the viewer is tracked by id. One pointer orbits. Two pinch: the
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

  /* WebGL context loss (F13). Phones drop the context under memory pressure or when the tab is in the background.
     three.js stops drawing by itself (it calls preventDefault too, which asks the browser for the context back). The
     viewer says so. On restore three.js re-uploads geometry and the canvas-painted textures by itself; what lived
     only on the GPU is rebuilt here: the studio environment (restoreEnv) and the contact shadow. If the browser never
     gives the context back, tapping the line reloads the page. */
  cvs.addEventListener("webglcontextlost", (e) => { e.preventDefault(); S.glLost = true; if (lostEl) lostEl.hidden = false; }, false);
  cvs.addEventListener("webglcontextrestored", () => { S.glLost = false; restoreEnv(); if (lostEl) lostEl.hidden = true; invalidateShadow(); }, false);
  if (lostEl) lostEl.addEventListener("click", () => location.reload());

  return { T: THREE, ren, scene, cam, asm };
}

/* ---------- quality tier (BUILD-SPEC 4.3) ----------
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
      t = ms < 6 ? "high" : ms < 12 ? "mid" : "low";   // thresholds are R4's guesses (4.4); tune on Isaac's phone
      store.set("fc.quality.auto", JSON.stringify({ tier: t, gl, ms: S.probeMs }));
    }
    /* Phone cap (G2-05): Auto never picks High on a touch screen or a viewer under 900 CSS px wide. High is pixel
       ratio 2, about 131 MB of textures and 316k triangles, and the probe thresholds above have never been measured on
       a phone: a recent flagship passes the 6 ms probe and would get it. The visitor can still choose High by hand.
       What lifts the cap: Isaac's phone (and one mid-range phone) on ?quality=high&perf=1, the frame time while
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
  pm.dispose(); st.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
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
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-200, 300, 250);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 0.8); rim.position.set(220, 140, -260);
  scene.add(key, rim);
  buildShadow();
  applyBackdrop();
  return envRT.texture;
}

/* ---------- contact shadow (port of three.js webgl_shadow_contact, R4 2.4) ----------
   An orthographic camera on the floor looks up and draws the model with a depth material that is darker the nearer
   the floor; two blur passes soften it; a plane on the floor shows it. It is redrawn only when the model changes
   (fold, teardown, explode, visibility, floor), never for orbit, zoom or idle frames, and then at most every
   Q.shadow.every-th changed frame, plus once when the model stops (FABLE-REVIEW-1 F2: every changed frame at Mid
   drew the whole model twice per frame while the hinge moved). Only meshes on SHADOW_LAYER are drawn into it: every
   mesh except those marked userData.small (screws, springs and the hinge's other small pieces, the board passives,
   each part's surface details, the ribbons and their stiffeners), which a 1 mm-per-texel, blurred shadow cannot show
   anyway (shadowCasters, run once after the build). */
const CS = { size: 260, far: 140, blur: 3.5 }, SHADOW_LAYER = 1;
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
  const plane = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, depthWrite: false, opacity: 0.55 }));
  plane.renderOrder = 1; plane.scale.y = -1; group.add(plane);   // the texture's y is flipped
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
  const hb = new THREE.ShaderMaterial(HorizontalBlurShader), vb = new THREE.ShaderMaterial(VerticalBlurShader);
  hb.depthTest = vb.depthTest = false;
  sh = { rt, rtBlur, group, plane, blurPlane, cam: sc, depth, hb, vb };
}
function blurShadow(amount) {
  const b = sh.blurPlane; b.visible = true;
  b.material = sh.hb; sh.hb.uniforms.tDiffuse.value = sh.rt.texture; sh.hb.uniforms.h.value = amount / 256;
  ren.setRenderTarget(sh.rtBlur); ren.render(b, sh.cam);
  b.material = sh.vb; sh.vb.uniforms.tDiffuse.value = sh.rtBlur.texture; sh.vb.uniforms.v.value = amount / 256;
  ren.setRenderTarget(sh.rt); ren.render(b, sh.cam);
  b.visible = false;
}
function drawShadow() {
  sh.plane.visible = false; scene.overrideMaterial = sh.depth;
  const ca = ren.getClearAlpha(); ren.setClearAlpha(0);
  ren.setRenderTarget(sh.rt); ren.render(scene, sh.cam);
  scene.overrideMaterial = null;
  blurShadow(CS.blur); blurShadow(CS.blur * 0.4);   // the second, weaker pass removes the blur's stepping
  ren.setRenderTarget(null); ren.setClearAlpha(ca); sh.plane.visible = true;
  S.shadowDraws = (S.shadowDraws || 0) + 1;
}
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
  const sig = modelSig(), changed = shForce || sig !== shSig; shSig = sig; shForce = false;
  if (changed) shPending = true;
  if (!shPending) return false;
  if (!changed || ++shSkip >= Q.shadow.every || params.shot) { drawShadow(); shPending = false; shSkip = 0; return false; }
  return true;
}
export function invalidateShadow() { shForce = true; invalidate(); }

/* Before the first frame (FABLE-REVIEW-1 F2): the closed-up phone does not draw what is inside it, so without this the
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
// floor height for the contact shadow (default: 16 mm below the folded phone, as before)
export function setFloor(y) { if (sh) sh.group.position.y = y; invalidateShadow(); }

/* ---------- the render loop: draws only when something changed (BUILD-SPEC 4.4, R4 4.5) ----------
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
   phone the closed phone fills the width instead of a third of it (FABLE-REVIEW-2 D7; a wide screen never needs more
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
// back out (FABLE-REVIEW-2 N1, N2); the camera's near plane is 20
const DIST = [40, 1200], TGT_MAX = 150;
const clampDist = (d) => Math.max(DIST[0], Math.min(DIST[1], d));
// the + and − buttons: zoom about the current target
export function zoom(f) { S.view.dist = clampDist(S.view.dist * f); invalidate(); }

/* Zoom toward a point on screen (the cursor, or a pinch's midpoint), F3. The ray under the pointer, from the camera
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
  // standard: an S-curve. Duo-style: a critically damped spring (fast start, long soft settle, no overshoot,
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
  if (sh) sh.plane.material.opacity = dark ? 0.45 : 0.55;
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
