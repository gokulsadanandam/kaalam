/**
 * Vercel serverless entry point.
 *
 * An Express app is itself a `(req, res)` handler, so re-exporting it is all a
 * Node.js serverless runtime needs. `vercel.json` rewrites every path here so
 * `/api/rasipalan`, `/api/rasis` and `/health` all reach the same app.
 */
export { default } from '../index.js';
