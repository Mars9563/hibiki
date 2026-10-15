import express from 'express';
import friendshipsRouter from './routes/friendships.js';
import roomsRouter from './routes/rooms.js';
import personalInfoRouter from './routes/personalUser.js';
import messagesRouter from './routes/userMessages.js';
import groupsRouter from './routes/groups.js';
import cors from 'cors';
import authMiddleware from './middleware/auth.js';
import { defaultLimiter, userLimiter } from './middleware/rateLimiter.js';
const app = express();

// Which peers may tell us the real client IP via X-Forwarded-For.
// Traffic reaches this process in two ways, and in both the TCP peer is
// a private-network address (cluster pod, node, or Docker bridge):
//   browser -> Traefik -> backend                  (Socket.IO, direct)
//   browser -> Traefik -> Next.js pod -> backend   (REST; the route
//                                                    handlers forward the header)
// Traefik is the only public entry point and overwrites any
// X-Forwarded-For a client supplies, so the header is only believed when
// it comes from a private peer. A request from a public address can never
// choose its own IP: Express ignores the header unless the peer is trusted,
// and then uses the right-most address that is NOT itself trusted.
// (Never use `true` here — it trusts everyone and lets clients spoof their IP.)
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.ALLOWED_ORIGIN ?? '',

    ],
    credentials: true,
  })
);
app.use(express.json());
// Layer 1: pre-auth, per real client IP (stops floods of bad/forged tokens
// from reaching Supabase). Layer 2: post-auth, per verified user.
app.use('/api', defaultLimiter);
app.use('/api', authMiddleware, userLimiter);
app.use('/api/friendships', friendshipsRouter);
app.use('/api', roomsRouter);
app.use('/api/personal', personalInfoRouter);
app.use('/api', messagesRouter);
app.use('/api', groupsRouter);

app.get('/', (req, res) => {
  res.send('Hibiki backend is alive');
});
export default app;
