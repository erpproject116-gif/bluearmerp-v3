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
            if (!id.includes("node_modules")) {
              if (id.includes("/modules/finance/")) return "module-finance";
              if (id.includes("/modules/inventory/")) return "module-inventory";
              if (id.includes("/modules/sales/")) return "module-sales";
              if (id.includes("/modules/sales-order/")) return "module-sales-order";
              if (id.includes("/modules/purchase-request/") || id.includes("/modules/purchase-order/") || id.includes("/modules/buying/")) {
                return "module-purchasing";
              }
              if (id.includes("/modules/quotation/")) return "module-quotation";
              if (id.includes("/modules/crm/")) return "module-crm";
              if (id.includes("/modules/documentation/")) return "module-docs";
              return undefined;
            }
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@tanstack")) return "vendor-query";
            return "vendor";
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
