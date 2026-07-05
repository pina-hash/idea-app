/**
 * FRC Training track registry: domains, units, and the reference shelf.
 * PLAIN DATA + pure helpers (client-safe, like curriculum.ts / gauntlet.ts).
 *
 * This is the STRUCTURE of the track only. Unit content and real gating come
 * later; until then `placeholderUnitState()` supplies a representative mix of
 * the three visual states so the shell can be built and verified. The track is
 * open to every signed-in student (route guard in hooks.server.ts); pathway is
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
	title: string;
}

export interface FrcDomain {
	/** URL slug under /frc/. */
	id: string;
	title: string;
	blurb: string;
	/** Ordered units; empty = domain renders the "content in development" placeholder. */
	units: FrcUnit[];
	/**
	 * Which authored content set backs this domain's units, if any. 'mdm' means
	 * the CAD/Mechanical units resolve to real per-unit pages (mdm-content.ts);
	 * units with no matching content render as in-development placeholders.
	 * Absent = no unit pages yet (whole domain is the placeholder block).
	 */
	contentSet?: 'mdm';
}

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
		units: []
	},
	{
		id: 'cad-mechanical',
		title: 'CAD and Mechanical Design',
		blurb: 'From your first sketch to real, manufacturable robot parts.',
		units: CAD_UNIT_TITLES.map((title, i) => ({ n: i + 1, title })),
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
 * PLACEHOLDER unit state until real gating exists: the first three units read
 * complete, the next two available, the rest locked, so every domain page
 * shows a representative mix of all three visual states. The real progression
 * layer will replace this single call site in DomainLanding.svelte.
 */
export function placeholderUnitState(n: number): UnitState {
	if (n <= 3) return 'complete';
	if (n <= 5) return 'available';
	return 'locked';
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
