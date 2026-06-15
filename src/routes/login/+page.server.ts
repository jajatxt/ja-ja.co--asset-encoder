import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnvOptional } from '$lib/server/env';
import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from '$lib/server/login-rate-limit';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.isAuthenticated) throw redirect(302, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const data = await request.formData();
		const password = data.get('password') as string;
		const expected = getEnvOptional('AUTH_PASSWORD', platform);

		if (!expected) {
			return fail(500, { error: 'AUTH_PASSWORD not configured' });
		}

		const limit = await checkLoginRateLimit(request, platform);
		if (!limit.allowed) {
			const minutes = Math.max(1, Math.ceil((limit.retryAfterSeconds ?? 60) / 60));
			return fail(429, { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
		}

		if (password !== expected) {
			await recordLoginFailure(request, platform);
			return fail(401, { error: 'Invalid password' });
		}

		await clearLoginFailures(request, platform);

		cookies.set('auth', password, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 24 * 30 // 30 days
		});

		throw redirect(302, '/');
	}
};
