import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
/* A development harness: 404 in production. It reaches no backend and needs no session. */
export const ssr = false;
export const load = () => { if (!dev) error(404, 'Not found'); return {}; };
