<script lang="ts">
	import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from '$lib/gemini-models';

	const MAX_CONCURRENT = 3;
	const MAX_FILE_SIZE = 20 * 1024 * 1024;

	interface FileItem {
		id: string;
		file: File;
		preview: string;
		status: 'uploading' | 'complete' | 'duplicate' | 'cancelled' | 'error';
		error?: string;
		document?: { _id: string; status: string };
	}

	interface FileError {
		file: string;
		error: string;
	}

	let files = $state<FileItem[]>([]);
	let errors = $state<FileError[]>([]);
	let selectedModel = $state(DEFAULT_GEMINI_MODEL);

	let inputEl: HTMLInputElement;
	let mounted = true;
	let abortController = new AbortController();
	let activeUploads = 0;
	let uploadQueue: FileItem[] = [];

	$effect(() => {
		return () => {
			mounted = false;
			files.forEach((f) => {
				if (f.preview) URL.revokeObjectURL(f.preview);
			});
			abortController.abort();
		};
	});

	function drainQueue() {
		while (uploadQueue.length > 0 && activeUploads < MAX_CONCURRENT) {
			const item = uploadQueue.shift()!;
			activeUploads++;
			uploadSingleFile(item).finally(() => {
				activeUploads--;
				drainQueue();
			});
		}
	}

	function addFiles(newFiles: File[]) {
		const valid = newFiles.filter((f) => f.size <= MAX_FILE_SIZE);
		const oversized = newFiles.filter((f) => f.size > MAX_FILE_SIZE);

		if (oversized.length > 0) {
			errors = [
				...errors,
				...oversized.map((f) => ({
					file: f.name,
					error: `Too large (${(f.size / 1024 / 1024).toFixed(1)}MB, max 20MB)`
				}))
			];
		}

		if (valid.length === 0) return;

		const fileItems: FileItem[] = valid.map((file, i) => ({
			id: `${Date.now()}-${i}`,
			file,
			preview: URL.createObjectURL(file),
			status: 'uploading'
		}));

		files = [...files, ...fileItems];
		uploadQueue.push(...fileItems);
		drainQueue();
	}

	async function uploadSingleFile(item: FileItem) {
		if (!mounted) return;

		try {
			const formData = new FormData();
			formData.append('file', item.file);
			formData.append('model', selectedModel);

			const res = await fetch('/api/drop', {
				method: 'POST',
				body: formData,
				signal: abortController.signal
			});

			if (!res.ok) {
				const err = (await res.json()) as { error?: string };
				throw new Error(err.error || 'Upload failed');
			}

			const data = (await res.json()) as {
				duplicate?: boolean;
				document?: { _id: string; status: string };
			};
			if (!mounted) return;

			files = files.map((f) => {
				if (f.id !== item.id) return f;
				return data.duplicate
					? { ...f, status: 'duplicate' as const, document: data.document }
					: { ...f, status: 'complete' as const, document: data.document };
			});
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			if (mounted) {
				const msg = (err as Error).message;
				files = files.map((f) =>
					f.id === item.id ? { ...f, status: 'error' as const, error: msg } : f
				);
				errors = [...errors, { file: item.file.name, error: msg }];
			}
		}
	}

	function cancelUploads() {
		uploadQueue = [];
		abortController.abort();
		abortController = new AbortController();
		activeUploads = 0;
		files = files.map((f) =>
			f.status === 'uploading' ? { ...f, status: 'cancelled' as const } : f
		);
	}

	function clearCompleted() {
		files = files.filter((f) => {
			const done = ['complete', 'cancelled', 'duplicate'].includes(f.status);
			if (done && f.preview) URL.revokeObjectURL(f.preview);
			return !done;
		});
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		addFiles(Array.from(input.files ?? []));
		input.value = '';
	}

	const uploadingCount = $derived(files.filter((f) => f.status === 'uploading').length);
	const completeCount = $derived(
		files.filter((f) => f.status === 'complete' || f.status === 'duplicate').length
	);
	const clearableCount = $derived(
		files.filter((f) => ['complete', 'cancelled', 'duplicate'].includes(f.status)).length
	);
</script>

<svelte:head>
	<title>Upload — Asset Encoder</title>
</svelte:head>

<div class="upload">
	<input
		bind:this={inputEl}
		type="file"
		accept="image/jpeg,image/png,image/webp,image/gif"
		multiple
		onchange={handleFileSelect}
		class="file-input"
	/>

	<div class="controls">
		<button type="button" onclick={() => inputEl?.click()}>Select files</button>
		<span class="hint">JPEG, PNG, WebP, GIF — 20MB max</span>
	</div>

	<div class="controls">
		<label class="model-label">
			Model
			<select bind:value={selectedModel}>
				{#each GEMINI_MODELS as m}
					<option value={m.id}>{m.label}</option>
				{/each}
			</select>
		</label>
	</div>

	<!-- File list -->
	{#if files.length > 0}
		<div class="files-status">
			<span>
				{files.length} image{files.length !== 1 ? 's' : ''}
				{#if uploadingCount > 0} — uploading {completeCount} of {files.length}{/if}
			</span>
			{#if uploadingCount > 0}
				<button type="button" onclick={cancelUploads}>Cancel</button>
			{/if}
			{#if clearableCount > 0}
				<button type="button" onclick={clearCompleted}>Clear finished</button>
			{/if}
		</div>

		<div class="file-list">
			{#each files as item (item.id)}
				<div
					class="file-row"
					class:is-uploading={item.status === 'uploading'}
					class:is-done={item.status === 'complete' || item.status === 'duplicate'}
					class:is-cancelled={item.status === 'cancelled'}
				>
					<img src={item.preview} alt="" class="file-thumb" />
					<span class="file-name">{item.file.name}</span>
					<span class="file-status-text">
						{#if item.status === 'uploading'}Uploading
						{:else if item.status === 'complete'}Analyzing
						{:else if item.status === 'duplicate'}Duplicate
						{:else if item.status === 'cancelled'}Cancelled
						{:else if item.status === 'error'}{item.error}
						{/if}
					</span>
				</div>
			{/each}
		</div>

		{#if completeCount > 0 && uploadingCount === 0}
			<div class="review-link">
				<a href="/review">View in Review</a>
			</div>
		{/if}
	{/if}

	<!-- Errors -->
	{#if errors.length > 0}
		<div class="error-list">
			{#each errors as e}
				<p>{e.file} — {e.error}</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.upload {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--grid-gutter);
	}

	.file-input {
		display: none;
	}

	/* Controls */
	.controls {
		grid-column: 2 / 7;
		display: flex;
		gap: var(--space-lg);
		align-items: baseline;
	}

	.hint {
		opacity: 0.3;
	}

	.model-label {
		display: flex;
		gap: var(--grid-gutter);
		align-items: baseline;
	}

	.model-label select {
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		text-decoration: underline;
	}

	.model-label select:hover {
		text-decoration: none;
	}

	/* File status */
	.files-status {
		grid-column: 2 / 10;
		display: flex;
		gap: var(--space-lg);
		align-items: baseline;
	}

	/* File list */
	.file-list {
		grid-column: 2 / 10;
		display: grid;
		row-gap: var(--space-md);
	}

	.file-row {
		display: grid;
		grid-template-columns: var(--space-xl) 1fr auto;
		column-gap: var(--grid-gutter);
		align-items: center;
	}

	.file-row.is-uploading {
		opacity: 0.4;
	}

	.file-row.is-done {
		opacity: 0.6;
	}

	.file-row.is-cancelled {
		opacity: 0.3;
	}

	.file-thumb {
		width: var(--space-xl);
		height: var(--space-xl);
		object-fit: cover;
	}

	.file-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Review link */
	.review-link {
		grid-column: 2 / 5;
	}

	/* Errors */
	.error-list {
		grid-column: 2 / 7;
		margin-top: var(--space-lg);
	}

	@media (max-width: 768px) {
		.controls,
		.files-status,
		.file-list,
		.review-link,
		.error-list {
			grid-column: 1 / -1;
		}
	}
</style>
