import fs from "node:fs";

const appPath = "src/App.tsx";
const app = fs.readFileSync(appPath, "utf8");
const lazyImport = fs.readFileSync("src/routes/lazy-import-block.txt", "utf8");

const start = app.indexOf("import PartnersPage");
const end = app.indexOf('import { queryClient } from "./shared/queryClient";');
if (start < 0 || end < 0) {
  console.error("markers not found", start, end);
  process.exit(1);
}

const head = app.slice(0, start);
const tail = app.slice(end);

const suspenseImport = head.includes("Suspense")
  ? head
  : head.replace(
      'import { Route, Router, type RouteSectionProps, Navigate, useLocation } from "@solidjs/router";',
      'import { Route, Router, type RouteSectionProps, Navigate, useLocation } from "@solidjs/router";\nimport { Suspense } from "solid-js";',
    );

const head2 = suspenseImport.includes("PageLoader")
  ? suspenseImport
  : suspenseImport.replace(
      'import { ProtectedRoute } from "./shared/ProtectedRoute";',
      'import { ProtectedRoute } from "./shared/ProtectedRoute";\nimport { PageLoader } from "./shared/PageLoader";',
    );

const next = `${head2}${lazyImport}\n\n${tail}`;
fs.writeFileSync(appPath, next);
console.log("App.tsx updated");
