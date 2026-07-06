/**
 * FRC Training track registry: domains, units, ranks, and the reference shelf.
 * PLAIN DATA + pure helpers (client-safe, like curriculum.ts / gauntlet.ts).
 *
 * The registry owns the STRUCTURE and the RULES: each unit's stable id and
 * prerequisite (the unlock chain), and the rank ladder thresholds. The
 * per-user completion set lives in the `frc_user_progress` table
 * (0039_frc_user_progress.sql, loaded in src/lib/frc/progression.ts); the pure
 * `unitState()` and `rankForCount()` here turn that set into UI state, so the
 * unlock + rank logic stays in ONE place and is easy to tune. The track is open
 * to every signed-in student (route guard in hooks.server.ts); pathway is
 * identity, never a gate, and nothing here may be used to wall off content.
 */

export const FRC_TEAM = {
	number: '5669',
	name: 'Team 5669',
	org: 'Bosco Tech Robotics'
} as const;

export type UnitState = 'locked' | 'available' | 'complete';

export interface FrcUnit {
	/** 1-based unit number within its domain (display + ordering). */
	n: number;
	/** Stable id used as the progression key, e.g. "MDM-1". */
	id: string;
	title: string;
	/**
	 * Id of the unit that must be complete before this one unlocks, or null for
	 * the first unit (which starts available). The unlock chain lives here in the
	 * registry, not in per-user data.
	 */
	prerequisite: string | null;
}

export interface FrcDomain {
	/** URL slug under /frc/. */
	id: string;
	title: string;
	blurb: string;
	/** Ordered units; empty = domain renders the "content in development" placeholder. */
	units: FrcUnit[];
	/**
	 * Which authored content set backs this domain's units, if any: 'mdm' for
	 * the CAD/Mechanical units (mdm-content.ts) and 'foundation' for the
	 * Foundation units (foundation-content.ts), each resolving to real
	 * per-unit pages; units with no matching content in their domain's set
	 * render as in-development placeholders. Absent = no unit pages yet (whole
	 * domain is the placeholder block).
	 */
	contentSet?: 'mdm' | 'foundation';
}

const FOUNDATION_UNIT_TITLES = [
	'Welcome to FRC',
	'How a Season Runs',
	'Safety in the Shop',
	'The Engineering Design Process',
	'The Engineering Notebook'
];

const CAD_UNIT_TITLES = [
	'Mechanical Design Process',
	'Reading Technical Drawings',
	'FRC Hardware Vocabulary',
	'Sketching and the First Solid',
	'Building Real Parts',
	'Assemblies, Mates, and Modifying Existing CAD',
	'COTS Integration',
	'Shafts, Bearings, and Stackups',
	'Fasteners and Joints in CAD',
	'Tolerancing and GD&T Basics',
	'Manufacturing Fundamentals',
	'Design for Manufacturing',
	'3D Printing for FRC',
	'Machining Basics',
	'Fabrication and Detailing Drawings',
	'Capstone: Design, Make, and Document a Real Part'
];

export const FRC_DOMAINS: FrcDomain[] = [
	{
		id: 'foundation',
		title: 'Foundation',
		blurb: 'What FRC is, how a season runs, and the habits of a useful team member.',
		// Sequential unlock chain, same convention as CAD: F1 starts available (no
		// prerequisite); F2-F5 have no authored content yet, so they render as
		// in-development placeholders on the domain page regardless of this state.
		units: FOUNDATION_UNIT_TITLES.map((title, i) => {
			const n = i + 1;
			return { n, id: `F${n}`, title, prerequisite: n === 1 ? null : `F${n - 1}` };
		}),
		contentSet: 'foundation'
	},
	{
		id: 'cad-mechanical',
		title: 'CAD and Mechanical Design',
		blurb: 'From your first sketch to real, manufacturable robot parts.',
		// Sequential unlock chain: MDM-1 starts available (no prerequisite), each
		// later unit unlocks when the one before it is complete.
		units: CAD_UNIT_TITLES.map((title, i) => {
			const n = i + 1;
			return { n, id: `MDM-${n}`, title, prerequisite: n === 1 ? null : `MDM-${n - 1}` };
		}),
		contentSet: 'mdm'
	},
	{
		id: 'mechanisms-prototyping',
		title: 'Mechanisms and Prototyping',
		blurb: 'Drivetrains, arms, elevators, intakes, and fast iteration on real hardware.',
		units: []
	},
	{
		id: 'programming-controls',
		title: 'Programming and Controls',
		blurb: 'WPILib, sensors, control loops, and autonomous routines.',
		units: []
	},
	{
		id: 'strategy-scouting',
		title: 'Strategy and Scouting',
		blurb: 'Game analysis, match strategy, and scouting systems built on data.',
		units: []
	},
	{
		id: 'drive-team',
		title: 'Drive Team',
		blurb: 'Driving, operating, human player, and coaching under match pressure.',
		units: []
	},
	{
		id: 'capstone',
		title: 'Capstone',
		blurb: 'Put it all together with a real contribution to a full build season.',
		units: []
	}
];

export function domainById(id: string | null | undefined): FrcDomain | undefined {
	if (!id) return undefined;
	return FRC_DOMAINS.find((d) => d.id === id);
}

/**
 * Real per-user unit state, given the set of completed unit ids:
 *   complete  - this unit's own completion is recorded.
 *   available - its prerequisite is complete (or it has none), not yet complete.
 *   locked    - its prerequisite is not complete yet.
 * DISPLAY / ORDERING ONLY. No unit is ever read-locked: a student may open and
 * read any unit's Brief, Drill, Gate, and Apply regardless of prerequisite
 * completion (the prerequisite chain is a SUGGESTED order, never a block on
 * reading; see DomainLanding, which links every content-backed unit
 * regardless of this state). Gates still record real completion for rank.
 * Pure over the completed set; the set is loaded from `frc_user_progress`
 * (see progression.ts).
 */
export function unitState(unit: FrcUnit, completed: ReadonlySet<string>): UnitState {
	if (completed.has(unit.id)) return 'complete';
	if (unit.prerequisite === null || completed.has(unit.prerequisite)) return 'available';
	return 'locked';
}

// ---------------------------------------------------------------------------
// Teacher "view as student" context (FrcShell sets it, DomainLanding /
// per-page loads consume it): lets a teacher preview the track exactly as a
// student would, with the working gate and no teacher-override controls.
// ---------------------------------------------------------------------------

export const FRC_VIEW_CONTEXT_KEY = 'frc-view';

export interface FrcViewContext {
	readonly isTeacher: boolean;
	readonly viewAsStudent: boolean;
	/** True only for a teacher NOT currently previewing as a student. */
	readonly showOverride: boolean;
}

// ---------------------------------------------------------------------------
// Rank ladder: a student's rank is computed from the number of completed
// CAD-track units. Thresholds live here in the registry so they are easy to
// tune, and the rank logic stays in this one place.
// ---------------------------------------------------------------------------

export interface FrcRank {
	name: string;
	/** This rank applies once completed CAD units reach this count. */
	minComplete: number;
}

/** Ascending by threshold; the highest rank whose threshold is met wins. */
export const FRC_RANKS: FrcRank[] = [
	{ name: 'Rookie', minComplete: 0 },
	{ name: 'Technician', minComplete: 3 },
	{ name: 'Builder', minComplete: 6 },
	{ name: 'Engineer', minComplete: 10 }
];

/** The rank for a given completed-unit count (highest threshold reached). */
export function rankForCount(count: number): FrcRank {
	let rank = FRC_RANKS[0];
	for (const r of FRC_RANKS) if (count >= r.minComplete) rank = r;
	return rank;
}

/** The next rank above the given count, or null if already at the top. */
export function nextRank(count: number): FrcRank | null {
	return FRC_RANKS.find((r) => r.minComplete > count) ?? null;
}

/** Count of completed units that belong to the CAD and Mechanical Design domain. */
export function completedCadCount(completed: ReadonlySet<string>): number {
	const cad = domainById('cad-mechanical');
	if (!cad) return 0;
	return cad.units.reduce((acc, u) => acc + (completed.has(u.id) ? 1 : 0), 0);
}

/** A student's rank, computed from their completed CAD-track units. */
export function frcRank(completed: ReadonlySet<string>): FrcRank {
	return rankForCount(completedCadCount(completed));
}

// ---------------------------------------------------------------------------
// Knowledge-gate quiz: the escalating cooldown after a failed attempt. The
// schedule lives here so it is tunable in one place; the server enforces it
// (src/lib/server/frc/quiz-engine.ts + the unit quiz endpoint). A pass clears
// the fail streak.
// ---------------------------------------------------------------------------

/**
 * Cooldown seconds indexed by consecutive-fail count: the 1st fail waits
 * FRC_QUIZ_COOLDOWNS_SEC[0], the 2nd the next, and so on, clamping to the last
 * entry for further fails (so it grows then plateaus).
 */
export const FRC_QUIZ_COOLDOWNS_SEC = [60, 300, 900, 3600];

/** Cooldown (seconds) required after reaching `failStreak` consecutive fails. */
export function cooldownSecondsForFailStreak(failStreak: number): number {
	if (failStreak <= 0) return 0;
	const i = Math.min(failStreak, FRC_QUIZ_COOLDOWNS_SEC.length) - 1;
	return FRC_QUIZ_COOLDOWNS_SEC[i];
}

// ---------------------------------------------------------------------------
// Reference shelf: cross-cutting external references, grouped.
// ---------------------------------------------------------------------------

export interface FrcReference {
	title: string;
	url: string;
	note: string;
}

export interface FrcReferenceGroup {
	label: string;
	refs: FrcReference[];
}

export const FRC_REFERENCES: FrcReferenceGroup[] = [
	{
		label: 'General design',
		refs: [
			{
				title: 'NASA RAP Robotics Design Guide',
				url: 'https://robotics.nasa.gov/',
				note: 'The NASA Robotics Alliance Project design guide and mentoring resources.'
			}
		]
	},
	{
		label: 'Software and electrical',
		refs: [
			{
				title: 'WPILib frc-docs',
				url: 'https://docs.wpilib.org/',
				note: 'The official FRC control system documentation: programming, wiring, and controls.'
			}
		]
	},
	{
		label: 'Strategy',
		refs: [
			{
				title: 'Effective FIRST Strategies (Simbotics)',
				url: 'https://www.simbotics.org/resources',
				note: 'The classic Simbotics seminar on match strategy and robot design priorities.'
			}
		]
	},
	{
		label: 'Drivetrains',
		refs: [
			{
				title: 'Simbotics drivetrain resources',
				url: 'https://www.simbotics.org/resources',
				note: 'Simbotics drivetrain design seminars and reference material.'
			}
		]
	},
	{
		label: 'Scouting and data',
		refs: [
			{
				title: 'The Blue Alliance',
				url: 'https://www.thebluealliance.com/',
				note: 'Match results, team records, and event data for every FRC team.'
			},
			{
				title: 'Statbotics',
				url: 'https://www.statbotics.io/',
				note: 'EPA-based team performance statistics and match predictions.'
			},
			{
				title: 'Citrus Circuits scouting',
				url: 'https://www.citruscircuits.org/scouting.html',
				note: 'Team 1678 scouting whitepapers and systems, a model scouting program.'
			}
		]
	},
	{
		label: 'Vendor docs',
		refs: [
			{
				title: 'REV Robotics documentation',
				url: 'https://docs.revrobotics.com/',
				note: 'REV hardware, motor controllers, and control system docs.'
			},
			{
				title: 'CTRE documentation',
				url: 'https://docs.ctr-electronics.com/',
				note: 'Cross The Road Electronics: Talon, CANcoder, Pigeon, and Phoenix docs.'
			},
			{
				title: 'West Coast Products',
				url: 'https://wcproducts.com/',
				note: 'WCP mechanisms, gearboxes, and product documentation.'
			}
		]
	},
	{
		label: 'Official',
		refs: [
			{
				title: 'FIRST game manual',
				url: 'https://www.firstinspires.org/robotics/frc/game-and-season',
				note: 'The official FIRST Robotics Competition game and season materials.'
			}
		]
	}
];
