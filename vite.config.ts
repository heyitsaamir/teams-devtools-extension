import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, cpSync } from 'fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Copies manifest.json and public/ assets into dist/ after build.
 */
function copyExtensionAssets(): Plugin {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(__dirname, 'dist/manifest.json')
      );
      cpSync(
        resolve(__dirname, 'public/icons'),
        resolve(__dirname, 'dist/icons'),
        { recursive: true }
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionAssets()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: process.env.NODE_ENV === 'production',
    rollupOptions: {
      input: {
        devtools: resolve(__dirname, 'src/devtools.html'),
        panel: resolve(__dirname, 'src/panel/index.html'),
        background: resolve(__dirname, 'src/background.ts'),
        injected: resolve(__dirname, 'src/injected.ts'),
        'content-script': resolve(__dirname, 'src/content-script.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
