import esbuild from "esbuild";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const ui = await esbuild.build({
  entryPoints: ["src/ui/ui.ts"],
  bundle: true,
  write: false,
  target: "es2017",
  format: "iife",
  logLevel: "info",
});

if (ui.outputFiles.length !== 1) {
  throw new Error("Expected a single UI bundle.");
}

const uiJs = ui.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("src/ui/ui.html", "utf8").replace(
  "<!-- ui-script -->",
  () => `<script>\n${uiJs}\n</script>`,
);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/ui.html", html);
rmSync("dist/ui.js", { force: true });

await esbuild.build({
  entryPoints: ["src/plugin/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  format: "iife",
  logLevel: "info",
  define: {
    __html__: JSON.stringify(html),
  },
});

const code = readFileSync("dist/code.js", "utf8");
if (!code.includes("Exportar SVG")) {
  throw new Error("code.js is missing the plugin UI.");
}
if (!readFileSync("dist/ui.html", "utf8").includes("Exportar SVG")) {
  throw new Error("ui.html is missing the export button.");
}
