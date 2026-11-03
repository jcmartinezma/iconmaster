export type WarningKind = "no-stroke" | "hidden" | "text" | "unsupported";

export interface WarningItem {
  kind: WarningKind;
  nodeId: string;
  nodeName: string;
  detail: string;
}

export interface IconItem {
  nodeId: string;
  name: string;
  kindLabel: string;
  baseName: string;
  sizeLabel: string;
  /** Base64 PNG of the original artwork at 32px wide. Empty when the preview could not be read. */
  preview: string;
}

export interface SelectionSnapshot {
  icons: IconItem[];
  warnings: WarningItem[];
  skipped: number;
  truncated: boolean;
}

export interface ExportFile {
  name: string;
  svg: string;
}

export interface IconError {
  name: string;
  message: string;
}

export type ToUI =
  | { type: "selection"; snapshot: SelectionSnapshot }
  | {
      type: "progress";
      index: number;
      total: number;
      name: string;
      state: "start" | "ok" | "error";
      message?: string;
    }
  | {
      type: "summary";
      exported: number;
      skipped: number;
      errors: number;
      files: ExportFile[];
      errorItems: IconError[];
    }
  | { type: "focus-failed"; message: string };

export type ToPlugin =
  | { type: "ready" }
  | { type: "export"; useCurrentColor: boolean; prefix: string; suffix: string }
  | { type: "focus"; nodeId: string };
