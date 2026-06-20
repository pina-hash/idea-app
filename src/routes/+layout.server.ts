import type { LayoutServerLoad } from './$types';

/**
 * Passes the cookies and validated claims from the server to the universal
 * layout load, so the browser client can be created with the same session.
 */
export const load: LayoutServerLoad = async ({ locals: { claims }, cookies }) => {
	return {
		claims,
		cookies: cookies.getAll()
	};
};
