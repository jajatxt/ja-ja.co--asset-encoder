import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSanityWriteClient } from '$lib/server/sanity';
import { analyzeAndPatchDocument } from '$lib/server/curate-analyzer';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.isAuthenticated) throw error(401);

	const formData = await request.formData();
	const file = formData.get('file');

	if (!file || !(file instanceof File)) {
		throw error(400, 'No file provided');
	}

	const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
	if (!validTypes.includes(file.type)) {
		throw error(400, `Invalid file type: ${file.type}. Supported: JPEG, PNG, WebP, GIF`);
	}

	const maxSize = 20 * 1024 * 1024;
	if (file.size > maxSize) {
		throw error(
			400,
			`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 20MB`
		);
	}

	const client = getSanityWriteClient(platform);

	// Upload image asset to Sanity
	const buffer = Buffer.from(await file.arrayBuffer());
	const imageAsset = await client.assets.upload('image', buffer, {
		filename: file.name,
		contentType: file.type
	});

	// Check for duplicate — same image asset already has a curatedAsset
	const existing = await client.fetch<{ _id: string; status: string } | null>(
		`*[_type == "curatedAsset" && image.asset._ref == $assetRef][0]{ _id, status }`,
		{ assetRef: imageAsset._id }
	);

	if (existing) {
		return json({
			success: true,
			duplicate: true,
			document: { _id: existing._id, status: existing.status }
		});
	}

	// Create pending document immediately
	const doc = await client.create({
		_type: 'curatedAsset',
		status: 'pending',
		image: {
			_type: 'image',
			asset: { _type: 'reference', _ref: imageAsset._id }
		},
		originalFilename: imageAsset.originalFilename || file.name
	});

	// Schedule analysis — waitUntil runs after response; fall back to inline for dev
	const analysisPromise = analyzeAndPatchDocument(
		doc._id,
		imageAsset.url,
		imageAsset.originalFilename || file.name,
		platform
	);
	if (platform?.ctx?.waitUntil) {
		platform.ctx.waitUntil(analysisPromise);
	} else {
		// Dev: run inline (response waits, but analysis actually executes)
		analysisPromise.catch((e) => console.error('Analysis failed:', e));
	}

	return json({
		success: true,
		document: {
			_id: doc._id,
			status: 'pending',
			originalFilename: imageAsset.originalFilename || file.name,
			image: {
				asset: { _id: imageAsset._id, url: imageAsset.url }
			}
		}
	});
};
