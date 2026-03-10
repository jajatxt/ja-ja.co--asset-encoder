import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Allow the login page through
	if (url.pathname === '/login') {
		return { isAuthenticated: locals.isAuthenticated };
	}

	// Redirect to login if not authenticated
	if (!locals.isAuthenticated) {
		throw redirect(302, '/login');
	}

	return { isAuthenticated: true };
};
