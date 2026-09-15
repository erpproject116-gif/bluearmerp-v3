import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
  const demoUserEmail =
    pickEnv(merged, "DEMO_USER_EMAIL", "VITE_DEMO_USER_EMAIL") || "demo@demo.bluearm.local";
  const demoUserPassword =
    pickEnv(merged, "DEMO_USER_PASSWORD", "VITE_DEMO_USER_PASSWORD") || "DemoBluearm2026!";

  if (mode === "production" && !apiBase) {
    console.warn(
      "[vite] VITE_API_BASE_URL is empty — set it in Vercel Environment Variables and redeploy.",
    );
  }

  return {
    plugins: [
      solid(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.png",
          "icons/apple-touch-icon.png",
          "icons/pwa-192.png",
          "icons/pwa-512.png",
          "icons/pwa-512-maskable.png",
          "bluearmerp-logo.png",
          "bluearm-computer-logo.png",
        ],
        manifest: {
          name: "Bluearm ERP",
          short_name: "Bluearm",
          description: "Floor-first manufacturing ERP — online only",
          display: "standalone",
          start_url: "/app/production",
          scope: "/",
          theme_color: "#3c50e0",
          background_color: "#ffffff",
          icons: [
            {
              src: "/icons/pwa-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Precache JS/CSS/icons only — never precache index.html (stale shell trapped PWAs
          // behind old paywall UI after deploy). Documents are NetworkFirst below.
          globPatterns: ["**/*.{js,css,ico,png,svg,woff2,webmanifest}"],
          globIgnores: ["**/tess/**", "**/index.html"],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api"),
              handler: "NetworkOnly",
              method: "GET",
            },
            {
              urlPattern: ({ request, url }) =>
                request.destination === "document" || url.pathname === "/" || url.pathname.endsWith(".html"),
              handler: "NetworkFirst",
              options: {
                cacheName: "bluearm-documents",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    envDir: ".",
    resolve: {
      dedupe: ["solid-js", "@solidjs/router"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const path = id.replace(/\\/g, "/");

            if (!path.includes("node_modules")) {
              if (path.includes("/src/shared/LoadingText") || path.includes("/src/shared/branding/uiLabel")) {
                return "app-ui-copy";
              }
              return undefined;
            }

            if (path.includes("solid-js") || path.includes("@solidjs/")) return "vendor-solid";
            if (path.includes("@supabase")) return "vendor-supabase";
            if (path.includes("@tanstack")) return "vendor-query";
            if (path.includes("tesseract") || path.includes("pdfjs-dist")) return "vendor-ocr";
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
      "import.meta.env.VITE_DEMO_USER_EMAIL": JSON.stringify(demoUserEmail),
      "import.meta.env.VITE_DEMO_USER_PASSWORD": JSON.stringify(demoUserPassword),
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
