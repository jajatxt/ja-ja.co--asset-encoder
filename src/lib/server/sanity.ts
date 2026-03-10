// Server-only authenticated Sanity clients.
// Reads tokens from platform.env (Cloudflare Workers) or .env (local dev).

import { createClient } from '@sanity/client';
import { projectId, dataset } from '$lib/sanity/client';
import { getEnv, getEnvOptional } from '$lib/server/env';

function getReadClient(platform?: App.Platform) {
	return createClient({
		projectId,
		dataset,
		apiVersion: getEnvOptional('SANITY_API_VERSION', platform) || '2025-10-01',
		token: getEnv('SANITY_READ_TOKEN', platform),
		useCdn: false
	});
}

function getWriteClient(platform?: App.Platform) {
	const token =
		getEnvOptional('SANITY_WRITE_TOKEN', platform) ??
		getEnvOptional('SANITY_READ_WRITE_TOKEN', platform);
	if (!token) {
		throw new Error('SANITY_WRITE_TOKEN (or SANITY_READ_WRITE_TOKEN) is required');
	}
	return createClient({
		projectId,
		dataset,
		apiVersion: getEnvOptional('SANITY_API_VERSION', platform) || '2025-10-01',
		token,
		useCdn: false
	});
}

/** Fetch data from the private Sanity dataset. */
export async function sanityFetch<T = unknown>(
	query: string,
	params?: Record<string, unknown>,
	platform?: App.Platform
): Promise<T> {
	return getReadClient(platform).fetch<T>(query, params ?? {});
}

/** Get a write-capable client for creating/patching/deleting documents. */
export function getSanityWriteClient(platform?: App.Platform) {
	return getWriteClient(platform);
}
