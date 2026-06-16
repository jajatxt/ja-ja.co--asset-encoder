import { sanityFetch } from '$lib/server/sanity';
import { getEnvOptional } from '$lib/server/env';

export type AccessMode = 'full' | 'limited';
export type AccessScopeKind = 'all' | 'projects' | 'writing' | 'media' | 'system' | 'selected-paths' | 'custom';
export type AllowedScopeValue = 'all' | 'projects' | 'writing' | 'media' | 'system' | 'reading-room' | 'selected-paths';
type GroupScopeValue = Exclude<AllowedScopeValue, 'all' | 'selected-paths'>;

export interface AccessLinkRow {
	id: number;
	label: string | null;
	url?: string | null;
	mode: AccessMode;
	accessMode: AccessMode;
	startPath: string;
	next: string;
	maxRedemptions: number;
	redeemedCount: number;
	remainingRedemptions: number;
	maxUniquePaths: number | null;
	scopeKind: AccessScopeKind;
	scopePaths: string[];
	scopePrefixes: string[];
	ttlMinutes: number;
	issuedCycle: string | null;
	expiresAt: number | null;
	createdAt: number;
	disabledAt: number | null;
	lastRedeemedAt: number | null;
	activeSessionExpiresAt: number | null;
}

export interface AccessLinkDbRow {
	id: number;
	label: string | null;
	token_display: string | null;
	mode: AccessMode;
	start_path: string;
	max_redemptions: number;
	redeemed_count: number;
	max_unique_paths: number | null;
	scope_kind: AccessScopeKind | null;
	scope_paths: string | null;
	scope_prefixes: string | null;
	session_ttl_minutes: number;
	issued_cycle: string | null;
	expires_at: number | null;
	created_at: number;
	disabled_at: number | null;
	last_redeemed_at: number | null;
	active_session_expires_at?: number | null;
}

export interface AccessLinkCreateInput {
	label?: string;
	mode: AccessMode;
	startPath: string;
	maxRedemptions: number;
	maxUniquePaths: number;
	scopeKind: AccessScopeKind;
	scopePaths: string[];
	scopePrefixes: string[];
	accessDurationMinutes: number;
	linkExpiresInMinutes: number;
	bindToCurrentCycle: boolean;
}

export interface AccessWindow {
	accessDurationMinutes: number;
	bindToCurrentCycle: boolean;
}

export interface CreatedAccessLink {
	id: number | null;
	url: string;
}

export interface PageOption {
	title: string;
	path: string;
	section: string;
}

const ACCESS_MODES: AccessMode[] = ['full', 'limited'];
const ACCESS_SCOPE_KINDS: AccessScopeKind[] = ['all', 'projects', 'writing', 'media', 'system', 'selected-paths', 'custom'];
const ALLOWED_SCOPE_VALUES: AllowedScopeValue[] = ['all', 'projects', 'writing', 'media', 'system', 'reading-room', 'selected-paths'];
const GROUP_SCOPE_VALUES: GroupScopeValue[] = ['projects', 'writing', 'media', 'system', 'reading-room'];
const GROUP_SCOPE_PREFIXES: Record<GroupScopeValue, string[]> = {
	projects: ['projects'],
	writing: ['writing'],
	media: ['video', 'audio'],
	system: ['s'],
	'reading-room': ['s/reading-room']
};
const GROUP_SCOPE_DEFAULT_PATH: Record<GroupScopeValue, string> = {
	projects: '/projects',
	writing: '/writing',
	media: '/video',
	system: '/s/jjcds',
	'reading-room': '/s/reading-room'
};
const SINGLE_GROUP_SCOPE_KINDS = new Set<AccessScopeKind>(['projects', 'writing', 'media', 'system']);
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const STATIC_PAGE_OPTIONS: PageOption[] = [
	{ title: 'Index', path: '/index', section: 'Page' },
	{ title: 'Projects', path: '/projects', section: 'Collection' },
	{ title: 'Writing', path: '/writing', section: 'Collection' },
	{ title: 'Video', path: '/video', section: 'Collection' },
	{ title: 'Audio', path: '/audio', section: 'Collection' },
	{ title: 'Accounting', path: '/s/accounting', section: 'System' },
	{ title: 'Archive', path: '/s/archive', section: 'System' },
	{ title: 'Attic', path: '/s/attic', section: 'System' },
	{ title: 'Big World', path: '/s/big-world', section: 'System' },
	{ title: 'Clock Tower', path: '/s/clock-tower', section: 'System' },
	{ title: 'Closet', path: '/s/closet', section: 'System' },
	{ title: 'Deserts of the West', path: '/s/deserts-of-the-west', section: 'System' },
	{ title: 'Engine Room', path: '/s/engine-room', section: 'System' },
	{ title: 'JJCDS', path: '/s/jjcds', section: 'System' },
	{ title: 'Passage', path: '/s/passage', section: 'System' },
	{ title: 'Portal', path: '/s/portal', section: 'System' },
	{ title: 'Reading Room', path: '/s/reading-room', section: 'System' },
	{ title: 'Sandbox', path: '/s/sandbox', section: 'System' },
	{ title: 'Watchtower', path: '/s/watchtower', section: 'System' }
];

export function cleanPath(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '/';
	try {
		const parsed = new URL(trimmed);
		return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
	} catch {
		return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	}
}

export function cleanMode(value: FormDataEntryValue | null): AccessMode {
	const mode = String(value ?? 'limited');
	return ACCESS_MODES.includes(mode as AccessMode) ? (mode as AccessMode) : 'limited';
}

export function cleanScopeKind(value: FormDataEntryValue | null): AccessScopeKind {
	const scope = String(value ?? 'all');
	return ACCESS_SCOPE_KINDS.includes(scope as AccessScopeKind) ? (scope as AccessScopeKind) : 'all';
}

export function cleanAllowedScopes(values: FormDataEntryValue[]): AllowedScopeValue[] {
	const scopes = values
		.map((value) => String(value ?? ''))
		.filter((value): value is AllowedScopeValue => ALLOWED_SCOPE_VALUES.includes(value as AllowedScopeValue));
	const unique = Array.from(new Set(scopes));
	if (unique.length === 0 || unique.includes('all')) return ['all'];
	return unique;
}

export function cleanScopePaths(values: FormDataEntryValue[] | string[], fallbackPath?: string): string[] {
	const paths = values
		.map((value) => cleanPath(String(value ?? '')))
		.filter((path) => path !== '/');
	const unique = Array.from(new Set(paths));
	if (unique.length > 0) return unique;
	return fallbackPath ? [cleanPath(fallbackPath)].filter((path) => path !== '/') : [];
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
	const normalizedPath = cleanPath(path).replace(/^\/+|\/+$/g, '');
	const normalizedPrefix = cleanPath(prefix).replace(/^\/+|\/+$/g, '');
	return Boolean(normalizedPrefix && (normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`)));
}

function scopeIncludesPath(path: string, scopePaths: string[], scopePrefixes: string[]): boolean {
	if (!path || path === '/') return false;
	return scopePaths.includes(path) || scopePrefixes.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function buildScopeConfig(
	_mode: AccessMode,
	allowedScopes: AllowedScopeValue[],
	rawScopePaths: FormDataEntryValue[] | string[],
	fallbackPath = '/'
): Pick<AccessLinkCreateInput, 'startPath' | 'scopeKind' | 'scopePaths' | 'scopePrefixes'> {
	const fallback = cleanPath(fallbackPath);
	const scopes = allowedScopes.length > 0 ? allowedScopes : ['all'];
	if (scopes.includes('all')) {
		return { startPath: fallback !== '/' ? fallback : '/', scopeKind: 'all', scopePaths: [], scopePrefixes: [] };
	}

	const selectedGroups = GROUP_SCOPE_VALUES.filter((scope) => scopes.includes(scope));
	const scopePrefixes = selectedGroups.flatMap((scope) => GROUP_SCOPE_PREFIXES[scope]);
	const scopePaths = scopes.includes('selected-paths') ? cleanScopePaths(rawScopePaths, fallback !== '/' ? fallback : undefined) : [];

	if (scopes.includes('selected-paths') && scopePaths.length === 0) {
		throw new Error('Select at least one page');
	}

	let startPath = scopeIncludesPath(fallback, scopePaths, scopePrefixes) ? fallback : null;
	startPath ??= scopePaths[0] ?? (selectedGroups[0] ? GROUP_SCOPE_DEFAULT_PATH[selectedGroups[0]] : '/');

	let scopeKind: AccessScopeKind = 'custom';
	if (scopePaths.length === 0 && selectedGroups.length === 1 && SINGLE_GROUP_SCOPE_KINDS.has(selectedGroups[0] as AccessScopeKind)) {
		scopeKind = selectedGroups[0] as AccessScopeKind;
	} else if (scopePrefixes.length === 0 && scopePaths.length > 0) scopeKind = 'selected-paths';

	return { startPath, scopeKind, scopePaths, scopePrefixes };
}

function normalizeCodePath(raw: string): string | null {
	const match = raw.match(/^0*(\d+)\s*[-–]\s*(\d+)$/);
	if (!match) return null;
	return `/s/reading-room/${parseInt(match[1], 10)}-${parseInt(match[2], 10)}`;
}

export async function loadReadingRoomPathsForSelectedPages(platform: App.Platform | undefined, paths: string[]): Promise<string[]> {
	const contentPaths = paths.map((path) => cleanPath(path).replace(/^\/+|\/+$/g, '')).filter(Boolean);
	const targetPaths = contentPaths.filter((path) => path.startsWith('projects/') || path.startsWith('writing/'));
	if (targetPaths.length === 0) return [];

	const rows = await sanityFetch<{ codes?: string[] | null }[]>(
		`*[_type in ["project", "essay"] && defined(slug.current) && select(_type == "essay" => "writing/" + slug.current, "projects/" + slug.current) in $paths] {
			"codes": select(
				_type == "project" => coalesce(body[_type == "bodyImage"].asset->{"code": string(category->number) + "-" + string(number)}.code, []) + coalesce(body[_type == "bodyGroup"].items[][_type == "bodyImage"].asset->{"code": string(category->number) + "-" + string(number)}.code, []),
				_type == "essay" => coalesce(images[]->{"code": string(category->number) + "-" + string(number)}.code, []),
				[]
			)
		}`,
		{ paths: targetPaths },
		platform
	);

	const codePaths = rows
		.flatMap((row) => row.codes ?? [])
		.filter((code): code is string => typeof code === 'string')
		.map(normalizeCodePath)
		.filter((path): path is string => Boolean(path));
	return Array.from(new Set(codePaths));
}

function parseStoredPathList(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === 'string').map(cleanPath)
			: [];
	} catch {
		return [];
	}
}

function parseStoredPrefixList(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed)
			? parsed
					.filter((item): item is string => typeof item === 'string')
					.map((item) => item.replace(/^\/+|\/+$/g, ''))
					.filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

export function positiveInt(value: FormDataEntryValue | null, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}

export function parseAccessWindow(value: FormDataEntryValue | null, fallback = 10080): AccessWindow {
	const raw = String(value ?? '');
	if (raw === 'current-cycle') {
		return { accessDurationMinutes: 525600, bindToCurrentCycle: true };
	}
	return { accessDurationMinutes: positiveInt(value, fallback), bindToCurrentCycle: false };
}

export function getAccessLinkConfig(platform?: App.Platform) {
	return {
		origin: getEnvOptional('FRONTEND_ORIGIN', platform)?.replace(/\/$/, '') || 'https://ja-ja.co',
		accessLinkBasePath: getEnvOptional('FRONTEND_ACCESS_LINK_BASE_PATH', platform) || '/access'
	};
}

export function getDb(platform?: App.Platform) {
	return platform?.env?.DB;
}

export function accessLimitForMode(mode: AccessMode, maxUniquePaths: number): number | null {
	if (mode === 'full') return null;
	return maxUniquePaths;
}

export function createAccessUrl(platform: App.Platform | undefined, token: string): string {
	const { origin, accessLinkBasePath } = getAccessLinkConfig(platform);
	const basePath = accessLinkBasePath.startsWith('/') ? accessLinkBasePath : `/${accessLinkBasePath}`;
	return `${origin}${basePath.replace(/\/$/, '')}/${token}`;
}

function randomToken(length = 32): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (value) => TOKEN_ALPHABET[value % TOKEN_ALPHABET.length]).join('');
}

async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getIssuedCycle(platform: App.Platform | undefined, bindToCurrentCycle: boolean) {
	if (!bindToCurrentCycle) return null;
	const kv = platform?.env?.ACTIVE_PATHS;
	if (!kv) throw new Error('ACTIVE_PATHS binding not configured for current-cycle links');
	const cycle = await kv.get('cycle-number');
	if (!cycle) throw new Error('No active cycle found');
	return cycle;
}

export function mapAccessLink(row: AccessLinkDbRow, platform?: App.Platform): AccessLinkRow {
	return {
		id: row.id,
		label: row.label,
		mode: row.mode,
		accessMode: row.mode,
		startPath: row.start_path,
		next: row.start_path,
		maxRedemptions: row.max_redemptions,
		redeemedCount: row.redeemed_count,
		remainingRedemptions: Math.max(0, row.max_redemptions - row.redeemed_count),
		maxUniquePaths: row.max_unique_paths,
		scopeKind: row.scope_kind ?? 'all',
		scopePaths: parseStoredPathList(row.scope_paths),
		scopePrefixes: parseStoredPrefixList(row.scope_prefixes),
		ttlMinutes: row.session_ttl_minutes,
		issuedCycle: row.issued_cycle,
		expiresAt: row.expires_at,
		createdAt: row.created_at,
		disabledAt: row.disabled_at,
		lastRedeemedAt: row.last_redeemed_at,
		activeSessionExpiresAt: row.active_session_expires_at ?? null,
		url: row.token_display ? createAccessUrl(platform, row.token_display) : null
	};
}

export async function createAccessLink(
	db: D1Database,
	platform: App.Platform | undefined,
	input: AccessLinkCreateInput
): Promise<CreatedAccessLink> {
	const now = Date.now();
	const token = randomToken();
	const tokenHash = await sha256Hex(token);
	const expiresAt = now + input.linkExpiresInMinutes * 60_000;
	const issuedCycle = await getIssuedCycle(platform, input.bindToCurrentCycle);
	const startPath = cleanPath(input.startPath);
	const accessLimit = accessLimitForMode(input.mode, input.maxUniquePaths);
	const scopeKind = input.scopeKind;
	const scopePaths =
		scopeKind === 'all' || scopeKind === 'projects' || scopeKind === 'writing' || scopeKind === 'media' || scopeKind === 'system'
			? []
			: Array.from(new Set(cleanScopePaths(input.scopePaths, scopeKind === 'selected-paths' ? startPath : undefined)));
	const scopePrefixes = scopeKind === 'custom' ? Array.from(new Set(input.scopePrefixes.map((prefix) => prefix.replace(/^\/+|\/+$/g, '')).filter(Boolean))) : [];

	const result = await db
		.prepare(
			`INSERT INTO access_links
			(label, token_hash, token_display, mode, start_path, max_redemptions, redeemed_count, max_unique_paths,
			 scope_kind, scope_paths, scope_prefixes, session_ttl_minutes, expires_at, bind_to_current_cycle, issued_cycle, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			input.label?.trim() || null,
			tokenHash,
			token,
			input.mode,
			startPath,
			input.maxRedemptions,
			accessLimit,
			scopeKind,
			JSON.stringify(scopePaths),
			JSON.stringify(scopePrefixes),
			input.accessDurationMinutes,
			expiresAt,
			input.bindToCurrentCycle ? 1 : 0,
			issuedCycle,
			now
		)
		.run();

	return {
		id: result.meta?.last_row_id ?? null,
		url: createAccessUrl(platform, token)
	};
}

export async function revokeAccessLink(db: D1Database, id: number): Promise<void> {
	if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid access link');
	const now = Date.now();

	await db
		.prepare('UPDATE access_links SET disabled_at = COALESCE(disabled_at, ?) WHERE id = ?')
		.bind(now, id)
		.run();

	await db
		.prepare('UPDATE access_link_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE access_link_id = ?')
		.bind(now, id)
		.run();
}

export async function loadRecentAccessLinks(db: D1Database, platform?: App.Platform, access = ''): Promise<AccessLinkRow[]> {
	const now = Date.now();
	const activeSql = `l.disabled_at IS NULL AND (
		((l.expires_at IS NULL OR l.expires_at > ?) AND l.redeemed_count < l.max_redemptions)
		OR EXISTS (
			SELECT 1 FROM access_link_sessions s
			WHERE s.access_link_id = l.id AND s.revoked_at IS NULL AND s.expires_at > ?
		)
	)`;
	const where = access === 'active' ? `WHERE ${activeSql}` : access === 'past' ? `WHERE NOT (${activeSql})` : '';
	const binds = access === 'active' || access === 'past' ? [now, now, now] : [now];
	const { results } = await db
		.prepare(
			`SELECT l.id, l.label, l.token_display, l.mode, l.start_path, l.max_redemptions, l.redeemed_count, l.max_unique_paths,
				l.scope_kind, l.scope_paths, l.scope_prefixes,
				l.session_ttl_minutes, l.issued_cycle, l.expires_at, l.created_at, l.disabled_at, l.last_redeemed_at,
				(
					SELECT MAX(s.expires_at)
					FROM access_link_sessions s
					WHERE s.access_link_id = l.id AND s.revoked_at IS NULL AND s.expires_at > ?
				) AS active_session_expires_at
			FROM access_links l
			${where}
			ORDER BY l.id DESC
			LIMIT 50`
		)
		.bind(...binds)
		.all<AccessLinkDbRow>();
	return (results ?? []).map((row) => mapAccessLink(row, platform));
}

export async function loadPageOptions(platform?: App.Platform): Promise<PageOption[]> {
	const sanityPages = await sanityFetch<PageOption[]>(
		`*[_type in ["project", "essay"] && defined(slug.current)] | order(_type asc, title asc) {
			"title": coalesce(title, slug.current),
			"path": select(_type == "essay" => "/writing/" + slug.current, "/projects/" + slug.current),
			"section": select(_type == "essay" => "Writing", "Projects")
		}`,
		{},
		platform
	).catch(() => [] as PageOption[]);

	return [...STATIC_PAGE_OPTIONS, ...sanityPages];
}
