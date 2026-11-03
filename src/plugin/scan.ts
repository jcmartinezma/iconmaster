import { kebab, variantBaseName } from "../shared/names";
import { formatLength } from "../shared/svg";
import type { IconItem, SelectionSnapshot, WarningItem } from "../shared/types";

const SUPPORTED_ROOTS = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"]);

const SILENT_DESCENDANTS = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
  "TEXT",
  "TEXT_PATH",
]);

const GEOMETRY = new Set([
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
]);

const MAX_WARNINGS = 100;

export interface ExportJob {
  node: FrameNode | ComponentNode | InstanceNode;
  item: IconItem;
}

export interface ScanResult {
  jobs: ExportJob[];
  snapshot: SelectionSnapshot;
}

export async function scanSelection(selection: readonly SceneNode[]): Promise<ScanResult> {
  const warnings: WarningItem[] = [];
  const jobs: ExportJob[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let truncated = false;

  const pushWarning = (warning: WarningItem): void => {
    if (warnings.length >= MAX_WARNINGS) {
      truncated = true;
      return;
    }
    warnings.push(warning);
  };

  for (const node of selection) {
    if (!SUPPORTED_ROOTS.has(node.type)) {
      skipped += 1;
      pushWarning({
        kind: "unsupported",
        nodeId: node.id,
        nodeName: node.name,
        detail: "Solo se exportan marcos, componentes, variantes e instancias.",
      });
      continue;
    }

    if (node.type === "COMPONENT_SET") {
      const variants = node.children.filter((child): child is ComponentNode => child.type === "COMPONENT");
      if (variants.length === 0) {
        skipped += 1;
        pushWarning({
          kind: "unsupported",
          nodeId: node.id,
          nodeName: node.name,
          detail: "Este conjunto no tiene variantes.",
        });
        continue;
      }
      for (const variant of variants) {
        await addJob(variant, seen, jobs, pushWarning);
      }
      continue;
    }

    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
      await addJob(node, seen, jobs, pushWarning);
    }
  }

  return {
    jobs,
    snapshot: {
      icons: jobs.map((job) => job.item),
      warnings,
      skipped,
      truncated,
    },
  };
}

async function addJob(
  node: FrameNode | ComponentNode | InstanceNode,
  seen: Set<string>,
  jobs: ExportJob[],
  pushWarning: (warning: WarningItem) => void,
): Promise<void> {
  if (seen.has(node.id)) return;
  seen.add(node.id);
  inspectTree(node, pushWarning);
  jobs.push({
    node,
    item: {
      nodeId: node.id,
      name: node.name,
      kindLabel: kindLabel(node),
      baseName: await baseNameFor(node),
      sizeLabel: `${formatLength(node.width)}×${formatLength(node.height)}`,
      preview: await previewPng(node),
    },
  });
}

function kindLabel(node: FrameNode | ComponentNode | InstanceNode): string {
  if (node.type === "FRAME") return "Marco";
  if (node.type === "INSTANCE") return "Instancia";
  return node.variantProperties ? "Variante" : "Componente";
}

/** Read-only preview. Export does not change the node. */
async function previewPng(node: SceneNode): Promise<string> {
  try {
    const bytes = await node.exportAsync({
      format: "PNG",
      constraint: { type: "WIDTH", value: 32 },
      contentsOnly: true,
      useAbsoluteBounds: true,
    });
    return toBase64(bytes);
  } catch {
    return "";
  }
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triple = (first << 16) | (second << 8) | third;
    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return output;
}

async function baseNameFor(node: FrameNode | ComponentNode | InstanceNode): Promise<string> {
  if (node.type === "FRAME") return kebab(node.name) || "icon";
  const values = await readVariantValues(node);
  if (values && values.length > 0) return variantBaseName(values);
  return kebab(node.name) || "icon";
}

async function readVariantValues(node: ComponentNode | InstanceNode): Promise<string[] | null> {
  const props = node.variantProperties;
  if (!props) return null;
  const defs = await variantDefinitions(node);
  const ordered = defs ? keysInDefinitionOrder(defs, props) : [];
  const keys = ordered.length > 0 ? ordered : Object.keys(props);
  const values = keys.map((key) => props[key]).filter((value) => value.trim().length > 0);
  return values.length > 0 ? values : null;
}

async function variantDefinitions(
  node: ComponentNode | InstanceNode,
): Promise<ComponentPropertyDefinitions | null> {
  try {
    if (node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET") {
      return node.parent.componentPropertyDefinitions;
    }
    if (node.type === "INSTANCE") {
      const main = await node.getMainComponentAsync();
      if (main?.parent?.type === "COMPONENT_SET") {
        return main.parent.componentPropertyDefinitions;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function keysInDefinitionOrder(
  defs: ComponentPropertyDefinitions,
  props: { [property: string]: string },
): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(defs)) {
    if (defs[key]?.type === "VARIANT" && key in props) keys.push(key);
  }
  return keys;
}

function inspectTree(root: SceneNode, pushWarning: (warning: WarningItem) => void): void {
  let sawStroke = false;
  let sawGeometry = false;
  let rootHidden = false;

  const walk = (node: SceneNode, isRoot: boolean): void => {
    if (!node.visible) {
      if (isRoot) rootHidden = true;
      pushWarning({
        kind: "hidden",
        nodeId: node.id,
        nodeName: node.name,
        detail: isRoot
          ? "Este icono está oculto en el lienzo. Las capas ocultas de su interior no entran en el SVG."
          : "Las capas ocultas no entran en el SVG.",
      });
      return;
    }

    if (node.type === "TEXT" || node.type === "TEXT_PATH") {
      pushWarning({
        kind: "text",
        nodeId: node.id,
        nodeName: node.name,
        detail: "El texto no se expande desde el trazo. El SVG contornea los glifos.",
      });
      return;
    }

    if (!SILENT_DESCENDANTS.has(node.type)) {
      pushWarning({
        kind: "unsupported",
        nodeId: node.id,
        nodeName: node.name,
        detail: "Esta capa se exporta sin expandir el trazo.",
      });
    }

    if (GEOMETRY.has(node.type)) {
      sawGeometry = true;
      if (hasStroke(node)) sawStroke = true;
      else {
        pushWarning({
          kind: "no-stroke",
          nodeId: node.id,
          nodeName: node.name,
          detail: "Esta forma no tiene trazo. Se exporta igual.",
        });
      }
    }

    if (node.type === "BOOLEAN_OPERATION") return;

    if ("children" in node) {
      for (const child of node.children) walk(child, false);
    }
  };

  walk(root, true);

  if (!rootHidden && !sawStroke && !sawGeometry) {
    pushWarning({
      kind: "no-stroke",
      nodeId: root.id,
      nodeName: root.name,
      detail: "No hay trazos que contornear. El SVG conserva los rellenos.",
    });
  }
}

export function hasStroke(node: SceneNode): boolean {
  if (!("strokes" in node) || !("strokeWeight" in node)) return false;
  const strokes = node.strokes;
  if (!Array.isArray(strokes) || strokes.length === 0) return false;
  if (!strokes.some((paint) => paint.visible !== false)) return false;
  if (node.strokeWeight === figma.mixed) return true;
  if (node.strokeWeight > 0) return true;
  if (!("strokeTopWeight" in node)) return false;
  return (
    node.strokeTopWeight > 0 ||
    node.strokeBottomWeight > 0 ||
    node.strokeLeftWeight > 0 ||
    node.strokeRightWeight > 0
  );
}
