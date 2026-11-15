/* Fold Communicator — materials, the studio environment, the texture toolkit and the finish switch.
   Model units are millimetres. What each quality tier draws is set in Q (state.js). */
import * as THREE from "three";
import { props, Q, params, fin, emitFinish, invalidate } from "./state.js";
import { cv, tex, rng, uploadTexture } from "./util.js";

/* ---------- the studio the shiny parts reflect (turned into an environment map by buildLook() in scene.js) ----------
   A dark room with a few large softboxes, as a product photographer lights a phone. An earlier room was
   one flat 0.52 grey, so glass and metal had nothing to reflect: the back read as one even tone, the frame burnt out
   and the screens turned milky. Now:
   - the surround is dark: 0.06 at and below the horizon, up to 0.12 overhead, and 0.05 lighter behind the phone. Not
     darker: satin metal mirrors the walls, and at 0.03 the spine read near black at 45° open (the dark-slot check on
     back45). Not lighter: a screen seen from the side mirrors the same walls (at 75° glass reflects a quarter of what
     it sees) and must stay black (the screen-black check on `side`; screens.js keeps its reflection low for this);
   - a white floor sweep, 0.6 under the phone fading to 0.2 at the walls, lights every face that looks down (the
     bottom edge was near black);
   - softboxes: a large key front-left; a tall strip on each side, a little behind the phone (the bright lines on the
     frame's edges from the front, out of the screens' mirror angle); a bank overhead; a narrow sheen strip behind-right
     and a stronger fill behind-left, kept off the spine cover's mirror angle (so the curved cover does not outshine the
     flat rails beside it: the spine-tone check); a fill in front, above the eye line (the face, out of the screens'
     mirror); a low card front-left (the curved cover's middle when part open). Each is brighter in the middle and fades
     at its edges (softboxMap), and adds its light to the room (additive), so its edge never shows as a dark ring;
   - two large dim fill cards low on the left, one toward the camera of `hero` and one
     behind (0.5 each), for the satin metal: at the surround's 0.06 the frame and spine mirrored the dark walls and read
     gunmetal (near #444 on Porcelain, darker than their own antenna bands). They stay clear of the bands the screens
     mirror from the side (about 60° to 95° either side of the front, where the screen-black check on `side` looks), so
     the metal picks them up and the screens do not. The one behind was 0.25 until hinge round 1, which raised it
     with the cover's roughness to meet the spine-tone check. Round 2 put the cover's roughness back (the cover and
     the frame are one metal: REG_DEF below, and that check now says so) and kept this card: with it the frame metal in
     `hero` reads 80 % of its swatch at High, about 3 points more than at 0.25. Most of the metal's lift comes from its roughness, not
     from these cards;
   - the sheen strip replaced a broad 40 × 40 fill there. The broad fill lit the whole back evenly, so the light
     finishes read as paper, and it lifted the dark finishes' median. The strip's edge falls on the back's right third in
     the `back` view: a soft band slides across the glass as the phone turns, and the finish check's median (the back's
     middle) stays off it on every finish. It is only as tall as the back's mirror needs (28): at Low the back has no
     clearcoat, and a taller strip spread over the whole of a dark back through its rough base. The light the light
     finishes lost with the broad fill comes back from a dim fill high behind, far above the back's mirror angle, so it
     lightens them without lifting the dark ones. Porcelain's band stays small (3 to 4 %): its colour sits at the top of
     the tone curve, where every highlight is compressed.
   Brightness is linear, values above 1 are HDR. Tuned so a white card facing the light reads near its own colour: the
   finish check (build/shoot.py) holds the back's and the face's median within 8 % of their swatches. Each setting
   here moves several of those checks at once; change one only with the full check run at all three tiers.
   The rig does not turn with the view (scene.environmentRotation stays 0), so the screens (which hold their own envMap)
   see the same room as everything else, and reflections slide across the phone as it turns. Units: the room's own,
   a sphere of radius 60 round the phone. */
function softboxMap(T) {
  const Z = 64, c = cv(Z, Z), g = c.getContext("2d"), img = g.createImageData(Z, Z), d = img.data;
  const edge = (t) => { const k = Math.min(1, Math.min(t, 1 - t) / 0.24); return k * k * (3 - 2 * k); };
  for (let y = 0; y < Z; y++) for (let x = 0; x < Z; x++) {
    const u = (x + 0.5) / Z, v = (y + 0.5) / Z, w = edge(u) * edge(v) * (0.8 + 0.2 * Math.cos((u - 0.5) * Math.PI) * Math.cos((v - 0.5) * Math.PI)), i = (y * Z + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = Math.round(255 * w); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new T.CanvasTexture(c);   // linear data (no colour space): the panel's colour sets its brightness
}
function floorMap(T) {
  const Z = 64, c = cv(Z, Z), g = c.getContext("2d"), rg = g.createRadialGradient(Z / 2, Z / 2, 0, Z / 2, Z / 2, Z / 2);
  rg.addColorStop(0, "rgb(255,255,255)"); rg.addColorStop(0.45, "rgb(215,215,215)"); rg.addColorStop(1, "rgb(85,85,85)");
  g.fillStyle = "rgb(85,85,85)"; g.fillRect(0, 0, Z, Z); g.fillStyle = rg; g.fillRect(0, 0, Z, Z);
  return new T.CanvasTexture(c);
}
export function studio(T) {
  const s = new T.Scene(), sb = softboxMap(T);
  const sg = new T.SphereGeometry(60, 32, 16), sp = sg.attributes.position, col = [];
  for (let i = 0; i < sp.count; i++) {
    const e = sp.getY(i) / 60, b = Math.min(1, Math.max(0, -sp.getZ(i) / 30));
    const v = (e > 0 ? 0.06 + 0.06 * Math.pow(e, 0.8) : 0.06) + 0.05 * b * b * (3 - 2 * b); col.push(v, v, v); }
  sg.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  s.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
  const fl = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshBasicMaterial({ color: new T.Color(0.6, 0.6, 0.6), map: floorMap(T) }));
  fl.rotation.x = -Math.PI / 2; fl.position.y = -22; s.add(fl);
  const box = (w, h, x, y, z, v) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(v, v, v), map: sb,
    side: T.DoubleSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  box(40, 30, -30, 22, 34, 9);       // key, front-left and above
  box(16, 50, -48, 4, -12, 4);       // tall strip, left, a little behind
  box(16, 50, 48, 4, -12, 4);        // tall strip, right, a little behind
  box(56, 36, 0, 50, 4, 4);          // bank overhead
  box(10, 28, 19.4, -4.7, -50.4, 7); // sheen strip, behind-right, 159° round (the back glass's band in the `back` view)
  box(40, 40, -50, 24, -16, 4);      // fill behind-left (light on the back, outside its mirror angle there)
  box(60, 24, 0, 20, 48, 5);         // fill front, above the eye line (light on the face, out of the screens' mirror)
  box(30, 16, -36, -4, 36, 1.5);     // card front-left, low (the spine cover part open)
  box(40, 24, -34.8, -4.5, 38.6, 0.5); // fill card, camera-left and low (the spine and frame in `hero` and `stand`)
  box(64, 30, -33, -2, -40, 0.5);    // fill card, behind-left and low (the frame and spine in the back views)
  box(50, 30, 8, 38, -38, 2);        // fill high behind (light on the back glass, 50° over its mirror angle in the back views)
  return s;
}

/* ---------- texture painting ----------
   Every recipe is a generator that paints its canvases in small steps. The first step (the base fill) runs at once, so
   a texture is never uploaded as garbage. With ?shot=1 the rest runs at once too; otherwise it runs in setTimeout(0)
   chunks of at most 8 ms, then the textures are re-uploaded and a frame is requested. */
const jobs = [], waiters = [], VARIANTS = new WeakMap();
let pumping = false;
// a finished picture goes to the GPU at once (uploadTexture), also when no part using it is drawn yet: the closed-up
// phone hides the parts inside, and their first frame (the press of Exploded) must not stall on uploads. Variants
// share the picture, so one upload serves them all.
function flag(texs) {
  texs.forEach((t) => { t.needsUpdate = true; (VARIANTS.get(t) || []).forEach((v) => { v.needsUpdate = true; }); });
  texs.forEach((t) => { uploadTexture(t); (VARIANTS.get(t) || []).forEach(uploadTexture); });
  invalidate();
}
function paint(it, texs) {
  let r = it.next();
  if (params.shot) { while (!r.done) r = it.next(); flag(texs); return; }
  if (r.done) { flag(texs); return; }
  jobs.push({ it, texs });
  if (!pumping) { pumping = true; setTimeout(pump, 0); }
}
function pump() {
  const t0 = performance.now();
  while (jobs.length && performance.now() - t0 < 8) { const j = jobs[0]; if (j.it.next().done) { jobs.shift(); flag(j.texs); } }
  if (jobs.length) { setTimeout(pump, 0); return; }
  pumping = false; waiters.splice(0).forEach((f) => f());
}
// resolves when every queued texture has been drawn
export const painted = () => (jobs.length ? new Promise((res) => waiters.push(res)) : Promise.resolve());

// a copy of a texture with its own repeat, offset or rotation. It shares the picture (and the GPU copy, and the texture
// memory count) with the original, and is re-uploaded with it. o: { repeat: [u, v], offset: [u, v], rotation }
export function variant(t, o) {
  o = o || {};
  const v = t.clone();
  if (o.repeat) v.repeat.set(o.repeat[0], o.repeat[1]);
  if (o.offset) v.offset.set(o.offset[0], o.offset[1]);
  if (o.rotation) v.rotation = o.rotation;
  if (!VARIANTS.has(t)) VARIANTS.set(t, []);
  VARIANTS.get(t).push(v); v.needsUpdate = true;
  return v;
}

const grey = (v) => { v = Math.max(0, Math.min(255, Math.round(v))); return "rgb(" + v + "," + v + "," + v + ")"; };
const tiledTex = (c, colour) => { const t = tex(THREE, c, { color: colour }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const dataTex = (c) => tex(THREE, c, { color: false });

// tileable value noise, added into out (W × H floats): cells across, amplitude amp
function* noiseInto(out, W, H, cells, amp, rnd) {
  const nx = Math.max(1, Math.round(cells)), ny = Math.max(1, Math.round(cells * H / W)), g = new Float32Array(nx * ny);
  for (let i = 0; i < g.length; i++) g[i] = rnd() * 2 - 1;
  const s = (k) => k * k * (3 - 2 * k);
  for (let y = 0; y < H; y++) {
    const fy = y / H * ny, y0 = Math.floor(fy), ty = s(fy - y0), r0 = (y0 % ny) * nx, r1 = ((y0 + 1) % ny) * nx;
    for (let x = 0; x < W; x++) {
      const fx = x / W * nx, x0 = Math.floor(fx), tx = s(fx - x0), a = x0 % nx, b = (x0 + 1) % nx;
      const top = g[r0 + a] + (g[r0 + b] - g[r0 + a]) * tx, bot = g[r1 + a] + (g[r1 + b] - g[r1 + a]) * tx;
      out[y * W + x] += amp * (top + (bot - top) * ty);
    }
    if ((y & 63) === 63) yield;
  }
}
// write a height field (0 = mid grey) into a canvas as grey levels
function* putGrey(c, h, base, scale) {
  const W = c.width, H = c.height, g = c.getContext("2d"), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0, i = y * W, p = i * 4; x < W; x++, i++, p += 4) { const v = base + h[i] * scale; d[p] = d[p + 1] = d[p + 2] = v < 0 ? 0 : v > 255 ? 255 : v; d[p + 3] = 255; }
    if ((y & 127) === 127) yield;
  }
  g.putImageData(img, 0, 0);
}

/* ---------- height picture → normal map ----------
   OpenGL convention (+y = +v), which three.js expects with normalScale (1, 1): canvas rows run down and are flipped on
   upload, so +v is −row, and the green channel is +d(height)/d(row). Checked by eye at a low light angle. */
function* normalGen(src, out, strength) {
  const w = src.width, h = src.height, s = src.getContext("2d").getImageData(0, 0, w, h).data;
  const g = out.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  const H = (x, y) => s[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    if ((y & 31) === 31) yield;
  }
  g.putImageData(img, 0, 0);
}

/* ---------- tiled detail maps ----------
   Tiled maps assume the house UVs: millimetres, as ExtrudeGeometry (util.ext) makes them. Each texture's repeat is
   1 / tile size in mm, kept in userData.tileMm; a mesh with 0..1 UVs makes a variant() with its own repeat. */

// brushed metal streaks along U: rough (multiplies the material roughness; mean BRUSH_MEAN) and bump.
// One shared set per tier and seed.
export const BRUSH_MEAN = 0.85;
const brushCache = {};
export function brushed(opts) {
  opts = opts || {};
  const Z = opts.size || Q.tex.brushed, seed = opts.seed || 11, key = Z + ":" + seed;
  if (brushCache[key]) return brushCache[key];
  const cr = cv(Z, Z), cb = cv(Z, Z), rough = tiledTex(cr, false), bump = tiledTex(cb, false), tileMm = 40;
  [rough, bump].forEach((t) => { t.repeat.set(1 / tileMm, 1 / tileMm); t.userData.tileMm = tileMm; });
  paint((function* () {
    const gr = cr.getContext("2d"), gb = cb.getContext("2d"), rnd = rng(seed), m = BRUSH_MEAN * 255;
    gr.fillStyle = grey(m); gr.fillRect(0, 0, Z, Z); gb.fillStyle = grey(128); gb.fillRect(0, 0, Z, Z);
    yield;
    const line = (g, x, y, len, w) => { g.fillRect(x, y, len, w); if (x + len > Z) g.fillRect(x - Z, y, len, w); };
    for (let i = 0, n = Z * 6; i < n; i++) {
      const y = rnd() * Z, x = rnd() * Z, len = Z * (0.08 + rnd() * 0.5), w = (0.5 + rnd() * 1.2) * Z / 1024 + 0.4, dv = (rnd() * 2 - 1) * 35, a = 0.08 + rnd() * 0.25;
      gr.globalAlpha = a; gr.fillStyle = grey(m + dv * 1.6); line(gr, x, y, len, w);
      gb.globalAlpha = a; gb.fillStyle = grey(128 + dv); line(gb, x, y, len, w);
      if ((i & 511) === 511) yield;
    }
    gr.globalAlpha = gb.globalAlpha = 1;
  })(), [rough, bump]);
  const set = { rough, bump, normal: null, tileMm };
  // High: the hinge steel gets a real normal map made from the bump picture (Q.relief)
  if (Q.relief === "normal") {
    const cn = cv(Z, Z); set.normal = tiledTex(cn, false); set.normal.repeat.copy(bump.repeat); set.normal.userData.tileMm = tileMm;
    paint((function* () { const g = cn.getContext("2d"); g.fillStyle = "rgb(128,128,255)"; g.fillRect(0, 0, Z, Z); yield; yield* normalGen(cb, cn, 3); })(), [set.normal]);
  }
  return (brushCache[key] = set);
}

// fine grain (frosted glass, foam, graphite): a bump map. opts: { size, seed, tileMm, blobMm, amp }
export function grain(opts) {
  opts = opts || {};
  const Z = opts.size || Q.tex.tiled[1], tileMm = opts.tileMm || 20, c = cv(Z, Z), t = tiledTex(c, false);
  t.repeat.set(1 / tileMm, 1 / tileMm); t.userData.tileMm = tileMm;
  paint((function* () {
    const g = c.getContext("2d"); g.fillStyle = grey(128); g.fillRect(0, 0, Z, Z); yield;
    const h = new Float32Array(Z * Z), rnd = rng(opts.seed || 21), cells = Math.min(Z / 2, opts.blobMm ? tileMm / opts.blobMm : Z / 3);
    yield* noiseInto(h, Z, Z, cells, 1, rnd); yield* noiseInto(h, Z, Z, cells / 3, 0.5, rnd);
    yield* putGrey(c, h, 128, (opts.amp || 1) * 70);
  })(), [t]);
  return t;
}

// fine isotropic grain as a normal map: the satin, bead-blasted metal of the frame and the spine cover (the brushed
// streak map stretched into stair-steps at the frame's corners, and real 2026 frames are blasted, not brushed). The height picture is painted on a canvas that is never uploaded; only the normal map is. One shared map
// per tier, 256² at Low (Q.tex.tiled[1]). opts: { tileMm, blobMm, seed }
const grainNCache = {};
export function grainNormal(opts) {
  opts = opts || {};
  const Z = Q.tex.tiled[1], tileMm = opts.tileMm || 4, seed = opts.seed || 61, key = Z + ":" + tileMm + ":" + seed;
  if (grainNCache[key]) return grainNCache[key];
  const ch = cv(Z, Z), cn = cv(Z, Z), t = tiledTex(cn, false);
  t.repeat.set(1 / tileMm, 1 / tileMm); t.userData.tileMm = tileMm;
  paint((function* () {
    const g = cn.getContext("2d"); g.fillStyle = "rgb(128,128,255)"; g.fillRect(0, 0, Z, Z); yield;
    const h = new Float32Array(Z * Z), rnd = rng(seed), cells = Math.min(Z / 2, tileMm / (opts.blobMm || 0.06));
    yield* noiseInto(h, Z, Z, cells, 1, rnd); yield* noiseInto(h, Z, Z, cells / 2.5, 0.45, rnd);
    yield* putGrey(ch, h, 128, 60);
    yield* normalGen(ch, cn, 2);
  })(), [t]);
  return (grainNCache[key] = t);
}

// dot lattice (vapour-chamber wick pillars): a bump map. opts: { pitchMm, size, seed }
export function dots(opts) {
  opts = opts || {};
  const pitch = opts.pitchMm || 1, n = Math.max(2, Math.round(8 / pitch)), tileMm = n * pitch, Z = opts.size || Q.tex.tiled[1];
  const c = cv(Z, Z), t = tiledTex(c, false); t.repeat.set(1 / tileMm, 1 / tileMm); t.userData.tileMm = tileMm;
  paint((function* () {
    const g = c.getContext("2d"), p = Z / n, r = p * 0.28; g.fillStyle = grey(110); g.fillRect(0, 0, Z, Z); yield;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i + 0.5) * p, y = (j + 0.5) * p, rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, grey(200)); rg.addColorStop(0.7, grey(170)); rg.addColorStop(1, grey(110));
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  })(), [t]);
  return t;
}

// flex-cable traces along U, seen through amber polyimide: a colour map (the material colour stays white). Real
// polyimide is a darker amber than a flat orange (about #d98b2b to #c99a5a; seen against the board it reads darker),
// and the copper shows only faintly through it: bundles of fine lines with plain film between them, not even stripes.
// Same size as before at every tier, so no texture memory is added. opts: { pitchMm, size }
export function traces(opts) {
  opts = opts || {};
  const pitch = opts.pitchMm || 0.3, tileMm = 8, Z = opts.size || Q.tex.tiled[1], c = cv(Z, Z), t = tiledTex(c, true);
  t.repeat.set(1 / tileMm, 1 / tileMm); t.userData.tileMm = tileMm;
  paint((function* () {
    const g = c.getContext("2d"), ppm = Z / tileMm; g.fillStyle = "#b8721f"; g.fillRect(0, 0, Z, Z); yield;
    // three bundles across the 8 mm tile (v), each a few 0.12 mm copper lines at the pitch, a ground strip beside one
    [[0.6, 7], [3.4, 5], [5.9, 4]].forEach(([v0, n]) => {
      g.fillStyle = "rgba(214,150,80,0.55)"; for (let i = 0; i < n; i++) g.fillRect(0, (v0 + i * pitch) * ppm, Z, Math.max(1, 0.12 * ppm));
    });
    g.fillStyle = "rgba(205,140,70,0.35)"; g.fillRect(0, 7.3 * ppm, Z, 0.45 * ppm);
  })(), [t]);
  return t;
}

/* ---------- part map sets (internals.js passes them to matWith) ----------
   Coordinates are mm on the part, from its lower-left corner (x right, y up); the picture spans the whole w × h, so
   u = x / wMm and v = y / hMm. placeMm() fits a set onto a mesh with millimetre UVs. Each set returns colour (map,
   sRGB), ORM (ambient occlusion, roughness, metalness in R, G, B; no colour space) and bump; at High also normal
   where the part has fine relief (cans, cells). Roughness and metalness in ORM are absolute: matWith sets the
   material's own values to 1. */
function sheet(wMm, hMm, Z) { const ppm = Z / Math.max(wMm, hMm); return { W: Math.max(8, Math.round(wMm * ppm)), H: Math.max(8, Math.round(hMm * ppm)), ppm }; }
function canvases(W, H) { return { col: cv(W, H), orm: cv(W, H), hgt: cv(W, H) }; }
function mapSet(cs) {
  const set = { map: tex(THREE, cs.col, { color: true }), orm: dataTex(cs.orm), bump: dataTex(cs.hgt) };
  set.orm.channel = 0;   // aoMap reads the first UV set
  return set;
}
const ORM = (ao, rough, metal) => "rgb(" + Math.round(ao * 255) + "," + Math.round(rough * 255) + "," + Math.round(metal * 255) + ")";
// fit a map set onto a mesh whose UVs are millimetres: (x0, y0) = the mm position of the set's lower-left corner.
// Returns a new set of variants (the originals stay as they are, so a shared map can sit on several parts).
export function placeMm(set, x0, y0) {
  const w = set.wMm, h = set.hMm, out = { wMm: w, hMm: h };
  Object.keys(set).forEach((k) => { const t = set[k]; if (t && t.isTexture) out[k] = variant(t, { repeat: [1 / w, 1 / h], offset: [-x0 / w, -y0 / h] }); });
  return out;
}
const stamp = (set, wMm, hMm) => Object.assign(set, { wMm, hMm });
const SILK = "rgba(235,238,236,0.72)";
const mono = (px) => "500 " + Math.max(4, px).toFixed(1) + "px monospace";

// circuit board: solder mask, faint copper traces under it, tented vias, gold test points and fiducials, silkscreen
// boxes and reference designators, and baked shade round the keep-outs (where chips and cans sit; left plain).
// opts: { wMm, hMm, outline: [[x, y], ...] (mm, optional), keepOut: [{ x, y, w, h }] (mm, lower-left), seed,
//         set: "boardUp" | "boardLo" (texture size row), mask: hex }
export function pcbMaps(opts) {
  const { wMm, hMm } = opts, { W, H, ppm } = sheet(wMm, hMm, Q.tex[opts.set || "boardUp"]), cs = canvases(W, H);
  const set = stamp(mapSet(cs), wMm, hMm);
  const keep = (opts.keepOut || []).map((k) => ({ x: k.x * ppm, y: (hMm - k.y - k.h) * ppm, w: k.w * ppm, h: k.h * ppm }));
  const P = (x, y) => [x * ppm, (hMm - y) * ppm];
  paint((function* () {
    const c = cs.col.getContext("2d"), o = cs.orm.getContext("2d"), h = cs.hgt.getContext("2d"), rnd = rng(opts.seed || 31);
    c.fillStyle = opts.mask || "#235c7a"; c.fillRect(0, 0, W, H);
    o.fillStyle = ORM(1, 0.55, 0); o.fillRect(0, 0, W, H);
    h.fillStyle = grey(100); h.fillRect(0, 0, W, H);
    yield;
    const inKeep = (x, y, m) => keep.some((k) => x > k.x - m && x < k.x + k.w + m && y > k.y - m && y < k.y + k.h + m);
    // copper traces: Manhattan routes with 45° corners, faint under the lacquer, slightly raised
    const n = Math.round(wMm * hMm / 9), dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
    c.lineCap = h.lineCap = "round"; c.lineJoin = h.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      let x = rnd() * W, y = rnd() * H, d = Math.floor(rnd() * 4); if (inKeep(x, y, ppm * 0.6)) continue;
      const lw = (0.08 + rnd() * 0.1) * ppm, pts = [[x, y]];
      for (let s = 0, segs = 2 + Math.floor(rnd() * 5); s < segs; s++) {
        const L = (1.5 + rnd() * 8) * ppm, nx = x + dirs[d][0] * L, ny = y + dirs[d][1] * L;
        if (nx < 0 || ny < 0 || nx > W || ny > H || inKeep(nx, ny, ppm * 0.4)) break;
        x = nx; y = ny; pts.push([x, y]);
        d = d < 4 ? (rnd() < 0.5 ? 4 + Math.floor(rnd() * 4) : Math.floor(rnd() * 4)) : Math.floor(rnd() * 4);
      }
      if (pts.length < 2) continue;
      const path = (g) => { g.beginPath(); pts.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); };
      c.strokeStyle = "rgba(150,205,230," + (0.15 + rnd() * 0.1).toFixed(3) + ")"; c.lineWidth = lw; path(c); c.stroke();
      h.strokeStyle = grey(125); h.lineWidth = lw; path(h); h.stroke();
      // a tented via at the end of most routes
      if (rnd() < 0.7) { const q = pts[pts.length - 1], r = 0.17 * ppm;
        c.fillStyle = "rgba(170,215,235,0.35)"; c.beginPath(); c.arc(q[0], q[1], r, 0, 7); c.fill();
        c.fillStyle = "rgba(10,25,35,0.5)"; c.beginPath(); c.arc(q[0], q[1], r * 0.45, 0, 7); c.fill();
        h.fillStyle = grey(135); h.beginPath(); h.arc(q[0], q[1], r, 0, 7); h.fill(); }
      if ((i & 63) === 63) yield;
    }
    yield;
    // baked shade round the keep-outs (contact darkness where cans and chips meet the board), then silkscreen
    keep.forEach((k, i) => {
      const m = 0.9 * ppm;
      for (let s = 3; s >= 1; s--) { o.fillStyle = ORM(1 - 0.12 * (4 - s), 0.55, 0); const e = m * s / 3; o.fillRect(k.x - e, k.y - e, k.w + 2 * e, k.h + 2 * e); }
      o.fillStyle = ORM(0.55, 0.55, 0); o.fillRect(k.x, k.y, k.w, k.h);
      c.strokeStyle = SILK; c.lineWidth = Math.max(1, 0.12 * ppm); const g = 0.45 * ppm; c.strokeRect(k.x - g, k.y - g, k.w + 2 * g, k.h + 2 * g);
      h.strokeStyle = grey(118); h.lineWidth = c.lineWidth; h.strokeRect(k.x - g, k.y - g, k.w + 2 * g, k.h + 2 * g);
      c.fillStyle = SILK; c.font = mono(0.9 * ppm); c.textBaseline = "bottom";
      c.fillText(["U", "C", "R", "L", "J"][i % 5] + (101 + Math.floor(rnd() * 800)), k.x - g, k.y - g - 0.15 * ppm);
    });
    // loose reference designators and passive outlines in open areas
    c.font = mono(0.8 * ppm);
    for (let i = 0, nl = Math.round(wMm * hMm / 60); i < nl; i++) {
      const x = rnd() * W, y = rnd() * H; if (inKeep(x, y, ppm)) continue;
      c.fillStyle = SILK; c.fillText(["C", "R", "L", "TP", "FL"][Math.floor(rnd() * 5)] + (100 + Math.floor(rnd() * 900)), x, y);
    }
    yield;
    // gold test points (bare metal) and fiducials (gold disc in a mask-free ring)
    const gold = (x, y, r) => { c.fillStyle = "#e8c66e"; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      o.fillStyle = ORM(1, 0.28, 1); o.beginPath(); o.arc(x, y, r, 0, 7); o.fill();
      h.fillStyle = grey(140); h.beginPath(); h.arc(x, y, r, 0, 7); h.fill(); };
    for (let i = 0, nt = 4 + Math.round(wMm * hMm / 250); i < nt; i++) { const x = rnd() * W, y = rnd() * H; if (!inKeep(x, y, ppm * 0.8)) gold(x, y, 0.4 * ppm); }
    [[1.6, 1.6], [wMm - 1.6, hMm - 1.6], [wMm - 1.6, 1.6]].forEach((q) => { const [x, y] = P(q[0], q[1]);
      if (inKeep(x, y, ppm)) return; c.fillStyle = "#1b3340"; c.beginPath(); c.arc(x, y, 0.75 * ppm, 0, 7); c.fill(); gold(x, y, 0.4 * ppm); });
    // plated edge along the outline (or the sheet edge)
    const ol = opts.outline && opts.outline.length > 2 ? opts.outline.map((q) => P(q[0], q[1])) : [[0, 0], [W, 0], [W, H], [0, H]];
    const edge = (g, style, lw) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); ol.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.stroke(); };
    edge(c, "#b08d3c", 0.5 * ppm); edge(o, ORM(1, 0.35, 1), 0.5 * ppm);
  })(), [set.map, set.orm, set.bump]);
  return set;
}

// shield-can lid: brushed-metal colour with faint specks, inset border, centre press-dimple, one or two yellow
// 3 × 3 mm marker squares, a stamped code and fine scratches. opts: { wMm, hMm, code, seed }
export function canMaps(opts) {
  const { wMm, hMm } = opts, { W, H, ppm } = sheet(wMm, hMm, Q.tex.can), cs = canvases(W, H), set = stamp(mapSet(cs), wMm, hMm);
  if (Q.relief === "normal") set.normal = dataTex(cv(W, H));
  paint((function* () {
    const c = cs.col.getContext("2d"), o = cs.orm.getContext("2d"), h = cs.hgt.getContext("2d"), rnd = rng(opts.seed || 41);
    c.fillStyle = "#a8b0b7"; c.fillRect(0, 0, W, H); o.fillStyle = ORM(1, 0.38, 1); o.fillRect(0, 0, W, H); h.fillStyle = grey(128); h.fillRect(0, 0, W, H);
    yield;
    for (let i = 0, n = Math.round(W * H / 40); i < n; i++) { c.fillStyle = "rgba(220,226,232," + (rnd() * 0.25).toFixed(3) + ")"; c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1); }
    // inset border: a pressed groove 0.6 mm inside the edge
    const b = 0.6 * ppm, lw = Math.max(1.5, 0.25 * ppm);
    h.strokeStyle = grey(70); h.lineWidth = lw; h.strokeRect(b, b, W - 2 * b, H - 2 * b);
    o.strokeStyle = ORM(0.8, 0.45, 1); o.lineWidth = lw; o.strokeRect(b, b, W - 2 * b, H - 2 * b);
    c.strokeStyle = "rgba(60,66,72,0.25)"; c.lineWidth = lw; c.strokeRect(b, b, W - 2 * b, H - 2 * b);
    // centre press-dimple
    const r = Math.min(W, H) * 0.12, rg = h.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
    rg.addColorStop(0, grey(80)); rg.addColorStop(1, grey(128)); h.fillStyle = rg; h.beginPath(); h.arc(W / 2, H / 2, r, 0, 7); h.fill();
    // fine scratches
    for (let i = 0, n = 6 + Math.round(wMm * hMm / 20); i < n; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, L = (1 + rnd() * 4) * ppm, x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      h.strokeStyle = grey(110); h.lineWidth = 1; h.beginPath(); h.moveTo(x, y); h.lineTo(x2, y2); h.stroke();
      o.strokeStyle = ORM(1, 0.55, 1); o.lineWidth = 1; o.beginPath(); o.moveTo(x, y); o.lineTo(x2, y2); o.stroke();
    }
    yield;
    // stamped code (dark laser mark, alpha 0.5), slightly raised in the bump
    const code = opts.code || ("S" + (100 + Math.floor(rnd() * 900))), fs = Math.min(1.4 * ppm, W / (code.length * 0.75));
    c.font = mono(fs); c.textBaseline = "middle"; c.fillStyle = "rgba(40,44,50,0.5)"; const tx = W * 0.14, ty = H * 0.22; c.fillText(code, tx, ty);
    h.font = c.font; h.textBaseline = "middle"; h.fillStyle = grey(150); h.fillText(code, tx, ty);
    // yellow marker squares (Kapton or thermal-pad marks): not metal
    for (let i = 0, n = 1 + (rnd() < 0.5 ? 1 : 0); i < n; i++) {
      const s = 3 * ppm; if (W < s * 2 || H < s * 2) break;
      const x = b * 2 + rnd() * (W - s - b * 4), y = H * 0.5 + rnd() * (H * 0.5 - s - b * 2);
      c.fillStyle = "#c9b53a"; c.fillRect(x, y, s, s); o.fillStyle = ORM(1, 0.5, 0); o.fillRect(x, y, s, s); h.fillStyle = grey(145); h.fillRect(x, y, s, s);
    }
    if (set.normal) { yield; yield* normalGen(cs.hgt, set.normal.image, 2.5); }
  })(), set.normal ? [set.map, set.orm, set.bump, set.normal] : [set.map, set.orm, set.bump]);
  return set;
}

// pouch cell: foil at the edges, a black printed label over most of the face (brand word, spec lines, QR-like code,
// barcode, icons), crumples and wrinkles across the sealed long edges, flat under the label. One label map per cell;
// the ORM and bump (and normal at High) are shared by every cell, laid out in fractions of the cell so they fit both.
// opts: { wMm, hMm, label: { brand, model, lines: [], mAh, wh } or a string (model), seed }
const pouchShared = {};
export function pouchMaps(opts) {
  const { wMm, hMm } = opts, { W, H, ppm } = sheet(wMm, hMm, Q.tex.pouch), lb = typeof opts.label === "string" ? { model: opts.label } : (opts.label || {});
  const L = { x: 0.04 * W, y: 0.05 * H, w: 0.92 * W, h: 0.9 * H };   // label rectangle (fractions of the cell)
  const col = cv(W, H), map = tex(THREE, col, { color: true });
  paint((function* () {
    const c = col.getContext("2d"), rnd = rng(opts.seed || 51);
    const fg = c.createLinearGradient(0, 0, 0, H); fg.addColorStop(0, "#c4c8cc"); fg.addColorStop(1, "#a9aeb4"); c.fillStyle = fg; c.fillRect(0, 0, W, H);
    c.fillStyle = "#2c2f33"; c.fillRect(L.x, L.y, L.w, L.h);
    yield;
    const u = Math.min(L.w, L.h) / 40, x0 = L.x + 3 * u, room = L.w - 6 * u;   // a layout unit, so text scales with the cell
    const fit = (font, px, s) => { c.font = font(px); const w = c.measureText(s).width; if (w > room) c.font = font(px * room / w); };
    c.fillStyle = "#e9eaec"; c.textBaseline = "top";
    const brand = lb.brand || "Li-ion Polymer"; fit((px) => "600 " + px.toFixed(1) + "px sans-serif", 4.2 * u, brand); c.fillText(brand, x0, L.y + 3 * u);
    const lines = lb.lines || [
      "Model " + (lb.model || "FC-B" + (10 + Math.floor(rnd() * 89))),
      "Rated " + (lb.mAh ? Math.round(lb.mAh) + " mAh" : "—") + (lb.wh ? "  " + lb.wh.toFixed(1) + " Wh" : ""),
      "Nominal 3.89 V  Limit 4.48 V",
      "Li-ion polymer cell",
      "Do not puncture or heat",
      "Lot " + (200000 + Math.floor(rnd() * 700000)) + "  2026-" + (10 + Math.floor(rnd() * 3))];
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
    fit(mono, 1.9 * u, longest); lines.forEach((s, i) => c.fillText(s, x0, L.y + 9.5 * u + i * 2.9 * u));
    yield;
    // bottom row: barcode on the left, icons above it, QR-like code (21 × 21 cells, three finder squares) on the right
    const q = Math.min(0.75 * u, room * 0.42 / 21), qx = L.x + L.w - 3 * u - 21 * q, qy = L.y + L.h - 3 * u - 21 * q;
    c.fillStyle = "#e9eaec"; c.fillRect(qx - q, qy - q, 23 * q, 23 * q); c.fillStyle = "#2c2f33";
    for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) if (rnd() < 0.5) c.fillRect(qx + i * q, qy + j * q, q, q);
    [[0, 0], [14, 0], [0, 14]].forEach((f) => { c.fillStyle = "#2c2f33"; c.fillRect(qx + f[0] * q, qy + f[1] * q, 7 * q, 7 * q);
      c.fillStyle = "#e9eaec"; c.fillRect(qx + (f[0] + 1) * q, qy + (f[1] + 1) * q, 5 * q, 5 * q);
      c.fillStyle = "#2c2f33"; c.fillRect(qx + (f[0] + 2) * q, qy + (f[1] + 2) * q, 3 * q, 3 * q); });
    const bEnd = Math.min(x0 + 18 * u, qx - 3 * u), bh = 4.5 * u, by = L.y + L.h - 3 * u - bh;
    let bx = x0; c.fillStyle = "#e9eaec";
    while (bx < bEnd) { const bw = (0.25 + rnd() * 0.75) * u * 0.6; if (rnd() < 0.6) c.fillRect(bx, by, Math.min(bw, bEnd - bx), bh); bx += bw + 0.3 * u * rnd() + 0.15 * u; }
    // icons: crossed-out bin, recycling triangle, "Li-ion"
    c.strokeStyle = "#e9eaec"; c.lineWidth = Math.max(1, 0.35 * u); const ix = x0 + 0.6 * u, iy = by - 7.5 * u;
    c.strokeRect(ix, iy + 0.8 * u, 3 * u, 3.6 * u); c.beginPath(); c.moveTo(ix - 0.5 * u, iy + 0.8 * u); c.lineTo(ix + 3.5 * u, iy + 0.8 * u);
    c.moveTo(ix - 0.6 * u, iy); c.lineTo(ix + 3.6 * u, iy + 5 * u); c.moveTo(ix + 3.6 * u, iy); c.lineTo(ix - 0.6 * u, iy + 5 * u); c.stroke();
    c.beginPath(); c.moveTo(ix + 6 * u, iy + 4.6 * u); c.lineTo(ix + 8 * u, iy + 0.6 * u); c.lineTo(ix + 10 * u, iy + 4.6 * u); c.closePath(); c.stroke();
    c.font = "600 " + (2.2 * u).toFixed(1) + "px sans-serif"; c.fillStyle = "#e9eaec"; c.fillText("Li-ion", ix + 11.5 * u, iy + 1.4 * u);
  })(), [map]);
  // the shared relief and ORM, made once
  const key = "pouch";
  if (!pouchShared[key]) {
    const Zw = W, Zh = H, cs = { orm: cv(Zw, Zh), hgt: cv(Zw, Zh) }, sh = { orm: dataTex(cs.orm), bump: dataTex(cs.hgt), normal: null };
    sh.orm.channel = 0;
    if (Q.relief === "normal") sh.normal = dataTex(cv(Zw, Zh));
    paint((function* () {
      const o = cs.orm.getContext("2d"), rnd = rng(opts.seed || 52);
      o.fillStyle = ORM(1, 0.5, 0.85); o.fillRect(0, 0, Zw, Zh); o.fillStyle = ORM(1, 0.6, 0); o.fillRect(L.x, L.y, L.w, L.h);
      const g = cs.hgt.getContext("2d"); g.fillStyle = grey(128); g.fillRect(0, 0, Zw, Zh);
      yield;
      const hgt = new Float32Array(Zw * Zh);
      yield* noiseInto(hgt, Zw, Zh, 9, 0.5, rnd); yield* noiseInto(hgt, Zw, Zh, 26, 0.3, rnd);
      // wrinkles: ridges running across the two sealed long edges, strongest at the edge, fading inward
      // (a second noise field bends and breaks the ridges up, so they read as crimps, not a comb)
      const ridges = 55 + Math.floor(rnd() * 25), wn = new Float32Array(Zw * Zh);
      yield* noiseInto(wn, Zw, Zh, 7, 1, rnd);
      for (let y = 0; y < Zh; y++) {
        const fy = y / Zh;
        for (let x = 0; x < Zw; x++) {
          const i = y * Zw + x, fx = x / Zw, e = Math.min(fx, 1 - fx), k = Math.max(0, 1 - e / (0.06 + 0.04 * (wn[i] + 1))), n = wn[i];
          const inLabel = x > L.x + 2 && x < L.x + L.w - 2 && y > L.y + 2 && y < L.y + L.h - 2;
          hgt[i] = hgt[i] * (inLabel ? 0.15 : 1) + k * k * Math.sin(fy * ridges * 6.283 + n * 5) * (0.5 + 0.4 * n);
        }
        if ((y & 63) === 63) yield;
      }
      yield* putGrey(cs.hgt, hgt, 128, 60);
      if (sh.normal) { yield; yield* normalGen(cs.hgt, sh.normal.image, 3); }
    })(), sh.normal ? [sh.orm, sh.bump, sh.normal] : [sh.orm, sh.bump]);
    pouchShared[key] = sh;
  }
  const sh = pouchShared[key];
  const set = { map, orm: sh.orm, bump: sh.bump }; if (sh.normal) set.normal = sh.normal;
  return stamp(set, wMm, hMm);
}

/* ---------- other textures ---------- */
function lensTex(T) {
  const Z = 256, c = cv(Z, Z), g = c.getContext("2d"), m = Z / 2;
  const rg = g.createRadialGradient(m, m, 0, m, m, m);
  [[0, "#0b0f18"], [.3, "#141c2e"], [.46, "#06070a"], [.7, "#121418"], [.78, "#050607"], [.92, "#1e2024"], [1, "#2e3034"]].forEach((s) => rg.addColorStop(s[0], s[1]));
  g.fillStyle = rg; g.fillRect(0, 0, Z, Z);
  g.fillStyle = "rgba(130,100,220,0.22)"; g.beginPath(); g.ellipse(m - 22, m - 26, 22, 12, -0.6, 0, 7); g.fill();
  g.fillStyle = "rgba(90,200,170,0.12)"; g.beginPath(); g.ellipse(m + 24, m + 20, 14, 8, -0.6, 0, 7); g.fill();
  return tex(T, c);
}
// the flash: a ringed Fresnel lens over a small yellow LED, for a disc with 0..1 UVs (CircleGeometry)
function flashTex(T) {
  const Z = 64, c = cv(Z, Z), g = c.getContext("2d"), m = Z / 2;
  g.fillStyle = "#e6e1d2"; g.fillRect(0, 0, Z, Z);
  for (let r = m; r > 6; r -= 2.6) { g.strokeStyle = r % 5.2 < 2.6 ? "rgba(255,255,250,0.55)" : "rgba(150,145,130,0.35)"; g.lineWidth = 1.2; g.beginPath(); g.arc(m, m, r, 0, 7); g.stroke(); }
  const led = g.createRadialGradient(m, m, 0, m, m, 9); led.addColorStop(0, "#f4d36a"); led.addColorStop(0.7, "#e8c45a"); led.addColorStop(1, "rgba(230,225,210,0)");
  g.fillStyle = led; g.fillRect(m - 10, m - 10, 20, 20);
  return tex(T, c);
}
/* ---------- material registry: mat(name) returns one shared material ----------
   c: sRGB hex (null = from the finish in applyFinish()), r: roughness, m: metalness. Extras apply at Mid and High
   unless noted: cc / ccr clearcoat and its roughness; aniso (High); irid iridescence (High); brushed streak maps (all
   tiers; bump too where bump is set); grain / dots / traces detail maps; film: opacity of a thin see-through film (all
   tiers; still writes depth); phys: Physical at Mid even with no extra on;
   always: Physical (with its clearcoat, if it has one) at every tier; grainN: the satin grain
   normal map (grainNormal; scale = normalScale); ei: the material holds the studio as its own envMap at this intensity
   (envMapIntensity only scales a material's own envMap since three.js r163); map: "flash" (the picture below);
   si: the base layer's specularIntensity under a clearcoat (Mid and High).
   The frame and the spine cover are one satin blasted metal (when the cover took the frame's colour at 0.92 and the
   brushed map, it showed as a bluer band); the back is a satin glass with a real clearcoat sheen; the black glass has
   one glossy layer, not two; keycaps are matte soft-touch. The satin metal's roughness is 0.40: at 0.30 the spine
   mirrored the studio's softboxes as hard chrome stripes; at 0.40 they blend into one soft gradient and the metal
   reads satin silver. The back's clear glass is glossy (clearcoat 1.0 at 0.10) over a colour layer that reflects
   little itself (si 0.5: an ink under glass meets glass, not air), so the sheen strip shows as a band with a soft
   edge instead of an even lift. The island holds the studio at 0.15: at full strength its glass top mirrored the
   overhead bank and read silver in `exploded` (the island-black check). The lenses and their cover glass hold it at
   0.3: camera optics are anti-reflection coated, and at full strength the sheen strip showed as a white square in the
   periscope's window in `island`. The gasket is a dark grey, not black: black, it read as a drawn outline. */
const REG_DEF = {
  frame:        { c: null, r: 0.40, m: 1, phys: 1, grainN: { tileMm: 4, scale: 0.08 } },
  face:         { c: null, r: 0.42, m: 0, cc: 0.6, ccr: 0.18 },
  back:         { c: null, r: 0.42, m: 0, cc: 1.0, ccr: 0.10, si: 0.5, grain: { tileMm: 16, scale: 0.06 } },
  web:          { c: null, r: 0.52, m: 0, cc: 0.3, ccr: 0.4 },
  keycap:       { c: null, r: 0.5, m: 0, cc: 0.25, ccr: 0.3 },
  glassBlack:   { c: 0x050608, r: 0.04, m: 0, irid: 0.3, ei: 0.6, always: 1 },
  island:       { c: 0x0c0d0f, r: 0.08, m: 0, cc: 1, ccr: 0.04, phys: 1, ei: 0.15 },
  port:         { c: 0x0e0f11, r: 0.8, m: 0 },
  flash:        { c: 0xf3eedc, r: 0.25, m: 0, cc: 1, ccr: 0.1, phys: 1 },
  lens:         { c: "lens", r: 0.04, m: 0, cc: 1, ccr: 0.02, irid: 0.3, phys: 1, ei: 0.3 },
  hingeCover:   { c: null, r: 0.40, m: 1, phys: 1, grainN: { tileMm: 4, scale: 0.08 } },
  antenna:      { c: null, r: 0.55, m: 0 },
  // (the frame's edges) a band through the frame: plastic in the frame's colour, mixed 35 % toward grey
  // (applyFinish); the dark inside of a port, hole or grille; the USB-C tongue; the black seam between glass and frame
  antennaBand:  { c: null, r: 0.55, m: 0 },
  portCavity:   { c: 0x08090a, r: 0.9, m: 0 },
  usbTongue:    { c: 0x6a6d72, r: 0.45, m: 0 },
  gasket:       { c: 0x1c1d20, r: 0.7, m: 0 },
  // (the camera island and the fold) the stepped black barrel behind each lens, the recessed glass with its blue-purple coating
  // glint, the island's machined metal rim (frame colour, polished), the ringed flash lens, the hinge's hidden faces (endCap: the cover's inside, the knuckles)
  lensBarrel:   { c: 0x0b0c0e, r: 0.55, m: 0.3 },
  lensGlass:    { c: 0x030407, r: 0.03, m: 0, cc: 1, ccr: 0.02, irid: 0.45, phys: 1, ei: 0.3 },
  islandRim:    { c: null, r: 0.18, m: 1, phys: 1 },
  flashLens:    { c: 0xffffff, r: 0.22, m: 0, cc: 1, ccr: 0.08, phys: 1, map: "flash" },
  endCap:       { c: 0x1c1d20, r: 0.45, m: 0.6 },
  steelSatin:   { c: 0xc5c8cc, r: 0.30, m: 1, phys: 1, brushed: { bump: 0.6, normal: 1 }, aniso: 0.7 },
  steelPolished:{ c: 0xe3e5e8, r: 0.12, m: 1 },
  steelDark:    { c: 0x3a3d42, r: 0.45, m: 1 },
  steelBracket: { c: 0xd8dade, r: 0.30, m: 1 },
  screw:        { c: 0x9a9da2, r: 0.35, m: 1 },
  plateBlack:   { c: 0x1e1f22, r: 0.5, m: 0 },
  plateSilver:  { c: 0xc9ccd0, r: 0.3, m: 1 },
  foamTan:      { c: 0xc9b48c, r: 1.0, m: 0, grain: { tileMm: 6, blobMm: 0.3, scale: 2.5 } },
  pcb:          { c: 0x235c7a, r: 0.55, m: 0, cc: 0.6, ccr: 0.3, phys: 1 },
  pcbGold:      { c: 0xb08d3c, r: 0.35, m: 1 },
  chip:         { c: 0x101113, r: 0.55, m: 0 },
  shieldCan:    { c: 0xa8b0b7, r: 0.38, m: 1, aniso: 0.15 },
  btb:          { c: 0x141516, r: 0.5, m: 0 },
  graphite:     { c: 0x2e2f33, r: 0.7, m: 0.2, grain: { tileMm: 12, scale: 0.4 } },
  ferrite:      { c: 0x1b1c1e, r: 0.6, m: 0 },
  vc:           { c: 0xa2a7aa, r: 0.4, m: 1, dots: { pitchMm: 1, scale: 0.3 } },   // silver-grey, a faint lattice
  alu:          { c: 0xb9bcc1, r: 0.42, m: 1, brushed: { bump: 0 } },
  copperFoil:   { c: 0xb98a6c, r: 0.30, m: 1 },
  oledBack:     { c: 0xc8cbcf, r: 0.45, m: 1 },
  tapeBlack:    { c: 0x141518, r: 0.7, m: 0 },
  tapeBlue:     { c: 0x2a5bd6, r: 0.5, m: 0 },
  flexAmber:    { c: 0xb8721f, r: 0.4, m: 0, cc: 0.3, ccr: 0.4, traces: 1, film: 0.9 },
  // #1c1c1e is the colour seen in photos, light included; as a base colour it renders as a flat unlit bar,
  // so the base is a step lighter (it renders near #1c1c1e) with flexAmber's clearcoat, and the bends show shading
  flexBlack:    { c: 0x2c2d31, r: 0.5, m: 0, cc: 0.3, ccr: 0.4 },
  stiffenerGold:{ c: 0xc9a54a, r: 0.35, m: 0.8 },
  cameraBody:   { c: 0x2e3034, r: 0.5, m: 0 },
  periscope:    { c: 0xc9b48a, r: 0.35, m: 1 },
  speakerBox:   { c: 0x1d1e20, r: 0.6, m: 0 },
  membrane:     { c: 0xc8742f, r: 0.45, m: 0.3 },
  gasketRed:    { c: 0xb8322c, r: 0.7, m: 0 },
  steelCan:     { c: 0xb9bcc0, r: 0.35, m: 1 },
  siliconeMat:  { c: 0x2a2c30, r: 0.8, m: 0 },
  lgf:          { c: 0xdfe6ea, r: 0.3, m: 0, see: 1 },
  carrierWhite: { c: 0xe6e6e2, r: 0.6, m: 0 },
  domeSteel:    { c: 0xc4c6c6, r: 0.25, m: 1 }
};
// per-finish roughness tweaks (by eye): a dark anodised frame shows every reflection crisply, so it is a touch rougher.
// The spine cover keeps the frame's roughness in every finish. (A slightly rougher cover than the frame was tried;
// measured, a cover rougher than the rails beside it reads brighter, because its curve gathers more of the
// softboxes: 0.36 against 0.30 was 11 % brighter at 90° open, over the 10 % the spine-tone check allows. Both at one
// roughness, they stay together.)
const FINISH_ROUGH = { graphite: { frame: 0.44, hingeCover: 0.44 }, cobalt: { frame: 0.43, hingeCover: 0.43 } };

const REG = {};
export function mat(name) {
  const m = REG[name];
  if (!m) throw new Error("mat(): unknown material '" + name + "'");
  return m;
}

// which class a registry name gets at the current tier (Q.physical)
function physical(d) {
  if (d.always) return true;
  if (Q.physical === "glass") return false;
  if (Q.physical === "some") return !!(d.phys || d.cc);
  return !!(d.phys || d.cc || d.aniso || d.irid);
}

function build(T, name, d, pics) {
  const o = { roughness: d.r, metalness: d.m };
  if (d.c === "lens") o.map = pics.lens;             // a colour map: the colour stays white
  else if (d.c !== null) o.color = d.c;
  if (d.map === "flash") o.map = pics.flash;
  if (d.ei !== undefined && pics.env) Object.assign(o, { envMap: pics.env, envMapIntensity: d.ei });
  if (d.grainN) { o.normalMap = grainNormal({ tileMm: d.grainN.tileMm }); o.normalScale = new T.Vector2(d.grainN.scale, d.grainN.scale); }
  const phys = physical(d), high = Q.tier === "high";
  if (phys && d.cc && (Q.clearcoat || d.always)) Object.assign(o, { clearcoat: d.cc, clearcoatRoughness: d.ccr });
  if (phys && d.si !== undefined && Q.clearcoat) o.specularIntensity = d.si;
  if (phys && d.irid && Q.iridescence) Object.assign(o, { iridescence: d.irid, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 420] });
  if (d.brushed) {
    const b = brushed();
    o.roughnessMap = b.rough; o.roughness = Math.min(1, d.r / BRUSH_MEAN);
    if (d.brushed.normal && b.normal) { o.normalMap = b.normal; o.normalScale = new T.Vector2(0.35, 0.35); }
    else if (d.brushed.bump) { o.bumpMap = b.bump; o.bumpScale = d.brushed.bump; }
    // anisotropy stretches highlights along the tangent (U); brushing runs along U, so turn it a quarter
    if (phys && d.aniso && Q.aniso && high) Object.assign(o, { anisotropy: d.aniso, anisotropyRotation: Math.PI / 2 });
  } else if (phys && d.aniso && Q.aniso && high) Object.assign(o, { anisotropy: d.aniso, anisotropyRotation: Math.PI / 2 });
  if (d.grain) { o.bumpMap = grain({ tileMm: d.grain.tileMm, blobMm: d.grain.blobMm, seed: 20 + name.length }); o.bumpScale = d.grain.scale; }
  if (d.dots) { o.bumpMap = dots({ pitchMm: d.dots.pitchMm }); o.bumpScale = d.dots.scale; }
  if (d.traces) { o.map = traces(); delete o.color; }
  if (d.see) Object.assign(o, { transparent: true, opacity: 0.6, depthWrite: false });
  // a thin film: what is under it shows faintly. One pass even when a caller makes it double-sided (the ribbons do), so
  // it costs no extra draw call
  if (d.film) Object.assign(o, { transparent: true, opacity: d.film, forceSinglePass: true });
  return phys ? new T.MeshPhysicalMaterial(o) : new T.MeshStandardMaterial(o);
}

// a copy of a registry material carrying a part's own map set (pcbMaps, canMaps, pouchMaps). With a colour map the
// colour turns white; with ORM the material's roughness and metalness turn 1 (the map holds the absolute values).
// At High a normal map is used where the set has one; otherwise the bump. o: { bumpScale, normalScale }
export function matWith(name, maps, o) {
  o = o || {};
  const m = mat(name).clone();
  if (maps.map) { m.map = maps.map; m.color.setHex(0xffffff); }
  if (maps.orm) { m.aoMap = m.roughnessMap = m.metalnessMap = maps.orm; m.roughness = 1; m.metalness = 1; }
  if (maps.normal && Q.relief === "normal") { m.normalMap = maps.normal; m.normalScale.setScalar(o.normalScale || 1); m.bumpMap = null; }
  else if (maps.bump) { m.bumpMap = maps.bump; m.bumpScale = o.bumpScale === undefined ? 1 : o.bumpScale; }
  m.needsUpdate = true;
  return m;
}

/* ---------- build every registry material (each module then asks for its own by name: mat()) ---------- */
export function createMaterials(T, ren, env) {
  const pics = { lens: lensTex(T), flash: flashTex(T), env };
  Object.keys(REG_DEF).forEach((name) => { REG[name] = build(T, name, REG_DEF[name], pics); REG[name].name = name; });
  applyFinish(); setBacklightLook();
}

/* the keyboard backlight against the backdrop: a real backlight is all but invisible in a bright studio,
   so on the light backdrop the legends glow at about 0.12 (the backlight's 0.55 × 0.22), at full strength on the dark
   one. exterior.js sets the backlight's on/off level; this scales it. scene.js (applyBackdrop) calls it. */
let darkLook = false;
export function setBacklightLook(dark) {
  if (dark !== undefined) darkLook = dark;
  if (REG.keycap) { REG.keycap.emissiveIntensity = darkLook ? 1 : 0.22; invalidate(); }
}

// finish swatches: recolour the finish-driven materials, then tell subscribers (keys repaint their legend map)
const GREY = new THREE.Color(0x8a8d92);
export function applyFinish() {
  if (!REG.frame) return;
  const f = fin(), tweak = FINISH_ROUGH[props.finish] || {};
  REG.frame.color.setHex(f.frame); REG.face.color.setHex(f.face); REG.back.color.setHex(f.back);
  // the key web sits in the keys' shade: about 15 % darker than the face, as seen (0.72 in linear light)
  REG.web.color.setHex(f.face).multiplyScalar(0.72);
  if (REG.keycap.map) REG.keycap.color.setHex(0xffffff); else REG.keycap.color.set(f.key);
  // one metal, one tone across the frame's rails and the spine cover
  REG.hingeCover.color.setHex(f.frame); REG.islandRim.color.setHex(f.frame);
  REG.antenna.color.setHex(f.frame).lerp(GREY, 0.35); REG.antennaBand.color.copy(REG.antenna.color);
  ["frame", "hingeCover"].forEach((n) => { const d = REG_DEF[n], r = tweak[n] || d.r; REG[n].roughness = d.brushed ? Math.min(1, r / BRUSH_MEAN) : r; });
  // (build/shoot.py --selftest: a back tinted 25 % toward blue-grey must fail the finish check)
  if (params.fc_fail === "tint") REG.back.color.lerp(new THREE.Color(0x7c8798), 0.25);
  // (and the frame metal at gunmetal must fail the frame-tone check; a silver island top, the island check)
  if (params.fc_fail === "gunmetal") { REG.frame.color.setHex(0x55565a); REG.hingeCover.color.setHex(0x55565a); }
  if (params.fc_fail === "island") REG.island.color.setHex(0xc4c6ca);
  // (and the spine cover more satin than the frame, the spine-tone check: they are one metal)
  if (params.fc_fail === "satin") REG.hingeCover.roughness += 0.06;
  emitFinish();
  invalidate();
}

document.querySelectorAll("[data-finish]").forEach((b) => b.addEventListener("click", () => {
  props.finish = b.dataset.finish; applyFinish();
  document.querySelectorAll("[data-finish]").forEach((x) => x.setAttribute("aria-pressed", x === b));
}));
