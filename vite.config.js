import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const eventsPolyfill = fileURLToPath(new URL("./node_modules/events/events.js", import.meta.url));

export default defineConfig({
  base: "/quasar-ui/",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^events$/, replacement: eventsPolyfill },
      { find: /^node:events$/, replacement: eventsPolyfill }
    ]
  },
  optimizeDeps: {
    include: ["events"]
  },
  build: {
    sourcemap: true,
    target: "es2022"
  },
  test: {
    environment: "node"
  }
});
