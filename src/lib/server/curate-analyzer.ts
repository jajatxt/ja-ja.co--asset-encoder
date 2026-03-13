import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSanityWriteClient, sanityFetch } from '$lib/server/sanity';
import { getEnv } from '$lib/server/env';
import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from '$lib/gemini-models';

const VALID_MODEL_IDS: Set<string> = new Set(GEMINI_MODELS.map((m) => m.id));

function resolveModel(model?: string): string {
	if (model && VALID_MODEL_IDS.has(model)) return model;
	return DEFAULT_GEMINI_MODEL;
}

// ---------------------------------------------------------------------------
// Category schema — fetched from Sanity, cached to avoid per-image refetches
// ---------------------------------------------------------------------------

interface SanityCategory {
	number: number;
	name: string;
	description?: string;
}

const CATEGORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let categoryCache: { schemaText: string; fetchedAt: number } | null = null;

function buildSchemaText(categories: SanityCategory[]): string {
	const lines: string[] = [];
	let lastGroup = -1;

	for (const cat of categories) {
		const group = Math.floor(cat.number / 100);
		if (group !== lastGroup) {
			if (lines.length > 0) lines.push('');
			lastGroup = group;
		}
		let line = `  ${cat.number} – ${cat.name}`;
		if (cat.description) {
			line += ` — ${cat.description}`;
		}
		lines.push(line);
	}

	return lines.join('\n');
}

async function getCategorySchema(platform?: App.Platform): Promise<string> {
	const now = Date.now();
	if (categoryCache && now - categoryCache.fetchedAt < CATEGORY_CACHE_TTL) {
		return categoryCache.schemaText;
	}

	const categories = await sanityFetch<SanityCategory[]>(
		`*[_type == "jjcddsCategory" && internalOnly != true] | order(number asc) { number, name, description }`,
		{},
		platform
	);

	if (categories.length === 0) {
		throw new Error('No JJCDDS categories found in Sanity');
	}

	const schemaText = buildSchemaText(categories);
	categoryCache = { schemaText, fetchedAt: now };
	return schemaText;
}

interface JjcdsEntry {
	deweyCode: string;
	deweyCategory: string;
	confidence: number;
	reasoning?: string;
}

interface AnalysisResult {
	title: string;
	description: string;
	topSuggestion?: JjcdsEntry;
	deweyCode?: string;
	deweyCategory?: string;
	confidence?: number;
	alternatives?: JjcdsEntry[];
}

interface UsageMetadata {
	promptTokens: number;
	candidatesTokens: number;
	totalTokens: number;
}

function categorizeError(error: Error & { status?: number }): string {
	const msg = (error.message || '').toLowerCase();
	if (error.status === 401 || msg.includes('api key')) return 'api_key';
	if (error.status === 429 || msg.includes('quota')) return 'rate_limit';
	if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
	if (msg.includes('parse') || msg.includes('json')) return 'parse_error';
	if (msg.includes('fetch') || msg.includes('network')) return 'network';
	return 'unknown';
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (error) {
			const e = error as Error & { status?: number };
			if (e.status === 429 && i < maxRetries - 1) {
				await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
				continue;
			}
			throw error;
		}
	}
	throw new Error('Max retries exceeded');
}

/**
 * Run Gemini analysis on an image and return the parsed result + usage metadata.
 * Does NOT touch Sanity — caller decides what to do with the result.
 */
export async function analyzeImage(
	imageUrl: string,
	originalFilename: string | null | undefined,
	platform: App.Platform | undefined,
	modelOverride?: string
) {
	const imageResponse = await fetch(imageUrl);
	if (!imageResponse.ok) {
		throw new Error('Failed to fetch image from Sanity');
	}

	const arrayBuffer = await imageResponse.arrayBuffer();
	const base64 = Buffer.from(arrayBuffer).toString('base64');
	const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

	const genAI = new GoogleGenerativeAI(getEnv('GEMINI_API_KEY', platform));
	const model = genAI.getGenerativeModel({
		model: resolveModel(modelOverride),
		generationConfig: {
			responseMimeType: 'application/json',
			temperature: 0.2
		}
	});

	const schemaText = await getCategorySchema(platform);

	const prompt = `Analyze this image and classify it according to the JaJa Co Decimal System (JJCDS), a custom classification schema for architecture, design, and creative reference materials.

JJCDS Classification Categories:
${schemaText}

Use only the specific codes listed above. Category descriptions (when provided after the dash) clarify what belongs in each category — use them to guide your classification.

Return a JSON object with:
{
  "title": "A descriptive title for this image (2-5 words)",
  "description": "Brief description of image content (1-2 sentences)",
  "topSuggestion": {
    "deweyCode": "The best-fitting JJCDS code (e.g., '130')",
    "deweyCategory": "The full category name (e.g., 'Buildings')",
    "confidence": A number 0-100 indicating classification confidence
  },
  "alternatives": [
    {
      "deweyCode": "Second best code",
      "deweyCategory": "Category name",
      "confidence": 0-100,
      "reasoning": "Brief reason why this could also apply (1 sentence)"
    }
  ]
}

Include 3-5 alternatives ranked by confidence (highest first). If fewer make sense, include only those that genuinely fit.`;

	const result = await withRetry(() =>
		model.generateContent([
			{ inlineData: { mimeType, data: base64 } },
			{ text: prompt }
		])
	);

	const responseText = result.response.text();
	const usageMetadata = (result.response.usageMetadata || {}) as {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		totalTokenCount?: number;
	};

	const promptTokens = usageMetadata.promptTokenCount || 0;
	const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
	const totalTokens = usageMetadata.totalTokenCount || 0;

	let analysis: AnalysisResult;
	try {
		analysis = JSON.parse(responseText) as AnalysisResult;
	} catch {
		console.error('Failed to parse Gemini response:', responseText);
		analysis = {
			title: originalFilename?.replace(/\.[^/.]+$/, '') || 'Untitled',
			description: 'AI classification failed - manual review required',
			topSuggestion: { deweyCode: '000', deweyCategory: 'Unclassified', confidence: 0 },
			alternatives: []
		};
	}

	const topSuggestion: JjcdsEntry = analysis.topSuggestion || {
		deweyCode: analysis.deweyCode || '000',
		deweyCategory: analysis.deweyCategory || 'Unclassified',
		confidence: analysis.confidence || 0
	};

	const alternatives = (analysis.alternatives || []).slice(0, 5);

	return {
		analysis,
		topSuggestion,
		alternatives,
		usageMetadata: { promptTokens, candidatesTokens, totalTokens } as UsageMetadata
	};
}

/**
 * Analyze an image and patch the Sanity document with results.
 * On success: patches to status "draft" with all AI fields.
 * On failure: patches to status "error" with errorMessage.
 */
export async function analyzeAndPatchDocument(
	docId: string,
	imageUrl: string,
	originalFilename: string | null | undefined,
	platform: App.Platform | undefined,
	modelOverride?: string
) {
	const client = getSanityWriteClient(platform);

	try {
		const { analysis, topSuggestion, alternatives, usageMetadata } = await analyzeImage(
			imageUrl,
			originalFilename,
			platform,
			modelOverride
		);

		await client
			.patch(docId)
			.set({
				status: 'draft',
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
				}
			})
			.commit();

		return { success: true, analysis, topSuggestion, alternatives, usageMetadata };
	} catch (error) {
		const e = error as Error & { status?: number };
		console.error(`Analysis failed for document ${docId}:`, e);

		try {
			await client
				.patch(docId)
				.set({
					status: 'error',
					errorMessage: e.message || 'Analysis failed',
					aiSuggestions: {
						failedAt: new Date().toISOString(),
						errorType: categorizeError(e)
					}
				})
				.commit();
		} catch (patchError) {
			console.error(`Failed to patch error status for ${docId}:`, patchError);
		}

		return { success: false, error: e.message };
	}
}
