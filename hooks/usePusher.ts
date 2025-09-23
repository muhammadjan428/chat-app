// hooks/usePusher.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { pusherClient, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';
import { PusherMessage, PusherMessageRead, Chat } from '@/types/chat';

interface UsePusherProps {
  userId: string | null;
  userName?: string; // ✅ add userName for typing events
  selectedChatId?: string;
  onNewMessage?: (data: PusherMessage) => void;
  onMessageRead?: (data: PusherMessageRead) => void;
  onUserStatusChange?: (data: { userId: string; isOnline: boolean }) => void;
  onTyping?: (data: { userId: string; userName: string; isTyping: boolean }) => void;
  onChatUpdated?: (data: Chat) => void;
}

interface UsePusherReturn {
  isConnected: boolean;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  updateUserStatus: (isOnline: boolean) => void;
}

// ✅ Use client events (must be private channels)
export const PUSHER_CLIENT_EVENTS = {
  USER_TYPING: 'client-user-typing',
  USER_STOP_TYPING: 'client-user-stop-typing',
};

export const usePusher = ({
  userId,
  userName = 'User',
  selectedChatId,
  onNewMessage,
  onMessageRead,
  onUserStatusChange,
  onTyping,
  onChatUpdated
}: UsePusherProps): UsePusherReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingStateRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const handleConnectionStateChange = (state: any) => {
      setIsConnected(state.current === 'connected');
    };

    pusherClient.connection.bind('state_change', handleConnectionStateChange);
    pusherClient.connection.bind('connected', () => setIsConnected(true));
    pusherClient.connection.bind('disconnected', () => setIsConnected(false));

    const userChannel = pusherClient.subscribe(PUSHER_CHANNELS.USER(userId));

    userChannel.bind(PUSHER_EVENTS.USER_ONLINE, (data: { userId: string }) => {
      onUserStatusChange?.({ userId: data.userId, isOnline: true });
    });

    userChannel.bind(PUSHER_EVENTS.USER_OFFLINE, (data: { userId: string }) => {
      onUserStatusChange?.({ userId: data.userId, isOnline: false });
    });

    userChannel.bind(PUSHER_EVENTS.CHAT_UPDATED, (data: Chat) => {
      onChatUpdated?.(data);
    });

    return () => {
      pusherClient.connection.unbind('state_change', handleConnectionStateChange);
      pusherClient.connection.unbind('connected');
      pusherClient.connection.unbind('disconnected');
      pusherClient.unsubscribe(PUSHER_CHANNELS.USER(userId));
    };
  }, [userId, onUserStatusChange, onChatUpdated]);

  useEffect(() => {
    if (!selectedChatId || !userId) return;

    // ✅ must be private channel for client events
    const chatChannel = pusherClient.subscribe(PUSHER_CHANNELS.CHAT(selectedChatId));
    const typingChannel = pusherClient.subscribe(`private-${PUSHER_CHANNELS.TYPING(selectedChatId)}`);

    chatChannel.bind(PUSHER_EVENTS.NEW_MESSAGE, (data: PusherMessage) => {
      onNewMessage?.(data);
    });

    chatChannel.bind(PUSHER_EVENTS.MESSAGE_READ, (data: PusherMessageRead) => {
      onMessageRead?.(data);
    });

    typingChannel.bind(PUSHER_CLIENT_EVENTS.USER_TYPING, (data: { userId: string; userName: string }) => {
      if (data.userId !== userId) {
        onTyping?.({ ...data, isTyping: true });
      }
    });

    typingChannel.bind(PUSHER_CLIENT_EVENTS.USER_STOP_TYPING, (data: { userId: string; userName: string }) => {
      if (data.userId !== userId) {
        onTyping?.({ ...data, isTyping: false });
      }
    });

    return () => {
      pusherClient.unsubscribe(PUSHER_CHANNELS.CHAT(selectedChatId));
      pusherClient.unsubscribe(`private-${PUSHER_CHANNELS.TYPING(selectedChatId)}`);
    };
  }, [selectedChatId, userId, onNewMessage, onMessageRead, onTyping]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (!userId || !isConnected) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (lastTypingStateRef.current !== isTyping) {
      const typingChannel = pusherClient.subscribe(`private-${PUSHER_CHANNELS.TYPING(chatId)}`);

      if (isTyping) {
        typingChannel.trigger(PUSHER_CLIENT_EVENTS.USER_TYPING, {
          userId,
          userName,
        });

        typingTimeoutRef.current = setTimeout(() => {
          typingChannel.trigger(PUSHER_CLIENT_EVENTS.USER_STOP_TYPING, {
            userId,
            userName,
          });
          lastTypingStateRef.current = false;
        }, 3000);
      } else {
        typingChannel.trigger(PUSHER_CLIENT_EVENTS.USER_STOP_TYPING, {
          userId,
          userName,
        });
      }

      lastTypingStateRef.current = isTyping;
    }
  }, [userId, userName, isConnected]);

  const updateUserStatus = useCallback(async (isOnline: boolean) => {
    if (!userId || !isConnected) return;

    try {
      await fetch('/api/user/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline }),
      });
    } catch (error) {
      console.error('Failed to update user status:', error);
    }
  }, [userId, isConnected]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    sendTyping,
    updateUserStatus,
  };
};