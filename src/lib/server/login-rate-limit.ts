const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;

const memoryFailures = new Map<string, number[]>();
let d1Initialized = false;

export interface LoginRateLimitResult {
	allowed: boolean;
	retryAfterSeconds?: number;
}

function getRequestIp(request: Request): string {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('x-real-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		'local'
	);
}

async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getRateLimitKey(request: Request): Promise<string> {
	return sha256Hex(`admin-login:${getRequestIp(request)}`);
}

async function ensureD1(db: D1Database): Promise<void> {
	if (d1Initialized) return;
	await db
		.prepare(
			`CREATE TABLE IF NOT EXISTS admin_login_attempts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				key TEXT NOT NULL,
				attempted_at INTEGER NOT NULL,
				success INTEGER NOT NULL DEFAULT 0
			)`
		)
		.run();
	await db
		.prepare('CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_key_time ON admin_login_attempts(key, attempted_at DESC)')
		.run();
	d1Initialized = true;
}

async function cleanupD1(db: D1Database, now: number): Promise<void> {
	await db.prepare('DELETE FROM admin_login_attempts WHERE attempted_at < ?').bind(now - LOGIN_CLEANUP_AFTER_MS).run();
}

function checkMemoryLimit(key: string, now: number): LoginRateLimitResult {
	const cutoff = now - LOGIN_WINDOW_MS;
	const attempts = (memoryFailures.get(key) ?? []).filter((attemptedAt) => attemptedAt > cutoff);
	memoryFailures.set(key, attempts);

	if (attempts.length < LOGIN_FAILURE_LIMIT) return { allowed: true };

	const oldest = Math.min(...attempts);
	return {
		allowed: false,
		retryAfterSeconds: Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000))
	};
}

function recordMemoryFailure(key: string, now: number): void {
	const cutoff = now - LOGIN_WINDOW_MS;
	const attempts = (memoryFailures.get(key) ?? []).filter((attemptedAt) => attemptedAt > cutoff);
	attempts.push(now);
	memoryFailures.set(key, attempts);
}

export async function checkLoginRateLimit(request: Request, platform?: App.Platform): Promise<LoginRateLimitResult> {
	const key = await getRateLimitKey(request);
	const now = Date.now();
	const cutoff = now - LOGIN_WINDOW_MS;
	const db = platform?.env?.DB;

	if (!db) return checkMemoryLimit(key, now);

	await ensureD1(db);
	await cleanupD1(db, now);
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS count, MIN(attempted_at) AS oldest
			FROM admin_login_attempts
			WHERE key = ? AND success = 0 AND attempted_at > ?`
		)
		.bind(key, cutoff)
		.first<{ count: number; oldest: number | null }>();

	const count = row?.count ?? 0;
	if (count < LOGIN_FAILURE_LIMIT) return { allowed: true };

	const oldest = row?.oldest ?? now;
	return {
		allowed: false,
		retryAfterSeconds: Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000))
	};
}

export async function recordLoginFailure(request: Request, platform?: App.Platform): Promise<void> {
	const key = await getRateLimitKey(request);
	const now = Date.now();
	const db = platform?.env?.DB;

	if (!db) {
		recordMemoryFailure(key, now);
		return;
	}

	await ensureD1(db);
	await cleanupD1(db, now);
	await db.prepare('INSERT INTO admin_login_attempts (key, attempted_at, success) VALUES (?, ?, 0)').bind(key, now).run();
}

export async function clearLoginFailures(request: Request, platform?: App.Platform): Promise<void> {
	const key = await getRateLimitKey(request);
	const db = platform?.env?.DB;
	memoryFailures.delete(key);

	if (!db) return;

	await ensureD1(db);
	await db.prepare('DELETE FROM admin_login_attempts WHERE key = ?').bind(key).run();
}
