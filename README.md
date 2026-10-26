# Fold Communicator

An interactive 3D render and dimension sheet for a concept foldable phone: a cover screen over a physical keyboard on the front, a book-style hinge, and a large inner screen.

**Live page:** https://isaacmwaura.github.io/fold-communicator/

- Drag to rotate. Ctrl + scroll or a two-finger pinch zooms toward the point under the pointer; the + / − buttons
  zoom too. Double-tap the background to reset the view.
- Preset views: Hero, Front, Flex, Open, Back. The hinge slider opens it from 0° to 180°; **Open ▸** plays it.
- Teardown views: Whole, Back off, Screens off, Exploded and Mechanical. Exploded shows the main groups of parts;
  tick High detail under Options to see every piece. Mechanical shows only the frames and the hinge, which works with
  the slider. Click any part or label to read about it.
- Options include an iPhone Duo-style opening, where the screens blur and hand over as the hinge moves.
- Five finishes. The top-right readout shows the live size in millimetres.

Every internal part (position, size, spec and sources) is defined once in `parts.js`. The 3D model and the parts
table on the page are both built from it.

## Run it locally

It is a plain static page with no build step. Serve the folder and open it:

```
python -m http.server 8000
```

Then visit http://localhost:8000. three.js 0.186.1 loads from jsDelivr (pinned version, through an import map).

## Disclaimer

This is an unofficial design concept. It is not a Samsung, Clicks, Apple or Qualcomm product and is not affiliated with or endorsed by any of them. All geometry is generated in code; no manufacturer models or assets are used.
