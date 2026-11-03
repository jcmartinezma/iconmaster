# Iconmaster

Iconmaster exports a selection of icons as SVG with strokes turned into fills. The icons in the file keep their editable strokes.

Each icon is copied into one temporary frame. The plugin calls `outlineStroke()` on that copy, exports the copy with `exportAsync({ format: "SVG_STRING" })`, then deletes the frame. Source frames, components, and instances are only read.

## Run it in Figma Desktop

Development plugins load in the desktop app.

1. Install [Node.js 22](https://nodejs.org/) or newer.
2. In this folder, install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

3. Open a Figma Design file in **Figma Desktop**.
4. Go to **Plugins → Development → Import plugin from manifest…**
5. Choose `manifest.json` in this folder.
6. Select one or more icons and run **Plugins → Development → Iconmaster**.

After you change the source, run `npm run build` again and run the plugin again. Figma reads `dist/code.js` and `dist/ui.html` on each launch.

`npm run check` typechecks, runs the unit tests, and builds.

## Use it

Select the icons themselves. A parent frame full of icons is exported as one SVG. A component set is the exception: each variant is its own file.

Accepted layers:

| Selection | Result |
| --- | --- |
| Frame | One SVG |
| Component | One SVG |
| Instance | One SVG, including overrides on that instance |
| Component set | One SVG per variant |
| Anything else | Skipped, and listed before export |

The panel is a single 320px column. Its copy is in Spanish. The top line reads like `24 iconos · 2 avisos`. **Avisos** opens and closes the notes. Click a note to select that layer and zoom to it. Selecting a note replaces the current selection, so select the icons again before you export.

Under the notes, each icon is a 32px thumbnail of the artwork currently in the file. The filename is the thumbnail’s tooltip. That preview is a read-only PNG export. It does not outline strokes and it does not change the layer.

Options:

- **currentColor** (on by default) rewrites solid fills and strokes to `currentColor`. `fill="none"`, gradients, and masks stay as they are. Turn it off to keep the original color (usually black `#000000`).
- **Nombre de archivo** has **Prefijo** and **Sufijo**. Both are optional. They are kebab-cased and joined to the file name.

**Exportar SVG** stays pinned to the bottom. While the zip is built, the button becomes the progress indicator (`3 de 12`) and fills across. When it finishes, the panel reports exportados, omitidos, and errores, and the browser downloads `iconmaster-icons.zip`. Omitidos means a selected layer was not a frame, component, variant, or instance. A warning on a hidden layer or a shape without a stroke does not skip that icon. Per-icon failures are listed under the summary and the rest of the icons still export.

## File names

Ordinary frames, components, and instances use the layer name: `Arrow Right` becomes `arrow-right.svg`.

Variants use the property **values only**, in the order defined on the component set. A variant named `Icon=arrow, Size=24` becomes `arrow-24.svg`. The set name and the property names are not included.

Prefix `icon` and suffix `bold` make `icon-arrow-24-bold.svg`. If two files share a name, the second is `arrow-24-2.svg`, then `arrow-24-3.svg`.

## What stays untouched

Export never calls `outlineStroke()`, `detachInstance()`, or stroke edits on the layers you selected.

1. The plugin fingerprints the selection (ids, visibility, stroke weight, stroke align, dash pattern, and child ids).
2. It commits the undo history so earlier clicks in the plugin are not mixed into this step.
3. It creates one frame named `Iconmaster temporary`, just outside the viewport.
4. For a component it creates an instance and detaches that instance. For an instance it clones it, then detaches the clone. For a frame it clones the frame. The copy is parented under the temporary frame before any edit.
5. `outlineStroke()` runs on the copy. The API returns a new vector and leaves its input node intact. If that vector is not inside the temporary frame, it is moved there or deleted and the icon is reported as an error.
6. The copy is exported, then deleted. A `finally` block also deletes the temporary frame and any node the export added to the page.
7. The previous selection is restored when it changed.
8. The plugin commits undo again and compares the fingerprint. If a source layer changed, the summary tells you to press Undo once.

The undo step may appear in **Edit → Undo**, because Figma records the plugin transaction. After a successful export that step should be empty: no leftover frame, and the same strokes as before.

### Check that the file matches

1. Select a 24×24 icon and note its stroke weight, align, and dash pattern in the design panel.
2. Export it.
3. Confirm the layer is still a stroked shape, not a filled outline, and that the stroke fields match.
4. Search the Layers panel for `Iconmaster temporary`. It should be gone.
5. Press Undo once. The icon should stay as it is. Undo may highlight an Iconmaster step and change nothing. It should not delete the icon, expand its strokes, or bring the temporary frame back.
6. If the summary says a layer changed, press Undo once before doing anything else. Delete `Iconmaster temporary` if it is still on the canvas.

## Try it on the canvas

**1. Strokes stay editable**

- Draw a 24×24 frame named `Arrow Right`.
- Inside it, add a vector or ellipse with no fill, a 1.5px center stroke, and a round cap.
- Run Iconmaster and download the zip.
- Open `arrow-right.svg`. The root should be `viewBox="0 0 24 24"` and the mark should be a filled path, not a `stroke` attribute.
- Back in Figma, the ellipse still shows a 1.5px stroke. Follow [Check that the file matches](#check-that-the-file-matches).

**2. Variants, prefix, and currentColor**

- Make a component set with two variants: `Icon=arrow, Size=16` and `Icon=arrow, Size=24`.
- Select the set. The list should show `arrow-16.svg` and `arrow-24.svg`.
- Set **Prefijo** to `icon`. The thumbnail tooltips should update to `icon-arrow-16.svg` and `icon-arrow-24.svg`.
- Export with currentColor on, then export the same selection with it off.
- The first SVG uses `fill="currentColor"`. The second keeps the original black fill. Both viewBoxes match that variant’s frame.

**3. Mixed selection**

- Select the icon frame, the component set, a plain rectangle, and an icon that contains a hidden shape and a text layer.
- The rectangle is an unsupported note. The hidden shape and the text layer are notes too. The rectangle counts as skipped.
- Click the hidden-layer note. Figma selects it and zooms over. Select the icons again.
- Export. The summary counts the frame and each variant as exported, the rectangle as skipped, and lists any icon that failed under Errors. Frames that only raised a warning still export.

## Known limitations

These follow the current Figma plugin API (`outlineStroke` and `exportAsync` on [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/) and [shared node properties](https://developers.figma.com/docs/plugins/api/node-properties/)):

- **`outlineStroke()` does not say where the new vector is parented.** This plugin forces it under the temporary copy and drops it if that fails. The source node is not the one passed in.
- **`outlineStroke()` returns `null` when a node has no stroke.** Fill-only shapes are copied through. A stroke Figma cannot outline stays on the copy and is exported with `svgSimplifyStroke: false` (the precise mask) instead of the default center-stroke approximation.
- **SVG has no inside or outside stroke.** Outlining bakes alignment into fills. A stroke that sits outside a clipped frame can be cut off by the frame’s `viewBox`.
- **Dashed strokes** depend on `outlineStroke()` matching **Outline stroke** in the editor. Confirm a dashed icon visually. The plugin does not reimplement dash geometry.
- **Boolean operations** are outlined as one shape when the boolean itself has a stroke. Strokes on the objects inside the boolean are not expanded one by one. The boolean’s operands are not walked.
- **Masks** are copied onto the outlined vector (`isMask` and mask type). Complicated mask stacks can still shift. Check those icons.
- **Text** is not passed to `outlineStroke()`. Export uses `svgOutlineText`, so glyphs become paths. A stroke on text is not expanded the way a vector stroke is. Text is listed before export.
- **Hidden layers** stay hidden on the copy, and Figma leaves them out of the SVG.
- **Effects, blend modes, and opacity** are copied onto the outlined vector when the API allows it. Exotic effects can still differ.
- **Auto layout** on the copy is turned off before children are replaced so the export does not reflow. The original keeps its layout.
- **ViewBox** comes from the icon’s width and height (`useAbsoluteBounds: true`), then the plugin writes `viewBox="0 0 <width> <height>"`. A transparent rectangle the size of the frame is added to the copy so empty padding is part of that box, and removed from the SVG afterward. A non-24×24 icon keeps its own frame size.
- **This environment cannot open Figma.** The outline behavior is based on the current plugin docs and the unit tests cover naming, `currentColor`, the viewBox rewrite, and the rule that edits must stay inside the temporary frame.

## Project layout

```
manifest.json          Plugin manifest. main → dist/code.js, ui → dist/ui.html
esbuild.mjs            Bundles the plugin and inlines the UI
src/plugin/code.ts     UI messages, undo grouping, cleanup
src/plugin/scan.ts     Selection, warnings, names
src/plugin/outline.ts  Temporary copy, outlineStroke, SVG export
src/plugin/safety.ts   Fingerprint used to detect edits to source layers
src/shared/            Naming, SVG post-processing, holder check
src/ui/                Plugin panel
test/                  Unit tests for the pieces that do not need Figma
```

The zip is built in the panel with [fflate](https://github.com/101arrowz/fflate). No network access is declared in the manifest.
