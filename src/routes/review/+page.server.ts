import type { PageServerLoad } from './$types';
import { sanityFetch } from '$lib/server/sanity';

interface CuratedAsset {
	_id: string;
	status: 'pending' | 'draft' | 'error';
	title?: string;
	deweyCode?: string;
	deweyCategory?: string;
	description?: string;
	aiConfidence?: number;
	originalFilename?: string;
	errorMessage?: string;
	aiSuggestions?: {
		title?: string;
		deweyCode?: string;
		deweyCategory?: string;
		description?: string;
		confidence?: number;
		alternatives?: Array<{
			deweyCode: string;
			deweyCategory: string;
			confidence: number;
			reasoning?: string;
		}>;
		usageMetadata?: {
			promptTokens: number;
			candidatesTokens: number;
			totalTokens: number;
			costUsd: number;
		};
		analyzedAt?: string;
		failedAt?: string;
		errorType?: string;
	};
	image?: {
		asset?: {
			_id: string;
			url: string;
			metadata?: { dimensions?: { width: number; height: number } };
		};
	};
	_createdAt: string;
}

export const load: PageServerLoad = async ({ platform }) => {
	const [drafts, publishedCount, categories] = await Promise.all([
		sanityFetch<CuratedAsset[]>(
			`*[_type == "curatedAsset" && status in ["pending", "draft", "error"]] | order(_createdAt desc) {
				_id, status, title, deweyCode, deweyCategory, description,
				aiConfidence, originalFilename, errorMessage, aiSuggestions,
				image { asset-> { _id, url, metadata { dimensions } } },
				_createdAt
			}`,
			{},
			platform
		).catch(() => [] as CuratedAsset[]),
		sanityFetch<number>(
			`count(*[_type == "encodedAsset"])`,
			{},
			platform
		).catch(() => 0),
		sanityFetch<{ _id: string; number: number; name: string }[]>(
			`*[_type == "jjcddsCategory"] | order(number asc) { _id, number, name }`,
			{},
			platform
		).catch(() => [])
	]);

	return { drafts, publishedCount, categories };
};
