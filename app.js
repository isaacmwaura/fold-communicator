/* Fold Communicator — interactive three.js render.
   Ported from the "Communicator Fold Mesh v2" design reference.
   Model units are millimetres. Origin is the device centre, Y is up.
   In front view the hinge is on the left and the device opens like a book. */
(function () {
  "use strict";

  /* ---------- page state (what the controls change) ---------- */
  const props = {
    finish: "porcelain",
    accent: "#67c6d4",
    backdrop: "studio",
    keyBacklight: true,
    autoRotate: false,
    innerLayout: "split"
  };

  /* SCREEN CONTENT — edit this object; both displays repaint from it. */
  const screen = {
    cover: {
      time: "10:23",
      meta: "Monday, 3 August",
      rows: [
        ["Telegram", "now", "Kevin M: I had a crazy idea last night", 1],
        ["Slack",    "5m",  "3 new messages in #hinge-review",      0],
        ["WhatsApp", "1h",  "7 new messages from 2 chats",          0],
        ["Gmail",    "1h",  "2 new emails",                         0]
      ]
    },
    inner: {
      left:  { kind: "list", app: "Messages", title: "Threads",
               rows: [["Ada L.", "runway slips to friday", 1, "09:32"], ["Ops", "deploy window 14:00", 0, "09:10"],
                      ["M. Okoth", "invoice signed", 0, "08:47"], ["Standup", "notes attached", 0, "08:30"],
                      ["Clicks", "firmware 1.4 is out", 0, "Sun"], ["Design", "hinge review 16:00", 0, "Sat"]] },
      right: { kind: "doc", app: "Notes", title: "Hinge load case — rev B",
               meta: "ada l.  ·  09:32  ·  2 attachments", chart: true,
               bubbles: [["in", "can the deck take 200k cycles?"], ["out", "rig says 214k — margin holds"]] }
    }
  };

  const finishes = {
    porcelain: { frame: 0xd9d8d5, face: 0xefece6, back: 0xedebe7, key: "#34373c", well: 0x5b5a58 },
    graphite:  { frame: 0x5a5c60, face: 0x2c2d30, back: 0x323337, key: "#1b1c1f", well: 0x0d0d0e },
    sage:      { frame: 0xb3b8ad, face: 0xc2cabb, back: 0xbac3b2, key: "#2f352f", well: 0x4d554a },
    clay:      { frame: 0xc8b09d, face: 0xdbc6b4, back: 0xd4bfad, key: "#3b2f2a", well: 0x5e4c42 },
    cobalt:    { frame: 0x8290a2, face: 0x34465f, back: 0x3a4c66, key: "#18202c", well: 0x121822 }
  };

  const views = {
    hero:  { az: -0.62, el: 0.13, dist: 470, ang: 0 },
    front: { az: 0,     el: 0.02, dist: 440, ang: 0 },
    flex:  { az: 0.78,  el: 0.30, dist: 560, ang: 100 },
    open:  { az: 0.22,  el: 0.07, dist: 560, ang: 180 },
    back:  { az: Math.PI + 0.5, el: 0.12, dist: 470, ang: 0 }
  };

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const root = $("viewer"), mount = $("mount"), stEl = $("state"), dimEl = $("dims"),
        angEl = $("angle"), slider = $("hinge");
  const btns = {};
  ["hero", "front", "flex", "open", "back"].forEach((n) => { btns[n] = $("v-" + n); });

  const S = { accent: props.accent, ang: 0 };   // runtime scene state
  const fin = () => finishes[props.finish] || finishes.porcelain;

  /* ---------- helpers ---------- */
  const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  function rr(g, x, y, w, h, r) { r = Math.min(r, h / 2, w / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function tex(T, c) { const t = new T.CanvasTexture(c); t.anisotropy = S.ren ? S.ren.capabilities.getMaxAnisotropy() : 8; t.encoding = T.sRGBEncoding; return t; }
  function rrShape(T, w, h, r) { const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, h / 2, w / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
  // leaf outline, x ∈ [0, L]·s ; outer corners R, hinge corners rh ; inset uniformly (hinge side by insH)
  function leafShape(T, s, ins, R, rh, insH) {
    const L = S.L, H = S.H, x0 = insH === undefined ? ins : insH, x1 = L - ins, y0 = -H / 2 + ins, y1 = H / 2 - ins;
    const ro = Math.max(0.3, R - ins), rq = Math.max(0.02, rh - Math.min(ins, x0)), sh = new T.Shape(), P = (x) => s * x;
    sh.moveTo(P(x0 + rq), y0); sh.lineTo(P(x1 - ro), y0); sh.quadraticCurveTo(P(x1), y0, P(x1), y0 + ro);
    sh.lineTo(P(x1), y1 - ro); sh.quadraticCurveTo(P(x1), y1, P(x1 - ro), y1); sh.lineTo(P(x0 + rq), y1);
    sh.quadraticCurveTo(P(x0), y1, P(x0), y1 - rq); sh.lineTo(P(x0), y0 + rq); sh.quadraticCurveTo(P(x0), y0, P(x0 + rq), y0);
    return sh;
  }
  // extrusion whose finished footprint = shape grown by bev, z ∈ [0, depth]
  function ext(T, shape, depth, bev, segs) {
    const g = new T.ExtrudeGeometry(shape, { depth: Math.max(0.01, depth - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: segs || 4, curveSegments: 28 });
    g.translate(0, 0, bev); return g;
  }
  function flatUV(geo, fn) { const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) { const q = fn(p.getX(i), p.getY(i)); uv.setXY(i, q[0], q[1]); } uv.needsUpdate = true; return geo; }

  function studio(T) {
    const s = new T.Scene();
    s.add(new T.Mesh(new T.SphereGeometry(60, 32, 16), new T.MeshBasicMaterial({ color: new T.Color(0.40, 0.40, 0.41), side: T.BackSide })));
    const fl = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshBasicMaterial({ color: new T.Color(0.10, 0.10, 0.10) }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = -22; s.add(fl);
    const box = (w, h, x, y, z, v) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(v, v, v), side: T.DoubleSide }));
      m.scale.setScalar(0.1); m.position.set(x / 10, y / 10, z / 10); m.lookAt(0, 0, 0); s.add(m); };
    box(520, 260, 0, 320, 30, 3.0);     // overhead
    box(130, 460, -330, 40, 170, 5.5);  // key strip, front-left
    box(100, 420, 320, 30, -90, 3.0);   // rim, back-right
    box(300, 150, 160, 20, 330, 1.3);   // front fill
    box(220, 120, -120, -40, -320, 1.6); // rear fill
    return s;
  }

  /* ---------- textures ---------- */
  const appCol = (n) => ({ Telegram: "#2a9fd8", Slack: "#5b2163", WhatsApp: "#1fb855", Gmail: "#d9453a", Messages: "#2f9e5a", Notes: "#d9a43a" })[n] || S.accent;
  function fit(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 3 && g.measureText(s + "…").width > w) s = s.slice(0, -1); return s.trim() + "…"; }
  function wall(g, W, H, a) { g.fillStyle = "#08090b"; g.fillRect(0, 0, W, H);
    const gl = (x, y, r, c, al) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = al * a; g.fillStyle = q; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
    gl(W * 0.88, H * 0.02, W * 0.95, S.accent, 0.55); gl(W * 0.02, H * 1.02, W * 0.95, "#c46a3c", 0.5); gl(W * 0.45, H * 0.55, W * 0.55, "#34397f", 0.35); }
  function sbar(g, xr, y, col) { g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 2.2;
    rr(g, xr - 44, y - 15, 40, 20, 5); g.stroke(); g.fillRect(xr - 3, y - 9, 3, 8); rr(g, xr - 41, y - 12, 27, 14, 3); g.fill();
    for (let i = 0; i < 4; i++) { rr(g, xr - 92 + i * 8, y + 5 - (i + 1) * 4.6, 5, (i + 1) * 4.6, 1.5); g.fill(); }
    g.font = "600 19px 'IBM Plex Sans',sans-serif"; g.textAlign = "right"; g.fillText("5G", xr - 100, y + 4); g.textAlign = "left"; }
  function coverTex(T) {
    const W = 870, H = 1000, c = cv(W, H), g = c.getContext("2d"), C = screen.cover;
    wall(g, W, H, 1);
    g.fillStyle = "#000"; g.beginPath(); g.arc(W / 2, 44, 16, 0, 7); g.fill();
    g.fillStyle = "#eceef0"; g.font = "600 24px 'IBM Plex Sans',sans-serif"; g.fillText(C.time, 50, 54);
    sbar(g, W - 46, 50, "#eceef0");
    g.fillStyle = "#f7f8f9"; g.font = "300 178px 'IBM Plex Sans',sans-serif"; g.fillText(C.time, 36, 250);
    g.fillStyle = "rgba(240,242,244,.75)"; g.font = "400 30px 'IBM Plex Sans',sans-serif"; g.fillText(C.meta, 46, 300);
    const cw = W - 140;
    C.rows.forEach((r, i) => { const y = 342 + i * 146, hl = r[3];
      g.fillStyle = hl ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"; rr(g, 30, y, cw + 20, 132, 32); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = appCol(r[0]); rr(g, 56, y + 34, 64, 64, 17); g.fill();
      g.fillStyle = "#fff"; g.font = "600 30px 'IBM Plex Sans',sans-serif"; g.textAlign = "center"; g.fillText(r[0][0], 88, y + 77); g.textAlign = "left";
      g.fillStyle = "#f4f5f6"; g.font = "600 28px 'IBM Plex Sans',sans-serif"; g.fillText(r[0], 144, y + 58);
      g.fillStyle = "rgba(235,238,240,.55)"; g.font = "400 22px 'IBM Plex Sans',sans-serif"; g.textAlign = "right"; g.fillText(r[1], cw + 20, y + 58); g.textAlign = "left";
      g.fillStyle = "rgba(235,238,240,.82)"; g.font = "400 24px 'IBM Plex Sans',sans-serif"; g.fillText(fit(g, r[2], cw - 140), 144, y + 96);
    });
    g.fillStyle = "rgba(255,255,255,.42)"; g.font = "500 16px 'IBM Plex Sans',sans-serif"; g.textAlign = "center";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((ch, i) => g.fillText(ch, W - 38, 350 + i * 21.4)); g.textAlign = "left";
    g.fillStyle = "rgba(255,255,255,0.5)"; rr(g, W / 2 - 80, H - 28, 160, 7, 4); g.fill();
    return tex(T, c);
  }
  function innerTex(T) {
    const W = 1480, H = 1190, c = cv(W, H), g = c.getContext("2d"), ac = S.accent, single = props.innerLayout === "single";
    wall(g, W, H, 0.7);
    g.fillStyle = "#e6e9ec"; g.font = "600 22px 'IBM Plex Sans',sans-serif"; g.fillText("9:41", 48, 54); sbar(g, W - 48, 50, "#e6e9ec");
    const top = 82, bot = H - 118, mid = W / 2;
    if (single) pane(g, { x: 40, y: top, w: W - 80, h: bot - top }, screen.inner.right, ac, true);
    else {
      pane(g, { x: 40, y: top, w: mid - 58, h: bot - top }, screen.inner.left, ac, false);
      pane(g, { x: mid + 18, y: top, w: mid - 58, h: bot - top }, screen.inner.right, ac, true);
      g.fillStyle = "rgba(255,255,255,.28)"; rr(g, mid - 3, (top + bot) / 2 - 36, 6, 72, 3); g.fill();
    }
    g.fillStyle = "rgba(18,22,28,.88)"; rr(g, W / 2 - 262, bot + 24, 524, 78, 28); g.fill();
    ["#2f9e5a", "#d9a43a", ac, "#2a9fd8", "#d9453a", "#7f8bff", "#3a4048"].forEach((col, i) => { g.fillStyle = col; rr(g, W / 2 - 238 + i * 70, bot + 38, 50, 50, 14); g.fill(); });
    const cr = g.createLinearGradient(mid - 26, 0, mid + 26, 0);
    cr.addColorStop(0, "rgba(0,0,0,0)"); cr.addColorStop(.45, "rgba(0,0,0,.22)"); cr.addColorStop(.5, "rgba(255,255,255,.03)");
    cr.addColorStop(.55, "rgba(0,0,0,.22)"); cr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = cr; g.fillRect(mid - 26, 0, 52, H);
    return tex(T, c);
  }
  function pane(g, b, a, ac, right) {
    g.fillStyle = "rgba(12,15,20,0.94)"; rr(g, b.x, b.y, b.w, b.h, 30); g.fill();
    g.fillStyle = appCol(a.app); rr(g, b.x + 28, b.y + 26, 34, 34, 9); g.fill();
    g.fillStyle = "#8d96a0"; g.font = "500 20px 'IBM Plex Sans',sans-serif"; g.fillText(a.app || "", b.x + 74, b.y + 50);
    g.fillStyle = "#f1f3f5"; g.font = "600 " + (right ? 40 : 34) + "px 'IBM Plex Sans',sans-serif"; g.fillText(fit(g, a.title || "", b.w - 56), b.x + 28, b.y + 110);
    if (a.meta) { g.fillStyle = "#6d7680"; g.font = "400 20px 'IBM Plex Mono',monospace"; g.fillText(a.meta, b.x + 28, b.y + 146); }
    let y = b.y + (a.meta ? 176 : 140);
    if (a.kind === "list") {
      const pal = ["#d98a3d", "#5fd39a", "#7f8bff", "#e06c75", "#67c6d4", "#c7a76b"];
      (a.rows || []).forEach((r, i) => { const h = 104;
        if (r[2]) { g.fillStyle = "rgba(255,255,255,.055)"; rr(g, b.x + 14, y, b.w - 28, h, 20); g.fill(); }
        g.fillStyle = pal[i % pal.length]; g.beginPath(); g.arc(b.x + 68, y + 52, 28, 0, 7); g.fill();
        g.fillStyle = "#0b0d10"; g.font = "600 22px 'IBM Plex Sans',sans-serif"; g.textAlign = "center";
        g.fillText(r[0].split(/[ .]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), b.x + 68, y + 60); g.textAlign = "left";
        g.fillStyle = "#e6e9ec"; g.font = (r[2] ? "600" : "500") + " 25px 'IBM Plex Sans',sans-serif"; g.fillText(r[0], b.x + 112, y + 44);
        g.fillStyle = r[2] ? "#b4bcc4" : "#78818a"; g.font = "400 21px 'IBM Plex Sans',sans-serif"; g.fillText(fit(g, r[1], b.w - 200), b.x + 112, y + 76);
        g.fillStyle = "#6d7680"; g.font = "400 19px 'IBM Plex Sans',sans-serif"; g.textAlign = "right"; g.fillText(r[3] || "", b.x + b.w - 30, y + 44); g.textAlign = "left";
        if (r[2]) { g.fillStyle = ac; g.beginPath(); g.arc(b.x + b.w - 40, y + 70, 7, 0, 7); g.fill(); }
        y += h + 6; });
    } else {
      if (a.chart) { const ch = 270, x0 = b.x + 46, xw = b.w - 92, y0 = y + 50, yb = y + ch - 36;
        g.fillStyle = "rgba(255,255,255,.035)"; rr(g, b.x + 18, y, b.w - 36, ch, 22); g.fill();
        g.fillStyle = "#6d7680"; g.font = "500 17px 'IBM Plex Mono',monospace"; g.fillText("CYCLES × 1000", x0, y + 34);
        g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) { const gy = y0 + i * (yb - y0) / 3; g.beginPath(); g.moveTo(x0, gy); g.lineTo(x0 + xw, gy); g.stroke(); }
        const n = 60, P = []; for (let i = 0; i <= n; i++) { const u = i / n; P.push([x0 + xw * u, yb - (1 - Math.exp(-3.2 * u)) / (1 - Math.exp(-3.2)) * (yb - y0 - 14) + Math.sin(u * 31) * 3 * (1 - u)]); }
        const ag = g.createLinearGradient(0, y0, 0, yb); ag.addColorStop(0, ac); ag.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = .32; g.fillStyle = ag; g.beginPath(); g.moveTo(x0, yb); P.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(x0 + xw, yb); g.closePath(); g.fill(); g.globalAlpha = 1;
        g.strokeStyle = ac; g.lineWidth = 3.6; g.lineJoin = "round"; g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
        const e = P[n]; g.fillStyle = ac; g.beginPath(); g.arc(e[0], e[1], 7, 0, 7); g.fill();
        g.fillStyle = "#e6e9ec"; g.font = "600 22px 'IBM Plex Sans',sans-serif"; g.textAlign = "right"; g.fillText("214k", e[0] - 14, e[1] - 14); g.textAlign = "left";
        y += ch + 26;
      }
      for (let i = 0; i < 6; i++) { g.fillStyle = (i % 4 === 3) ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.13)"; rr(g, b.x + 28, y + i * 30, (i % 4 === 3) ? (b.w - 230) : (b.w - 56), 11, 5); g.fill(); }
      y += 6 * 30 + 22;
      (a.bubbles || []).forEach((m) => { const out = m[0] === "out"; g.font = "400 21px 'IBM Plex Sans',sans-serif";
        const bw = Math.min(b.w - 90, g.measureText(m[1]).width + 48), bx = out ? b.x + b.w - 24 - bw : b.x + 24;
        g.fillStyle = out ? ac : "#1d242c"; rr(g, bx, y, bw, 62, 22); g.fill();
        g.fillStyle = out ? "#071014" : "#c3cad1"; g.fillText(m[1], bx + 24, y + 39); y += 74; });
    }
  }
  function hingeTex(T) { const c = cv(512, 256), g = c.getContext("2d");
    for (let x = 0; x < 512; x++) { const v = Math.round(222 + Math.random() * 33); g.fillStyle = "rgb(" + v + "," + v + "," + v + ")"; g.fillRect(x, 0, 1, 256); }
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, 5, 256); g.fillRect(507, 0, 5, 256);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; }
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
  function lensTex(T) {
    const Z = 256, c = cv(Z, Z), g = c.getContext("2d"), m = Z / 2;
    const rg = g.createRadialGradient(m, m, 0, m, m, m);
    [[0, "#0b0f18"], [.3, "#141c2e"], [.46, "#06070a"], [.7, "#121418"], [.78, "#050607"], [.92, "#1e2024"], [1, "#2e3034"]].forEach((s) => rg.addColorStop(s[0], s[1]));
    g.fillStyle = rg; g.fillRect(0, 0, Z, Z);
    g.fillStyle = "rgba(130,100,220,0.22)"; g.beginPath(); g.ellipse(m - 22, m - 26, 22, 12, -0.6, 0, 7); g.fill();
    g.fillStyle = "rgba(90,200,170,0.12)"; g.beginPath(); g.ellipse(m + 24, m + 20, 14, 8, -0.6, 0, 7); g.fill();
    return tex(T, c);
  }

  /* ---------- live updates from the controls ---------- */
  function repaint() { const T = window.THREE; if (!T || !S.coverMat) return;
    [[S.coverMat, () => coverTex(T)], [S.dispMat, () => innerTex(T)]].forEach(([m, f]) => { if (m.emissiveMap) m.emissiveMap.dispose(); m.emissiveMap = f(); m.needsUpdate = true; });
    if (S.keyMat) { S.keyMat.map.dispose(); S.keyMat.map = keysTex(T, false); S.keyMat.emissiveMap.dispose(); S.keyMat.emissiveMap = keysTex(T, true); S.keyMat.needsUpdate = true; }
  }
  function setBacklight() { if (S.keyMat) S.keyMat.emissive.setScalar(props.keyBacklight === false ? 0 : 0.55); }
  function applyFinish() { const M = S.M, T = window.THREE; if (!M || !T) return; const f = fin();
    M.frame.color.setHex(f.frame); M.face.color.setHex(f.face); M.back.color.setHex(f.back); M.well.color.setHex(f.well);
    M.hinge.color.setHex(f.frame).multiplyScalar(0.92);
    if (S.keyMat) { S.keyMat.map.dispose(); S.keyMat.map = keysTex(T, false); S.keyMat.needsUpdate = true; } }
  function applyBackdrop() {
    const dark = props.backdrop === "graphite";
    root.classList.toggle("dark", dark);
    if (S.groundMat) S.groundMat.opacity = dark ? 0.45 : 0.2;
  }
  function markBtn(k) { Object.keys(btns).forEach((n) => btns[n] && btns[n].classList.toggle("on", n === k)); }

  /* ---------- scene ---------- */
  function init() {
    const T = window.THREE;
    const H = 123.9, t = 5.4, L = 76.5, R = 9.2, RH = 1.6, B = 1.15;
    S.H = H; S.L = L;

    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(22, 1, 20, 4000);
    const ren = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); S.ren = ren;
    ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); ren.setClearColor(0, 0);
    ren.outputEncoding = T.sRGBEncoding; ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 1.05;
    ren.shadowMap.enabled = true; ren.shadowMap.type = T.VSMShadowMap;
    const cvs = ren.domElement; cvs.style.cssText = "width:100%;height:100%;display:block"; mount.appendChild(cvs);
    const pm = new T.PMREMGenerator(ren); scene.environment = pm.fromScene(studio(T), 0.03).texture; pm.dispose();

    const sun = new T.DirectionalLight(0xffffff, 0.35); sun.position.set(40, 340, 120); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 60, far: 800 });
    sun.shadow.radius = 16; sun.shadow.bias = -0.0006; scene.add(sun);

    const PM = (o) => new T.MeshPhysicalMaterial(o);
    const M = {
      frame: PM({ color: 0xd9d8d5, metalness: 1, roughness: 0.3 }),
      face:  PM({ color: 0xefece6, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.18 }),
      back:  PM({ color: 0xedebe7, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.55 }),
      black: PM({ color: 0x050608, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
      well:  new T.MeshStandardMaterial({ color: 0x5b5a58, roughness: 0.95 }),
      island: PM({ color: 0x0c0d0f, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 }),
      hinge: PM({ color: 0xc8c7c4, metalness: 1, roughness: 0.36, map: hingeTex(T), bumpMap: hingeTex(T), bumpScale: 0.012 }),
      port:  new T.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.8 }),
      flash: PM({ color: 0xf3eedc, roughness: 0.25, clearcoat: 1 }),
      lens:  PM({ map: lensTex(T), roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 })
    };
    S.M = M;
    const scr = () => { const m = PM({ color: 0x000000, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0xffffff, envMapIntensity: 0.22 }); m.toneMapped = false; return m; };
    S.coverMat = scr(); S.dispMat = scr();
    S.coverMat.emissiveMap = coverTex(T); S.dispMat.emissiveMap = innerTex(T);

    /* keyboard layout, front coords: x from hinge (0 → L), y up */
    const KW = 6.15, KH = 5.9, KR = 2.3, PX = 6.95, ROWS = [-27.8, -34.8, -41.8, -48.8], span = 9 * PX + KW, kx0 = L / 2 - span / 2 + KW / 2;
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
    S.keyMat = PM({ map: keysTex(T, false), emissiveMap: keysTex(T, true), emissive: 0xffffff, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    setBacklight(); applyFinish();

    const asm = new T.Group(); scene.add(asm);
    const panel = new T.Group(), deck = new T.Group(), spineG = new T.Group(); asm.add(panel, deck, spineG);
    const mk = (geo, mat, par, shadow) => { const m = new T.Mesh(geo, mat); m.castShadow = shadow !== false; par.add(m); return m; };
    const DB = 2.0;   // inner display bezel

    [panel, deck].forEach((G, i) => { const s = i ? -1 : 1;
      const body = mk(ext(T, leafShape(T, s, B, R, RH), t, B, 7), M.frame, G); body.position.z = -t;
      const ig = mk(ext(T, leafShape(T, s, B + 0.2, R, RH, B + 0.05), 0.24, 0.1, 3), M.black, G, false); ig.position.z = -0.12;
      const dsh = leafShape(T, s, DB, R, 0.02, 0), dg = new T.ShapeGeometry(dsh, 28), DW = L - DB, DH = H - 2 * DB;
      flatUV(dg, (x, y) => [0.5 + x / (2 * DW), (y + DH / 2) / DH]);
      const dm = mk(dg, S.dispMat, G, false); dm.position.z = 0.125;
      const of = mk(ext(T, leafShape(T, s, B + 0.3, R, RH), 0.26, 0.1, 3), i ? M.face : M.back, G);
      of.rotation.x = Math.PI; of.position.z = -t + 0.06;
    });

    /* deck outer face — front coords xf map to deck-local x = -xf */
    const OZ = -t - 0.2;
    { const sh = leafShape(T, -1, B + 0.3, R, RH), hp = new T.Path(), w = span + 2.6, h = (ROWS[0] - ROWS[3]) + KH + 2.6, r = 3.6, x = -L / 2 - w / 2, y = -(ROWS[0] + ROWS[3]) / 2 - h / 2;
      hp.moveTo(x + r, y); hp.lineTo(x + w - r, y); hp.quadraticCurveTo(x + w, y, x + w, y + r); hp.lineTo(x + w, y + h - r); hp.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      hp.lineTo(x + r, y + h); hp.quadraticCurveTo(x, y + h, x, y + h - r); hp.lineTo(x, y + r); hp.quadraticCurveTo(x, y, x + r, y); sh.holes.push(hp);
      const pl = mk(ext(T, sh, 1.25, 0.22, 4), M.face, deck); pl.rotation.x = Math.PI; pl.position.z = OZ + 0.02; }
    const CWd = 69.7, CHt = 80, CY = H / 2 - 3.6 - CHt / 2, CX = L / 2;
    const cg = mk(ext(T, rrShape(T, CWd + 1.6 - 0.2, CHt + 1.6 - 0.2, 7.1), 0.3, 0.1, 3), M.black, deck, false);
    cg.rotation.x = Math.PI; cg.position.set(-CX, CY, OZ - 1.15);
    const cgeo = new T.ShapeGeometry(rrShape(T, CWd, CHt, 6.3), 28); flatUV(cgeo, (x, y) => [x / CWd + 0.5, y / CHt + 0.5]);
    const cs = mk(cgeo, S.coverMat, deck, false); cs.rotation.y = Math.PI; cs.position.set(-CX, CY, OZ - 1.47);
    const KB = S.KB, kd = 1.05, kb = 0.42;
    keys.forEach((k) => {
      const geo = ext(T, rrShape(T, k.w - 2 * kb, k.h - 2 * kb, KR - kb), kd, kb, 6);
      flatUV(geo, (gx, gy) => [(k.x - gx - KB.x0) / KB.W, (k.y - gy - KB.y0) / KB.H]);
      const m = mk(geo, S.keyMat, deck); m.rotation.x = Math.PI; m.position.set(-k.x, k.y, OZ + 0.02);
      const w = mk(new T.ShapeGeometry(rrShape(T, k.w + 0.75, k.h + 0.75, KR + 0.37), 16), M.well, deck, false);
      w.rotation.y = Math.PI; w.position.set(-k.x, k.y, OZ - 0.006);
    });
    const spk = mk(new T.ShapeGeometry(rrShape(T, 15, 1.1, 0.55), 12), M.port, deck, false); spk.rotation.y = Math.PI; spk.position.set(-L / 2, -56.9, OZ - 1.24);

    // side keys on the free edge (right, seen from the front)
    [[36, 18], [14, 11]].forEach((v) => {
      const sl = mk(new T.ShapeGeometry(rrShape(T, 2.3, v[1] + 0.8, 1.15), 16), M.port, deck, false); sl.rotation.y = -Math.PI / 2; sl.position.set(-L - 0.015, v[0], -t / 2);
      const b = mk(ext(T, rrShape(T, 1.75, v[1], 0.87), 0.75, 0.28, 4), M.frame, deck); b.rotation.y = -Math.PI / 2; b.position.set(-L + 0.55, v[0], -t / 2); });
    // bottom edge: USB-C + speaker; top: mic
    const edge = (geo, x, top) => { const m = mk(geo, M.port, deck, false); m.rotation.x = top ? -Math.PI / 2 : Math.PI / 2; m.position.set(x, top ? H / 2 + 0.02 : -H / 2 - 0.02, -t / 2); };
    edge(new T.ShapeGeometry(rrShape(T, 8.6, 2.7, 1.35), 16), -L / 2, false);
    for (let i = 0; i < 5; i++) edge(new T.CircleGeometry(0.5, 16), -L / 2 - 11 - i * 2.1, false);
    edge(new T.CircleGeometry(0.45, 16), -L / 2 + 9, false);
    edge(new T.CircleGeometry(0.45, 16), -L + 18, true);

    // rear camera island on the panel leaf
    const IX = L - 17.5, IY = H / 2 - 29, IW = 25, IH = 47;
    const isl = mk(ext(T, rrShape(T, IW, IH, 8.5), 1.8, 0.5, 6), M.island, panel); isl.rotation.x = Math.PI; isl.position.set(IX, IY, OZ + 0.02);
    const IZ = OZ - 1.78;
    const ringG = (rl) => { const g = new T.LatheGeometry([[rl - 0.05, 0], [rl + 1.0, 0], [rl + 1.2, 0.2], [rl + 1.2, 1.0], [rl + 0.95, 1.25], [rl + 0.35, 1.25], [rl, 1.0]].map((p) => new T.Vector2(p[0], p[1])), 72); g.rotateX(-Math.PI / 2); return g; };
    [[IY + 12.6, 4.2], [IY, 4.2], [IY - 12.6, 4.2]].forEach((q) => { const x = IX + 3.6;
      const rg = mk(ringG(q[1]), M.frame, panel); rg.position.set(x, q[0], IZ + 0.02);
      const ln = mk(new T.CircleGeometry(q[1] + 0.02, 64), M.lens, panel, false); ln.rotation.y = Math.PI; ln.position.set(x, q[0], IZ - 0.95); });
    const dot = (r, m, y) => { const d = mk(new T.CircleGeometry(r, 32), m, panel, false); d.rotation.y = Math.PI; d.position.set(IX - 7.8, y, IZ - 0.01); };
    dot(1.7, M.flash, IY + 9); dot(1.15, M.port, IY + 1); dot(0.4, M.port, IY - 8);
    // spine: circular segment, flush with both leaf backs, rounded ends
    { const ec = 1.8, pr = [new T.Vector2(0.001, -H / 2)];
      for (let i = 0; i <= 8; i++) { const th = -Math.PI / 2 + i / 8 * Math.PI / 2; pr.push(new T.Vector2(t - ec + ec * Math.cos(th), -H / 2 + ec + ec * Math.sin(th))); }
      for (let i = 1; i < 60; i++) pr.push(new T.Vector2(t, -H / 2 + ec + (H - 2 * ec) * i / 60));
      for (let i = 0; i <= 8; i++) { const th = i / 8 * Math.PI / 2; pr.push(new T.Vector2(t - ec + ec * Math.cos(th), H / 2 - ec + ec * Math.sin(th))); }
      pr.push(new T.Vector2(0.001, H / 2));
      const sm = M.hinge; sm.side = T.DoubleSide;
      mk(new T.LatheGeometry(pr, 72, Math.PI / 2, Math.PI), sm, spineG); }

    const gm = new T.ShadowMaterial({ opacity: 0.2 }); S.groundMat = gm; applyBackdrop();
    const ground = new T.Mesh(new T.PlaneGeometry(3000, 3000), gm); ground.rotation.x = -Math.PI / 2; ground.position.y = -H / 2 - 16; ground.receiveShadow = true; scene.add(ground);

    // Set the hinge angle (0 = folded, 180 = open flat) and report the live bounding box.
    S.setFold = (deg) => {
      S.ang = deg; const a = Math.PI * (1 - deg / 180), ca = Math.cos(a), sa = Math.sin(a);
      deck.rotation.y = a; spineG.rotation.y = a / 2;
      const pts = [[0, -t - 0.2], [L, -t - 0.2], [0, 0.12], [L, 0.12]];
      [[-L, -t - 1.45], [0, -t - 1.45], [-L, 0.12], [0, 0.12]].forEach((p) => pts.push([p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca]));
      for (let k = 0; k <= 12; k++) { const ps = (k / 12 - 0.5) * Math.PI, x = t * Math.sin(ps), z = -t * Math.cos(ps), c2 = Math.cos(a / 2), s2 = Math.sin(a / 2);
        pts.push([x * c2 + z * s2, -x * s2 + z * c2]); }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
      asm.position.set(-(x0 + x1) / 2, 0, -(z0 + z1) / 2);
      const dx = x1 - x0, dz = z1 - z0, wv = Math.max(dx, dz), dv = Math.min(dx, dz);
      stEl.textContent = deg < 2 ? "Folded" : (deg > 178 ? "Open" : "Flex · " + Math.round(deg) + "°");
      dimEl.textContent = wv.toFixed(1) + " × " + H.toFixed(1) + " × " + dv.toFixed(1) + " mm";
      angEl.textContent = Math.round(deg) + "°";
      if (Math.abs(+slider.value - deg) > 0.6) slider.value = deg;
    };

    const resize = () => { const w = mount.clientWidth || 1, h = mount.clientHeight || 1; cam.aspect = w / h; cam.updateProjectionMatrix(); ren.setSize(w, h, false);
      S.fitK = Math.max(1, 1.25 / Math.min(1.25, w / h)); };
    new ResizeObserver(resize).observe(mount); resize();

    // Drag to orbit. On touch screens a vertical swipe still scrolls the page.
    let drag = false, lx = 0, ly = 0;
    mount.addEventListener("pointerdown", (e) => { drag = true; S.dragging = true; lx = e.clientX; ly = e.clientY; mount.setPointerCapture(e.pointerId); mount.style.cursor = "grabbing"; });
    mount.addEventListener("pointermove", (e) => { if (!drag) return; S.view.az -= (e.clientX - lx) * 0.008; S.view.el = Math.max(-1.3, Math.min(1.3, S.view.el + (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY; });
    const up = () => { drag = false; S.dragging = false; mount.style.cursor = "grab"; };
    mount.addEventListener("pointerup", up); mount.addEventListener("pointercancel", up);
    // Ctrl/⌘ + scroll (or trackpad pinch) zooms; plain scroll keeps scrolling the page.
    mount.addEventListener("wheel", (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(1 + e.deltaY * 0.0012); }, { passive: false });

    S.setFold(0);
    const loop = () => { requestAnimationFrame(loop);
      const pr = ren.getPixelRatio(); if (Math.abs(mount.clientWidth * pr - cvs.width) > 2 || Math.abs(mount.clientHeight * pr - cvs.height) > 2) resize();
      const c = S.cur, v = S.view, k = 0.09;
      if (props.autoRotate && !S.dragging) v.az += 0.0016;
      c.az += (v.az - c.az) * k; c.el += (v.el - c.el) * k; c.dist += (v.dist - c.dist) * k;
      const d = c.dist * (S.fitK || 1);
      cam.position.set(d * Math.cos(c.el) * Math.sin(c.az), d * Math.sin(c.el), d * Math.cos(c.el) * Math.cos(c.az)); cam.lookAt(0, -1, 0);
      ren.render(scene, cam); };
    loop();

    if (document.fonts) Promise.all(["300 80px 'IBM Plex Sans'", "400 20px 'IBM Plex Sans'", "500 40px 'IBM Plex Sans'", "600 40px 'IBM Plex Sans'", "500 20px 'IBM Plex Mono'", "400 20px 'IBM Plex Mono'"].map((f) => document.fonts.load(f))).then(repaint).catch(() => {});
  }

  function zoom(f) { S.view.dist = Math.max(220, Math.min(1200, S.view.dist * f)); }

  function animateTo(target) {
    if (!S.setFold) return;
    const from = S.ang, t0 = performance.now(), dur = 900 + Math.abs(target - from) * 3;
    if (S.anim) cancelAnimationFrame(S.anim);
    const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      S.setFold(from + (target - from) * e); if (k < 1) S.anim = requestAnimationFrame(step); };
    S.anim = requestAnimationFrame(step);
  }
  function go(name) { const v = views[name];
    // take the short way round
    const tau = Math.PI * 2; let az = v.az; while (az - S.view.az > Math.PI) az -= tau; while (az - S.view.az < -Math.PI) az += tau;
    Object.assign(S.view, { az, el: v.el, dist: v.dist }); animateTo(v.ang); markBtn(name); }

  /* ---------- wire up the controls ---------- */
  Object.keys(btns).forEach((n) => btns[n].addEventListener("click", () => go(n)));
  slider.addEventListener("input", (e) => { if (S.anim) cancelAnimationFrame(S.anim); if (S.setFold) S.setFold(+e.target.value); markBtn(null); });
  $("zoom-in").addEventListener("click", () => zoom(0.85));
  $("zoom-out").addEventListener("click", () => zoom(1 / 0.85));

  document.querySelectorAll("[data-finish]").forEach((b) => b.addEventListener("click", () => {
    props.finish = b.dataset.finish; applyFinish();
    document.querySelectorAll("[data-finish]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  document.querySelectorAll("[data-accent]").forEach((b) => b.addEventListener("click", () => {
    props.accent = S.accent = b.dataset.accent; repaint();
    document.querySelectorAll("[data-accent]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  $("t-backdrop").addEventListener("change", (e) => { props.backdrop = e.target.checked ? "graphite" : "studio"; applyBackdrop(); });
  $("t-backlight").addEventListener("change", (e) => { props.keyBacklight = e.target.checked; setBacklight(); });
  $("t-rotate").addEventListener("change", (e) => { props.autoRotate = e.target.checked; });
  $("t-single").addEventListener("change", (e) => { props.innerLayout = e.target.checked ? "single" : "split"; repaint(); });

  /* ---------- start ---------- */
  const v0 = views.hero; S.view = { az: v0.az, el: v0.el, dist: v0.dist }; S.cur = { ...S.view };
  applyBackdrop(); markBtn("hero");
  const wait = () => {
    if (!window.THREE || !mount.clientWidth || !mount.clientHeight) { setTimeout(wait, 40); return; }
    try { init(); } catch (err) { console.error(err); $("nogl").hidden = false; }
  };
  wait();
})();
