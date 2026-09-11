// tests/auth-callback-next.test.ts
//
// `?next=` ON THE OAUTH CALLBACK WAS AN OPEN REDIRECT, AND THIS IS THE TEST
// THAT WOULD HAVE CAUGHT IT.
//
// The route read `url.searchParams.get('next') ?? '/dashboard'` and handed the
// value straight to `redirect(303, next)`. Nothing validated it. That is the
// most valuable place on the site to have one: the hop fires immediately after
// a SUCCESSFUL sign-in, the link that starts it is genuinely on our own domain,
// and the person following it has just been through a Google page and been
// taught the flow is safe.
//
// It earns a place in this suite because the regression is SILENT. A restored
// `?next=` passthrough breaks no page, fails no type check, and shows nothing
// on screen -- every legitimate sign-in still lands on `/dashboard` or on the
// path the person came from. The only way to see it is to send a hostile value
// and watch where it goes, which is what every case below does.
//
// EVERY REFUSAL IS ASSERTED BY NAME, and the positive control is asserted
// beside them. A redirect validator tested only on its happy path is a
// validator nobody has tested: `return next` passes that test.

import { describe, expect, test } from 'vitest';
import { _safeNext } from '../src/routes/auth/callback/+server';

const FALLBACK = '/dashboard';

describe('_safeNext refuses everything that is not a same-origin path', () => {
	// Each case is named because the name is the finding. A table that reddens
	// says WHICH shape got through, not merely that one did.
	const refused: [string, string][] = [
		['an absolute https URL', 'https://evil.example'],
		['an absolute https URL with a path', 'https://evil.example/classroom/abc'],
		['an absolute http URL', 'http://evil.example/'],
		['a protocol-relative URL', '//evil.example'],
		['a protocol-relative URL with a path', '//evil.example/dashboard'],
		['three slashes, which a browser reads as protocol-relative', '///evil.example'],
		// A backslash is a forward slash to a URL parser, so each of these is
		// `//evil.example` by the time a browser acts on it.
		['the backslash variant of a protocol-relative URL', '\\/\\/evil.example'],
		['a backslash pair', '\\\\evil.example'],
		['one slash and one backslash', '/\\evil.example'],
		['a backslash after a legitimate-looking path', '/dashboard\\@evil.example'],
		['the javascript: scheme', 'javascript:alert(1)'],
		['the javascript: scheme, mixed case', 'JavaScript:alert(1)'],
		['the data: scheme', 'data:text/html,<script>alert(1)</script>'],
		['the file: scheme', 'file:///etc/passwd'],
		// A browser STRIPS tab, newline and carriage return out of a URL before
		// resolving it, so each of these three leaves the browser as
		// '//evil.example' -- protocol-relative, somebody else's host.
		['a tab smuggled between the slashes', '/\t/evil.example'],
		['a newline smuggled between the slashes', '/\n/evil.example'],
		['a carriage return smuggled between the slashes', '/\r/evil.example'],
		['a NUL byte', '/dashboard\u0000'],
		['a bare hostname with no scheme', 'evil.example/path'],
		['a relative path with no leading slash', 'dashboard'],
		['the empty string', ''],
		['a lone space', ' '],
		['leading whitespace before a protocol-relative URL', ' //evil.example']
	];

	for (const [label, value] of refused) {
		test(`refuses ${label}`, () => {
			// The label rides in the expectation so a failure names the shape.
			expect([label, _safeNext(value)]).toEqual([label, FALLBACK]);
		});
	}

	test('refuses a missing parameter, which is how most sign-ins arrive', () => {
		expect(_safeNext(null)).toBe(FALLBACK);
		expect(_safeNext(undefined)).toBe(FALLBACK);
	});

	test('no refusal ever answers with anything but the fallback path', () => {
		// The blanket property, so a future refusal that answered with the
		// hostile value trimmed rather than replaced would redden here too.
		for (const [, value] of refused) {
			const out = _safeNext(value);
			expect(out).toBe(FALLBACK);
			expect(out.startsWith('/')).toBe(true);
			expect(out.startsWith('//')).toBe(false);
		}
	});
});

describe('_safeNext still carries a legitimate destination', () => {
	// THE POSITIVE CONTROL. Without it every assertion above is satisfied by a
	// function that returns `/dashboard` unconditionally -- which refuses every
	// attack and also breaks the feature.
	const allowed: [string, string, string][] = [
		['the documented default', '/dashboard', '/dashboard'],
		['a classroom deep link', '/classroom/abc', '/classroom/abc'],
		['a path with a query string', '/classroom/abc?tab=work', '/classroom/abc?tab=work'],
		['a path with a fragment', '/classroom/abc#unit-3', '/classroom/abc#unit-3'],
		[
			'a path with both',
			'/classroom/abc?tab=work#unit-3',
			'/classroom/abc?tab=work#unit-3'
		],
		['the site root', '/', '/'],
		['a notebook entry', '/notebook/entry/7', '/notebook/entry/7'],
		['a percent-encoded segment', '/reference/a%20b', '/reference/a%20b'],
		// Not a scheme: a colon inside a PATH segment is an ordinary character,
		// and refusing it would break any route that ever carries one.
		['a colon inside a path segment', '/maps/edit/a:b', '/maps/edit/a:b'],
		// `@` in a path is likewise ordinary; it only means an authority when
		// there is an authority, and there is not one after a single slash.
		['an @ inside a path segment', '/foundry/@thing', '/foundry/@thing']
	];

	for (const [label, value, expected] of allowed) {
		test(`allows ${label}`, () => {
			expect([label, _safeNext(value)]).toEqual([label, expected]);
		});
	}

	test('the positive control is not vacuous: something other than the fallback comes back', () => {
		// If `_safeNext` were `() => '/dashboard'` every refusal above would pass
		// and this would not.
		const distinct = new Set(allowed.map(([, v]) => _safeNext(v)));
		expect(distinct.size).toBeGreaterThan(1);
		expect(distinct.has('/classroom/abc')).toBe(true);
	});

	test('a traversal that stays on the origin is normalised, not rejected', () => {
		// `..` cannot climb past the origin in a URL, so this is a path on our
		// own site and the answer is the resolved path rather than a refusal.
		const out = _safeNext('/classroom/../dashboard');
		expect(out).toBe('/dashboard');
		expect(out.startsWith('/')).toBe(true);
		expect(out.startsWith('//')).toBe(false);
	});

	test('every allowed answer is still a same-origin path', () => {
		for (const [, value] of allowed) {
			const out = _safeNext(value);
			expect(out.startsWith('/')).toBe(true);
			expect(out.startsWith('//')).toBe(false);
			// Resolving the answer against a foreign origin must not move it.
			expect(new URL(out, 'https://ideabosco.com').origin).toBe('https://ideabosco.com');
		}
	});
});
