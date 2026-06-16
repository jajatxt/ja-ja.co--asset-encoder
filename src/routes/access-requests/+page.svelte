<script lang="ts">
	import { enhance } from '$app/forms';

	type AccessScopeKind = 'all' | 'projects' | 'writing' | 'media' | 'system' | 'selected-paths' | 'custom';
	type AllowedScopeValue = 'all' | 'projects' | 'writing' | 'media' | 'system' | 'reading-room' | 'selected-paths';

	interface AccessRequestRow {
		id: number;
		name: string | null;
		email: string;
		role: string;
		reason: string;
		note: string | null;
		status: string;
		source_path: string | null;
		created_at: number;
		updated_at: number;
		reviewed_at: number | null;
		reviewed_by: string | null;
		admin_note: string | null;
	}

	interface AccessLinkRow {
		id: number;
		label: string | null;
		url?: string | null;
		mode: string;
		maxRedemptions: number;
		redeemedCount: number;
		maxUniquePaths: number | null;
		scopeKind: AccessScopeKind;
		scopePaths: string[];
		scopePrefixes: string[];
		ttlMinutes: number;
		expiresAt: number | null;
		disabledAt: number | null;
		activeSessionExpiresAt: number | null;
	}

	let { data, form } = $props<{
		data: {
			frontendOrigin: string;
			sharedDbConfigured: boolean;
			filters: { status: string; role: string; reason: string; q: string; access: string; sort: string; page: number; limit: number };
			accessRequests: AccessRequestRow[];
			linkedAccessLinks: Record<number, AccessLinkRow[]>;
			pageOptions: { title: string; path: string; section: string }[];
			total: number;
			loadError: string | null;
		};
		form?: {
			updatedId?: number;
			createdUrl?: string;
			linkedRequestId?: number;
			revokedId?: number;
			deletedId?: number;
			emailRecipient?: string;
			emailSent?: boolean;
			emailWarning?: string;
			emailSubject?: string;
			emailBody?: string;
			error?: string;
		};
	}>();

	const statuses = ['new', 'approved', 'denied', 'archived'];
	const uses = ['Business', 'Pleasure'];
	const reasons = ['I want to work with you', 'I want press materials', 'I want research materials', 'Just browsing'];
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
	const scopes: { value: AllowedScopeValue; label: string; description?: string }[] = [
		{ value: 'all', label: 'All pages' },
		{ value: 'projects', label: 'Projects' },
		{ value: 'writing', label: 'Writing' },
		{ value: 'media', label: 'Media', description: 'Video + audio' },
		{ value: 'reading-room', label: 'Reading Room', description: 'Lookup and image/code pages' },
		{ value: 'system', label: 'System', description: 'All /s tools and rooms' },
		{ value: 'selected-paths', label: 'Selected pages' }
	];
	let approvalModes = $state<Record<number, 'full' | 'limited'>>({});
	let approvalScopes = $state<Record<number, AllowedScopeValue[]>>({});

	$effect(() => {
		for (const request of data.accessRequests) {
			approvalModes[request.id] ??= 'full';
			approvalScopes[request.id] ??= grantableSourcePath(request) ? ['selected-paths'] : ['all'];
		}
	});

	const pageCount = $derived(Math.max(1, Math.ceil(data.total / data.filters.limit)));
	const hasPrevious = $derived(data.filters.page > 1);
	const hasNext = $derived(data.filters.page < pageCount);

	async function copyToClipboard(value: string | null | undefined) {
		if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
		await navigator.clipboard.writeText(value);
	}

	function emailDraftText(subject: string, body: string) {
		return `Subject: ${subject}\n\n${body}`;
	}

	function createdEmailStatus() {
		if (!form?.createdUrl) return '';
		if (form.emailSent) return `Created and emailed to ${form.emailRecipient}`;
		if (form.emailWarning) return 'Created, email not sent';
		return 'Created';
	}

	function formatDate(value: number | null) {
		if (!value) return '—';
		const date = new Date(value);
		const yy = String(date.getFullYear()).slice(-2);
		const mm = String(date.getMonth() + 1).padStart(2, '0');
		const dd = String(date.getDate()).padStart(2, '0');
		return `${mm}.${dd}.${yy}`;
	}

	function hrefFor(next: Record<string, string | number | null>) {
		const params = new URLSearchParams();
		const merged = { ...data.filters, ...next };
		if (merged.status) params.set('status', String(merged.status));
		if (merged.role) params.set('role', String(merged.role));
		if (merged.reason) params.set('reason', String(merged.reason));
		if (merged.q) params.set('q', String(merged.q));
		if (merged.access) params.set('access', String(merged.access));
		if (merged.sort && merged.sort !== 'newest') params.set('sort', String(merged.sort));
		if (Number(merged.page) > 1) params.set('page', String(merged.page));
		const query = params.toString();
		return query ? `/access-requests?${query}` : '/access-requests';
	}

	function grantableSourcePath(request: AccessRequestRow) {
		const path = request.source_path?.trim();
		if (!path || path === '/' || path === '/info' || path === '/request-access') return null;
		return path.startsWith('/') ? path : `/${path}`;
	}

	function defaultStartPath(request: AccessRequestRow) {
		return grantableSourcePath(request) || '/';
	}

	function requestScopeValues(id: number) {
		return approvalScopes[id] ?? ['all'];
	}

	function requestHasScope(id: number, value: AllowedScopeValue) {
		return requestScopeValues(id).includes(value);
	}

	function setRequestScope(id: number, value: AllowedScopeValue, checked: boolean) {
		if (value === 'all') {
			approvalScopes[id] = checked ? ['all'] : [];
			return;
		}
		const withoutAll = requestScopeValues(id).filter((scope) => scope !== 'all' && scope !== value);
		approvalScopes[id] = checked ? [...withoutAll, value] : withoutAll;
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
		if (prefixes.has('s/reading-room')) parts.push('reading room');
		if (prefixes.has('s')) parts.push('system');
		if (link.scopePaths?.length) parts.push(describeSelectedCount(link.scopePaths.length));
		return parts.length ? parts.join(' + ') : 'custom scope';
	}

	function describeAccess(link: AccessLinkRow) {
		if (link.mode === 'full') return `unlimited pages · ${describeScope(link)}`;
		return `${link.maxUniquePaths ?? 0}-page budget · ${describeScope(link)}`;
	}

	function hasActiveSession(link: AccessLinkRow) {
		return Boolean(link.activeSessionExpiresAt && link.activeSessionExpiresAt > Date.now());
	}

	function hasUnusedRedemption(link: AccessLinkRow) {
		return link.redeemedCount < link.maxRedemptions && (!link.expiresAt || link.expiresAt > Date.now());
	}

	function isExpired(link: AccessLinkRow) {
		return Boolean(!hasActiveSession(link) && link.expiresAt && link.expiresAt < Date.now());
	}

	function isUsed(link: AccessLinkRow) {
		return !hasActiveSession(link) && link.redeemedCount >= link.maxRedemptions;
	}

	function isActiveAccess(link: AccessLinkRow) {
		return !link.disabledAt && (hasActiveSession(link) || hasUnusedRedemption(link));
	}

	function describeLinkStatus(link: AccessLinkRow) {
		if (link.disabledAt) return `revoked ${formatDate(link.disabledAt)}`;
		if (isExpired(link)) return `expired ${formatDate(link.expiresAt)}`;
		if (isUsed(link)) return 'used';
		return 'active';
	}

	function requestLinks(request: AccessRequestRow): AccessLinkRow[] {
		return data.linkedAccessLinks[request.id] ?? [];
	}

	function currentAccessLink(request: AccessRequestRow) {
		return requestLinks(request).find(isActiveAccess) ?? null;
	}

	function otherAccessLinks(request: AccessRequestRow) {
		const current = currentAccessLink(request);
		return requestLinks(request).filter((link) => link.id !== current?.id);
	}

	function hasUnrevokedGrant(request: AccessRequestRow) {
		return currentAccessLink(request) !== null;
	}

	function otherAccessLabel(links: AccessLinkRow[]) {
		const parts = [];
		const active = links.filter(isActiveAccess).length;
		const used = links.filter((link) => !link.disabledAt && !isExpired(link) && isUsed(link)).length;
		const expired = links.filter((link) => !link.disabledAt && isExpired(link)).length;
		const revoked = links.filter((link) => link.disabledAt).length;
		if (active) parts.push(`${active} active`);
		if (used) parts.push(`${used} used`);
		if (expired) parts.push(`${expired} expired`);
		if (revoked) parts.push(`${revoked} revoked`);
		return parts.length ? `Other access · ${parts.join(' · ')}` : `Other access · ${links.length}`;
	}

	function decisionLabel(request: AccessRequestRow) {
		if (request.status === 'approved') {
			return hasUnrevokedGrant(request) ? 'Approved · access active' : 'Approved · no active access';
		}
		if (request.status === 'denied') return 'Denied';
		if (request.status === 'archived') return 'Archived';
		return 'New';
	}
</script>

<section class="access-requests">
	<div class="intro">
		<h1>Access Requests</h1>
	</div>

	<nav class="status-filters" aria-label="Status filters">
		<a href={hrefFor({ status: '', access: '', page: 1 })} class:active={!data.filters.status && !data.filters.access}>All</a>
		{#each statuses as status}
			<a href={hrefFor({ status, access: '', page: 1 })} class:active={data.filters.status === status && !data.filters.access}>{status}</a>
		{/each}
		<a href={hrefFor({ status: '', access: 'active', page: 1 })} class:active={data.filters.access === 'active'}>active access</a>
	</nav>

	<details class="filter-panel">
		<summary><span class="open-label">Open filters</span><span class="close-label">Close filters</span></summary>
		<form class="filter-form" method="GET">
			<input type="hidden" name="status" value={data.filters.status} />
			<input type="hidden" name="access" value={data.filters.access} />
			<label>
				<span>Search</span>
				<input name="q" value={data.filters.q} placeholder="email, name, note" />
			</label>
			<label>
				<span>Use</span>
				<select name="role" value={data.filters.role}>
					<option value="">All uses</option>
					{#each uses as use}<option value={use}>{use}</option>{/each}
				</select>
			</label>
			<label>
				<span>Reason</span>
				<select name="reason" value={data.filters.reason}>
					<option value="">All reasons</option>
					{#each reasons as reason}<option value={reason}>{reason}</option>{/each}
				</select>
			</label>
			<label>
				<span>Sort</span>
				<select name="sort" value={data.filters.sort}>
					<option value="newest">Newest</option>
					<option value="oldest">Oldest</option>
				</select>
			</label>
			<button>Apply filter</button>
		</form>
	</details>

	{#if form?.createdUrl}
		<div class="result">
			<p>{createdEmailStatus()}</p>
			{#if form.emailWarning}<p>{form.emailWarning}</p>{/if}
			<p>{form.createdUrl}</p>
			<div class="result-actions">
				<button type="button" onclick={() => copyToClipboard(form?.createdUrl)}>Copy link</button>
				{#if form.emailRecipient && form.emailSubject && form.emailBody}
					<button type="button" onclick={() => copyToClipboard(emailDraftText(form.emailSubject ?? '', form.emailBody ?? ''))}>Copy email draft</button>
				{/if}
			</div>
		</div>
	{:else if form?.revokedId}
		<div class="result">
			<p>Revoked</p>
			<p>Access link {form.revokedId}</p>
		</div>
	{:else if form?.deletedId}
		<div class="result">
			<p>Deleted</p>
			<p>Request row {form.deletedId}</p>
		</div>
	{/if}

	{#if !data.sharedDbConfigured}
		<p class="notice">Shared DB binding is not configured in this local dev server. Requests can be reviewed, but access links cannot be created or revoked until the app runs with a Cloudflare D1 binding named DB.</p>
	{/if}

	{#if form?.error || data.loadError}
		<p class="error">{form?.error || data.loadError}</p>
	{/if}

	<div class="requests">
		<div class="count">
			<p>{data.total} request{data.total === 1 ? '' : 's'}</p>
			{#if data.total > data.filters.limit}
				<p>Page {data.filters.page} of {pageCount}</p>
			{/if}
		</div>

		{#if data.accessRequests.length === 0}
			<p class="empty">No requests.</p>
		{:else}
			<div class="table-header" aria-hidden="true">
				<p>Contact</p>
				<p>Use</p>
				<p>Note</p>
				<p>Received</p>
				<p>Admin note</p>
				<p>Decision</p>
			</div>
		{/if}

		{#each data.accessRequests as request}
			{@const currentLink = currentAccessLink(request)}
			{@const otherLinks = otherAccessLinks(request)}
			<article class="request-row">
				<div class="identity request-cell">
					<p class="cell-label">Contact</p>
					<p>{request.email}</p>
					<p>{request.name || '—'}</p>
				</div>

				<div class="classification request-cell">
					<p class="cell-label">Use</p>
					<p>{request.role}</p>
					<p>{request.reason}</p>
				</div>

				<div class="note request-cell">
					<p class="cell-label">Note</p>
					<p>{request.note || '—'}</p>
				</div>

				<div class="received request-cell">
					<p class="cell-label">Received</p>
					<p>{formatDate(request.created_at)}</p>
				</div>

				<form id={`review-${request.id}`} method="POST" action="?/update" use:enhance class="review-carrier"></form>
				<input form={`review-${request.id}`} type="hidden" name="id" value={request.id} />
				<div class="admin-note-cell">
					<input form={`review-${request.id}`} class="admin-note-field" name="adminNote" value={request.admin_note ?? ''} aria-label="Admin note" />
					<button form={`review-${request.id}`} name="status" value={request.status}>Save note</button>
				</div>

				<div class="decision-cell">
					<p class="decision-status">{decisionLabel(request)}</p>

					{#if request.status === 'new' || (request.status === 'approved' && !hasUnrevokedGrant(request))}
						<details class="request-link-panel">
							<summary>{request.status === 'approved' ? 'Create access' : 'Approve'}</summary>
							<form method="POST" action="?/createLink" use:enhance class="request-link-form">
								<input type="hidden" name="id" value={request.id} />
								<input type="hidden" name="email" value={request.email} />
								<input type="hidden" name="name" value={request.name ?? ''} />
								<input type="hidden" name="adminNote" value={request.admin_note ?? ''} />
								<input type="hidden" name="sourcePath" value={defaultStartPath(request)} />
								<input type="hidden" name="label" value={`${request.email} request ${request.id}`} />
								<label>
									<span>Page budget</span>
									<select name="mode" bind:value={approvalModes[request.id]}>
										<option value="full">Unlimited pages</option>
										<option value="limited">Limited pages</option>
									</select>
								</label>
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
													checked={requestHasScope(request.id, scope.value)}
													onchange={(event) => setRequestScope(request.id, scope.value, event.currentTarget.checked)}
												/>
												<span>{scope.label}</span>
												{#if scope.description}<span>{scope.description}</span>{/if}
											</label>
										{/each}
									</div>
								</div>
								{#if requestHasScope(request.id, 'selected-paths')}
									<div class="selected-pages-field">
										<div>
											<p>Selected pages</p>
											<p class="field-help">Project and writing selections can also include their image/code pages.</p>
										</div>
										<div class="checkbox-list">
											<label class="checkbox-option">
												<input name="includeReadingRoomAssets" type="checkbox" checked />
												<span>Include image/code pages for selected projects and writing</span>
											</label>
											{#if grantableSourcePath(request)}
												<label class="checkbox-option">
													<input name="scopePaths" type="checkbox" value={defaultStartPath(request)} checked />
													<span>Requested page · {defaultStartPath(request)}</span>
												</label>
											{/if}
											{#each data.pageOptions as option}
												{#if option.path !== defaultStartPath(request)}
													<label class="checkbox-option">
														<input name="scopePaths" type="checkbox" value={option.path} />
														<span>{option.title} · {option.section}</span>
													</label>
												{/if}
											{/each}
										</div>
									</div>
								{/if}
								<label class:disabled={approvalModes[request.id] !== 'limited'}>
									<span>Unique pages</span>
									<input name="maxUniquePaths" type="number" min="1" value="5" disabled={approvalModes[request.id] !== 'limited'} />
								</label>
								<label>
									<span>Uses</span>
									<input name="maxRedemptions" type="number" min="1" value="1" />
								</label>
								<label>
									<span>Access lasts</span>
									<select name="accessWindow" value="10080">
										{#each accessWindowOptions as option}<option value={option.value}>{option.label}</option>{/each}
									</select>
								</label>
								<label>
									<span>Link expires if unused</span>
									<select name="linkExpiresInMinutes" value="10080">
										{#each linkExpiryOptions as option}<option value={option.value}>{option.label}</option>{/each}
									</select>
								</label>
								<label class="email-option">
									<input name="sendEmail" type="checkbox" value="yes" checked />
									<span>Email link to requester</span>
								</label>
								<button disabled={!data.sharedDbConfigured}>Create</button>
							</form>
						</details>
					{/if}

					{#if request.status === 'new'}
						<div class="manual-actions">
							<button form={`review-${request.id}`} name="status" value="denied">Deny</button>
							<button form={`review-${request.id}`} name="status" value="archived">Archive</button>
						</div>
					{:else if request.status === 'approved'}
						<div class="manual-actions secondary-action">
							<button form={`review-${request.id}`} name="status" value="archived">Archive request</button>
						</div>
					{:else if request.status === 'denied'}
						<div class="manual-actions secondary-action">
							<button form={`review-${request.id}`} name="status" value="new">Reopen request</button>
							<button form={`review-${request.id}`} name="status" value="archived">Archive request</button>
						</div>
					{:else if request.status === 'archived'}
						<div class="manual-actions secondary-action">
							<button form={`review-${request.id}`} name="status" value="new">Restore to review</button>
						</div>
					{/if}

					<form
						method="POST"
						action="?/deleteRequest"
						use:enhance
						class="delete-action secondary-action"
						onsubmit={(event) => {
							if (!confirm('Delete this request row? Existing access links will not be revoked.')) event.preventDefault();
						}}
					>
						<input type="hidden" name="id" value={request.id} />
						<button disabled={!data.sharedDbConfigured}>Delete row</button>
					</form>
				</div>

				<div class="linked-links">
					{#if currentLink}
						<div class="linked-link">
							<p>Current access</p>
							<p>{describeLinkStatus(currentLink)} · {describeAccess(currentLink)} · {currentLink.redeemedCount}/{currentLink.maxRedemptions} used · expires {formatDate(currentLink.expiresAt)}</p>
							{#if currentLink.url}
								<p>{currentLink.url}</p>
								<button type="button" onclick={() => copyToClipboard(currentLink.url)}>Copy link</button>
							{/if}
							<form method="POST" action="?/revokeLink" use:enhance>
								<input type="hidden" name="id" value={currentLink.id} />
								<button disabled={!data.sharedDbConfigured}>Revoke</button>
							</form>
						</div>
					{:else if request.status === 'approved'}
						<p>No active access</p>
					{/if}

					{#if otherLinks.length > 0}
						<details class="access-history">
							<summary>{otherAccessLabel(otherLinks)}</summary>
							<div class="history-list">
								{#each otherLinks as link}
									<div class="linked-link inactive-link">
										<p>{describeLinkStatus(link)} · {describeAccess(link)} · {link.redeemedCount}/{link.maxRedemptions} used · expires {formatDate(link.expiresAt)}</p>
										{#if link.url}<p>{link.url}</p>{/if}
										{#if isActiveAccess(link)}
											<form method="POST" action="?/revokeLink" use:enhance>
												<input type="hidden" name="id" value={link.id} />
												<button disabled={!data.sharedDbConfigured}>Revoke</button>
											</form>
										{/if}
									</div>
								{/each}
							</div>
						</details>
					{/if}
				</div>
			</article>
		{/each}

		{#if data.total > data.filters.limit}
			<nav class="pagination" aria-label="Pagination">
				{#if hasPrevious}<a href={hrefFor({ page: data.filters.page - 1 })}>Previous</a>{/if}
				{#if hasNext}<a href={hrefFor({ page: data.filters.page + 1 })}>Next</a>{/if}
			</nav>
		{/if}
	</div>
</section>

<style>
	.access-requests { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; row-gap: var(--grid-gutter); }
	.intro { grid-column: 2 / 7; display: grid; row-gap: var(--space-md); }
	.status-filters { grid-column: 2 / 4; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-xs); }
	.filter-panel { grid-column: 4 / 8; }
	.filter-panel summary, .request-link-panel summary, .access-history summary { width: fit-content; cursor: pointer; text-decoration: underline; list-style: none; }
	.filter-panel summary::-webkit-details-marker, .request-link-panel summary::-webkit-details-marker, .access-history summary::-webkit-details-marker { display: none; }
	.filter-panel summary::marker, .request-link-panel summary::marker, .access-history summary::marker { content: ''; }
	.filter-panel summary:hover, .request-link-panel summary:hover, .access-history summary:hover { text-decoration: none; }
	.filter-panel .close-label { display: none; }
	.filter-panel[open] .open-label { display: none; }
	.filter-panel[open] .close-label { display: inline; }
	.filter-form, .request-link-form { display: grid; row-gap: var(--space-md); align-content: start; margin-top: var(--space-md); }
	.filter-form label, .request-link-form label { display: grid; row-gap: var(--space-xs); }
	.filter-form button { margin-top: var(--space-xs); }
	.notice, .error, .result { grid-column: 2 / 7; }
	.result { display: grid; row-gap: var(--space-xs); }
	.result-actions { display: flex; flex-wrap: wrap; gap: var(--space-md); }
	.requests { grid-column: 2 / 13; display: grid; grid-template-columns: repeat(11, 1fr); column-gap: var(--grid-gutter); row-gap: var(--space-lg); }
	h1, p { margin: 0; font: inherit; }
	.status-filters a.active { text-decoration: none; cursor: default; }
	.count, .empty, .pagination { grid-column: 1 / -1; display: flex; gap: var(--space-md); opacity: 0.6; }
	.table-header, .request-row { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(11, 1fr); column-gap: var(--grid-gutter); }
	.table-header { opacity: 0.6; margin-bottom: calc(-1 * var(--space-sm)); }
	.table-header p:nth-child(1), .identity { grid-column: 1 / 3; }
	.table-header p:nth-child(2), .classification { grid-column: 3 / 4; }
	.table-header p:nth-child(3), .note { grid-column: 4 / 7; }
	.table-header p:nth-child(4), .received { grid-column: 7 / 8; }
	.table-header p:nth-child(5), .admin-note-cell { grid-column: 8 / 10; }
	.table-header p:nth-child(6), .decision-cell { grid-column: 10 / 12; }
	.request-row { row-gap: var(--space-md); padding-top: var(--space-xs); align-items: start; }
	.request-cell { display: grid; row-gap: var(--space-xs); align-content: start; }
	.review-carrier { display: none; }
	.admin-note-cell, .decision-cell { display: grid; row-gap: var(--space-md); align-content: start; }
	.decision-status { opacity: 0.6; }
	.secondary-action { opacity: 0.6; }
	.manual-actions { display: flex; flex-wrap: wrap; gap: var(--space-md); }
	.linked-links { grid-column: 8 / 12; display: grid; row-gap: var(--space-md); }
	.linked-link { display: grid; row-gap: var(--space-xs); }
	.history-list { display: grid; row-gap: var(--space-md); margin-top: var(--space-md); }
	.access-history, .inactive-link { opacity: 0.6; }
	.request-link-form { grid-template-columns: repeat(2, 1fr); column-gap: var(--grid-gutter); }
	.request-link-form label, .request-link-form .scope-field, .request-link-form .selected-pages-field { grid-column: 1 / -1; }
	.request-link-form button { grid-column: 1 / -1; }
	.request-link-form .email-option { display: grid; grid-template-columns: auto 1fr; column-gap: var(--grid-gutter); }
	.scope-field, .selected-pages-field { display: grid; row-gap: var(--space-xs); }
	.scope-options { display: grid; row-gap: var(--space-xs); }
	.checkbox-list { display: grid; row-gap: var(--space-xs); max-height: 10rem; overflow-y: auto; padding-right: var(--space-xs); }
	.request-link-form .checkbox-option, .request-link-form .scope-option { display: grid; grid-template-columns: auto 1fr; column-gap: var(--grid-gutter); }
	.request-link-form .scope-option span:last-child { grid-column: 2; }
	.request-link-form .checkbox-option span, .request-link-form .scope-option span:first-of-type { opacity: 1; }
	.field-help { opacity: 0.6; }
	.disabled { opacity: 0.35; }
	.cell-label { display: none; }
	input, select, button { font: inherit; color: inherit; background: transparent; border: 0; border-radius: 0; padding: 0; }
	input:not([type='checkbox']):not([type='radio']), select { width: 100%; border-bottom: 1px solid currentColor; align-self: start; }
	button { width: fit-content; text-align: left; text-decoration: underline; cursor: pointer; }
	button:disabled { opacity: 0.35; cursor: not-allowed; }
	.note, .received, .notice, .error, .result, .linked-links, label span, .scope-field > div:first-child, .selected-pages-field > div:first-child, .request-link-form .scope-option span:last-child { opacity: 0.6; }
	.request-link-form .checkbox-option span, .request-link-form .scope-option span:first-of-type { opacity: 1; }
	.note, .identity, .result { overflow-wrap: anywhere; }
	@media (max-width: 768px) {
		.intro, .filter-panel, .status-filters, .filter-form, .notice, .error, .result, .requests, .request-row, .identity, .classification, .note, .received, .admin-note-cell, .decision-cell, .linked-links, .request-link-panel { grid-column: 1 / -1; grid-row: auto; }
		.status-filters { flex-direction: row; flex-wrap: wrap; gap: var(--space-md); }
		.filter-form, .requests, .request-row, .request-link-form { grid-template-columns: repeat(var(--grid-columns), 1fr); }
		.filter-form label:nth-of-type(1), .filter-form label:nth-of-type(2), .filter-form label:nth-of-type(3), .filter-form label:nth-of-type(4), .filter-form button, .request-link-form label, .request-link-form button { grid-column: 1 / -1; }
		.table-header { display: none; }
		.cell-label { display: block; opacity: 0.6; }
	}
</style>
