/**
 * Supabase Edge Function entry point for the Kaalam API.
 *
 * Runs the exact same Express app as `node index.js` and Vercel. Supabase
 * routes requests to /functions/v1/kaalam/<path> and the function sees the
 * path as /kaalam/<path>, so the app is mounted under /kaalam. It is also
 * mounted at / so `npm run serve:deno` works locally without the prefix.
 *
 * Dependencies resolve through ./deno.json (npm: specifiers pinned to the
 * versions in ../../../package-lock.json).
 */
import express from 'express';
import app from '../../../index.js';

const server = express();
server.use('/kaalam', app);
server.use(app);

const port = Number(Deno.env.get('PORT') ?? 8000);
server.listen(port, () => console.log(`Kaalam edge function listening on :${port}`));
