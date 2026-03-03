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
			'@engine': path.resolve(__dirname, '../noble-bg-engine/packages/engine/src'),
		},
	},
});
