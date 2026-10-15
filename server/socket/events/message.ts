import { Server, Socket } from 'socket.io';
import { createUserClient } from '../../config/supabase.js';

// message:send bypasses the Express rate limiters, so it gets its own:
// a sliding window per user (shared across that user's tabs/devices).
// 20 messages / 10 s is far above human typing speed.
const SEND_WINDOW_MS = 10_000;
const SEND_MAX_PER_WINDOW = 20;
const recentSends = new Map<string, number[]>();

function allowSend(userId: string): boolean {
  const now = Date.now();
  const recent = (recentSends.get(userId) ?? []).filter(
    (t) => now - t < SEND_WINDOW_MS
  );
  if (recent.length >= SEND_MAX_PER_WINDOW) {
    recentSends.set(userId, recent);
    return false;
  }
  recent.push(now);
  recentSends.set(userId, recent);
  return true;
}

export function messageEvents(io: Server, socket: Socket) {
  socket.on('message:send', async (incomingMessage) => {
    try {
      // Basic auth guard
      if (!socket.data?.userId || !socket.data?.userJWT) {
        return socket.emit('message:error', { error: 'Unauthorized' });
      }

      if (
        !incomingMessage ||
        typeof incomingMessage.room_id !== 'string' ||
        typeof incomingMessage.content !== 'string' ||
        typeof incomingMessage.clientTempId !== 'string'
      ) {
        return socket.emit('message:error', { error: 'Invalid payload' });
      }

      if (!allowSend(socket.data.userId)) {
        return socket.emit('message:error', {
          error: 'You are sending messages too quickly',
          clientTempId: incomingMessage.clientTempId,
        });
      }

      const content = incomingMessage.content.trim();

      // Content validation
      if (content.length === 0) {
        return socket.emit('message:error', {
          error: 'Message cannot be empty',
        });
      }

      if (content.length > 65536) {
        return socket.emit('message:error', { error: 'Message too long' });
      }

      const supabase = createUserClient(socket.data.userJWT);

      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          sender_id: socket.data.userId,
          room_id: incomingMessage.room_id,
          content: content,
        })
        .select()
        .single();

      if (error || !message) {
        console.error(error);
        return socket.emit('message:error', {
          error: 'Failed to send message',
          clientTempId: incomingMessage.clientTempId,
        });
      }

      io.to(incomingMessage.room_id).emit('message:new', {
        message: { ...message, attachments: [] },
        clientTempId: incomingMessage.clientTempId,
      });
    } catch (err) {
      console.error(err);
      socket.emit('message:error', { error: 'Server error' });
    }
  });
}
