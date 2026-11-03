/**
 * Structural fingerprint of a layer and its descendants.
 * Used after export to detect accidental edits to the source icons.
 * Names and positions are omitted so a rename or nudge during export
 * does not look like a plugin mutation.
 */
export function fingerprint(node: SceneNode): string | null {
  try {
    const lines: string[] = [];
    const walk = (current: SceneNode): void => {
      const childIds = "children" in current ? current.children.map((child) => child.id).join(",") : "";
      lines.push(
        [
          current.id,
          current.type,
          current.visible ? "1" : "0",
          "strokeWeight" in current ? String(current.strokeWeight) : "",
          "strokeAlign" in current ? current.strokeAlign : "",
          "dashPattern" in current ? current.dashPattern.join(",") : "",
          "strokes" in current ? String(current.strokes.length) : "",
          childIds,
        ].join("\t"),
      );
      if ("children" in current) {
        for (const child of current.children) walk(child);
      }
    };
    walk(node);
    return lines.join("\n");
  } catch {
    return null;
  }
}

export const TEMP_FRAME_NAME = "Iconmaster temporary";
