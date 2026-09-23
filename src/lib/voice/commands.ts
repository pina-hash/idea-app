/**
 * VOICE NAVIGATION, AS A CLOSED VOCABULARY. Pure data + pure functions, no
 * Svelte, no DOM, no network -- the `curriculum.ts` / `portal-apps.ts` shape.
 *
 * THERE IS NO AI IN THIS FEATURE AND THERE IS NOTHING TO PAY FOR. The audio is
 * turned into text by the BROWSER'S OWN speech service, through the same
 * `SpeechRecognition` driver the report box already uses
 * (`$lib/feedback/dictation.ts`, whose header states the constraint: no audio
 * and no transcript goes through this repo, a Supabase function, or any
 * endpoint of ours). What this module adds is the half that was missing: a
 * fixed table of things a person can SAY and the route each one means. A
 * string comes in, a destination or a refusal comes out. It never calls
 * anything.
 *
 * EXACT MATCH, DELIBERATELY, AND THIS IS THE ONE DESIGN DECISION WORTH
 * DEFENDING. There is no fuzzy matching, no edit distance and no
 * closest-guess: an utterance either IS one of the phrases below, after
 * normalisation and after a leading verb is stripped, or it is not a command
 * at all. A near-miss that navigates is strictly worse than one that does
 * nothing -- it moves a student off the page they were on, in response to
 * something they did not say, and the only way back is a control they cannot
 * find because the page changed. So a miss reports what it HEARD and leaves
 * the phrase list on screen; twelve phrases that work beat a system that
 * half-understands.
 *
 * THE APP VOCABULARY IS DERIVED, NEVER RETYPED. Every entry in `PORTAL_APPS`
 * becomes sayable by its own title, normalised -- "IDEA // GAUNTLET" is
 * reachable as "idea gauntlet" with no table entry anywhere -- so a card added
 * to the launcher next month is sayable the day it ships. `SPOKEN_ALIASES`
 * only ever ADDS shorter or more natural forms beside that; it is not the
 * list, and a missing entry costs a convenience rather than a destination. A
 * third registry of routes is exactly what this avoids.
 */

import { PORTAL_APPS, type PortalApp } from '$lib/portal-apps';

/** One thing a person can go to, and every way they can ask for it. */
export interface VoiceDestination {
	/** Stable id: the app id for a launcher card, or a `nav:` id for the rest. */
	id: string;
	/** What the phrase list prints. */
	label: string;
	/** Where it goes. Any href the launcher can carry, legacy endpoints included. */
	href: string;
	/**
	 * Every accepted utterance for this destination, ALREADY NORMALISED. The
	 * FIRST one is what the phrase list shows as the thing to say; the rest are
	 * accepted silently, because a list of nine ways to say "notebook" teaches
	 * nobody anything.
	 */
	phrases: string[];
	/** Needs a session; withheld from a signed-out viewer's vocabulary. */
	requiresAuth?: boolean;
	/** Admin surface; withheld from everyone else's vocabulary. */
	adminOnly?: boolean;
}

/**
 * EXTRA SPOKEN FORMS, BY APP ID. Additive only: the app's own title is always
 * accepted whether or not it appears here, so a card with no entry is still
 * reachable. What belongs here is what somebody would actually SAY -- "my
 * classes" rather than "classroom", "cad" rather than "ideacad" -- plus the
 * forms a speech service tends to return for a name it does not know.
 *
 * An id that is not in `PORTAL_APPS` is ignored rather than raising: the
 * registry is the authority on what exists, and a stale key here is a dead
 * convenience, not a broken destination.
 */
export const SPOKEN_ALIASES: Record<string, string[]> = {
	classroom: ['classroom', 'my classes', 'classes', 'class'],
	notebook: ['notebook', 'my notebook', 'engineering notebook'],
	// A speech service routinely splits or joins the two halves of this name;
	// all four spellings are the same request.
	ideacad: ['ideacad', 'idea cad', 'cad', 'idea c a d'],
	maps: ['maps', 'map', 'idea maps', 'find a tool'],
	coins: ['coins', 'coin ledger', 'ledger', 'my balance', 'balance', 'leaderboard'],
	gauntlet: ['gauntlet'],
	// Said as a word and spelled out, because both come back from the service.
	frc: ['frc', 'f r c', 'frc training', 'robotics', 'first robotics'],
	greenline: ['greenline', 'green line'],
	vanguard: ['vanguard'],
	foundry: ['foundry', 'student apps'],
	tournaments: ['tournaments', 'tournament', 'brackets', 'bracket'],
	'coin-desk': ['coin desk', 'the desk'],
	dashboard: ['admin', 'dashboard', 'admin dashboard', 'the console']
};

/**
 * THE DESTINATIONS THAT ARE NOT LAUNCHER CARDS. Three, and each one earns its
 * place by being somewhere a person asks for out loud and cannot reach from
 * the grid: the portal front door, the student-facing update log, and the
 * course archive. Ids are `nav:`-prefixed so they can never collide with an
 * app id, which is what a stored pin and a usage count are keyed on.
 */
export const EXTRA_DESTINATIONS: VoiceDestination[] = [
	{
		id: 'nav:home',
		label: 'Home',
		href: '/',
		phrases: ['home', 'home page', 'the portal', 'portal']
	},
	{
		id: 'nav:updates',
		label: "What's new",
		href: '/classroom/updates',
		phrases: ['updates', 'whats new', 'what is new', 'classroom updates']
	},
	{
		id: 'nav:archive',
		label: 'Course archive',
		href: '/archive',
		phrases: ['archive', 'course archive', 'past courses']
	}
];

/** Things that are not a destination: they act on the page you are already on. */
export type VoiceActionId = 'back' | 'top' | 'bottom' | 'help' | 'stop';

export interface VoiceAction {
	id: VoiceActionId;
	label: string;
	/** Same rule as a destination: first phrase is the printed one. */
	phrases: string[];
}

/**
 * FIVE ACTIONS, AND "STOP" IS NOT OPTIONAL. A surface that is listening must
 * be able to be told to stop by the same means it was started, because the
 * person whose hands are busy is exactly the person this feature is for. The
 * visible Stop control is still the guarantee -- a spoken "stop" that is
 * misheard leaves the microphone open, so it is the convenience and the button
 * is the contract.
 */
export const VOICE_ACTIONS: VoiceAction[] = [
	{ id: 'back', label: 'Go back', phrases: ['back', 'go back', 'previous page'] },
	{ id: 'top', label: 'Top of page', phrases: ['top', 'scroll up', 'top of page', 'scroll to top'] },
	{
		id: 'bottom',
		label: 'Bottom of page',
		phrases: ['bottom', 'scroll down', 'bottom of page', 'scroll to bottom']
	},
	{ id: 'help', label: 'What can I say', phrases: ['help', 'what can i say', 'commands'] },
	{ id: 'stop', label: 'Stop listening', phrases: ['stop', 'stop listening', 'never mind', 'cancel'] }
];

/**
 * NORMALISATION, AND EVERY SIDE OF THE COMPARISON GOES THROUGH IT. A phrase in
 * a table and an utterance off a microphone are normalised by the same
 * function, so a table entry that a person could never match is impossible to
 * write: `spokenKey('IDEA // GAUNTLET')` is `'idea gauntlet'` whichever side it
 * is called from.
 *
 * Punctuation is dropped rather than mapped -- a speech service inserts commas
 * and full stops of its own accord and they carry no intent here -- and digits
 * are KEPT, because a course code said out loud ("idea one hundred") is a
 * phrase somebody will add later.
 */
export function spokenKey(raw: string): string {
	return raw
		.toLowerCase()
		.normalize('NFKD')
		// Strip combining marks so a service that returns an accent still matches.
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * LEADING VERBS, LONGEST FIRST, AND ONLY ONE IS STRIPPED. "Go to my notebook",
 * "open my notebook" and "my notebook" are one request; "go" on its own is
 * not, which is why a strip that would empty the string is refused below.
 *
 * Longest first matters: "go to" has to be tried before "go", or "go to maps"
 * becomes "to maps" and matches nothing.
 */
const LEADING_VERBS = [
	'take me to the',
	'take me to',
	'navigate to the',
	'navigate to',
	'show me the',
	'show me',
	'go to the',
	'go to',
	'open up',
	'open the',
	'launch the',
	'visit the',
	'jump to',
	'goto',
	'open',
	'launch',
	'visit',
	'show',
	'go'
];

/** Trailing courtesies a person says and a table should not have to carry. */
const TRAILING_FILLER = ['please', 'thanks', 'thank you'];

/**
 * The comparable form of one utterance: normalised, then with ONE leading verb
 * and ONE trailing courtesy removed. Returns the bare key, which is what both
 * the phrase index and the caller's "heard" readout are built from.
 *
 * A strip that would leave nothing behind is NOT applied: "go" stays "go", so
 * it can miss honestly rather than becoming the empty string and matching the
 * first phrase that happens to normalise to one.
 */
export function utteranceKey(raw: string): string {
	let key = spokenKey(raw);
	for (const filler of TRAILING_FILLER) {
		if (key === filler) break;
		if (key.endsWith(' ' + filler)) {
			key = key.slice(0, -(filler.length + 1)).trim();
			break;
		}
	}
	for (const verb of LEADING_VERBS) {
		if (key === verb) break;
		if (key.startsWith(verb + ' ')) {
			key = key.slice(verb.length + 1).trim();
			break;
		}
	}
	return key;
}

/** Who is asking, which decides what is in the vocabulary at all. */
export interface VoiceAudience {
	signedIn: boolean;
	isAdmin: boolean;
}

/**
 * THE VOCABULARY FOR THIS VIEWER, and the filtering is the honest half.
 *
 * An `adminOnly` surface answers 404 to everybody else and a `requiresAuth`
 * one bounces a signed-out visitor back to `/`, so putting either in a
 * signed-out student's phrase list would be printing a command that does not
 * work. The list a person is shown is the list that works, which is the whole
 * claim this feature rests on.
 *
 * `PORTAL_APPS` order is preserved, so the spoken list reads in the same order
 * as the curated grid, and the three extra destinations follow it.
 */
export function voiceDestinations(audience: VoiceAudience): VoiceDestination[] {
	const fromApps = PORTAL_APPS.filter(
		(app: PortalApp) =>
			(!app.adminOnly || audience.isAdmin) && (!app.requiresAuth || audience.signedIn)
	).map((app: PortalApp): VoiceDestination => {
		const alias = SPOKEN_ALIASES[app.id] ?? [];
		// The title is always accepted. It goes LAST so a curated alias is what
		// the phrase list prints -- "gauntlet" reads better than "idea gauntlet"
		// -- while an app with no alias entry still shows and matches its title.
		const phrases = dedupe([...alias.map(spokenKey), spokenKey(app.title)]);
		return {
			id: app.id,
			label: app.title,
			href: app.href,
			phrases,
			requiresAuth: app.requiresAuth,
			adminOnly: app.adminOnly
		};
	});
	return [...fromApps, ...EXTRA_DESTINATIONS.map((d) => ({ ...d, phrases: dedupe(d.phrases.map(spokenKey)) }))];
}

function dedupe(values: string[]): string[] {
	const out: string[] = [];
	for (const v of values) if (v && !out.includes(v)) out.push(v);
	return out;
}

/** What one utterance turned out to be. */
export type VoiceMatch =
	| { kind: 'go'; destination: VoiceDestination; heard: string }
	| { kind: 'act'; action: VoiceAction; heard: string }
	| { kind: 'none'; heard: string };

/**
 * MATCH ONE UTTERANCE. Destinations are tried before actions, and the whole
 * thing is exact: the key is either a phrase in the table or it is not.
 *
 * `heard` is the NORMALISED key rather than the raw transcript, and that is
 * deliberate -- it is rendered back to the person after a miss, and what helps
 * them is seeing the words the way the matcher saw them ("idea cad") rather
 * than the way the service punctuated them ("Idea, CAD."). It is never sent
 * anywhere; see the component.
 */
export function matchUtterance(raw: string, destinations: VoiceDestination[]): VoiceMatch {
	const heard = utteranceKey(raw);
	if (!heard) return { kind: 'none', heard };
	for (const destination of destinations) {
		if (destination.phrases.includes(heard)) return { kind: 'go', destination, heard };
	}
	for (const action of VOICE_ACTIONS) {
		if (action.phrases.map(spokenKey).includes(heard)) return { kind: 'act', action, heard };
	}
	return { kind: 'none', heard };
}

/**
 * THE SENTENCE AFTER A MISS, and it says three things in one line: that
 * nothing happened, what was heard, and where the list is. A refusal that does
 * not say what it heard is one a person cannot correct -- they will repeat the
 * word that already failed.
 */
export function missNote(heard: string): string {
	return heard
		? `Heard "${heard}", which is not a command. The list below is everything that works.`
		: 'Nothing was heard yet. The list below is everything that works.';
}

/**
 * WHAT THE PERSON IS TOLD BEFORE THE MICROPHONE IS EVER ASKED FOR, and it is
 * the reason this is a constant rather than three sentences typed into a
 * template: it is the claim the whole feature stands on, it has to be exactly
 * true, and it must be impossible for a second surface to state differently.
 */
export const VOICE_PRIVACY_NOTE =
	'Voice is off until you press Start, and a reload turns it off again. Your browser does the listening and turns speech into text on your device; the portal never records audio and never sends what you say anywhere. It stops on its own as soon as it understands one command.';

/** The one-line version, for the control itself. */
export const VOICE_SHORT_NOTE = 'Your browser listens; nothing is recorded or sent.';

/**
 * HOW LONG THE MICROPHONE MAY STAY OPEN WITH NOTHING UNDERSTOOD. A person who
 * presses Start and is called away leaves a live microphone behind, and the
 * service's own `no-speech` refusal does not cover a room that is simply
 * noisy. Twenty seconds is long enough to say a phrase, think, and say another
 * one; it is not long enough to forget about.
 *
 * A MATCH ALSO STOPS IT, which is the larger half of the bound: one
 * activation is one command. See `VoiceNav.svelte`.
 */
export const VOICE_IDLE_MS = 20_000;

/** The sentence shown when the idle cap closes a session nobody ended. */
export const VOICE_IDLE_NOTE = 'Stopped listening after 20 seconds with no command. Press Start to try again.';

/**
 * A BROWSER WITH NO `SpeechRecognition` GETS NO CONTROL AT ALL, which is the
 * rule `dictation.ts` already states for its own microphone button and the
 * reason this constant is here rather than a sentence in a component: absence
 * is the mechanism, so this text is only ever shown on a surface that has
 * DELIBERATELY asked what the answer was (the harness, and the phrase list's
 * own footnote), never as a disabled control.
 */
export const VOICE_UNSUPPORTED_NOTE =
	'This browser has no built-in speech recognition, so voice navigation is not offered here. Chrome and Edge on a computer, and Safari on an iPad with Dictation turned on, all have it.';
