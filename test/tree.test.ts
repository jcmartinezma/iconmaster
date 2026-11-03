import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isInsideHolder, type LinkedNode } from "../src/shared/tree.ts";

function node(id: string, parent: LinkedNode | null): LinkedNode {
  return { id, parent };
}

describe("temporary holder guard", () => {
  it("accepts the holder and anything parented under it", () => {
    const holder = node("holder", null);
    const copy = node("copy", holder);
    const vector = node("vector", copy);
    assert.equal(isInsideHolder(holder, "holder"), true);
    assert.equal(isInsideHolder(copy, "holder"), true);
    assert.equal(isInsideHolder(vector, "holder"), true);
  });

  it("rejects source layers and parent cycles", () => {
    const page = node("page", null);
    const icon = node("icon", page);
    assert.equal(isInsideHolder(icon, "holder"), false);

    const loop = node("a", null);
    const back = node("b", loop);
    (loop as { parent: LinkedNode | null }).parent = back;
    assert.equal(isInsideHolder(loop, "holder"), false);
  });
});
