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
   ex: the part's level in the High detail exploded view: + toward the inner screen side, − toward the
     back (the Simple view uses its unit's level instead).
     Parts on one level never overlap in plan view.
   r: corner radius. rh: corner radius on the hinge side, where it differs. holes: windows cut through the part.
   notch: a rectangle cut out of the outline on the free-edge side (x[1]); it is a corner cut-out when notch.y[0] = y[0]
     or notch.y[1] = y[1].
   look: the material the 3D model draws it in. mat stays in the old set (battery, pcb, pcbEdge, chip,
     chip2, shield, copper, coil, graphite, camera, alu, oled, kbd, steel, speaker, titanium, flex), because the parts
     table and the project's diagrams colour by it.
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
   name, short, what and spec are the words a visitor reads (the part's card, its label and the page's parts list):
     what says what the part does for you first, then how; spec gives the figures. Where each figure comes from is kept
     in the private design notes, not in this published file. */
(function () {
  "use strict";

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
    what: "One big screen for reading, writing and two apps side by side. A single flexible panel across both halves, under ultra-thin glass, so the fold bends without a hard crease.",
    spec: "7.5-inch LTPO OLED, 2364 × 1902 (about 403 ppi), 1–120 Hz, up to 3,000 nits" });
  add({ id: "inner-oled-d", name: "Inner foldable OLED (keyboard half)", unit: "inner-screen", leaf: "deck", x: [7.05, 74.5], y: [-59.95, 59.95], z: [-0.5, -0.13], r: 7, rh: 0.3, mat: "oled", look: "oledBack", layer: "screen", ex: 4, group: "Displays", skipTable: true,
    what: "The keyboard half of the one big inner screen: a single piece across the hinge, with no join in the middle." });
  add({ id: "midframe-p", name: "Mid-frame", short: "Mid-frame", unit: "midframes", leaf: "panel", x: [10.8, 74.5], y: [-60, 60], z: [-0.85, -0.5], r: 7, rh: 0.5, mat: "alu", look: "alu", layer: "midframe", ex: 2, label: true, group: "Structure",
    holes: [{ x: [13, 70], y: [-54, 0], r: 3 }, { x: [13, 44], y: [12, 50], r: 3 }, { x: [66.7, 71.3], y: [52.7, 57.3], r: 2.3 },
      { x: [11.4, 40.6], y: [-59.4, -56.4], r: 0.8 }],
    what: "Stiff metal skeleton for each half, so the inner screen stays flat. Screen on one side, battery and boards on the other.",
    spec: "Aluminium, 0.35 mm thick, with windows over the battery and board" });
  add({ id: "midframe-d", name: "Mid-frame (keyboard half)", unit: "midframes", leaf: "deck", x: [10.8, 74.5], y: [-60, 60], z: [-0.85, -0.5], r: 7, rh: 0.5, mat: "alu", look: "alu", layer: "midframe", ex: 2, group: "Structure", skipTable: true,
    what: "Stiff metal skeleton for the keyboard half, so the inner screen stays flat over it.",
    holes: [{ x: [13, 70], y: [-15, 46], r: 3 }, { x: [13, 70], y: [-56, -24], r: 3 }] });

  // battery cell A: hinge zone kept clear (x from 8.5), bottom-right corner left for the bottom speaker
  const bP = { x: [8.5, 73], y: [-58, 4], z: [-4.3, -0.9], notch: { x: [45, 73], y: [-58, -47.6] } };
  add({ id: "battery-p", name: "Battery cell A", short: "Battery A", unit: "battery", leaf: "panel", x: bP.x, y: bP.y, z: bP.z, r: 1.5, notch: bP.notch, tabEnd: "top", tabs: [25, 38], mat: "battery", look: "pouch", layer: "internal", ex: 0, label: true, group: "Power",
    mAh: mAh(bP.x, bP.y, bP.z, bP.notch),
    what: "One of two cells, one in each half, so the weight balances in your hand. Silicon-carbon, for more charge in the same space.",
    spec: "Silicon-carbon pouch, 3.4 mm thick, with a corner left for the speaker" });
  const bD = { x: [8.5, 73], y: [-19, 50], z: [-4.7, -0.9] };
  add({ id: "battery-d", name: "Battery cell B", short: "Battery B", unit: "battery", leaf: "deck", x: bD.x, y: bD.y, z: bD.z, r: 1.5, tabEnd: "bottom", tabs: [25, 55], mat: "battery", look: "pouch", layer: "internal", ex: 0, label: true, group: "Power",
    mAh: mAh(bD.x, bD.y, bD.z),
    what: "The bigger of the two cells. Behind the cover screen, where the keyboard half has a little more depth to spare.",
    spec: "Silicon-carbon pouch, 3.8 mm thick" });

  // stacked ("sandwich") main board: two boards joined by a ring-shaped spacer (interposer)
  const boardNotch = { x: [32, 47], y: [26, 40] };
  add({ id: "board-lo", name: "Main board, lower layer", unit: "motherboard", leaf: "panel", x: [8.5, 47], y: [8, 53], z: [-1.45, -0.9], r: 2, mat: "pcb", look: "pcb", layer: "internal", ex: 0, group: "Compute", notch: boardNotch, skipTable: true,
    what: "Lower layer of the two-board stack, so the main board takes half the space of one." });
  add({ id: "interposer", name: "Board spacer (interposer)", unit: "motherboard", leaf: "panel", x: [8.5, 47], y: [8, 53], z: [-2.85, -1.45], r: 2, mat: "pcbEdge", look: "pcb", layer: "internal", ex: -0.7, group: "Compute", notch: boardNotch,
    holes: [{ x: [11, 30.5], y: [10.5, 50.5], r: 1.5 }], skipTable: true,
    what: "Ring-shaped spacer between the two stacked boards, carrying the connections from one to the other." });
  add({ id: "board-up", name: "Main board (stacked)", short: "Main board", unit: "motherboard", leaf: "panel", x: [8.5, 47], y: [8, 53], z: [-3.4, -2.85], r: 2, mat: "pcb", look: "pcb", layer: "internal", ex: -1.4, label: true, group: "Compute", notch: boardNotch,
    what: "Two boards stacked like a sandwich, in half the space of one, for more room for battery. Home to the main chip, memory, storage and radios.",
    spec: "Two boards and a ring-shaped spacer, 2.5 mm tall in all" });
  add({ id: "soc", name: "Snapdragon 8 Elite Extreme Gen 6", short: "Main chip", unit: "motherboard", leaf: "panel", x: [9.5, 30.7], y: [37, 51], z: [-4.0, -3.4], r: 0.6, mat: "chip", look: "chip", layer: "internal", ex: -2.1, label: true, group: "Compute",
    what: "The phone's brain: processor, graphics, AI, camera processing and the 5G modem in one chip. 2 nm process, for speed that goes easy on the battery.",
    spec: "2 nm. Eight cores: two up to 5.0 GHz, six up to 4.0 GHz. 8K video at 60 fps" });
  add({ id: "ram", name: "LPDDR6 memory", short: "Memory", unit: "motherboard", leaf: "panel", x: [13.1, 27.1], y: [37, 51], z: [-4.5, -4.0], r: 0.6, mat: "chip2", look: "chip", layer: "internal", ex: -2.7, label: true, group: "Compute",
    what: "Working memory for many apps at once, with instant switching between them. Stacked on top of the main chip, to save space.",
    spec: "12 GB or 16 GB, LPDDR6" });
  add({ id: "ufs", name: "Storage (UFS 5.0)", short: "Storage", unit: "motherboard", leaf: "panel", x: [31.2, 42.2], y: [40.5, 52.5], z: [-4.0, -3.4], r: 0.6, mat: "chip", look: "chip", layer: "internal", ex: -2.1, label: true, group: "Compute",
    what: "Room for your photos, videos and apps, fast enough to open big files in a moment.", spec: "256 GB or 512 GB, UFS 5.0" });
  add({ id: "pmic", name: "Power management chip", short: "Power chip", unit: "motherboard", leaf: "panel", x: [14.2, 22.2], y: [26, 34], z: [-3.9, -3.4], r: 0.5, mat: "chip", look: "chip", layer: "internal", ex: -2.1, label: true, group: "Power",
    what: "Safe charging, plus the dozens of voltages the other chips need, all made from the battery's one.", spec: "Charging at up to 80 W wired and 50 W wireless" });
  add({ id: "rf", name: "5G radio front-end", short: "5G radio", unit: "motherboard", leaf: "panel", x: [18, 28], y: [12, 22], z: [-4.4, -3.4], r: 0.5, mat: "shield", look: "shieldCan", layer: "internal", ex: -2.1, label: true, group: "Connectivity",
    what: "Fast 5G wherever there is signal. Amplifiers and filters between the modem and the antennas in the frame, under a metal shield.",
    spec: "5G, up to 14.8 Gbps down and 4.2 Gbps up" });
  add({ id: "wifi", name: "Wi-Fi and Bluetooth chip", short: "Wi-Fi / Bluetooth", unit: "motherboard", leaf: "panel", x: [31, 39], y: [12, 20], z: [-4.4, -3.4], r: 0.5, mat: "shield", look: "shieldCan", layer: "internal", ex: -2.1, label: true, group: "Connectivity",
    what: "Fast Wi-Fi, Bluetooth for your headphones and watch, and ultra-wideband for finding tags and unlocking a car from your pocket.",
    spec: "Wi-Fi 7 (Wi-Fi 8-ready), Bluetooth 6.3, UWB" });
  add({ id: "can-x", name: "Shield can", unit: "motherboard", leaf: "panel", x: [41.6, 46.5], y: [9, 19.6], z: [-4.3, -3.4], r: 0.5, mat: "shield", look: "shieldCan", layer: "internal", ex: -2.1, group: "Compute", skipTable: true,
    what: "Metal cover to keep radio noise in, so the chips under it do not disturb each other." });
  add({ id: "vc", name: "Vapour chamber", short: "Vapour chamber", unit: "motherboard", leaf: "panel", x: [9, 31], y: [9, 53], z: [-4.9, -4.6], r: 2, mat: "copper", look: "vc", layer: "internal", ex: -3.3, label: true, group: "Thermal",
    what: "Cooling under load, so the phone stays fast through long games and video calls. A flat sealed pouch with a drop of water inside, to carry the chip's heat away far faster than solid copper.",
    spec: "0.3 mm thick" });

  // rear cameras (under the island near the free edge, top of the screen half); they sit on a steel bracket
  add({ id: "cam-main", name: "Main camera, 200 MP", short: "Main camera", unit: "rear-cams", leaf: "panel", x: [55.6, 69.6], y: [38.6, 52.6], z: [-7.3, -1.3], r: 1.5, mat: "camera", look: "cameraBody", layer: "internal", ex: -1.4, label: true, group: "Cameras",
    what: "Sharp, detailed photos, even in low light. Large sensor for more light, optical stabilisation for steady shots. A tall stack of lenses, the reason for the raised camera island.",
    spec: "200 MP, 1/1.4-type sensor, f/1.7, optical stabilisation" });
  add({ id: "cam-prism", name: "Zoom camera prism", unit: "rear-cams", leaf: "panel", x: [56.6, 68.6], y: [27.4, 38.4], z: [-7.1, -1.3], r: 1, mat: "camera", look: "periscope", layer: "internal", ex: -1.4, group: "Cameras", skipTable: true,
    what: "Prism to turn the light 90° into the zoom camera, so the long lens lies along the phone." });
  add({ id: "cam-tele", name: "3× periscope zoom, 50 MP", short: "Zoom camera", unit: "rear-cams", leaf: "panel", x: [33, 56.6], y: [28, 38], z: [-5.3, -1.3], r: 1.5, mat: "camera", look: "periscope", layer: "internal", ex: -1.4, label: true, group: "Cameras",
    what: "3× optical zoom for portraits and far-off detail. Light turned 90° by a prism, so the long lens lies along the phone instead of through it.",
    spec: "50 MP, 1/1.95-type sensor, 3× optical zoom, stabilised" });
  add({ id: "cam-uw", name: "Ultra-wide camera, 50 MP", short: "Ultra-wide camera", unit: "rear-cams", leaf: "panel", x: [57, 68], y: [14.9, 25.9], z: [-6.7, -1.3], r: 1.5, mat: "camera", look: "cameraBody", layer: "internal", ex: -1.4, label: true, group: "Cameras",
    what: "Wide shots for whole rooms and groups, and close focus for close-ups.", spec: "50 MP, f/2.0, autofocus, macro" });
  add({ id: "cam-bracket", name: "Camera bracket", unit: "rear-cams", leaf: "panel", x: [54.6, 70.6], y: [13.9, 53.6], z: [-1.3, -1.0], r: 1, mat: "steel", look: "steelBracket", layer: "internal", ex: -1.4, group: "Cameras", skipTable: true,
    what: "Steel bracket for the three rear cameras, in line under the camera island, so all three point the same way.",
    notch: { x: [66.6, 70.6], y: [52.75, 53.6] },
    holes: [{ x: [58.1, 67.1], y: [41.1, 50.1], r: 1 }, { x: [59.1, 66.1], y: [29.4, 36.4], r: 1 }, { x: [59, 66], y: [16.9, 23.9], r: 1 }] });
  add({ id: "cam-udc", name: "Inner selfie camera (punch-hole)", short: "Inner selfie camera", unit: "selfie", leaf: "panel", x: [66.9, 71.1], y: [52.9, 57.1], z: [-3.4, -0.55], r: 0.8, mat: "camera", look: "cameraBody", layer: "internal", ex: 1, label: true, group: "Cameras",
    what: "For video calls with the phone open, through a small hole in the top-right corner of the inner screen.",
    spec: "20 MP. Punch-hole camera, Ø3.2 mm opening" });

  add({ id: "speaker-bot", name: "Loudspeaker, bottom (screen half)", short: "Speaker (bottom)", unit: "speakers", leaf: "panel", x: [46, 67], y: [-58.6, -48.6], z: [-4.0, -1.0], r: 1.5, mat: "speaker", look: "speakerBox", layer: "internal", ex: -0.7, label: true, group: "Audio & haptics",
    what: "Stereo sound whichever way you hold the phone, from two speakers at opposite corners. This one at the bottom edge of the screen half.",
    spec: "Sealed box speaker, one of a stereo pair" });
  add({ id: "coil", name: "Wireless charging coil + NFC", short: "Charging coil", unit: "coil", leaf: "panel", cx: 38.5, cy: -27, rad: 22, z: [-4.97, -4.75], mat: "coil", look: "ferrite", layer: "back", ex: -4.6, label: true, group: "Power",
    what: "Wireless charging on a pad, and tap to pay. A flat copper spiral to pick up the pad's magnetic field, with the NFC antenna as its outer loop.",
    spec: "50 W wireless charging, reverse wireless charging, NFC. 0.22 mm thick" });
  add({ id: "graphite-p", name: "Graphite heat spreader", short: "Graphite sheet", unit: "graphite", leaf: "panel", x: [3, 74], y: [-59, 5], z: [-5.15, -5.05], r: 5, mat: "graphite", look: "graphite", layer: "back", ex: -4.0, label: true, group: "Thermal",
    what: "Graphite sheet to spread heat sideways, so no spot on the back feels hot in your hand.", spec: "Graphite, 0.1–0.17 mm thick" });
  add({ id: "fp", name: "Fingerprint sensor (power key)", short: "Fingerprint key", unit: "side-keys", leaf: "panel", x: [72.6, 75.2], y: [8.5, 19.5], z: [-3.6, -1.8], r: 0.6, mat: "chip", look: "chip", layer: "internal", ex: 0, slide: [6, 0, 0], label: true, group: "Input",
    what: "Unlock with the same press that wakes the phone. Reader built into the power key, on the outer edge of the screen half.",
    spec: "Capacitive, in the power key" });

  /* ---------- keyboard half (deck) ---------- */
  add({ id: "graphite-d", name: "Graphite heat spreader (keyboard half)", unit: "graphite", leaf: "deck", x: [3, 74], y: [-21, 52], z: [-5.15, -5.05], r: 5, mat: "graphite", look: "graphite", layer: "back", ex: -2.1, group: "Thermal", skipTable: true,
    what: "Graphite sheet for the keyboard half, to spread heat sideways so no spot on the back feels hot." });
  add({ id: "cover-oled", name: "Cover screen OLED", short: "Cover screen", unit: "cover-screen", leaf: "deck", x: [3.4, 73.1], y: [-21.65, 58.35], z: [-6.75, -6.4], r: 6.3, mat: "oled", look: "copperFoil", layer: "coverscreen", ex: -4.4, label: true, group: "Displays",
    holes: [{ x: [36.75, 39.75], y: [53.35, 56.35], r: 1.5 }],
    what: "Read and reply without opening the phone. Above the keyboard, under its own toughened glass.",
    spec: "4.2-inch LTPO OLED, 1106 × 1269 (about 403 ppi), 1–120 Hz" });
  // keyboard stack, from the keys inward: mat, light guide, domes, switch flex, steel backer
  const KX = [3.4, 73.1], KY = [-52.4, -24.2];
  add({ id: "kbd-mat", name: "Key mat (silicone)", short: "Key mat", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-5.58, -5.36], r: 2, mat: "kbd", look: "siliconeMat", layer: "internal", ex: -4.4, label: true, group: "Input",
    what: "All 37 keycaps on one silicone piece. A small nub under each key to press its metal dome, so every press lands in the same place.",
    spec: "Silicone, 0.22 mm thick, one nub per key" });
  add({ id: "kbd-lgf", name: "Light-guide film", short: "Light guide", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-5.36, -5.21], r: 2, mat: "oled", look: "lgf", layer: "internal", ex: -3.8, label: true, group: "Input",
    what: "Even light under every key, for typing in the dark. A clear film to spread the light of two tiny LEDs under all the keys.",
    spec: "0.15 mm thick, lit from the edge by 2 LEDs" });
  add({ id: "kbd-domes", name: "Metal dome sheet", short: "Dome sheet", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-5.21, -4.96], r: 2, mat: "kbd", look: "domeSteel", layer: "internal", ex: -3.2, label: true, group: "Input",
    what: "A crisp, real click on every key, from a small steel dome that snaps flat under each press.",
    spec: "37 steel domes, Ø4.6 mm, 0.3 mm key travel" });
  add({ id: "kbd", name: "Keyboard switch flex", short: "Switch flex", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-4.96, -4.84], r: 2, mat: "kbd", look: "flexBlack", layer: "internal", ex: -2.6, label: true, group: "Input",
    what: "Every press turned into a keystroke, plus touch sensing: swipe across the keys to scroll. A gold contact under every dome, closed by the dome's snap.",
    spec: "37 keys: 3 rows of 10, and a bottom row of 7 with a wide space bar. Backlit, touch-sensitive" });
  add({ id: "kbd-backer", name: "Keyboard stiffener", short: "Stiffener", unit: "keyboard", leaf: "deck", x: KX, y: KY, z: [-4.84, -4.69], r: 2, mat: "steel", look: "steelSatin", layer: "internal", ex: -2.1, label: true, group: "Input",
    what: "Thin steel plate behind the domes, so every key feels the same, from the corners to the middle.",
    spec: "Stainless steel, 0.15 mm thick" });
  add({ id: "subboard", name: "Sub-board", short: "Sub-board", unit: "subboard", leaf: "deck", x: [20, 46], y: [-59.2, -45], z: [-4.65, -4.2], r: 1.5, mat: "pcb", look: "pcb", layer: "internal", ex: -1.4, label: true, group: "Compute",
    what: "The keyboard half's link to the main board, through two cables across the hinge. Home to the USB-C port, a microphone and the speaker amplifier.",
    spec: "Circuit board, 0.45 mm thick" });
  add({ id: "usb", name: "USB-C port", short: "USB-C port", unit: "subboard", leaf: "deck", x: [33.8, 42.7], y: [-61.75, -54.25], z: [-4.2, -1.2], r: 1.2, mat: "steel", look: "steelCan", layer: "internal", ex: -0.7, label: true, group: "Power",
    what: "Fast charging and fast data through one socket.", spec: "USB-C 3.1 Gen 2 (10 Gbps), 80 W wired charging" });
  add({ id: "speaker-top", name: "Loudspeaker, top (keyboard half)", short: "Speaker (top)", unit: "speakers", leaf: "deck", x: [44, 66], y: [50.8, 59.0], z: [-4.0, -1.0], r: 1.5, mat: "speaker", look: "speakerBox", layer: "internal", ex: -0.7, label: true, group: "Audio & haptics",
    what: "The other half of the stereo pair, and the earpiece for calls, under the slot above the cover screen.",
    spec: "Sealed box speaker, one of a stereo pair. Also the earpiece" });
  add({ id: "haptic", name: "Vibration motor", short: "Vibration motor", unit: "subboard", leaf: "deck", x: [9, 24], y: [-57, -49], z: [-3.5, -1.0], r: 1, mat: "steel", look: "steelCan", layer: "internal", ex: -0.7, label: true, group: "Audio & haptics",
    what: "Crisp, precise taps you feel when you type on the screen, from a magnet that shakes a small weight side to side.",
    spec: "X-axis linear motor" });
  add({ id: "cam-cover", name: "Cover selfie camera", short: "Cover selfie camera", unit: "selfie", leaf: "deck", x: [35.25, 41.25], y: [52, 58], z: [-6.6, -1.5], r: 1.2, mat: "camera", look: "cameraBody", layer: "internal", ex: 0, label: true, group: "Cameras",
    what: "Selfies and video calls with the phone shut, from the small hole at the top of the cover screen.", spec: "20 MP" });
  add({ id: "mmwave", name: "mmWave antenna module", short: "mmWave antenna", unit: "antenna", leaf: "deck", x: [9, 31], y: [53, 57], z: [-3.0, -1.2], r: 0.8, mat: "shield", look: "shieldCan", layer: "internal", ex: 0, label: true, group: "Connectivity",
    what: "The fastest kind of 5G, where networks offer it. A small antenna of its own, as these radio waves cannot pass through the metal frame.",
    spec: "mmWave 5G antenna array" });

  /* ---------- hinge (spine). Spine-local coords; js/hinge.js builds them ---------- */
  [[31, 55], [-12, 12], [-55, -31]].forEach((h, i) => add({
    id: "hinge-" + i, name: "Hinge module (one of three)", short: "Hinge module", unit: "hinge", leaf: "spine", x: [-3.58, 3.58], y: [h[0], h[1]], z: [-4.93, -3.3], r: 0.4, mat: "titanium", look: "steelDark", layer: "internal", ex: -1.5, label: i === 1, group: "Structure", skipTable: i !== 1,
    what: "Any angle from shut to open flat, with both halves moving together. Three steel modules, each with springs pressing on a cam, and gears in the middle one.",
    spec: "Steel housings, springs, cams and gears. Teardrop-shaped fold" }));
  add({ id: "hinge-cover", name: "Hinge cover (spine)", short: "Hinge cover", unit: "hinge-cover", leaf: "spine", x: [-4.76, 4.76], y: [-60.7, 60.7], z: [-5.58, -1.82], r: 1.8, mat: "titanium", look: "hingeCover", layer: "back", ex: -5.5, label: true, group: "Structure",
    what: "Cover for the hinge, and the spine you hold when the phone is shut. Open, just a 3.2 mm strip between the two halves.",
    spec: "Satin metal, 0.5 mm wall. A rounded spine 1.9 mm past the halves when shut" });
  add({ id: "hinge-beam", name: "Hinge centre beam", unit: "hinge", leaf: "spine", x: [-3.12, 3.12], y: [-58, 58], z: [-4.93, -3.75], r: 0.5, mat: "titanium", look: "steelDark", layer: "internal", ex: -3.0, group: "Structure", skipTable: true,
    what: "Steel backbone of the hinge, holding the three modules in line." });
  add({ id: "hinge-plates", name: "Hinge door plates", unit: "hinge", leaf: "spine", x: [3.05, 10.6], y: [-54, 54], z: [-0.75, -0.5], r: 0.5, mat: "steel", look: "plateBlack", layer: "midframe", ex: 3, group: "Structure", skipTable: true,
    what: "Support for the screen over the hinge when the phone is open, so it feels flat under your finger." });
  [[22.5, 30.5], [12.5, 20.5]].forEach((y, i) => add({
    id: "flex-" + i, name: "Hinge flex cables", short: "Hinge flex cables", unit: "hinge-flex", leaf: "spine", x: [-6.2, 6.2], y: y, z: [-4.55, -2.8], r: 0.5, mat: "flex", render: "flex", layer: "internal", ex: 0, label: i === 0, group: "Structure", skipTable: i !== 0,
    what: "Power and data across the hinge, on ribbons that bend every time you open the phone. Two wide ribbons between the hinge modules, from the main board to the keyboard half.",
    spec: "Polyimide flex, 8 mm wide, 0.12 mm thick" }));

  /* ---------- flex cables (drawn by js/teardown.js) ----------
     from / to: { part, at, n, w }. at = where the ribbon leaves its connector, in front coords of that part's half
     (spine-local for the spine). n = the direction it leaves in. w = its width axis.
     via: points of the assembled route, each { leaf: "panel" | "deck" | "spine", at: [x, y, z] in that group's coords,
     w (optional) }. The width axis is interpolated between the points that set one.
     width (mm); color "amber" or "black"; part: a parts.js id for the ribbon's label and card, or null.
     Board ends (board-up, subboard) sit on a press-fit connector under a steel bracket (js/internals.js). */
  const X = [1, 0, 0], Y = [0, 1, 0], nX = [-1, 0, 0], nY = [0, -1, 0], D45 = [0.7071, 0.7071, 0], D45b = [0.7071, -0.7071, 0];
  /* the hinge crossing: from each half up over the spine cover's rim, where the wing plates leave a gap for
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
    // edge side, n +x like the sub-board end, threw the exploded loop far past the free edge)
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

  /* ---------- units: the sub-assemblies of the Simple exploded view ----------
     Each part names its unit (unit: above); a unit's members are those parts, in list order. Fields:
     ex: the unit's level in the Simple exploded view, as parts' ex (+ toward the inner screen, − toward the back). The
       Simple view lies back up, so the most negative level is the top of the stack. Units on one level
       sit side by side, or nest as they do in the phone; they never overlap.
     main: the part the label points at (its mesh decides where; a unit with no part member uses its biggest piece).
     label: one label in the Simple view. oneLabel: in the other views the members' own labels give way to one label
       for the unit. phone: keeps its label on a phone-sized viewer (at most 9 there).
     rigid: moves as one piece centred over the hinge: its members on the halves do not part sideways with them.
     slide: the unit's extra exploded move [x, y, z] in front coords, for a unit that leaves sideways.
     take: pieces with no part of their own that come out with the unit (the outside shell, screens, keycaps),
       matched in list order: { layer } (a teardown layer), { flag } (a userData flag), part: false (only pieces that
       have no part).
     what: the unit's card text; its card then lists `list` ([part id, where (or ""), what it does]) below it. A unit
       with no `what` opens its main part's own card. */
  /* the outside shell (both covers, the cover screen, the spine cover) comes off first and is laid aside beyond the
     phone's top end, as in a teardown photo: on the stack it would hide everything under it */
  const SHELL = [0, 90, 0];
  const UNITS = [
    { id: "inner-screen", name: "Inner screen", short: "Inner screen", ex: 3, main: "inner-oled-p", label: true, phone: true, rigid: true,
      take: [{ layer: "screen" }] },
    { id: "midframes", name: "Mid-frames", short: "Mid-frames", ex: 1.6, main: "midframe-p", label: true, phone: true },
    { id: "battery", name: "Battery, two cells", short: "Battery (2 cells)", ex: 0, main: "battery-p", label: true, phone: true,
      what: "Two cells, one in each half, so the weight balances in your hand. Silicon-carbon, for more charge in the same space.",
      list: [["battery-p", "Screen half", "The lower part, with one corner left for the bottom speaker"],
        ["battery-d", "Keyboard half", "Behind the cover screen, a little deeper"]] },
    { id: "speakers", name: "Loudspeakers", short: "Speakers", ex: 0, main: "speaker-bot", label: true,
      what: "Stereo sound whichever way you hold the phone, from two sealed speakers at opposite corners.",
      list: [["speaker-top", "Top", "Top edge of the keyboard half, and the earpiece too"],
        ["speaker-bot", "Bottom", "Bottom edge of the screen half"]] },
    { id: "selfie", name: "Selfie cameras", short: "Selfie cameras", ex: 0, main: "cam-udc", label: true,
      what: "A camera for each screen, for selfies and video calls with the phone shut or open.",
      list: [["cam-udc", "Inner screen", "In the top-right punch-hole, for video calls with the phone open"],
        ["cam-cover", "Cover screen", "In the punch-hole at the top, for selfies with the phone shut"]] },
    { id: "antenna", name: "mmWave antenna", short: "Antenna", ex: 0, main: "mmwave" },
    { id: "side-keys", name: "Side keys and fingerprint sensor", short: "Side keys", ex: 0, main: "fp", slide: [6, 0, 0],
      take: [{ layer: "frame" }],
      what: "Volume and power, where your thumb falls on the screen half's outer edge. Fingerprint reader in the power key, to unlock as you press.",
      list: [["fp", "", "Unlocks as you press the power key"]] },
    { id: "motherboard", name: "Motherboard", short: "Motherboard", ex: -1.3, main: "board-up", label: true, phone: true,
      what: "The phone's brain, memory and radios on one compact board: two boards stacked like a sandwich, with a vapour chamber to keep the main chip cool. On it:",
      list: [["soc", "", "The phone's brain: processor, graphics, AI and the 5G modem in one chip"],
        ["ram", "", "Working memory, stacked on the main chip"],
        ["ufs", "", "Long-term storage for photos, videos and apps"],
        ["pmic", "", "Every voltage the chips need, and charging"],
        ["rf", "", "Amplifiers and filters for 5G, under a metal shield can"],
        ["wifi", "", "Wi-Fi, Bluetooth and ultra-wideband, under a shield can"],
        ["vc", "", "Cooling for the main chip"],
        ["board-up", "", "The two stacked boards and the spacer between them"]] },
    { id: "rear-cams", name: "Rear cameras", short: "Rear cameras", ex: -1.3, main: "cam-bracket", label: true, phone: true,
      what: "Three cameras for every shot, from wide rooms to far-off detail. In a column on one steel bracket, under the camera island. From the top:",
      list: [["cam-main", "Top", "The big sensor, for most photos and video"],
        ["cam-tele", "Middle", "On its side, with a prism to turn the light 90°"],
        ["cam-uw", "Bottom", "Wide-angle shots and close-ups"]] },
    { id: "subboard", name: "Sub-board", short: "Sub-board", ex: -1.3, main: "subboard", label: true,
      what: "The keyboard half's link to the main board, at the bottom of that half, with the parts that plug into it.",
      list: [["subboard", "", "Link from the keyboard half's parts to the main board"], ["usb", "", "Charging and data"],
        ["haptic", "", "The taps you feel when typing on the screen"]] },
    { id: "hinge", name: "Hinge", short: "Hinge", ex: -1.3, main: "hinge-1", label: true, phone: true, oneLabel: true, rigid: true,
      what: "Open flat, shut with no gap, and any angle in between. Three steel modules on a centre beam. High detail (Options) shows the springs, cams and gears inside.",
      list: [["hinge-1", "", "Three modules, to keep the halves in step at any angle"],
        ["hinge-beam", "", "The beam the modules sit on"], ["hinge-plates", "", "Support for the screen over the hinge when open"]] },
    { id: "hinge-flex", name: "Hinge flex cables", short: "Hinge flex cables", ex: 0, main: "flex-0", oneLabel: true },
    // before front-cover: the keycaps are pieces of the "cover" layer with no part too. Laid aside with the shell, under
    // the front cover, its keys up through the cover's keyboard window, as a keyboard phone's keyboard comes out with its
    // front housing: on the stack (level −2.6) it lay over battery B and the hinge in the picture, half its area
    // (slides of 10 to 24 mm sideways and 20 to 45 mm toward the bottom end only brought that to
    // 11 to 29 %, and widened the stack past the phone's framing)
    { id: "keyboard", name: "Keyboard", short: "Keyboard", ex: -3.7, slide: SHELL, main: "kbd-mat", label: true, phone: true, oneLabel: true,
      take: [{ flag: "keycap" }],
      what: "37 backlit keys with a real click, and touch-sensitive too: swipe across them to scroll. One stack, out in one piece. From the keys inward:",
      list: [["kbd-mat", "", "Keycaps on top, and a nub under each key to press its dome"],
        ["kbd-lgf", "", "Light from two tiny LEDs, spread under every key"], ["kbd-domes", "", "A steel dome under each key, for the click"],
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
      what: "Toughened glass in your chosen finish, with the raised camera island: three lenses, the flash and two small openings. First to come off in a teardown." },
    { id: "front-cover", name: "Front cover (keyboard half)", short: "Front cover", ex: -4.8, slide: SHELL,  label: true,
      take: [{ layer: "cover", part: false }],
      what: "The face of the phone when shut: a frame round the cover screen and the keys. Keys set just below it, so a pocket or a table top never presses them. Earpiece slot at the top." }
  ];
  UNITS.forEach((u) => { u.members = P.filter((p) => p.unit === u.id).map((p) => p.id); });

  /* ---------- detail levels: what only the High detail exploded view draws ----------
     Small pieces too small to see without zooming, which the Simple view leaves out (1 = always drawn, 2 = High
     detail only; every view but Simple exploded draws them all). pieces: the kinds of detail js/internals.js puts on a
     part (the mid-frames' tape faces the screen, which is down in the Simple view). hinge: the
     hinge's pieces, by the first word of their mesh name ("hinge.<word>-..."). The wing, centre and door plates are
     drawn in Simple: the hinge unit's card names them, and Simple draws each unit as one mesh per material, so the
     five plates cost two calls there (js/teardown.js). */
  const DETAIL = {
    pieces: { screwRing: 2, connector: 2, screw: 2, tapePad: 2, sticker: 2, coilTail: 2, driverFlex: 2, led: 2, tab: 2, domes: 2,
      tape: 2, gasket: 1, pcm: 1, pullTab: 1, lens: 1, membrane: 1, passives: 1 },
    hinge: ["cam", "shafts", "gear", "springs", "plate", "screws", "recess", "sliders", "pin", "pads"],
    // pieces of the outside drawn in these looks (js/materials.js): the openings in the frame edges and the camera
    // island (port), and the antenna breaks
    looks: ["port", "antenna"]
  };

  /* ---------- the Mechanical view ----------
     Only the structure: the two frames, the mid-frames that hold the inner screen, and the whole hinge, with the hinge
     slider live so the mechanism can be watched working. Each entry is one label and one card in that view, and names
     the pieces it covers; together they are everything the view draws (js/teardown.js hides every other piece).
     Fields as the units' (name, short, what), plus:
     match: a pattern on the mesh name (js/hinge.js names every hinge piece "hinge.<word>-<where>"; the frames' inner
       walls are "frame.hinge-wall-<half>"). parts: parts.js ids. looks: the frame's own looks (js/materials.js), for
       the frame bodies and the openings and antenna breaks drawn on them, which have no name or part.
     main: the mesh name the label points at (the first piece matched, if absent). phone: keeps its label first on a
       phone-sized viewer, where only a few fit (the moving parts).
     ghost: a pattern on the mesh name: these pieces are drawn see-through in this view, so the parts behind them show
       (the spine cover from the back; the screen's support plates and the screen over the fold from the screen side).
     near: the entry's pieces on the half nearer the camera are drawn see-through when the phone is nearly shut (under
       60°), so the hinge shows through that half. */
  const MECH = [
    { id: "mech-modules", name: "Hinge modules", short: "Hinge modules", match: "^hinge\\.((block|cam|shafts|springs|plate|screws)-\\d|beam$|recess-spine$)",
      main: "hinge.block-1", phone: true,
      what: "Any angle you leave the phone at, with a firm click shut and a firm click open. Three steel blocks, each with four small springs pressing on a cam that turns as the phone folds." },
    { id: "mech-gears", name: "Synchroniser gears", short: "Gears", match: "^hinge\\.gear-", main: "hinge.gear-1-bl", phone: true,
      what: "Both halves turning by the same amount: push one side and the other follows. Two rows of tiny gears in the middle module. Move the slider to watch them turn opposite ways." },
    { id: "mech-arms", name: "Swing arms", short: "Swing arms", match: "^hinge\\.(arm|sliders|screws|recess)-(panel|deck)", main: "hinge.arm-panel-1", phone: true,
      what: "A pivot for each half, just behind the screen, so the screen has room to bend in a loose loop. A curved foot on each arm, riding round the spine cover's shoulder like a train on a curved track." },
    { id: "mech-cover", name: "Spine cover", short: "Spine cover", match: "^hinge\\.(cover|pin)(-|$)", main: "hinge.cover", ghost: "^hinge\\.cover",
      what: "The spine you see when the phone is shut, and the track for the swing arms. Drawn see-through here, so the parts inside show." },
    { id: "mech-midframe", name: "Mid-frame", short: "Mid-frame", parts: ["midframe-p", "midframe-d"], main: "midframe-p", near: true,
      what: "A flat base for the inner screen: screen glued to the front, boards and battery on the back. Stops short of the hinge, where the wing plates take over." },
    { id: "mech-frame", name: "Frame", short: "Frame", match: "^frame\\.", looks: ["frame", "port", "antenna"], main: "frame.hinge-wall-panel", near: true,
      what: "Metal ring round each half: the phone's outside edge, and its strongest part. Mid-frame and swing arms fixed to it, with corners that turn on the hinge's pivot pins." },
    { id: "mech-plates", name: "Wing plates and centre plate", short: "Wing plates", match: "^hinge\\.(wing|centre|door|pads)-", main: "hinge.wing-panel",
      ghost: "^hinge\\.(centre|door|pads)-",
      what: "A flat floor for the screen when the phone is open, and a teardrop-shaped pocket to bend into when it shuts, so there is no sharp crease. Centre and door plates drawn see-through here, so the parts under them show." },
    { id: "mech-screen", name: "Screen over the fold", short: "Screen (fold)", match: "^(hinge\\.fold-strip$|screen\\.ears-)", main: "hinge.fold-strip",
      ghost: "^(hinge\\.fold-strip$|screen\\.ears-)", phone: true,
      what: "The strip of the inner screen across the hinge. Shut: a loose loop instead of a sharp fold, for a soft crease. Drawn see-through here, so the plates under it show." }
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

  window.FC_PARTS = { parts: P, cell: CELL, flexes, units: UNITS, detail: DETAIL, mechanical: MECH, mechCaptions: MECH_CAPTIONS,
    totalMAh: P.filter((p) => p.mAh).reduce((s, p) => s + p.mAh, 0) };
})();
