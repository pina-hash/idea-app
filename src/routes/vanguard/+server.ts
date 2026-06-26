import { vanguardHtml } from '$lib/legacy';
import type { RequestHandler } from './$types';

/**
 * Public VANGUARD endpoint, served at `/vanguard/`.
 *
 * The game file is never modified. We inject a small bootstrap into <head> (so
 * it runs before the game's own script reads localStorage):
 *   - Signed in: seed the user's cloud save into the `vanguard_*` localStorage
 *     keys, wrap `localStorage.setItem` to push `vanguard_*` changes to
 *     `/api/vanguard-save` (debounced + a `sendBeacon` flush on page hide), and
 *     render a floating "cloud save" widget (status pill + Back up / Restore).
 *   - Signed out: render a minimal "sign in to sync" pill; saves stay local.
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

/**
 * Build the <head> bootstrap. When signed in it seeds + syncs the cloud save and
 * shows the full widget; when signed out it shows a "sign in to sync" pill.
 */
function injectionScript(signedIn: boolean, seed: Record<string, unknown>): string {
	const seedJson = signedIn ? escapeForScript(JSON.stringify(seed)) : '{}';
	const seededCount = signedIn ? Object.keys(seed).length : 0;

	return `<script>
(function () {
	var SIGNED_IN = ${signedIn ? 'true' : 'false'};
	var SEEDED = ${seededCount};
	var PREFIX = 'vanguard_';
	var native = localStorage.setItem.bind(localStorage);

	// Seed cloud save into localStorage BEFORE the game reads it.
	if (SIGNED_IN) {
		try {
			var seed = ${seedJson};
			for (var sk in seed) {
				if (Object.prototype.hasOwnProperty.call(seed, sk) && typeof seed[sk] === 'string') {
					try { native(sk, seed[sk]); } catch (e) {}
				}
			}
		} catch (e) {}
	}

	function snapshot() {
		var out = {};
		for (var i = 0; i < localStorage.length; i++) {
			var key = localStorage.key(i);
			if (key && key.indexOf(PREFIX) === 0) out[key] = localStorage.getItem(key);
		}
		return out;
	}

	var statusEl = null, detailEl = null;
	function fmtTime() { try { return new Date().toLocaleTimeString(); } catch (e) { return ''; } }
	function setStatus(state, detail) {
		if (!statusEl) return;
		var text = { idle: 'CLOUD', saving: 'SAVING', saved: 'SAVED', error: 'SAVE ERR', off: 'CLOUD OFF' };
		var color = { idle: '#4A7A52', saving: '#C8FF00', saved: '#00FF41', error: '#FF8C00', off: '#4A7A52' };
		statusEl.textContent = text[state] || 'CLOUD';
		statusEl.style.color = color[state] || '#4A7A52';
		if (detailEl && typeof detail === 'string') detailEl.textContent = detail;
	}

	function doPush() {
		if (!SIGNED_IN) return;
		setStatus('saving', 'saving...');
		fetch('/api/vanguard-save', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(snapshot()),
			keepalive: true
		}).then(function (r) {
			setStatus(r.ok ? 'saved' : 'error', r.ok ? fmtTime() : 'try again');
		}).catch(function () { setStatus('error', 'offline?'); });
	}

	var timer = null;
	function schedulePush() {
		if (!SIGNED_IN) return;
		if (timer) clearTimeout(timer);
		setStatus('saving', 'saving...');
		timer = setTimeout(function () { timer = null; doPush(); }, 1500);
	}

	function doRestore() {
		if (!SIGNED_IN) return;
		if (!window.confirm('Restore your cloud save? This replaces the VANGUARD progress saved in THIS browser.')) return;
		setStatus('saving', 'restoring...');
		fetch('/api/vanguard-save').then(function (r) { return r.json(); }).then(function (j) {
			var d = (j && j.data) || {};
			var keys = [];
			for (var i = 0; i < localStorage.length; i++) {
				var key = localStorage.key(i);
				if (key && key.indexOf(PREFIX) === 0) keys.push(key);
			}
			keys.forEach(function (key) { try { localStorage.removeItem(key); } catch (e) {} });
			var n = 0;
			for (var k in d) {
				if (Object.prototype.hasOwnProperty.call(d, k) && typeof d[k] === 'string') {
					try { native(k, d[k]); n++; } catch (e) {}
				}
			}
			setStatus('saved', n + ' keys restored');
			location.reload();
		}).catch(function () { setStatus('error', 'restore failed'); });
	}

	if (SIGNED_IN) {
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
	}

	function mkBtn(label, onClick) {
		var b = document.createElement('button');
		b.type = 'button';
		b.textContent = label;
		b.style.cssText = 'font:inherit;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#00F0FF;background:none;border:1px solid rgba(0,240,255,0.35);border-radius:2px;padding:3px 7px;cursor:pointer;';
		b.addEventListener('click', onClick);
		return b;
	}

	function build() {
		if (document.getElementById('idea-cloud-save')) return;
		var host = document.body || document.documentElement;
		if (!host) return;

		var wrap = document.createElement('div');
		wrap.id = 'idea-cloud-save';
		wrap.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(2,10,4,0.85);border:1px solid rgba(0,255,65,0.35);border-radius:4px;font-family:"Share Tech Mono",ui-monospace,monospace;font-size:11px;letter-spacing:0.08em;color:#E8FFE8;opacity:0.9;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);';

		statusEl = document.createElement('span');
		statusEl.style.cssText = 'font-weight:700;white-space:nowrap;';
		wrap.appendChild(statusEl);

		if (SIGNED_IN) {
			detailEl = document.createElement('span');
			detailEl.style.cssText = 'color:#4A7A52;font-size:10px;white-space:nowrap;';
			wrap.appendChild(detailEl);
			wrap.appendChild(mkBtn('Back up', doPush));
			wrap.appendChild(mkBtn('Restore', doRestore));
			setStatus(SEEDED > 0 ? 'saved' : 'idle', SEEDED > 0 ? 'restored from cloud' : 'ready');
		} else {
			var link = document.createElement('a');
			link.href = '/';
			link.textContent = 'Sign in to sync';
			link.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#00FF41;text-decoration:none;border:1px solid rgba(0,255,65,0.4);border-radius:2px;padding:3px 7px;';
			wrap.appendChild(link);
			setStatus('off', '');
		}

		host.appendChild(wrap);
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
	else build();
})();
</script>`;
}

export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	let seed: Record<string, unknown> = {};
	let signedIn = false;

	if (claims) {
		signedIn = true;
		const { data } = await supabase
			.from('vanguard_saves')
			.select('data')
			.eq('user_id', claims.sub)
			.maybeSingle();
		if (data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
			seed = data.data as Record<string, unknown>;
		}
	}

	const html = vanguardHtml.replace('<head>', `<head>\n${injectionScript(signedIn, seed)}`);

	return new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
