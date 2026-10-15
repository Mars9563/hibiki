import { headers } from 'next/headers';

// The Express backend rate-limits per client IP, but every REST call it
// receives from the web app comes from this Next.js server. Forward the
// address Traefik recorded for the real browser so the backend can tell
// users apart. The backend only believes X-Forwarded-For from private-network
// peers (see `trust proxy` in server/app.ts), and Traefik — the only public
// entry point — overwrites any value a client sends, so it cannot be spoofed.
export async function forwardedForHeader(): Promise<Record<string, string>> {
  const forwardedFor = (await headers()).get('x-forwarded-for');
  return forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};
}
