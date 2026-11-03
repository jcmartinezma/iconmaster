export function formatLength(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

const PRESERVE_PAINT = /^(?:none|currentColor|url\()/i;

/**
 * Recolor solid fills and strokes. Leaves `none`, `currentColor`, and
 * paint servers (gradients, masks) alone, including on the root `<svg>`.
 */
export function applyCurrentColor(svg: string): string {
  return svg
    .replace(/\bfill="([^"]*)"/gi, (match, value: string) =>
      PRESERVE_PAINT.test(value.trim()) ? match : 'fill="currentColor"',
    )
    .replace(/\bstroke="([^"]*)"/gi, (match, value: string) =>
      PRESERVE_PAINT.test(value.trim()) ? match : 'stroke="currentColor"',
    )
    .replace(/\bfill:\s*([^;"']+)/gi, (match, value: string) =>
      PRESERVE_PAINT.test(value.trim()) ? match : "fill:currentColor",
    )
    .replace(/\bstroke:\s*([^;"']+)/gi, (match, value: string) =>
      PRESERVE_PAINT.test(value.trim()) ? match : "stroke:currentColor",
    );
}

/**
 * Force the root viewBox to the icon frame and drop the transparent bounds
 * rectangle the exporter inserts so padding stays inside `0 0 <width> <height>`.
 */
export function enforceFrameViewBox(svg: string, width: number, height: number): string {
  const w = formatLength(width);
  const h = formatLength(height);
  const viewBox = `0 0 ${w} ${h}`;
  const stripped = svg.replace(/<rect\b([^>]*)\/?>(?:<\/rect>)?/gi, (full, attrs: string) =>
    isBoundsKeeper(attrs, w, h) ? "" : full,
  );
  return stripped.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    const next = setAttr(setAttr(setAttr(attrs, "viewBox", viewBox), "width", w), "height", h);
    return `<svg${next}>`;
  });
}

function isBoundsKeeper(attrs: string, width: string, height: string): boolean {
  if (attr(attrs, "width") !== width || attr(attrs, "height") !== height) return false;
  const stroke = attr(attrs, "stroke");
  if (stroke && stroke.toLowerCase() !== "none") return false;
  return isZero(attr(attrs, "opacity")) || isZero(attr(attrs, "fill-opacity"));
}

function isZero(value: string | null): boolean {
  if (value === null) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === 0;
}

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i"));
  return match ? match[1] : null;
}

function setAttr(attrs: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (pattern.test(attrs)) return attrs.replace(pattern, ` ${name}="${value}"`);
  return `${attrs} ${name}="${value}"`;
}
