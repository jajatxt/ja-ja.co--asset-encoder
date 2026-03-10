// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			isAuthenticated: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				AUTH_PASSWORD: string;
				SANITY_READ_TOKEN: string;
				SANITY_WRITE_TOKEN: string;
				SANITY_API_VERSION?: string;
				GEMINI_API_KEY: string;
			};
			ctx?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
