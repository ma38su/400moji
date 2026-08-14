import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { serviceWorkerBuildPlugin } from "./scripts/service-worker-build.js";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), serviceWorkerBuildPlugin()],
});
