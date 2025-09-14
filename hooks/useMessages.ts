import { useState, useCallback, useRef } from 'react';
import { Message } from '@/types/chat';
import { markMessagesAsRead } from '@/lib/actions/chat.actions';
import { v4 as uuidv4 } from 'uuid';

interface UseMessagesOptions {
  chatId: string | null;
  userId: string | null;
  onOptimisticUpdate?: () => void;
}

export const useMessages = ({ chatId, userId, onOptimisticUpdate }: UseMessagesOptions) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const pendingMessagesRef = useRef<Map<string, Message>>(new Map());
  const retryTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Add optimistic message
  const addOptimisticMessage = useCallback((content: string): string => {
    if (!userId || !chatId) return '';

    const tempId = uuidv4();
    const optimisticMessage: Message = {
      _id: tempId,
      tempId,
      chatId,
      content,
      senderId: userId,
      messageType: 'text',
      createdAt: new Date().toISOString(),
      sender: {
        clerkId: userId,
        first_name: 'You',
        last_name: '',
        image: undefined
      },
      readBy: [{
        userId,
        readAt: new Date().toISOString()
      }],
      isOptimistic: true,
      isSending: true,
      readCount: 1
    };

    setMessages(prev => [...prev, optimisticMessage]);
    pendingMessagesRef.current.set(tempId, optimisticMessage);
    onOptimisticUpdate?.();
    
    return tempId;
  }, [userId, chatId, onOptimisticUpdate]);

  // Update message status after sending
  const updateMessageStatus = useCallback((tempId: string, newMessage?: Message, error?: boolean) => {
    setMessages(prev => prev.map(msg => {
      if (msg.tempId === tempId || msg._id === tempId) {
        if (error) {
          return {
            ...msg,
            isSending: false,
            sendError: true,
            isOptimistic: true
          };
        } else if (newMessage) {
          // Replace optimistic message with real message
          pendingMessagesRef.current.delete(tempId);
          return {
            ...newMessage,
            isOptimistic: false,
            isSending: false
          };
        }
      }
      return msg;
    }));
  }, []);

  // Retry failed message
  const retryMessage = useCallback(async (tempId: string) => {
    const message = messages.find(msg => msg.tempId === tempId || msg._id === tempId);
    if (!message || !chatId) return;

    // Mark as sending again
    setMessages(prev => prev.map(msg => 
      (msg.tempId === tempId || msg._id === tempId)
        ? { ...msg, isSending: true, sendError: false }
        : msg
    ));

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          content: message.content,
          messageType: message.messageType
        })
      });

      if (response.ok) {
        const newMessage = await response.json();
        updateMessageStatus(tempId, newMessage);
      } else {
        updateMessageStatus(tempId, undefined, true);
      }
    } catch (error) {
      updateMessageStatus(tempId, undefined, true);
    }
  }, [messages, chatId, updateMessageStatus]);

  // Send message with optimistic update
  const sendMessage = useCallback(async (content: string): Promise<void> => {
    if (!chatId || !userId || !content.trim()) return;

    const tempId = addOptimisticMessage(content.trim());

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          content: content.trim(),
          messageType: 'text'
        })
      });

      if (response.ok) {
        const newMessage = await response.json();
        updateMessageStatus(tempId, newMessage);
      } else {
        updateMessageStatus(tempId, undefined, true);
        // Set up auto-retry after 3 seconds
        const timeout = setTimeout(() => {
          retryMessage(tempId);
          retryTimeoutsRef.current.delete(tempId);
        }, 3000);
        retryTimeoutsRef.current.set(tempId, timeout);
      }
    } catch (error) {
      updateMessageStatus(tempId, undefined, true);
      // Set up auto-retry after 3 seconds
      const timeout = setTimeout(() => {
        retryMessage(tempId);
        retryTimeoutsRef.current.delete(tempId);
      }, 3000);
      retryTimeoutsRef.current.set(tempId, timeout);
    }
  }, [chatId, userId, addOptimisticMessage, updateMessageStatus, retryMessage]);

  // Add new message (from Pusher or API)
  const addMessage = useCallback((newMessage: Message) => {
    setMessages(prev => {
      // Check if message already exists (avoid duplicates)
      const exists = prev.some(msg => 
        msg._id === newMessage._id || 
        (msg.tempId && msg.content === newMessage.content && msg.senderId === newMessage.senderId)
      );
      
      if (exists) {
        // Update existing message (replace optimistic with real)
        return prev.map(msg => {
          if (msg.tempId && msg.content === newMessage.content && msg.senderId === newMessage.senderId) {
            pendingMessagesRef.current.delete(msg.tempId);
            return { ...newMessage, isOptimistic: false };
          }
          return msg._id === newMessage._id ? newMessage : msg;
        });
      }
      
      return [...prev, newMessage];
    });
  }, []);

  // Update message read status
  const updateMessageReadStatus = useCallback((messageIds: string[], userId: string) => {
    setMessages(prev => prev.map(msg => {
      if (messageIds.includes(msg._id)) {
        const newReadBy = msg.readBy ? [...msg.readBy] : [];
        if (!newReadBy.some(read => read.userId === userId)) {
          newReadBy.push({
            userId,
            readAt: new Date().toISOString()
          });
        }
        return {
          ...msg,
          readBy: newReadBy,
          readCount: newReadBy.length,
          isRead: true
        };
      }
      return msg;
    }));
  }, []);

  // Mark messages as read
  const markAsRead = useCallback(async () => {
    if (!chatId || !userId) return;

    try {
      const result = await markMessagesAsRead(chatId);
      if (result.success && result.messageIds) {
        updateMessageReadStatus(result.messageIds, userId);
      }
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [chatId, userId, updateMessageReadStatus]);

  // Set messages (when loading chat messages)
  const setMessagesData = useCallback((newMessages: Message[]) => {
    setMessages(newMessages);
    // Clear any pending messages for this chat
    pendingMessagesRef.current.clear();
  }, []);

  // Remove message
  const removeMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(msg => msg._id !== messageId && msg.tempId !== messageId));
    pendingMessagesRef.current.delete(messageId);
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    pendingMessagesRef.current.clear();
    // Clear all retry timeouts
    retryTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    retryTimeoutsRef.current.clear();
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    addMessage,
    updateMessageReadStatus,
    markAsRead,
    setMessages: setMessagesData,
    removeMessage,
    clearMessages,
    retryMessage,
    setLoading
  };
};