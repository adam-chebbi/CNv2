import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Standalone static site (same pattern as ../showcase) — content is pre-rendered at build time
// by scripts/build-content.mjs (npm run build-content, wired as pre/predev + prebuild) into
// src/generated/*.json, which this app then just imports and renders. Adding/editing a .md file
// under content/ and re-running the build is the entire authoring workflow — no route or nav
// code to touch.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
