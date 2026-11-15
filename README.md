# Fold Communicator

An interactive 3D design concept: a folding phone with a real keyboard.

**Live page:** https://isaacmwaura.github.io/fold-communicator/

## What you can do

- **Turn it.** Drag to rotate. Ctrl + scroll or a two-finger pinch zooms toward the point under the pointer; the
  + / − buttons zoom too. Double-tap the background to reset the view.
- **Open it.** The hinge slider opens it from 0° to 180°, and **Open ▸** plays it. The preset views are Hero, Front,
  Flex, Open and Back. Under Options, the screen hand-over animation passes the picture between the screens as the
  phone opens.
- **Take it apart.** Whole, Back off, Screens off, Exploded and Mechanical. Exploded shows the main groups of parts;
  tick High detail under Options to see every piece. Mechanical shows only the frames and the hinge, which works with
  the slider. Tap any part to see what it does.
- **Change the finish.** Five finishes: Porcelain, Graphite, Sage, Clay and Cobalt. The top-right readout shows the
  live size in millimetres.

Every internal part (position, size and spec) is defined once in `parts.js`. The 3D model and the parts list on the
page are both built from it.

## Run it locally

It is a plain static page with no build step. Serve the folder and open it:

```
python -m http.server 8000
```

Then visit http://localhost:8000. three.js 0.186.1 loads from jsDelivr (pinned version, through an import map).

## Concept notice

Fold Communicator is an independent design concept. It is not a product for sale and is not affiliated with any phone
or chip maker. All geometry is generated in code.
