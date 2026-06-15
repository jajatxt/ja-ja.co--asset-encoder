<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { children, data } = $props();

	const tabs = [
		{ href: '/', label: 'Upload' },
		{ href: '/review', label: 'Review' },
		{ href: '/access-links', label: 'Access Links' },
		{ href: '/access-requests', label: 'Requests' }
	];
</script>

<svelte:head>
	<title>Asset Encoder</title>
</svelte:head>

{#if data.isAuthenticated && $page.url.pathname !== '/login'}
	<div class="app-shell">
		<header class="site-header">
			<a href="/" class="logo-part ja-left">Ja</a>
			<a href="/" class="logo-part ja-middle">Ja</a>
			<a href="/" class="logo-part co-right">Co</a>
		</header>

		<nav class="admin-nav" aria-label="Asset encoder navigation">
			<p>Encoder</p>
			{#each tabs as tab}
				<a href={tab.href} class:active={$page.url.pathname === tab.href}>
					{tab.label}
				</a>
			{/each}
		</nav>

		<main class="content">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.app-shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.site-header,
	.content {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		column-gap: var(--grid-gutter);
		padding-inline: var(--page-padding);
	}

	.site-header {
		padding-block: var(--space-md);
	}

	.logo-part {
		width: fit-content;
		text-decoration: none;
	}

	.ja-left {
		grid-column: 1;
	}

	.ja-middle {
		grid-column: 2;
	}

	.co-right {
		grid-column: -2;
	}

	.admin-nav {
		position: fixed;
		top: var(--space-xl);
		right: var(--page-padding);
		width: calc((100vw - (2 * var(--page-padding)) - (12 * var(--grid-gutter))) / 13);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-xs);
		z-index: 10;
	}

	.admin-nav p {
		margin: 0 0 var(--space-sm);
	}

	.admin-nav a.active {
		text-decoration: none;
		cursor: default;
	}

	.content {
		flex: 1;
		row-gap: var(--grid-gutter);
		padding-top: var(--space-xl);
		padding-bottom: var(--space-3xl);
	}

	@media (max-width: 768px) {
		.admin-nav {
			position: static;
			width: auto;
			padding-inline: var(--page-padding);
			padding-top: var(--space-md);
		}

		.content {
			padding-top: var(--space-xl);
		}

		.ja-middle {
			grid-column: 2;
		}

	}
</style>
