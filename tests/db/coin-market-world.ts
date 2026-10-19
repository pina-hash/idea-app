// tests/db/coin-market-world.ts
//
// What the ledger 0402 coin suites share (the marketplace, transfers, hall
// pass time, stocks), and nothing they assert: one whole-tree database with
// two classes, coin staff of both tiers and five students, and the helpers
// every suite calls. The chain is the real migration tree read off disk
// (chain-coin-v2's WITH_V2), so every function under test is the file that
// production applies.

import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { WITH_V2 } from './chain-coin-v2';

export type Json = Record<string, unknown>;

export interface CoinWorld {
	db: TestDb;
	owner: SeededUser;
	cosso: SeededUser;
	teacher: SeededUser;
	ana: SeededUser;
	ben: SeededUser;
	cal: SeededUser;
	dee: SeededUser;
	eve: SeededUser;
	s1: string;
	s2: string;
	rpc: <T = Json>(u: SeededUser, call: string, params?: unknown[]) => Promise<T>;
	refusal: (p: Promise<unknown>) => Promise<string | null>;
	balance: (email: string) => Promise<number>;
	give: (email: string, amount: number) => Promise<void>;
	setting: (key: string, value: unknown) => Promise<void>;
	pid: (email: string) => Promise<string>;
	scalar: <T = string>(sql: string, params?: unknown[]) => Promise<T>;
}

export async function startCoinWorld(): Promise<CoinWorld> {
	const db = await startTestDb(WITH_V2);
	const owner = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	const cosso = await createUser(db, 'wcosso@boscotech.edu', 'Mr Cosso');
	const teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	const ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	const ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	const cal = await createUser(db, 'cal@boscotech.net', 'Cal Ng');
	const dee = await createUser(db, 'dee@boscotech.net', 'Dee Park');
	const eve = await createUser(db, 'eve@boscotech.net', 'Eve Lund');
	await db.sql(`insert into public.app_admins (email) values ('wcosso@boscotech.edu') on conflict do nothing`);
	const s1 = await createClassroomSection(db, { as: owner, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	const s2 = await createClassroomSection(db, { as: owner, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: cosso.email });
	const longAgo = new Date(Date.now() - 90 * 86400000).toISOString();
	for (const s of [ana, ben, dee, eve]) {
		await enrollStudent(db, { as: owner, sectionId: s1, email: s.email, displayName: s.email.split('@')[0] + ' (roster)', createdAt: longAgo });
	}
	await enrollStudent(db, { as: owner, sectionId: s2, email: cal.email, displayName: 'cal (roster)', createdAt: longAgo });

	const setting = async (key: string, value: unknown) => {
		await db.sql(
			`insert into public.coin_settings (key, value) values ($1, $2::jsonb)
			 on conflict (key) do update set value = excluded.value`,
			[key, JSON.stringify(value)]
		);
	};
	await db.sql(`
		insert into public.coin_settings (key, value) values ('semesters', jsonb_build_array(jsonb_build_object(
			'key', 'test-term', 'start', to_char(current_date - 200, 'YYYY-MM-DD'), 'end', to_char(current_date + 120, 'YYYY-MM-DD'))))
		on conflict (key) do update set value = excluded.value`);
	await setting('no_pay_weeks', []);
	await setting('no_class_days', []);
	await setting('quarter_ends', []);
	await db.sql(`delete from public.coin_settings where key = 'no_pay_after'`);
	await setting('autopay_paused', true);
	await setting('student_actions_per_minute', 120);

	const rpc = async <T = Json>(u: SeededUser, call: string, params: unknown[] = []): Promise<T> =>
		db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
	const refusal = async (p: Promise<unknown>): Promise<string | null> => {
		try {
			await p;
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	};
	const scalar = async <T = string>(sql: string, params: unknown[] = []): Promise<T> => {
		const { rows } = await db.sql<{ v: T }>(sql, params);
		return rows[0]?.v as T;
	};
	const balance = async (email: string) => Number(await scalar(`select public._coin_balance($1)::text v`, [email]));
	const give = async (email: string, amount: number) => {
		const r = await rpc<Json>(owner, `public.coin_log_transaction($1, 'balance_correction', $2::numeric, null, 'seed')`, [email, amount]);
		if (!r.ok) throw new Error(`seed refused: ${JSON.stringify(r)}`);
	};
	const pid = (email: string) => scalar<string>(`select public._coin_market_pid($1) v`, [email]);
	return { db, owner, cosso, teacher, ana, ben, cal, dee, eve, s1, s2, rpc, refusal, balance, give, setting, pid, scalar };
}

/** True when the database thinks today is a class day (a weekday in term). */
export async function todayIsClassDay(w: CoinWorld): Promise<boolean> {
	return (await w.scalar<boolean>(`select public._coin_is_class_day(public._coin_la_today()) v`)) === true;
}

/**
 * On a weekend run, a suite that needs the market open replaces the class-day
 * predicate IN ITS OWN DISPOSABLE DATABASE with one that also counts today.
 * The function under test is never edited; only the calendar it consults.
 */
export async function openTodayForTrading(w: CoinWorld): Promise<void> {
	if (await todayIsClassDay(w)) return;
	await w.db.sql(`
		create or replace function public._coin_is_class_day(p_day date)
		returns boolean language sql stable security definer set search_path = '' as $f$
			select (extract(isodow from p_day) between 1 and 5 or p_day = public._coin_la_today())
				and public._coin_semester_of(p_day) is not null
				and not exists (select 1 from jsonb_array_elements_text(coalesce(public._coin_setting('no_class_days'), '[]'::jsonb)) d
					where d::date = p_day);
		$f$`);
}
