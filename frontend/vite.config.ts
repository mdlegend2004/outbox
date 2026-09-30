import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.VITE_API_PROXY ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API → the httpOnly session cookie is first-party, no CORS dance.
    proxy: {
      "/api": { target: API, changeOrigin: false },
      "/admin/queues": { target: API, changeOrigin: false },
    },
    // Allow tunnel hosts (ngrok / cloudflared) used for the Slack HTTPS redirect.
    allowedHosts: true,
  },
});
