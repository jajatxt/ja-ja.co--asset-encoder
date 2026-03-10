<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head>
	<title>Login — Asset Encoder</title>
</svelte:head>

<div class="login-page">
	<h1 class="login-title">Asset Encoder</h1>

	<form method="POST" use:enhance class="login-form">
		<label class="login-label">
			Password
			<input type="password" name="password" autofocus required class="login-input" />
		</label>

		{#if form?.error}
			<p>{form.error}</p>
		{/if}

		<button type="submit">Enter</button>
	</form>
</div>

<style>
	.login-page {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns), 1fr);
		gap: var(--grid-gutter);
		padding-inline: var(--page-padding);
		padding-top: var(--space-2xl);
		padding-bottom: var(--space-3xl);
	}

	.login-title {
		grid-column: 2 / 6;
	}

	.login-form {
		grid-column: 2 / 5;
		display: grid;
		row-gap: var(--space-md);
	}

	.login-label {
		display: grid;
		row-gap: var(--space-xs);
	}

	.login-input {
		border-bottom: 1px solid var(--text-primary);
		padding: var(--space-xs) 0;
	}

	@media (max-width: 768px) {
		.login-title {
			grid-column: 1 / -1;
		}

		.login-form {
			grid-column: 1 / -1;
		}
	}
</style>
