import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSanityWriteClient } from '$lib/server/sanity';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.isAuthenticated) throw error(401);

	const { documentId, updates } = (await request.json()) as {
		documentId: string;
		updates?: {
			title?: string;
			deweyCode?: string;
			description?: string;
		};
	};

	if (!documentId) throw error(400, 'Missing documentId');

	const client = getSanityWriteClient(platform);

	// Fetch the staging curatedAsset
	const staging = await client.fetch<{
		_id: string;
		title?: string;
		description?: string;
		deweyCode?: string;
		image?: { _type: string; asset: { _type: string; _ref: string } };
	} | null>(
		`*[_type == "curatedAsset" && _id == $id][0]{
			_id, title, description, deweyCode, image
		}`,
		{ id: documentId }
	);

	if (!staging) throw error(404, 'Staging document not found');
	if (!staging.image) throw error(400, 'Staging document has no image');

	// Resolve final values — editor overrides take precedence
	const title = updates?.title || staging.title || 'Untitled';
	const deweyCode = updates?.deweyCode || staging.deweyCode;
	const description = updates?.description || staging.description;

	if (!deweyCode) throw error(400, 'No category code assigned');

	// Find the jjcddsCategory document by number
	const category = await client.fetch<{ _id: string; number: number; name: string } | null>(
		`*[_type == "jjcddsCategory" && number == $num][0]{ _id, number, name }`,
		{ num: parseInt(deweyCode, 10) }
	);

	if (!category) throw error(400, `No JJCDDS category found for code ${deweyCode}`);

	// Get next sequential number in this category
	const nextNumber: number = await client.fetch(
		`coalesce(*[_type == "encodedAsset" && category._ref == $catId] | order(number desc)[0].number, 0) + 1`,
		{ catId: category._id }
	);

	// Create the encodedAsset (matches jajaco--backend schema)
	const encoded = await client.create({
		_type: 'encodedAsset',
		title,
		category: { _type: 'reference', _ref: category._id },
		number: nextNumber,
		image: staging.image,
		...(description ? { description } : {})
	});

	// Delete the staging curatedAsset (image asset is preserved — now used by encodedAsset)
	await client.delete(documentId);

	return json({
		success: true,
		encodedAsset: {
			_id: encoded._id,
			title,
			deweyCode: `${category.number}-${nextNumber}`,
			categoryName: category.name
		}
	});
};
