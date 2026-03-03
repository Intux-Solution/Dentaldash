/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
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
