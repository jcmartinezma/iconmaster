import { applyCurrentColor, enforceFrameViewBox } from "../shared/svg";
import { isInsideHolder, type LinkedNode } from "../shared/tree";
import { hasStroke } from "./scan";

const LEAVES = new Set(["VECTOR", "STAR", "LINE", "ELLIPSE", "POLYGON", "RECTANGLE"]);

/**
 * Build an SVG for one icon.
 *
 * The source node is only read. Every edit happens on a detached copy that
 * already lives under `holder`. `outlineStroke()` returns a new vector and
 * leaves its input intact; that vector is kept only when it is inside the
 * holder, and the copy is deleted before this function returns.
 */
export async function exportIconSvg(
  source: FrameNode | ComponentNode | InstanceNode,
  holder: FrameNode,
  loose: SceneNode[],
  useCurrentColor: boolean,
): Promise<string> {
  const width = source.width;
  const height = source.height;
  const root = materialize(source, holder, loose);
  try {
    outlineNode(root, holder, true);
    fit(root, width, height);
    addBoundsKeeper(root, holder, loose, width, height);
    fit(root, width, height);

    const raw = await root.exportAsync({
      format: "SVG_STRING",
      contentsOnly: true,
      useAbsoluteBounds: true,
      svgOutlineText: true,
      svgIdAttribute: false,
      // Inside and outside strokes are already baked into fills. If a stroke
      // could not be outlined, false asks SVG export for the precise mask
      // instead of the default center-stroke approximation.
      svgSimplifyStroke: false,
    });
    if (typeof raw !== "string" || !raw.includes("<svg")) {
      throw new Error("Figma no devolvió un SVG.");
    }
    const framed = enforceFrameViewBox(raw, width, height);
    return useCurrentColor ? applyCurrentColor(framed) : framed;
  } finally {
    if (!root.removed) root.remove();
  }
}

function materialize(
  source: FrameNode | ComponentNode | InstanceNode,
  holder: FrameNode,
  loose: SceneNode[],
): FrameNode {
  if (source.type === "COMPONENT") {
    const instance = source.createInstance();
    loose.push(instance);
    holder.appendChild(instance);
    return instance.detachInstance();
  }
  if (source.type === "INSTANCE") {
    const clone = source.clone();
    loose.push(clone);
    holder.appendChild(clone);
    return clone.detachInstance();
  }
  const clone = source.clone();
  loose.push(clone);
  holder.appendChild(clone);
  return clone;
}

function outlineNode(node: SceneNode, holder: FrameNode, isRoot: boolean): void {
  assertInside(node, holder);
  if ("locked" in node && node.locked) node.locked = false;
  if (isRoot) node.visible = true;
  if (!isRoot && !node.visible) return;

  if (node.type === "INSTANCE") {
    const detached = node.detachInstance();
    outlineNode(detached, holder, isRoot);
    return;
  }

  if (node.type === "TEXT" || node.type === "TEXT_PATH") return;

  if (node.type === "BOOLEAN_OPERATION") {
    if (hasStroke(node)) replaceWithOutlined(node, holder);
    return;
  }

  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    node.layoutMode = "NONE";
  }

  if ("children" in node) {
    for (const child of [...node.children]) {
      if (!child.removed) outlineNode(child, holder, false);
    }
  }

  if (LEAVES.has(node.type)) {
    if (hasStroke(node)) replaceWithOutlined(node, holder);
    return;
  }

  // The icon frame stays the export bounds. A stroke on that frame is
  // outlined into a child of the copy, then the copy's stroke is cleared.
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    absorbContainerStroke(node, holder);
  }
}

function replaceWithOutlined(node: SceneNode, holder: FrameNode): void {
  assertInside(node, holder);
  const parent = node.parent;
  if (!parent || !("insertChild" in parent) || !canOutline(node)) return;
  assertInside(parent, holder);
  const index = Math.max(0, parent.children.indexOf(node));
  const outlined = node.outlineStroke();
  if (!outlined) return;
  try {
    adopt(outlined, parent, index, holder);
    copyAppearance(node, outlined);
    if (!node.removed) node.remove();
  } catch (error) {
    if (!outlined.removed) outlined.remove();
    throw error;
  }
}

/** Keep a container, and move a frame-level stroke outline inside it. */
function absorbContainerStroke(node: SceneNode, holder: FrameNode): void {
  if (!canOutline(node) || !hasStroke(node) || !("appendChild" in node)) return;
  assertInside(node, holder);
  const outlined = node.outlineStroke();
  if (!outlined) return;
  try {
    node.appendChild(outlined);
    if (!isInsideHolder(asLinked(outlined), holder.id)) {
      throw new Error("El contorno del trazo quedó fuera del marco temporal.");
    }
    if ("strokeStyleId" in node && node.strokeStyleId) node.strokeStyleId = "";
    node.strokes = [];
  } catch (error) {
    if (!outlined.removed) outlined.remove();
    throw error;
  }
}

function adopt(
  outlined: VectorNode,
  parent: BaseNode & ChildrenMixin,
  index: number,
  holder: FrameNode,
): void {
  parent.insertChild(index, outlined);
  if (!isInsideHolder(asLinked(outlined), holder.id)) {
    throw new Error("El contorno del trazo quedó fuera del marco temporal.");
  }
}

function copyAppearance(from: SceneNode, outlined: VectorNode): void {
  outlined.name = from.name;
  outlined.visible = from.visible;
  if ("opacity" in from) outlined.opacity = from.opacity;
  if ("blendMode" in from) outlined.blendMode = from.blendMode;
  if ("effects" in from && from.effects.length > 0) outlined.effects = [...from.effects];
  if ("isMask" in from && from.isMask) {
    outlined.isMask = true;
    if ("maskType" in from) outlined.maskType = from.maskType;
  }
}

function addBoundsKeeper(
  root: FrameNode,
  holder: FrameNode,
  loose: SceneNode[],
  width: number,
  height: number,
): void {
  assertInside(root, holder);
  const keeper = figma.createRectangle();
  loose.push(keeper);
  keeper.name = "Bounds";
  keeper.resize(Math.max(width, 0.01), Math.max(height, 0.01));
  keeper.x = 0;
  keeper.y = 0;
  keeper.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0 }];
  keeper.strokes = [];
  root.insertChild(0, keeper);
}

function fit(root: FrameNode, width: number, height: number): void {
  const w = Math.max(width, 0.01);
  const h = Math.max(height, 0.01);
  if (Math.abs(root.width - w) > 0.001 || Math.abs(root.height - h) > 0.001) {
    root.resize(w, h);
  }
}

function canOutline(node: SceneNode): node is SceneNode & GeometryMixin {
  return "outlineStroke" in node && typeof node.outlineStroke === "function";
}

function assertInside(node: BaseNode, holder: FrameNode): void {
  if (node.id === holder.id) return;
  if (!isInsideHolder(asLinked(node), holder.id)) {
    throw new Error("La exportación se detuvo para no modificar el archivo.");
  }
}

function asLinked(node: BaseNode): LinkedNode {
  return node as LinkedNode;
}
