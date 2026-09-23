import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * DEV ONLY. One slide for the REAL `DeckViewer` to frame, so the harness can
 * put a deck on the "projector" without an ingest, a session or Drive.
 */
const SLIDE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Slide 1</title>
<style>html,body{margin:0;height:100%;background:#0b1410;color:#e8efe9;font:600 6vmin system-ui,sans-serif;display:grid;place-items:center}</style>
</head><body><main>Slide 1 of 1</main></body></html>`;

export const GET: RequestHandler = async () => {
	if (!dev) error(404, 'Not found');
	return new Response(SLIDE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
