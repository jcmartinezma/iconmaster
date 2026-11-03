import { zipSync, strToU8 } from "fflate";
import { assignFileNames } from "../shared/names";
import type { ExportFile, SelectionSnapshot, ToPlugin, ToUI, WarningKind } from "../shared/types";

const count = document.querySelector<HTMLElement>("#count");
const icons = document.querySelector<HTMLElement>("#icons");
const empty = document.querySelector<HTMLElement>("#empty");
const warnings = document.querySelector<HTMLElement>("#warnings");
const truncated = document.querySelector<HTMLElement>("#truncated");
const summary = document.querySelector<HTMLElement>("#summary");
const errors = document.querySelector<HTMLElement>("#errors");
const focusNote = document.querySelector<HTMLElement>("#focus-note");
const exportButton = document.querySelector<HTMLButtonElement>("#export");
const exportLabel = document.querySelector<HTMLElement>("#export-label");
const exportFill = document.querySelector<HTMLElement>("#export-fill");
const currentColor = document.querySelector<HTMLInputElement>("#current-color");
const prefixInput = document.querySelector<HTMLInputElement>("#prefix");
const suffixInput = document.querySelector<HTMLInputElement>("#suffix");

const KIND: Record<WarningKind, string> = {
  "no-stroke": "Sin trazo",
  hidden: "Oculto",
  text: "Texto",
  unsupported: "No compatible",
};

let snapshot: SelectionSnapshot | null = null;
let exporting = false;
let warningsOpen = true;
let progressDone = 0;
let progressTotal = 0;
let progressCurrent = 0;
let rowState: Array<{ state: "idle" | "start" | "ok" | "error"; message?: string }> = [];

count?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest("#warning-toggle")) return;
  warningsOpen = !warningsOpen;
  renderCount();
  renderWarnings();
});

prefixInput?.addEventListener("input", renderIcons);
suffixInput?.addEventListener("input", renderIcons);
exportButton?.addEventListener("click", () => {
  if (!snapshot || snapshot.icons.length === 0 || exporting) return;
  exporting = true;
  progressDone = 0;
  progressTotal = snapshot.icons.length;
  progressCurrent = 0;
  rowState = snapshot.icons.map(() => ({ state: "idle" }));
  clearSummary();
  render();
  post({
    type: "export",
    useCurrentColor: currentColor?.checked !== false,
    prefix: prefixInput?.value ?? "",
    suffix: suffixInput?.value ?? "",
  });
});

window.onmessage = (event: MessageEvent) => {
  const message = (event.data as { pluginMessage?: ToUI } | null)?.pluginMessage;
  if (!message) return;
  if (message.type === "selection") {
    snapshot = message.snapshot;
    rowState = snapshot.icons.map(() => ({ state: "idle" }));
    clearSummary();
    render();
    return;
  }
  if (message.type === "progress") {
    exporting = true;
    progressTotal = message.total;
    progressCurrent = message.index + 1;
    progressDone = message.state === "start" ? message.index : message.index + 1;
    const row = rowState[message.index];
    if (row) {
      row.state = message.state;
      row.message = message.message;
    }
    renderIcons();
    renderWarnings();
    renderButton();
    return;
  }
  if (message.type === "summary") {
    exporting = false;
    progressDone = 0;
    progressTotal = 0;
    progressCurrent = 0;
    showSummary(message.exported, message.skipped, message.errors, message.errorItems);
    if (message.files.length > 0) downloadZip(message.files);
    render();
    return;
  }
  if (message.type === "focus-failed" && focusNote) {
    focusNote.textContent = message.message;
    focusNote.classList.remove("hidden");
  }
};

function render(): void {
  renderCount();
  renderWarnings();
  renderIcons();
  renderButton();
}

function renderCount(): void {
  if (!count) return;
  if (!snapshot) {
    count.textContent = "Leyendo la selección…";
    return;
  }
  count.replaceChildren();
  const iconsLabel = document.createElement("span");
  iconsLabel.textContent = plural(snapshot.icons.length, "icono", "iconos");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.textContent = " · ";
  count.append(iconsLabel, dot);
  const warningCount = snapshot.warnings.length;
  const warningText = plural(warningCount, "aviso", "avisos");
  if (warningCount === 0) {
    const plain = document.createElement("span");
    plain.textContent = warningText;
    count.append(plain);
    return;
  }
  const toggle = document.createElement("button");
  toggle.id = "warning-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", warningsOpen ? "true" : "false");
  toggle.textContent = `${warningText} ${warningsOpen ? "▾" : "▸"}`;
  count.append(toggle);
}

function renderWarnings(): void {
  if (!warnings || !truncated || !snapshot) return;
  warnings.replaceChildren();
  const visible = warningsOpen && snapshot.warnings.length > 0;
  warnings.classList.toggle("hidden", !visible);
  truncated.classList.toggle("hidden", !visible || !snapshot.truncated);
  if (!visible) return;
  for (const warning of snapshot.warnings) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "warning";
    button.disabled = exporting;
    button.addEventListener("click", () => post({ type: "focus", nodeId: warning.nodeId }));
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = KIND[warning.kind];
    const title = document.createElement("strong");
    title.textContent = warning.nodeName || "Sin nombre";
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = warning.detail;
    button.append(kind, title, detail);
    item.append(button);
    warnings.append(item);
  }
}

function renderIcons(): void {
  if (!icons || !empty || !snapshot) return;
  icons.replaceChildren();
  const names = assignFileNames(
    snapshot.icons.map((icon) => icon.baseName),
    prefixInput?.value ?? "",
    suffixInput?.value ?? "",
  );
  snapshot.icons.forEach((icon, index) => {
    const item = document.createElement("li");
    const state = rowState[index];
    const frame = document.createElement("div");
    frame.className = state?.state === "error" ? "thumb failed" : "thumb";
    const fileName = names[index] ?? icon.baseName;
    const caption = [fileName, icon.name, icon.sizeLabel].filter(Boolean).join(" · ");
    frame.title = state?.state === "error" && state.message ? `${caption} — ${state.message}` : caption;
    if (icon.preview) {
      const image = document.createElement("img");
      image.width = 32;
      image.height = 32;
      image.alt = fileName;
      image.src = `data:image/png;base64,${icon.preview}`;
      frame.append(image);
    }
    item.append(frame);
    icons.append(item);
  });
  empty.classList.toggle("hidden", snapshot.icons.length > 0);
  icons.classList.toggle("hidden", snapshot.icons.length === 0);
}

function renderButton(): void {
  if (!exportButton || !exportLabel || !exportFill) return;
  const hasIcons = (snapshot?.icons.length ?? 0) > 0;
  exportButton.disabled = !exporting && !hasIcons;
  exportButton.classList.toggle("busy", exporting);
  exportButton.setAttribute("aria-disabled", exporting || !hasIcons ? "true" : "false");
  if (currentColor) currentColor.disabled = exporting;
  if (prefixInput) prefixInput.disabled = exporting;
  if (suffixInput) suffixInput.disabled = exporting;
  if (!exporting) {
    exportLabel.textContent = "Exportar SVG";
    exportFill.style.width = "0";
    return;
  }
  const ratio = progressTotal === 0 ? 0 : Math.max(0, Math.min(1, progressDone / progressTotal));
  exportFill.style.width = `${Math.round(ratio * 100)}%`;
  exportLabel.textContent =
    progressTotal === 0 ? "Exportando…" : `${Math.max(progressCurrent, 1)} de ${progressTotal}`;
}

function showSummary(
  exported: number,
  skipped: number,
  errorCount: number,
  items: { name: string; message: string }[],
): void {
  if (summary) {
    summary.textContent = `${plural(exported, "exportado", "exportados")} · ${plural(skipped, "omitido", "omitidos")} · ${plural(errorCount, "error", "errores")}`;
    summary.classList.remove("hidden");
  }
  if (!errors) return;
  errors.replaceChildren();
  for (const item of items) {
    const row = document.createElement("li");
    row.textContent = `${item.name} — ${item.message}`;
    errors.append(row);
  }
}

function clearSummary(): void {
  summary?.classList.add("hidden");
  errors?.replaceChildren();
  focusNote?.classList.add("hidden");
  if (summary) summary.textContent = "";
  if (focusNote) focusNote.textContent = "";
}

function plural(countValue: number, singular: string, many: string): string {
  return `${countValue} ${countValue === 1 ? singular : many}`;
}

function downloadZip(files: ExportFile[]): void {
  const archive: Record<string, Uint8Array> = {};
  for (const file of files) archive[file.name] = strToU8(file.svg);
  const zipped = zipSync(archive, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "iconmaster-icons.zip";
  link.click();
  URL.revokeObjectURL(url);
}

function post(message: ToPlugin): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

post({ type: "ready" });
