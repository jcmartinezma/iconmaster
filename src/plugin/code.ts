import { assignFileNames } from "../shared/names";
import type { IconError, ToPlugin, ToUI } from "../shared/types";
import { exportIconSvg } from "./outline";
import { fingerprint, TEMP_FRAME_NAME } from "./safety";
import { scanSelection } from "./scan";

declare const __html__: string;

const UI_WIDTH = 320;
const UI_HEIGHT = 520;

let exporting = false;

// Design defaults this to false. Keep hidden instance children visible so
// the pre-export notes can list them.
figma.skipInvisibleInstanceChildren = false;

figma.on("selectionchange", () => {
  if (!exporting) void postSelection();
});

figma.ui.onmessage = (raw: unknown) => {
  if (!isToPlugin(raw)) return;
  if (raw.type === "ready") {
    void postSelection();
    return;
  }
  if (raw.type === "focus") {
    if (!exporting) void focusNode(raw.nodeId);
    return;
  }
  void runExport(raw.useCurrentColor !== false, raw.prefix ?? "", raw.suffix ?? "");
};

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });

async function postSelection(): Promise<void> {
  try {
    const { snapshot } = await scanSelection(figma.currentPage.selection);
    post({ type: "selection", snapshot });
  } catch (error) {
    post({
      type: "summary",
      exported: 0,
      skipped: 0,
      errors: 1,
      files: [],
      errorItems: [{ name: "Selección", message: errorMessage(error) }],
    });
  }
}

async function focusNode(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !isSceneNode(node)) {
    post({ type: "focus-failed", message: "Esa capa ya no está en el archivo." });
    return;
  }
  const page = pageOf(node);
  if (!page || page.id !== figma.currentPage.id) {
    post({ type: "focus-failed", message: "Esa capa está en otra página." });
    return;
  }
  try {
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  } catch (error) {
    post({ type: "focus-failed", message: errorMessage(error) });
  }
}

async function runExport(useCurrentColor: boolean, prefix: string, suffix: string): Promise<void> {
  if (exporting) return;
  exporting = true;
  const files: { name: string; svg: string }[] = [];
  const errorItems: IconError[] = [];
  let skipped = 0;

  try {
    const { jobs, snapshot } = await scanSelection(figma.currentPage.selection);
    skipped = snapshot.skipped;
    const names = assignFileNames(
      jobs.map((job) => job.item.baseName),
      prefix,
      suffix,
    );
    const before = captureFingerprints(figma.currentPage.selection);
    const pageChildIds = new Set(figma.currentPage.children.map((child) => child.id));

    // Seal earlier selection changes so the temporary create/delete pair is
    // one undo step. Nothing is committed between create and remove.
    figma.commitUndo();

    const savedSelection = figma.currentPage.selection.slice();
    const holder = createHolder();
    const loose: SceneNode[] = [];

    try {
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        const name = names[index] ?? "icon.svg";
        post({ type: "progress", index, total: jobs.length, name, state: "start" });
        try {
          if (job.node.removed) throw new Error("Esta capa se eliminó antes de la exportación.");
          const svg = await exportIconSvg(job.node, holder, loose, useCurrentColor);
          files.push({ name, svg });
          post({ type: "progress", index, total: jobs.length, name, state: "ok" });
        } catch (error) {
          const message = errorMessage(error);
          errorItems.push({ name, message });
          post({ type: "progress", index, total: jobs.length, name, state: "error", message });
        }
      }
    } finally {
      try {
        removeTemporaryNodes(holder, loose, pageChildIds);
        restoreSelection(savedSelection);
      } finally {
        figma.commitUndo();
      }
    }

    if (await originalsChanged(before)) {
      errorItems.push({
        name: "Capas originales",
        message:
          "Una capa del archivo cambió durante la exportación. Pulsa Deshacer una vez. Si el marco Iconmaster temporary sigue en el lienzo, bórralo.",
      });
    }

    post({
      type: "summary",
      exported: files.length,
      skipped,
      errors: errorItems.length,
      files,
      errorItems,
    });

    if (errorItems.length === 0) {
      figma.notify(files.length === 1 ? "1 icono exportado" : `${files.length} iconos exportados`);
    } else {
      figma.notify("La exportación terminó con errores");
    }
  } catch (error) {
    errorItems.push({ name: "Exportación", message: errorMessage(error) });
    post({
      type: "summary",
      exported: files.length,
      skipped,
      errors: errorItems.length,
      files,
      errorItems,
    });
  } finally {
    exporting = false;
  }
}

function createHolder(): FrameNode {
  const holder = figma.createFrame();
  holder.name = TEMP_FRAME_NAME;
  holder.fills = [];
  holder.clipsContent = false;
  holder.expanded = false;
  const bounds = figma.viewport.bounds;
  holder.x = bounds.x + bounds.width + 64;
  holder.y = bounds.y;
  holder.resize(1, 1);
  return holder;
}

function removeTemporaryNodes(holder: FrameNode, loose: SceneNode[], pageChildIds: Set<string>): void {
  const tryRemove = (node: BaseNode): void => {
    try {
      if (!node.removed) node.remove();
    } catch {
      // The page sweep retries anything still attached to the page.
    }
  };
  tryRemove(holder);
  for (const node of loose) tryRemove(node);
  for (const child of [...figma.currentPage.children]) {
    if (!pageChildIds.has(child.id)) tryRemove(child);
  }
}

function restoreSelection(saved: readonly SceneNode[]): void {
  const next = saved.filter((node) => !node.removed);
  const current = figma.currentPage.selection;
  const same =
    current.length === next.length && current.every((node, index) => node.id === next[index]?.id);
  if (!same) figma.currentPage.selection = next;
}

function captureFingerprints(selection: readonly SceneNode[]): Map<string, string | null> {
  const before = new Map<string, string | null>();
  for (const node of selection) before.set(node.id, fingerprint(node));
  return before;
}

async function originalsChanged(before: Map<string, string | null>): Promise<boolean> {
  for (const [id, previous] of before) {
    const node = await figma.getNodeByIdAsync(id);
    if (!node || !isSceneNode(node)) return true;
    if (previous === null) continue;
    const next = fingerprint(node);
    if (next !== null && next !== previous) return true;
  }
  return false;
}

function pageOf(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === "PAGE") return current;
    current = current.parent;
  }
  return null;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return node.type !== "DOCUMENT" && node.type !== "PAGE";
}

function post(message: ToUI): void {
  figma.ui.postMessage(message);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Algo ha fallado durante la exportación.";
}

function isToPlugin(value: unknown): value is ToPlugin {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const type = (value as { type: unknown }).type;
  return type === "ready" || type === "export" || type === "focus";
}
