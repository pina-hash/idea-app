import { vanguardHtml } from '$lib/legacy';
import type { RequestHandler } from './$types';

/**
 * Public VANGUARD endpoint, served at `/vanguard/`.
 *
 * The game is served verbatim. For signed-in users we inject a small bootstrap
 * into <head> (so it runs before the game's own script reads localStorage):
 *   1. Seeds the user's cloud save into the `vanguard_*` localStorage keys.
 *   2. Wraps `localStorage.setItem` to push `vanguard_*` changes back to
 *      `/api/vanguard-save` (debounced, with a sendBeacon flush on page hide).
 *
 * Signed-out users get the unmodified game (saves stay local).
 *
 * `trailingSlash = 'always'` keeps the page URL at `/vanguard/`, so the game's
 * relative `audio/...` references resolve against `static/vanguard/audio/...`
 * without needing a <base> tag or editing the game file.
 */
export const trailingSlash = 'always';

/**
 * Escape a JSON string so it can be safely embedded inside an inline <script>.
 * `<` is neutralized to prevent a `</script>` break-out; the U+2028/U+2029 line
 * terminators are escaped to their \uXXXX form (JSON.stringify leaves them raw,
 * but they are invalid inside a pre-ES2019 JS string literal).
 */
function escapeForScript(jsonStr: string): string {
	return jsonStr
		.replace(/</g, '\\u003c')
		.split(String.fromCharCode(0x2028))
		.join('\\u2028')
		.split(String.fromCharCode(0x2029))
		.join('\\u2029');
}

/** Build the <head> bootstrap that seeds and syncs the cloud save. */
function cloudSyncScript(seed: Record<string, unknown>): string {
	const seedJson = escapeForScript(JSON.stringify(seed));
	return `<script>
(function () {
	var PREFIX = 'vanguard_';
	var native = localStorage.setItem.bind(localStorage);

	// 1. Seed cloud save into localStorage BEFORE the game reads it.
	try {
		var seed = ${seedJson};
		for (var k in seed) {
			if (Object.prototype.hasOwnProperty.call(seed, k) && typeof seed[k] === 'string') {
				try { native(k, seed[k]); } catch (e) {}
			}
		}
	} catch (e) {}

	// 2. Push vanguard_* changes back to the cloud (debounced).
	function snapshot() {
		var out = {};
		for (var i = 0; i < localStorage.length; i++) {
			var key = localStorage.key(i);
			if (key && key.indexOf(PREFIX) === 0) out[key] = localStorage.getItem(key);
		}
		return out;
	}
	var timer = null;
	function schedulePush() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(function () {
			timer = null;
			try {
				fetch('/api/vanguard-save', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(snapshot()),
					keepalive: true
				}).catch(function () {});
			} catch (e) {}
		}, 1500);
	}
	try {
		localStorage.setItem = function (key, value) {
			native(key, value);
			if (typeof key === 'string' && key.indexOf(PREFIX) === 0) schedulePush();
		};
		window.addEventListener('pagehide', function () {
			try {
				if (navigator.sendBeacon) {
					var body = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
					navigator.sendBeacon('/api/vanguard-save', body);
				}
			} catch (e) {}
		});
	} catch (e) {}
})();
</script>`;
}

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	let html = vanguardHtml;

	if (claims) {
		let seed: Record<string, unknown> = {};
		const { data } = await supabase
			.from('vanguard_saves')
			.select('data')
			.eq('user_id', claims.sub)
			.maybeSingle();
		if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
			seed = data.data as Record<string, unknown>;
		}
		html = vanguardHtml.replace('<head>', `<head>\n${cloudSyncScript(seed)}`);
	}

	return new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
