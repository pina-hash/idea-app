import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
/* Dev only: this harness answers 404 in production. It reads no session and no Supabase. */
export const ssr = false;
export const load = () => { if (!dev) error(404, 'Not found'); return {}; };
