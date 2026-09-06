// tests/classroom-song-queue-surface.test.ts
//
// 0145: THE CLIENT HALF OF THE SONG QUEUE, for the two things that would go
// wrong SILENTLY.
//
//   1. A REASON THE DATABASE CAN ANSWER WITH AND THE CLIENT HAS NO SENTENCE
//      FOR. `songOutcome` deliberately refuses to pass an unrecognised `reason`
//      through as a refusal -- a string with no sentence would otherwise reach a
//      student as a bare token -- so it falls to "Something went wrong. Try
//      again." That is the right fallback and the wrong OUTCOME: a student who
//      hit the cap would be told the software broke. Nothing on screen reports
//      it, `svelte-check` cannot see it, and the SQL suite is green throughout.
//      So the two vocabularies are compared against each other, from the
//      migration's own text.
//
//   2. THE SCOPE BOUNDARY. This feature is a request queue, not a player: links
//      only, no bytes, no upload, and nothing plays in the app. Those are one
//      `<audio>` element away from being untrue, and an `<audio>` added here
//      would render, work, and look like a feature.
//
// Everything else about this surface fails visibly the first time somebody
// looks, and is verified in the dev harness at /dev/song-queue instead.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
	songBlockedReason,
	songCanReject,
	songCanRequest,
	songLinkLabel,
	songPendingLabel,
	songPriceLabel,
	songRefusalMessage,
	songStatusLabel,
	songWaitingLabel,
	type SongQueueManagerState,
	type SongQueueStudentState,
	type SongRefusal
} from '../src/lib/classroom/song-queue';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');

const MIGRATION = read('supabase/migrations/0145_classroom_song_queue.sql');

/**
 * EVERY MIGRATION THAT EMITS A SONG REFUSAL, not just the one that started the
 * feature. 0188 added `not_spotify` by replacing `classroom_song_request`, so a
 * sweep reading 0145 alone would report the client inventing a reason the
 * database never answers with -- which is exactly backwards, and is what a list
 * pinned to one filename does the first time a rule moves.
 *
 * A FILE JOINS THIS ARRAY, IT DOES NOT REPLACE ANYTHING IN IT: 0145 still emits
 * every other reason, and a later file that replaces one of its functions does
 * not stop the earlier text being the record of what that function used to say.
 * The sweep is a UNION, and the count assertion below is what keeps it honest.
 */
const REFUSAL_SOURCES = [
	MIGRATION,
	read('supabase/migrations/0188_song_spotify_and_feedback_spam.sql')
];
const COMPONENT = read('src/lib/classroom/SongQueue.svelte');
const TRANSPORTS = read('src/lib/classroom/transports.ts');
const PURE = read('src/lib/classroom/song-queue.ts');

/**
 * THE "IS THIS WORD ABSENT" SWEEPS LOOK AT CODE, NOT AT PROSE, AND THAT IS NOT
 * A CONVENIENCE.
 *
 * These files DOCUMENT their own boundaries at length -- "there is no bucket",
 * "no `<audio>` element" -- so a raw substring sweep finds the sentence saying
 * the thing is absent and reports it as present. Both of those fired on the
 * first run of this file. Stripping comments first is what makes the assertion
 * mean what it says; each stripper is paired with a control below, because a
 * stripper that removed everything would make every absence assertion vacuous.
 */
function stripSqlComments(src: string): string {
	return src
		// `comment on ... is '...'` blocks are documentation too, and the table
		// comment is where the boundary is spelled out most fully.
		.replace(/comment on [\s\S]*?';/g, '')
		.split('\n')
		.map((line) => (line.trimStart().startsWith('--') ? '' : line))
		.join('\n');
}

function stripJsComments(src: string): string {
	return src
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => (line.trimStart().startsWith('//') ? '' : line))
		.join('\n');
}

const MIGRATION_CODE = stripSqlComments(MIGRATION);
const COMPONENT_CODE = stripJsComments(COMPONENT);
const PURE_CODE = stripJsComments(PURE);
const TRANSPORTS_CODE = stripJsComments(TRANSPORTS);

/** Every refusal the client has a sentence and a switch arm for. */
const CLIENT_REFUSALS: SongRefusal[] = [
	'not_a_student',
	'bad_url',
	'not_spotify',
	'url_too_long',
	'note_too_long',
	'pending_cap',
	'already_decided',
	'debt',
	'not_priced',
	'reason_required',
	'reason_too_long'
];

const student = (over: Partial<SongQueueStudentState> = {}): SongQueueStudentState => ({
	scope: 'student',
	section_id: 's',
	price: 2,
	pending_cap: 3,
	my_pending: 0,
	approved: [],
	mine: [],
	...over
});

describe('the refusal vocabulary matches the database', () => {
	/**
	 * READ OUT OF THE MIGRATION'S OWN TEXT, not retyped. A list typed here would
	 * characterize what somebody believed 0145 answers with, which is exactly the
	 * failure this test exists to catch.
	 */
	const emitted = [
		...new Set(
			REFUSAL_SOURCES.flatMap((sql) =>
				[...sql.matchAll(/'reason',\s*'([a-z_]+)'/g)].map((m) => m[1])
			)
		)
	].sort();

	test('the sweep found the reasons at all', () => {
		// A regex that matched nothing would make every assertion below vacuous.
		expect(emitted.length).toBeGreaterThanOrEqual(8);
		expect(emitted).toContain('pending_cap');
		expect(emitted).toContain('debt');
		// AND THAT THE SECOND SOURCE CONTRIBUTED. A union over two files whose
		// second one silently stopped matching reads exactly like a union over
		// one, so the reason only 0188 emits is named here on purpose.
		expect(emitted).toContain('not_spotify');
		expect(REFUSAL_SOURCES.length).toBe(2);
	});

	test('every reason 0145 emits has a sentence, and the client invents none', () => {
		expect([...CLIENT_REFUSALS].sort()).toEqual(emitted);
	});

	/**
	 * AND THE TRANSPORT'S OWN GUARD LIST IS THE SAME SET. `SONG_REFUSALS` is what
	 * decides whether a reason reaches `songRefusalMessage` at all, so a sentence
	 * that exists but is unreachable is the same defect one layer down.
	 */
	test('the transport passes exactly those reasons through', () => {
		const block = TRANSPORTS.slice(
			TRANSPORTS.indexOf('const SONG_REFUSALS'),
			TRANSPORTS.indexOf('function songDetail')
		);
		const guarded = [...new Set([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))].sort();
		expect(guarded).toEqual(emitted);
	});

	test('every sentence is real, distinct, and names no database object', () => {
		const sentences = CLIENT_REFUSALS.map((r) =>
			songRefusalMessage(r, { cap: 3, max: 300, student_name: 'Ana Reyes', balance: -5, price: 2 })
		);
		expect(new Set(sentences).size).toBe(CLIENT_REFUSALS.length);
		for (const s of sentences) {
			expect(s.length).toBeGreaterThan(10);
			for (const leak of [
				'classroom_song_requests',
				'classroom_song',
				'constraint',
				'duplicate key',
				'violates',
				'SQLSTATE',
				'null value'
			]) {
				expect(s).not.toContain(leak);
			}
		}
	});

	/**
	 * THE NUMBERS COME FROM THE PAYLOAD, NOT FROM THE FALLBACK. Dropping `cap`
	 * out of the lifted detail would leave the cap sentence reading "3" from its
	 * own default -- correct today and silently wrong the day the cap moves.
	 */
	test('the cap sentence states the cap it was handed', () => {
		expect(songRefusalMessage('pending_cap', { cap: 5 })).toContain('5 requests waiting');
		expect(songRefusalMessage('note_too_long', { max: 120 })).toContain('120');
	});

	/** THE DEBT SENTENCE IS FOR THE INSTRUCTOR AND NAMES THE STUDENT. */
	test('the debt sentence names the student and says the request is still waiting', () => {
		const s = songRefusalMessage('debt', { student_name: 'Ana Reyes', balance: -5, price: 2 });
		expect(s).toContain('Ana Reyes');
		expect(s).toContain('-5');
		expect(s).toContain('still waiting');
	});
});

describe('the scope boundary is visible in the source', () => {
	/**
	 * NOTHING PLAYS AND NOTHING IS UPLOADED. Both are one element away from being
	 * untrue, and both would render and appear to work.
	 */
	/**
	 * THE STRIPPERS' OWN CONTROL. An over-eager stripper returning an empty
	 * string would satisfy every absence assertion in this describe block, so
	 * what survives stripping is asserted first: real code, and demonstrably not
	 * the prose.
	 */
	test('stripping leaves the code and removes the prose', () => {
		expect(COMPONENT_CODE.length).toBeGreaterThan(2000);
		expect(MIGRATION_CODE.length).toBeGreaterThan(4000);
		expect(COMPONENT_CODE).toContain('<section class="sq-card"');
		expect(MIGRATION_CODE).toContain('create table if not exists public.classroom_song_requests');
		// And the sentences that name the forbidden words are gone.
		expect(COMPONENT_CODE).not.toContain('NOTHING PLAYS IN THIS COMPONENT');
		expect(MIGRATION_CODE).not.toContain('IT ACCEPTS NO BYTES');
	});

	test('the component has no player, no embed and no file input', () => {
		for (const forbidden of ['<audio', '<video', '<iframe', '<embed', 'type="file"', 'accept=']) {
			expect(COMPONENT_CODE).not.toContain(forbidden);
		}
		// POSITIVE CONTROL: the sweep is looking at real markup, so tags it
		// SHOULD find are found.
		expect(COMPONENT_CODE).toContain('<input');
		expect(COMPONENT_CODE).toContain('data-testid="song-queue"');
	});

	test('the migration mentions no bucket, no storage and no mime type', () => {
		for (const forbidden of ['storage.objects', 'storage_key', 'mime_type', 'bucket']) {
			expect(MIGRATION_CODE).not.toContain(forbidden);
		}
		// POSITIVE CONTROL: the table it DOES create is still in the stripped text.
		expect(MIGRATION_CODE).toContain('classroom_song_requests');
	});

	/**
	 * THIS TEST USED TO SAY "no service host appears in the migration or the
	 * client", full stop, and 0188 makes that sentence false ON PURPOSE: the
	 * school asked for Spotify only, so exactly one host family is now named.
	 *
	 * GENERALIZED RATHER THAN DELETED, because two of the three things it was
	 * protecting are untouched and are the ones that matter:
	 *
	 *   1. THE CLIENT STILL PARSES NOTHING. Naming Spotify in COPY -- a label, a
	 *      placeholder, the sentence a refusal renders -- is the surface telling
	 *      a student the rule before they go and find a link. Naming it in a
	 *      CONDITIONAL would be a second implementation of the rule, which is the
	 *      thing that stops agreeing with the database. So the sweep now asks
	 *      about the SHAPE of the mention, not whether there is one.
	 *   2. IT IS AN ALLOW, NOT A BLOCKLIST. Every other service stays unnamed
	 *      everywhere, which is what keeps this from becoming a maintenance
	 *      commitment against somebody else's URL formats -- the failure the
	 *      original sentence was really about.
	 *
	 * What is genuinely gone is only "the instructor is the filter for WHICH
	 * SERVICE", which was a policy the school has now decided differently. They
	 * are still the filter for which song.
	 */
	test('the client names Spotify only in copy, never in a condition', () => {
		const songTransportsCode = TRANSPORTS_CODE.slice(TRANSPORTS_CODE.indexOf('SONG_REFUSALS'));
		expect(songTransportsCode.length).toBeGreaterThan(500);
		const clientSources = [PURE_CODE, COMPONENT_CODE, songTransportsCode];

		// POSITIVE CONTROL FIRST: the surface really does say the rule out loud,
		// so the shape assertions below are running over text that mentions it.
		expect(COMPONENT_CODE.toLowerCase()).toContain('spotify');
		expect(PURE_CODE.toLowerCase()).toContain('spotify');

		for (const src of clientSources) {
			// No host comparison, no host regex, no membership test. These are the
			// four spellings a mirrored rule would actually be written in.
			expect(src).not.toMatch(/\.(host|hostname|origin)\s*(===|==|!==|!=)/);
			expect(src).not.toMatch(/\/\^?https?:\\?\/\\?\//);
			expect(src).not.toMatch(/\bincludes\(\s*['"`][^'"`]*spotify/i);
			expect(src).not.toMatch(/\b(startsWith|endsWith|test|match)\(\s*['"`/][^'"`]*spotify/i);
		}
	});

	/**
	 * AND IT IS AN ALLOW OF ONE, NOT A BLOCKLIST OF MANY. A refusal that had to
	 * name every service it turns away is a list somebody has to keep current
	 * forever, and the first one nobody adds is a link that gets through.
	 */
	test('no other service is named anywhere in the feature', () => {
		const songTransportsCode = TRANSPORTS_CODE.slice(TRANSPORTS_CODE.indexOf('SONG_REFUSALS'));
		const sources = [MIGRATION_CODE, PURE_CODE, COMPONENT_CODE, songTransportsCode];
		for (const src of sources) {
			for (const host of ['youtube', 'youtu.be', 'soundcloud', 'apple.com/music', 'tidal', 'bandcamp']) {
				expect(src.toLowerCase()).not.toContain(host);
			}
		}
		// POSITIVE CONTROL: 0145's own text is still what is being read, and it
		// still names no host of any kind -- the Spotify rule is 0188's, and
		// putting it in the older file would be editing an applied record.
		expect(MIGRATION_CODE.toLowerCase()).not.toContain('spotify.com');
	});

	/**
	 * THERE IS NO SECOND URL RULE. `_classroom_song_url_ok` is the one
	 * implementation; a mirror in the client is a copy that can stop agreeing,
	 * and the whole point of `songLinkLabel` is that it is PRESENTATION.
	 */
	test('the client validates no url and songLinkLabel is display only', () => {
		expect(PURE_CODE).not.toContain('^https://');
		// It shortens for display and falls back rather than refusing.
		expect(songLinkLabel('https://example.com/watch?v=abc&list=x')).toBe('example.com');
		expect(songLinkLabel('not a url')).toBe('not a url');
	});
});

describe('the student type cannot name a classmate', () => {
	/**
	 * A PROPERTY OF THE TYPE, NOT OF A FILTER. `SongApprovedRow` has no
	 * `student_name` and no `student_email`, so the component's student branch
	 * has no expression that could produce one -- which is why there is nothing
	 * in the component to hide.
	 */
	test('SongApprovedRow declares mine and no identity at all', () => {
		const block = PURE.slice(
			PURE.indexOf('export interface SongApprovedRow'),
			PURE.indexOf('export interface SongMineRow')
		);
		expect(block).toContain('mine: boolean');
		expect(block).not.toContain('student_name');
		expect(block).not.toContain('student_email');
		// POSITIVE CONTROL: the MANAGER row type does carry both, so the absence
		// above is the projection rather than the sweep reading the wrong block.
		const mgr = PURE.slice(
			PURE.indexOf('export interface SongQueuePendingRow'),
			PURE.indexOf('export interface SongQueueDecidedRow')
		);
		expect(mgr).toContain('student_name: string');
		expect(mgr).toContain('student_email: string');
	});

	/**
	 * AND THE COMPONENT TAKES NO ROLE FLAG. The role comes from the payload's own
	 * `scope`, because the payload is what the database decided; a `canManage`
	 * prop beside it would be a second opinion about who the viewer is.
	 */
	test('the component has no canManage prop', () => {
		const props = COMPONENT.slice(COMPONENT.indexOf('let {'), COMPONENT.indexOf('} = $props()'));
		expect(props.length).toBeGreaterThan(100);
		expect(props).not.toContain('canManage');
		expect(props).toContain('transports?: SongQueueTransports | null');
	});
});

describe('the predicates that drive the controls', () => {
	test('an instructor is never offered the request form', () => {
		const manager: SongQueueManagerState = {
			scope: 'manager',
			section_id: 's',
			price: 2,
			pending_cap: 3,
			pending: [],
			decided: []
		};
		expect(songCanRequest(manager)).toBe(false);
		expect(songBlockedReason(manager)).toBeNull();
		expect(songCanRequest(null)).toBe(false);
	});

	test('the cap closes the control and the control then says why', () => {
		expect(songCanRequest(student({ my_pending: 2 }))).toBe(true);
		expect(songBlockedReason(student({ my_pending: 2 }))).toBeNull();
		expect(songCanRequest(student({ my_pending: 3 }))).toBe(false);
		expect(songBlockedReason(student({ my_pending: 3 }))).toContain('3 requests waiting');
		// The cap is READ FROM THE PAYLOAD, so a database that moves it moves both.
		expect(songBlockedReason(student({ my_pending: 5, pending_cap: 5 }))).toContain(
			'5 requests waiting'
		);
	});

	/**
	 * WHITESPACE IS JUDGED THE WAY 0145 JUDGES IT. The database normalizes with
	 * a regexp rather than `btrim` precisely because `btrim` strips SPACES ONLY
	 * and would accept a reason of newlines and tabs; JavaScript's `trim()`
	 * strips the same set, so these two agree on every value.
	 */
	test('a blank reason cannot be sent, tabs and newlines included', () => {
		for (const blank of ['', ' ', '\n', '\t', '  \n\t  ']) expect(songCanReject(blank)).toBe(false);
		expect(songCanReject('Not appropriate.')).toBe(true);
		expect(songCanReject('x'.repeat(500))).toBe(true);
		expect(songCanReject('x'.repeat(501))).toBe(false);
	});

	test('the count and the price are said before anybody presses', () => {
		expect(songPendingLabel(student({ my_pending: 2 }))).toBe('2 of 3 waiting');
		expect(songPriceLabel(2)).toBe('2i¢ on approval');
		// A retired category, which 0145 refuses approvals on -- said rather than
		// rendered as a price of nothing.
		expect(songPriceLabel(null)).toBe('No price set');
	});

	test('every status has a word, because colour is never the only signal', () => {
		const words = (['pending', 'approved', 'rejected'] as const).map(songStatusLabel);
		expect(new Set(words).size).toBe(3);
		for (const w of words) expect(w.length).toBeGreaterThan(3);
	});

	/** NO CLOCK IS READ: `now` is a parameter, so this is pinned. */
	test('the waiting label is measured against the instant it is handed', () => {
		const now = Date.parse('2026-08-28T17:42:00Z');
		const at = (mins: number) => new Date(now - mins * 60_000).toISOString();
		expect(songWaitingLabel(at(0), now)).toBe('just now');
		// FLOORED, never rounded: 3m31s must not read as 4 min.
		expect(songWaitingLabel(new Date(now - 211_000).toISOString(), now)).toBe('3 min');
		expect(songWaitingLabel(at(59), now)).toBe('59 min');
		expect(songWaitingLabel(at(60), now)).toBe('1 hr');
		expect(songWaitingLabel(at(72), now)).toBe('1 hr 12 min');
		// A clock skew that puts the stamp in the future never goes negative.
		expect(songWaitingLabel(at(-5), now)).toBe('just now');
	});
});
