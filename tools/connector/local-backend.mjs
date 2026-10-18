#!/usr/bin/env node
// tools/connector/local-backend.mjs
//
// AN MCP INSPECTOR RUN WITH NO SUPABASE PROJECT (docs/connector/DESIGN.md
// section 5). Boots an embedded Postgres with every migration applied, seeds a
// site admin who teaches two IDEA209H blocks with a few students, mints a
// connector access token for that admin straight into connector_tokens, and
// prints what to run next. It then stays up until interrupted, so `vite dev`
// can be pointed at it:
//
//   node tools/connector/local-backend.mjs            # prints the URL and token
//   CONNECTOR_BACKEND=local-pg CONNECTOR_LOCAL_PG_URL=<url> npm run dev
//   npx @modelcontextprotocol/inspector --cli http://localhost:5173/mcp \
//     --transport http --header "Authorization: Bearer <token>" --method tools/list
//
// The local backend (src/lib/server/connector/backend-local.ts) loads only
// under `vite dev`, so nothing here can reach production. The admin is an
// allowlist row (inspector@boscotech.edu), never the pinned owner.

import { createHash, randomBytes } from 'node:crypto';
import { bootFullChain } from './cluster.mjs';

const port = Number(process.env.CONNECTOR_LOCAL_PG_PORT ?? 54990);
const { client, database, stop } = await bootFullChain({ port, log: (m) => console.log(m) });

const admin = (await client.query(
	`insert into auth.users (email, raw_user_meta_data) values ('inspector@boscotech.edu', '{"full_name":"Inspector Admin"}') returning id`
)).rows[0].id;
await client.query(`insert into public.app_admins (email, granted_by) values ('inspector@boscotech.edu', 'local-backend')`);

async function asAdmin(sql, params) {
	await client.query(`select set_config('request.jwt.claims', $1, false)`, [
		JSON.stringify({ sub: admin, role: 'authenticated', email: 'inspector@boscotech.edu' })
	]);
	await client.query('set role authenticated');
	try {
		return await client.query(sql, params);
	} finally {
		await client.query('reset role');
		await client.query(`select set_config('request.jwt.claims', '', false)`);
	}
}

const course = (await asAdmin(`select public.classroom_upsert_course('IDEA209H', 'Engineering I Honors') as r`)).rows[0].r.course_id;
const sections = [];
for (const label of ['Block 2', 'Block 4']) {
	sections.push((await asAdmin(`select public.classroom_upsert_section($1, $2, null, 'inspector@boscotech.edu') as r`, [course, label])).rows[0].r.section_id);
}
const roster = [
	[sections[0], 'mateo.reyes@boscotech.net', 'Reyes, Mateo'],
	[sections[0], 'daniel.ruiz@boscotech.net', 'Ruiz, Daniel'],
	[sections[1], 'daniel.vega@boscotech.net', 'Vega, Daniel'],
	[sections[1], 'leo.lee@boscotech.net', 'Lee, Leo']
];
for (const [s, email, name] of roster) await asAdmin(`select public.classroom_set_enrollment($1, $2, $3, true)`, [s, email, name]);

const token = randomBytes(32).toString('base64url');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
await client.query(
	`insert into public.connector_tokens (user_id, email, client_id, label, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
	 values ($1, 'inspector@boscotech.edu', 'local-inspector', 'MCP Inspector (local)', $2, $3, now() + interval '8 hours', now() + interval '1 day')`,
	[admin, sha(token), sha(randomBytes(32).toString('base64url'))]
);

const url = `postgres://postgres:postgres@127.0.0.1:${port}/${database}`;
console.log(`\nCONNECTOR_LOCAL_PG_URL=${url}\nACCESS_TOKEN=${token}\n`);
console.log('Up. Ctrl-C to stop.');
process.on('SIGINT', async () => {
	await stop();
	process.exit(0);
});
process.on('SIGTERM', async () => {
	await stop();
	process.exit(0);
});
setInterval(() => {}, 1 << 30);
