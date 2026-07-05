import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * FRC Training shell harness. Dev-only: 404s in a production build. Lives
 * OUTSIDE /frc on purpose so it needs no login or Supabase; it mounts the
 * real FrcShell + page components with the registry's own data (the shell's
 * ProfileMenu renders nothing signed out, which is fine for chrome checks).
 */
export const prerender = false;

export const load = () => {
	if (!dev) error(404, 'Not found');
};
