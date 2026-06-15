import { getEnvOptional } from '$lib/server/env';

export interface AccessEmailGrantDetails {
	scope: string;
	pageBudget: string;
	linkUses: string;
	accessLasts: string;
	unusedLinkExpires: string;
}

export interface AccessEmailInput {
	to: string;
	name?: string | null;
	url: string;
	grant?: AccessEmailGrantDetails;
}

export interface AccessEmailDraft {
	to: string;
	subject: string;
	text: string;
	html: string;
}

export interface AccessEmailResult {
	attempted: boolean;
	sent: boolean;
	provider: 'manual' | 'resend' | string;
	draft: AccessEmailDraft;
	error?: string;
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function buildGrantText(grant: AccessEmailGrantDetails | undefined) {
	if (!grant) return '';
	const lines = [
		'What this link gives you:',
		`- Scope: ${grant.scope}`,
		`- Page budget: ${grant.pageBudget}`,
		`- Link uses: ${grant.linkUses}`,
		`- Access lasts: ${grant.accessLasts}`,
		`- Unused link expires: ${grant.unusedLinkExpires}`
	];
	return lines.join('\n');
}

function buildGrantHtml(grant: AccessEmailGrantDetails | undefined) {
	if (!grant) return '';
	const rows = [
		['Scope', grant.scope],
		['Page budget', grant.pageBudget],
		['Link uses', grant.linkUses],
		['Access lasts', grant.accessLasts],
		['Unused link expires', grant.unusedLinkExpires]
	];
	return `<p>What this link gives you:</p><ul>${rows
		.map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
		.join('')}</ul>`;
}

export function buildAccessEmailDraft(input: AccessEmailInput): AccessEmailDraft {
	const name = input.name?.trim();
	const greeting = name ? `Hi ${name},` : 'Hi,';
	const subject = 'Your JaJa Co access link';
	const grantText = buildGrantText(input.grant);
	const sameBrowserText = 'Open the link in the browser you plan to use. It signs that browser in for the access period above, so keep using the same browser/device while you browse.';
	const textParts = [
		greeting,
		'Your access request was approved.',
		`Use this link to enter JaJa Co:\n\n${input.url}`,
		grantText,
		`How it works:\n${sameBrowserText}`,
		'JaJa Co'
	].filter(Boolean);
	const text = textParts.join('\n\n');
	const html = `<p>${escapeHtml(greeting)}</p><p>Your access request was approved.</p><p>Use this link to enter JaJa Co:<br><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>${buildGrantHtml(input.grant)}<p>How it works:<br>${escapeHtml(sameBrowserText)}</p><p>JaJa Co</p>`;

	return { to: input.to, subject, text, html };
}

async function readEmailError(response: Response) {
	const text = await response.text().catch(() => '');
	if (!text) return response.statusText || 'Email request failed';
	try {
		const payload = JSON.parse(text) as { message?: string; error?: string; name?: string };
		return payload.message || payload.error || payload.name || text;
	} catch {
		return text;
	}
}

export async function sendAccessEmail(platform: App.Platform | undefined, input: AccessEmailInput): Promise<AccessEmailResult> {
	const draft = buildAccessEmailDraft(input);
	const configuredProvider = getEnvOptional('EMAIL_PROVIDER', platform)?.trim().toLowerCase();
	const provider = configuredProvider || (getEnvOptional('RESEND_API_KEY', platform) ? 'resend' : 'manual');

	if (provider === 'manual' || provider === 'none' || provider === 'off') {
		return {
			attempted: false,
			sent: false,
			provider: 'manual',
			draft,
			error: 'Email sending is not configured. Copy and send the draft manually.'
		};
	}

	if (provider !== 'resend') {
		return {
			attempted: false,
			sent: false,
			provider,
			draft,
			error: `Email provider ${provider} is not supported yet. Copy and send the draft manually.`
		};
	}

	const apiKey = getEnvOptional('RESEND_API_KEY', platform);
	const from = getEnvOptional('ACCESS_EMAIL_FROM', platform);
	const replyTo = getEnvOptional('ACCESS_EMAIL_REPLY_TO', platform);

	if (!apiKey || !from) {
		return {
			attempted: false,
			sent: false,
			provider: 'resend',
			draft,
			error: 'Resend is not fully configured. Set RESEND_API_KEY and ACCESS_EMAIL_FROM, or copy/send the draft manually.'
		};
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${apiKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			from,
			to: [draft.to],
			subject: draft.subject,
			text: draft.text,
			html: draft.html,
			...(replyTo ? { reply_to: replyTo } : {})
		})
	});

	if (!response.ok) {
		return {
			attempted: true,
			sent: false,
			provider: 'resend',
			draft,
			error: `Email not sent: ${await readEmailError(response)}`
		};
	}

	return { attempted: true, sent: true, provider: 'resend', draft };
}
