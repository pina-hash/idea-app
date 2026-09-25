/**
 * VOICE, AS THE COMMAND PALETTE'S SECOND KEYBOARD. Pure functions, no Svelte,
 * no DOM, no network -- the `curriculum.ts` / `portal-apps.ts` shape.
 *
 * WHAT CHANGED, AND WHY (ledger 0298, report 31). Voice used to be its own
 * floating control with its own vocabulary: the launcher's apps plus three
 * pages, typed into a table here, so no class, no item, no tab and no action
 * could be spoken, and it waited for the browser's FINAL result before doing
 * anything. Mr. Pina: "the time it takes me to speak and navigate somewhere is
 * greater than just clicking". It is now a microphone INSIDE the command
 * palette (`$lib/shell/CommandPalette.svelte`), and what can be said is exactly
 * what the palette lists -- the class's items and units, the viewer's classes
 * and check-ins, every registered action this viewer may run here
 * (`commandsFor(env)` in `$lib/shell/commands.ts`, through `runnableCommands`),
 * and a manager's roster. There is no second vocabulary to keep in step: a
 * command registered next month is sayable the day it ships.
 *
 * THERE IS NO AI IN THIS FEATURE AND THERE IS NOTHING TO PAY FOR. The audio is
 * turned into text by the BROWSER'S OWN speech service, through the same
 * `SpeechRecognition` driver the report box uses (`$lib/feedback/dictation.ts`,
 * whose header states the constraint: no audio and no transcript goes through
 * this repo, a Supabase function, or any endpoint of ours). What this module
 * adds is the matcher. A string comes in, one palette row or a refusal comes
 * out. It never calls anything.
 *
 * EXACT MATCH, DELIBERATELY, AND THIS IS STILL THE ONE DESIGN DECISION WORTH
 * DEFENDING. An utterance acts only when it IS the name of exactly one row,
 * after normalisation and after a leading verb is stripped. There is no edit
 * distance and no closest guess: a near-miss that navigates moves somebody off
 * the page they were on in response to something they did not say. What is
 * new is what a miss does: the words stay in the palette's search box, where
 * the palette's own ranked search (typo-tolerant, which is right for a list a
 * person then CHOOSES from) shows what came closest, one press away. Two rows
 * with the same spoken name is not a match either: the list shows both and the
 * person picks.
 */

/** One row the palette could open, as the matcher sees it: a stable key and the name it shows. */
export interface SpeakableEntry {
	key: string;
	name: string;
}

/**
 * NORMALISATION, AND EVERY SIDE OF THE COMPARISON GOES THROUGH IT. A row's
 * name and an utterance off a microphone are normalised by the same function,
 * so a name a person could never match is impossible to have.
 *
 * Punctuation is dropped rather than mapped -- a speech service inserts commas
 * and full stops of its own accord and they carry no intent here -- and digits
 * are KEPT, because a course code or a unit number is said out loud.
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
 * LEADING VERBS, LONGEST FIRST, AND ONLY ONE IS STRIPPED. "Go to grades",
 * "open grades" and "grades" are one request; "go" on its own is not, which is
 * why a strip that would empty the string is refused below. Longest first
 * matters: "go to" has to be tried before "go", or "go to grades" becomes "to
 * grades" and matches nothing.
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

/** Trailing courtesies a person says and a name should not have to carry. */
const TRAILING_FILLER = ['please', 'thanks', 'thank you'];

/**
 * The comparable form of one utterance: normalised, then with ONE leading verb
 * and ONE trailing courtesy removed. A strip that would leave nothing behind is
 * NOT applied: "go" stays "go", so it misses honestly rather than becoming the
 * empty string.
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

/**
 * EVERY WAY ONE STRING CAN BE SAID: its plain key and its key with a leading
 * verb stripped. Applied to BOTH sides, so a row named "Open to-do" answers to
 * "open to do" and to "to do", and "open grades" reaches a row named "Grades".
 */
export function spokenForms(raw: string): string[] {
	const plain = spokenKey(raw);
	const stripped = utteranceKey(raw);
	return plain === stripped ? (plain ? [plain] : []) : [plain, stripped].filter(Boolean);
}

/**
 * WHAT STOPS THE MICROPHONE BY VOICE. The visible Stop control is the
 * guarantee -- a misheard "stop" leaves the microphone open -- and this is the
 * convenience for somebody whose hands are busy. Checked BEFORE the rows, so no
 * item that happens to be titled "Cancel" can swallow it.
 */
export const VOICE_STOP_PHRASES = ['stop', 'stop listening', 'never mind', 'cancel'] as const;

/** What one utterance turned out to be. `heard` is the normalised form, for the note. */
export type VoiceMatch<E extends SpeakableEntry = SpeakableEntry> =
	| { kind: 'stop'; heard: string }
	| { kind: 'one'; entry: E; heard: string }
	| { kind: 'many'; entries: E[]; heard: string }
	| { kind: 'none'; heard: string };

/**
 * THE ONE MATCHER. Exact over every spoken form of the utterance against every
 * spoken form of every row's name; one row is a match, two or more is a list to
 * choose from, none is a search. Rows are de-duplicated by key, so an entry the
 * palette lists once is counted once however many of its forms matched.
 */
export function matchSpoken<E extends SpeakableEntry>(raw: string, entries: readonly E[]): VoiceMatch<E> {
	const forms = spokenForms(raw);
	const heard = utteranceKey(raw);
	if (!forms.length) return { kind: 'none', heard };
	if (forms.some((f) => (VOICE_STOP_PHRASES as readonly string[]).includes(f))) return { kind: 'stop', heard };
	const found = new Map<string, E>();
	for (const entry of entries) {
		if (found.has(entry.key)) continue;
		const names = spokenForms(entry.name);
		if (names.some((n) => forms.includes(n))) found.set(entry.key, entry);
	}
	const hits = [...found.values()];
	if (hits.length === 1) return { kind: 'one', entry: hits[0], heard };
	if (hits.length > 1) return { kind: 'many', entries: hits, heard };
	return { kind: 'none', heard };
}

/**
 * HOW LONG AN INTERIM RESULT MUST HOLD STILL BEFORE IT IS ACTED ON. A final
 * result is acted on at once; an interim one only once the service has stopped
 * changing its mind about it for this long, which is what makes a short command
 * land before the service decides the sentence is over (often most of a second
 * later) without a half-said phrase navigating. About 300ms is the brief's
 * figure (ROUND1_BRIEF item 16).
 */
export const VOICE_INTERIM_STABLE_MS = 300;

/**
 * HOW LONG THE MICROPHONE MAY STAY OPEN WITH NOTHING UNDERSTOOD. A person who
 * presses the microphone and is called away leaves a live microphone behind,
 * and the service's own `no-speech` refusal does not cover a room that is
 * simply noisy. A MATCH ALSO STOPS IT, which is the larger half of the bound:
 * one activation is one command.
 */
export const VOICE_IDLE_MS = 20_000;

/** The sentence shown when the idle cap closes a session nobody ended. */
export const VOICE_IDLE_NOTE = 'Stopped listening after 20 seconds with no command. Press Speak to try again.';

/**
 * THE SENTENCE AFTER AN UTTERANCE THAT DID NOT ACT, and it says what was heard
 * and where to look, because a refusal that does not say what it heard is one
 * a person cannot correct.
 */
export function voiceMissNote(match: VoiceMatch): string {
	if (match.kind === 'many') {
		return `Heard "${match.heard}", which names ${match.entries.length} things. Pick one from the list, or say more of its name.`;
	}
	if (match.kind === 'none') {
		return match.heard
			? `Heard "${match.heard}". Nothing is named exactly that, so the closest matches are listed. Pick one, or say a name from the list.`
			: 'Nothing was heard yet. Say the name of anything in the list.';
	}
	return '';
}

/**
 * WHAT A PERSON IS TOLD BEFORE THE MICROPHONE IS EVER ASKED FOR, and it is a
 * constant rather than words in a template because it is the claim the whole
 * feature stands on and must be impossible for a second surface to state
 * differently.
 */
export const VOICE_PRIVACY_NOTE =
	'The microphone is off until you press Speak, and closing search turns it off again. Your browser turns speech into text; the portal never records audio and never sends what you say anywhere. It stops on its own as soon as it understands one command.';

/** The one-line version, shown while listening. */
export const VOICE_SHORT_NOTE = 'Your browser listens; nothing is recorded or sent.';
