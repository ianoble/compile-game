import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// When this template lives in the-golden-ages repo, the engine is at ../noble-bg-engine/packages/engine.
// When copied into the noble-bg-engine repo (e.g. packages/my-game/), use: path.resolve(__dirname, '../engine/src')
// and set dependency in package.json to "file:../engine". See README.md.
export default defineConfig({
	plugins: [vue(), tailwindcss()],
	resolve: {
		dedupe: ['vue', 'pinia'],
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@engine': path.resolve(__dirname, 'noble-bg-engine/packages/engine/src'),
			'@engine/client': path.resolve(__dirname, 'noble-bg-engine/packages/engine/src/client/index'),
		},
	},
	// Development server configuration (default port 5173 if omitted)
	server: {
		port: 5173,
		open: true,
		host: true, // Allow external connections for network testing
	},
	// Build optimizations
	build: {
		target: 'es2015',
		cssCodeSplit: true,
		sourcemap: true,
		rollupOptions: {
			output: {
				manualChunks: {
					// Separate vendor chunk for better caching
					vendor: ['vue', 'pinia'],
					// Separate engine chunk
					engine: ['@engine/client'],
				},
			},
		},
		// Optimize chunk size warnings
		chunkSizeWarningLimit: 1000,
	},
	// CSS processing
	css: {
		devSourcemap: true,
	},
	// Define global constants
	define: {
		__VUE_OPTIONS_API__: false, // Disable Options API for smaller bundle if not used
		__VUE_PROD_DEVTOOLS__: false,
	},
});
