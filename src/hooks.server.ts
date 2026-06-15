import type { Handle } from '@sveltejs/kit';
import { getEnvOptional } from '$lib/server/env';

export const handle: Handle = async ({ event, resolve }) => {
	const authCookie = event.cookies.get('auth');
	const authPassword = getEnvOptional('AUTH_PASSWORD', event.platform);
	event.locals.isAuthenticated = !!authPassword && authCookie === authPassword;
	const response = await resolve(event);
	response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
	return response;
};
