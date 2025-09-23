// components/ChatContainer.tsx
import { useState, useEffect, useCallback, memo } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { Send } from 'lucide-react';
import { 
  getUserChats, 
  getChatMessages, 
  createOrGetChat,
  createGroupChat,
  markMessagesAsRead,
  getAllUsers
} from '@/lib/actions/chat.actions';
import { Chat, User, TypingUser, PusherMessage, PusherMessageRead } from '@/types/chat';
import { usePusher } from '@/hooks/usePusher';
import { useMessages } from '@/hooks/useMessages';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import ChatSidebar from './ChatSidebar';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import MessageInput from './MessageInput';
import NewChatModal from './NewChatModal';
import CreateGroupModal from './CreateGroupModal';

const ChatContainer = memo(() => {
  const { userId } = useAuth();
  const { user } = useUser();
  
  // State management
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Custom hooks
  const { isOnline, isUserOnline, setUserOnline, handleUserStatusUpdate } = useOnlineStatus({
    userId: userId || null,
  });

  const {
    messages,
    sendMessage,
    addMessage,
    updateMessageReadStatus,
    markAsRead,
    setMessages,
    clearMessages,
    retryMessage,
    setLoading: setMessagesLoading
  } = useMessages({
    chatId: selectedChat?._id || null,
    userId: userId || null,
    onOptimisticUpdate: () => {
      // Scroll to bottom when optimistic message is added
      setTimeout(() => {
        const messagesContainer = document.querySelector('[data-messages-container]');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 50);
    }
  });

  // Handle new chat created (from Pusher)
  const handleChatUpdated = useCallback((data: Chat) => {
    setChats(prev => {
      const exists = prev.find(c => c._id === data._id);
      if (exists) return prev;
      return [data, ...prev];
    });
  }, []);

  // Pusher event handlers
  const handleNewMessage = useCallback((data: PusherMessage) => {
    if (selectedChat && selectedChat._id === data.chatId) {
      // Message in current chat - add to messages and mark as read if from another user
      addMessage(data.message);
      if (data.message.senderId !== userId) {
        markAsRead();
      }
    } else {
      // Message in different chat - update chat list unseen count
      setChats(prev => prev.map(chat => 
        chat._id === data.chatId 
          ? { 
              ...chat, 
              unseenCount: (chat.unseenCount || 0) + 1,
              lastMessage: data.message.content,
              lastMessageTime: data.message.createdAt
            }
          : chat
      ));
    }
  }, [selectedChat, addMessage, markAsRead, userId]);

  const handleMessageRead = useCallback((data: PusherMessageRead) => {
    updateMessageReadStatus(data.messageIds, data.userId);
  }, [updateMessageReadStatus]);

  const handleTypingEvent = useCallback((data: { userId: string; userName: string; isTyping: boolean }) => {
    if (!selectedChat) return;

    setTypingUsers(prev => {
      const filtered = prev.filter(user => user.userId !== data.userId);
      if (data.isTyping) {
        return [...filtered, {
          userId: data.userId,
          userName: data.userName,
          chatId: selectedChat._id
        }];
      }
      return filtered;
    });
  }, [selectedChat]);

  // Initialize Pusher connections
  const { isConnected, sendTyping, updateUserStatus } = usePusher({
    userId: userId || null,
    selectedChatId: selectedChat?._id,
    onNewMessage: handleNewMessage,
    onMessageRead: handleMessageRead,
    onUserStatusChange: handleUserStatusUpdate,
    onTyping: handleTypingEvent,
    onChatUpdated: handleChatUpdated
  });

  // Update user status when online status changes
  useEffect(() => {
    if (updateUserStatus && isOnline !== undefined) {
      updateUserStatus(isOnline);
    }
  }, [isOnline, updateUserStatus]);

  // Load initial chats
  useEffect(() => {
    const loadChats = async () => {
      if (!userId) return;
      
      try {
        setLoading(true);
        const userChats = await getUserChats();
        setChats(userChats);
        
        // Set initial online status for users
        userChats.forEach((chat: Chat) => {
          chat.participantDetails.forEach((participant: any) => {
            if (participant.clerkId !== userId && participant.isOnline !== undefined) {
              setUserOnline(participant.clerkId, participant.isOnline);
            }
          });
        });
      } catch (error) {
        console.error('Failed to load chats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, [userId, setUserOnline]);

  // Load messages when chat is selected
  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedChat) {
        clearMessages();
        return;
      }

      try {
        setMessagesLoading(true);
        const chatMessages = await getChatMessages(selectedChat._id);
        setMessages(chatMessages);
        
        // Mark messages as read
        if (selectedChat.unseenCount && selectedChat.unseenCount > 0) {
          const result = await markMessagesAsRead(selectedChat._id);
          if (result.success) {
            setChats(prev => prev.map(chat => 
              chat._id === selectedChat._id 
                ? { ...chat, unseenCount: 0 }
                : chat
            ));
          }
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setMessagesLoading(false);
      }
    };

    loadMessages();
  }, [selectedChat, setMessages, clearMessages, setMessagesLoading]);

  // Handle chat selection
  const handleChatSelect = useCallback((chat: Chat) => {
    setSelectedChat(chat);
    setTypingUsers([]); // Clear typing users when switching chats
  }, []);

  // Handle starting new direct chat
  const handleStartNewChat = useCallback(async (targetUser: User) => {
    try {
      const chat = await createOrGetChat([targetUser.clerkId]);
      const chatWithDetails = {
        ...chat,
        participantDetails: [
          {
            clerkId: targetUser.clerkId,
            first_name: targetUser.first_name,
            last_name: targetUser.last_name,
            image: targetUser.image
          }
        ],
        unseenCount: 0
      };
      
      setChats(prev => {
        const exists = prev.find(c => c._id === chat._id);
        if (exists) return prev;
        return [chatWithDetails, ...prev];
      });
      
      setSelectedChat(chatWithDetails);
      setShowNewChatModal(false);
    } catch (error) {
      console.error('Failed to start new chat:', error);
    }
  }, []);

  // Handle creating group chat
  const handleCreateGroup = useCallback(async (groupName: string, selectedUsers: User[]) => {
    try {
      console.log('Creating group:', groupName, selectedUsers); // Debug log
      const participantIds = selectedUsers.map(user => user.clerkId);
      const groupChat = await createGroupChat(groupName, '', participantIds);
      
      setChats(prev => [groupChat, ...prev]);
      setSelectedChat(groupChat);
      setShowCreateGroupModal(false);
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  }, []);

  // Handle typing indicator for input
  const handleInputTyping = useCallback((isTyping: boolean) => {
    if (selectedChat && sendTyping) {
      sendTyping(selectedChat._id, isTyping);
    }
  }, [selectedChat, sendTyping]);

  // Handle message retry
  const handleRetryMessage = useCallback((messageId: string) => {
    retryMessage(messageId);
  }, [retryMessage]);

  if (!userId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Please sign in to continue</p>
        </div>
      </div>
    );
  }

  // Convert user object to expected format
  const currentUser = user ? {
    imageUrl: user.imageUrl,
    firstName: user.firstName,
    lastName: user.lastName
  } : null;

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar
        chats={chats}
        selectedChat={selectedChat}
        currentUser={currentUser}
        currentUserId={userId}
        onChatSelect={handleChatSelect}
        onNewChatClick={() => setShowNewChatModal(true)}
        onCreateGroupClick={() => setShowCreateGroupModal(true)}
        isUserOnline={isUserOnline}
        loading={loading}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <ChatHeader
              selectedChat={selectedChat}
              currentUserId={userId}
              isUserOnline={isUserOnline}
            />

            {/* Messages */}
            <ChatMessages
              messages={messages}
              selectedChat={selectedChat}
              currentUserId={userId}
              onRetryMessage={handleRetryMessage}
            />

            {/* Message Input */}
            <MessageInput
              onSendMessage={sendMessage}
              onTyping={handleInputTyping}
              typingUsers={typingUsers}
              disabled={!isConnected}
              placeholder={!isConnected ? "Connecting..." : "Type a message..."}
            />
          </>
        ) : (
          // Empty state
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center max-w-md px-4">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                <Send className="w-10 h-10 text-gray-400" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                Start a conversation
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Select a chat from the sidebar or start a new conversation with someone
              </p>
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={() => setShowNewChatModal(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  New Chat
                </button>
                <button
                  onClick={() => setShowCreateGroupModal(true)}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onStartChat={handleStartNewChat}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onCreateGroup={handleCreateGroup}
        currentUserId={userId}
      />

      {/* Connection Status */}
      {!isConnected && (
        <div className="fixed bottom-4 left-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">Reconnecting...</span>
          </div>
        </div>
      )}
    </div>
  );
});

ChatContainer.displayName = 'ChatContainer';

export default ChatContainer;