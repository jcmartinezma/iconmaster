/** Filename-safe kebab-case. Empty input stays empty so callers can substitute. */
export function kebab(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Variant file stem from property values only.
 * `Icon=arrow, Size=24` is passed as `["arrow", "24"]` and becomes `arrow-24`.
 */
export function variantBaseName(values: readonly string[]): string {
  return kebab(values.join(" ")) || "icon";
}

export function assignFileNames(
  bases: readonly string[],
  prefix: string,
  suffix: string,
): string[] {
  const used = new Map<string, number>();
  const prefixStem = kebab(prefix);
  const suffixStem = kebab(suffix);
  return bases.map((base) => {
    const stem =
      [prefixStem, kebab(base) || "icon", suffixStem].filter(Boolean).join("-") || "icon";
    const seen = used.get(stem) ?? 0;
    used.set(stem, seen + 1);
    return seen === 0 ? `${stem}.svg` : `${stem}-${seen + 1}.svg`;
  });
}
