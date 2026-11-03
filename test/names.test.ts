import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignFileNames, kebab, variantBaseName } from "../src/shared/names.ts";

describe("file names", () => {
  it("kebab-cases layer names", () => {
    assert.equal(kebab("Arrow Right"), "arrow-right");
    assert.equal(kebab("arrowRight"), "arrow-right");
    assert.equal(kebab("XMLParser"), "xml-parser");
    assert.equal(kebab("Flèche"), "fleche");
    assert.equal(kebab("arrow-24"), "arrow-24");
    assert.equal(kebab(""), "");
  });

  it("uses variant values only, in the given order", () => {
    assert.equal(variantBaseName(["arrow", "24"]), "arrow-24");
    assert.equal(variantBaseName(["Arrow Right", "24"]), "arrow-right-24");
    assert.equal(variantBaseName([]), "icon");
  });

  it("applies prefix and suffix and numbers duplicates", () => {
    assert.deepEqual(assignFileNames(["arrow-24"], "icon", ""), ["icon-arrow-24.svg"]);
    assert.deepEqual(assignFileNames(["arrow-24"], "", "bold"), ["arrow-24-bold.svg"]);
    assert.deepEqual(assignFileNames(["arrow-24"], "UI Icon", "Bold"), ["ui-icon-arrow-24-bold.svg"]);
    assert.deepEqual(assignFileNames(["arrow-24", "arrow-24"], "", ""), ["arrow-24.svg", "arrow-24-2.svg"]);
    assert.deepEqual(assignFileNames(["", ""], "", ""), ["icon.svg", "icon-2.svg"]);
  });
});
