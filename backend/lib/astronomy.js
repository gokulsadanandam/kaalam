/**
 * One place that loads astronomy-engine for every module.
 *
 * astronomy-engine's ESM build (esm/astronomy.js) has no "type": "module", so
 * Vercel's Node loader runs it as CommonJS and crashes. On Node, load the
 * package's real CommonJS build; on Deno (Supabase), import it normally.
 */
import { createRequire } from 'node:module';

const Astronomy = typeof globalThis.Deno === 'undefined'
  ? createRequire(import.meta.url)('astronomy-engine')
  : await import('astronomy-engine');

export default Astronomy;
