import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSanityWriteClient } from '$lib/server/sanity';
import { analyzeImage } from '$lib/server/curate-analyzer';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.isAuthenticated) throw error(401);

	const { assetId, imageUrl, originalFilename } = (await request.json()) as {
		assetId: string;
		imageUrl: string;
		originalFilename?: string;
	};

	if (!assetId || !imageUrl) {
		throw error(400, 'Missing assetId or imageUrl');
	}

	const { analysis, topSuggestion, alternatives, usageMetadata } = await analyzeImage(
		imageUrl,
		originalFilename,
		platform
	);

	const client = getSanityWriteClient(platform);
	const doc = await client.create({
		_type: 'curatedAsset',
		status: 'draft',
		image: {
			_type: 'image',
			asset: { _type: 'reference', _ref: assetId }
		},
		title: analysis.title,
		deweyCode: topSuggestion.deweyCode,
		deweyCategory: topSuggestion.deweyCategory,
		description: analysis.description,
		aiConfidence: topSuggestion.confidence,
		aiSuggestions: {
			title: analysis.title,
			deweyCode: topSuggestion.deweyCode,
			deweyCategory: topSuggestion.deweyCategory,
			description: analysis.description,
			confidence: topSuggestion.confidence,
			alternatives,
			usageMetadata,
			analyzedAt: new Date().toISOString()
		},
		originalFilename: originalFilename || null
	});

	return json({
		success: true,
		document: {
			_id: doc._id,
			title: doc.title,
			deweyCode: doc.deweyCode,
			deweyCategory: doc.deweyCategory,
			description: doc.description,
			aiConfidence: doc.aiConfidence
		},
		analysis: {
			title: analysis.title,
			description: analysis.description,
			topSuggestion,
			alternatives
		},
		usageMetadata
	});
};
