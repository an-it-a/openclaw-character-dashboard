import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Use a function-style config so that loadEnv can read .env / .env.local
// before the config object is built. This is necessary because Vite only
// loads .env files for the client bundle — process.env does NOT include them
// at config-evaluation time.
export default defineConfig(({ mode }) => {
  // Load all vars (empty prefix = no filter) from .env, .env.local, etc.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    // Allow overriding the public/assets directory via VITE_PUBLIC_DIR.
    // Supports absolute and relative paths. Defaults to ./public.
    // Set this in .env.local (gitignored) to point at a custom asset pack.
    publicDir: env.VITE_PUBLIC_DIR ?? "./public",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: `http://localhost:${env.VITE_API_PORT ?? 3001}`,
          changeOrigin: true,
        },
      },
    },
  };
});
