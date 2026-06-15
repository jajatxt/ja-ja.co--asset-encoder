<script lang="ts">
	import { enhance } from '$app/forms';
	type AccessMode = 'full' | 'limited';
	type AccessScopeKind = 'all' | 'projects' | 'writing' | 'media' | 'system' | 'selected-paths' | 'custom';
	type AllowedScopeValue = 'all' | 'projects' | 'writing' | 'media' | 'system' | 'selected-paths';

	interface AccessLinkRow {
		id: number;
		label: string | null;
		url?: string | null;
		mode?: AccessMode | string | null;
		accessMode?: AccessMode | string | null;
		maxRedemptions: number;
		redeemedCount: number;
		remainingRedemptions: number;
		maxUniquePaths: number | null;
		scopeKind: AccessScopeKind;
		scopePaths: string[];
		scopePrefixes: string[];
		ttlMinutes: number | null;
		issuedCycle: string | null;
		expiresAt: number | null;
		createdAt: number;
		disabledAt: number | null;
		lastRedeemedAt: number | null;
		activeSessionExpiresAt: number | null;
	}

	interface FormState {
		createdUrl?: string;
		revokedId?: number;
		error?: string;
		label?: string;
		mode?: AccessMode;
		maxRedemptions?: number;
		maxUniquePaths?: number;
		allowedScopes?: AllowedScopeValue[];
		scopePaths?: string[];
		accessDurationMinutes?: number;
		linkExpiresInMinutes?: number;
		bindToCurrentCycle?: boolean;
	}

	let { data, form } = $props<{
		data: {
			frontendOrigin: string;
			accessLinkBasePath: string;
			sharedDbConfigured: boolean;
			accessLinks: AccessLinkRow[];
			pageOptions: { title: string; path: string; section: string }[];
			loadError: string | null;
			filters: { access: string };
			initial: FormState;
		};
		form?: FormState;
	}>();

	const modes: { value: AccessMode; label: string; description: string }[] = [
		{ value: 'full', label: 'Unlimited pages', description: 'No page-view limit inside the allowed scope' },
		{ value: 'limited', label: 'Limited pages', description: 'A set number of unique pages inside the allowed scope' }
	];

	const scopes: { value: AllowedScopeValue; label: string; description?: string }[] = [
		{ value: 'all', label: 'All pages' },
		{ value: 'projects', label: 'Projects' },
		{ value: 'writing', label: 'Writing' },
		{ value: 'media', label: 'Media', description: 'Video + audio' },
		{ value: 'system', label: 'System', description: 'All /s tools and rooms' },
		{ value: 'selected-paths', label: 'Selected pages' }
	];

	const accessWindowOptions = [
		{ value: '60', label: '1 hour' },
		{ value: '1440', label: '1 day' },
		{ value: '10080', label: '1 week' },
		{ value: '43200', label: '30 days' },
		{ value: '129600', label: '90 days' },
		{ value: '525600', label: '1 year' },
		{ value: 'current-cycle', label: 'Current cycle' }
	];

	const linkExpiryOptions = accessWindowOptions.filter((option) => option.value !== 'current-cycle');

	let modeValue = $state<AccessMode>('limited');
	let scopeValues = $state<AllowedScopeValue[]>(['all']);

	$effect(() => {
		modeValue = form?.mode ?? data.initial.mode ?? 'limited';
		scopeValues = form?.allowedScopes ?? data.initial.allowedScopes ?? ['all'];
	});

	function hasScope(value: AllowedScopeValue) {
		return scopeValues.includes(value);
	}

	function setScope(value: AllowedScopeValue, checked: boolean) {
		if (value === 'all') {
			scopeValues = checked ? ['all'] : [];
			return;
		}
		const withoutAll = scopeValues.filter((scope) => scope !== 'all' && scope !== value);
		scopeValues = checked ? [...withoutAll, value] : withoutAll;
	}

	function formatDate(value: number | null) {
		if (!value) return '—';
		const date = new Date(value);
		const yy = String(date.getFullYear()).slice(-2);
		const mm = String(date.getMonth() + 1).padStart(2, '0');
		const dd = String(date.getDate()).padStart(2, '0');
		return `${mm}.${dd}.${yy}`;
	}

	function normalizeMode(link: AccessLinkRow): AccessMode {
		const mode = link.accessMode ?? link.mode;
		if (mode === 'full' || mode === 'limited') return mode;
		if (link.maxUniquePaths === null || link.maxUniquePaths <= 0) return 'full';
		return 'limited';
	}

	function describeSelectedCount(count: number) {
		return count === 1 ? '1 selected page' : `${count} selected pages`;
	}

	function describeScope(link: AccessLinkRow) {
		if (!link.scopeKind || link.scopeKind === 'all') return 'all pages';
		if (link.scopeKind === 'projects') return 'projects';
		if (link.scopeKind === 'writing') return 'writing';
		if (link.scopeKind === 'media') return 'media';
		if (link.scopeKind === 'system') return 'system';
		if (link.scopeKind === 'selected-paths') return describeSelectedCount(link.scopePaths?.length ?? 0);

		const prefixes = new Set(link.scopePrefixes ?? []);
		const parts: string[] = [];
		if (prefixes.has('projects')) parts.push('projects');
		if (prefixes.has('writing')) parts.push('writing');
		if (prefixes.has('video') || prefixes.has('audio')) parts.push('media');
		if (prefixes.has('s')) parts.push('system');
		if (link.scopePaths?.length) parts.push(describeSelectedCount(link.scopePaths.length));
		return parts.length ? parts.join(' + ') : 'custom scope';
	}

	function describeAccess(link: AccessLinkRow) {
		const mode = normalizeMode(link);
		const scope = describeScope(link);
		if (mode === 'full') return `unlimited pages · ${scope}`;
		return `${link.maxUniquePaths ?? 0}-page budget · ${scope}`;
	}

	function describeDuration(minutes: number | null) {
		if (!minutes) return '—';
		if (minutes % 1440 === 0) return `${minutes / 1440}d`;
		if (minutes % 60 === 0) return `${minutes / 60}h`;
		return `${minutes}m`;
	}

	function describeStatus(link: AccessLinkRow) {
		const hasActiveSession = Boolean(link.activeSessionExpiresAt && link.activeSessionExpiresAt > Date.now());
		if (link.disabledAt) return `revoked ${formatDate(link.disabledAt)}`;
		if (!hasActiveSession && link.expiresAt && link.expiresAt < Date.now()) return `expired ${formatDate(link.expiresAt)}`;
		if (!hasActiveSession && link.remainingRedemptions <= 0) return 'used';
		return 'active';
	}
</script>

<section class="access-links">
	<div class="intro">
		<h1>Access Links</h1>
		<p>Create access grants for {data.frontendOrigin}.</p>
	</div>

	{#if !data.sharedDbConfigured}
		<p class="notice">Shared DB binding is not configured in this local dev server. Access links cannot be created or revoked until the app runs with a Cloudflare D1 binding named DB.</p>
	{/if}

	<form method="POST" action="?/create" use:enhance class="link-form">
		<label>
			<span>Label</span>
			<input name="label" value={form?.label ?? data.initial.label ?? ''} placeholder="request / professor intro" />
		</label>

		<div class="mode-field">
			<p>Page budget</p>
			<div class="mode-options">
				{#each modes as mode}
					<label class="mode-option">
						<input name="mode" type="radio" value={mode.value} bind:group={modeValue} />
						<span>{mode.label}</span>
						<span>{mode.description}</span>
					</label>
				{/each}
			</div>
		</div>

			<div class="scope-field">
			<div>
				<p>Allowed scope</p>
				<p class="field-help">All pages is exclusive. Otherwise choose any combination.</p>
			</div>
			<div class="scope-options">
				{#each scopes as scope}
					<label class="scope-option">
						<input
							name="allowedScopes"
							type="checkbox"
							value={scope.value}
							checked={hasScope(scope.value)}
							onchange={(event) => setScope(scope.value, event.currentTarget.checked)}
						/>
						<span>{scope.label}</span>
						{#if scope.description}<span>{scope.description}</span>{/if}
					</label>
				{/each}
			</div>
		</div>

		{#if hasScope('selected-paths')}
			<div class="selected-pages-field">
				<div>
					<p>Selected pages</p>
					<p class="field-help">Check one or more pages.</p>
				</div>
				<div class="checkbox-list">
					{#each data.pageOptions as option}
						<label class="checkbox-option">
							<input name="scopePaths" type="checkbox" value={option.path} checked={form?.scopePaths?.includes(option.path)} />
							<span>{option.title} · {option.section}</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}

		<label class:disabled={modeValue !== 'limited'}>
			<span>Unique pages</span>
			<input name="maxUniquePaths" type="number" min="1" value={form?.maxUniquePaths ?? 5} disabled={modeValue !== 'limited'} />
		</label>

		<label>
			<span>Uses</span>
			<input name="maxRedemptions" type="number" min="1" value={form?.maxRedemptions ?? 1} />
		</label>

		<label>
			<span>Access lasts</span>
			<select name="accessWindow" value={form?.bindToCurrentCycle ? 'current-cycle' : String(form?.accessDurationMinutes ?? 10080)}>
				{#each accessWindowOptions as option}<option value={option.value}>{option.label}</option>{/each}
			</select>
		</label>

		<label>
			<span>Link expires if unused</span>
			<select name="linkExpiresInMinutes" value={form?.linkExpiresInMinutes ?? 10080}>
				{#each linkExpiryOptions as option}<option value={option.value}>{option.label}</option>{/each}
			</select>
		</label>

		<button disabled={!data.sharedDbConfigured}>Create link</button>
	</form>

	{#if form?.createdUrl}
		<div class="result">
			<p>Created</p>
			<p>{form.createdUrl}</p>
		</div>
	{:else if form?.revokedId}
		<div class="result">
			<p>Revoked</p>
			<p>Access link {form.revokedId}</p>
		</div>
	{/if}

	{#if form?.error || data.loadError}
		<p class="error">{form?.error || data.loadError}</p>
	{/if}

	<div class="recent">
		<div class="recent-heading">
			<h2>Recent</h2>
			<p>Shared D1 · {data.accessLinkBasePath}</p>
			<nav class="access-filters" aria-label="Access link filters">
				<a href="/access-links" class:active={!data.filters.access}>All</a>
				<a href="/access-links?access=active" class:active={data.filters.access === 'active'}>active</a>
				<a href="/access-links?access=past" class:active={data.filters.access === 'past'}>past</a>
			</nav>
		</div>
		{#if data.accessLinks.length === 0}
			<p class="empty">No access links.</p>
		{:else}
			{#each data.accessLinks as link}
				<div class="recent-row" class:revoked={Boolean(link.disabledAt)}>
					<p>{link.label || `access-${link.id}`}</p>
					<div class="recent-detail">
						<p>{describeStatus(link)} · {describeAccess(link)} · {link.redeemedCount}/{link.maxRedemptions} used · {describeDuration(link.ttlMinutes)} · expires {formatDate(link.expiresAt)}</p>
						{#if link.url}<p>{link.url}</p>{/if}
						{#if !link.disabledAt}
							<form method="POST" action="?/revoke" use:enhance>
								<input type="hidden" name="id" value={link.id} />
								<button disabled={!data.sharedDbConfigured}>Revoke</button>
							</form>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</section>

<style>
	.access-links {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--grid-gutter);
	}

	.intro,
	.link-form,
	.notice,
	.result,
	.error {
		grid-column: 2 / 7;
	}

	.recent {
		grid-column: 8 / 13;
		grid-row: 1 / span 6;
	}

	h1,
	h2,
	p {
		margin: 0;
		font: inherit;
	}

	.intro,
	.link-form,
	.recent,
	.mode-options,
	.scope-options {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	label,
	.mode-field,
	.scope-field,
	.selected-pages-field,
	.recent-heading,
	.recent-row,
	.result {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--grid-gutter);
	}

	.mode-options,
	.scope-options,
	.checkbox-list {
		grid-column: 2;
	}

	.mode-option,
	.scope-option {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: var(--grid-gutter);
		row-gap: var(--space-xs);
	}

	.mode-option span:last-child,
	.scope-option span:last-child {
		grid-column: 2;
	}

	.checkbox-list {
		display: grid;
		row-gap: var(--space-xs);
		max-height: 12rem;
		overflow: auto;
		scrollbar-width: none;
	}

	.checkbox-list::-webkit-scrollbar {
		display: none;
	}

	.checkbox-option {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--grid-gutter);
	}

	.checkbox-option span {
		opacity: 1;
	}

	.recent-detail,
	.access-filters {
		display: grid;
		row-gap: var(--space-xs);
	}

	.access-filters a.active {
		text-decoration: none;
		cursor: default;
	}

	.revoked {
		opacity: 0.6;
	}

	input,
	select,
	button {
		font: inherit;
		color: inherit;
		background: transparent;
		border: 0;
		padding: 0;
	}

	input:not([type='radio']):not([type='checkbox']),
	select {
		width: 100%;
		border-bottom: 1px solid currentColor;
	}

	.link-form > label > input:not([type='radio']):not([type='checkbox']),
	.link-form > label > select {
		grid-column: 2;
	}

	button {
		width: fit-content;
		text-align: left;
		text-decoration: underline;
		cursor: pointer;
	}

	button:hover {
		text-decoration: none;
	}

	button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.disabled {
		opacity: 0.35;
	}

	.notice,
	.result,
	.error,
	.empty,
	.intro p,
	.recent-heading p,
	.recent-row p + p,
	label span,
	.mode-field > p,
	.scope-field > div:first-child,
	.selected-pages-field > div:first-child,
	.mode-option span:last-child,
	.scope-option span:last-child {
		opacity: 0.6;
		overflow-wrap: anywhere;
	}

	.mode-option span:first-of-type,
	.scope-option span:first-of-type,
	.checkbox-option span {
		opacity: 1;
	}

	@media (max-width: 768px) {
		.intro,
		.link-form,
		.notice,
		.result,
		.error,
		.recent {
			grid-column: 1 / -1;
			grid-row: auto;
		}

		label,
		.mode-field,
		.scope-field,
		.selected-pages-field,
		.recent-heading,
		.recent-row,
		.result,
		.mode-options,
		.scope-options,
		.checkbox-list {
			grid-template-columns: 1fr;
			grid-column: auto;
		}

		.link-form > label > input:not([type='radio']):not([type='checkbox']),
		.link-form > label > select {
			grid-column: auto;
		}
	}
</style>
