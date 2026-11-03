export interface LinkedNode {
  readonly id: string;
  readonly parent: LinkedNode | null;
}

/** True when `node` is the holder or sits under it. Cycles return false. */
export function isInsideHolder(node: LinkedNode, holderId: string): boolean {
  const seen = new Set<string>();
  let current: LinkedNode | null = node;
  while (current) {
    if (current.id === holderId) return true;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    current = current.parent;
  }
  return false;
}
