/**
 * A PROJECT LINKED TO A CLASS (ledger 0463, migration 0319): the shapes the
 * Project view reads and the words it says. Plain data, client-safe.
 */

export interface ArmoryClassInfo {
	section_id: string;
	label: string;
	course_code: string;
	course_title: string;
	roster: number;
	folders: number;
}

export interface ArmorySectionChoice {
	id: string;
	label: string;
	course_code: string;
}

export interface ArmoryClassFolder {
	folder: string;
	kind: 'personal' | 'team';
	owner: string | null;
	writers: string[];
	files: number;
}

export type ClassAnswer = { ok: true; result: Record<string, unknown> } | { ok: false; message: string; code?: string; detail?: string };

const n = (v: unknown): number => (typeof v === 'number' ? v : 0);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function linkResultWords(r: Record<string, unknown>): string {
	const kept = Array.isArray(r.kept_their_role) ? r.kept_their_role.length : 0;
	return [
		`Linked. ${plural(n(r.students_added), 'student was', 'students were')} added`,
		n(r.instructor_added) > 0 ? ' and the teacher as instructor' : '',
		`; ${plural(n(r.folders_made), 'folder was', 'folders were')} made.`,
		kept > 0 ? ` ${plural(kept, 'person', 'people')} already on the project kept their role.` : '',
		' Lab computers show each folder the next time Armory syncs.'
	].join('');
}

export function teamFoldersWords(r: Record<string, unknown>): string {
	return `${plural(n(r.folders_made), 'team folder was', 'team folders were')} made and ${plural(n(r.folders_already_there), 'was', 'were')} already there; who can save in each now matches the class teams. No file was moved.`;
}

/** A refusal in his words, chosen by the code and DETAIL.reason, never the HTTP status. */
export function classLinkErrorWords(a: { message: string; code?: string; detail?: string }): string {
	let reason: string | undefined;
	try {
		reason = a.detail ? (JSON.parse(a.detail) as { reason?: string }).reason : undefined;
	} catch {
		reason = undefined;
	}
	if (reason === 'linked_elsewhere') return 'This project already follows another class. Unlink it first.';
	if (reason === 'no_teams') return 'The class has no teams posted yet. Post the teams on the class page first.';
	if (reason === 'not_linked') return 'Link the project to a class first.';
	if (a.code === '42501') return 'Only a site admin, or the class teacher who is a mentor or instructor of this project, can do that.';
	if (a.code === 'PGRST202') return 'The website is still being updated. Try again in a few minutes.';
	return a.message;
}

/** What the page hands the Class panel; a missing key removes its control. */
export interface ArmoryClassTransports {
	loadClass: () => Promise<ArmoryClassInfo | null>;
	loadSections?: (() => Promise<ArmorySectionChoice[]>) | null;
	link?: ((sectionId: string) => Promise<ClassAnswer>) | null;
	unlink?: (() => Promise<ClassAnswer>) | null;
	makeTeamFolders?: (() => Promise<ClassAnswer>) | null;
	loadFolders?: (() => Promise<ArmoryClassFolder[] | null>) | null;
}
