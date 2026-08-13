/**
 * Known AI-generator signatures (PRD §42.1).
 *
 * This is the single data file the detector reads. Adding a newly-shipped
 * generator should never require touching parsing code — add a row here.
 */

export interface GeneratorSignature {
  /** Display name shown to the user. */
  name: string;
  /** Case-insensitive substrings matched against Software/CreatorTool/claim generator. */
  match: readonly string[];
}

export const GENERATOR_SIGNATURES: readonly GeneratorSignature[] = [
  { name: 'ChatGPT / DALL·E (OpenAI)', match: ['chatgpt', 'dall-e', 'dall·e', 'dalle', 'openai', 'gpt-image'] },
  { name: 'Google Gemini / Imagen', match: ['gemini', 'imagen', 'made with google ai', 'google ai studio'] },
  { name: 'Midjourney', match: ['midjourney'] },
  { name: 'Adobe Firefly', match: ['firefly', 'adobe firefly'] },
  { name: 'Stable Diffusion', match: ['stable diffusion', 'stablediffusion', 'sdxl', 'automatic1111', 'a1111'] },
  { name: 'ComfyUI', match: ['comfyui', 'comfy_ui'] },
  { name: 'InvokeAI', match: ['invokeai', 'invoke ai'] },
  { name: 'NovelAI', match: ['novelai'] },
  { name: 'FLUX (Black Forest Labs)', match: ['flux', 'black forest labs'] },
  { name: 'Grok / xAI', match: ['grok', 'xai', 'aurora'] },
  { name: 'Ideogram', match: ['ideogram'] },
  { name: 'Leonardo.Ai', match: ['leonardo.ai', 'leonardo ai'] },
  { name: 'Recraft', match: ['recraft'] },
  { name: 'Meta AI', match: ['meta ai', 'imagine with meta', 'emu'] },
  { name: 'Canva', match: ['canva'] },
  { name: 'Freepik', match: ['freepik'] },
  { name: 'Krea', match: ['krea'] },
  { name: 'Runway', match: ['runway', 'runwayml'] },
  { name: 'Luma', match: ['luma ai', 'dream machine'] },
  { name: 'Bing Image Creator', match: ['bing image creator', 'designer.microsoft'] },
];

/** Match a free-text metadata value against the signature table. */
export function matchGenerator(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  for (const sig of GENERATOR_SIGNATURES) {
    for (const needle of sig.match) {
      if (v.includes(needle)) return sig.name;
    }
  }
  return undefined;
}

/**
 * PNG text-chunk keywords written by image-generation tools. The presence of
 * the key alone is strong evidence, independent of the value.
 */
export const GENERATOR_PNG_KEYS: Readonly<Record<string, string>> = {
  parameters: 'Stable Diffusion (AUTOMATIC1111)',
  prompt: 'ComfyUI',
  workflow: 'ComfyUI',
  'sd-metadata': 'InvokeAI',
  invokeai_metadata: 'InvokeAI',
  invokeai_graph: 'InvokeAI',
  dream: 'InvokeAI (legacy)',
  'aigc-meta': 'AIGC metadata',
  generation_data: 'AI image generator',
};

/**
 * IPTC DigitalSourceType values (the standard marker for synthetic media).
 * Keys are the trailing segment of the controlled-vocabulary URI.
 */
export const DIGITAL_SOURCE_TYPES: Readonly<Record<string, { label: string; ai: boolean }>> = {
  trainedAlgorithmicMedia: { label: 'Created by a generative AI model', ai: true },
  compositeWithTrainedAlgorithmicMedia: { label: 'Composite including AI-generated elements', ai: true },
  algorithmicallyEnhancedMedia: { label: 'Algorithmically enhanced', ai: false },
  algorithmicMedia: { label: 'Algorithmically generated (non-AI)', ai: false },
  composite: { label: 'Composite of multiple sources', ai: false },
  digitalCapture: { label: 'Captured by a digital camera', ai: false },
  negativeFilm: { label: 'Scanned from negative film', ai: false },
  positiveFilm: { label: 'Scanned from positive film', ai: false },
  print: { label: 'Scanned from a print', ai: false },
  minorHumanEdits: { label: 'Minor human edits', ai: false },
};

export function describeDigitalSourceType(uri: string): { label: string; ai: boolean } | undefined {
  const key = uri.split('/').pop()?.trim();
  if (!key) return undefined;
  return DIGITAL_SOURCE_TYPES[key];
}
