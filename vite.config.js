import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/quasar-ui/",
  plugins: [react()],
  build: {
    sourcemap: true,
    target: "es2022"
  },
  test: {
    environment: "node"
  }
});
