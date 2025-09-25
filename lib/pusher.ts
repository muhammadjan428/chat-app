import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

// Client-side Pusher instance
export const pusherClient = new PusherClient(
  process.env.NEXT_PUBLIC_PUSHER_KEY!,
  {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: '/api/pusher/auth',
    auth: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  }
);

// Pusher channel names
export const PUSHER_CHANNELS = {
  CHAT: (chatId: string) => `chat-${chatId}`,
  USER: (userId: string) => `user-${userId}`,
  TYPING: (chatId: string) => `typing-${chatId}`,
};

// Pusher event names
export const PUSHER_EVENTS = {
  NEW_MESSAGE: 'new-message',
  MESSAGE_READ: 'message-read',
  MESSAGE_DELIVERED: 'message-delivered',
  USER_TYPING: 'user-typing',
  USER_STOP_TYPING: 'user-stop-typing',
  USER_ONLINE: 'user-online',
  USER_OFFLINE: 'user-offline',
  CHAT_UPDATED: 'chat-updated',
  CHAT_DELETED: 'chat-deleted'
};