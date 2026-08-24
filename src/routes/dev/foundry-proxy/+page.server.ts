import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { mintFoundryToken } from '$lib/server/foundry-token';
import { FOUNDRY_PROXY_PREFIX, normalizeHost } from '$lib/foundry/host';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_B,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_B_LIVE,
	FIXTURE_VIEWER
} from '$lib/server/foundry-dev-fixture';
import type { PageServerLoad } from './$types';

/**
 * THE PROXY HARNESS. Dev only: 404 in production, no auth, no Supabase.
 *
 * There is no gallery yet, so this is the only thing that mounts `AppFrame`
 * against a real token. Everything it hands the page is REAL -- real HMAC over
 * the real payload layout, real expiry inside the signed bytes, verified by the
 * real `verifyFoundryToken` on the way back in -- against the in-memory fixture
 * described in `$lib/server/foundry-dev-fixture`.
 *
 * WHAT IT MIRRORS AND WHAT IT DOES NOT, said plainly because a harness missing
 * a guard the real page has makes a passing drive prove nothing:
 *
 *   MIRRORED  the host branch (the frame src points at the configured apps
 *             host, so locally this is a genuine cross-origin load), token
 *             verification, the publication re-check, the MIME allowlist, the
 *             CSP, the shim injection, the iframe sandbox.
 *
 *   NOT       the mint endpoint's SESSION and its row read. Those need a real
 *             Supabase project and the local `.env` is a placeholder, so the
 *             tokens here are minted directly rather than through
 *             `POST /api/foundry/token`. The viewer id is a fixed literal.
 *             That endpoint's own refusals are unexercised locally and are
 *             called out in the report.
 *
 * THE NEGATIVE TOKENS ARE THE POINT. A harness that only mounts the working
 * case proves the proxy serves something; these prove it refuses the six things
 * it is supposed to refuse, from a browser, against the same route.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	const appsHost = normalizeHost(publicEnv.PUBLIC_FOUNDRY_APPS_HOST);
	const scheme = url.protocol === 'http:' ? 'http' : 'https';
	const base = appsHost ? `${scheme}://${appsHost}` : '';

	const nowSeconds = Math.floor(Date.now() / 1000);

	const mint = (appId: string, versionId: string, opts?: { ttlSeconds?: number }) =>
		mintFoundryToken(
			{
				appId,
				versionId,
				viewerId: FIXTURE_VIEWER,
				nowSeconds,
				ttlSeconds: opts?.ttlSeconds
			},
			true
		) ?? '';

	const good = mint(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE);
	const forApppB = mint(FIXTURE_APP_B, FIXTURE_VERSION_B_LIVE);
	const stale = mint(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE);
	// -60 puts the expiry a minute in the past. The expiry lives inside the
	// signed bytes, so this is a properly signed token that is simply too old --
	// which is the case worth testing, unlike a token with a mangled expiry.
	const expired = mint(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, { ttlSeconds: -60 });

	/**
	 * ONE BYTE OF THE SIGNATURE CHANGED, and the last byte specifically: it is
	 * the one base64url encodes into the final character, so the flip survives
	 * the round trip through the encoding rather than landing in padding bits
	 * that are discarded.
	 */
	const raw = Buffer.from(good, 'base64url');
	raw[raw.length - 1] = raw[raw.length - 1] ^ 0x01;
	const tampered = raw.toString('base64url');

	const at = (token: string, path = '') => `${base}${FOUNDRY_PROXY_PREFIX}/${token}/${path}`;

	return {
		configured: Boolean(appsHost),
		appsHost,
		mainHost: url.host,
		appOrigin: publicEnv.PUBLIC_FOUNDRY_APP_ORIGIN ?? '',
		frameSrc: at(good),
		cases: [
			{
				label: 'valid token, bare prefix WITH its slash (what the frame asks for)',
				expect: 'serves the hostile probe page',
				url: at(good)
			},
			{
				/*
				 * THE SHAPE THAT BLANKED EVERY PUBLISHED APP, kept here as a case
				 * rather than only as a unit test. The frame asks for the bare
				 * prefix and nothing else; anything that normalizes the trailing
				 * slash away turns that into this, and the hook used to answer it
				 * with a bodyless 404. A regression here is invisible in the frame
				 * above -- it renders fine until the slash is gone -- so the
				 * slashless spelling has to be a case somebody can click.
				 */
				label: 'valid token, bare prefix WITHOUT its slash',
				expect: '307 to the slash form, which then serves the probe page',
				url: `${base}${FOUNDRY_PROXY_PREFIX}/${good}`
			},
			{
				label: 'valid token, entry file named explicitly',
				expect: 'serves the hostile probe page',
				url: at(good, 'index.html')
			},
			{
				label: 'valid token, a real relative asset',
				expect: 'serves data.json',
				url: at(good, 'data.json')
			},
			{
				label: "app A's token asking for app B's file",
				expect: '404',
				url: at(good, 'b-only.json')
			},
			{
				label: "app B's token, app B's file",
				expect: 'serves b-only.json (the control for the case above)',
				url: at(forApppB, 'b-only.json')
			},
			{
				label: 'signature with one byte changed',
				expect: '404',
				url: at(tampered)
			},
			{
				label: 'expired token (signed, expiry one minute in the past)',
				expect: '404',
				url: at(expired)
			},
			{
				label: "token for a version that is no longer the app's published one",
				expect: '404',
				url: at(stale)
			},
			{
				label: 'path with ../ segments',
				expect: '404',
				url: at(good, '../../../etc/passwd')
			},
			{
				label: 'the same valid bundle URL on the MAIN host',
				expect: '404',
				url: `${scheme}://${url.host}${FOUNDRY_PROXY_PREFIX}/${good}/`
			},
			{
				label: 'an ordinary app route on the APPS host',
				expect: '404',
				url: `${base}/classroom`
			},
			{
				label: "the site's own auth callback on the APPS host",
				expect: '404',
				url: `${base}/auth/callback?code=x`
			},
			{
				label: 'the platform fonts on the APPS host',
				expect: 'serves the stylesheet',
				url: `${base}/_platform/fonts.css`
			},
			{
				label: 'the platform fonts on the MAIN host',
				expect: '404',
				url: `${scheme}://${url.host}/_platform/fonts.css`
			}
		]
	};
};
