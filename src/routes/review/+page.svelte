<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface JjcdsAlt {
		deweyCode: string;
		deweyCategory: string;
		confidence: number;
		reasoning?: string;
	}

	interface CuratedAsset {
		_id: string;
		status: 'pending' | 'draft' | 'error';
		title?: string;
		deweyCode?: string;
		deweyCategory?: string;
		description?: string;
		aiConfidence?: number;
		originalFilename?: string;
		errorMessage?: string;
		aiSuggestions?: {
			alternatives?: JjcdsAlt[];
			usageMetadata?: {
				promptTokens: number;
				candidatesTokens: number;
				totalTokens: number;
				costUsd: number;
			};
			analyzedAt?: string;
			failedAt?: string;
			errorType?: string;
		};
		image?: { asset?: { _id: string; url: string } };
		_createdAt: string;
	}

	interface EditState {
		title: string;
		deweyCode: string;
		deweyCategory: string;
		description: string;
	}

	interface Toast {
		id: number;
		message: string;
	}

	const STALE_THRESHOLD_MS = 2 * 60 * 1000;

	interface SanityCategory {
		_id: string;
		number: number;
		name: string;
	}

	let { data } = $props();

	const categories = $derived(data.categories as SanityCategory[]);

	// Optimistic state
	let removedIds = $state(new Set<string>());
	let localUpdates = $state<Record<string, Partial<CuratedAsset>>>({});

	// Merge server data with optimistic state
	const drafts = $derived(
		(data.drafts as CuratedAsset[])
			.filter((d) => !removedIds.has(d._id))
			.map((d) => (localUpdates[d._id] ? { ...d, ...localUpdates[d._id] } : d))
	);

	// Sync optimistic state when server data refreshes
	$effect(() => {
		const serverIds = new Set((data.drafts as CuratedAsset[]).map((d) => d._id));

		let nextRemoved = new Set(removedIds);
		let removedChanged = false;
		for (const id of nextRemoved) {
			if (!serverIds.has(id)) {
				nextRemoved.delete(id);
				removedChanged = true;
			}
		}
		if (removedChanged) removedIds = nextRemoved;

		let nextUpdates = { ...localUpdates };
		let updatesChanged = false;
		for (const id of Object.keys(nextUpdates)) {
			const serverItem = (data.drafts as CuratedAsset[]).find((d) => d._id === id);
			if (!serverItem) {
				delete nextUpdates[id];
				updatesChanged = true;
			} else if (nextUpdates[id].status && serverItem.status === nextUpdates[id].status) {
				delete nextUpdates[id];
				updatesChanged = true;
			}
		}
		if (updatesChanged) localUpdates = nextUpdates;
	});

	let selectedId = $state<string | null>(null);
	const selected = $derived(
		selectedId ? drafts.find((d) => d._id === selectedId) ?? null : null
	);
	let editing = $state<EditState | null>(null);
	let saving = $state(false);
	let retrying = $state<string | null>(null);
	let toasts = $state<Toast[]>([]);



	const pendingItems = $derived(drafts.filter((d) => d.status === 'pending'));
	const draftItems = $derived(drafts.filter((d) => d.status === 'draft'));
	const errorItems = $derived(drafts.filter((d) => d.status === 'error'));


	// Poll while pending items exist
	$effect(() => {
		if (pendingItems.length === 0) return;
		const interval = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(interval);
	});

	function addToast(message: string) {
		const id = Date.now() + Math.random();
		toasts = [...toasts, { id, message }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 4000);
	}

	function removeToast(id: number) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	async function handleApprove(draft: CuratedAsset) {
		saving = true;
		try {
			const res = await fetch('/api/approve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentId: draft._id, updates: editing })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as { message?: string }).message || 'Failed to approve');
			}
			const result = (await res.json()) as {
				encodedAsset?: { deweyCode?: string };
			};
			removedIds = new Set([...removedIds, draft._id]);
			selectedId = null;
			editing = null;
			addToast(`Encoded as ${result.encodedAsset?.deweyCode ?? 'asset'}`);
			invalidateAll();
		} catch (err) {
			addToast((err as Error).message);
		} finally {
			saving = false;
		}
	}

	async function handleDelete(draft: CuratedAsset) {
		if (!confirm('Delete this image?')) return;
		saving = true;
		try {
			const res = await fetch('/api/delete', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentId: draft._id })
			});
			if (!res.ok) throw new Error('Failed to delete');
			removedIds = new Set([...removedIds, draft._id]);
			selectedId = null;
			editing = null;
			addToast('Deleted');
			invalidateAll();
		} catch (err) {
			addToast((err as Error).message);
		} finally {
			saving = false;
		}
	}

	async function handleRetry(draft: CuratedAsset) {
		retrying = draft._id;
		try {
			const res = await fetch('/api/retry', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ documentId: draft._id })
			});
			if (!res.ok) throw new Error('Retry failed');
			localUpdates = {
				...localUpdates,
				[draft._id]: { status: 'pending', errorMessage: undefined }
			};
			selectedId = null;
			editing = null;
			addToast('Retrying');
			invalidateAll();
		} catch (err) {
			addToast((err as Error).message);
		} finally {
			retrying = null;
		}
	}

	function openEditor(draft: CuratedAsset) {
		if (draft.status === 'pending') return;
		selectedId = draft._id;
		editing = {
			title: draft.title ?? '',
			deweyCode: draft.deweyCode ?? '',
			deweyCategory: draft.deweyCategory ?? '',
			description: draft.description ?? ''
		};
	}

	function closeEditor() {
		selectedId = null;
		editing = null;
	}

	function getImageUrl(draft: CuratedAsset, width?: number) {
		const url = draft.image?.asset?.url;
		if (!url) return null;
		if (!width) return url;
		return `${url}?w=${width}&fit=max&auto=format`;
	}

	function isStale(draft: CuratedAsset) {
		return (
			draft.status === 'pending' &&
			Date.now() - new Date(draft._createdAt).getTime() > STALE_THRESHOLD_MS
		);
	}

	function selectAlt(alt: JjcdsAlt) {
		if (!editing) return;
		editing = { ...editing, deweyCode: alt.deweyCode, deweyCategory: alt.deweyCategory };
	}
</script>

<svelte:head>
	<title>Review — Asset Encoder</title>
</svelte:head>

{#if drafts.length === 0}
	<div class="review-empty">
		<p>No items to review.</p>
		<p><a href="/">Upload images</a> to get started.</p>
		{#if data.publishedCount > 0}
			<p>{data.publishedCount} encoded</p>
		{/if}
	</div>
{:else}
	<div class="review">
		<!-- Status -->
		<div class="status-bar">
			<span class="status-counts">
				{#if pendingItems.length > 0}{pendingItems.length} analyzing{/if}
				{#if pendingItems.length > 0 && draftItems.length > 0} · {/if}
				{#if draftItems.length > 0}{draftItems.length} ready{/if}
				{#if (pendingItems.length > 0 || draftItems.length > 0) && errorItems.length > 0} · {/if}
				{#if errorItems.length > 0}{errorItems.length} failed{/if}
				{#if data.publishedCount > 0} · {data.publishedCount} encoded{/if}
			</span>
		</div>

		<!-- Grid -->
		<div class="image-grid">
			{#each drafts as draft (draft._id)}
				{@const stale = isStale(draft)}
				<div
					class="grid-item"
					class:is-selected={selectedId === draft._id}
					class:has-selection={selectedId !== null}
					class:is-pending={draft.status === 'pending' && !stale}
					class:is-stale={stale}
					role="button"
					tabindex="0"
					onclick={() => openEditor(draft)}
					onkeydown={(e) => e.key === 'Enter' && openEditor(draft)}
				>
					{#if getImageUrl(draft, 200)}
						<img
							src={getImageUrl(draft, 200)!}
							alt={draft.title ?? draft.originalFilename ?? ''}
							class="grid-image"
						/>
					{/if}
					<div class="grid-meta">
						{#if draft.status === 'pending' && !stale}
							<span class="analyzing">Analyzing</span>
						{:else if stale}
							<span>Stalled</span>
							<span class="inline-actions">
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										handleRetry(draft);
									}}
									disabled={retrying === draft._id}
								>retry</button>
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										handleDelete(draft);
									}}
								>delete</button>
							</span>
						{:else if draft.status === 'error'}
							<span>Failed</span>
							<span class="inline-actions">
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										handleRetry(draft);
									}}
									disabled={retrying === draft._id}
								>retry</button>
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										handleDelete(draft);
									}}
								>delete</button>
							</span>
						{:else if draft.status === 'draft'}
							<span>{draft.deweyCode}</span>
							<span class="grid-title">{draft.title ?? 'Untitled'}</span>
							{#if draft.aiConfidence != null}
								<span class:low-confidence={(draft.aiConfidence ?? 0) < 70}>
									{draft.aiConfidence}%
								</span>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Editor -->
		{#if selected && editing && selected.status === 'draft'}
			<div class="editor">
				<div class="editor-header">
					<span>Edit</span>
					<button type="button" onclick={closeEditor}>Close</button>
				</div>

				{#if getImageUrl(selected, 600)}
					<img
						src={getImageUrl(selected, 600)!}
						alt={selected.title ?? ''}
						class="editor-image"
					/>
				{/if}

				{#if selected.aiSuggestions?.usageMetadata}
					<p class="editor-cost">
						${selected.aiSuggestions.usageMetadata.costUsd?.toFixed(6) ?? '—'}
						({selected.aiSuggestions.usageMetadata.totalTokens?.toLocaleString() ?? '?'} tokens)
					</p>
				{/if}

				<div class="editor-fields">
					<label>
						Title
						<input type="text" bind:value={editing.title} />
					</label>

					<label>
						Code
						<input type="text" bind:value={editing.deweyCode} placeholder="e.g. 130" />
					</label>

					<label>
						Category
						<select
							value={editing.deweyCode}
							onchange={(e) => {
								const code = (e.target as HTMLSelectElement).value;
								const cat = categories.find((c) => String(c.number) === code);
								if (editing)
									editing = {
										...editing,
										deweyCode: code,
										deweyCategory: cat?.name ?? editing.deweyCategory
									};
							}}
						>
							<option value="">—</option>
							{#each categories as cat}
								<option value={String(cat.number)}>
									{cat.number} – {cat.name}
								</option>
							{/each}
						</select>
					</label>

					{#if selected.aiSuggestions?.alternatives?.length}
						<div class="alternatives">
							<span class="alternatives-label">Alternatives</span>
							{#each selected.aiSuggestions.alternatives as alt}
								<button
									type="button"
									class="alt-option"
									class:alt-active={editing.deweyCode === alt.deweyCode}
									onclick={() => selectAlt(alt)}
									title={alt.reasoning}
								>
									{alt.deweyCode} – {alt.deweyCategory} ({alt.confidence}%)
								</button>
							{/each}
						</div>
					{/if}

					<label>
						Description
						<textarea bind:value={editing.description} rows={3}></textarea>
					</label>

					{#if (selected.aiConfidence ?? 100) < 70}
						<p class="low-confidence">
							Low confidence ({selected.aiConfidence}%) — verify classification
						</p>
					{/if}
				</div>

				<div class="editor-actions">
					<button
						type="button"
						onclick={() => handleDelete(selected!)}
						disabled={saving}
					>Delete</button>
					<button
						type="button"
						onclick={() => handleApprove(selected!)}
						disabled={saving}
					>{saving ? 'Saving...' : 'Approve'}</button>
				</div>
			</div>
		{/if}

		<!-- Error detail -->
		{#if selected && selected.status === 'error'}
			<div class="editor">
				<div class="editor-header">
					<span>Failed</span>
					<button type="button" onclick={closeEditor}>Close</button>
				</div>

				{#if getImageUrl(selected, 600)}
					<img
						src={getImageUrl(selected, 600)!}
						alt={selected.originalFilename ?? ''}
						class="editor-image"
					/>
				{/if}

				<p>{selected.errorMessage ?? 'Unknown error'}</p>
				<p class="editor-filename">{selected.originalFilename}</p>

				<div class="editor-actions">
					<button
						type="button"
						onclick={() => handleDelete(selected!)}
						disabled={saving || retrying === selected._id}
					>{saving ? 'Deleting...' : 'Delete'}</button>
					<button
						type="button"
						onclick={() => handleRetry(selected!)}
						disabled={retrying === selected._id}
					>{retrying === selected._id ? 'Retrying...' : 'Retry'}</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- Toasts -->
{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<span class="toast" onclick={() => removeToast(toast.id)}>{toast.message}</span>
		{/each}
	</div>
{/if}

<style>
	/* Empty state */
	.review-empty {
		grid-column: 2 / 7;
		display: grid;
		row-gap: var(--space-sm);
		padding: var(--space-xl) 0;
	}

	/* Main layout — subgrid from parent */
	.review {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--grid-gutter);
	}

	/* Status bar */
	.status-bar {
		grid-column: 2 / -1;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-lg);
	}

	/* Image grid — subgrid inherits parent columns 2–10 */
	.image-grid {
		grid-column: 2 / 10;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--grid-gutter);
		align-content: start;
		align-items: end;
	}

	.grid-item {
		cursor: pointer;
		min-width: 0;
	}

	.grid-item.is-pending {
		opacity: 0.3;
		cursor: default;
	}

	.grid-item.has-selection:not(.is-selected) {
		opacity: 0.4;
	}



	.grid-item.is-stale {
		opacity: 0.5;
	}

	.grid-image {
		width: 100%;
		display: block;
	}

	.grid-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin-top: var(--space-xs);
	}

	.grid-title {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.analyzing {
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.2;
		}
	}

	.inline-actions {
		display: flex;
		gap: var(--space-sm);
	}

	/* Editor */
	.editor {
		grid-column: 10 / -1;
		grid-row: 2;
		position: sticky;
		top: var(--space-xl);
		align-self: start;
		display: grid;
		row-gap: var(--space-md);
		min-width: 0;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.editor-image {
		width: 100%;
		display: block;
	}

	/* Form */
	.editor-fields {
		display: grid;
		row-gap: var(--space-md);
	}

	.editor-fields label {
		display: grid;
		row-gap: var(--space-xs);
	}

	.editor-fields input,
	.editor-fields textarea {
		padding: var(--space-xs) 0;
	}

	.editor-fields select {
		padding: var(--space-xs) 0;
		cursor: pointer;
	}

	.editor-fields textarea {
		resize: vertical;
	}

	/* Alternatives */
	.alternatives {
		display: grid;
		row-gap: var(--space-xs);
	}

	.alt-option {
		text-align: left;
	}

	.alt-option.alt-active {
		text-decoration: none;
	}

	/* Actions */
	.editor-actions {
		display: flex;
		gap: var(--space-lg);
	}

	/* Toast */
	.toast-container {
		position: fixed;
		bottom: var(--space-xl);
		right: var(--page-padding);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		cursor: pointer;
		animation: fade-in 0.2s;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Mobile */
	@media (max-width: 768px) {
		.review-empty {
			grid-column: 1 / -1;
		}

		.status-bar {
			grid-column: 1 / -1;
			flex-direction: column;
			gap: var(--space-sm);
		}

		.image-grid {
			grid-column: 1 / -1;
		}

		.editor {
			grid-column: 1 / -1;
			grid-row: auto;
			position: static;
			margin-top: var(--space-lg);
		}
	}
</style>
