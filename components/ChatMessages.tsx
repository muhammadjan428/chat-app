import { useEffect, useRef, memo } from 'react';
import MessageBubble from './MessageBubble';
import { Message, Chat } from '@/types/chat';

interface ChatMessagesProps {
  messages: Message[];
  selectedChat: Chat | null;
  currentUserId: string;
  onRetryMessage?: (messageId: string) => void;
  loading?: boolean;
}

const ChatMessages = memo(({
  messages,
  selectedChat,
  currentUserId,
  onRetryMessage,
  loading = false
}: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [messages]);

  // Check if user is near bottom of chat to determine auto-scroll
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
    shouldAutoScrollRef.current = isNearBottom;
  };

  // Group messages by date for better readability
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [date: string]: Message[] } = {};
    
    messages.forEach(message => {
      const date = new Date(message.createdAt).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    
    return Object.entries(groups).sort(([dateA], [dateB]) => 
      new Date(dateA).getTime() - new Date(dateB).getTime()
    );
  };

  const formatDateGroup = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  // Show consecutive messages from same user
  const shouldShowAvatar = (message: Message, index: number, dayMessages: Message[]) => {
    if (index === dayMessages.length - 1) return true; // Always show for last message
    
    const nextMessage = dayMessages[index + 1];
    const timeDiff = new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime();
    
    return nextMessage.senderId !== message.senderId || timeDiff > 300000; // 5 minutes
  };

  const messageGroups = groupMessagesByDate(messages);
  const participantsCount = selectedChat?.participants?.length || 1;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-500">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No messages yet
          </h3>
          <p className="text-gray-500">
            Start the conversation by sending a message below
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      <div className="space-y-6">
        {messageGroups.map(([date, dayMessages]) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-6">
              <div className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                {formatDateGroup(date)}
              </div>
            </div>

            {/* Messages for this day */}
            <div className="space-y-4">
              {dayMessages.map((message, index) => {
                const isOwnMessage = message.senderId === currentUserId;
                const showAvatar = shouldShowAvatar(message, index, dayMessages);
                
                return (
                  <div 
                    key={message._id || message.tempId} 
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <MessageBubble
                      message={message}
                      isOwnMessage={isOwnMessage}
                      isGroup={selectedChat?.isGroup || false}
                      participantsCount={participantsCount}
                      showAvatar={showAvatar}
                      onRetry={onRetryMessage}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
});

ChatMessages.displayName = 'ChatMessages';

export default ChatMessages;