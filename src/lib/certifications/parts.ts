/**
 * The fixed order a certification is earned in, and the one implementation of
 * "which part is next" and "is this part unlocked" on the client. The database
 * (`_cert_next_part`, `_cert_part_unlocked` in 0261) is the gate; this mirror
 * only decides what a surface draws, and `tests/cert-parts.test.ts` holds the
 * two to one corpus.
 */
import { CERT_PARTS, type CertCheckJson, type CertPart, type CertParts, type CheckState } from './types';

/** The word a student reads for each part. No jargon, no table names. */
export const PART_WORDS: Record<CertPart, string> = {
	training: 'Training',
	guided: 'Guided project',
	exam: 'Exam',
	autonomous: 'Autonomous project',
	checkout: 'Checkout'
};

/** One sentence under each part on the checklist. */
export const PART_DESCRIPTIONS: Record<CertPart, string> = {
	training: 'Watch every training video and finish every lesson. This checks itself off.',
	guided: 'Follow the guided project and hand in its evidence. A certifier passes it.',
	exam: 'Take the exam in person, under lockdown, with a certifier in the room. 100% passes.',
	autonomous: 'Build the autonomous project alone, with zero help, and hand in its evidence.',
	checkout: 'Perform the skill cold, start to finish, in person or on one continuous, unedited take on an unlisted video.'
};

/** The parts a revision actually requires, in order. */
export function requiredParts(parts: CertParts): CertPart[] {
	return CERT_PARTS.filter((p) => p === 'training' || parts[p]);
}

const stateOf = (checks: CertCheckJson[], part: CertPart): CheckState | null =>
	checks.find((c) => c.part === part)?.state ?? null;

/** The first part in order still pending, or null when nothing is left. */
export function nextPart(checks: CertCheckJson[]): CertPart | null {
	for (const part of CERT_PARTS) {
		const s = stateOf(checks, part);
		if (s === 'pending') return part;
	}
	return null;
}

/** A part is unlocked when every earlier part is done or waived. */
export function partUnlocked(checks: CertCheckJson[], part: CertPart): boolean {
	for (const p of CERT_PARTS) {
		if (p === part) return true;
		const s = stateOf(checks, p);
		if (s === 'pending') return false;
	}
	return true;
}

/** Every required part is done or waived: the award may light up. */
export function allPartsDone(checks: CertCheckJson[]): boolean {
	return checks.length > 0 && checks.every((c) => c.state !== 'pending');
}

/** Counts for a progress line: "3 of 5 parts done". Waived counts as done. */
export function partsProgress(checks: CertCheckJson[]): { done: number; total: number } {
	const total = checks.length;
	const done = checks.filter((c) => c.state !== 'pending').length;
	return { done, total };
}
