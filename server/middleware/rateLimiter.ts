// ============================================================
// middleware/rateLimit.ts
// In-memory store (the default) — fine on one instance. If this
// ever runs across multiple processes, each one enforces its own
// independent limit until this moves to a shared store (e.g.
// rate-limit-redis) — looser than intended, never dangerous.
// ============================================================
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

// authMiddleware runs before these on every route that uses them,
// so req.userId is set — key by user where we can, IP as fallback.
function userOrIpKey(req: Request): string {
  return req.userId ?? ipKeyGenerator(req.ip ?? '');
}

// Blunt safety net on every /api/* route — runs before auth even
// fires, so this one is always IP-based. Generous enough that no
// real usage pattern should ever hit it.
//
// "IP" means the real client address: app.ts sets `trust proxy` so
// Express reads it from X-Forwarded-For (written by Traefik, and
// forwarded by the Next.js route handlers via client/lib/backend.ts).
// Without that, every REST call arrives from the Next.js pod and ALL
// users share a single bucket.
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down.' },
});

// Per-user ceiling on all authenticated /api traffic. Runs after
// authMiddleware, so it is keyed by the verified user id: one user's
// burst can never consume another user's budget (unlike an IP bucket,
// which is shared by everyone behind the same NAT). Sized well above
// normal use — app boot is ~(3 + number of rooms) requests.
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 900,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { success: false, message: 'Too many requests, please slow down.' },
});

// Search gets hit once per keystroke even with client-side debounce
// — generous, but still capped against scraping.
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    success: false,
    message: 'Too many search requests, please slow down.',
  },
});

// Anything that writes — friend requests, invites, profile/group
// edits. Real users do these rarely; spam is the only reason to
// hit this.
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { success: false, message: 'Too many requests, please slow down.' },
});

// File uploads are heavier than typical writes — network, memory,
// and R2 operations all scale with file count/size. Tighter than
// writeLimiter on purpose.
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { success: false, message: 'Too many uploads, please slow down.' },
});