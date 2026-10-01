/**
 * THE CLASS GATE FOR THE THREE ROUTES THAT HAVE NO LAYOUT TO INHERIT IT FROM.
 *
 * `/foundry/preview`, `/foundry/download` and `/foundry/starter` are
 * `+server.ts` endpoints. A route group's LAYOUT load does not run for an
 * endpoint, which is the repository's standing rule and the exact reason
 * `+layout.server.ts`'s closure check never reached them: 0042 built the
 * per-section toggle's scope and then reported that the toggle was, in its own
 * words, a shutter on five documents. A student in a closed class pressed
 * Preview on their own shelf and their build ran.
 *
 * SO EACH ROUTE ASKS FOR ITSELF, THROUGH THE SAME PREDICATE AND THE SAME RPC.
 * Nothing here decides WHICH places a closure reaches: that is
 * `FOUNDRY_CLOSURE_BLOCKS` in `$lib/foundry/access`, one array, and this
 * module reads it. A second copy of the scope is how a route ends up dark on
 * one surface and lit on the next.
 *
 * THE PURE CHECK USED TO RUN FIRST, so a route the set does not name --
 * `/foundry/download` and `/foundry/starter` -- never opened a connection.
 * Ledger 0360's whole-Foundry switch reaches all three routes, so the read is
 * unconditional now and the class half still asks `foundryClosureBlocks(place)`
 * after it. Adding `'download'` to the set is still the whole of what it takes
 * to put download behind a class closure, and the test still does exactly
 * that.
 *
 * AND IT RUNS BEFORE ANYTHING IS RESOLVED ABOUT THE REQUEST, WHICH IS A
 * DISCLOSURE DECISION. A closed student is refused for every app id and every
 * version id alike, including ones that do not exist, so the refusal says
 * nothing about whether a given app is real, is theirs, or has a build in it.
 * Checking after the ownership gate would have turned this into an oracle on
 * exactly the surface whose 404 is otherwise carefully undifferentiated.
 *
 * NO SERVER-ONLY IMPORTS. It takes the caller's own Supabase client as an
 * argument and reads no environment, so it stays in `$lib/foundry` beside the
 * rest of the feature's pure layer and is drivable from a test with the
 * PostgREST shim.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	FOUNDRY_CLOSURE_LIMIT,
	FOUNDRY_SITE_OFF_LEAD,
	FOUNDRY_SITE_OFF_SCOPE,
	foundryAccessFromRpc,
	foundryClosedSentence,
	foundryClosureBlocks,
	foundrySiteOff,
	type FoundryClosedSection,
	type FoundryGuarded
} from './access.ts';

/**
 * The refusal, or `null` when this request may carry on.
 *
 * `null` IS THE PASS AND IT IS THE COMMON CASE, which is why the signature is
 * this way round rather than returning a verdict object somebody has to
 * remember to act on: a caller that forgets to use the result of a
 * `mayServe()` serves the bytes, and a caller that forgets to return this one
 * has an unused expression sitting in front of them.
 */
export async function foundryServeRefusal(
	supabase: Pick<SupabaseClient, 'rpc'>,
	place: FoundryGuarded
): Promise<Response | null> {
	/*
	 * THE READ IS NOW UNCONDITIONAL, AND THAT REVERSES THE ORDERING ARGUED FOR
	 * ABOVE ON PURPOSE (ledger 0360, report c26026b0). The pure check used to
	 * run first so `/foundry/download` and `/foundry/starter` never opened a
	 * connection; the WHOLE-FOUNDRY switch reaches every one of these routes
	 * for a non-admin, so each now pays for one `foundry_section_access` read.
	 * Those two routes are pressed a handful of times a day, which is the
	 * whole of the cost. The class half below is unchanged: it still asks
	 * `foundryClosureBlocks(place)` and still refuses only the places in the
	 * set.
	 */
	const { data, error } = await supabase.rpc('foundry_section_access');
	const access = foundryAccessFromRpc(data, error);
	if (foundrySiteOff(access)) return foundrySiteOffResponse(access.site?.note ?? null);

	if (!foundryClosureBlocks(place)) return null;
	if (access.open) return null;

	return foundryClosedResponse(access.closed);
}

/**
 * THE WHOLE FOUNDRY IS OFF, ON THE PORTAL ORIGIN. 503 rather than the class
 * gate's 403: nothing about this viewer was considered and refused, the
 * service is down for everyone and comes back when somebody turns it on.
 *
 * THE SAME TWO SENTENCES `FoundrySiteOff.svelte` RENDERS, plus the admin's
 * note when one was left, escaped. It names nobody: 0230 never projects who
 * turned it off. Same policy and same no-store as the class refusal below.
 */
export function foundrySiteOffResponse(note: string | null): Response {
	const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Foundry is turned off</title>
<style>
	:root { color-scheme: dark; }
	body {
		margin: 0;
		padding: 2rem 1.25rem;
		background: #0e120f;
		color: #e8ece6;
		font: 400 1rem/1.55 "Rajdhani", "Segoe UI", sans-serif;
	}
	main { max-width: 38rem; margin: 0 auto; }
	h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #e8ece6; }
	p { margin: 0 0 0.75rem; }
	.next { color: #b9c2b4; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(FOUNDRY_SITE_OFF_LEAD)}</h1>
${note ? `<p>${escapeHtml(note)}</p>\n` : ''}<p class="next">${escapeHtml(FOUNDRY_SITE_OFF_SCOPE)}</p>
</main>
</body>
</html>
`;
	return new Response(body, {
		status: 503,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
			'x-content-type-options': 'nosniff',
			'cache-control': 'no-store',
			'referrer-policy': 'no-referrer',
			'x-robots-tag': 'noindex, nofollow'
		}
	});
}

/**
 * WHAT A CLOSED-OUT STUDENT READS WHEN THE THING THEY ASKED FOR IS A FILE
 * RATHER THAN A PAGE.
 *
 * NOT A 404 AND NOT A BLANK BODY, and that is the difference between this
 * refusal and every other one on a bundle route. The bodyless 404 exists so an
 * unknown app, another student's app and a version that never unpacked are
 * indistinguishable from outside; NONE of that is at stake here, because the
 * student already knows their own app exists (they are looking at it on their
 * own shelf) and a class closure is not a secret from the class it was applied
 * to. What a 404 would produce is a student who thinks their upload broke, on
 * the one surface whose entire job is telling them whether their upload is
 * good.
 *
 * 403, therefore: considered, and refused, with the reason.
 *
 * THE WORDS ARE THE SAME WORDS. `foundryClosedSentence` is what
 * `FoundryClosed.svelte` renders on the panel this student sees everywhere
 * else, and `FOUNDRY_CLOSURE_LIMIT` is the same string their gallery refusal
 * carries. Two spellings of one refusal is how a surface ends up explaining
 * something the database is not doing.
 *
 * IT CARRIES NO SHARE LINK AND NO WORKAROUND. `FOUNDRY_CLOSURE_REACH` names
 * the two things a closure cannot stop and is rendered only on the
 * instructor's own control; see the argument beside those constants.
 *
 * HTML, ESCAPED, AND UNDER ITS OWN POLICY. This answers on the PORTAL origin,
 * where the session cookies are, so it states `default-src 'none'` with only
 * inline style permitted: there is no script in it, nothing is fetched, and
 * the only interpolated values are a course title and a section label, both
 * escaped. `noindex` and `no-store` because a refusal that is true for one
 * student in one period must not be cached into anybody else's browser or into
 * a search index.
 */
export function foundryClosedResponse(closed: readonly FoundryClosedSection[]): Response {
	const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Foundry is closed for one of your classes</title>
<style>
	:root { color-scheme: dark; }
	body {
		margin: 0;
		padding: 2rem 1.25rem;
		background: #0e120f;
		color: #e8ece6;
		font: 400 1rem/1.55 "Rajdhani", "Segoe UI", sans-serif;
	}
	main { max-width: 38rem; margin: 0 auto; }
	h1 { font-size: 1.25rem; margin: 0 0 0.75rem; color: #e8ece6; }
	p { margin: 0 0 0.75rem; }
	.next { color: #b9c2b4; }
</style>
</head>
<body>
<main>
<h1>The Foundry is closed for one of your classes</h1>
<p>${escapeHtml(foundryClosedSentence(closed))}</p>
<p class="next">${escapeHtml(FOUNDRY_CLOSURE_LIMIT)}</p>
</main>
</body>
</html>
`;
	return new Response(body, {
		status: 403,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
			'x-content-type-options': 'nosniff',
			'cache-control': 'no-store',
			'referrer-policy': 'no-referrer',
			'x-robots-tag': 'noindex, nofollow'
		}
	});
}

/**
 * The five characters, because the sentence carries a course title and a
 * section label that somebody typed into a roster. There is no `{@html}` in
 * this feature's rendering path and there is not one here either; this is the
 * same guarantee written out by hand because the response is a string rather
 * than a component tree.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
