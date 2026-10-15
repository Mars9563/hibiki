import 'dotenv/config';
import { createServer } from 'node:http';
import app from './app.js';
import { initSocket } from './socket/index.js';

const PORT = Number(process.env.PORT) || 5000;


const server = createServer(app);

// A request (headers + body) must finish arriving within 2 minutes. Uploads
// are buffered in memory, so a client that trickles bytes would otherwise
// hold that memory for Node's much longer default. 25 MB uploads finish in
// seconds on any normal connection. (Does not affect WebSocket upgrades.)
server.requestTimeout = 120_000;

initSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
