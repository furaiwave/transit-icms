import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from "path"
import tailwindcss from "@tailwindcss/vite"
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@icms/shared": path.resolve(__dirname, "../server/shared/src"),
    },
  },
  server: {
    // shared/ lives outside the client root — allow the dev server to serve it
    fs: { allow: [path.resolve(__dirname, ".."), path.resolve(__dirname)] },
    // api.ts fetches relative paths and socket.ts uses io('/'), so dev traffic
    // must be proxied to the Nest server instead of hitting Vite itself.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
})
