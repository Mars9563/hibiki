// The app's public address, from APP_URL (set in k8s/client.yaml).
// Build redirects from this, never from request.url: behind Traefik, the
// Next.js standalone server reports its own bind address (0.0.0.0:3000).
export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}
