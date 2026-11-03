import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCurrentColor, enforceFrameViewBox } from "../src/shared/svg.ts";

const SAMPLE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="24" fill="#000000" fill-opacity="0"/>
<path d="M0 0h10" fill="black" fill-opacity="0.4"/>
<path d="M1 1h2" fill="none" stroke="#000"/>
<path d="M0 0h1" fill="url(#grad)"/>
</svg>`;

describe("svg post-processing", () => {
  it("locks the viewBox to the icon frame and drops the transparent bounds rect", () => {
    const result = enforceFrameViewBox(SAMPLE, 24, 24);
    assert.match(result, /viewBox="0 0 24 24"/);
    assert.match(result, /width="24"/);
    assert.match(result, /height="24"/);
    assert.equal(result.includes("<rect"), false);
    assert.match(result, /fill="black"/);
    assert.match(result, /fill="none"/);
  });

  it("keeps a real full-size rectangle", () => {
    const svg = `<svg width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="#000000"/></svg>`;
    const result = enforceFrameViewBox(svg, 24, 24);
    assert.match(result, /<rect[^>]*fill="#000000"/);
  });

  it("replaces solid paints with currentColor and preserves none, urls, and opacity", () => {
    const result = applyCurrentColor(enforceFrameViewBox(SAMPLE, 24, 24));
    assert.match(result, /fill="currentColor" fill-opacity="0.4"/);
    assert.match(result, /stroke="currentColor"/);
    assert.match(result, /fill="none"/);
    assert.match(result, /fill="url\(#grad\)"/);
    assert.doesNotMatch(result, /fill="black"/);
    assert.doesNotMatch(result, /#000/);
  });
});
