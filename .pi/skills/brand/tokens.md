# Brand Tokens

<!-- Auto-generated from tokens.css. Annotations are preserved on sync. -->

## ── Surface ──
| Token | Value | Usage |
|-------|-------|-------|
| --surface-page | #ffffff | Page background. The only surface. |

## ── Text ──
| Token | Value | Usage |
|-------|-------|-------|
| --text-primary | #000000 | All text. The only text color. |

## ── Typography ──
| Token | Value | Usage |
|-------|-------|-------|
| --font-body | 'ABC Oracle', sans-serif | All text. Single typeface, weight 400 only. |
| --text-base | 14px | The only text size |
| --leading-body | 1.5 | The only line-height |

## ── Grid ──
| Token | Value | Usage |
|-------|-------|-------|
| --grid-columns | 13 | Column count — the defining structural element |
| --grid-gutter | 20px | Gap between columns |
| --grid-margin | 20px | Gap between grid edge and first/last column |
| --page-padding | 40px | Page inline padding (viewport edge to content) |
| --col-full | 1 / -1 | Full width (the only reusable span) |

## ── Spacing ──
| Token | Value | Usage |
|-------|-------|-------|
| --space-xs | 4px | Tight gaps, inline spacing |
| --space-sm | 8px | Related elements |
| --space-md | 16px | Default content gaps |
| --space-lg | 32px | Subsection gaps |
| --space-xl | 64px | Section breaks |
| --space-2xl | 128px | Page-level divisions |
| --space-3xl | 256px | Major separation |

## ── Shape ──
| Token | Value | Usage |
|-------|-------|-------|
| --radius-none | 0 | Everything — no rounding anywhere |

## ── Mobile ──
| Token | Value | Usage |
|-------|-------|-------|
| --grid-columns | 7 | Column count at ≤768px (overrides 13) |

## Rules
- One color: black. One surface: white. No exceptions.
- No borders, no dividers, no rules. Whitespace separates.
- Weight is always 400 — never set font-weight.
- The grid is the layout system — no flexbox for page structure.
- One text size (--text-base). No type scale.
- Spacing scale tokens are for vertical spacing only (row-gap, margin-top/bottom, padding-top/bottom).
- Column gaps always use --grid-gutter. Never apply spacing scale tokens to column-gap or horizontal gap.
