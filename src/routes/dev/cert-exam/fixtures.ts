/**
 * Fixtures for /dev/cert-exam (ledger 0391, surface e): a five-question fake
 * draw, an in-memory transport that answers the contract's four shapes, two
 * results and three live rows. The answer keys live HERE, in a dev-only
 * module, and are never rendered: the browser-verify spec asserts no option
 * text reaches the failed state, with the question state as the control.
 */
import type { ExamTransport } from '$lib/certifications/exam/exam-client';
import type { ExamAnswer, ExamFlagKind, ExamLiveRow, ExamQuestionView, ExamStudentResult, QuestionType } from '$lib/certifications/types';

export interface FixtureQuestion {
	topic: string;
	type: QuestionType;
	prompt: string;
	options: { key: string; text: string }[] | null;
	unit: string | null;
	key: string | string[] | { value: number; tolerance: number } | { accept: string[] };
}

export const TOPIC_NAMES: Record<string, string> = {
	setup: 'Workholding and setup',
	speeds: 'Speeds and feeds',
	tools: 'Tools and tool holding'
};

export const DRAW: FixtureQuestion[] = [
	{
		topic: 'setup',
		type: 'multiple_choice',
		prompt: 'Which jaw of the mill vise is the fixed jaw?',
		options: [
			{ key: 'a', text: 'The jaw at the back, away from you' },
			{ key: 'b', text: 'The jaw at the front, toward you' },
			{ key: 'c', text: 'Either one, depending on the part' },
			{ key: 'd', text: 'Neither, both jaws move' }
		],
		unit: null,
		key: 'a'
	},
	{
		topic: 'speeds',
		type: 'numeric',
		prompt: 'Spindle speed for a 1/2 in HSS end mill in aluminum at 300 SFM, to the nearest 50?',
		options: null,
		unit: 'rpm',
		key: { value: 2292, tolerance: 60 }
	},
	{
		topic: 'setup',
		type: 'multiple_select',
		prompt: 'Which of these are checked before the first cut? Pick every one.',
		options: [
			{ key: 'a', text: 'The vise is bolted down' },
			{ key: 'b', text: 'The part is seated on parallels' },
			{ key: 'c', text: 'The spindle is at full speed before the part is clamped' },
			{ key: 'd', text: 'The cutter is tight in the collet' }
		],
		unit: null,
		key: ['a', 'b', 'd']
	},
	{
		topic: 'tools',
		type: 'short',
		prompt: 'Name the tool that trues a drilled hole to size.',
		options: null,
		unit: null,
		key: { accept: ['reamer', 'a reamer'] }
	},
	{
		topic: 'speeds',
		type: 'multiple_choice',
		prompt: 'In climb milling, the table moves so that the cutter teeth...',
		options: [
			{ key: 'a', text: 'Bite in thick and leave thin' },
			{ key: 'b', text: 'Bite in thin and leave thick' },
			{ key: 'c', text: 'Never touch the part' },
			{ key: 'd', text: 'Spin backward' }
		],
		unit: null,
		key: 'a'
	}
];

/** Every option text in the draw, for the spec's absence rows. */
export const OPTION_TEXTS = DRAW.flatMap((q) => q.options?.map((o) => o.text) ?? []);

const view = (q: FixtureQuestion, index: number, total: number, deadline: string): ExamQuestionView => ({
	index,
	total,
	type: q.type,
	prompt: q.prompt,
	options: q.options,
	unit: q.unit,
	deadline
});

function scoreOne(q: FixtureQuestion, a: ExamAnswer): boolean {
	const k = q.key;
	switch (q.type) {
		case 'multiple_choice':
			return a === k;
		case 'multiple_select': {
			if (!Array.isArray(a) || !Array.isArray(k)) return false;
			const want = new Set(k);
			return a.length === want.size && a.every((x) => want.has(x));
		}
		case 'numeric':
			return typeof a === 'number' && typeof k === 'object' && 'value' in k && Math.abs(a - k.value) <= k.tolerance;
		case 'short': {
			if (typeof a !== 'string' || typeof k !== 'object' || !('accept' in k)) return false;
			const norm = a.toLowerCase().trim().replace(/\s+/g, ' ').replace(/\.$/, '');
			return k.accept.includes(norm);
		}
	}
}

export interface MemoryExam extends ExamTransport {
	answers: ExamAnswer[];
	flags: ExamFlagKind[];
	readonly index: number;
}

/**
 * An in-memory `cert_exam_*`: open starts or resumes, answer enforces the
 * order and advances, flag appends, submit scores. `expired` answers open with
 * the contract's `release_expired` refusal.
 */
export function memoryTransport(options: { draw?: FixtureQuestion[]; expired?: boolean; timeLimitMs?: number; now?: () => number } = {}): MemoryExam {
	const draw = options.draw ?? DRAW;
	const now = options.now ?? (() => Date.now());
	const limit = options.timeLimitMs ?? 30 * 60_000;
	let deadline: string | null = null;
	let index = 0;
	const answers: ExamAnswer[] = draw.map(() => null);
	const flags: ExamFlagKind[] = [];
	const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

	const result = (): ExamStudentResult => {
		const per = draw.map((q, i) => ({ topic: q.topic, correct: scoreOne(q, answers[i]) }));
		const correct = per.filter((p) => p.correct).length;
		const passed = correct === draw.length;
		return {
			ok: true,
			passed,
			total: draw.length,
			correct,
			missed_topics: [...new Set(per.filter((p) => !p.correct).map((p) => p.topic))],
			cooldown_until: passed ? null : new Date(now() + 7 * 86_400_000).toISOString()
		};
	};

	return {
		answers,
		flags,
		get index() {
			return index;
		},
		open: (examId) => {
			if (options.expired) return wait({ ok: false, reason: 'release_expired', message: 'This release has expired.' });
			deadline = deadline ?? new Date(now() + limit).toISOString();
			return wait({
				ok: true,
				exam: { id: examId, state: 'in_progress', total: draw.length, current_index: index, deadline },
				question: index < draw.length ? view(draw[index], index, draw.length, deadline) : null
			});
		},
		answer: (_examId, i, answer) => {
			if (i !== index) return wait({ ok: false, reason: 'out_of_order', message: 'That is not the current question.' });
			answers[i] = answer;
			index++;
			if (index >= draw.length) return wait({ ok: true, done: true });
			return wait({ ok: true, question: view(draw[index], index, draw.length, deadline ?? '') });
		},
		flag: (_examId, kind) => {
			flags.push(kind);
			return wait({ ok: true, flags_count: flags.length });
		},
		submit: () => wait(result())
	};
}

export const FAILED_RESULT: ExamStudentResult = {
	ok: true,
	passed: false,
	total: 5,
	correct: 3,
	missed_topics: ['setup', 'speeds'],
	cooldown_until: new Date(Date.now() + 7 * 86_400_000).toISOString()
};

export const PASSED_RESULT: ExamStudentResult = {
	ok: true,
	passed: true,
	total: 5,
	correct: 5,
	missed_topics: [],
	cooldown_until: null
};

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

export const LIVE_ROWS: ExamLiveRow[] = [
	{
		exam_id: '11111111-1111-4111-8111-111111111111',
		student: { email: 'ana.reyes@boscotech.net', name: 'Ana Reyes' },
		certification: { code: 'MILL-1', name: 'Manual Mill Level 1' },
		state: 'in_progress',
		current_index: 3,
		total: 20,
		released_at: minutesFromNow(-12),
		release_expires_at: minutesFromNow(-2),
		started_at: minutesFromNow(-9),
		deadline: minutesFromNow(21),
		flags: [
			{ at: minutesFromNow(-6), kind: 'blur' },
			{ at: minutesFromNow(-6), kind: 'hidden' }
		],
		passed: null,
		submitted_at: null
	},
	{
		exam_id: '22222222-2222-4222-8222-222222222222',
		student: { email: 'ben.okafor@boscotech.net', name: 'Ben Okafor' },
		certification: { code: 'SAFE-1', name: 'Shop Safety' },
		state: 'released',
		current_index: 0,
		total: 15,
		released_at: minutesFromNow(-3),
		release_expires_at: minutesFromNow(7),
		started_at: null,
		deadline: null,
		flags: [],
		passed: null,
		submitted_at: null
	},
	{
		exam_id: '33333333-3333-4333-8333-333333333333',
		student: { email: 'maria.lopez@boscotech.net', name: 'Maria Lopez' },
		certification: { code: 'MILL-1', name: 'Manual Mill Level 1' },
		state: 'submitted',
		current_index: 20,
		total: 20,
		released_at: minutesFromNow(-50),
		release_expires_at: minutesFromNow(-40),
		started_at: minutesFromNow(-45),
		deadline: minutesFromNow(-15),
		flags: [],
		passed: true,
		submitted_at: minutesFromNow(-22)
	},
	{
		exam_id: '44444444-4444-4444-8444-444444444444',
		student: { email: 'jordan.vance@boscotech.net', name: null },
		certification: { code: 'SAFE-1', name: 'Shop Safety' },
		state: 'expired',
		current_index: 0,
		total: 15,
		released_at: minutesFromNow(-30),
		release_expires_at: minutesFromNow(-20),
		started_at: null,
		deadline: null,
		flags: [],
		passed: null,
		submitted_at: null
	}
];
