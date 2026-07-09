import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

/** Local .env files + Vercel/CI process.env (dashboard vars are not in .env files). */
function pickEnv(env: Record<string, string>, key: string, viteKey: string) {
  return (
    env[viteKey] ||
    env[key] ||
    process.env[viteKey] ||
    process.env[key] ||
    ""
  );
}

export default defineConfig(({ mode }) => {
  // web/.env.local (local) + optional repo-root .env
  const webEnv = loadEnv(mode, ".", "");
  const rootEnv = loadEnv(mode, "..", "");
  const merged = { ...rootEnv, ...webEnv };

  const supabaseUrl = pickEnv(merged, "SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseAnon = pickEnv(merged, "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  const apiBase =
    mode === "development" ? "" : pickEnv(merged, "VITE_API_BASE_URL", "VITE_API_BASE_URL");
  const demoSignInEnabled = pickEnv(merged, "VITE_DEMO_SIGNIN_ENABLED", "VITE_DEMO_SIGNIN_ENABLED") === "true";

  if (mode === "production" && !apiBase) {
    console.warn(
      "[vite] VITE_API_BASE_URL is empty — set it in Vercel Environment Variables and redeploy.",
    );
  }

  return {
    plugins: [solid(), tailwindcss()],
    envDir: ".",
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const path = id.replace(/\\/g, "/");

            if (path.includes("node_modules")) {
              if (path.includes("solid-js") || path.includes("@solidjs/")) return "vendor-solid";
              if (path.includes("@supabase")) return "vendor-supabase";
              if (path.includes("@tanstack")) return "vendor-query";
              if (path.includes("tesseract") || path.includes("pdfjs-dist")) return "vendor-ocr";
              return "vendor";
            }

            // Shared shell + UI helpers: keep out of feature chunks so modules do not
            // import Solid/components from each other (causes circular chunk graphs).
            if (path.includes("/src/shared/") || path.includes("/src/shell/")) {
              return "app-shared";
            }

            if (path.includes("/modules/finance/")) return "module-finance";
            if (path.includes("/modules/inventory/")) return "module-inventory";
            if (path.includes("/modules/sales/")) return "module-sales";
            if (path.includes("/modules/sales-order/")) return "module-sales-order";
            if (
              path.includes("/modules/purchase-request/") ||
              path.includes("/modules/purchase-order/") ||
              path.includes("/modules/buying/")
            ) {
              return "module-purchasing";
            }
            if (path.includes("/modules/quotation/")) return "module-quotation";
            if (path.includes("/modules/crm/")) return "module-crm";
            if (path.includes("/modules/documentation/")) return "module-docs";
            return undefined;
          },
        },
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnon),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase),
      "import.meta.env.VITE_DEMO_SIGNIN_ENABLED": JSON.stringify(demoSignInEnabled),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },
  };
});
