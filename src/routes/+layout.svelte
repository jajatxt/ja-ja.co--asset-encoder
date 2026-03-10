<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { children, data } = $props();

	const tabs = [
		{ href: '/', label: 'Upload' },
		{ href: '/review', label: 'Review' }
	];
</script>

<svelte:head>
	<title>Asset Encoder</title>
</svelte:head>

{#if data.isAuthenticated && $page.url.pathname !== '/login'}
	<div class="page">
		<h1 class="heading">Curate</h1>

		<nav class="nav">
			{#each tabs as tab}
				<a href={tab.href} class:active={$page.url.pathname === tab.href}>
					{tab.label}
				</a>
			{/each}
		</nav>

		<div class="content">
			{@render children()}
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.page {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		gap: var(--grid-gutter);
		padding-inline: var(--page-padding);
		padding-top: var(--space-xl);
		padding-bottom: var(--space-3xl);
	}

	.heading {
		grid-column: 2 / 7;
	}

	.nav {
		grid-column: 2 / 5;
		display: flex;
		gap: var(--space-lg);
	}

	.nav a.active {
		text-decoration: none;
		cursor: default;
	}

	.content {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		row-gap: var(--grid-gutter);
		margin-top: var(--space-lg);
	}

	@media (max-width: 768px) {
		.heading {
			grid-column: 1 / -1;
		}

		.nav {
			grid-column: 1 / -1;
		}
	}
</style>
