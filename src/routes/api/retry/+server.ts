import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSanityWriteClient } from '$lib/server/sanity';
import { analyzeAndPatchDocument } from '$lib/server/curate-analyzer';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.isAuthenticated) throw error(401);

	const { documentId } = (await request.json()) as { documentId: string };

	if (!documentId) {
		throw error(400, 'Missing documentId');
	}

	const client = getSanityWriteClient(platform);

	const doc = await client.fetch<{
		_id: string;
		status: string;
		originalFilename?: string;
		image?: { asset?: { _id: string; url: string } };
	} | null>(
		`*[_type == "curatedAsset" && _id == $id][0]{
			_id, status, originalFilename,
			image { asset-> { _id, url } }
		}`,
		{ id: documentId }
	);

	if (!doc) throw error(404, 'Document not found');

	if (!['error', 'pending'].includes(doc.status)) {
		throw error(400, 'Document is not in a retryable state');
	}

	const imageUrl = doc.image?.asset?.url;
	if (!imageUrl) throw error(400, 'No image URL found on document');

	// Reset to pending
	await client.patch(documentId).set({ status: 'pending' }).unset(['errorMessage']).commit();

	// Schedule re-analysis — waitUntil runs after response; fall back to inline for dev
	const analysisPromise = analyzeAndPatchDocument(
		documentId,
		imageUrl,
		doc.originalFilename,
		platform
	);
	if (platform?.ctx?.waitUntil) {
		platform.ctx.waitUntil(analysisPromise);
	} else {
		analysisPromise.catch((e) => console.error('Retry analysis failed:', e));
	}

	return json({ success: true, status: 'pending' });
};
