import { sveltekit } from '@sveltejs/kit/vite';
import { basename } from 'node:path';
import { defineConfig } from 'vite';

// Deterministic port from project folder name. Must match the FNV-1a hash in
// ~/.localdev/port-hash.mjs so Caddy's reverse_proxy lines hit the right port.
function nameToPort(name: string, base = 10000, range = 50000): number {
	let h = 2166136261;
	for (let i = 0; i < name.length; i++) {
		h ^= name.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return base + (Math.abs(h | 0) % range);
}

const projectName = basename(process.cwd());
const port = nameToPort(projectName);

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port,
		strictPort: true
	}
});
