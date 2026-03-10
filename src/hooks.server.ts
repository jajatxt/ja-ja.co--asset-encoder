import type { Handle } from '@sveltejs/kit';
import { getEnvOptional } from '$lib/server/env';

export const handle: Handle = async ({ event, resolve }) => {
	const authCookie = event.cookies.get('auth');
	const authPassword = getEnvOptional('AUTH_PASSWORD', event.platform);
	event.locals.isAuthenticated = !!authPassword && authCookie === authPassword;
	return resolve(event);
};
