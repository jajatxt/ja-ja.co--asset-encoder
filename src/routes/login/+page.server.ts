import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnvOptional } from '$lib/server/env';

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

		if (password !== expected) {
			return fail(401, { error: 'Invalid password' });
		}

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
