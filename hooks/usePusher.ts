import { useEffect, useRef, useState, useCallback } from 'react';
import { pusherClient, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';
import { PusherMessage, PusherMessageRead, PusherUserStatus } from '@/types/chat';

interface UsePusherOptions {
  userId: string | null;
  selectedChatId?: string | null;
  onNewMessage?: (data: PusherMessage) => void;
  onMessageRead?: (data: PusherMessageRead) => void;
  onUserStatusChange?: (data: PusherUserStatus) => void;
  onTyping?: (data: { userId: string; userName: string; isTyping: boolean }) => void;
}

export const usePusher = ({
  userId,
  selectedChatId,
  onNewMessage,
  onMessageRead,
  onUserStatusChange,
  onTyping
}: UsePusherOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const subscribedChannelsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Connection state management
  useEffect(() => {
    if (!userId) return;

    const handleConnectionStateChange = (state: any) => {
      setIsConnected(state.current === 'connected');
      
      if (state.current === 'disconnected' || state.current === 'failed') {
        // Attempt to reconnect after a delay
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          pusherClient.connect();
        }, 3000);
      }
    };

    pusherClient.connection.bind('state_change', handleConnectionStateChange);
    pusherClient.connect();

    return () => {
      pusherClient.connection.unbind('state_change', handleConnectionStateChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [userId]);

  // Subscribe to user channel for global notifications
  useEffect(() => {
    if (!userId || !isConnected) return;

    const userChannel = PUSHER_CHANNELS.USER(userId);
    
    if (subscribedChannelsRef.current.has(userChannel)) return;

    const channel = pusherClient.subscribe(userChannel);
    subscribedChannelsRef.current.add(userChannel);

    // Handle new messages for unseen count updates
    channel.bind(PUSHER_EVENTS.NEW_MESSAGE, (data: PusherMessage) => {
      onNewMessage?.(data);
    });

    // Handle user status changes
    channel.bind(PUSHER_EVENTS.USER_ONLINE, (data: PusherUserStatus) => {
      onUserStatusChange?.(data);
    });

    channel.bind(PUSHER_EVENTS.USER_OFFLINE, (data: PusherUserStatus) => {
      onUserStatusChange?.(data);
    });

    return () => {
      pusherClient.unsubscribe(userChannel);
      subscribedChannelsRef.current.delete(userChannel);
    };
  }, [userId, isConnected, onNewMessage, onUserStatusChange]);

  // Subscribe to specific chat channel
  useEffect(() => {
    if (!selectedChatId || !userId || !isConnected) return;

    const chatChannel = PUSHER_CHANNELS.CHAT(selectedChatId);
    
    if (subscribedChannelsRef.current.has(chatChannel)) return;

    const channel = pusherClient.subscribe(chatChannel);
    subscribedChannelsRef.current.add(chatChannel);

    // Handle new messages in current chat
    channel.bind(PUSHER_EVENTS.NEW_MESSAGE, (data: PusherMessage) => {
      onNewMessage?.(data);
    });

    // Handle message read status updates
    channel.bind(PUSHER_EVENTS.MESSAGE_READ, (data: PusherMessageRead) => {
      onMessageRead?.(data);
    });

    // Handle typing indicators - Subscribe to typing channel
    const typingChannel = PUSHER_CHANNELS.TYPING(selectedChatId);
    const typingChannelInstance = pusherClient.subscribe(typingChannel);

    typingChannelInstance.bind(PUSHER_EVENTS.USER_TYPING, (data: { userId: string; userName: string }) => {
      if (data.userId !== userId) {
        onTyping?.({ ...data, isTyping: true });
      }
    });

    typingChannelInstance.bind(PUSHER_EVENTS.USER_STOP_TYPING, (data: { userId: string; userName: string }) => {
      if (data.userId !== userId) {
        onTyping?.({ ...data, isTyping: false });
      }
    });

    return () => {
      pusherClient.unsubscribe(chatChannel);
      pusherClient.unsubscribe(typingChannel);
      subscribedChannelsRef.current.delete(chatChannel);
    };
  }, [selectedChatId, userId, isConnected, onNewMessage, onMessageRead, onTyping]);

  // Send typing indicator
  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (!userId || !isConnected) return;

    fetch('/api/chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, isTyping })
    }).catch(console.error);
  }, [userId, isConnected]);

  // Send user status update
  const updateUserStatus = useCallback((isOnline: boolean) => {
    if (!userId || !isConnected) return;

    fetch('/api/user/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOnline })
    }).catch(console.error);
  }, [userId, isConnected]);

  return {
    isConnected,
    sendTyping,
    updateUserStatus
  };
};