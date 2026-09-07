import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  build: { manifest: true },
  preview: { proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:4000", changeOrigin: true } } },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
});
