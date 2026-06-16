import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	buildScopeConfig,
	cleanAllowedScopes,
	cleanMode,
	createAccessLink,
	getAccessLinkConfig,
	getDb,
	loadPageOptions,
	loadReadingRoomPathsForSelectedPages,
	loadRecentAccessLinks,
	parseAccessWindow,
	positiveInt,
	revokeAccessLink,
	type AccessMode,
	type AccessLinkRow,
	type AllowedScopeValue,
	type PageOption
} from '$lib/server/access-links';

interface AccessLinkFormState {
	createdUrl?: string;
	error?: string;
	label?: string;
	mode?: AccessMode;
	maxRedemptions?: number;
	maxUniquePaths?: number;
	allowedScopes?: AllowedScopeValue[];
	scopePaths?: string[];
	accessDurationMinutes?: number;
	linkExpiresInMinutes?: number;
	bindToCurrentCycle?: boolean;
	includeReadingRoomAssets?: boolean;
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const config = getAccessLinkConfig(platform);
	const db = getDb(platform);
	let accessLinks: AccessLinkRow[] = [];
	let pageOptions: PageOption[] = [];
	let loadError: string | null = null;
	const access = url.searchParams.get('access') ?? '';
	const initial: AccessLinkFormState = {
		label: url.searchParams.get('label') ?? '',
		mode: cleanMode(url.searchParams.get('mode')),
		allowedScopes: cleanAllowedScopes(url.searchParams.getAll('scope'))
	};

	try {
		pageOptions = await loadPageOptions(platform);
	} catch {
		pageOptions = [];
	}

	if (!db) {
		loadError = 'Shared DB binding not configured';
	} else {
		try {
			accessLinks = await loadRecentAccessLinks(db, platform, access);
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Unable to load access links';
		}
	}

	return {
		frontendOrigin: config.origin,
		accessLinkBasePath: config.accessLinkBasePath,
		sharedDbConfigured: Boolean(db),
		accessLinks,
		pageOptions,
		loadError,
		filters: { access },
		initial
	};
};

export const actions: Actions = {
	revoke: async ({ request, platform }) => {
		const data = await request.formData();
		const db = getDb(platform);
		const id = Number(data.get('id'));

		if (!db) return fail(400, { error: 'Shared DB binding not configured' });

		try {
			await revokeAccessLink(db, id);
			return { revokedId: id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Unable to revoke access link' });
		}
	},
	create: async ({ request, platform }) => {
		const data = await request.formData();
		const db = getDb(platform);
		const mode = cleanMode(data.get('mode'));
		const label = String(data.get('label') ?? '').trim();
		const maxRedemptions = positiveInt(data.get('maxRedemptions'), 1);
		const maxUniquePaths = positiveInt(data.get('maxUniquePaths'), 5);
		const allowedScopes = cleanAllowedScopes(data.getAll('allowedScopes'));
		const includeReadingRoomAssets = data.get('includeReadingRoomAssets') === 'on';
		let scopeConfig: ReturnType<typeof buildScopeConfig>;
		try {
			scopeConfig = buildScopeConfig(mode, allowedScopes, data.getAll('scopePaths'));
			if (includeReadingRoomAssets && allowedScopes.includes('selected-paths')) {
				const readingRoomPaths = await loadReadingRoomPathsForSelectedPages(platform, scopeConfig.scopePaths);
				scopeConfig = {
					...scopeConfig,
					scopePaths: Array.from(new Set([...scopeConfig.scopePaths, ...readingRoomPaths]))
				};
			}
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Unable to create access link',
				label,
				mode,
				maxRedemptions,
				maxUniquePaths,
				allowedScopes,
				includeReadingRoomAssets
			});
		}
		const accessWindow = parseAccessWindow(data.get('accessWindow') ?? data.get('accessDurationMinutes'), 10080);
		const accessDurationMinutes = accessWindow.accessDurationMinutes;
		const linkExpiresInMinutes = positiveInt(data.get('linkExpiresInMinutes'), 10080);
		const bindToCurrentCycle = accessWindow.bindToCurrentCycle;

		if (!db) {
			return fail(400, {
				error: 'Shared DB binding not configured',
				label,
				mode,
				startPath: scopeConfig.startPath,
				maxRedemptions,
				maxUniquePaths,
				allowedScopes,
				scopePaths: scopeConfig.scopePaths,
				includeReadingRoomAssets,
				accessDurationMinutes,
				linkExpiresInMinutes,
				bindToCurrentCycle
			});
		}

		try {
			const created = await createAccessLink(db, platform, {
				label,
				mode,
				...scopeConfig,
				maxRedemptions,
				maxUniquePaths,
				accessDurationMinutes,
				linkExpiresInMinutes,
				bindToCurrentCycle
			});

			return { createdUrl: created.url };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Unable to create access link',
				label,
				mode,
				startPath: scopeConfig.startPath,
				maxRedemptions,
				maxUniquePaths,
				allowedScopes,
				scopePaths: scopeConfig.scopePaths,
				includeReadingRoomAssets,
				accessDurationMinutes,
				linkExpiresInMinutes,
				bindToCurrentCycle
			});
		}
	}
};
