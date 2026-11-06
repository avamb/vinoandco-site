// src/content/ holds plain JSON and HTML read with import.meta.glob (src/lib/content.ts,
// src/lib/legacy.ts), not Astro content collections. An empty config stops Astro
// from auto-generating collections for these folders. The future blog and video
// sections (spec 62 §6.2) will define their collections here.
export const collections = {};
