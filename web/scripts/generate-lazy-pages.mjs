import fs from "node:fs";
const app = fs.readFileSync("src/App.tsx", "utf8");
const lines = app.split("\n");
const imports = [];

for (const line of lines) {
  let m = line.match(/^import (\w+) from "\.\/modules\/(.+)";$/);
  if (m) {
    imports.push({ name: m[1], path: m[2] });
    continue;
  }
  m = line.match(/^import \{([^}]+)\} from "\.\/modules\/(.+)";$/);
  if (m) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) imports.push({ name, path: m[2], named: true });
    }
  }
}

const out = ['import { lazy } from "solid-js";', ""];
for (const imp of imports) {
  const modPath = "../modules/" + imp.path.replace(/\.tsx?$/, "");
  if (imp.named) {
    out.push(
      `export const ${imp.name} = lazy(() => import("${modPath}").then((m) => ({ default: m.${imp.name} })));`,
    );
  } else {
    out.push(`export const ${imp.name} = lazy(() => import("${modPath}"));`);
  }
}
out.push("");

fs.mkdirSync("src/routes", { recursive: true });
fs.writeFileSync("src/routes/lazyPages.ts", out.join("\n"));
console.log(`Generated ${imports.length} lazy exports`);
