import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    dedupe: ["solid-js", "@solidjs/router"],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test.ts,test.tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
  },
});
