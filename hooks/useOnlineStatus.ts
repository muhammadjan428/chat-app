import { useState, useEffect, useCallback, useRef } from 'react';
import { PusherUserStatus } from '@/types/chat';

interface UseOnlineStatusOptions {
  userId: string | null;
  updateUserStatus?: (isOnline: boolean) => void;
}

export const useOnlineStatus = ({ userId, updateUserStatus }: UseOnlineStatusOptions) => {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Fix: Initialize with null and specify the type properly
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef(Date.now());

  // Memoize the updateUserStatus to prevent unnecessary re-renders
  const stableUpdateUserStatus = useCallback(updateUserStatus || (() => {}), [updateUserStatus]);

  // Track browser online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (userId) {
        stableUpdateUserStatus(true);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (userId) {
        stableUpdateUserStatus(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userId, stableUpdateUserStatus]);

  // Track user activity for auto-away status
  useEffect(() => {
    if (!userId) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [userId]);

  // Heartbeat mechanism to update online status
  useEffect(() => {
    if (!userId || !isOnline) return;

    const sendHeartbeat = () => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      const isActive = timeSinceLastActivity < 60000; // 1 minute

      stableUpdateUserStatus(isActive);
    };

    // Send immediate heartbeat
    sendHeartbeat();

    // Set up interval for regular heartbeats
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000); // Every 30 seconds

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [userId, isOnline, stableUpdateUserStatus]);

  // Handle user status updates from Pusher
  const handleUserStatusUpdate = useCallback((data: PusherUserStatus) => {
    setOnlineUsers(prev => {
      const newSet = new Set(prev);
      if (data.isOnline) {
        newSet.add(data.userId);
      } else {
        newSet.delete(data.userId);
      }
      return newSet;
    });
  }, []);

  // Check if user is online
  const isUserOnline = useCallback((userId: string) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  // Set user online status (for initial load)
  const setUserOnline = useCallback((userId: string, isOnline: boolean) => {
    setOnlineUsers(prev => {
      const newSet = new Set(prev);
      if (isOnline) {
        newSet.add(userId);
      } else {
        newSet.delete(userId);
      }
      return newSet;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      // Send offline status when component unmounts
      if (userId && isOnline) {
        stableUpdateUserStatus(false);
      }
    };
  }, [userId, isOnline, stableUpdateUserStatus]);

  return {
    isOnline,
    onlineUsers,
    isUserOnline,
    setUserOnline,
    handleUserStatusUpdate
  };
};