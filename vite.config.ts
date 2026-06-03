/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom', 'react-router-dom'],
                    supabase: ['@supabase/supabase-js'],
                    ui: ['lucide-react', 'react-hook-form', 'zod']
                }
            }
        },
        chunkSizeWarningLimit: 800
    },
    server: {
        port: 3000,
        open: true
    },
    test: {
        environment: 'jsdom',
        globals: true
    }
});
