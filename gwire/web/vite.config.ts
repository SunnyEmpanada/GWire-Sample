import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.VITE_API_PROXY ?? "http://127.0.0.1:3000";

const apiPrefixes = [
  "stats",
  "customers",
  "policies",
  "claims",
  "search",
  "applications",
  "addresses",
  "products",
  "billingAccounts",
  "tasks",
  "coderefs",
  "users",
  "providers",
  "openWork",
  "recentlyViewed",
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      apiPrefixes.map((p) => [
        `/${p}`,
        { target: api, changeOrigin: true },
      ])
    ),
  },
});
