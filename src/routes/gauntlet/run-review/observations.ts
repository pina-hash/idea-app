/**
 * THE WORDS THIS SURFACE USES, STATED ONCE.
 *
 * `gauntlet_run_review` (0152) returns facts: a telemetry state and a list of
 * observation codes. It deliberately returns no prose, because a sentence in a
 * jsonb payload is a sentence nobody can review in a diff. This module is the
 * other half -- the one place a code becomes something a teacher reads.
 *
 * THE RULE FOR EVERY SENTENCE BELOW: say what was seen, and say what ordinarily
 * causes it. Never say what it means about the person. There is no word in this
 * file for dishonesty and there must not be one -- the surface's whole job is to
 * put a run in front of a teacher, and a teacher who is handed a verdict is not
 * being asked to decide anything. `tests/gauntlet-run-review.test.ts` sweeps
 * both this file's copy and the migration's own source for that vocabulary.
 *
 * AND EVERY CODE THE DATABASE CAN EMIT MUST HAVE AN ENTRY HERE. A code with no
 * entry renders as a bare identifier next to a student's name, which is the
 * worst of both worlds: unexplained and official-looking. The same test asserts
 * the two vocabularies match exactly, in both directions, so adding an
 * observation to 0152 without a sentence here reddens rather than ships.
 */

/** An observation code as `gauntlet_run_review` spells it. */
export type ObservationCode =
	| 'fast_finish'
	| 'submit_volume_unseen'
	| 'clock_exceeds_run'
	| 'events_before_start'
	| 'events_after_submit'
	| 'telemetry_absent';

/** A telemetry state as `gauntlet_run_review` spells it. */
export type TelemetryState = 'present' | 'absent' | 'room' | 'unlinked';

export interface Explained {
	/** A few words, for the chip. */
	label: string;
	/** What was seen, and what ordinarily causes it. One or two sentences. */
	meaning: string;
}

export const OBSERVATIONS: Record<ObservationCode, Explained> = {
	fast_finish: {
		label: 'Finished quickly',
		meaning:
			'The server clock ran for less than the time floor set above. That floor is a setting on this page, not a rule about the part. It also reads this way when someone modelled the part before pressing Start, which the clock cannot tell apart from working fast.'
	},
	submit_volume_unseen: {
		label: 'Trail does not show this part',
		meaning:
			'Progress was recorded for this run, this was the first submit on it, and none of the recorded snapshots matches the volume that was handed in. A run can read this way if the last edit landed inside the add-in’s two second refresh and the submit came before the next tick.'
	},
	clock_exceeds_run: {
		label: 'Add-in clock longer than the run',
		meaning:
			'The add-in’s own stopwatch reports more elapsed time than the server clock allowed. The stopwatch starts after the run does, so it is normally the shorter of the two.'
	},
	events_before_start: {
		label: 'Progress recorded before the run',
		meaning:
			'Some of the recorded progress reached the server before this run started. The arrival time is stamped by the server when it is received.'
	},
	events_after_submit: {
		label: 'Progress recorded after the submit',
		meaning:
			'Some of the recorded progress reached the server well after this run was submitted. The add-in sends a final batch as the run is submitted, so a short delay is normal and is already allowed for.'
	},
	telemetry_absent: {
		label: 'No progress recorded',
		meaning:
			'Nothing was recorded for this run. This is what the VBA macros always look like, because they record nothing at all, and it is also what an add-in run looks like when its last batch did not reach the server. You asked for these to be listed with the switch above.'
	}
};

export const TELEMETRY: Record<TelemetryState, Explained> = {
	present: {
		label: 'Progress recorded',
		meaning: 'The add-in sent a record of how this part was built.'
	},
	absent: {
		label: 'None recorded',
		meaning:
			'Expected on the VBA macro path, which records nothing at all and is still offered on the tools page. Also what an add-in run looks like when its final batch did not arrive. Nothing in the submitted run says which of the two this was.'
	},
	room: {
		label: 'Not possible (room run)',
		meaning:
			'This was raced in a live room. Room racers do not run the Start macro, so there is no run id to record progress against and there never could be one.'
	},
	unlinked: {
		label: 'Cannot be matched',
		meaning:
			'This run carries no run id, so no record can be matched to it. Every ranked run from before run ids were added is like this. It says nothing about how the run was done.'
	}
};

/** True for a code this surface knows how to explain. */
export function isObservationCode(code: string): code is ObservationCode {
	return Object.prototype.hasOwnProperty.call(OBSERVATIONS, code);
}

/** True for a state this surface knows how to explain. */
export function isTelemetryState(state: string): state is TelemetryState {
	return Object.prototype.hasOwnProperty.call(TELEMETRY, state);
}

/**
 * Elapsed, in the shape a teacher compares against a par time. Sub-minute runs
 * keep their milliseconds, because the whole reason this surface exists is that
 * some of them are measured in single digits and "0s" would hide that.
 */
export function formatElapsed(ms: number | null): string {
	if (ms === null || !Number.isFinite(ms)) return '--';
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** A volume, at the precision the ranked comparison actually uses. */
export function formatVolume(mm3: number | null): string {
	if (mm3 === null || !Number.isFinite(mm3)) return '--';
	return `${mm3.toLocaleString('en-US', { maximumFractionDigits: 3 })} mm³`;
}
