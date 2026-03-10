import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSanityWriteClient } from '$lib/server/sanity';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.isAuthenticated) throw error(401);

	const body = await request.json().catch(() => ({}) as { minConfidence?: number });
	const minConfidence: number = (body as { minConfidence?: number }).minConfidence ?? 80;

	const client = getSanityWriteClient(platform);

	// Fetch all high-confidence staging drafts
	const drafts = await client.fetch<
		{
			_id: string;
			title?: string;
			description?: string;
			deweyCode?: string;
			image?: { _type: string; asset: { _type: string; _ref: string } };
		}[]
	>(
		`*[_type == "curatedAsset" && status == "draft" && aiConfidence >= $minConfidence]{
			_id, title, description, deweyCode, image
		}`,
		{ minConfidence }
	);

	if (drafts.length === 0) {
		return json({ success: true, approved: 0, skipped: 0 });
	}

	// Fetch all jjcddsCategory documents for lookup
	const categories = await client.fetch<{ _id: string; number: number; name: string }[]>(
		`*[_type == "jjcddsCategory"]{ _id, number, name }`
	);
	const categoryByNumber = new Map(categories.map((c) => [c.number, c]));

	// Track assigned numbers per category to avoid collisions within the batch
	const nextNumbers = new Map<string, number>();

	async function getNextNumber(catId: string): Promise<number> {
		if (!nextNumbers.has(catId)) {
			const max: number = await client.fetch(
				`coalesce(*[_type == "encodedAsset" && category._ref == $catId] | order(number desc)[0].number, 0)`,
				{ catId }
			);
			nextNumbers.set(catId, max + 1);
		}
		const num = nextNumbers.get(catId)!;
		nextNumbers.set(catId, num + 1);
		return num;
	}

	let approved = 0;
	let skipped = 0;

	for (const draft of drafts) {
		if (!draft.deweyCode || !draft.image) {
			skipped++;
			continue;
		}

		const category = categoryByNumber.get(parseInt(draft.deweyCode, 10));
		if (!category) {
			console.warn(`Batch approve: skipping ${draft._id} — no category for code ${draft.deweyCode}`);
			skipped++;
			continue;
		}

		const nextNum = await getNextNumber(category._id);

		await client.create({
			_type: 'encodedAsset',
			title: draft.title || 'Untitled',
			category: { _type: 'reference', _ref: category._id },
			number: nextNum,
			image: draft.image,
			...(draft.description ? { description: draft.description } : {})
		});

		await client.delete(draft._id);
		approved++;
	}

	return json({ success: true, approved, skipped });
};
