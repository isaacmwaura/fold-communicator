/* Fold Communicator — start-up, and the shot hooks build/shoot.py drives (BUILD-SPEC 5.1, 5.3).
   Model units are millimetres. Origin is the device centre, Y is up.
   In front view the hinge is on the left and the device opens like a book. Frozen after B0. */
import * as THREE from "three";
import { props, S, Q, BUDGET, PERF_BUDGET, params, views, SHOTS, MODE_CAM, addUpdater, addAfterRender, afterRender, invalidate } from "./state.js";
import { $, texBytes } from "./util.js";
import { createMaterials, painted } from "./materials.js";
import { createScene, chooseTier, buildLook, startLoop, updateCamera, goView, animateTo, markBtn, shadowCasters, warmUp } from "./scene.js";
import { buildExterior, repaintKeys } from "./exterior.js";
import { buildHinge, buildSpinePart } from "./hinge.js";
import { buildInternals, partBox, repaintInternals } from "./internals.js";
import { createScreens, addScreenDetails, repaintScreens, updateDuo } from "./screens.js";
import { MODES, setMode, setDetail, updateTeardown, createLabels, layoutLabels, labelCount, showCard } from "./teardown.js";

const FC = window.__fc || (window.__fc = { ready: false, errors: [], warn: [], gl: "", frames: 0, stats: null, budget: null });
const html = document.documentElement;
const fcError = (msg) => { FC.errors.push(String(msg)); html.setAttribute("data-fc-errors", String(FC.errors.length)); };
const FONTS = ["300 80px 'IBM Plex Sans'", "400 20px 'IBM Plex Sans'", "500 40px 'IBM Plex Sans'", "600 40px 'IBM Plex Sans'", "500 20px 'IBM Plex Mono'", "400 20px 'IBM Plex Mono'"];

/* ---------- shot hooks ---------- */
const settled = () => S.explode === (S.explodeT || 0) && Math.abs(S.ang - (S.foldTarget === undefined ? S.ang : S.foldTarget)) < 0.01 &&
  S.reg.every((r) => r.out === (r.hide ? 1 : 0));

// focus selector on userData: "flag", "flag=value" or "part=<id>". Aims the camera at the centre of the world box of
// the matching visible meshes; distance = the row's dist, else box radius ÷ sin(fov/2) × 1.1.
function resolveFocus() {
  const f = S.focusReq; S.focusReq = null; if (!f) return;
  const eq = f.sel.indexOf("="), k = eq < 0 ? f.sel : f.sel.slice(0, eq), val = eq < 0 ? null : f.sel.slice(eq + 1);
  S.asm.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3(); let n = 0;
  S.asm.traverse((o) => { if (!o.isMesh) return; for (let q = o; q; q = q.parent) if (!q.visible) return;
    const u = o.userData, hit = k === "part" ? !!(u.part && u.part.id === val) : (val === null ? !!u[k] : u[k] !== undefined && String(u[k]) === val);
    if (hit) { b.setFromObject(o); box.union(b); n++; } });
  if (!n) { fcError("focus '" + f.sel + "' matched no visible mesh"); return; }
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  S.view.tgt = [c.x, c.y, c.z];
  S.view.dist = f.dist || r / Math.sin(S.cam.fov * Math.PI / 360) * 1.1;
  invalidate();
}
// a focus waits until the mode and fold have settled (with ?shot=1 that is at once, see snapAll)
function updateFocus() { if (S.focusReq && settled()) resolveFocus(); return !!S.focusReq; }

// `only`: hide every mesh whose userData[flag] is not true; null shows everything again
function setOnly(flag) {
  S.asm.traverse((o) => { if (!o.isMesh) return; const hide = !!flag && o.userData[flag] !== true;
    if (hide) { o.userData.onlyHidden = true; o.visible = false; } else if (o.userData.onlyHidden) { o.userData.onlyHidden = false; o.visible = true; } });
  invalidate();
}
function setLabels(on) { props.labels = on; $("t-labels").checked = on; invalidate(); }

// apply one SHOTS row: High detail, mode, fold angle, camera, focus, labels, only
function applyView(name) {
  const row = SHOTS[name]; if (!row) { fcError("unknown view '" + name + "'"); return; }
  setDetail(!!row.detail, true);
  setMode(row.mode, true);
  const mv = MODES[row.mode].view || {}, fromMode = row.cam === MODE_CAM;
  // (a mode's view may carry its own target: the Mechanical view's is fitted, teardown.js; a row may name one, in world mm)
  goView({ az: fromMode ? mv.az : row.az, el: fromMode ? mv.el : row.el, dist: fromMode ? mv.dist * (row.zoom || 1) : (row.dist || S.view.dist), ang: row.ang,
    tgt: fromMode ? mv.tgt : row.tgt, wide: row.mode === "whole" && views[name] ? views[name].wide : 0 });
  setLabels(!!row.labels);
  // testCard: the inner screen shows one flat grey, so a still sees the crease and nothing of the picture (crease150)
  if (!!row.testCard !== !!S.testCard) { S.testCard = !!row.testCard; repaintScreens(); }
  if (row.focus) S.focusReq = { sel: row.focus, dist: row.dist || 0 };
  const only = params.only || row.only || null;
  setOnly(only);
  markBtn(views[name] && row.mode === "whole" ? name : null);
  FC.view = { name, mode: props.mode, only };
}

// jump every eased value to its target, so stills never catch a half-finished move
function snapAll() {
  if (S.anim) cancelAnimationFrame(S.anim); S.anim = null;
  if (S.foldTarget !== undefined) S.setFold(S.foldTarget);
  updateTeardown(0, true);
  resolveFocus();
  S.cur = { az: S.view.az, el: S.view.el, dist: S.view.dist, tgt: S.view.tgt.slice() };
  updateCamera(0);
  invalidate();
}

// URL parameters (BUILD-SPEC 5.3), applied once after the build, through the page's own controls where there is one
function applyParams() {
  const P = params, on = (k) => P[k] === "1";
  const click = (sel) => { const b = document.querySelector(sel); if (b) b.click(); };
  const check = (id, v) => { const c = $(id); if (c && c.checked !== v) { c.checked = v; c.dispatchEvent(new Event("change")); } };
  if (P.finish) click('[data-finish="' + P.finish + '"]');
  if (P.backdrop) check("t-backdrop", P.backdrop === "graphite");
  if (P.single !== undefined) check("t-single", on("single"));
  if (P.duo !== undefined) check("t-duo", on("duo"));
  if (P.shot) check("t-rotate", false);
  if (P.view) applyView(P.view); else if (P.only) setOnly(P.only);
  if (P.detail !== undefined) setDetail(on("detail"), !P.view);
  if (P.mode && MODES[P.mode]) { setMode(P.mode, !!P.view); if (FC.view) FC.view.mode = P.mode; }
  if (P.ang !== undefined && isFinite(+P.ang)) animateTo(Math.max(0, Math.min(180, +P.ang)));
  ["az", "el"].forEach((k) => { if (P[k] !== undefined && isFinite(+P[k])) S.view[k] = +P[k]; });
  // ?tgt=x,y,z: where the camera looks (world mm), for close-ups by hand
  if (P.tgt) { const t = P.tgt.split(",").map(Number); if (t.length === 3 && t.every(isFinite)) S.view.tgt = t; }
  if (P.dist !== undefined && isFinite(+P.dist)) { S.view.dist = +P.dist; if (S.focusReq) S.focusReq.dist = +P.dist; }
  if (P.labels !== undefined) setLabels(on("labels"));
  // ?card=<unit or part id>: open that card (a still of a card, e.g. view=exploded&card=motherboard)
  if (P.card && !showCard(P.card)) fcError("card '" + P.card + "' names no unit or part");
  if (!FC.view) FC.view = { name: null, mode: props.mode, only: P.only || null };
}

const frames = (n) => new Promise((res) => { const f0 = FC.frames, w = () => { invalidate(); if (FC.frames >= f0 + n) res(); else requestAnimationFrame(w); }; w(); });
function fillStats() {
  const i = S.info || { calls: 0, tris: 0 };
  FC.stats = { calls: i.calls, tris: i.tris, texMB: Math.round(texBytes() / 1048576 * 10) / 10, overlaps: FC.overlaps === undefined ? null : FC.overlaps, tier: Q.tier, dpr: S.ren.getPixelRatio(),
    labels: labelCount() };
  FC.budget = BUDGET[Q.tier]; FC.perfBudget = PERF_BUDGET;
  html.setAttribute("data-fc-stats", JSON.stringify(FC.stats));
}
function glName(ren) { const gl = ren.getContext(), ex = gl.getExtension("WEBGL_debug_renderer_info");
  return String(gl.getParameter(ex ? ex.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ""); }

FC.shots = Object.keys(SHOTS);
FC.setView = async (name) => {
  FC.ready = false; html.removeAttribute("data-fc-ready");
  applyView(name); if (params.shot) snapAll();
  await frames(2); fillStats();
  FC.ready = true; html.setAttribute("data-fc-ready", "1");
};

/* ---------- __fc.perf: the frame cost of one mode move, made the way a person makes it (FABLE-REVIEW-1 F11, WP0) ----------
   From Hero (closed, Whole, labels on), press the mode button btnId ("m-explode", "m-back", "m-screens") and watch
   PERF_BUDGET.windowMs: frames drawn, and the longest main-thread task (Chrome's own 'longtask' report). Once the move
   has come to rest, time the label layout (the after-render step) and read draw calls and triangles. Needs a page
   without ?shot=1: shot mode snaps every move and runs the label check at once, so it never shows the real cost. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const camOff = () => { const c = S.cur, v = S.view; return Math.abs(c.az - v.az) + Math.abs(c.el - v.el) + Math.abs(c.dist - v.dist) / 100 + Math.abs((c.fk || 0) - (v.fk || 0)); };
// true once nothing moves and no frame has been drawn for quietMs (false if that has not happened after maxMs)
async function rest(quietMs, maxMs) {
  const end = performance.now() + maxMs; let f = FC.frames, since = performance.now();
  while (performance.now() < end) {
    await sleep(50);
    if (FC.frames !== f || !settled() || camOff() > 1e-3) { f = FC.frames; since = performance.now(); continue; }
    if (performance.now() - since >= quietMs) return true;
  }
  return false;
}
FC.perf = async (btnId) => {
  if (params.shot) throw new Error("__fc.perf needs a page without ?shot=1");
  const btn = $(btnId); if (!btn) throw new Error("__fc.perf: no button #" + btnId);
  await painted();                                   // the progressive texture painting must not count against the move
  applyView("hero"); setLabels(true); snapAll();
  const calm = await rest(500, 8000);
  const win = PERF_BUDGET.windowMs, stamps = [], tasks = [];
  const lt = typeof PerformanceObserver === "function" && (PerformanceObserver.supportedEntryTypes || []).indexOf("longtask") >= 0;
  const obs = lt ? new PerformanceObserver((l) => { tasks.push(...l.getEntries()); }) : null;
  if (obs) obs.observe({ type: "longtask" });
  // stamp each frame as it is drawn, before the label layout runs (a frame whose labels then block still counts once)
  const rec = () => { stamps.push(performance.now()); };
  afterRender.unshift(rec);
  const t0 = performance.now(); btn.click();
  while (performance.now() < t0 + win) await sleep(t0 + win - performance.now() + 1);
  if (obs) { tasks.push(...obs.takeRecords()); obs.disconnect(); }
  afterRender.splice(afterRender.indexOf(rec), 1);
  const nFrames = stamps.filter((t) => t <= t0 + win).length;
  const inWin = tasks.filter((e) => e.startTime + e.duration >= t0 && e.startTime <= t0 + win);
  const rested = await rest(300, 15000) && calm;
  // label layout at rest: the middle of three calls, each one forced to make a full label check (as when the view
  // stops moving after a change; a call with nothing changed skips the check and would flatter the number)
  const ms = [];
  for (let i = 0; i < 3; i++) { const t = performance.now(); layoutLabels(S.cam, true); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  await frames(1);
  const i = S.info || { calls: 0, tris: 0 };
  return { btn: btnId, mode: props.mode, tier: Q.tier, rested, frames: nFrames, windowMs: win,
    longestTaskMs: obs ? Math.round(inWin.reduce((m, e) => Math.max(m, e.duration), 0)) : null, longTasks: inWin.length,
    labelMsAtRest: Math.round(ms[1] * 10) / 10, labels: labelCount(), calls: i.calls, tris: i.tris };
};

/* ---------- start-up ---------- */
async function start() {
  const { T, ren, asm } = createScene();
  await chooseTier(ren);
  const env = buildLook();
  createMaterials(T, ren, env);
  createScreens(T, env);
  const panel = new T.Group(), deck = new T.Group(), spine = new T.Group(); asm.add(panel, deck, spine);
  const mk = (geo, m, par, shadow) => { const o = new T.Mesh(geo, m); o.castShadow = shadow !== false; par.add(o); return o; };
  // (what the builders read: the three.js namespace, the three groups, the mesh maker and the part builders; the rest
  // they import themselves)
  const ctx = { T, G: { panel, deck, spine }, mk, partBox, spinePart: buildSpinePart };
  buildExterior(ctx);
  buildHinge(ctx);
  buildInternals(ctx);
  addScreenDetails(ctx);
  createLabels();
  // the contact shadow's casters, then shader programs and textures for every part, hidden ones included (scene.js)
  shadowCasters();
  await warmUp();
  // per-frame order: camera easing, teardown easing, Duo effect, focus; then render; then label layout
  addUpdater(updateCamera); addUpdater(updateTeardown); addUpdater(updateDuo); addUpdater(updateFocus);
  addAfterRender(layoutLabels);
  applyParams();
  if (params.shot) snapAll();
  startLoop();
  if (params.fc_fail === "throw") setTimeout(() => { throw new Error("fc_fail=throw: forced test error"); }, 0);
  if (params.fc_fail === "404") import("./missing.js");   // a module that does not exist
  // a frame that costs 120 ms outside Whole mode, so the --perf step must fail (shoot.py --selftest)
  if (params.fc_fail === "slow") addAfterRender(() => { if (props.mode === "whole") return; const t = performance.now(); while (performance.now() - t < 120) { /* busy */ } });
  if (document.fonts) {
    try { await Promise.all(FONTS.map((f) => document.fonts.load(f))); await document.fonts.ready; } catch (e) { /* the fallback font still reads */ }
  }
  repaintScreens(); repaintKeys(); repaintInternals();
  if (params.shot) snapAll();
  if (params.fc_fail === "blank") asm.visible = false;
  await frames(2);
  fillStats();
  FC.gl = glName(ren); html.setAttribute("data-fc-gl", FC.gl);
  if (params.fc_fail === "noready") return;
  FC.ready = true; html.setAttribute("data-fc-ready", "1");
}

const mount = $("mount");
const wait = () => {
  if (!mount.clientWidth || !mount.clientHeight) { setTimeout(wait, 40); return; }
  start().catch((err) => {
    console.error(err);   // the page's error collector records it
    let gl = null; try { gl = S.ren && S.ren.getContext(); } catch (e) { /* no context */ }
    if (!gl) { $("nogl").hidden = false; return; }
    // the libraries loaded and WebGL works, so the build itself failed (a bad parts.js edit, say): say what broke,
    // not "could not load the 3D libraries" (F13). index.html keeps this text if its 10 s check fires later.
    const m = $("noload"); m.textContent = "The 3D view could not start: " + ((err && err.message) || err) + ". The dimension sheet below still works.";
    m.dataset.fcText = "1"; m.hidden = false;
  });
};
wait();
