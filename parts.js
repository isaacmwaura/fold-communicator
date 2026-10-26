/* Fold Communicator: internal parts.
   One list drives the 3D teardown and the parts table on the page, so a size is only ever written here.
   Units are millimetres. Coordinates are "front coords" for each half (leaf):
     x = distance from the hinge edge (0) to the free edge (76.5)
     y = up from the device centre (height 123.9, so ±61.95)
     z = depth from the inner screen face (0) outward to the back (negative numbers).
   Each leaf body is 5.4 deep; the keyboard half's raised face plate adds 1.25 (to about −6.85).
   The strip x 0 to 8.5 of each half is the hinge zone: only hinge parts (swing arms, door plates) and ribbons sit there.
   leaf: "panel" = screen half (rear cameras), "deck" = keyboard half (cover screen + keys), "spine" = hinge.
   layer: which teardown step removes it (see MODES in js/teardown.js).
   ex: the part's level in the High detail exploded view (BUILD-SPEC 7.2): + toward the inner screen side, − toward the
     back (the Simple view uses its unit's level instead).
     Parts on one level never overlap in plan view.
   r: corner radius. rh: corner radius on the hinge side, where it differs. holes: windows cut through the part.
   notch: a rectangle cut out of the outline on the free-edge side (x[1]); it is a corner cut-out when notch.y[0] = y[0]
     or notch.y[1] = y[1].
   look: the material the 3D model draws it in (BUILD-SPEC 6.1). mat stays in the old set (battery, pcb, pcbEdge, chip,
     chip2, shield, copper, coil, graphite, camera, alu, oled, kbd, steel, speaker, titanium, flex), because the parts
     table and design-notes/build-diagrams.js colour by it.
   tabEnd: the end of a battery cell with its protection board and flex tail ("top" or "bottom"); the blue pull tabs sit
     at the other end. tabs: the pull tabs' centres along x.
   slide: extra High detail exploded-view move [x, y, z] in front coords (the deck mirrors x), for parts that leave
     sideways.
   render: "flex" = a ribbon cable that js/teardown.js draws from the flexes list below (no box of its own).
   skipTable: left out of the parts table. label: gets a label in the teardown views (not the Simple exploded view,
     which labels units). short: the label's text (name stays for the card, the table and the label's aria-label).
   unit: the sub-assembly the part comes out of the phone in, as a teardown shows it (the units list below). The
     Simple exploded view moves each unit as one piece and labels the unit; the High detail view moves each part on
     its own. (Not `group`: that is the parts table's section.)
   flexes: the ribbon cables, as end points on the parts they join (see the note above the list).
   units: the sub-assemblies (see the note above the list). detail: which small pieces only High detail draws.
   tag: FACT = published figure; INFERENCE = worked out from published figures; CHECK = not confirmed. */
(function () {
  "use strict";

  const SOURCES = {
    qcBrief:   { t: "Qualcomm, Snapdragon 8 Elite Extreme Gen 6 product brief", u: "https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Snapdragon-8-Elite-Extreme-Gen-6-Product-Brief.pdf" },
    nbcPkg:    { t: "Notebookcheck, Gen 6 package and die size", u: "https://www.notebookcheck.net/Exclusive-12-6-x-10-67-mm-That-s-the-size-of-Qualcomm-s-next-flagship-chip-and-we-know-more.1352224.0.html" },
    blade:     { t: "ProPakistani, Honor Blade battery over 900 Wh/L", u: "https://propakistani.pk/2026/03/02/honors-new-blade-battery-tech-has-over-900wh-l-density/amp/" },
    xataka:    { t: "Xataka Móvil, the energy-density race", u: "https://www.xatakamovil.com/movil-y-sociedad/nueva-carrera-baterias-no-mah-sino-densidad-energetica-silicio-carbono-esta-activando" },
    air:       { t: "GSMArena, iPhone Air teardown thicknesses", u: "https://m.gsmarena.com/iphone_air_teardown_video_focuses_on_how_thin_the_components_are-amp-69726.php" },
    v3:        { t: "Notebookcheck, Honor Magic V3 teardown", u: "https://www.notebookcheck.net/Teardown-video-of-the-Honor-Magic-V3-shows-the-inner-workings-of-the-4-4-mm-thin-foldable-flagship.865003.0.html" },
    xf3:       { t: "GSMArena, vivo X Fold3 Pro teardown", u: "https://m.gsmarena.com/vivo_x_fold3_pro_teardown_reveals_the_insides_of_the_thinnest_foldable_to_date-news-62185.php" },
    xf6:       { t: "91mobiles, vivo X Fold 6 launch specs", u: "https://www.91mobiles.com/hub/vivo-x-fold-6-launched-7000mah-battery-200mp-camera-price-specifications/" },
    v6:        { t: "PhoneArena, Honor Magic V6 specs", u: "https://www.phonearena.com/phones/Honor-Magic-V6_id12958" },
    fold8:     { t: "Android Authority, iFixit Galaxy Z Fold 8 teardown", u: "https://androidauthority.com/samsung-galaxy-z-fold-8-ifixit-teardown-repairability-3698202" },
    jre8:      { t: "9to5Google, JerryRigEverything Fold 8 teardown", u: "https://9to5google.com/2026/08/11/galaxy-z-fold-8-bend-test-teardown/" },
    utg:       { t: "Samsung Display, 30 µm Ultra Thin Glass", u: "https://www.businesswire.com/news/home/20200218006204/en/" },
    optical:   { t: "Wikipedia, optical format (sensor size names)", u: "https://en.wikipedia.org/wiki/Optical_format" },
    usb:       { t: "Wikipedia, USB connector dimensions", u: "https://en.wikipedia.org/wiki/USB_hardware" },
    duoSpk:    { t: "Android Authority, iPhone Duo and Galaxy Z Fold 8 stereo speakers", u: "https://www.androidauthority.com/iphone-duo-galaxy-z-fold-8-stereo-speaker-3709819/" },
    x18aa:     { t: "Android Authority, Xiaomi 18 Fold images leaked (inner punch-hole near the upper-right corner)", u: "https://www.androidauthority.com/xiaomi-18-fold-images-leaked-3702650/" },
    x18nbc:    { t: "Notebookcheck, Xiaomi 18 Fold review", u: "https://www.notebookcheck.net/Xiaomi-18-Fold-review-Big-display-big-performance-big-compromises.1428903.0.html" },
    wkF7:      { t: "WekiHome, Galaxy Z Fold 7 teardown (video)", u: "https://www.youtube.com/watch?v=hECufaIkxAg" },
    wkV6:      { t: "WekiHome, Honor Magic V6 teardown (video)", u: "https://www.youtube.com/watch?v=Dvl-L9OfJFs" },
    jreF8:     { t: "JerryRigEverything, Galaxy Z Fold 8 teardown (video)", u: "https://www.youtube.com/watch?v=oQcw9ZZ_PxQ" },
    jreClk:    { t: "JerryRigEverything, Clicks keyboard for iPhone teardown (video)", u: "https://www.youtube.com/watch?v=Qqp1ClBm-_I" },
    ifxP10:    { t: "iFixit, Pixel 10 Pro Fold battery replacement", u: "https://www.ifixit.com/Guide/Google+Pixel+10+Pro+Fold+Flip+and+Base+Battery+Replacement/203251" },
    ifxBB:     { t: "iFixit, BlackBerry Bold 9900 keyboard replacement", u: "https://www.ifixit.com/Guide/Blackberry+Bold+9900+Keyboard+Replacement/103943" },
    us8308336: { t: "US patent 8,308,336, phone keypad with light guide and dome sheet", u: "https://patents.google.com/patent/US8308336" },
    nelsonDomes: { t: "Nelson-Miller, metal dome arrays", u: "https://nelson-miller.com/dome-arrays/" },
    v6rev:     { t: "GSMArena, Honor Magic V6 review (keys on the right edge, fingerprint in the power key)", u: "https://gsmarena.com/honor_magic_v6-review-2968p2.php" }
  };

  /* Battery maths: cell volume × energy density ÷ nominal voltage. A notch (the corner left for the bottom speaker)
     is taken off the volume. */
  const CELL = { whPerL: 900, volts: 3.89 };
  const mAh = (x, y, z, n) => {
    const area = (x[1] - x[0]) * (y[1] - y[0]) - (n ? (n.x[1] - n.x[0]) * (n.y[1] - n.y[0]) : 0);
    return Math.round(area * (z[1] - z[0]) * CELL.whPerL / 1e6 / CELL.volts * 1000);
  };

  const P = [];
  const add = (o) => { P.push(o); return o; };

  /* ---------- screen half (panel) ---------- */
  add({ id: "inner-oled-p", name: "Inner foldable OLED", short: "Inner screen", unit: "inner-screen", leaf: "panel", x: [7.05, 74.5], y: [-59.95, 59.95], z: [-0.5, -0.13], r: 7, rh: 0.3, mat: "oled", look: "oledBack", layer: "screen", ex: 4, label: true, group: "Displays",
    holes: [{ x: [67.4, 70.6], y: [53.4, 56.6], r: 1.6 }],
    what: "The big inside screen. It is a plastic OLED panel glued to a thin metal backing plate, under a sheet of bendable glass. One panel runs across both halves and bends at the hinge. Its driver chip sits on a flex folded over the bottom edge, and a hole in the top-right corner lets the selfie camera see out.",
    spec: "7.5-inch LTPO OLED, 2364 × 1902 (≈403 ppi), 1–120 Hz, ultra-thin glass on top",
    tag: "INFERENCE", src: ["utg", "v6"] });
  add({ id: "inner-oled-d", name: "Inner foldable OLED (keyboard half)", unit: "inner-screen", leaf: "deck", x: [7.05, 74.5], y: [-59.95, 59.95], z: [-0.5, -0.13], r: 7, rh: 0.3, mat: "oled", look: "oledBack", layer: "screen", ex: 4, group: "Displays", skipTable: true });
  add({ id: "midframe-p", name: "Mid-frame", short: "Mid-frame", unit: "midframes", leaf: "panel", x: [10.8, 74.5], y: [-60, 60], z: [-0.85, -0.5], r: 7, rh: 0.5, mat: "alu", look: "alu", layer: "midframe", ex: 2, label: true, group: "Structure",
    holes: [{ x: [13, 70], y: [-54, 0], r: 3 }, { x: [13, 44], y: [12, 50], r: 3 }, { x: [66.7, 71.3], y: [52.7, 57.3], r: 2.3 },
      { x: [11.4, 40.6], y: [-59.4, -56.4], r: 0.8 }],
    what: "An aluminium plate inside each half. The inner screen rests on it and the parts hang off it. It is the phone's skeleton. Here it stops short of the hinge, where the hinge's door plates hold up the screen, and has a round hole for the selfie camera and a slot for the screen's flex cable.",
    spec: "Aluminium, 0.35 thick, with windows over the battery and board",
    tag: "INFERENCE", src: ["air", "wkV6"] });
  add({ id: "midframe-d", name: "Mid-frame (keyboard half)", unit: "midframes", leaf: "deck", x: [10.8, 74.5], y: [-60, 60], z: [-0.85, -0.5], r: 7, rh: 0.5, mat: "alu", look: "alu", layer: "midframe", ex: 2, group: "Structure", skipTable: true,
    holes: [{ x: [13, 70], y: [-15, 46], r: 3 }, { x: [13, 70], y: [-56, -24], r: 3 }] });

  // battery cell A: hinge zone kept clear (x from 8.5), bottom-right corner left for the bottom speaker
  const bP = { x: [8.5, 73], y: [-58, 4], z: [-4.3, -0.9], notch: { x: [45, 73], y: [-58, -47.6] } };
  add({ id: "battery-p", name: "Battery cell A", short: "Battery A", unit: "battery", leaf: "panel", x: bP.x, y: bP.y, z: bP.z, r: 1.5, notch: bP.notch, tabEnd: "top", tabs: [25, 38], mat: "battery", look: "pouch", layer: "internal", ex: 0, label: true, group: "Power",
    mAh: mAh(bP.x, bP.y, bP.z, bP.notch),
    what: "One of two battery cells: a sealed foil pouch under a printed label. It fills the lower part of the screen half, with one corner left for the bottom speaker. The protection board sits under black tape at its top end, where the flex cable leaves; the blue tabs at the other end are stretch-release tapes for taking it out. The anode (the side that stores charge) is part silicon instead of pure graphite, so it holds more per millimetre.",
    spec: "Silicon-carbon pouch, 3.4 thick, corner notch for the speaker", tag: "INFERENCE", src: ["blade", "xataka", "wkV6"],
    note: "Real 2026 foldable cells are 2.5–2.9 thick (Honor Magic V6). These are deeper because each half here is 5.4 deep." });
  const bD = { x: [8.5, 73], y: [-19, 50], z: [-4.7, -0.9] };
  add({ id: "battery-d", name: "Battery cell B", short: "Battery B", unit: "battery", leaf: "deck", x: bD.x, y: bD.y, z: bD.z, r: 1.5, tabEnd: "bottom", tabs: [25, 55], mat: "battery", look: "pouch", layer: "internal", ex: 0, label: true, group: "Power",
    mAh: mAh(bD.x, bD.y, bD.z),
    what: "The bigger cell, a sealed foil pouch behind the cover screen in the keyboard half, which has a little more depth to spare. Its protection board and flex tail are at the bottom end, its blue pull tabs at the top.",
    spec: "Silicon-carbon pouch, 3.8 thick", tag: "INFERENCE", src: ["blade", "xataka", "wkV6"] });

  // stacked ("sandwich") main board: two boards joined by a ring-shaped spacer (interposer)
  const boardNotch = { x: [32, 47], y: [26, 40] };
  add({ id: "board-lo", name: "Main board, lower layer", unit: "motherboard", leaf: "panel", x: [8.5, 47], y: [8, 53], z: [-1.45, -0.9], r: 2, mat: "pcb", look: "pcb", layer: "internal", ex: 0, group: "Compute", notch: boardNotch, skipTable: true });
  add({ id: "interposer", name: "Board spacer (interposer)", unit: "motherboard", leaf: "panel", x: [8.5, 47], y: [8, 53], z: [-2.85, -1.45], r: 2, mat: "pcbEdge", look: "pcb", layer: "internal", ex: -0.7, group: "Compute", notch: boardNotch,
    holes: [{ x: [11, 30.5], y: [10.5, 50.5], r: 1.5 }], skipTable: true });
  add({ id: "board-up", name: "Main board (stacked)", short: "Main board", unit: "motherboard", leaf: "panel", x: [8.5, 47], y: [8, 53], z: [-3.4, -2.85], r: 2, mat: "pcb", look: "pcb", layer: "internal", ex: -1.4, label: true, group: "Compute", notch: boardNotch,
    what: "Two small circuit boards stacked like a sandwich, with a ring-shaped spacer between them. Stacking halves the footprint, which leaves more room for battery. A notch lets the zoom camera pass through. Metal shield cans cover the radio chips, and every flex cable plugs into a press-fit connector held down by a steel bracket.",
    spec: "Two boards + interposer, 2.5 tall in total", tag: "FACT", src: ["xf3", "v3"] });
  add({ id: "soc", name: "Snapdragon 8 Elite Extreme Gen 6", short: "Main chip", unit: "motherboard", leaf: "panel", x: [9.5, 30.7], y: [37, 51], z: [-4.0, -3.4], r: 0.6, mat: "chip", look: "chip", layer: "internal", ex: -2.1, label: true, group: "Compute",
    what: "The main chip (system-on-chip): processor, graphics, AI unit, camera processor and the 5G modem in one package.",
    spec: "SM8975, 2 nm. 2 cores to 5.0 GHz + 6 to 4.0 GHz. X105 5G modem. 8K 60 fps video",
    tag: "FACT", src: ["qcBrief", "nbcPkg"], note: "Package size 21.2 × 14 comes from Notebookcheck's reading of Qualcomm's drawing (CHECK)." });
  add({ id: "ram", name: "LPDDR6 memory", short: "Memory", unit: "motherboard", leaf: "panel", x: [13.1, 27.1], y: [37, 51], z: [-4.5, -4.0], r: 0.6, mat: "chip2", look: "chip", layer: "internal", ex: -2.7, label: true, group: "Compute",
    what: "Working memory, drawn stacked on top of the main chip (package-on-package), which is how recent flagship phones save board space.",
    spec: "12 GB or 16 GB LPDDR6 (chip supports up to 24 GB, 5300 MHz)", tag: "CHECK", src: ["qcBrief"],
    note: "Qualcomm confirms LPDDR6 support. Whether Gen 6 memory sits on top of the chip or beside it is not confirmed." });
  add({ id: "ufs", name: "Storage (UFS 5.0)", short: "Storage", unit: "motherboard", leaf: "panel", x: [31.2, 42.2], y: [40.5, 52.5], z: [-4.0, -3.4], r: 0.6, mat: "chip", look: "chip", layer: "internal", ex: -2.1, label: true, group: "Compute",
    what: "The phone's long-term storage, like an SSD in a laptop.", spec: "256 GB or 512 GB, UFS 5.0", tag: "FACT", src: ["qcBrief"],
    note: "UFS 5.0 support is in Qualcomm's brief. Drawn 11 × 12, close to the common 11 × 13 UFS package, to leave room for the connectors beside it (CHECK)." });
  add({ id: "pmic", name: "Power management chip", short: "Power chip", unit: "motherboard", leaf: "panel", x: [14.2, 22.2], y: [26, 34], z: [-3.9, -3.4], r: 0.5, mat: "chip", look: "chip", layer: "internal", ex: -2.1, label: true, group: "Power",
    what: "Turns the battery's single voltage into the dozens of voltages the other chips need, and runs charging.", spec: "Typical 8 × 8 package", tag: "CHECK", src: [] });
  add({ id: "rf", name: "5G radio front-end", short: "5G radio", unit: "motherboard", leaf: "panel", x: [18, 28], y: [12, 22], z: [-4.4, -3.4], r: 0.5, mat: "shield", look: "shieldCan", layer: "internal", ex: -2.1, label: true, group: "Connectivity",
    what: "Amplifiers and filters between the modem inside the main chip and the antennas in the metal frame. Shown under its stamped metal shield can.",
    spec: "For the X105 modem: 14.8 Gbps down, 4.2 Gbps up, satellite-ready", tag: "FACT", src: ["qcBrief"] });
  add({ id: "wifi", name: "Wi-Fi 8 / Bluetooth chip", short: "Wi-Fi / Bluetooth", unit: "motherboard", leaf: "panel", x: [31, 39], y: [12, 20], z: [-4.4, -3.4], r: 0.5, mat: "shield", look: "shieldCan", layer: "internal", ex: -2.1, label: true, group: "Connectivity",
    what: "Wi-Fi, Bluetooth, ultra-wideband (precise location for tags and car keys) and Thread (smart-home radio). Shown under its shield can.",
    spec: "FastConnect 8800: Wi-Fi 8-ready, Bluetooth 6.3, UWB", tag: "FACT", src: ["qcBrief"] });
  add({ id: "can-x", name: "Shield can", unit: "motherboard", leaf: "panel", x: [41.6, 46.5], y: [9, 19.6], z: [-4.3, -3.4], r: 0.5, mat: "shield", look: "shieldCan", layer: "internal", ex: -2.1, group: "Compute", skipTable: true });
  add({ id: "vc", name: "Vapour chamber", short: "Vapour chamber", unit: "motherboard", leaf: "panel", x: [9, 31], y: [9, 53], z: [-4.9, -4.6], r: 2, mat: "copper", look: "vc", layer: "internal", ex: -3.3, label: true, group: "Thermal",
    what: "A flat sealed metal pouch with a little water inside. The chip boils the water, the vapour spreads the heat across the plate, then condenses and wicks back. It moves heat away from the chip much faster than solid copper. The dot pattern is the pillars that hold the two skins apart.",
    spec: "0.3 thick", tag: "INFERENCE", src: ["v3", "xf3", "wkV6"], note: "Honor's Magic V3 used a 0.22 mm vapour chamber." });

  // rear cameras (under the island near the free edge, top of the screen half); they sit on a steel bracket
  add({ id: "cam-main", name: "Main camera, 200 MP", short: "Main camera", unit: "rear-cams", leaf: "panel", x: [55.6, 69.6], y: [38.6, 52.6], z: [-7.3, -1.3], r: 1.5, mat: "camera", look: "cameraBody", layer: "internal", ex: -1.4, label: true, group: "Cameras",
    what: "The main camera. Its tall stack of lenses is why the camera bump exists: the module is about 6 mm tall and the half is only 5.4 deep.",
    spec: "200 MP, 1/1.4-type sensor (≈11.4 mm diagonal), f/1.7, optical stabilisation", tag: "FACT", src: ["xf6", "optical"],
    note: "Sensor spec matches the vivo X Fold 6. The 14 × 14 × 6 module size is an estimate (CHECK)." });
  add({ id: "cam-prism", name: "Zoom camera prism", unit: "rear-cams", leaf: "panel", x: [56.6, 68.6], y: [27.4, 38.4], z: [-7.1, -1.3], r: 1, mat: "camera", look: "periscope", layer: "internal", ex: -1.4, group: "Cameras", skipTable: true });
  add({ id: "cam-tele", name: "3× periscope zoom, 50 MP", short: "Zoom camera", unit: "rear-cams", leaf: "panel", x: [33, 56.6], y: [28, 38], z: [-5.3, -1.3], r: 1.5, mat: "camera", look: "periscope", layer: "internal", ex: -1.4, label: true, group: "Cameras",
    what: "A zoom camera lying on its side, in a champagne-coloured metal housing. A prism under the middle lens turns the light 90° so the long lens fits along the phone instead of through it.",
    spec: "50 MP Sony LYT-602 (1/1.95-type), 3× optical, stabilised", tag: "FACT", src: ["xf6"],
    note: "Module length is an estimate (CHECK)." });
  add({ id: "cam-uw", name: "Ultra-wide camera, 50 MP", short: "Ultra-wide camera", unit: "rear-cams", leaf: "panel", x: [57, 68], y: [14.9, 25.9], z: [-6.7, -1.3], r: 1.5, mat: "camera", look: "cameraBody", layer: "internal", ex: -1.4, label: true, group: "Cameras",
    what: "The wide-angle camera, also used for close-up (macro) shots.", spec: "50 MP, f/2.0, autofocus", tag: "FACT", src: ["xf6"] });
  add({ id: "cam-bracket", name: "Camera bracket", unit: "rear-cams", leaf: "panel", x: [54.6, 70.6], y: [13.9, 53.6], z: [-1.3, -1.0], r: 1, mat: "steel", look: "steelBracket", layer: "internal", ex: -1.4, group: "Cameras", skipTable: true,
    notch: { x: [66.6, 70.6], y: [52.75, 53.6] },
    holes: [{ x: [58.1, 67.1], y: [41.1, 50.1], r: 1 }, { x: [59.1, 66.1], y: [29.4, 36.4], r: 1 }, { x: [59, 66], y: [16.9, 23.9], r: 1 }] });
  add({ id: "cam-udc", name: "Inner selfie camera (punch-hole)", short: "Inner selfie camera", unit: "selfie", leaf: "panel", x: [66.9, 71.1], y: [52.9, 57.1], z: [-3.4, -0.55], r: 0.8, mat: "camera", look: "cameraBody", layer: "internal", ex: 1, label: true, group: "Cameras",
    what: "The camera for video calls with the phone open. It looks out through a small punch-hole in the top-right corner of the inner screen, as on the Xiaomi 18 Fold, through holes in the screen and the mid-frame.",
    spec: "Punch-hole camera, Ø3.2 opening, 5.5 from the screen's right edge", tag: "INFERENCE", src: ["x18aa", "x18nbc"],
    note: "Xiaomi has not published the hole's size or distance from the edges; these are estimated from photos (CHECK)." });

  add({ id: "speaker-bot", name: "Loudspeaker, bottom (screen half)", short: "Speaker (bottom)", unit: "speakers", leaf: "panel", x: [46, 67], y: [-58.6, -48.6], z: [-4.0, -1.0], r: 1.5, mat: "speaker", look: "speakerBox", layer: "internal", ex: -0.7, label: true, group: "Audio & haptics",
    what: "A sealed plastic box with a small speaker driver, firing out of the bottom edge of the screen half. With the top speaker at the top of the keyboard half, the two sit at opposite corners, as on the iPhone Duo, so the sound stays stereo whichever way the phone is held.",
    spec: "Box speaker, 21 × 10 × 3", tag: "INFERENCE", src: ["duoSpk", "wkF7", "jreF8"] });
  add({ id: "coil", name: "Wireless charging coil + NFC", short: "Charging coil", unit: "coil", leaf: "panel", cx: 38.5, cy: -27, rad: 22, z: [-4.97, -4.75], mat: "coil", look: "ferrite", layer: "back", ex: -4.6, label: true, group: "Power",
    what: "A flat copper spiral on a black ferrite sheet. A charging pad's magnetic field induces current in the spiral. The outer loop is the NFC antenna for tap-to-pay.",
    spec: "50 W wireless charging, 0.22 thick", tag: "INFERENCE", src: ["v3", "wkF7"], note: "Honor's coil is 0.25 mm thinner than most rivals' (Magic V3). Samsung's Fold 7 coil sheet measures 0.222 mm." });
  add({ id: "graphite-p", name: "Graphite heat spreader", short: "Graphite sheet", unit: "graphite", leaf: "panel", x: [3, 74], y: [-59, 5], z: [-5.15, -5.05], r: 5, mat: "graphite", look: "graphite", layer: "back", ex: -4.0, label: true, group: "Thermal",
    what: "A paper-thin graphite sheet that spreads heat sideways so no spot on the back gets hot.", spec: "0.1–0.17 thick", tag: "FACT", src: ["v3"] });
  add({ id: "fp", name: "Fingerprint sensor (power key)", short: "Fingerprint key", unit: "side-keys", leaf: "panel", x: [72.6, 75.2], y: [8.5, 19.5], z: [-3.6, -1.8], r: 0.6, mat: "chip", look: "chip", layer: "internal", ex: 0, slide: [6, 0, 0], label: true, group: "Input",
    what: "A capacitive fingerprint reader built into the power key, on the free edge of the screen half (the right half when the phone is open), where book foldables put it.",
    spec: "Side-mounted, in the power key", tag: "INFERENCE", src: ["v6rev"] });

  /* ---------- keyboard half (deck) ---------- */
  add({ id: "graphite-d", name: "Graphite heat spreader (keyboard half)", unit: "graphite", leaf: "deck", x: [3, 74], y: [-21, 52], z: [-5.15, -5.05], r: 5, mat: "graphite", look: "graphite", layer: "back", ex: -2.1, group: "Thermal", skipTable: true });
  add({ id: "cover-oled", name: "Cover screen OLED", short: "Cover screen", unit: "cover-screen", leaf: "deck", x: [3.4, 73.1], y: [-21.65, 58.35], z: [-6.75, -6.4], r: 6.3, mat: "oled", look: "copperFoil", layer: "coverscreen", ex: -4.4, label: true, group: "Displays",
    holes: [{ x: [36.75, 39.75], y: [53.35, 56.35], r: 1.5 }],
    what: "The outside screen you use when the phone is shut. It sits above the keyboard under its own toughened glass. Its back is covered in copper foil that spreads heat and screens out radio noise.",
    spec: "4.2-inch LTPO OLED, 1106 × 1269 (≈403 ppi), 1–120 Hz", tag: "INFERENCE", src: ["v6", "ifxP10"] });
  // keyboard stack, from the keys inward (BUILD-SPEC 6.5; R3 §5): mat, light guide, domes, switch flex, steel backer
  const KX = [3.4, 73.1], KY = [-52.4, -24.2];
  add({ id: "kbd-mat", name: "Key mat (silicone)", short: "Key mat", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-5.58, -5.36], r: 2, mat: "kbd", look: "siliconeMat", layer: "internal", ex: -4.4, label: true, group: "Input",
    what: "A thin silicone sheet the keycaps sit on. A small nub under each key presses its metal dome. The keys come out of the phone as one piece on this mat.",
    spec: "0.22 thick, one actuator nub per key", tag: "INFERENCE", src: ["jreClk", "us8308336"] });
  add({ id: "kbd-lgf", name: "Light-guide film", short: "Light guide", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-5.36, -5.21], r: 2, mat: "oled", look: "lgf", layer: "internal", ex: -3.8, label: true, group: "Input",
    what: "A clear film that carries light from two tiny LEDs at its edge and spreads it evenly under all the keys, so the legends glow. It has a hole for each key's nub.",
    spec: "0.15 thick, edge-lit by 2 side-emitting LEDs", tag: "CHECK", src: ["us8308336"],
    note: "No teardown of a keyboard phone shows the light guide; its thickness comes from a keypad patent and makers' figures." });
  add({ id: "kbd-domes", name: "Metal dome sheet", short: "Dome sheet", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-5.21, -4.96], r: 2, mat: "kbd", look: "domeSteel", layer: "internal", ex: -3.2, label: true, group: "Input",
    what: "A carrier sheet holding a small stainless-steel dome under every key. Pressing a key snaps its dome flat onto the circuit below, which closes the switch and gives the click.",
    spec: "37 domes, Ø4.6 with four legs, on a 0.08 carrier", tag: "INFERENCE", src: ["us8308336", "nelsonDomes", "jreClk"] });
  add({ id: "kbd", name: "Keyboard switch flex", short: "Switch flex", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-4.96, -4.84], r: 2, mat: "kbd", look: "flexBlack", layer: "internal", ex: -2.6, label: true, group: "Input",
    what: "A thin flexible circuit with a gold contact ring under every dome, under a black cover film. A tail at its bottom edge plugs into the sub-board.",
    spec: "37 keys (3 rows of 10 and a bottom row of 7 with a wide space bar), metal-dome switches, backlit", tag: "INFERENCE", src: ["us8308336", "ifxBB"] });
  add({ id: "kbd-backer", name: "Keyboard stiffener", short: "Stiffener", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-4.84, -4.69], r: 2, mat: "steel", look: "steelSatin", layer: "internal", ex: -2.1, label: true, group: "Input",
    what: "A thin stainless-steel plate behind the switch flex. It gives the domes something firm to press against, so every key feels the same. Four screw tabs hold the stack in place.",
    spec: "0.15 thick stainless steel", tag: "INFERENCE", src: ["us8308336", "ifxBB"] });
  add({ id: "subboard", name: "Sub-board", short: "Sub-board", unit: "subboard", leaf: "deck", x: [20, 46], y: [-59.2, -45], z: [-4.65, -4.2], r: 1.5, mat: "pcb", look: "pcb", layer: "internal", ex: -1.4, label: true, group: "Compute",
    what: "A small second board at the bottom of the keyboard half. It carries the USB-C port, a microphone and the speaker amplifier. The battery, cover screen, keyboard, vibration motor and top speaker plug into it, and two flex cables through the hinge link it to the main board.",
    spec: "", tag: "INFERENCE", src: ["v3"] });
  add({ id: "usb", name: "USB-C port", short: "USB-C port", unit: "subboard", leaf: "deck", x: [33.8, 42.7], y: [-61.75, -54.25], z: [-4.2, -1.2], r: 1.2, mat: "steel", look: "steelCan", layer: "internal", ex: -0.7, label: true, group: "Power",
    what: "The charging and data socket.", spec: "USB 3.1 Gen 2, 80 W wired charging. Opening 8.34 × 2.56, 7.5 deep", tag: "CHECK", src: ["usb", "qcBrief"] });
  add({ id: "speaker-top", name: "Loudspeaker, top (keyboard half)", short: "Speaker (top)", unit: "speakers", leaf: "deck", x: [44, 66], y: [50.8, 59.0], z: [-4.0, -1.0], r: 1.5, mat: "speaker", look: "speakerBox", layer: "internal", ex: -0.7, label: true, group: "Audio & haptics",
    what: "A sealed plastic box with a small speaker driver, firing out of the top edge of the keyboard half. It also works as the earpiece: the slot above the cover screen sits over it.",
    spec: "Box speaker, 22 × 8.2 × 3", tag: "INFERENCE", src: ["duoSpk", "wkF7", "jreF8"] });
  add({ id: "haptic", name: "Vibration motor", short: "Vibration motor", unit: "subboard", leaf: "deck", x: [9, 24], y: [-57, -49], z: [-3.5, -1.0], r: 1, mat: "steel", look: "steelCan", layer: "internal", ex: -0.7, label: true, group: "Audio & haptics",
    what: "A weight on springs that a magnet shakes side to side, in a steel case. It makes the crisp taps you feel when typing on the screen.",
    spec: "X-axis linear motor, 15 × 8 × 2.5", tag: "INFERENCE", src: ["wkF7"], note: "Sized from the Galaxy Z Fold 7's motor, 8 × 15 × 2.33." });
  add({ id: "cam-cover", name: "Cover selfie camera", short: "Cover selfie camera", unit: "selfie", leaf: "deck", x: [35.25, 41.25], y: [52, 58], z: [-6.6, -1.5], r: 1.2, mat: "camera", look: "cameraBody", layer: "internal", ex: 0, label: true, group: "Cameras",
    what: "The front camera in the cover screen's punch-hole.", spec: "20 MP", tag: "FACT", src: ["xf6"] });
  add({ id: "mmwave", name: "mmWave antenna module", short: "mmWave antenna", unit: "antenna", leaf: "deck", x: [9, 31], y: [53, 57], z: [-3.0, -1.2], r: 0.8, mat: "shield", look: "shieldCan", layer: "internal", ex: 0, label: true, group: "Connectivity",
    what: "A tiny antenna array for the fastest, shortest-range kind of 5G. It needs its own module because these radio waves can't travel through the metal frame.",
    spec: "Qualcomm QTM565", tag: "FACT", src: ["qcBrief"], note: "Module size is an estimate (CHECK)." });

  /* ---------- hinge (spine). Spine-local coords; js/hinge.js builds them (BUILD-SPEC 6.2) ---------- */
  [[31, 55], [-12, 12], [-55, -31]].forEach((h, i) => add({
    id: "hinge-" + i, name: "Hinge module", short: "Hinge module", unit: "hinge", leaf: "spine", x: [-3.58, 3.58], y: [h[0], h[1]], z: [-4.93, -3.3], r: 0.4, mat: "titanium", look: "steelDark", layer: "internal", ex: -1.5, label: i === 1, group: "Structure", skipTable: i !== 1,
    what: "Three modules keep both halves moving together and hold the phone at any angle. Each is a steel housing block with four detent springs and a cam; the middle one also has two rows of gears. Swing arms screwed to each half ride on curved rails beside it, so each half turns about its own axis behind the screen. The screen bends into a pocket inside the hinge, which keeps the crease shallow.",
    spec: "Steel housings, springs, cams and gears; teardrop (\"waterdrop\") fold", tag: "INFERENCE", src: ["jre8", "fold8", "wkV6"] }));
  add({ id: "hinge-cover", name: "Hinge cover (spine)", short: "Hinge cover", unit: "hinge-cover", leaf: "spine", x: [-4.76, 4.76], y: [-61.85, 61.85], z: [-5.58, -1.82], r: 1.8, mat: "titanium", look: "hingeCover", layer: "back", ex: -5.5, label: true, group: "Structure",
    what: "The metal shell over the hinge. Shut, it is the flat-topped spine, standing 1.9 mm proud of the halves; open, only a 3 mm strip of it shows between their back plates.",
    spec: "Brushed metal shell, 0.5 wall", tag: "INFERENCE", src: ["jre8", "fold8"] });
  add({ id: "hinge-beam", name: "Hinge centre beam", unit: "hinge", leaf: "spine", x: [-3.12, 3.12], y: [-58, 58], z: [-4.93, -3.75], r: 0.5, mat: "titanium", look: "steelDark", layer: "internal", ex: -3.0, group: "Structure", skipTable: true });
  add({ id: "hinge-plates", name: "Hinge door plates", unit: "hinge", leaf: "spine", x: [3.05, 10.6], y: [-54, 54], z: [-0.75, -0.5], r: 0.5, mat: "steel", look: "plateBlack", layer: "midframe", ex: 3, group: "Structure", skipTable: true });
  [[22.5, 30.5], [12.5, 20.5]].forEach((y, i) => add({
    id: "flex-" + i, name: "Hinge flex cables", short: "Hinge flex cables", unit: "hinge-flex", leaf: "spine", x: [-6.2, 6.2], y: y, z: [-4.55, -2.8], r: 0.5, mat: "flex", render: "flex", layer: "internal", ex: 0, label: i === 0, group: "Structure", skipTable: i !== 0,
    what: "Two wide amber ribbon cables that carry power and data from the main board, round the hinge, to the keyboard half: one to the mmWave antenna, one to the sub-board. They pass between the hinge modules and bend every time the phone opens.",
    spec: "Polyimide flex, 8 wide, 0.12 thick", tag: "INFERENCE", src: ["fold8", "wkV6"] }));

  /* ---------- flex cables (drawn by js/teardown.js, BUILD-SPEC 6.5 item 2 and 7.3) ----------
     from / to: { part, at, n, w }. at = where the ribbon leaves its connector, in front coords of that part's half
     (spine-local for the spine). n = the direction it leaves in. w = its width axis.
     via: points of the assembled route, each { leaf: "panel" | "deck" | "spine", at: [x, y, z] in that group's coords,
     w (optional) }. The width axis is interpolated between the points that set one.
     width (mm); color "amber" or "black"; part: a parts.js id for the ribbon's label and card, or null.
     Board ends (board-up, subboard) sit on a press-fit connector under a steel bracket (js/internals.js). */
  const X = [1, 0, 0], Y = [0, 1, 0], nX = [-1, 0, 0], nY = [0, -1, 0], D45 = [0.7071, 0.7071, 0], D45b = [0.7071, -0.7071, 0];
  /* the hinge crossing (hinge v2): from each half up over the spine cover's rim, where the wing plates leave a gap for
     it (js/hinge.js), down inside the cover and along its floor, under the centre plate and the screen's loop. Open,
     the ribbon lies in a deep U inside the cover; shut, it makes a U round the bottom of the spine. */
  const cross = (y) => [{ leaf: "panel", at: [7.9, y, -3.3], w: Y }, { leaf: "panel", at: [6.3, y, -1.8], w: Y }, { leaf: "panel", at: [5.0, y, -1.42], w: Y },
    { leaf: "panel", at: [3.95, y, -1.72], w: Y }, { leaf: "spine", at: [2.9, y, -2.55], w: Y }, { leaf: "spine", at: [2.6, y, -3.9], w: Y },
    { leaf: "spine", at: [1.6, y, -4.45], w: Y }, { leaf: "spine", at: [-1.6, y, -4.45], w: Y }, { leaf: "spine", at: [-2.6, y, -3.9], w: Y },
    { leaf: "spine", at: [-2.9, y, -2.55], w: Y }, { leaf: "deck", at: [3.95, y, -1.72], w: Y }, { leaf: "deck", at: [5.0, y, -1.42], w: Y },
    { leaf: "deck", at: [6.3, y, -1.8], w: Y }];
  const flexes = [
    { id: "fx-batt-p", width: 5, color: "amber", part: null,
      from: { part: "battery-p", at: [24, 4.05, -3.9], n: Y, w: X }, to: { part: "board-up", at: [24, 9.0, -3.45], n: nY, w: X },
      via: [{ leaf: "panel", at: [24, 6.6, -3.75] }] },
    { id: "fx-batt-d", width: 5, color: "amber", part: null,
      from: { part: "battery-d", at: [37.5, -19.05, -3.9], n: nY, w: X }, to: { part: "subboard", at: [37.5, -45.1, -4.15], n: Y, w: X },
      via: [{ leaf: "deck", at: [37.5, -30, -4.05] }] },
    { id: "fx-cam-main", width: 4, color: "black", part: null,
      from: { part: "cam-main", at: [55.55, 43.3, -3.45], n: nX, w: Y }, to: { part: "board-up", at: [46.9, 43.3, -3.45], n: X, w: Y }, via: [] },
    { id: "fx-cam-uw", width: 4, color: "black", part: null,
      from: { part: "cam-uw", at: [56.95, 23.0, -3.45], n: nX, w: Y }, to: { part: "board-up", at: [46.9, 23.0, -3.45], n: X, w: Y }, via: [] },
    { id: "fx-cam-tele", width: 4, color: "black", part: null,
      from: { part: "cam-tele", at: [39.5, 27.95, -3.45], n: nY, w: X }, to: { part: "board-up", at: [39.5, 25.9, -3.45], n: Y, w: X }, via: [] },
    { id: "fx-udc", width: 3, color: "black", part: null,
      from: { part: "cam-udc", at: [66.85, 55.0, -3.0], n: nX, w: Y }, to: { part: "board-up", at: [46.9, 49.8, -3.45], n: X, w: Y },
      via: [{ leaf: "panel", at: [56, 55, -3.3] }, { leaf: "panel", at: [49.5, 52, -3.45] }] },
    // the screen's driver-flex tail: down past cell A's bottom end, under the cell (left of the coil), up past its top end
    { id: "fx-oled-p", width: 6, color: "black", part: null,
      from: { part: "inner-oled-p", at: [13, -58.8, -0.62], n: [0, 0, -1], w: X }, to: { part: "board-up", at: [13, 9.5, -3.45], n: nY, w: X },
      via: [{ leaf: "panel", at: [13, -58.8, -2.6] }, { leaf: "panel", at: [13, -58.8, -4.4] }, { leaf: "panel", at: [13, -57.2, -4.68] },
        { leaf: "panel", at: [13, 2.4, -4.68] }, { leaf: "panel", at: [13, 5.4, -4.25] }, { leaf: "panel", at: [13, 7.4, -3.62] }] },
    { id: "fx-cover", width: 8, color: "amber", part: null,
      from: { part: "cover-oled", at: [60, -21.7, -6.5], n: nY, w: X }, to: { part: "subboard", at: [45.9, -49.0, -4.15], n: X, w: Y },
      via: [{ leaf: "deck", at: [60, -22.3, -6.2] }, { leaf: "deck", at: [60, -22.9, -5.3] }, { leaf: "deck", at: [60, -23.6, -4.45] },
        { leaf: "deck", at: [60, -46.0, -4.3], w: X }, { leaf: "deck", at: [53, -49.0, -4.2], w: Y }] },
    { id: "fx-kbd", width: 6, color: "amber", part: null,
      from: { part: "kbd", at: [29.6, -52.45, -4.9], n: nY, w: X }, to: { part: "subboard", at: [29.6, -59.1, -4.15], n: nY, w: X },
      via: [{ leaf: "deck", at: [29.6, -59.0, -4.92] }, { leaf: "deck", at: [29.6, -59.85, -4.55] }, { leaf: "deck", at: [29.6, -59.55, -4.17] }] },
    { id: "fx-haptic", width: 3, color: "amber", part: null,
      from: { part: "haptic", at: [23.0, -51.5, -3.55], n: X, w: Y }, to: { part: "subboard", at: [24.5, -51.5, -4.15], n: nX, w: Y }, via: [] },
    // leaves the speaker box's bottom edge downward, into the corridor behind cell B at x 67 (an exit on the box's free-
    // edge side, n +x like the sub-board end, threw the exploded loop far past the free edge, G2-06)
    { id: "fx-spk-top", width: 3, color: "amber", part: null,
      from: { part: "speaker-top", at: [64.5, 50.75, -3.8], n: nY, w: X }, to: { part: "subboard", at: [45.9, -55.6, -4.15], n: X, w: Y },
      via: [{ leaf: "deck", at: [65.6, 50.35, -4.6], w: X }, { leaf: "deck", at: [67, 48.6, -4.88], w: X },
        { leaf: "deck", at: [67, -19.6, -4.88], w: X }, { leaf: "deck", at: [67, -21.0, -4.6], w: X }, { leaf: "deck", at: [67, -23.4, -4.35], w: X },
        { leaf: "deck", at: [67, -54.0, -4.3], w: D45 }, { leaf: "deck", at: [56, -55.6, -4.2], w: Y }] },
    { id: "fx-spk-bot", width: 3, color: "amber", part: null,
      from: { part: "speaker-bot", at: [63, -49.0, -4.05], n: Y, w: X }, to: { part: "board-up", at: [37, 9.0, -3.45], n: nY, w: X },
      via: [{ leaf: "panel", at: [63, -48.0, -4.55] }, { leaf: "panel", at: [63, -46.8, -4.68] }, { leaf: "panel", at: [63, 3.0, -4.68], w: X },
        { leaf: "panel", at: [61, 5.6, -4.2], w: D45b }, { leaf: "panel", at: [45, 6.2, -3.8], w: Y }, { leaf: "panel", at: [38.5, 7.2, -3.6], w: D45 }] },
    { id: "fx-hinge-a", width: 8, color: "amber", part: "flex-0",
      from: { part: "board-up", at: [9.5, 26.5, -3.45], n: nX, w: Y }, to: { part: "mmwave", at: [14, 53.6, -3.05], n: nY, w: X },
      via: cross(26.5).concat([{ leaf: "deck", at: [7.4, 27, -3.3], w: Y }, { leaf: "deck", at: [7.6, 27.2, -4.88], w: Y },
        { leaf: "deck", at: [9.5, 30, -4.88], w: D45b }, { leaf: "deck", at: [10, 33, -4.88], w: X }, { leaf: "deck", at: [10, 49, -4.88], w: X },
        { leaf: "deck", at: [10.5, 50.6, -4.7], w: X }]) },
    { id: "fx-hinge-b", width: 8, color: "amber", part: "flex-1",
      from: { part: "board-up", at: [9.5, 16.5, -3.45], n: nX, w: Y }, to: { part: "subboard", at: [27.4, -45.1, -4.15], n: Y, w: X },
      via: cross(16.5).concat([{ leaf: "deck", at: [7.4, 16, -3.3], w: Y }, { leaf: "deck", at: [7.6, 15.8, -4.88], w: Y },
        { leaf: "deck", at: [9.5, 13, -4.88], w: D45 }, { leaf: "deck", at: [10, 10, -4.88], w: X }, { leaf: "deck", at: [10, -20, -4.88], w: X },
        { leaf: "deck", at: [12, -22.5, -2.5], w: X }, { leaf: "deck", at: [22, -42, -2.5] }]) }
  ];

  /* ---------- units: the sub-assemblies of the Simple exploded view (FABLE-REVIEW-1 F6, WP4) ----------
     Each part names its unit (unit: above); a unit's members are those parts, in list order. Fields:
     ex: the unit's level in the Simple exploded view, as parts' ex (+ toward the inner screen, − toward the back). The
       Simple view lies back up (run sheet D1), so the most negative level is the top of the stack. Units on one level
       sit side by side, or nest as they do in the phone; they never overlap.
     main: the part the label points at (its mesh decides where; a unit with no part member uses its biggest piece).
     label: one label in the Simple view. oneLabel: in the other views the members' own labels give way to one label
       for the unit (FABLE-REVIEW-1 F9). phone: keeps its label on a phone-sized viewer (at most 9 there).
     rigid: moves as one piece centred over the hinge: its members on the halves do not part sideways with them.
     slide: the unit's extra exploded move [x, y, z] in front coords, for a unit that leaves sideways.
     take: pieces with no part of their own that come out with the unit (the outside shell, screens, keycaps),
       matched in list order: { layer } (a teardown layer), { flag } (a userData flag), part: false (only pieces that
       have no part).
     what: the unit's card text; its card then lists `list` ([part id, where (or ""), what it does]) below it. A unit
       with no `what` opens its main part's own card. */
  /* the outside shell (both covers, the cover screen, the spine cover) comes off first and is laid aside beyond the
     phone's top end, as in a teardown photo: on the stack it would hide everything under it (WP4 stills) */
  const SHELL = [0, 90, 0];
  const UNITS = [
    { id: "inner-screen", name: "Inner screen", short: "Inner screen", ex: 3, main: "inner-oled-p", label: true, phone: true, rigid: true,
      take: [{ layer: "screen" }] },
    { id: "midframes", name: "Mid-frames", short: "Mid-frames", ex: 1.6, main: "midframe-p", label: true, phone: true },
    { id: "battery", name: "Battery, two cells", short: "Battery (2 cells)", ex: 0, main: "battery-p", label: true, phone: true,
      what: "Two silicon-carbon pouch cells, one in each half, joined to the boards by flex cables.",
      list: [["battery-p", "Screen half", "Fills its lower part, with one corner left for the bottom speaker"],
        ["battery-d", "Keyboard half", "Behind the cover screen, a little deeper"]] },
    { id: "speakers", name: "Loudspeakers", short: "Speakers", ex: 0, main: "speaker-bot", label: true,
      what: "Two sealed box speakers at opposite corners, so the sound stays stereo whichever way the phone is held.",
      list: [["speaker-top", "Top", "Top edge of the keyboard half; it is the earpiece too"],
        ["speaker-bot", "Bottom", "Bottom edge of the screen half"]] },
    { id: "selfie", name: "Selfie cameras", short: "Selfie cameras", ex: 0, main: "cam-udc", label: true,
      what: "The two front cameras, one for each screen.",
      list: [["cam-udc", "Inner screen", "In the top-right punch-hole, for video calls with the phone open"],
        ["cam-cover", "Cover screen", "In the punch-hole at the top, for selfies with the phone shut"]] },
    { id: "antenna", name: "mmWave antenna", short: "Antenna", ex: 0, main: "mmwave" },
    { id: "side-keys", name: "Side keys and fingerprint sensor", short: "Side keys", ex: 0, main: "fp", slide: [6, 0, 0],
      take: [{ layer: "frame" }],
      what: "The volume and power keys on the screen half's free edge. The fingerprint reader is built into the power key.",
      list: [["fp", "", "Reads your finger as you press the power key"]] },
    { id: "motherboard", name: "Motherboard", short: "Motherboard", ex: -1.3, main: "board-up", label: true, phone: true,
      what: "The main circuit board as it comes out of the phone: two boards stacked like a sandwich round a ring-shaped spacer, the chips on its outer face, and the vapour chamber over the main chip. On it:",
      list: [["soc", "", "Processor, graphics, AI unit and the 5G modem in one package"],
        ["ram", "", "Working memory, stacked on the main chip"],
        ["ufs", "", "Long-term storage, like a laptop's SSD"],
        ["pmic", "", "Makes every voltage the chips need, and runs charging"],
        ["rf", "", "Amplifiers and filters for 5G, under a metal shield can"],
        ["wifi", "", "Wi-Fi, Bluetooth, ultra-wideband and Thread, under a shield can"],
        ["vc", "", "Spreads the main chip's heat"],
        ["board-up", "", "The two stacked boards and the spacer between them"]] },
    { id: "rear-cams", name: "Rear cameras", short: "Rear cameras", ex: -1.3, main: "cam-bracket", label: true, phone: true,
      what: "The three rear cameras, in a column under the camera island, on one steel bracket. From the top:",
      list: [["cam-main", "Top", "The big sensor, for most photos and video"],
        ["cam-tele", "Middle", "Lies on its side; a prism turns the light 90°"],
        ["cam-uw", "Bottom", "Wide-angle shots and close-ups"]] },
    { id: "subboard", name: "Sub-board", short: "Sub-board", ex: -1.3, main: "subboard", label: true,
      what: "The small second board at the bottom of the keyboard half, with what plugs into it there.",
      list: [["subboard", "", "Links the keyboard half's parts to the main board"], ["usb", "", "Charging and data"],
        ["haptic", "", "The taps you feel when typing on the screen"]] },
    { id: "hinge", name: "Hinge", short: "Hinge", ex: -1.3, main: "hinge-1", label: true, phone: true, oneLabel: true, rigid: true,
      what: "The hinge as a teardown shows it: three steel modules on a centre beam, swing arms that screw to each half, and the plates that hold up the screen over the fold. The springs, cams and gears inside the modules show in High detail (Options).",
      list: [["hinge-1", "", "Three modules keep the halves in step and hold the phone at any angle"],
        ["hinge-beam", "", "The beam the modules sit on"], ["hinge-plates", "", "Hold up the screen over the hinge when it is open"]] },
    { id: "hinge-flex", name: "Hinge flex cables", short: "Hinge flex cables", ex: 0, main: "flex-0", oneLabel: true },
    // before front-cover: the keycaps are pieces of the "cover" layer with no part too. Laid aside with the shell, under
    // the front cover, its keys up through the cover's keyboard window, as a keyboard phone's keyboard comes out with its
    // front housing: on the stack (level −2.6) it lay over battery B and the hinge in the picture, half its area
    // (FABLE-REVIEW-2 N12; slides of 10 to 24 mm sideways and 20 to 45 mm toward the bottom end only brought that to
    // 11 to 29 %, and widened the stack past the phone's framing)
    { id: "keyboard", name: "Keyboard", short: "Keyboard", ex: -3.7, slide: SHELL, main: "kbd-mat", label: true, phone: true, oneLabel: true,
      take: [{ flag: "keycap" }],
      what: "The keyboard comes out as one stack: the keycaps on a silicone mat, then the layers that make each key click and glow. From the keys inward:",
      list: [["kbd-mat", "", "The keycaps sit on it; a nub under each key presses its dome"],
        ["kbd-lgf", "", "Spreads two tiny LEDs' light under every key"], ["kbd-domes", "", "A steel dome under each key gives the click"],
        ["kbd", "", "The circuit each dome closes"], ["kbd-backer", "", "The steel plate the domes press against"]] },
    { id: "coil", name: "Wireless charging coil", short: "Charging coil", ex: -2.6, main: "coil", label: true },
    // laid aside with the shell, under it (in the phone they lie just inside the covers); on the stack they hid the
    // hinge and the battery
    { id: "graphite", name: "Graphite sheets", short: "Graphite sheets", ex: -3.7, slide: SHELL, main: "graphite-p", label: true },
    { id: "cover-screen", name: "Cover screen", short: "Cover screen", ex: -4.8, slide: SHELL,  main: "cover-oled", label: true, phone: true,
      take: [{ layer: "coverscreen" }] },
    { id: "hinge-cover", name: "Hinge cover", short: "Hinge cover", ex: -4.8, slide: SHELL,  main: "hinge-cover", label: true, rigid: true },
    { id: "back-cover", name: "Back cover and camera island", short: "Back cover", ex: -4.8, slide: SHELL,  label: true, phone: true,
      take: [{ layer: "back", part: false }],
      what: "The screen half's back panel in the finish colour, with the raised camera island: three lens windows, the flash and two small openings. In a teardown it is the first thing to come off." },
    { id: "front-cover", name: "Front cover (keyboard half)", short: "Front cover", ex: -4.8, slide: SHELL,  label: true,
      take: [{ layer: "cover", part: false }],
      what: "The keyboard half's outside: the face plate with windows for the cover screen and the keys, the web between the keys, and the earpiece slot." }
  ];
  UNITS.forEach((u) => { u.members = P.filter((p) => p.unit === u.id).map((p) => p.id); });

  /* ---------- detail levels: what only the High detail exploded view draws (FABLE-REVIEW-1 WP4) ----------
     Small pieces too small to see without zooming, which the Simple view leaves out (1 = always drawn, 2 = High
     detail only; every view but Simple exploded draws them all). pieces: the kinds of detail js/internals.js puts on a
     part (the mid-frames' tape faces the screen, which is down in the Simple view). hinge: the
     hinge's pieces, by the first word of their mesh name ("hinge.<word>-..."). */
  const DETAIL = {
    pieces: { screwRing: 2, connector: 2, screw: 2, tapePad: 2, sticker: 2, coilTail: 2, driverFlex: 2, led: 2, tab: 2, domes: 2,
      tape: 2, gasket: 1, pcm: 1, pullTab: 1, lens: 1, membrane: 1, passives: 1 },
    hinge: ["cam", "shafts", "gear", "springs", "plate", "screws", "recess", "sliders", "pin", "pads", "wing", "centre", "door"],
    // pieces of the outside drawn in these looks (js/materials.js): the openings in the frame edges and the camera
    // island (port), and the antenna breaks
    looks: ["port", "antenna"]
  };

  /* ---------- the Mechanical view (FABLE-REVIEW-1 F8, WP5) ----------
     Only the structure: the two frames, the mid-frames that hold the inner screen, and the whole hinge, with the hinge
     slider live so the mechanism can be watched working. Each entry is one label and one card in that view, and names
     the pieces it covers; together they are everything the view draws (js/teardown.js hides every other piece).
     Fields as the units' (name, short, what, src), plus:
     match: a pattern on the mesh name (js/hinge.js names every hinge piece "hinge.<word>-<where>"; the frames' inner
       walls are "frame.hinge-wall-<half>"). parts: parts.js ids. looks: the frame's own looks (js/materials.js), for
       the frame bodies and the openings and antenna breaks drawn on them, which have no name or part.
     main: the mesh name the label points at (the first piece matched, if absent). phone: keeps its label first on a
       phone-sized viewer, where only a few fit (the moving parts).
     ghost: a pattern on the mesh name: these pieces are drawn see-through in this view, so the parts behind them show
       (the spine cover from the back; the screen's support plates and the screen over the fold from the screen side).
     near: the entry's pieces on the half nearer the camera are drawn see-through when the phone is nearly shut (under
       60°), so the hinge shows through that half (FABLE-REVIEW-2 N1).
     tag: as the parts'. The hinge is this phone's own design, worked out from teardowns, so it is INFERENCE. */
  const MECH = [
    { id: "mech-modules", name: "Hinge modules", short: "Hinge modules", match: "^hinge\\.((block|cam|shafts|springs|plate|screws)-\\d|beam$|recess-spine$)",
      main: "hinge.block-1", phone: true, tag: "INFERENCE", src: ["jre8", "wkV6"],
      what: "Three steel blocks inside the spine, on a centre beam. Each holds a cam and four small springs that press on it: as the phone folds the cam turns, and the springs make it click shut, click open and hold at any angle in between. That is the stiffness you feel when you open it." },
    { id: "mech-gears", name: "Synchroniser gears", short: "Gears", match: "^hinge\\.gear-", main: "hinge.gear-1-bl", phone: true, tag: "INFERENCE", src: ["jre8", "wkV6"],
      what: "Two rows of three tiny gears in the middle module. Each row turns with one half, and the rows mesh with each other, so the two halves always turn by the same amount: push only one side and the other follows. Move the slider and watch the rows turn opposite ways." },
    { id: "mech-arms", name: "Swing arms", short: "Swing arms", match: "^hinge\\.(arm|sliders|screws|recess)-(panel|deck)", main: "hinge.arm-panel-1", phone: true, tag: "INFERENCE", src: ["wkV6", "fold8"],
      what: "One arm per half at each module, screwed to that half. Its curved foot rides round the spine cover's shoulder like a train on a curved track, so each half swings about its own pivot just behind the screen. Two pivots, not one, leave room in the middle for the screen to bend in a loose loop." },
    { id: "mech-cover", name: "Spine cover", short: "Spine cover", match: "^hinge\\.(cover|pin)(-|$)", main: "hinge.cover", ghost: "^hinge\\.cover", tag: "INFERENCE", src: ["jre8", "fold8"],
      what: "The metal shell over the hinge: the spine you see when the phone is shut. Its two shoulders are the tracks the swing arms ride on, and the plates at its ends carry the two pivot pins the halves turn on. It is drawn see-through here, so the parts inside show." },
    { id: "mech-midframe", name: "Mid-frame", short: "Mid-frame", parts: ["midframe-p", "midframe-d"], main: "midframe-p", near: true, tag: "INFERENCE", src: ["v3", "fold8"],
      what: "The aluminium plate inside each half that holds the inner screen up: the screen is glued to its front, and the boards and battery hang off its back. It stops short of the hinge, where the wing plates take over." },
    { id: "mech-frame", name: "Frame", short: "Frame", match: "^frame\\.", looks: ["frame", "port", "antenna"], main: "frame.hinge-wall-panel", near: true, tag: "INFERENCE", src: ["fold8"],
      what: "The metal ring round each half: the phone's outside edge and its strongest part. The mid-frame is fixed inside it, the swing arms screw to its hinge end, and at the top and bottom its rounded corners turn on the pivot pins." },
    { id: "mech-plates", name: "Wing plates and centre plate", short: "Wing plates", match: "^hinge\\.(wing|centre|door|pads)-", main: "hinge.wing-panel",
      ghost: "^hinge\\.(centre|door|pads)-", tag: "INFERENCE", src: ["wkV6", "jre8"],
      what: "Thin steel plates under the screen where it crosses the hinge. Open flat, they make one flat floor, so the screen has no dip. As the phone shuts, the wing plates tilt and the centre plate sinks, opening a teardrop-shaped pocket the screen bends into without a sharp crease. The centre plate and the door plates are drawn see-through here, so the gears and the swing arms under them show." },
    { id: "mech-screen", name: "Screen over the fold", short: "Screen (fold)", match: "^(hinge\\.fold-strip$|screen\\.ears-)", main: "hinge.fold-strip",
      ghost: "^(hinge\\.fold-strip$|screen\\.ears-)", phone: true, tag: "INFERENCE", src: ["wkV6", "fold8"],
      what: "The strip of the inner screen that crosses the hinge: the same flexible panel as the rest of the screen, glued down on each half and free over the fold. Open flat it lies on the plates; as the phone shuts it bends into a loose teardrop-shaped loop inside the hinge, never a sharp fold, so it lasts hundreds of thousands of folds. Drawn see-through here, so the plates under it show." }
  ];
  MECH.forEach((u) => { u.members = []; });
  /* the Mechanical view's caption (bottom left; under the readout on a phone): [up to this hinge angle (°), what the
     mechanism is doing].
     The first row whose angle is at or above the current one is shown (js/teardown.js) */
  const MECH_CAPTIONS = [
    [12, "Shut: the screen curls into a teardrop-shaped loop between the tilted wing plates, never a sharp fold."],
    [60, "Opening: each half turns about its own pivot; the gears make both halves turn together."],
    [120, "Half open: the swing arms ride round the spine cover's shoulders, like trains on a curved track."],
    [170, "Nearly flat: the wing plates tilt back level and the centre plate rises under the screen."],
    [180, "Open flat: the wing and centre plates make one flat floor under the screen."]
  ];

  window.FC_PARTS = { parts: P, sources: SOURCES, cell: CELL, flexes, units: UNITS, detail: DETAIL, mechanical: MECH, mechCaptions: MECH_CAPTIONS,
    totalMAh: P.filter((p) => p.mAh).reduce((s, p) => s + p.mAh, 0) };
})();
