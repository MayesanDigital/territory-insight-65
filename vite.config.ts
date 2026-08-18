// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Producción se despliega en Vercel. Sin esto, nitro cae en su preset por
  // defecto (cloudflare-module) y genera un worker que Vercel no sabe servir.
  // Dentro de un build de Lovable este override se ignora: la plataforma fuerza
  // Cloudflare para su propio preview, así que fijarlo aquí no rompe el sync.
  nitro: { preset: "vercel" },
});
