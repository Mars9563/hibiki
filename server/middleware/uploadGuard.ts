// ============================================================
// middleware/uploadGuard.ts
// Protects the memory-buffered multipart upload route.
//
// Multer's memoryStorage keeps every file fully in RAM, and its
// limits are per file (fileSize) and per count (files) — there is
// no aggregate cap, so one request could buffer files x fileSize
// (10 x 25 MB = 250 MB) before attachment.service.ts rejects it for
// exceeding the 75 MB total. Three guards run BEFORE multer:
//
//   1. limitBodySize     — reject early on Content-Length, and cut the
//                          stream off if more bytes arrive than declared.
//   2. limitConcurrency  — bound how many uploads are buffered at once
//                          (globally and per user).
//   3. (server.requestTimeout in index.ts bounds slow/stalled uploads.)
//
// Counters are in-memory, which matches the single-replica deployment.
// ============================================================
import type { NextFunction, Request, Response } from 'express';

// 75 MB of files (MAX_TOTAL_UPLOAD_SIZE in attachment.service.ts)
// plus headroom for multipart boundaries and the text fields.
const MULTIPART_OVERHEAD = 1024 * 1024;

export function limitBodySize(maxFileBytes: number) {
  const maxBytes = maxFileBytes + MULTIPART_OVERHEAD;

  return (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      res.set('Connection', 'close');
      return res
        .status(413)
        .json({ success: false, message: 'Total upload size too large' });
    }

    // Content-Length can be absent (chunked) or lie, so also count bytes
    // as they arrive and stop reading once the cap is passed.
    let received = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes && !aborted) {
        aborted = true;
        res.set('Connection', 'close');
        res
          .status(413)
          .json({ success: false, message: 'Total upload size too large' });
        req.destroy(); // stop buffering; multer's pending parse is discarded
      }
    });

    next();
  };
}

export function limitConcurrency(opts: {
  maxGlobal: number;
  maxPerUser: number;
}) {
  let inFlight = 0;
  const perUser = new Map<string, number>();

  return (req: Request, res: Response, next: NextFunction) => {
    // authMiddleware has already run, so userId is a verified identity.
    const userId = req.userId ?? 'anonymous';
    const mine = perUser.get(userId) ?? 0;

    if (mine >= opts.maxPerUser) {
      res.set('Retry-After', '5');
      return res.status(429).json({
        success: false,
        message: 'Too many uploads in progress, please wait.',
      });
    }
    if (inFlight >= opts.maxGlobal) {
      res.set('Retry-After', '5');
      return res.status(503).json({
        success: false,
        message: 'Server is busy processing uploads, please retry shortly.',
      });
    }

    inFlight += 1;
    perUser.set(userId, mine + 1);

    // 'close' fires exactly once whether the response finished or the
    // client disconnected mid-upload, so the slot is always released.
    res.once('close', () => {
      inFlight -= 1;
      const left = (perUser.get(userId) ?? 1) - 1;
      if (left <= 0) perUser.delete(userId);
      else perUser.set(userId, left);
    });

    next();
  };
}
