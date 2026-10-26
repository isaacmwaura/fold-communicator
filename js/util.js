/* Fold Communicator — small helpers shared by every module. */
import { S, Q, GEO } from "./state.js";

export const $ = (id) => document.getElementById(id);
export const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export function rr(g, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- textures: every one is made here, so the page can report texture memory ---------- */
const liveTex = new Set(), targets = new Set();
// o.color: true for colour pictures (map, emissiveMap: sRGB), false for data maps (bump, roughness...: no colour space)
// o.aniso: anisotropic filtering samples. Default by map type (FABLE-REVIEW-1 F2): 8 for colour pictures, where
// printing and labels must stay sharp at a slant; 4 for data maps (relief, roughness), whose blur at a slant shows as
// a slightly softer sheen; 2 for every map at Low. Each step up costs texture reads on every pixel that uses the map.
// Never more than the GPU offers.
const ANISO = { color: 8, data: 4, low: 2 };
export function tex(T, c, o) {
  o = o || {};
  const t = new T.CanvasTexture(c), want = o.aniso || (Q.tier === "low" ? ANISO.low : o.color === false ? ANISO.data : ANISO.color);
  t.anisotropy = Math.min(want, S.ren ? S.ren.capabilities.getMaxAnisotropy() : 8);
  t.colorSpace = o.color === false ? T.NoColorSpace : T.SRGBColorSpace;
  liveTex.add(t); t.addEventListener("dispose", () => liveTex.delete(t));
  return t;
}
// send a texture's picture to the GPU now, if it changed, rather than in the first frame that draws a mesh using it
// (the closed-up phone hides most parts, so that frame would be the first press of Exploded). Not while the WebGL
// context is lost: three.js uploads everything again once it is back.
export function uploadTexture(t) { if (S.ren && !S.glLost) S.ren.initTexture(t); }
// a render target that holds a texture for good (the PMREM environment): counted at 8 bytes a pixel (half float)
export function trackTarget(rt) { targets.add(rt); rt.addEventListener("dispose", () => targets.delete(rt)); return rt; }
// stop counting one without dispose(): after a WebGL context loss its GPU memory is already gone, and dispose() would
// ask the new context to delete objects it never had (a WebGL warning)
export function untrackTarget(rt) { targets.delete(rt); }
// bytes held by live textures made by tex() (w × h × 4, × 4/3 with mipmaps) plus tracked render targets
export function texBytes() {
  let n = 0;
  liveTex.forEach((t) => { const im = t.image; if (im) n += im.width * im.height * 4 * (t.generateMipmaps ? 4 / 3 : 1); });
  targets.forEach((rt) => { n += rt.width * rt.height * 8; });
  return n;
}

// seeded random numbers (mulberry32): procedural textures never use Math.random, so every run draws the same picture
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// copy data into obj.userData and into every descendant mesh's userData (picking reads the mesh that was hit)
export function mark(obj, data) {
  obj.traverse((o) => { if (o === obj || o.isMesh) Object.assign(o.userData, data); });
  return obj;
}

/* ---------- shapes ---------- */
export function rrShape(T, w, h, r) { const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, h / 2, w / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
// leaf outline, x ∈ [0, L]·s ; outer corners R, hinge corners rh ; inset uniformly (hinge side by insH)
export function leafShape(T, s, ins, R, rh, insH) {
  const L = GEO.L, H = GEO.H, x0 = insH === undefined ? ins : insH, x1 = L - ins, y0 = -H / 2 + ins, y1 = H / 2 - ins;
  const ro = Math.max(0.3, R - ins), rq = Math.max(0.02, rh - Math.min(ins, x0)), sh = new T.Shape(), P = (x) => s * x;
  sh.moveTo(P(x0 + rq), y0); sh.lineTo(P(x1 - ro), y0); sh.quadraticCurveTo(P(x1), y0, P(x1), y0 + ro);
  sh.lineTo(P(x1), y1 - ro); sh.quadraticCurveTo(P(x1), y1, P(x1 - ro), y1); sh.lineTo(P(x0 + rq), y1);
  sh.quadraticCurveTo(P(x0), y1, P(x0), y1 - rq); sh.lineTo(P(x0), y0 + rq); sh.quadraticCurveTo(P(x0), y0, P(x0 + rq), y0);
  return sh;
}
// extrusion whose finished footprint = shape grown by bev, z ∈ [0, depth]. curve: segments per rounded corner (and
// per hole edge) in the outline, default 28; one count serves the whole shape, holes included
export function ext(T, shape, depth, bev, segs, curve) {
  const g = new T.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: segs || 4, curveSegments: curve || 28 });
  g.translate(0, 0, bev); return g;
}
/* Segments per rounded corner for an outline whose largest corner radius is r (mm): about 4 per mm, 8 to 28. A 28-step
   corner on a 1 mm screw hole cost as many triangles as a battery (FABLE-REVIEW-1 F2: the light-guide film's 37 key
   holes alone were 34k triangles). At 8 steps a 2 mm corner is off a true arc by 0.02 mm, far below a pixel at the
   closest still, while the big corners (the halves' 9.2 mm, the mid-frames' 7 mm) keep all 28. */
export const curveSegs = (r) => Math.max(8, Math.min(28, Math.round((r || 0) * 4)));
// a hole (a closed Path of lines and rounded corners) as straight lines at n steps per corner: an extrusion takes one
// step count for its outline and all its holes, so a small hole drawn this way keeps its own count (8) inside an
// outline that needs 28
export function polyHole(T, path, n) {
  const p = path.getPoints(n); if (p.length > 1 && p[0].distanceTo(p[p.length - 1]) < 1e-9) p.pop();
  return new T.Path(p);
}
// a Shape's points with each rounded corner at its own step count (curveSegs of its size), straight edges as they are
export function shapePoints(sh) {
  const pts = [];
  sh.curves.forEach((c) => { const q = c.getPoints(c.isLineCurve ? 1 : curveSegs(c.v0.distanceTo(c.v1))); (pts.length ? q.slice(1) : q).forEach((v) => pts.push(v)); });
  return pts;
}
export function flatUV(geo, fn) { const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const q = fn(p.getX(i), p.getY(i)); uv.setXY(i, q[0], q[1]); } uv.needsUpdate = true; return geo; }

// smoothstep
export const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
export const fmt = (v) => (Math.round(v * 100) / 100).toString();
