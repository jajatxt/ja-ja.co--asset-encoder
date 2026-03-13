/**
 * Available Gemini models for image analysis.
 * Shared between server (curate-analyzer) and client (upload UI).
 */
export const GEMINI_MODELS = [
	{ id: 'gemini-3.1-pro-preview', label: '3.1 Pro (preview)' },
	{ id: 'gemini-3.1-flash-lite-preview', label: '3.1 Flash Lite (preview)' },
	{ id: 'gemini-3-pro-preview', label: '3.0 Pro (preview)' },
	{ id: 'gemini-3-flash-preview', label: '3.0 Flash (preview)' },
	{ id: 'gemini-2.5-pro', label: '2.5 Pro' },
	{ id: 'gemini-2.5-flash', label: '2.5 Flash' },
	{ id: 'gemini-2.5-flash-lite', label: '2.5 Flash Lite' },
	{ id: 'gemini-2.0-flash', label: '2.0 Flash (legacy)' }
] as const;

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-pro-preview';
