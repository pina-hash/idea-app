import {
	ANONYMOUS_FEEDBACK_ENDPOINT,
	FEEDBACK_CONTACT_MAX,
	FEEDBACK_KINDS,
	FEEDBACK_MAX_LEN,
	FEEDBACK_REFUSALS
} from '$lib/feedback/feedback';
import { describeBuild, type BuildStamp } from '$lib/feedback/context';

/**
 * A REPORT-A-PROBLEM CONTROL FOR A PAGE THAT RENDERS NO LAYOUT.
 *
 * `SiteFeedback` is mounted once in the root layout, which is what makes
 * report coverage something a new route INHERITS rather than has to remember.
 * A carried-over legacy page inherits nothing: it is HTML served verbatim from
 * a `+server.ts`, with no component tree to mount a Svelte control into. So the
 * control is INJECTED into the served string -- the convention this repo
 * already uses for everything added to legacy HTML (link rewriting, the
 * version badge, VANGUARD's cloud-save bootstrap) -- and the file on disk is
 * never modified.
 *
 * IT IS NOT A SECOND FEEDBACK SYSTEM, AND THE PARTS THAT COULD DRIFT ARE ALL
 * IMPORTED. The kind list, the length caps, the refusal wording and the build
 * stamp come from `$lib/feedback/*` -- the same strings the Svelte box shows --
 * and the row lands in `app_feedback` through the same two endpoints every
 * other surface uses: the signed-in one for a caller with a session, the
 * anonymous one for a caller without. What is local to this file is the DOM it
 * builds, because there is no framework here to build it with.
 *
 * TWO CALLERS, TWO WAYS OF KNOWING WHO IS ASKING (report 20, 2026-09-25):
 *   * the IDEA Coin Ledger (`/coins`) knows at SERVE time: its response reads
 *     the session and carries `Vary: Cookie`, so the script is told
 *     `signedIn` and the page's bytes differ by session;
 *   * a carried-over ASSIGNMENT (`/assignments/<slug>`) must NOT: it is
 *     QR-coded onto handouts, a whole class opens it inside a minute, and its
 *     response is a SHARED cache entry with no `Vary: Cookie` -- one copy for
 *     everybody, which is the whole point of that header. A signed-in boolean
 *     baked into those bytes would be served to the next thirty readers,
 *     signed in or not. So that caller passes `sessionProbe` instead: the
 *     injected bytes are identical for every reader, and the script asks a
 *     `private, no-store` endpoint whether THIS reader has a session when the
 *     box OPENS (never on page load, so thirty phones opening the page cost
 *     the function nothing). Until that answer arrives nothing can be sent, and
 *     a failed probe says so rather than guessing: a signed-in student's report
 *     going down the anonymous route would carry no account.
 *
 * THERE IS AN OLDER COPY OF THIS IDEA INSIDE `src/routes/vanguard/+server.ts`,
 * and it is a MIGRATION CANDIDATE rather than a second sanctioned pattern -- the
 * same standing this repo gives its twenty-odd hand-rolled disclosures. It was
 * not folded in here for one reason worth writing down: that panel is woven
 * into the GAME (it wears `.fbovl` so the game's own pointer, mouse and wheel
 * handlers stand down, it reads `__ideaGameInfo` for the mode and sector, and
 * it shares VANGUARD's own button factory), and none of that can be verified
 * without playing the game. Generalising it belongs in a bundle that can.
 *
 * PRESENTATION AND TRANSPORT ONLY. Nothing here reads or writes page data, and
 * the panel cannot reach the page's own script: it is an IIFE with no exports
 * that appends its elements to `<body>`.
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
 * WHO IS ASKING: known when the bytes are built, or asked when the box opens.
 * Exactly one of the two, and the type says so, because a caller passing both
 * is a caller that has not decided whether its response may vary by session.
 */
export type LegacyReportSession =
	| {
			/** Whether this request carries a session. Decides the endpoint AND
			 *  whether the optional contact field is offered -- a signed-in report
			 *  already carries an account and needs no way to be reached. The
			 *  response that carries this MUST vary by session (`Vary: Cookie`). */
			signedIn: boolean;
			sessionProbe?: never;
	  }
	| {
			/** A same-origin GET answering `{ signedIn: boolean }` for THIS reader,
			 *  asked when the box opens. For a response shared by every reader. */
			sessionProbe: string;
			signedIn?: never;
	  };

export type LegacyReportOptions = LegacyReportSession & {
	/** Where a SIGNED-IN report posts. Signed out always goes to the shared
	 *  anonymous route; the two never swap, and no option names that one. */
	signedInEndpoint: string;
	/** The `app` id, only for the captured meta -- the ROUTE pins the real one. */
	app: string;
	/** The route this page answers on, for the captured meta. */
	route: string;
	/** Build provenance, from the same `describeBuild` the root layout uses. */
	deploy: { sha?: string | null; complete?: boolean } | null | undefined;
	buildId: string | null | undefined;
	/** The row's `context` column. The Ledger's is 'ledger'. */
	context?: string;
	/**
	 * WHERE THE TRIGGER GOES. `header` puts it in the page's own chrome (the
	 * Ledger's header row, which already carries controls in this style);
	 * `float` pins it to the bottom-left corner, for a page with no header to
	 * put it in. Bottom-LEFT because several assignment pages already keep
	 * their own fixed controls at the bottom right (measured: the Blade A02
	 * theme toggle at `bottom: 20px; right: 20px`, the Rulebook's 280px panel
	 * at `bottom: 24px; right: 24px`), and the version badge sits there too.
	 */
	mount?: 'header' | 'float';
	/** Prefix for the two element ids, `<prefix>` (the panel) and
	 *  `<prefix>-btn` (the trigger). The Ledger's is `idea-ledger-report`. */
	idPrefix?: string;
	/** A selector whose text names the screen within the page, recorded as
	 *  `meta.tab`. The Ledger's active tab; null for a page with none. */
	tabSelector?: string | null;
};

/** The one set of options every `/assignments/<slug>` response carries. The
 *  `/dev` harness spreads it and overrides only the two endpoints, so what it
 *  measures is what the route serves. */
export const ASSIGNMENT_REPORT_OPTIONS = {
	sessionProbe: '/api/assignment-feedback',
	signedInEndpoint: '/api/assignment-feedback',
	app: 'assignments',
	route: '/assignments/[slug]',
	context: '/assignments/[slug]',
	mount: 'float',
	idPrefix: 'idea-legacy-report',
	tabSelector: null
} as const;

/**
 * The `<script>` to inject, as a string. Insert it anywhere inside `<body>`;
 * it waits for DOM readiness itself, so document order does not matter.
 */
export function legacyReportPanelScript(opts: LegacyReportOptions): string {
	const build: BuildStamp = describeBuild(opts.deploy, opts.buildId);
	const probe = typeof opts.sessionProbe === 'string' ? opts.sessionProbe : null;
	if (probe === null && typeof opts.signedIn !== 'boolean') {
		throw new Error('legacyReportPanelScript: pass signedIn or sessionProbe');
	}
	const known = probe === null ? (opts.signedIn as boolean) : null;
	const config = escapeForScript(
		JSON.stringify({
			signedIn: known,
			// Resolved here when the session is known, so the bytes say which
			// route this reader's report takes. Null when the page asks at open.
			endpoint:
				known === null ? null : known ? opts.signedInEndpoint : ANONYMOUS_FEEDBACK_ENDPOINT,
			probe,
			signedInEndpoint: opts.signedInEndpoint,
			// THE ANONYMOUS ROUTE IS THE SHARED CONSTANT and no option names it,
			// so no caller -- a harness included -- can point a signed-out report
			// anywhere but /api/feedback.
			anonymousEndpoint: ANONYMOUS_FEEDBACK_ENDPOINT,
			kinds: FEEDBACK_KINDS,
			refusals: FEEDBACK_REFUSALS,
			maxLen: FEEDBACK_MAX_LEN,
			contactMax: FEEDBACK_CONTACT_MAX,
			app: opts.app,
			route: opts.route,
			context: opts.context ?? 'ledger',
			mount: opts.mount ?? 'header',
			id: opts.idPrefix ?? 'idea-ledger-report',
			// Spelled out whole, not built in the page: a spec finds the injected
			// script by this id's literal text.
			btnId: `${opts.idPrefix ?? 'idea-ledger-report'}-btn`,
			tab: opts.tabSelector === undefined ? '.tab-btn.active' : opts.tabSelector,
			build: {
				value: build.value,
				source: build.source,
				means: build.means,
				historyComplete: build.complete
			}
		})
	);

	return `<script>
(function () {
	var CFG = ${config};
	var ID = CFG.id, BTN_ID = CFG.btnId;
	var panel = null, textEl = null, contactEl = null, contactWrap = null, noteEl = null, sendBtn = null, statusEl = null;
	var kind = 'bug', captured = {}, sending = false;
	/* null until known. Known at serve time for the Ledger; asked at open for a
	   page whose bytes every reader shares. */
	var session = CFG.signedIn === true || CFG.signedIn === false ? CFG.signedIn : null;
	var probing = null;

	/* THE PALETTE. The Ledger and every carried-over assignment but one are the
	   neon-on-black family this panel was drawn for; the one exception is a
	   white, printable QR page. A panel in the page's own chrome takes the dark
	   set as it always did; a floating one reads the page's own ground and takes
	   the set drawn for it, so it opens in the room it is in. Every ink below is
	   measured in the browser against the ground it sits on (the /dev harness
	   and its route spec). */
	var DARK = {
		shade: 'rgba(2,10,4,0.82)', card: '#050F07', cardEdge: 'rgba(0,255,65,0.3)', rule: '#C8FF00', ink: '#E8FFE8',
		head: '#C8FF00', note: '#9FB8A6', field: 'rgba(0,0,0,0.4)', fieldEdge: 'rgba(74,122,82,0.35)', focus: 'rgba(0,255,65,0.5)',
		chipEdge: 'rgba(74,122,82,0.35)', chipInk: '#9FB8A6', onInk: '#C8FF00', onEdge: 'rgba(200,255,0,0.6)', onFill: 'rgba(200,255,0,0.07)',
		ok: '#C8FF00', bad: '#FF8C00', trigBg: 'none', trigEdge: 'rgba(74,122,82,0.35)', trigInk: '#9FB8A6', hoverInk: '#C8FF00', hoverEdge: 'rgba(200,255,0,0.45)',
		floatBg: 'rgba(2,10,4,0.92)', floatEdge: '#4A7A52', font: "'Share Tech Mono',ui-monospace,monospace", title: "'Orbitron',sans-serif"
	};
	var LIGHT = {
		shade: 'rgba(17,17,17,0.5)', card: '#ffffff', cardEdge: '#767676', rule: '#111111', ink: '#111111',
		head: '#111111', note: '#444444', field: '#f4f4f4', fieldEdge: '#767676', focus: '#111111',
		chipEdge: '#767676', chipInk: '#444444', onInk: '#111111', onEdge: '#111111', onFill: '#e8e8e8',
		ok: '#1d5f2c', bad: '#b3261e', trigBg: '#ffffff', trigEdge: '#767676', trigInk: '#444444', hoverInk: '#111111', hoverEdge: '#111111',
		floatBg: '#ffffff', floatEdge: '#767676', font: 'Arial,Helvetica,sans-serif', title: 'Arial,Helvetica,sans-serif'
	};
	var P = DARK;

	/* THE PAGE'S OWN GROUND: the first opaque background from body up. A page
	   that sets none is the browser's white. */
	function pageIsLight() {
		try {
			var els = [document.body, document.documentElement];
			for (var i = 0; i < els.length; i++) {
				if (!els[i]) continue;
				var m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(els[i]).backgroundColor || '');
				if (!m) continue;
				var p = m[1].split(',').map(function (x) { return parseFloat(x); });
				if (p.length === 4 && p[3] === 0) continue;
				var lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;
				return lum > 0.5;
			}
		} catch (e) {}
		return true;
	}

	function words(reason) {
		return CFG.refusals[reason] || ('The server refused that report (' + reason + ').');
	}

	/* THE CAPTURE IS THE SAME SET \`captureMeta\` COLLECTS, read off the page at
	   the moment the box OPENS rather than when it renders: the viewport and the
	   tab a person is looking at when they decide something is wrong is the
	   context worth having. Nothing here is asked for -- a field somebody has to
	   fill in is a field that arrives empty. */
	function meta() {
		var vp = null, ua = null, tab = null;
		try { vp = window.innerWidth + 'x' + window.innerHeight; } catch (e) {}
		try { ua = (navigator.userAgent || '').trim() || null; } catch (e) {}
		/* WHICH TAB OF THE PAGE, where the page has tabs: the Ledger answers on
		   one URL and the tab is the only thing that says which of five screens
		   the report is about. */
		if (CFG.tab) {
			try {
				var active = document.querySelector(CFG.tab);
				tab = active ? (active.textContent || '').trim() : null;
			} catch (e) {}
		}
		return {
			route: CFG.route,
			surface: 'injected report control',
			path: (location && location.pathname) || CFG.route,
			hash: (location && location.hash) || null,
			tab: tab,
			viewport: vp,
			userAgent: ua,
			at: new Date().toISOString(),
			build: CFG.build
		};
	}

	function setStatus(text, bad) {
		if (!statusEl) return;
		statusEl.textContent = text || '';
		statusEl.style.color = bad ? P.bad : P.note;
	}

	function close() {
		var wasOpen = !!panel && panel.style.display !== 'none';
		if (panel) panel.style.display = 'none';
		setStatus('');
		/* Focus goes back to the control that opened the box, without scrolling:
		   the Ledger's trigger sits in a header that may be far above the reader. */
		if (wasOpen) {
			var b = document.getElementById(BTN_ID);
			if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
		}
	}

	/* THE TWO SENTENCES SAY DIFFERENT THINGS, NOT THE SAME THING TWICE, and the
	   difference is load-bearing rather than stylistic: a person should know
	   whether what they are about to send carries their name. Each states its
	   own case in a phrase the other does not contain, so a surface that quietly
	   showed the wrong one can be caught by reading the panel rather than by
	   knowing which session produced it. */
	function applySession() {
		if (noteEl) {
			var where = CFG.tab ? 'The tab you are on' : 'The page you are on';
			noteEl.textContent = session === true
				? 'Something confusing, broken, or missing? This report carries your account. ' + where + ', your browser and the build are attached automatically.'
				: session === false
					? 'Something confusing, broken, or missing? You are not signed in, so this report carries no name. ' + where + ', your browser and the build are attached automatically.'
					: 'Something confusing, broken, or missing? ' + where + ', your browser and the build are attached automatically.';
		}
		/* OFFERED ONLY WHERE THERE IS NO ACCOUNT, and optional in the LABEL
		   rather than only in a placeholder. It is NEVER an identity: nothing
		   verifies it. It is not built at all until the session is known to be
		   absent, so a signed-in reader's panel has no such field in it -- not a
		   hidden one -- and a page that asks at open never offers it early. */
		if (session === false && !contactWrap && panel && statusEl) {
			contactWrap = document.createElement('div');
			contactWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
			var cl = document.createElement('div');
			cl.textContent = 'A way to reach you (optional)';
			cl.style.cssText = 'font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase;color:' + P.note + ';';
			contactWrap.appendChild(cl);
			contactEl = field('An email, a first name, or when to ask you', CFG.contactMax, 1);
			contactWrap.appendChild(contactEl);
			statusEl.parentNode.insertBefore(contactWrap, statusEl);
		}
	}

	/* Asks once per open at most; a failed answer forgets itself so the next
	   press asks again. Resolves true/false, rejects when it could not ask. */
	function ask() {
		if (session !== null) return Promise.resolve(session);
		if (probing) return probing;
		probing = fetch(CFG.probe, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
			.then(function (r) { if (!r.ok) throw new Error('probe ' + r.status); return r.json(); })
			.then(function (b) { session = !!(b && b.signedIn === true); probing = null; applySession(); return session; },
				function (e) { probing = null; throw e; });
		return probing;
	}

	function post() {
		var message = (textEl && textEl.value ? textEl.value : '').trim();
		var contact = (contactEl && contactEl.value ? contactEl.value : '').trim();
		var body = { app: CFG.app, context: CFG.context, kind: kind, message: message, meta: captured };
		if (session === false && contact) body.contact = contact;
		var endpoint = CFG.endpoint || (session ? CFG.signedInEndpoint : CFG.anonymousEndpoint);
		setStatus('Sending...', false);
		fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}).then(function (r) {
			return r.json().catch(function () { return {}; });
		}).then(function (b) {
			sending = false;
			if (sendBtn) sendBtn.disabled = false;
			if (b && b.ok === true) {
				setStatus('Sent. Thank you.', false);
				if (statusEl) statusEl.style.color = P.ok;
				if (textEl) textEl.value = '';
				setTimeout(close, 1200);
				return;
			}
			/* A 'reason' means the far side CONSIDERED this and said no, so it is
			   reported once in the words that reason has rather than re-sent. No
			   reason at all is the only outcome sending again can fix. */
			var reason = b && typeof b.reason === 'string' ? b.reason.trim() : '';
			if (reason) setStatus(words(reason), true);
			else setStatus('That did not send. It can be re-sent.', true);
		}).catch(function () {
			sending = false;
			if (sendBtn) sendBtn.disabled = false;
			setStatus('That did not send. Check your connection.', true);
		});
	}

	function send() {
		if (sending) return;
		var message = (textEl && textEl.value ? textEl.value : '').trim();
		if (!message) { setStatus(words('message_empty'), true); return; }
		if (message.length > CFG.maxLen) { setStatus(words('message_too_long'), true); return; }
		var contact = (contactEl && contactEl.value ? contactEl.value : '').trim();
		if (session === false && contact.length > CFG.contactMax) { setStatus(words('contact_too_long'), true); return; }

		sending = true;
		if (sendBtn) sendBtn.disabled = true;
		if (session !== null) { post(); return; }
		/* NOTHING IS SENT UNTIL WE KNOW WHICH ROUTE IT TAKES. */
		setStatus('Checking whether you are signed in...', false);
		ask().then(function () { post(); }, function () {
			sending = false;
			if (sendBtn) sendBtn.disabled = false;
			setStatus('Could not reach the site to check whether you are signed in. Check the connection and press Send again.', true);
		});
	}

	function field(placeholder, maxLen, rows) {
		var el = document.createElement(rows > 1 ? 'textarea' : 'input');
		if (rows > 1) el.rows = rows; else el.type = 'text';
		el.placeholder = placeholder;
		el.maxLength = maxLen;
		el.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;font-size:0.78rem;background:' + P.field + ';color:' + P.ink + ';border:1px solid ' + P.fieldEdge + ';border-radius:2px;padding:0.5rem 0.6rem;outline:none;resize:vertical;';
		el.addEventListener('focus', function () { el.style.borderColor = P.focus; });
		el.addEventListener('blur', function () { el.style.borderColor = P.fieldEdge; });
		return el;
	}

	function chip(label) {
		var b = document.createElement('button');
		b.type = 'button';
		b.textContent = label;
		/* 44px, the tap-target floor, on every control in here. */
		b.style.cssText = 'font-family:' + P.title + ';font-size:0.55rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;background:none;border:1px solid ' + P.chipEdge + ';border-radius:2px;color:' + P.chipInk + ';padding:0.35rem 0.8rem;min-height:44px;cursor:pointer;';
		return b;
	}

	function build() {
		if (panel) return panel;
		panel = document.createElement('div');
		panel.id = ID;
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', 'Report a problem');
		/* Above everything the page itself draws: a floating panel opens over a
		   page whose own overlays reach z-index 9999. */
		panel.style.cssText = 'position:fixed;inset:0;z-index:' + (CFG.mount === 'float' ? '2147483600' : '2000') + ';display:flex;align-items:center;justify-content:center;padding:16px;background:' + P.shade + ';font-family:' + P.font + ';';

		var card = document.createElement('div');
		card.style.cssText = 'width:100%;max-width:420px;max-height:86vh;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:16px;background:' + P.card + ';border:1px solid ' + P.cardEdge + ';border-left:3px solid ' + P.rule + ';border-radius:4px;color:' + P.ink + ';box-shadow:0 10px 40px rgba(0,0,0,0.6);';

		var head = document.createElement('div');
		head.textContent = 'REPORT A PROBLEM';
		head.style.cssText = 'font-family:' + P.title + ';font-size:0.7rem;font-weight:700;letter-spacing:0.15em;color:' + P.head + ';';
		card.appendChild(head);

		noteEl = document.createElement('div');
		noteEl.style.cssText = 'font-size:0.72rem;line-height:1.5;color:' + P.note + ';';
		card.appendChild(noteEl);

		var kinds = document.createElement('div');
		kinds.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
		var kindBtns = [];
		function paint() {
			for (var i = 0; i < kindBtns.length; i++) {
				var on = kindBtns[i].getAttribute('data-kind') === kind;
				kindBtns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
				kindBtns[i].style.color = on ? P.onInk : P.chipInk;
				kindBtns[i].style.borderColor = on ? P.onEdge : P.chipEdge;
				kindBtns[i].style.background = on ? P.onFill : 'none';
			}
		}
		for (var ki = 0; ki < CFG.kinds.length; ki++) {
			(function (k) {
				var b = chip(k.label);
				b.title = k.hint;
				b.setAttribute('data-kind', k.id);
				b.addEventListener('click', function (e) { e.stopPropagation(); kind = k.id; paint(); });
				kindBtns.push(b);
				kinds.appendChild(b);
			})(CFG.kinds[ki]);
		}
		paint();
		card.appendChild(kinds);

		textEl = field('What happened?', CFG.maxLen, 4);
		card.appendChild(textEl);

		statusEl = document.createElement('div');
		statusEl.setAttribute('role', 'status');
		statusEl.style.cssText = 'font-size:0.72rem;line-height:1.4;color:' + P.note + ';min-height:16px;';
		card.appendChild(statusEl);

		var row = document.createElement('div');
		row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
		var cancel = chip('Close');
		cancel.addEventListener('click', function (e) { e.stopPropagation(); close(); });
		sendBtn = chip('Send');
		sendBtn.addEventListener('click', function (e) { e.stopPropagation(); send(); });
		row.appendChild(cancel);
		row.appendChild(sendBtn);
		card.appendChild(row);

		card.addEventListener('click', function (e) { e.stopPropagation(); });
		panel.addEventListener('click', function () { close(); });
		/* Escape closes it, answered on the panel itself so it only ever hears a
		   key pressed while the box has focus, and stopped there so a page's own
		   Escape handler (a lightbox, a modal) does not also act on it. */
		panel.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); close(); }
		});
		panel.appendChild(card);
		(document.body || document.documentElement).appendChild(panel);
		applySession();
		return panel;
	}

	function open() {
		var p = build();
		captured = meta();
		p.style.display = 'flex';
		if (session === null) {
			setStatus('Checking whether you are signed in...', false);
			ask().then(function () { setStatus(''); }, function () {
				setStatus('Could not reach the site to check whether you are signed in. Check the connection; Send will try again.', true);
			});
		}
		if (textEl) { try { textEl.focus(); } catch (e) {} }
	}

	function trigger() {
		var btn = document.createElement('button');
		btn.id = BTN_ID;
		btn.type = 'button';
		/* A VISIBLE WORD, never a glyph alone: a title tooltip is not
		   discoverable and a phone cannot hover. */
		btn.setAttribute('aria-label', 'Report a problem');
		btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
		return btn;
	}

	/* THE TRIGGER GOES IN THE PAGE'S OWN CHROME WHERE THERE IS SOME, not
	   floating over it. The Ledger's header already carries a row of controls in
	   exactly this style, so the report sits beside them and inherits the
	   surface's own language rather than covering part of it. A fixed corner
	   button would sit over the leaderboard on a phone, which is the one place
	   people read this page. */
	function mountHeader() {
		var host = document.querySelector('header .header-right') || document.querySelector('header');
		if (!host) return;
		var btn = trigger();
		/* IT WEARS THE SURFACE'S LANGUAGE WITHOUT WEARING ITS CLASSES, and that
		   is not fussiness. The obvious move is \`className = 'share-btn'\`, the
		   Ledger's own header-control class -- and the Ledger hides that class
		   outright below 768px (\`.share-btn { display: none }\` in its own
		   media query). Measured: the trigger came back 0x0 at a 375px
		   viewport, invisible on the one width a student reads this page at,
		   while looking perfect at 1440. So the styling is inline, matched to
		   \`.share-btn\` by eye from the same stylesheet, and no rule in the
		   frozen file can take it away. */
		/* THE RESTING INK IS NOT the Ledger's own share-button ink. That
		   control sits at the Ledger's --dim (#4A7A52), which measures 4:1
		   against the header ground -- below the 4.5:1 floor, measured rather
		   than assumed. The Ledger's existing chrome is not this bundle's to
		   repaint, but a control being ADDED has to clear it, so the trigger
		   takes the muted sage the injected panel already uses for its own copy
		   (9.17:1 there). The hover is the share button's gold, unchanged, so
		   the two still behave like siblings. */
		btn.style.cssText = 'font-family:' + P.title + ';font-size:0.52rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;background:' + P.trigBg + ';border:1px solid ' + P.trigEdge + ';border-radius:2px;color:' + P.trigInk + ';padding:0.25rem 0.65rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;white-space:nowrap;';
		btn.addEventListener('mouseenter', function () { btn.style.color = P.hoverInk; btn.style.borderColor = P.hoverEdge; });
		btn.addEventListener('mouseleave', function () { btn.style.color = P.trigInk; btn.style.borderColor = P.trigEdge; });
		btn.textContent = 'Report';
		host.appendChild(btn);
	}

	/* A PAGE WITH NO HEADER TO PUT IT IN: a floating trigger in the bottom-left
	   corner, clear of the safe area, with the warning glyph the portal's own
	   control carries beside the word. Its outer edge is the only thing
	   separating it from the page, so the edge is a load-bearing one (3:1), and
	   it is left out of a printout -- several of these pages are printed. */
	function mountFloat() {
		var btn = trigger();
		/* A hook with a box, so a harness waiting for a painted page has one to
		   find on a legacy page with no <main> and no <h1>. */
		btn.setAttribute('data-testid', 'legacy-report');
		btn.style.cssText = 'position:fixed;left:max(12px, env(safe-area-inset-left, 0px));bottom:calc(12px + env(safe-area-inset-bottom, 0px));z-index:2147483500;font-family:' + P.title + ';font-size:0.6rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;background:' + P.floatBg + ';border:1px solid ' + P.floatEdge + ';border-radius:999px;color:' + P.trigInk + ';padding:0 0.9rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;min-height:44px;min-width:44px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,0.3);';
		btn.addEventListener('mouseenter', function () { btn.style.color = P.hoverInk; btn.style.borderColor = P.hoverEdge; });
		btn.addEventListener('mouseleave', function () { btn.style.color = P.trigInk; btn.style.borderColor = P.floatEdge; });
		var svgNs = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(svgNs, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('width', '15');
		svg.setAttribute('height', '15');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.7');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		['M12 3l9 16H3z', 'M12 9v4', 'M12 16.5v.01'].forEach(function (d) {
			var path = document.createElementNS(svgNs, 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		});
		btn.appendChild(svg);
		var word = document.createElement('span');
		word.textContent = 'Report';
		btn.appendChild(word);
		var print = document.createElement('style');
		print.textContent = '@media print { #' + BTN_ID + ', #' + ID + ' { display: none !important; } }';
		(document.head || document.documentElement).appendChild(print);
		(document.body || document.documentElement).appendChild(btn);
	}

	function mount() {
		if (document.getElementById(BTN_ID)) return;
		/* A VISIBLE POINTER INSIDE THE BOX, WHATEVER THE PAGE DOES WITH ITS OWN.
		   The Blade Rulebook hides the native cursor on every element
		   (\`*,*::before,*::after{cursor:none}\`) and draws its own dot at
		   z-index 99999, which this panel sits above -- measured, the scrim, the
		   card, the text box and the trigger's word all computed \`cursor: none\`,
		   so the pointer vanished the moment the box opened. An id selector
		   outranks that universal rule without \`!important\`, so a page that
		   styles its cursor with \`!important\` (the crosshair pages) keeps its
		   own look, which is visible and theirs to choose. */
		var cur = document.createElement('style');
		cur.textContent = '#' + ID + ', #' + ID + ' * { cursor: auto; } #' + BTN_ID + ' * { cursor: inherit; }';
		(document.head || document.documentElement).appendChild(cur);
		if (CFG.mount === 'float') {
			P = pageIsLight() ? LIGHT : DARK;
			mountFloat();
		} else {
			mountHeader();
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mount);
	} else {
		mount();
	}
})();
<\/script>`;
}

/**
 * Put the panel into a served page: before the LAST `</body>`, appended when
 * there is none. The last, not the first, because a page's own inline script
 * may carry the string `</body>` in a template, and inserting there would put
 * this script inside that one.
 */
export function injectLegacyReportPanel(html: string, opts: LegacyReportOptions): string {
	const script = `${legacyReportPanelScript(opts)}\n`;
	const i = html.toLowerCase().lastIndexOf('</body>');
	if (i === -1) return html + script;
	return html.slice(0, i) + script + html.slice(i);
}
