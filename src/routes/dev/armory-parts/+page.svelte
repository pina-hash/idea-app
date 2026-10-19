<script lang="ts">
	/**
	 * /dev/armory-parts: every state of the Parts view and the COTS library,
	 * through the REAL components in the real frame. With `?state=<name>` one
	 * state fills the page; with no query every state is stacked under
	 * `[data-view]` for a browser pass. The transports are in memory, so Take a
	 * number, Save prefix, Add, Correct and Retire all work here, and the
	 * in-memory take numbers the way 0274 does (the highest ever plus one).
	 * `?theme=space-white` measures the light twin.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ArmoryCotsLibrary from '$lib/armory/ArmoryCotsLibrary.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryPartSubsystems from '$lib/armory/ArmoryPartSubsystems.svelte';
	import ArmoryProjectParts from '$lib/armory/ArmoryProjectParts.svelte';
	import {
		cotsNumber,
		cotsProblem,
		formatPartNumber,
		type CotsAnswer,
		type CotsLibrary,
		type CotsPart,
		type PartNumberRow,
		type PartSubsystem,
		type ProjectPartNumbers,
		type TakeAnswer
	} from '$lib/armory/part-numbers';
	import { library, NOW, project } from './fixtures';

	let { data } = $props();
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	/* `?theme=space-white|matrix` forces the site theme, the /dev/armory way: a harness holds no session. */
	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	function partsState(over: Partial<ProjectPartNumbers>, list?: PartNumberRow[]) {
		let s = $state(project(over, list));
		const take = async (i: { subsystem: string; assembly: number | null; description: string }): Promise<TakeAnswer> => {
			const same = s.numbers.filter((n) => n.subsystem === i.subsystem);
			const assembly = i.assembly ?? Math.max(0, ...same.map((n) => n.assembly)) + 1;
			const part = i.assembly === null ? 0 : Math.max(0, ...same.filter((n) => n.assembly === assembly).map((n) => n.part)) + 1;
			const r: PartNumberRow = {
				id: `new-${s.numbers.length}`,
				part_number: formatPartNumber({ prefix: s.project.prefix, seasonYY: s.project.season_yy, subsystem: i.subsystem, assembly, part }),
				prefix: s.project.prefix,
				season_yy: s.project.season_yy,
				subsystem: i.subsystem,
				assembly,
				part,
				kind: part === 0 ? 'assembly' : 'part',
				revision: 'A',
				description: i.description,
				made_from: null,
				project_id: s.project.id,
				file_id: null,
				file_name: null,
				file_folder: null,
				file_deleted: false,
				assigned_name: 'You',
				assigned_at: new Date(NOW).toISOString()
			};
			s.numbers = [...s.numbers, r];
			return { ok: true, row: r };
		};
		const setPrefix = async (prefix: string) => {
			const v = prefix.trim().toUpperCase();
			if (!/^[A-Z0-9]{2,10}$/.test(v))
				return { ok: false as const, message: 'The prefix is the team number or the course, two to ten letters or digits, such as 5669 or IDEA100.' };
			s.project.prefix = v;
			return { ok: true as const };
		};
		return {
			get data() {
				return s;
			},
			take: s.can_take ? take : null,
			setPrefix: s.can_set_prefix ? setPrefix : null
		};
	}

	function cotsState(curate: boolean, parts: CotsPart[] = library()) {
		let s = $state<CotsLibrary>({ can_curate: curate, parts });
		const add = async (i: { vendor: string; vendorPart: string; description: string; link: string }): Promise<CotsAnswer> => {
			const problem = cotsProblem(i.vendor, i.vendorPart);
			if (problem) return { ok: false, message: problem };
			const n = cotsNumber(i.vendor, i.vendorPart);
			const dup = s.parts.find((p) => p.cots_number.toUpperCase() === n.toUpperCase());
			if (dup) return { ok: false, message: `The library already has ${dup.cots_number}: ${dup.description}.` };
			s.parts = [
				...s.parts,
				{
					id: `c-new-${s.parts.length}`,
					vendor: i.vendor.trim().toUpperCase(),
					vendor_part: i.vendorPart.trim(),
					cots_number: n,
					description: i.description,
					link: i.link || null,
					retired: false,
					file: null,
					added_at: new Date(NOW).toISOString(),
					corrected_at: null
				}
			].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.vendor_part.localeCompare(b.vendor_part));
			return { ok: true };
		};
		const correct = async (id: string, i: { description: string; link: string }): Promise<CotsAnswer> => {
			s.parts = s.parts.map((p) => (p.id === id ? { ...p, description: i.description, link: i.link || null } : p));
			return { ok: true };
		};
		const retire = async (id: string, retired: boolean): Promise<CotsAnswer> => {
			s.parts = s.parts.map((p) => (p.id === id ? { ...p, retired } : p));
			return { ok: true };
		};
		let codes = $state<PartSubsystem[]>(project().subsystems);
		const save = async (code: string, name: string): Promise<CotsAnswer> => {
			if (!/^[A-Z]{2}$/.test(code)) return { ok: false, message: 'A subsystem code is two letters, such as DT.' };
			codes = codes.some((c) => c.code === code) ? codes.map((c) => (c.code === code ? { ...c, name } : c)) : [...codes, { code, name, retired: false }];
			return { ok: true };
		};
		const retireCode = async (code: string, retired: boolean): Promise<CotsAnswer> => {
			codes = codes.map((c) => (c.code === code ? { ...c, retired } : c));
			return { ok: true };
		};
		return {
			get library() {
				return s;
			},
			get codes() {
				return codes;
			},
			save: curate ? save : null,
			retireCode: curate ? retireCode : null,
			add: curate ? add : null,
			correct: curate ? correct : null,
			retire: curate ? retire : null
		};
	}

	const parts = {
		student: partsState({}),
		mentor: partsState({ can_set_prefix: true, can_curate: true, project: { ...project().project, role: 'mentor' } }),
		archived: partsState({ can_take: false, project: { ...project().project, archived: true } }),
		empty: partsState({}, []),
		'class-project': partsState({ project: { ...project().project, name: 'IDEA100 Blade', prefix: 'IDEA100' } }, [])
	};
	const cots = {
		'cots-student': cotsState(false),
		'cots-mentor': cotsState(true),
		'cots-empty': cotsState(true, [])
	};
	const ALL = [...Object.keys(parts), ...Object.keys(cots)];
	const shown = $derived(data.only && ALL.includes(data.only) ? [data.only] : ALL);
</script>

<svelte:head><title>Armory part numbers harness</title></svelte:head>

<div data-armory-parts-hydrated={hydrated ? '' : undefined}>
	{#each shown as name (name)}
		<div data-view={name}>
			{#if name in parts}
				{@const p = parts[name as keyof typeof parts]}
				<ArmoryFrame
					title="Part numbers"
					crumbs={[
						{ href: '/armory', label: 'Armory' },
						{ href: '#', label: p.data.project.name }
					]}
					lead={`Every number ${p.data.project.name} has taken, by subsystem and assembly. (${name})`}
				>
					<ArmoryProjectParts data={p.data} now={NOW} take={p.take} setPrefix={p.setPrefix} />
				</ArmoryFrame>
			{:else}
				{@const c = cots[name as keyof typeof cots]}
				<ArmoryFrame
					title="COTS library"
					crumbs={[{ href: '/armory', label: 'Armory' }]}
					lead={`The bought parts every Armory project uses, named by vendor and the vendor's own number. (${name})`}
				>
					<ArmoryCotsLibrary library={c.library} add={c.add} correct={c.correct} retire={c.retire} />
					<ArmoryPartSubsystems subsystems={c.codes} save={c.save} retire={c.retireCode} />
				</ArmoryFrame>
			{/if}
		</div>
	{/each}
</div>
