import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 15140,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
});
