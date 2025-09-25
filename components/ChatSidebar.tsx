import { useState, memo, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Plus, Search, Users } from 'lucide-react';
import { Chat } from '@/types/chat';
import OnlineStatus from './OnlineStatus';
import { pusherClient, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';

interface TypingUser {
  userId: string;
  userName: string;
  chatId: string;
}

interface ChatSidebarProps {
  chats: Chat[];
  selectedChat: Chat | null;
  currentUser: {
    imageUrl?: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  currentUserId: string;
  onChatSelect: (chat: Chat) => void;
  onNewChatClick: () => void;
  onCreateGroupClick: () => void;
  isUserOnline: (userId: string) => boolean;
  loading?: boolean;
}

// Define type for Pusher channel
interface PusherChannel {
  name: string;
  bind: (event: string, callback: (data: TypingUser) => void) => void;
}

const ChatSidebar = memo(({
  chats,
  selectedChat,
  currentUser,
  currentUserId,
  onChatSelect,
  onNewChatClick,
  onCreateGroupClick,
  isUserOnline,
  loading = false
}: ChatSidebarProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  // Deduplicate chats by _id (preserves first occurrence)
  const uniqueChats = useMemo(() => {
    if (!chats || chats.length === 0) return [];
    return Array.from(new Map(chats.map((c) => [c._id, c])).values());
  }, [chats]);

  // Subscribe to typing indicators for all unique chats
  useEffect(() => {
    if (!uniqueChats.length) return;

    const subscriptions: PusherChannel[] = [];

    uniqueChats.forEach(chat => {
      const channel = pusherClient.subscribe(PUSHER_CHANNELS.TYPING(chat._id)) as PusherChannel;
      
      const handleUserTyping = (data: TypingUser) => {
        // Only show typing if it's not the current user
        if (data.userId !== currentUserId) {
          setTypingUsers(prev => {
            // Remove any existing typing indicator for this user in this chat
            const filtered = prev.filter(user => !(user.userId === data.userId && user.chatId === data.chatId));
            // Add the new typing indicator
            return [...filtered, data];
          });
        }
      };

      const handleUserStopTyping = (data: TypingUser) => {
        setTypingUsers(prev => 
          prev.filter(user => !(user.userId === data.userId && user.chatId === data.chatId))
        );
      };

      channel.bind(PUSHER_EVENTS.USER_TYPING, handleUserTyping);
      channel.bind(PUSHER_EVENTS.USER_STOP_TYPING, handleUserStopTyping);
      
      subscriptions.push(channel);
    });

    return () => {
      subscriptions.forEach(channel => {
        try {
          pusherClient.unsubscribe(channel.name);
        } catch {
          // Silently handle any unsubscribe errors
        }
      });
      setTypingUsers([]); // Clear typing indicators when component unmounts
    };
  }, [uniqueChats, currentUserId]);

  // Filter chats based on search term (operate on deduplicated chats)
  const filteredChats = uniqueChats.filter(chat => {
    if (!searchTerm) return true;
    
    const chatName = getChatDisplayName(chat).toLowerCase();
    const lastMessage = chat.lastMessage?.toLowerCase() || '';
    
    return chatName.includes(searchTerm.toLowerCase()) || 
           lastMessage.includes(searchTerm.toLowerCase());
  });

  const getChatDisplayName = (chat: Chat) => {
    if (chat.isGroup && chat.name) return chat.name;
    
    const otherParticipant = chat.participantDetails.find(p => p.clerkId !== currentUserId);
    if (otherParticipant) {
      return `${otherParticipant.first_name || ''} ${otherParticipant.last_name || ''}`.trim();
    }
    
    return 'Unknown User';
  };

  const getChatDisplayImage = (chat: Chat) => {
    if (chat.isGroup) return chat.image || null;
    
    const otherParticipant = chat.participantDetails.find(p => p.clerkId !== currentUserId);
    return otherParticipant?.image;
  };

  const getOtherParticipantId = (chat: Chat) => {
    if (chat.isGroup) return null;
    
    const otherParticipant = chat.participantDetails.find(p => p.clerkId !== currentUserId);
    return otherParticipant?.clerkId;
  };

  const formatLastMessageTime = (timestamp?: string) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInMs / (1000 * 60));
      return minutes < 1 ? 'now' : `${minutes}m`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)}d`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Get typing message for a specific chat
  const getTypingMessage = (chat: Chat) => {
    const chatTypingUsers = typingUsers.filter(user => user.chatId === chat._id);

    if (chatTypingUsers.length === 0) return null;

    if (chat.isGroup) {
      // For group chats, show who is typing
      if (chatTypingUsers.length === 1) {
        return `${chatTypingUsers[0].userName} is typing...`;
      } else if (chatTypingUsers.length === 2) {
        return `${chatTypingUsers[0].userName} and ${chatTypingUsers[1].userName} are typing...`;
      } else {
        return `${chatTypingUsers.length} people are typing...`;
      }
    } else {
      // For direct messages, just show "typing..."
      return 'typing...';
    }
  };

  // Calculate total unseen messages (only count chats with unseen > 0)
  const totalUnseenCount = uniqueChats.reduce((total, chat) => {
    const unseenCount = chat.unseenCount || 0;
    return total + (unseenCount > 0 ? unseenCount : 0);
  }, 0);

  // Get group member count display
  const getGroupMemberCount = (chat: Chat) => {
    if (!chat.isGroup) return '';
    return `${chat.participantDetails.length} members`;
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {currentUser?.imageUrl && (
              <div className="relative">
                <Image
                  src={currentUser.imageUrl}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover"
                  width={40}
                  height={40}
                />
                {/* Only show badge if there are unseen messages */}
                {totalUnseenCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                    {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-semibold text-gray-900 truncate">
                {(currentUser?.firstName || '').trim()} {(currentUser?.lastName || '').trim()}
              </h1>
              <div className="flex items-center space-x-1">
                <OnlineStatus isOnline={true} size="sm" />
                <p className="text-sm text-gray-500">Online</p>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-1">
            <button
              onClick={() => {
                onCreateGroupClick();
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Create group"
            >
              <Users className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => {
                onNewChatClick();
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Start new chat"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="text-gray-500">
              {searchTerm ? 'No chats found' : 'No conversations yet'}
            </div>
            {!searchTerm && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={onNewChatClick}
                  className="block mx-auto text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Start your first chat
                </button>
                <button
                  onClick={onCreateGroupClick}
                  className="block mx-auto text-green-600 hover:text-green-700 text-sm font-medium"
                >
                  Create a group
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredChats.map((chat, index) => {
            const otherParticipantId = getOtherParticipantId(chat);
            const isOtherUserOnline = otherParticipantId ? isUserOnline(otherParticipantId) : false;
            const typingMessage = getTypingMessage(chat);
            const unseenCount = chat.unseenCount || 0;
            
            return (
              <div
                key={`${chat._id}-${index}`} // ← safe unique key
                onClick={() => onChatSelect(chat)}
                className={`p-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100 transition-colors ${
                  selectedChat?._id === chat._id ? 'bg-blue-50 border-blue-200' : ''
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative flex-shrink-0">
                    {getChatDisplayImage(chat) ? (
                      <Image
                        src={getChatDisplayImage(chat)!}
                        alt={getChatDisplayName(chat)}
                        className="w-12 h-12 rounded-full object-cover"
                        width={48}
                        height={48}
                      />
                    ) : (
                      <div className={`w-12 h-12 ${
                        chat.isGroup 
                          ? 'bg-gradient-to-br from-green-400 to-blue-500' 
                          : 'bg-gradient-to-br from-blue-400 to-purple-500'
                      } rounded-full flex items-center justify-center`}>
                        {chat.isGroup ? (
                          <Users className="w-6 h-6 text-white" />
                        ) : (
                          <span className="text-white font-semibold text-lg">
                            {getChatDisplayName(chat).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Online status indicator - only for direct chats */}
                    {!chat.isGroup && (
                      <div className="absolute bottom-0 right-0 translate-x-1 translate-y-1">
                        <OnlineStatus isOnline={isOtherUserOnline} size="sm" />
                      </div>
                    )}
                    
                    {/* Unseen count badge - only show if count > 0 */}
                    {unseenCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                        {unseenCount > 99 ? '99+' : unseenCount}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`font-medium truncate ${
                        unseenCount > 0 
                          ? 'text-gray-900 font-semibold' 
                          : 'text-gray-900'
                      }`}>
                        {getChatDisplayName(chat)}
                      </h3>
                      
                      {chat.lastMessageTime && !typingMessage && (
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {formatLastMessageTime(chat.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    
                    {/* Show group member count or typing message or last message */}
                    {typingMessage ? (
                      <div className="flex items-center space-x-1">
                        <div className="flex space-x-1">
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <p className="text-sm text-blue-600 font-medium italic ml-2">
                          {typingMessage}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {chat.lastMessage ? (
                          <p className={`text-sm truncate ${
                            unseenCount > 0 
                              ? 'text-gray-900 font-medium' 
                              : 'text-gray-500'
                          }`}>
                            {chat.lastMessage}
                          </p>
                        ) : null}
                        {chat.isGroup && (
                          <p className="text-xs text-gray-400">
                            {getGroupMemberCount(chat)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

ChatSidebar.displayName = 'ChatSidebar';

export default ChatSidebar;