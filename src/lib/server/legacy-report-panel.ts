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
 * THERE IS AN OLDER COPY OF THIS IDEA INSIDE `src/routes/vanguard/+server.ts`,
 * and it is a MIGRATION CANDIDATE rather than a second sanctioned pattern -- the
 * same standing this repo gives its twenty-odd hand-rolled disclosures. It was
 * not folded in here in this bundle for one reason worth writing down: that
 * panel is woven into the GAME (it wears `.fbovl` so the game's own pointer,
 * mouse and wheel handlers stand down, it reads `__ideaGameInfo` for the mode
 * and sector, and it shares VANGUARD's own button factory), and none of that
 * can be verified without playing the game. Generalising it belongs in a bundle
 * that can.
 *
 * PRESENTATION AND TRANSPORT ONLY. Nothing here reads or writes coin data, and
 * the panel cannot reach the page's own script: it is an IIFE with no exports
 * that appends one element to `<body>`.
 */

function escapeForScript(jsonStr: string): string {
	return jsonStr
		.replace(/</g, '\\u003c')
		.split(String.fromCharCode(0x2028))
		.join('\\u2028')
		.split(String.fromCharCode(0x2029))
		.join('\\u2029');
}

export interface LegacyReportOptions {
	/** Whether this request carries a session. Decides the endpoint AND whether
	 *  the optional contact field is offered -- a signed-in report already
	 *  carries an account and needs no way to be reached. */
	signedIn: boolean;
	/** Where a SIGNED-IN report posts. Signed out always goes to the shared
	 *  anonymous route; the two never swap. */
	signedInEndpoint: string;
	/** The `app` id, only for the captured meta -- the ROUTE pins the real one. */
	app: string;
	/** The route this page answers on, for the captured meta. */
	route: string;
	/** Build provenance, from the same `describeBuild` the root layout uses. */
	deploy: { sha?: string | null; complete?: boolean } | null | undefined;
	buildId: string | null | undefined;
}

/**
 * The `<script>` to inject, as a string. Insert it anywhere inside `<body>`;
 * it waits for DOM readiness itself, so document order does not matter.
 */
export function legacyReportPanelScript(opts: LegacyReportOptions): string {
	const build: BuildStamp = describeBuild(opts.deploy, opts.buildId);
	const config = escapeForScript(
		JSON.stringify({
			signedIn: opts.signedIn,
			// Signed in goes to the authenticated route, which performs the
			// RLS-scoped insert as the caller. Signed out goes to the anonymous
			// route, unchanged.
			endpoint: opts.signedIn ? opts.signedInEndpoint : ANONYMOUS_FEEDBACK_ENDPOINT,
			kinds: FEEDBACK_KINDS,
			refusals: FEEDBACK_REFUSALS,
			maxLen: FEEDBACK_MAX_LEN,
			contactMax: FEEDBACK_CONTACT_MAX,
			app: opts.app,
			route: opts.route,
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
	var panel = null, textEl = null, contactEl = null, sendBtn = null, statusEl = null;
	var kind = 'bug', captured = {}, sending = false;

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
		/* WHICH TAB OF THE LEDGER, which is this page's equivalent of a route:
		   the whole surface answers on one URL and the tab is the only thing
		   that says which of five screens the report is about. */
		try {
			var active = document.querySelector('.tab-btn.active');
			tab = active ? (active.textContent || '').trim() : null;
		} catch (e) {}
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
		statusEl.style.color = bad ? '#FF8C00' : '#4A7A52';
	}

	function close() {
		if (panel) panel.style.display = 'none';
		setStatus('');
	}

	function send() {
		if (sending) return;
		var message = (textEl && textEl.value ? textEl.value : '').trim();
		if (!message) { setStatus(words('message_empty'), true); return; }
		if (message.length > CFG.maxLen) { setStatus(words('message_too_long'), true); return; }
		var contact = (contactEl && contactEl.value ? contactEl.value : '').trim();
		if (contact.length > CFG.contactMax) { setStatus(words('contact_too_long'), true); return; }

		var body = { app: CFG.app, context: 'ledger', kind: kind, message: message, meta: captured };
		if (!CFG.signedIn && contact) body.contact = contact;

		sending = true;
		if (sendBtn) sendBtn.disabled = true;
		setStatus('Sending...', false);
		fetch(CFG.endpoint, {
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

	function field(placeholder, maxLen, rows) {
		var el = document.createElement(rows > 1 ? 'textarea' : 'input');
		if (rows > 1) el.rows = rows; else el.type = 'text';
		el.placeholder = placeholder;
		el.maxLength = maxLen;
		el.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;font-size:0.78rem;background:rgba(0,0,0,0.4);color:#E8FFE8;border:1px solid rgba(74,122,82,0.35);border-radius:2px;padding:0.5rem 0.6rem;outline:none;resize:vertical;';
		el.addEventListener('focus', function () { el.style.borderColor = 'rgba(0,255,65,0.5)'; });
		el.addEventListener('blur', function () { el.style.borderColor = 'rgba(74,122,82,0.35)'; });
		return el;
	}

	function chip(label) {
		var b = document.createElement('button');
		b.type = 'button';
		b.textContent = label;
		/* 44px, the tap-target floor, on every control in here. */
		b.style.cssText = "font-family:'Orbitron',sans-serif;font-size:0.55rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;background:none;border:1px solid rgba(74,122,82,0.35);border-radius:2px;color:#4A7A52;padding:0.35rem 0.8rem;min-height:44px;cursor:pointer;";
		return b;
	}

	function build() {
		if (panel) return panel;
		panel = document.createElement('div');
		panel.id = 'idea-ledger-report';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', 'Report a problem');
		panel.style.cssText = "position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,10,4,0.82);font-family:'Share Tech Mono',ui-monospace,monospace;";

		var card = document.createElement('div');
		card.style.cssText = 'width:100%;max-width:420px;max-height:86vh;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:16px;background:#050F07;border:1px solid rgba(0,255,65,0.3);border-left:3px solid #C8FF00;border-radius:4px;color:#E8FFE8;box-shadow:0 10px 40px rgba(0,0,0,0.6);';

		var head = document.createElement('div');
		head.textContent = 'REPORT A PROBLEM';
		head.style.cssText = "font-family:'Orbitron',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:0.15em;color:#C8FF00;";
		card.appendChild(head);

		var note = document.createElement('div');
		/* THE TWO SENTENCES SAY DIFFERENT THINGS, NOT THE SAME THING TWICE, and
		   the difference is load-bearing rather than stylistic: a person should
		   know whether what they are about to send carries their name. Each
		   states its own case in a phrase the other does not contain, so a
		   surface that quietly showed the wrong one can be caught by reading
		   the panel rather than by knowing which session produced it. */
		note.textContent = CFG.signedIn
			? 'Something confusing, broken, or missing? This report carries your account. The tab you are on, your browser and the build are attached automatically.'
			: 'Something confusing, broken, or missing? You are not signed in, so this report carries no name. The tab you are on, your browser and the build are attached automatically.';
		note.style.cssText = 'font-size:0.72rem;line-height:1.5;color:#9FB8A6;';
		card.appendChild(note);

		var kinds = document.createElement('div');
		kinds.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
		var kindBtns = [];
		function paint() {
			for (var i = 0; i < kindBtns.length; i++) {
				var on = kindBtns[i].getAttribute('data-kind') === kind;
				kindBtns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
				kindBtns[i].style.color = on ? '#C8FF00' : '#9FB8A6';
				kindBtns[i].style.borderColor = on ? 'rgba(200,255,0,0.6)' : 'rgba(74,122,82,0.35)';
				kindBtns[i].style.background = on ? 'rgba(200,255,0,0.07)' : 'none';
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

		/* OFFERED ONLY WHERE THERE IS NO ACCOUNT, and optional in the LABEL
		   rather than only in a placeholder. It is NEVER an identity: nothing
		   verifies it. */
		if (!CFG.signedIn) {
			var cl = document.createElement('div');
			cl.textContent = 'A way to reach you (optional)';
			cl.style.cssText = 'font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase;color:#4A7A52;';
			card.appendChild(cl);
			contactEl = field('An email, a first name, or when to ask you', CFG.contactMax, 1);
			card.appendChild(contactEl);
		}

		statusEl = document.createElement('div');
		statusEl.setAttribute('role', 'status');
		statusEl.style.cssText = 'font-size:0.72rem;line-height:1.4;color:#4A7A52;min-height:16px;';
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
		panel.appendChild(card);
		(document.body || document.documentElement).appendChild(panel);
		return panel;
	}

	function open() {
		var p = build();
		captured = meta();
		p.style.display = 'flex';
		if (textEl) { try { textEl.focus(); } catch (e) {} }
	}

	/* THE TRIGGER GOES IN THE PAGE'S OWN CHROME, not floating over it. The
	   Ledger's header already carries a row of controls in exactly this style,
	   so the report sits beside them and inherits the surface's own language
	   rather than covering part of it. A fixed corner button would sit over the
	   leaderboard on a phone, which is the one place people read this page. */
	function mount() {
		if (document.getElementById('idea-ledger-report-btn')) return;
		var host = document.querySelector('header .header-right') || document.querySelector('header');
		if (!host) return;
		var btn = document.createElement('button');
		btn.id = 'idea-ledger-report-btn';
		btn.type = 'button';
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
		btn.style.cssText = "font-family:'Orbitron',sans-serif;font-size:0.52rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;background:none;border:1px solid rgba(74,122,82,0.35);border-radius:2px;color:#9FB8A6;padding:0.25rem 0.65rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;white-space:nowrap;";
		btn.addEventListener('mouseenter', function () { btn.style.color = '#C8FF00'; btn.style.borderColor = 'rgba(200,255,0,0.45)'; });
		btn.addEventListener('mouseleave', function () { btn.style.color = '#9FB8A6'; btn.style.borderColor = 'rgba(74,122,82,0.35)'; });
		/* A VISIBLE WORD, never a glyph alone: a title tooltip is not
		   discoverable and a phone cannot hover. */
		btn.textContent = 'Report';
		btn.setAttribute('aria-label', 'Report a problem');
		btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
		host.appendChild(btn);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mount);
	} else {
		mount();
	}
})();
<\/script>`;
}
