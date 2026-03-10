/**
 * JaJa Co Decimal System (JJCDDS) — shared taxonomy constant.
 *
 * Used by:
 *  - curate-analyzer.ts (Gemini prompt)
 *  - review/+page.svelte (category dropdown)
 */

/** Schema text sent to Gemini in the classification prompt. */
export const JJCDS_SCHEMA = `
100s – Architecture
  110 – Precedent Projects
  120 – Form & Space
  130 – Buildings
  140 – Structural Systems
  150 – Construction
  160 – Architectural Details

200s – Materials & Making
  210 – Natural Materials
  220 – Industrial Materials
  230 – Craft Materials
  240 – Experimental Materials
  250 – Fabrication

300s – Natural World
  310 – Geology & Landscape
  320 – Flora & Fauna
  330 – Climate
  340 – Environment
  350 – Atmosphere

400s – Art & Aesthetics
  410 – Painting & Figures
  420 – Sculpture & Forms
  430 – Decorative Arts & Patterns
  440 – Images & Representation

500s – Human Context
  510 – Urbanism & Infrastructure
  520 – Political & Social Life
  530 – Vernacular Architecture
  540 – Cultural Artifacts

600s – Conceptual
  610 – Philosophical Ideas
  620 – Theoretical Ideas
  630 – Speculative Ideas
  640 – Historical References
  650 – Literary References

700s – Sound
  710 – Rhythm
  720 – Tonality
  730 – Ambient & Drone
  740 – Instrumental Forms
  750 – Notation
`;

/** Structured list for UI dropdowns and validation. */
export const JJCDS_CATEGORIES = [
	{ code: '100', name: 'Architecture', isMain: true },
	{ code: '110', name: 'Precedent Projects' },
	{ code: '120', name: 'Form & Space' },
	{ code: '130', name: 'Buildings' },
	{ code: '140', name: 'Structural Systems' },
	{ code: '150', name: 'Construction' },
	{ code: '160', name: 'Architectural Details' },
	{ code: '200', name: 'Materials & Making', isMain: true },
	{ code: '210', name: 'Natural Materials' },
	{ code: '220', name: 'Industrial Materials' },
	{ code: '230', name: 'Craft Materials' },
	{ code: '240', name: 'Experimental Materials' },
	{ code: '250', name: 'Fabrication' },
	{ code: '300', name: 'Natural World', isMain: true },
	{ code: '310', name: 'Geology & Landscape' },
	{ code: '320', name: 'Flora & Fauna' },
	{ code: '330', name: 'Climate' },
	{ code: '340', name: 'Environment' },
	{ code: '350', name: 'Atmosphere' },
	{ code: '400', name: 'Art & Aesthetics', isMain: true },
	{ code: '410', name: 'Painting & Figures' },
	{ code: '420', name: 'Sculpture & Forms' },
	{ code: '430', name: 'Decorative Arts & Patterns' },
	{ code: '440', name: 'Images & Representation' },
	{ code: '500', name: 'Human Context', isMain: true },
	{ code: '510', name: 'Urbanism & Infrastructure' },
	{ code: '520', name: 'Political & Social Life' },
	{ code: '530', name: 'Vernacular Architecture' },
	{ code: '540', name: 'Cultural Artifacts' },
	{ code: '600', name: 'Conceptual', isMain: true },
	{ code: '610', name: 'Philosophical Ideas' },
	{ code: '620', name: 'Theoretical Ideas' },
	{ code: '630', name: 'Speculative Ideas' },
	{ code: '640', name: 'Historical References' },
	{ code: '650', name: 'Literary References' },
	{ code: '700', name: 'Sound', isMain: true },
	{ code: '710', name: 'Rhythm' },
	{ code: '720', name: 'Tonality' },
	{ code: '730', name: 'Ambient & Drone' },
	{ code: '740', name: 'Instrumental Forms' },
	{ code: '750', name: 'Notation' }
] as const;
