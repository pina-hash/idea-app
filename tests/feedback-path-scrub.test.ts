import { describe, expect, it } from 'vitest';
import { captureMeta, describeBuild, scrubAddressSegments } from '../src/lib/feedback/context';

/**
 * A REPORT FILED FROM A PAGE WHOSE PATH HOLDS A STUDENT'S ADDRESS MUST NOT
 * CARRY THE ADDRESS (the 2026-10-07 round). One student's page
 * (`/classroom/<id>/people/<email>`) and their read-only notebook
 * (`/classroom/notebook/review/student/<email>`) both put the address in the
 * path, and `meta.path` goes into the feedback queue, every export of it and a
 * triage committed to a public repository. This would regress SILENTLY: the
 * report still files, and nothing on screen shows what its meta holds.
 */
const BUILD = describeBuild({ sha: 'a1b2c3d', complete: true }, null);

function pathOf(routeId: string, pathname: string): string {
	return captureMeta({ routeId, pathname, role: 'teacher', at: '2026-10-07T18:00:00.000Z', build: BUILD })
		.path as string;
}

describe('captureMeta keeps no address from the path', () => {
	it("one student's page: the encoded address becomes :student", () => {
		const path = pathOf('/classroom/[sectionId]/people/[studentEmail]', '/classroom/s-1/people/ana%40boscotech.net');
		expect(path).toBe('/classroom/s-1/people/:student');
		expect(path).not.toMatch(/@|%40|boscotech/i);
	});

	it('the read-only notebook: a raw address and an upper-case escape alike', () => {
		expect(pathOf('/classroom/notebook/review/student/[studentEmail]', '/classroom/notebook/review/student/ana@x.net')).toBe(
			'/classroom/notebook/review/student/:student'
		);
		expect(scrubAddressSegments('/classroom/notebook/review/student/Ana%40X.net')).toBe('/classroom/notebook/review/student/:student');
	});

	it('POSITIVE CONTROL: a path with no address is kept exactly', () => {
		expect(pathOf('/classroom/[sectionId]/grades', '/classroom/s-1/grades')).toBe('/classroom/s-1/grades');
		expect(pathOf('/classroom/[sectionId]/item/[itemId]', '/classroom/s-1/item/i-9')).toBe('/classroom/s-1/item/i-9');
		// Only the segment goes, never its neighbours.
		expect(scrubAddressSegments('/a/b@c/d')).toBe('/a/:student/d');
	});
});
