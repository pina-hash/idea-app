/**
 * ONE TEAM'S GRADING SCREEN IN `classroom_team_grading`'s OWN SHAPE (ledger
 * 0436, 0305), for the dev harness and the unit tests: a Design Review post
 * with two team criteria, four role blocks of 25 and a 25-point individual
 * reflection, graded for a team of three, so one member owns two roles.
 */

const levels = (top: number, shorts: string[]) => {
	const pts = top === 25 ? [25, 18, 10, 0] : [top, Math.round(top * 0.7), Math.round(top * 0.4), 0];
	return pts.map((points, i) => ({
		points,
		label: ['Complete', 'Proficient', 'Developing', 'Absent'][i],
		short: shorts[i],
		descriptor: `${shorts[i]}: the descriptor a student is shown when they ask why.`
	}));
};
const crit = (id: string, criterion: string, top: number, shorts: string[]) => ({ id, criterion, points: top, levels: levels(top, shorts) });

export const ROLE_TITLES = { frame: 'Frame and mount', energy: 'Energy store', drive: 'Drive', ballpath: 'Ball path' } as const;

export function fixtureGrading(): Record<string, unknown> {
	const rubric = [
		crit('review-talk', 'Presentation names every subsystem', 50, ['All four, with numbers', 'All four, no numbers', 'Two or three', 'Under two']),
		crit('review-answers', 'Questions answered from the design', 50, ['Every answer cites a part', 'Most cite a part', 'Few cite a part', 'No answers']),
		...Object.entries(ROLE_TITLES).map(([id, title]) =>
			crit(`${id}-plan-c1`, `${title}: requirement met with a sketch`, 25, ['Sketch, numbers, interface', 'Sketch and numbers', 'Sketch only', 'Nothing'])
		),
		crit('reflect-c1', 'Reflection names one change', 25, ['Change, reason, evidence', 'Change and reason', 'Change only', 'Nothing'])
	];
	return {
		ok: true,
		team: { id: 'team-arc', name: 'Team Arc', section_id: 's2', section_label: 'Block 2' },
		rubric,
		role_of: Object.fromEntries(Object.keys(ROLE_TITLES).map((id) => [`${id}-plan-c1`, id])),
		team_criteria: ['review-talk', 'review-answers'],
		out_of: 150,
		roles: [
			{ id: 'frame', title: ROLE_TITLES.frame, owner: 'eli.moss@boscotech.net', owner_name: 'Eli' },
			{ id: 'energy', title: ROLE_TITLES.energy, owner: 'eli.moss@boscotech.net', owner_name: 'Eli' },
			{ id: 'drive', title: ROLE_TITLES.drive, owner: 'fay.kim@boscotech.net', owner_name: 'Fay' },
			{ id: 'ballpath', title: ROLE_TITLES.ballpath, owner: 'gus.cole@boscotech.net', owner_name: 'Gus' }
		],
		members: [
			{ email: 'eli.moss@boscotech.net', name: 'Eli Moss', roles: ['energy', 'frame'], state: null, score: null, scores: {}, comment: null, graded_at: null },
			{ email: 'fay.kim@boscotech.net', name: 'Fay Kim', roles: ['drive'], state: null, score: null, scores: {}, comment: null, graded_at: null },
			{ email: 'gus.cole@boscotech.net', name: 'Gus Cole', roles: ['ballpath'], state: null, score: null, scores: {}, comment: null, graded_at: null }
		]
	};
}
