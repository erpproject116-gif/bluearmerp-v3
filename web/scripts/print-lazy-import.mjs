import fs from "node:fs";

const lazy = fs.readFileSync("src/routes/lazyPages.ts", "utf8");
const names = [...lazy.matchAll(/export const (\w+)/g)].map((m) => m[1]);
const importBlock = `import {\n  ${names.join(",\n  ")},\n} from "./routes/lazyPages";`;
fs.writeFileSync("src/routes/lazy-import-block.txt", importBlock);
console.log(names.length, "names");
