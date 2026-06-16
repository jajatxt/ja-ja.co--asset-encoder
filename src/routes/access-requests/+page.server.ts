import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildAccessEmailDraft, sendAccessEmail, type AccessEmailGrantDetails } from '$lib/server/access-email';
import { getEnvOptional } from '$lib/server/env';
import {
	buildScopeConfig,
	cleanAllowedScopes,
	cleanMode,
	cleanPath,
	createAccessLink,
	getDb,
	loadPageOptions,
	loadReadingRoomPathsForSelectedPages,
	mapAccessLink,
	parseAccessWindow,
	positiveInt,
	revokeAccessLink,
	type AccessLinkDbRow,
	type AccessLinkRow,
	type AccessMode,
	type PageOption
} from '$lib/server/access-links';

interface AccessRequestRow {
	id: number;
	name: string | null;
	email: string;
	role: string;
	reason: string;
	note: string | null;
	status: string;
	source_path: string | null;
	created_at: number;
	updated_at: number;
	reviewed_at: number | null;
	reviewed_by: string | null;
	admin_note: string | null;
}

interface LinkedAccessLinkRow extends AccessLinkDbRow {
	access_request_id: number;
	request_email: string | null;
}

function getFrontendConfig(platform?: App.Platform) {
	return {
		origin: getEnvOptional('FRONTEND_ORIGIN', platform)?.replace(/\/$/, '') || 'https://ja-ja.co',
		token:
			getEnvOptional('FRONTEND_ADMIN_TOKEN', platform) ??
			getEnvOptional('FRONTEND_SHARE_LINK_TOKEN', platform)
	};
}

async function frontendRequest(platform: App.Platform | undefined, path: string, init: RequestInit = {}) {
	const { origin, token } = getFrontendConfig(platform);
	if (!token) throw new Error('FRONTEND_ADMIN_TOKEN not configured');
	return fetch(`${origin}${path}`, {
		...init,
		headers: {
			...(init.headers ?? {}),
			authorization: `Bearer ${token}`
		}
	});
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
	return `${count} ${count === 1 ? singular : pluralValue}`;
}

function formatDuration(minutes: number) {
	const units = [
		{ minutes: 525600, label: 'year' },
		{ minutes: 43200, label: 'month' },
		{ minutes: 10080, label: 'week' },
		{ minutes: 1440, label: 'day' },
		{ minutes: 60, label: 'hour' }
	];
	const unit = units.find((item) => minutes >= item.minutes && minutes % item.minutes === 0);
	if (unit) return plural(minutes / unit.minutes, unit.label);
	return plural(minutes, 'minute');
}

function formatShortDate(value: number) {
	const date = new Date(value);
	const yy = String(date.getFullYear()).slice(-2);
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${mm}.${dd}.${yy}`;
}

function pathListLabel(paths: string[]) {
	if (paths.length === 0) return '';
	const shown = paths.slice(0, 3).join(', ');
	return paths.length > 3 ? `${shown}, +${paths.length - 3} more` : shown;
}

function describeScopeForEmail(scopeConfig: ReturnType<typeof buildScopeConfig>) {
	if (scopeConfig.scopeKind === 'all') return 'All pages';
	if (scopeConfig.scopeKind === 'projects') return 'Projects';
	if (scopeConfig.scopeKind === 'writing') return 'Writing';
	if (scopeConfig.scopeKind === 'media') return 'Video + audio';
	if (scopeConfig.scopeKind === 'system') return 'System pages';
	if (scopeConfig.scopeKind === 'selected-paths') {
		return `${plural(scopeConfig.scopePaths.length, 'selected page')} (${pathListLabel(scopeConfig.scopePaths)})`;
	}

	const parts: string[] = [];
	const prefixes = new Set(scopeConfig.scopePrefixes);
	if (prefixes.has('projects')) parts.push('Projects');
	if (prefixes.has('writing')) parts.push('Writing');
	if (prefixes.has('video') || prefixes.has('audio')) parts.push('Video + audio');
	if (prefixes.has('s/reading-room')) parts.push('Reading Room');
	if (prefixes.has('s')) parts.push('System pages');
	if (scopeConfig.scopePaths.length) parts.push(`${plural(scopeConfig.scopePaths.length, 'selected page')} (${pathListLabel(scopeConfig.scopePaths)})`);
	return parts.length ? parts.join(' + ') : 'Custom access';
}

function buildEmailGrantDetails(input: {
	mode: AccessMode;
	scopeConfig: ReturnType<typeof buildScopeConfig>;
	maxUniquePaths: number;
	maxRedemptions: number;
	accessDurationMinutes: number;
	linkExpiresInMinutes: number;
	bindToCurrentCycle: boolean;
}): AccessEmailGrantDetails {
	const scope = describeScopeForEmail(input.scopeConfig);
	const pageBudget = input.mode === 'full'
		? input.scopeConfig.scopeKind === 'all' ? 'Unlimited pages' : 'Unlimited within this scope'
		: `Up to ${plural(input.maxUniquePaths, 'unique page')} within this scope`;
	const accessLasts = input.bindToCurrentCycle
		? 'Until the current cycle changes'
		: `${formatDuration(input.accessDurationMinutes)} after opening`;
	const unusedLinkExpiresAt = Date.now() + input.linkExpiresInMinutes * 60_000;

	return {
		scope,
		pageBudget,
		linkUses: plural(input.maxRedemptions, 'browser sign-in'),
		accessLasts,
		unusedLinkExpires: `${formatShortDate(unusedLinkExpiresAt)} (${formatDuration(input.linkExpiresInMinutes)} from now)`
	};
}

async function loadLinkedAccessLinks(db: D1Database | undefined, requests: AccessRequestRow[], platform?: App.Platform) {
	const linksByRequest: Record<number, AccessLinkRow[]> = {};
	if (!db || requests.length === 0) return linksByRequest;

	const requestsById = new Map(requests.map((request) => [request.id, request]));

	try {
		const requestIds = requests.map((request) => request.id);
		const placeholders = requestIds.map(() => '?').join(', ');
		const now = Date.now();
		const { results } = await db
			.prepare(
				`SELECT arl.access_request_id, r.email AS request_email,
					l.id, l.label, l.token_display, l.mode, l.start_path, l.max_redemptions, l.redeemed_count, l.max_unique_paths,
					l.scope_kind, l.scope_paths, l.scope_prefixes,
					l.session_ttl_minutes, l.issued_cycle, l.expires_at, l.created_at, l.disabled_at, l.last_redeemed_at,
					(
						SELECT MAX(s.expires_at)
						FROM access_link_sessions s
						WHERE s.access_link_id = l.id AND s.revoked_at IS NULL AND s.expires_at > ?
					) AS active_session_expires_at
				FROM access_request_links arl
				JOIN access_requests r ON r.id = arl.access_request_id
				JOIN access_links l ON l.id = arl.access_link_id
				WHERE arl.access_request_id IN (${placeholders})
				ORDER BY arl.created_at DESC`
			)
			.bind(now, ...requestIds)
			.all<LinkedAccessLinkRow>();

		for (const row of results ?? []) {
			const request = requestsById.get(row.access_request_id);
			if (!request || row.request_email !== request.email) continue;
			linksByRequest[row.access_request_id] ??= [];
			linksByRequest[row.access_request_id].push(mapAccessLink(row, platform));
		}
	} catch {
		// The shared access-link migration may not be applied yet.
	}

	return linksByRequest;
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const config = getFrontendConfig(platform);
	const status = url.searchParams.get('status') ?? '';
	const role = url.searchParams.get('role') ?? '';
	const reason = url.searchParams.get('reason') ?? '';
	const q = url.searchParams.get('q') ?? '';
	const accessParam = url.searchParams.get('access') ?? '';
	const access = accessParam === 'active' ? 'active' : '';
	const sort = url.searchParams.get('sort') ?? 'newest';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const limit = 50;
	const offset = (page - 1) * limit;
	let accessRequests: AccessRequestRow[] = [];
	let pageOptions: PageOption[] = [];
	let linkedAccessLinks: Record<number, AccessLinkRow[]> = {};
	let total = 0;
	let loadError: string | null = null;

	try {
		pageOptions = await loadPageOptions(platform);
	} catch {
		pageOptions = [];
	}

	if (!config.token) {
		loadError = 'FRONTEND_ADMIN_TOKEN not configured';
	} else {
		try {
			const query = new URLSearchParams({ limit: String(limit), offset: String(offset), sort });
			if (status) query.set('status', status);
			if (role) query.set('role', role);
			if (reason) query.set('reason', reason);
			if (q) query.set('q', q);
			if (access) query.set('access', access);
			const response = await frontendRequest(platform, `/api/access-requests?${query.toString()}`);
			const payload = (await response.json().catch(() => ({}))) as {
				accessRequests?: AccessRequestRow[];
				total?: number;
				error?: string;
			};
			if (!response.ok) throw new Error(payload.error || 'Unable to load requests');
			accessRequests = payload.accessRequests ?? [];
			total = payload.total ?? accessRequests.length;
			linkedAccessLinks = await loadLinkedAccessLinks(getDb(platform), accessRequests, platform);
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Unable to load requests';
		}
	}

	return {
		frontendOrigin: config.origin,
		sharedDbConfigured: Boolean(getDb(platform)),
		filters: { status, role, reason, q, access, sort, page, limit },
		accessRequests,
		linkedAccessLinks,
		pageOptions,
		total,
		loadError
	};
};

export const actions: Actions = {
	deleteRequest: async ({ request, platform }) => {
		const data = await request.formData();
		const db = getDb(platform);
		const id = Number(data.get('id'));

		if (!db) return fail(400, { error: 'Shared DB binding not configured' });
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid request id' });

		try {
			await db.prepare('DELETE FROM access_request_links WHERE access_request_id = ?').bind(id).run();
			await db.prepare('DELETE FROM access_requests WHERE id = ?').bind(id).run();
			return { deletedId: id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Unable to delete request row' });
		}
	},
	revokeLink: async ({ request, platform }) => {
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
	update: async ({ request, platform }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		const status = String(data.get('status') ?? '').trim();
		const adminNote = String(data.get('adminNote') ?? '').trim();
		const reviewedBy = String(data.get('reviewedBy') ?? 'admin').trim() || 'admin';

		try {
			const response = await frontendRequest(platform, '/api/access-requests', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id, status, adminNote, reviewedBy })
			});
			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) throw new Error(payload.error || 'Unable to update request');
			return { updatedId: id };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Unable to update request',
				id,
				status,
				adminNote
			});
		}
	},
	createLink: async ({ request, platform }) => {
		const data = await request.formData();
		const db = getDb(platform);
		const requestId = Number(data.get('id'));
		const email = String(data.get('email') ?? '').trim();
		const name = String(data.get('name') ?? '').trim();
		const shouldSendEmail = data.get('sendEmail') === 'yes';
		const adminNote = String(data.get('adminNote') ?? '').trim();
		const mode = cleanMode(data.get('mode'));
		const sourcePath = cleanPath(String(data.get('sourcePath') ?? '/'));
		const label = String(data.get('label') ?? '').trim() || `${email || 'request'} ${requestId}`;
		const maxRedemptions = positiveInt(data.get('maxRedemptions'), 1);
		const maxUniquePaths = positiveInt(data.get('maxUniquePaths'), 5);
		const allowedScopes = cleanAllowedScopes(data.getAll('allowedScopes'));
		const includeReadingRoomAssets = data.get('includeReadingRoomAssets') === 'on';
		let scopeConfig: ReturnType<typeof buildScopeConfig>;
		try {
			scopeConfig = buildScopeConfig(mode, allowedScopes, data.getAll('scopePaths'), sourcePath);
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
				id: requestId
			});
		}
		const accessWindow = parseAccessWindow(data.get('accessWindow') ?? data.get('accessDurationMinutes'), 10080);
		const accessDurationMinutes = accessWindow.accessDurationMinutes;
		const bindToCurrentCycle = accessWindow.bindToCurrentCycle;
		const linkExpiresInMinutes = positiveInt(data.get('linkExpiresInMinutes'), 10080);

		if (!db) {
			return fail(400, { error: 'Shared DB binding not configured', id: requestId });
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

			if (created.id) {
				await db
					.prepare(
						`INSERT OR IGNORE INTO access_request_links (access_request_id, access_link_id, created_at)
						VALUES (?, ?, ?)`
					)
					.bind(requestId, created.id, Date.now())
					.run();
			}

			const response = await frontendRequest(platform, '/api/access-requests', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: requestId, status: 'approved', adminNote, reviewedBy: 'admin' })
			});
			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) throw new Error(payload.error || 'Link created, but request approval failed');

			const emailInput = {
				to: email,
				name,
				url: created.url,
				grant: buildEmailGrantDetails({
					mode,
					scopeConfig,
					maxUniquePaths,
					maxRedemptions,
					accessDurationMinutes,
					linkExpiresInMinutes,
					bindToCurrentCycle
				})
			};
			let emailDraft = buildAccessEmailDraft(emailInput);
			let emailSent = false;
			let emailWarning: string | undefined;

			if (shouldSendEmail) {
				try {
					const emailResult = await sendAccessEmail(platform, emailInput);
					emailDraft = emailResult.draft;
					emailSent = emailResult.sent;
					if (!emailResult.sent) emailWarning = emailResult.error;
				} catch (err) {
					emailWarning = err instanceof Error ? `Email not sent: ${err.message}` : 'Email not sent. Copy and send the draft manually.';
				}
			}

			return {
				createdUrl: created.url,
				linkedRequestId: requestId,
				emailRecipient: email,
				emailSent,
				emailWarning,
				emailSubject: emailDraft.subject,
				emailBody: emailDraft.text
			};
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Unable to create access link',
				id: requestId
			});
		}
	}
};
