import adapter from '@sveltejs/adapter-cloudflare';

const sharedLocalPersistPath = '/Users/n/Desktop/projects/__school/.wrangler/jajaco-shared-state/v3';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			config: 'wrangler.toml',
			platformProxy: {
				configPath: 'wrangler.toml',
				persist: { path: sharedLocalPersistPath }
			}
		})
	}
};

export default config;
