/**
 * HOW FAR EACH TEAMMATE IS, FOR THE DOCUMENT TO SHOW (ledger 0422, gap 673cbfa2).
 *
 * `classroom_team_progress` (0290) answers, for the student's own team only,
 * which of the assignment's blocks each teammate has an answer stored under,
 * and never the answers. This turns that into the same numbers the student's
 * own progress rail shows, through `hxProgress` (one rule for what complete
 * means), and into the message the document receives: per teammate, a
 * percent, the FIELDS that are done (the document knows its own field names,
 * never block ids) and each module's met count, so a document can draw it
 * beside each day's steps.
 *
 * A STEP COUNTS AS DONE WHEN IT HOLDS AN ANSWER. The words are not sent, so a
 * teammate's long answer that is still short of its sentence count reads done
 * here; the student's own rail, which has the words, is the strict one.
 */
import { manifestBlocks, type HtmlAssignmentManifest } from './manifest';
import { hxProgress } from './progress';
import type { HxImageState } from './bridge';

export interface TeamProgressRaw {
	teams?: Array<{
		team_name: string;
		set_label?: string;
		members: Array<{ name: string; me: boolean; state: string; answered: string[]; images: string[] }>;
	}>;
}

export interface HxTeammateProgress {
	name: string;
	me: boolean;
	handedIn: boolean;
	percent: number;
	/** Fields with an answer, in manifest order. */
	done: string[];
	modules: Array<{ id: string; title: string; met: number; of: number }>;
}

export interface HxTeamProgress {
	team: string;
	members: HxTeammateProgress[];
}

/** Long enough for any sentence count a block can ask for. */
const STANDS_IN = 'Done. Done. Done. Done. Done. Done. Done. Done. Done. Done. Done. Done.';

export function teamProgressFor(manifest: HtmlAssignmentManifest, raw: TeamProgressRaw | null | undefined): HxTeamProgress | null {
	const team = raw?.teams?.[0];
	if (!team) return null;
	const blocks = manifestBlocks(manifest);
	const fieldOf = new Map(blocks.map((b) => [b.id, b.field]));
	return {
		team: team.team_name,
		members: team.members.map((m) => {
			const values: Record<string, string | boolean> = {};
			for (const id of m.answered) {
				const f = fieldOf.get(id);
				const type = blocks.find((b) => b.id === id)?.type;
				if (f) values[f] = type === 'checkbox' ? true : type === 'table' ? '[["done"]]' : STANDS_IN;
			}
			const images: Record<string, HxImageState> = {};
			for (const id of m.images) {
				const f = fieldOf.get(id);
				// Only "a picture is there" matters to the count; no address is sent.
				if (f) images[f] = { url: 'stored', name: '', caption: '' };
			}
			const p = hxProgress(manifest, values, images);
			return {
				name: m.name,
				me: m.me,
				handedIn: m.state === 'submitted' || m.state === 'returned',
				percent: p.percent,
				done: p.blocks.filter((b) => b.met).map((b) => b.field),
				modules: p.modules.map((mod) => ({ id: mod.id, title: mod.title, met: mod.met, of: mod.blocks }))
			};
		})
	};
}
