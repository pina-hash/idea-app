import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { DRIVE_SCOPE, DRIVE_STATE_COOKIE, exchangeDriveCode } from '$lib/server/notebook-drive';
import type { RequestHandler } from './$types';

/**
 * Step 2 of the one-time notebook Drive connection. This URL byte-matches the
 * redirect URI registered on the OAuth client
 * (https://ideabosco.com/admin/drive-connect/callback). It exchanges the
 * authorization code for tokens and DISPLAYS the refresh token exactly once,
 * with the instruction to copy it into Vercel as GOOGLE_DRIVE_REFRESH_TOKEN.
 *
 * The token is a one-time manual handoff to a human: it is never logged,
 * never written to the database, and the page is served with
 * cache-control: no-store. Losing the page just means re-running
 * /admin/drive-connect for a fresh one.
 *
 * Same ADMIN-ONLY 404 gate as /admin/drive-connect (and this route likewise
 * stays out of authedPrefixes).
 */

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(status: number, title: string, bodyHtml: string): Response {
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} // IDEA</title>
<style>
	body { margin: 0; padding: 40px 20px; background: #0a0a0a; color: #e8ffe8;
		font: 16px/1.6 'Share Tech Mono', ui-monospace, monospace; }
	main { max-width: 720px; margin: 0 auto; }
	h1 { color: #00ff41; font-size: 22px; letter-spacing: 0.04em; }
	.card { border: 1px solid #1f3a26; background: #0f1a12; border-radius: 8px;
		padding: 18px 20px; margin: 18px 0; }
	code.token { display: block; word-break: break-all; padding: 14px; margin: 10px 0;
		background: #05130a; border: 1px solid #00ff41; border-radius: 6px; color: #00ff41; }
	.warn { color: #ffc857; }
	.dim { color: #9ab59a; }
	ol { padding-left: 22px; } li { margin: 8px 0; }
	a { color: #00f0ff; }
	button { font: inherit; background: #05130a; color: #00ff41; border: 1px solid #00ff41;
		border-radius: 6px; padding: 8px 14px; cursor: pointer; }
</style>
</head>
<body><main>${bodyHtml}</main></body>
</html>`;
	return new Response(html, {
		status,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
			'referrer-policy': 'no-referrer'
		}
	});
}

export const GET: RequestHandler = async ({ locals: { supabase, claims }, cookies, url }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	const denied = url.searchParams.get('error');
	if (denied) {
		return page(
			400,
			'Drive connection not completed',
			`<h1>Drive connection not completed</h1>
			<div class="card"><p>Google reported <code>${esc(denied)}</code>, so no token was issued.
			If access was denied by mistake, start again at <a href="/admin/drive-connect">/admin/drive-connect</a>.</p></div>`
		);
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expected = cookies.get(DRIVE_STATE_COOKIE);
	cookies.delete(DRIVE_STATE_COOKIE, { path: '/admin/drive-connect' });

	if (!code) {
		return page(
			400,
			'Missing authorization code',
			`<h1>Missing authorization code</h1>
			<div class="card"><p>This page is only reached from Google's consent screen.
			Start at <a href="/admin/drive-connect">/admin/drive-connect</a>.</p></div>`
		);
	}
	if (!expected || !state || state !== expected) {
		return page(
			400,
			'State check failed',
			`<h1>State check failed</h1>
			<div class="card"><p>The anti-forgery state did not match (the consent flow may have been
			started in another window, or took longer than 10 minutes). Start again at
			<a href="/admin/drive-connect">/admin/drive-connect</a>.</p></div>`
		);
	}

	const result = await exchangeDriveCode(code);
	if (result.error) {
		return page(
			502,
			'Token exchange failed',
			`<h1>Token exchange failed</h1>
			<div class="card"><p>${esc(result.error)}</p>
			<p class="dim">Check that GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET match the
			OAuth client whose registered redirect URI is this page, then start again at
			<a href="/admin/drive-connect">/admin/drive-connect</a>.</p></div>`
		);
	}

	if (!result.refreshToken) {
		return page(
			200,
			'No refresh token returned',
			`<h1>No refresh token returned</h1>
			<div class="card"><p class="warn">Google completed the exchange but did not include a refresh
			token.</p>
			<p>This usually means a previous grant for this app is still on the account. Revoke it at
			<a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">myaccount.google.com/permissions</a>
			(remove this app's access), then start again at
			<a href="/admin/drive-connect">/admin/drive-connect</a>.</p></div>`
		);
	}

	const scopeNote =
		result.scope && !result.scope.includes(DRIVE_SCOPE)
			? `<p class="warn">Warning: the granted scope was <code>${esc(result.scope)}</code>, not
				<code>${esc(DRIVE_SCOPE)}</code>. Uploads may fail; reconnect and approve the requested access.</p>`
			: `<p class="dim">Granted scope: <code>${esc(result.scope ?? DRIVE_SCOPE)}</code></p>`;

	return page(
		200,
		'Drive connected',
		`<h1>Drive connected — one manual step left</h1>
		<div class="card">
			<p>This is the refresh token. It is shown <strong>once</strong>, is stored nowhere on this
			server, and will not be logged. Copy it now.</p>
			<code class="token" id="tok">${esc(result.refreshToken)}</code>
			<button onclick="navigator.clipboard.writeText(document.getElementById('tok').textContent).then(()=>{this.textContent='Copied'})">Copy to clipboard</button>
			${scopeNote}
		</div>
		<div class="card">
			<ol>
				<li>In Vercel &rarr; Project &rarr; Settings &rarr; Environment Variables, set
					<code>GOOGLE_DRIVE_REFRESH_TOKEN</code> to the value above (and confirm
					<code>GOOGLE_OAUTH_CLIENT_ID</code> / <code>GOOGLE_OAUTH_CLIENT_SECRET</code> are set).</li>
				<li>Redeploy. Notebook photo uploads start working the moment the new deploy is live.</li>
			</ol>
			<p class="dim">Sign-in account matters: uploads act as the account that just approved access,
			so it must be a school account with access to the notebook folder in the shared drive.
			If the token is ever revoked or lost, run this flow again for a fresh one.</p>
		</div>`
	);
};
