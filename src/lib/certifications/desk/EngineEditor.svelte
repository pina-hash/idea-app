<script lang="ts">
	/**
	 * THE ENGINE EDITOR (the spec's Engine screen, `docs/CERTIFICATIONS.md`
	 * "The certification engine"): one certification's whole package, edited
	 * in place, saved as a new revision. A sticky sub-bar carries the code,
	 * the state readout and the keys: Save (the one `SaveState`, autosave OFF
	 * because every save is a revision somebody can read), Publish (held
	 * while `publish_problems` is non-empty, the problems listed in words
	 * beside it), Hide, Retire and Delete (each a two-step confirm naming the
	 * counts the function names), and Export. Under it, every section of the
	 * package folds in a `Disclosure` scoped to this record.
	 *
	 * THE PACKAGE IS `$state` HERE AND IS HANDED TO THE INJECTED `save`
	 * TRANSPORT AS ONE OBJECT (`buildPackage`, through `normalizeEditorPackage`,
	 * so a textarea's blank lines and a number box's strings never reach the
	 * function). The route posts it to its `save` action as JSON; the harness
	 * keeps it in memory. Omitting `save` removes every write control, and the
	 * fields go read-only: a certifier reads the engine, only an admin writes
	 * (DECISIONS D5).
	 *
	 * "HAS THIS BEEN EDITED" IS `EditBaseline`, never "is there content here":
	 * the form opens on the stored package, and dirty is a divergence from it.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import { normalizeYouTubeId } from '$lib/youtube';
	import { CERT_API } from '$lib/certifications/nav';
	import { formatCertDateTime } from '$lib/certifications/status';
	import {
		emptyPackage,
		type CertPackage,
		type CheckoutSpec,
		type ExamConfig,
		type ExamQuestion,
		type ProjectSpec,
		type TrainingItem
	} from '$lib/certifications/types';
	import {
		CERT_STATE_READOUTS,
		normalizeEditorPackage,
		publishBlocked,
		trainingKey,
		type AdminGetJson,
		type DeskFormResult,
		type EngineSaveAnswer
	} from './desk';
	import ConfirmKey from './ConfirmKey.svelte';
	import LessonEditor from './LessonEditor.svelte';
	import LinesField from './LinesField.svelte';
	import PoolEditor from './PoolEditor.svelte';
	import ProjectEditor from './ProjectEditor.svelte';
	import Readout from './Readout.svelte';

	let {
		cert,
		pool = null,
		others = [],
		save = null,
		results = {}
	}: {
		cert: AdminGetJson;
		/** The pool with its keys, for an admin; null removes the pool editor. */
		pool?: ExamQuestion[] | null;
		/** Every other certification, for the prerequisite boxes. */
		others?: { code: string; name: string }[];
		/** The save transport. Omitted: a read-only engine. */
		save?: ((pkg: CertPackage, note: string) => Promise<EngineSaveAnswer>) | null;
		results?: Partial<Record<'publish' | 'hide' | 'retire' | 'delete' | 'savePool' | 'saveLesson' | 'deleteLesson', DeskFormResult | null>>;
	} = $props();

	const canEdit = $derived(!!save);

	function seedPackage(c: AdminGetJson): CertPackage {
		const base = c.package ? (JSON.parse(JSON.stringify(c.package)) as CertPackage) : emptyPackage();
		return {
			...base,
			code: base.code || c.code,
			name: base.name || c.name,
			level: base.level || c.level,
			category: base.category || c.category,
			sort_order: base.sort_order ?? c.sort_order,
			renewal: base.renewal ?? c.renewal,
			training: base.training ?? { items: [], quick_checks: [] },
			practice_quiz: base.practice_quiz ?? [],
			common_mistakes: base.common_mistakes ?? [],
			prerequisites: base.prerequisites ?? [],
			exam: base.exam ?? emptyPackage().exam,
			guided_project: base.guided_project ?? emptyPackage().guided_project,
			autonomous_project: base.autonomous_project ?? emptyPackage().autonomous_project,
			checkout: base.checkout ?? emptyPackage().checkout
		};
	}

	// svelte-ignore state_referenced_locally
	const seeded = seedPackage(cert);
	let pkg = $state<CertPackage>(seeded);
	/* The four blocks the package type allows to be null are edited as their
	   own non-null state, so a field can bind into them; `current()` puts them
	   back into the package. */
	let exam = $state<ExamConfig>(seeded.exam ?? (emptyPackage().exam as ExamConfig));
	let guided = $state<ProjectSpec>(seeded.guided_project ?? (emptyPackage().guided_project as ProjectSpec));
	let autonomous = $state<ProjectSpec>(seeded.autonomous_project ?? (emptyPackage().autonomous_project as ProjectSpec));
	let checkout = $state<CheckoutSpec>(seeded.checkout ?? (emptyPackage().checkout as CheckoutSpec));
	// svelte-ignore state_referenced_locally
	let poolRows = $state<ExamQuestion[]>(pool ? (JSON.parse(JSON.stringify(pool)) as ExamQuestion[]) : []);
	let note = $state('');
	// svelte-ignore state_referenced_locally
	let revision = $state<number | null>(cert.revisions[0]?.revision ?? null);
	// svelte-ignore state_referenced_locally
	let problems = $state<string[]>([...(cert.publish_problems ?? [])]);
	let saveProblems = $state<string[]>([]);

	/** The whole package as it stands on screen, the four blocks put back. */
	function current(): CertPackage {
		return {
			...($state.snapshot(pkg) as CertPackage),
			exam: $state.snapshot(exam) as ExamConfig,
			guided_project: $state.snapshot(guided) as ProjectSpec,
			autonomous_project: $state.snapshot(autonomous) as ProjectSpec,
			checkout: $state.snapshot(checkout) as CheckoutSpec
		};
	}

	const baseline = new EditBaseline();
	baseline.seed(normalizeEditorPackage(current()));

	/** The package exactly as it is sent: every field normalized once, here. */
	export function buildPackage(): CertPackage {
		return normalizeEditorPackage(current());
	}

	const saveState = new SaveState({
		autosave: false,
		fallbackMessage: 'The revision was not saved.',
		save: async () => {
			if (!save) return { ok: false, retryable: false, message: 'Only a site admin can save a revision.' };
			const built = buildPackage();
			const answer = await save(built, note.trim());
			if (answer.ok) {
				revision = answer.revision;
				problems = answer.publish_problems ?? [];
				saveProblems = [];
				baseline.advance(built);
				note = '';
				return { ok: true };
			}
			saveProblems = answer.problems ?? [];
			return { ok: false, retryable: answer.retryable, message: answer.message };
		}
	});
	$effect(() => saveState.attach());

	/** Called from every input event under the editor, and by every add, move and remove. */
	function edited() {
		if (!canEdit) return;
		if (baseline.changed(buildPackage())) saveState.markDirty();
	}

	const publishHeld = $derived(publishBlocked(problems) || saveState.dirty);
	const publishWhy = $derived(
		saveState.dirty ? 'Save the revision first; Publish reads what is stored.' : publishBlocked(problems) ? 'Fix every problem listed below, save, and Publish lights up.' : null
	);
	const exportHref = $derived(CERT_API.packageExport(cert.id));
	const topics = $derived(exam.topics);
	const itemKeys = $derived(pkg.training.items.map(trainingKey));
	const usedSlugs = $derived(pkg.training.items.filter((i): i is Extract<TrainingItem, { kind: 'lesson' }> => i.kind === 'lesson').map((i) => i.slug));

	// Training items
	let videoUrl = $state('');
	let videoTitle = $state('');
	let lessonSlug = $state('');
	const videoId = $derived(normalizeYouTubeId(videoUrl));
	function addVideo() {
		if (!videoId) return;
		pkg.training.items = [...pkg.training.items, { kind: 'video', key: `yt:${videoId}`, title: videoTitle.trim() || `Video ${pkg.training.items.length + 1}`, youtube_id: videoId, start: 0 }];
		videoUrl = '';
		videoTitle = '';
		edited();
	}
	function addLesson() {
		const l = cert.lessons.find((x) => x.slug === lessonSlug);
		if (!l) return;
		pkg.training.items = [...pkg.training.items, { kind: 'lesson', key: `lesson:${l.slug}`, title: l.title, slug: l.slug }];
		lessonSlug = '';
		edited();
	}
	function moveItem(i: number, by: number) {
		const items = [...pkg.training.items];
		const j = i + by;
		if (j < 0 || j >= items.length) return;
		[items[i], items[j]] = [items[j], items[i]];
		pkg.training.items = items;
		edited();
	}
	function removeItem(i: number) {
		pkg.training.items = pkg.training.items.filter((_, j) => j !== i);
		edited();
	}
	function addQuickCheck() {
		pkg.training.quick_checks = [...pkg.training.quick_checks, { id: `qc-${pkg.training.quick_checks.length + 1}`, after: itemKeys[0] ?? '', prompt: '', options: ['', ''], answer: 0, explain: '' }];
		edited();
	}
	function removeQuickCheck(i: number) {
		pkg.training.quick_checks = pkg.training.quick_checks.filter((_, j) => j !== i);
		edited();
	}
	function addPractice() {
		pkg.practice_quiz = [...pkg.practice_quiz, { id: `pq-${pkg.practice_quiz.length + 1}`, prompt: '', options: ['', ''], answer: 0, explain: '' }];
		edited();
	}
	function removePractice(i: number) {
		pkg.practice_quiz = pkg.practice_quiz.filter((_, j) => j !== i);
		edited();
	}
	function addMistake() {
		pkg.common_mistakes = [...pkg.common_mistakes, { title: '', body: '' }];
		edited();
	}
	function removeMistake(i: number) {
		pkg.common_mistakes = pkg.common_mistakes.filter((_, j) => j !== i);
		edited();
	}
	function addTopic() {
		exam.topics = [...exam.topics, { id: '', name: '', minimum: 1 }];
		edited();
	}
	function removeTopic(i: number) {
		exam.topics = exam.topics.filter((_, j) => j !== i);
		edited();
	}
	function togglePrerequisite(code: string, on: boolean) {
		pkg.prerequisites = on ? [...new Set([...pkg.prerequisites, code])] : pkg.prerequisites.filter((c) => c !== code);
		edited();
	}

	const ACTION_KEYS = ['publish', 'hide', 'retire', 'delete'] as const;
	const stateReadout = $derived(CERT_STATE_READOUTS[cert.state]);
	const scope = (section: string) => `cert-engine-${cert.id}-${section}`;
	const counts = $derived(`${cert.holders_count} holder${cert.holders_count === 1 ? '' : 's'} and ${cert.active_attempts} active attempt${cert.active_attempts === 1 ? '' : 's'}`);
</script>

<div class="dk-editor" data-testid="cert-engine-editor" data-state={cert.state} data-dirty={saveState.dirty ? 'yes' : 'no'}>
	<div class="dk-subbar" data-testid="cert-engine-subbar">
		<div class="dk-subbar-title">
			<span class="dk-subbar-code">{cert.code}</span>
			<span>{cert.name}</span>
			<Readout readout={stateReadout} testId="cert-engine-state" />
			<span class="dk-row-meta">revision {revision ?? 0}</span>
		</div>
		{#if canEdit}
			<label class="cert-field dk-note"><span class="dk-sr">Revision note</span><input type="text" bind:value={note} placeholder="What changed, for the history" /></label>
			<SaveIndicator state={saveState} onsave={() => void saveState.saveNow()} saveLabel="Save revision" hideClean={false} />
			<form method="post" action="?/publish" onsubmit={(e) => { if (publishHeld) e.preventDefault(); }}>
				<button type="submit" class="btn cert-btn" aria-disabled={publishHeld ? 'true' : undefined} aria-describedby={publishWhy ? 'cert-engine-publish-why' : undefined} data-testid="cert-engine-publish">Publish</button>
			</form>
			{#if cert.state === 'published'}
				<form method="post" action="?/hide">
					<ConfirmKey word="Hide" confirmWord="Hide from students" cost="Hide takes it back to a draft so students cannot see or start it. It is refused while anybody holds it or is working on it ({counts})." testId="cert-engine-hide" />
				</form>
				<form method="post" action="?/retire">
					<ConfirmKey word="Retire" confirmWord="Retire this certification" cost="Retiring stops new starts. Every existing award stays valid and every active attempt keeps working ({counts})." testId="cert-engine-retire" />
				</form>
			{/if}
			{#if cert.state === 'draft'}
				<form method="post" action="?/delete">
					<ConfirmKey word="Delete" confirmWord="Delete {cert.code}" cost="Delete removes this draft, its revisions and its lessons for good. It is refused once it was ever published or anybody has started it ({counts})." danger={true} testId="cert-engine-delete" />
				</form>
			{/if}
		{/if}
		<a class="btn cert-btn secondary" href={exportHref} download data-testid="cert-engine-export">Export</a>
	</div>

	{#if canEdit && publishWhy}
		<p class="dk-held" id="cert-engine-publish-why" data-testid="cert-engine-publish-why">{publishWhy}</p>
	{/if}
	{#if problems.length}
		<div class="cert-notice" data-testid="cert-engine-problems">
			<span class="cert-notice-glyph" aria-hidden="true">!</span>
			<div>
				<strong>{problems.length} thing{problems.length === 1 ? '' : 's'} before this can publish</strong>
				<ul class="dk-problems">{#each problems as p, i (i)}<li>{p}</li>{/each}</ul>
			</div>
		</div>
	{/if}
	{#if saveProblems.length}
		<div class="cert-notice cert-notice-bad" role="alert" data-testid="cert-engine-save-problems">
			<span class="cert-notice-glyph" aria-hidden="true">!</span>
			<div>
				<strong>The save was refused</strong>
				<ul class="dk-problems">{#each saveProblems as p, i (i)}<li>{p}</li>{/each}</ul>
			</div>
		</div>
	{/if}
	{#each ACTION_KEYS as key (key)}
		{@const r = results[key]}
		{#if r}
			<p class="cert-notice {r.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-engine-{key}-result">
				<span class="cert-notice-glyph" aria-hidden="true">{r.ok ? '✓' : '!'}</span>
				<span>{r.message}</span>
			</p>
		{/if}
	{/each}
	{#if !canEdit}
		<p class="cert-notice cert-notice-quiet" data-testid="cert-engine-readonly">
			<span class="cert-notice-glyph" aria-hidden="true">i</span>
			<span>You can read this certification. Only a site admin edits, publishes or retires one.</span>
		</p>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="dk-sections" oninput={edited} onchange={edited}>
			<Disclosure label="Identity" heading={2} scope={scope('identity')} testId="cert-engine-identity">
				<section id="identity"><fieldset class="dk-fieldset dk-fields" disabled={!canEdit}>
					<label class="cert-field"><span>Code</span><input type="text" bind:value={pkg.code} readonly={cert.state !== 'draft'} data-testid="cert-engine-code" /></label>
					<label class="cert-field"><span>Name</span><input type="text" bind:value={pkg.name} data-testid="cert-engine-name" /></label>
					<label class="cert-field"><span>Level (1 to 9)</span><input type="number" min="1" max="9" bind:value={pkg.level} /></label>
					<label class="cert-field"><span>Category</span><input type="text" bind:value={pkg.category} placeholder="Machining" /></label>
					<label class="cert-field"><span>Sort order</span><input type="number" bind:value={pkg.sort_order} /></label>
					<label class="cert-field"><span>Renewal</span>
						<select bind:value={pkg.renewal}>
							<option value="never">Never expires</option>
							<option value="school_year">Expires on the school-year date</option>
						</select>
					</label>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Meaning" heading={2} scope={scope('meaning')}>
				<section id="meaning"><fieldset class="dk-fieldset dk-fields" disabled={!canEdit}>
					<label class="cert-field dk-wide"><span>Definition</span><textarea rows="3" bind:value={pkg.definition}></textarea></label>
					<label class="cert-field"><span>What it allows</span><textarea rows="4" bind:value={pkg.allows}></textarea></label>
					<label class="cert-field"><span>What it does not allow</span><textarea rows="4" bind:value={pkg.does_not_allow}></textarea></label>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Prerequisites" heading={2} scope={scope('prerequisites')}>
				<section id="prerequisites"><fieldset class="dk-fieldset" disabled={!canEdit}>
					{#if others.length === 0}
						<p class="dk-empty">No other certification exists to require.</p>
					{:else}
						<div class="dk-switches" data-testid="cert-engine-prerequisites">
							{#each others as o (o.code)}
								<label class="dk-switch"><input type="checkbox" checked={pkg.prerequisites.includes(o.code)} onchange={(e) => togglePrerequisite(o.code, (e.currentTarget as HTMLInputElement).checked)} /> {o.code} {o.name}</label>
							{/each}
						</div>
					{/if}
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Parts" heading={2} scope={scope('parts')}>
				<section id="parts"><fieldset class="dk-fieldset" disabled={!canEdit}>
					<p class="cert-help">Training is always required. Switch a part off only for a certification that genuinely does not need it; its checklist row then reads Waived.</p>
					<div class="dk-switches" data-testid="cert-engine-parts">
						<label class="dk-switch"><input type="checkbox" bind:checked={pkg.parts.guided} /> Guided project</label>
						<label class="dk-switch"><input type="checkbox" bind:checked={pkg.parts.exam} /> Exam</label>
						<label class="dk-switch"><input type="checkbox" bind:checked={pkg.parts.autonomous} /> Autonomous project</label>
						<label class="dk-switch"><input type="checkbox" bind:checked={pkg.parts.checkout} /> Checkout</label>
					</div>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Training" heading={2} scope={scope('training')} collapseWhen={true}>
				<section id="training"><fieldset class="dk-fieldset" disabled={!canEdit}>
					<h3 class="cert-section-h">Items, in order</h3>
					{#if pkg.training.items.length === 0}
						<p class="dk-empty" data-testid="cert-engine-training-empty">No training yet. A kit needs at least one video or lesson to publish.</p>
					{/if}
					<ol class="dk-items" data-testid="cert-engine-training-items">
						{#each pkg.training.items as item, i (item.key + i)}
							<li class="dk-item" data-kind={item.kind}>
								<div class="dk-item-head">
									<span class="dk-item-title">{i + 1}. {item.kind === 'video' ? 'Video' : 'Lesson'} <span class="dk-mono-inline">{trainingKey(item)}</span></span>
									<div class="cert-actions">
										<button type="button" class="btn cert-btn secondary" aria-disabled={i === 0 ? 'true' : undefined} onclick={() => moveItem(i, -1)}>Move up</button>
										<button type="button" class="btn cert-btn secondary" aria-disabled={i === pkg.training.items.length - 1 ? 'true' : undefined} onclick={() => moveItem(i, 1)}>Move down</button>
										<button type="button" class="btn cert-btn secondary" onclick={() => removeItem(i)}>Remove</button>
									</div>
								</div>
								<div class="dk-fields">
									<label class="cert-field"><span>Title</span><input type="text" bind:value={item.title} /></label>
									{#if item.kind === 'video'}
										<label class="cert-field"><span>Start at (whole seconds)</span><input type="number" min="0" bind:value={item.start} /></label>
									{/if}
								</div>
							</li>
						{/each}
					</ol>
					<div class="dk-fields dk-add">
						<label class="cert-field"><span>Add a video: YouTube link or id</span><input type="text" bind:value={videoUrl} placeholder="https://youtu.be/..." data-testid="cert-engine-video-url" /></label>
						<label class="cert-field"><span>Its title</span><input type="text" bind:value={videoTitle} /></label>
						<div class="cert-actions"><button type="button" class="btn cert-btn secondary" aria-disabled={videoId ? undefined : 'true'} onclick={addVideo} data-testid="cert-engine-add-video">Add video</button>{#if videoUrl && !videoId}<span class="dk-held">That is not a YouTube link or an 11-character id.</span>{/if}</div>
						<label class="cert-field"><span>Add a stored lesson</span>
							<select bind:value={lessonSlug}>
								<option value="">Choose a lesson</option>
								{#each cert.lessons as l (l.id)}<option value={l.slug}>{l.title} (lesson:{l.slug})</option>{/each}
							</select>
						</label>
						<div class="cert-actions"><button type="button" class="btn cert-btn secondary" aria-disabled={lessonSlug ? undefined : 'true'} onclick={addLesson} data-testid="cert-engine-add-lesson">Add lesson</button></div>
					</div>

					<h3 class="cert-section-h">Quick checks (ungraded, instant feedback)</h3>
					<ol class="dk-items" data-testid="cert-engine-quick-checks">
						{#each pkg.training.quick_checks as qc, i (i)}
							<li class="dk-item">
								<div class="dk-item-head">
									<span class="dk-item-title">Quick check {i + 1}</span>
									<button type="button" class="btn cert-btn secondary" onclick={() => removeQuickCheck(i)}>Remove</button>
								</div>
								<div class="dk-fields">
									<label class="cert-field"><span>After item</span>
										<select bind:value={qc.after}>
											{#each pkg.training.items as item (trainingKey(item))}<option value={trainingKey(item)}>{item.title}</option>{/each}
										</select>
									</label>
									<label class="cert-field"><span>Right option (0 is the first)</span><input type="number" min="0" bind:value={qc.answer} /></label>
									<label class="cert-field dk-wide"><span>Prompt</span><input type="text" bind:value={qc.prompt} /></label>
									<LinesField label="Options (one a line)" value={qc.options} onchange={(v) => { qc.options = v; edited(); }} rows={3} />
									<label class="cert-field"><span>Explain</span><input type="text" bind:value={qc.explain} /></label>
								</div>
							</li>
						{/each}
					</ol>
					<button type="button" class="btn cert-btn secondary" onclick={addQuickCheck} aria-disabled={pkg.training.items.length ? undefined : 'true'}>Add a quick check</button>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Practice quiz" heading={2} scope={scope('practice')} collapseWhen={true}>
				<section id="practice"><fieldset class="dk-fieldset" disabled={!canEdit}>
					<p class="cert-help">An ungraded self-test, paraphrased from the exam topics. Never a real exam question.</p>
					<ol class="dk-items" data-testid="cert-engine-practice">
						{#each pkg.practice_quiz as q, i (i)}
							<li class="dk-item">
								<div class="dk-item-head">
									<span class="dk-item-title">Question {i + 1}</span>
									<button type="button" class="btn cert-btn secondary" onclick={() => removePractice(i)}>Remove</button>
								</div>
								<div class="dk-fields">
									<label class="cert-field dk-wide"><span>Prompt</span><input type="text" bind:value={q.prompt} /></label>
									<LinesField label="Options (one a line)" value={q.options} onchange={(v) => { q.options = v; edited(); }} rows={3} />
									<label class="cert-field"><span>Right option (0 is the first)</span><input type="number" min="0" bind:value={q.answer} /></label>
									<label class="cert-field dk-wide"><span>Explain</span><input type="text" bind:value={q.explain} /></label>
								</div>
							</li>
						{/each}
					</ol>
					<button type="button" class="btn cert-btn secondary" onclick={addPractice} data-testid="cert-engine-add-practice">Add a practice question</button>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Study guide" heading={2} scope={scope('study')} collapseWhen={true}>
				<section id="study-guide"><fieldset class="dk-fieldset dk-split" disabled={!canEdit}>
					<label class="cert-field"><span>Study guide (markdown)</span><textarea rows="18" bind:value={pkg.study_guide} data-testid="cert-engine-study-guide"></textarea></label>
					<div class="dk-preview cert-prose" aria-label="Preview">
						{#if pkg.study_guide.trim()}<MarkdownText body={pkg.study_guide} />{:else}<p class="dk-empty">The preview shows the study guide as a student reads it.</p>{/if}
					</div>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Common mistakes" heading={2} scope={scope('mistakes')} collapseWhen={true}>
				<section id="common-mistakes"><fieldset class="dk-fieldset" disabled={!canEdit}>
					<ol class="dk-items" data-testid="cert-engine-mistakes">
						{#each pkg.common_mistakes as m, i (i)}
							<li class="dk-item">
								<div class="dk-item-head">
									<span class="dk-item-title">Mistake {i + 1}</span>
									<button type="button" class="btn cert-btn secondary" onclick={() => removeMistake(i)}>Remove</button>
								</div>
								<div class="dk-fields">
									<label class="cert-field"><span>Title</span><input type="text" bind:value={m.title} /></label>
									<label class="cert-field"><span>Warning</span><input type="text" bind:value={m.body} /></label>
								</div>
							</li>
						{/each}
					</ol>
					<button type="button" class="btn cert-btn secondary" onclick={addMistake}>Add a common mistake</button>
				</fieldset></section>
			</Disclosure>

			<Disclosure label="Exam" heading={2} scope={scope('exam')} collapseWhen={true}>
				<section id="exam">
					<fieldset class="dk-fieldset" disabled={!canEdit}>
						<div class="dk-fields">
							<label class="cert-field"><span>Time limit, minutes</span><input type="number" min="1" bind:value={exam.time_limit_minutes} /></label>
							<label class="cert-field"><span>Questions per exam</span><input type="number" min="1" bind:value={exam.questions_per_exam} /></label>
						</div>
						<h3 class="cert-section-h">Topics</h3>
						<ol class="dk-items" data-testid="cert-engine-topics">
							{#each exam.topics as t, i (i)}
								<li class="dk-item">
									<div class="dk-fields dk-topic">
										<label class="cert-field"><span>Id (lowercase, hyphens)</span><input type="text" bind:value={t.id} /></label>
										<label class="cert-field"><span>Name</span><input type="text" bind:value={t.name} /></label>
										<label class="cert-field"><span>Minimum per exam</span><input type="number" min="1" bind:value={t.minimum} /></label>
									</div>
									<button type="button" class="btn cert-btn secondary" onclick={() => removeTopic(i)}>Remove topic</button>
								</li>
							{/each}
						</ol>
						<button type="button" class="btn cert-btn secondary" onclick={addTopic} data-testid="cert-engine-add-topic">Add a topic</button>
					</fieldset>
					<h3 class="cert-section-h">Question pool</h3>
					{#if pool && canEdit}
						<PoolEditor bind:questions={poolRows} {topics} questionsPerExam={exam.questions_per_exam} result={results.savePool ?? null} />
					{:else}
						<p class="dk-empty" data-testid="cert-engine-pool-summary">
							{cert.pool_summary.total} active question{cert.pool_summary.total === 1 ? '' : 's'}{#if Object.keys(cert.pool_summary.by_topic).length}: {Object.entries(cert.pool_summary.by_topic).map(([t, n]) => `${t} ${n}`).join(', ')}{/if}. Only a site admin reads or edits the keys.
						</p>
					{/if}
				</section>
			</Disclosure>

			<Disclosure label="Guided project" heading={2} scope={scope('guided')} collapseWhen={true}>
				<section id="guided-project">
					<fieldset class="dk-fieldset" disabled={!canEdit}><ProjectEditor bind:spec={guided} guided={true} onedit={edited} /></fieldset>
				</section>
			</Disclosure>

			<Disclosure label="Autonomous project" heading={2} scope={scope('autonomous')} collapseWhen={true}>
				<section id="autonomous-project">
					<p class="cert-help">Objective only: no walkthrough, no hints. The student's page states that outside help voids the attempt.</p>
					<fieldset class="dk-fieldset" disabled={!canEdit}><ProjectEditor bind:spec={autonomous} guided={false} onedit={edited} /></fieldset>
				</section>
			</Disclosure>

			<Disclosure label="Checkout" heading={2} scope={scope('checkout')} collapseWhen={true}>
				<section id="checkout">
					<fieldset class="dk-fieldset dk-fields" disabled={!canEdit}>
						<label class="cert-field"><span>Checkout card (markdown: what the checkout demonstrates)</span><textarea rows="8" bind:value={checkout.card}></textarea></label>
						<label class="cert-field"><span>Filming guide (markdown: one continuous unlisted take)</span><textarea rows="8" bind:value={checkout.filming_guide}></textarea></label>
					</fieldset>
				</section>
			</Disclosure>

		{#if canEdit}
			<Disclosure label="Lessons" heading={2} scope={scope('lessons')} collapseWhen={true}>
				<section id="lessons">
					<LessonEditor lessons={cert.lessons} {usedSlugs} saveResult={results.saveLesson ?? null} deleteResult={results.deleteLesson ?? null} />
				</section>
			</Disclosure>
		{/if}

		<Disclosure label="Revisions" heading={2} scope={scope('revisions')} collapseWhen={true}>
			<section id="revisions">
				{#if cert.revisions.length === 0}
					<p class="dk-empty">No revision has been saved yet.</p>
				{:else}
					<ol class="cert-well" data-testid="cert-engine-revisions">
						{#each cert.revisions as r (r.id)}
							<li class="dk-row">
								<div class="dk-row-main">
									<strong>Revision {r.revision}</strong>
									<span class="dk-row-meta">{formatCertDateTime(r.created_at)}{r.created_by ? ` by ${r.created_by}` : ''}</span>
									{#if r.note}<span class="dk-row-note">{r.note}</span>{/if}
									{#if r.id === cert.current_revision_id}<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>Current</span>{/if}
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</Disclosure>
	</div>
</div>

<style>
	.dk-fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.dk-note {
		margin: 0;
		min-width: min(100%, 16rem);
	}
	.dk-problems {
		margin: 0.25rem 0 0;
		padding-left: 1.1rem;
		line-height: 1.45;
	}
	.dk-mono-inline {
		font-family: var(--font-mono);
		text-transform: none;
		letter-spacing: 0.04em;
	}
	.dk-add {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--hairline);
	}
	.dk-sections :global(.disc) {
		margin-bottom: 1rem;
	}
	.dk-sections section {
		padding: 0.5rem 0 0.25rem;
	}
	@media (min-width: 1024px) {
		.dk-topic {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
