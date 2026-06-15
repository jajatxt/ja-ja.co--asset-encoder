// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
	type D1Primitive = string | number | boolean | null;

	interface D1Result {
		meta?: {
			changes?: number;
			last_row_id?: number;
		};
	}

	interface D1ResultSet<T = unknown> {
		results: T[];
	}

	interface D1PreparedStatement {
		bind(...values: D1Primitive[]): D1PreparedStatement;
		first<T = unknown>(): Promise<T | null>;
		all<T = unknown>(): Promise<D1ResultSet<T>>;
		run(): Promise<D1Result>;
	}

	interface D1Database {
		prepare(query: string): D1PreparedStatement;
	}

	interface KVNamespace {
		get(key: string): Promise<string | null>;
	}

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
				DB?: D1Database;
				ACTIVE_PATHS?: KVNamespace;
				FRONTEND_ORIGIN?: string;
				FRONTEND_ADMIN_TOKEN?: string;
				FRONTEND_SHARE_LINK_TOKEN?: string;
				FRONTEND_ACCESS_LINK_BASE_PATH?: string;
				EMAIL_PROVIDER?: string;
				RESEND_API_KEY?: string;
				ACCESS_EMAIL_FROM?: string;
				ACCESS_EMAIL_REPLY_TO?: string;
			};
			ctx?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
