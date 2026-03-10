/**
 * Environment variable helper.
 * Tries platform.env (Cloudflare Workers) first, falls back to
 * $env/dynamic/private (SvelteKit .env files for local dev).
 */
import { env } from '$env/dynamic/private';

export function getEnv(key: string, platform?: App.Platform): string {
	const value =
		(platform?.env as Record<string, string> | undefined)?.[key] ?? env[key];
	if (!value) {
		throw new Error(`Missing environment variable: ${key}`);
	}
	return value;
}

export function getEnvOptional(key: string, platform?: App.Platform): string | undefined {
	return (platform?.env as Record<string, string> | undefined)?.[key] ?? env[key];
}
