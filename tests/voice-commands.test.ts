// tests/voice-commands.test.ts
//
// THE VOICE VOCABULARY, WHOSE REGRESSIONS ARE ALL SILENT.
//
// Voice navigation has no visible failure mode worth the name: a phrase that
// stops matching does nothing, a phrase that starts matching the WRONG
// destination moves somebody off the page they were on, and a vocabulary that
// quietly narrows to nothing still renders a control that listens politely and
// never acts. None of those reddens anything on screen, and none of them is
// something a person would think to re-check.
//
// THREE GUARANTEES ARE PINNED HERE:
//
//  1. THE TABLE IS UNAMBIGUOUS. No phrase reaches two destinations, and no
//     destination phrase is shadowed by an action phrase. A collision is the
//     one failure that navigates somewhere real and wrong.
//  2. THE ROUTES ARE THE REGISTRY'S. Every destination's href is an href
//     `PORTAL_APPS` actually carries, so a card whose route moves takes the
//     spoken command with it rather than leaving a phrase pointing at a 404.
//  3. THE VOCABULARY IS GATED BY AUDIENCE. An admin surface is not sayable by
//     a student and an auth-only one is not sayable signed out -- the list a
//     person is shown has to be the list that works, which is the whole claim
//     the feature rests on.
//
// THE EXPECTED VALUES BELOW ARE TYPED BY HAND FROM THE REGISTRY, not derived
// from the matcher. A table built by calling `voiceDestinations` and then
// asserting `matchUtterance` agrees with it cannot fail.

import { describe, expect, it } from 'vitest';
import {
	EXTRA_DESTINATIONS,
	SPOKEN_ALIASES,
	VOICE_ACTIONS,
	VOICE_PRIVACY_NOTE,
	matchUtterance,
	missNote,
	spokenKey,
	utteranceKey,
	voiceDestinations
} from '$lib/voice/commands';
import { PORTAL_APPS } from '$lib/portal-apps';

const ADMIN = { signedIn: true, isAdmin: true };
const STUDENT = { signedIn: true, isAdmin: false };
const VISITOR = { signedIn: false, isAdmin: false };

/**
 * WHAT A PERSON SAYS, AND WHERE IT MUST LAND. Written out from
 * `src/lib/portal-apps.ts` by reading the `href` off each entry, deliberately
 * NOT by calling anything in the module under test. A route that moves in the
 * registry and not here is a mismatch this file reports rather than absorbs.
 */
const SPOKEN: [string, string][] = [
	['classroom', '/classroom'],
	['go to my classes', '/classroom'],
	['Open my notebook.', '/notebook'],
	['take me to the notebook', '/notebook'],
	['idea cad', '/ideacad'],
	['cad', '/ideacad'],
	['maps', '/maps'],
	['show me idea maps', '/maps'],
	['find a tool', '/maps'],
	['coin ledger', '/coins/index.html'],
	['my balance', '/coins/index.html'],
	['leaderboard', '/coins/index.html'],
	['gauntlet', '/gauntlet'],
	['launch gauntlet', '/gauntlet'],
	['f r c', '/frc'],
	['robotics', '/frc'],
	['green line', '/greenline'],
	['vanguard please', '/vanguard/'],
	['foundry', '/foundry'],
	['student apps', '/foundry'],
	['tournaments', '/tournaments'],
	['brackets', '/tournaments'],
	['coin desk', '/coin-desk'],
	['admin dashboard', '/dashboard'],
	['home', '/'],
	['whats new', '/classroom/updates'],
	['course archive', '/archive']
];

describe('the spoken vocabulary reaches the right route', () => {
	const destinations = voiceDestinations(ADMIN);

	it.each(SPOKEN)('%s -> %s', (said, href) => {
		const match = matchUtterance(said, destinations);
		expect(match.kind).toBe('go');
		if (match.kind !== 'go') return;
		expect(match.destination.href).toBe(href);
	});

	// A sweep that generated nothing passes every `it.each` in it.
	it('measures the whole table', () => {
		expect(SPOKEN.length).toBe(27);
	});
});

describe('normalisation', () => {
	it('folds case, punctuation and spacing into one key', () => {
		expect(spokenKey('IDEA // GAUNTLET')).toBe('idea gauntlet');
		expect(spokenKey('  Coin  Desk. ')).toBe('coin desk');
		expect(spokenKey("What's new?")).toBe('what s new');
	});

	it('strips one leading verb and one trailing courtesy, longest verb first', () => {
		expect(utteranceKey('go to maps')).toBe('maps');
		expect(utteranceKey('take me to the notebook')).toBe('notebook');
		expect(utteranceKey('open gauntlet please')).toBe('gauntlet');
	});

	/**
	 * THE STRIP THAT WOULD EMPTY THE STRING IS REFUSED, and this is the case it
	 * exists for: "go" on its own must MISS, not become '' and then match
	 * whichever phrase happens to normalise to nothing.
	 */
	it('refuses a strip that would leave nothing behind', () => {
		expect(utteranceKey('go')).toBe('go');
		expect(utteranceKey('open')).toBe('open');
		expect(utteranceKey('please')).toBe('please');
		expect(matchUtterance('go', voiceDestinations(ADMIN)).kind).toBe('none');
	});
});

describe('a miss does nothing and says what it heard', () => {
	const destinations = voiceDestinations(ADMIN);

	// The POSITIVE CONTROL for the three refusals below: the same matcher, the
	// same destination list, one utterance that does resolve. Without it, a
	// matcher that refused everything would pass all three.
	it('resolves a real phrase from the same list', () => {
		expect(matchUtterance('notebook', destinations).kind).toBe('go');
	});

	it.each([
		'what is the weather',
		'delete everything',
		'gauntlets' // one letter off a real phrase: the near-miss case
	])('%s is not a command', (said) => {
		const match = matchUtterance(said, destinations);
		expect(match.kind).toBe('none');
	});

	it('hands the heard words back so the person can correct themselves', () => {
		const match = matchUtterance('Go to the gauntlets!', destinations);
		expect(match.kind).toBe('none');
		expect(match.heard).toBe('gauntlets');
		expect(missNote(match.heard)).toContain('gauntlets');
	});

	it('says something useful when nothing was heard at all', () => {
		expect(missNote('')).toMatch(/nothing was heard/i);
	});
});

describe('the table is unambiguous', () => {
	/**
	 * EVERY PHRASE REACHES EXACTLY ONE THING. Checked over the ADMIN
	 * vocabulary, which is the widest -- a collision that only exists for an
	 * admin is still a collision, and the narrower audiences are subsets.
	 */
	it('no phrase reaches two destinations', () => {
		const seen = new Map<string, string>();
		const collisions: string[] = [];
		for (const d of voiceDestinations(ADMIN)) {
			for (const phrase of d.phrases) {
				const prior = seen.get(phrase);
				if (prior) collisions.push(`"${phrase}" -> ${prior} and ${d.id}`);
				else seen.set(phrase, d.id);
			}
		}
		expect(collisions).toEqual([]);
		// The sweep found something to look at.
		expect(seen.size).toBeGreaterThan(30);
	});

	it('no action phrase is shadowed by a destination phrase', () => {
		const destinationPhrases = new Set(voiceDestinations(ADMIN).flatMap((d) => d.phrases));
		const shadowed: string[] = [];
		for (const action of VOICE_ACTIONS) {
			for (const phrase of action.phrases) {
				if (destinationPhrases.has(spokenKey(phrase))) shadowed.push(`${action.id}: ${phrase}`);
			}
		}
		expect(shadowed).toEqual([]);
	});

	it('every phrase is already normalised, so a table entry cannot be unsayable', () => {
		const raw: string[] = [];
		for (const d of voiceDestinations(ADMIN)) {
			for (const phrase of d.phrases) if (spokenKey(phrase) !== phrase) raw.push(phrase);
		}
		for (const a of VOICE_ACTIONS) {
			for (const phrase of a.phrases) if (spokenKey(phrase) !== phrase) raw.push(phrase);
		}
		expect(raw).toEqual([]);
	});
});

describe('the vocabulary is derived from the registry, not retyped', () => {
	/**
	 * THE REASON THE DERIVATION EXISTS: a card added to the launcher is sayable
	 * the day it ships, with no table entry anywhere. Asserted by finding an app
	 * with NO alias entry and checking its title still resolves.
	 */
	it('an app with no alias entry is still reachable by its title', () => {
		const destinations = voiceDestinations(ADMIN);
		const unaliased = PORTAL_APPS.filter((a) => !SPOKEN_ALIASES[a.id]);
		// A control on the sweep: if every app gained an alias, this assertion
		// would pass over an empty set and prove nothing, so say so.
		if (unaliased.length === 0) {
			// Synthesised check: every app's normalised title is in its own phrases.
			for (const app of PORTAL_APPS) {
				const d = destinations.find((x) => x.id === app.id);
				expect(d?.phrases).toContain(spokenKey(app.title));
			}
			return;
		}
		for (const app of unaliased) {
			const match = matchUtterance(app.title, destinations);
			expect(match.kind).toBe('go');
			if (match.kind === 'go') expect(match.destination.id).toBe(app.id);
		}
	});

	it('every destination href is one the registry actually carries', () => {
		const known = new Set(PORTAL_APPS.map((a) => a.href));
		const extras = new Set(EXTRA_DESTINATIONS.map((d) => d.href));
		for (const d of voiceDestinations(ADMIN)) {
			expect(known.has(d.href) || extras.has(d.href)).toBe(true);
		}
	});

	it('every alias key names an app that exists', () => {
		const ids = new Set(PORTAL_APPS.map((a) => a.id));
		expect(Object.keys(SPOKEN_ALIASES).filter((id) => !ids.has(id))).toEqual([]);
	});
});

describe('who may say what', () => {
	/**
	 * BOTH DIRECTIONS, WITH COUNTS, because an absence assertion cannot tell
	 * "the gate holds" from "the vocabulary came back empty".
	 */
	it('an admin surface is sayable by an admin and by nobody else', () => {
		const forAdmin = voiceDestinations(ADMIN);
		const forStudent = voiceDestinations(STUDENT);
		expect(forAdmin.filter((d) => d.id === 'coin-desk')).toHaveLength(1);
		expect(forAdmin.filter((d) => d.id === 'dashboard')).toHaveLength(1);
		expect(forStudent.filter((d) => d.id === 'coin-desk')).toHaveLength(0);
		expect(forStudent.filter((d) => d.id === 'dashboard')).toHaveLength(0);
		// Positive control: the student vocabulary is not simply empty.
		expect(forStudent.length).toBeGreaterThan(8);
		expect(matchUtterance('coin desk', forStudent).kind).toBe('none');
		expect(matchUtterance('coin desk', forAdmin).kind).toBe('go');
	});

	it('an auth-only surface is not sayable signed out, and a public one is', () => {
		const forVisitor = voiceDestinations(VISITOR);
		const ids = forVisitor.map((d) => d.id);
		// The four cards that deliberately omit requiresAuth, per the registry.
		expect(ids).toContain('maps');
		expect(ids).toContain('coins');
		expect(ids).toContain('vanguard');
		expect(ids).toContain('tournaments');
		expect(ids).not.toContain('classroom');
		expect(ids).not.toContain('notebook');
		expect(matchUtterance('my notebook', forVisitor).kind).toBe('none');
		expect(matchUtterance('vanguard', forVisitor).kind).toBe('go');
	});
});

describe('the actions', () => {
	it('resolve, and stop is among them', () => {
		const destinations = voiceDestinations(ADMIN);
		expect(matchUtterance('go back', destinations)).toMatchObject({ kind: 'act' });
		expect(matchUtterance('scroll to top', destinations)).toMatchObject({ kind: 'act' });
		const stop = matchUtterance('stop listening', destinations);
		expect(stop.kind).toBe('act');
		if (stop.kind === 'act') expect(stop.action.id).toBe('stop');
	});
});

describe('the sentence a person reads before the microphone is asked for', () => {
	/**
	 * PINNED BY MEANING, NOT BY BYTES. These four claims are the whole privacy
	 * story: off until pressed, not remembered, nothing recorded, nothing sent.
	 * A rewrite that drops one of them is the regression worth catching, and a
	 * byte-for-byte pin would redden on every comma.
	 */
	it('states all four claims', () => {
		const note = VOICE_PRIVACY_NOTE.toLowerCase();
		expect(note).toContain('off until you press');
		expect(note).toContain('reload');
		expect(note).toContain('never records audio');
		expect(note).toContain('never sends what you say anywhere');
	});
});
