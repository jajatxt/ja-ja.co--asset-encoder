import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSanityWriteClient } from '$lib/server/sanity';

export const DELETE: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.isAuthenticated) throw error(401);

	const { documentId } = (await request.json()) as { documentId: string };

	if (!documentId) {
		throw error(400, 'Missing documentId');
	}

	const client = getSanityWriteClient(platform);

	// Fetch doc to find the asset reference
	const doc = await client.fetch<{ image?: { asset?: { _ref?: string } } } | null>(
		`*[_type == "curatedAsset" && _id == $id][0]{ image }`,
		{ id: documentId }
	);

	// Delete the document
	await client.delete(documentId);

	// Delete the image asset (curated uploads are not shared)
	if (doc?.image?.asset?._ref) {
		await client.delete(doc.image.asset._ref);
	}

	return json({ success: true });
};
