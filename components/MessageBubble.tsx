import { memo } from 'react';
import Image from 'next/image';
import { Check, CheckCheck, AlertCircle } from 'lucide-react';
import { Message } from '@/types/chat';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  isGroup?: boolean;
  participantsCount?: number;
  onRetry?: (messageId: string) => void;
  showAvatar?: boolean;
}

const MessageBubble = memo(({ 
  message, 
  isOwnMessage, 
  isGroup = false, 
  participantsCount = 1,
  onRetry 
}: MessageBubbleProps) => {
  const getMessageReadStatus = () => {
    if (!isOwnMessage) return null;

    const readCount = message.readCount || 0;
    const otherParticipantsCount = participantsCount - 1; // Exclude sender

    // If message is still sending or has error
    if (message.isSending) {
      return <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-100 border-t-blue-300" />;
    }

    if (message.sendError) {
      return (
        <button 
          onClick={() => onRetry?.(message.tempId || message._id)}
          className="w-4 h-4 text-red-400 hover:text-red-300 transition-colors"
          title="Click to retry"
        >
          <AlertCircle className="w-4 h-4" />
        </button>
      );
    }

    // Single chat or no reads yet
    if (readCount <= 1 || otherParticipantsCount === 0) {
      return <Check className="w-4 h-4 text-blue-100" />;
    }

    // Read by all or multiple people in group
    if (readCount > 1 || (readCount === 1 && otherParticipantsCount === 1)) {
      return <CheckCheck className="w-4 h-4 text-blue-300" />;
    }

    return <Check className="w-4 h-4 text-blue-100" />;
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={`flex items-end space-x-2 max-w-xs lg:max-w-md ${
      isOwnMessage ? 'flex-row-reverse space-x-reverse ml-auto' : 'mr-auto'
    }`}>
      {/* Avatar for other users */}
      {!isOwnMessage && (
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
          {message.sender?.image ? (
            <Image
              src={message.sender.image}
              alt={`${message.sender.first_name} ${message.sender.last_name}`}
              className="w-full h-full object-cover"
              width={32}
              height={32}
            />
          ) : (
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-xs text-gray-600 font-medium">
                {message.sender?.first_name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Message bubble */}
      <div
        className={`px-4 py-2 rounded-2xl relative ${
          isOwnMessage
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-900'
        } ${message.isOptimistic ? 'opacity-75' : 'opacity-100'}`}
      >
        {/* Show sender name in group chats */}
        {!isOwnMessage && isGroup && (
          <p className="text-xs font-medium mb-1 text-gray-600">
            {message.sender?.first_name} {message.sender?.last_name}
          </p>
        )}
        
        {/* Message content */}
        <p className="text-sm break-words">{message.content}</p>
        
        {/* Message edited indicator */}
        {message.isEdited && (
          <span className={`text-xs ml-2 ${
            isOwnMessage ? 'text-blue-100' : 'text-gray-500'
          }`}>
            (edited)
          </span>
        )}
        
        {/* Time and status */}
        <div className="flex items-center justify-between mt-1 space-x-2">
          <p className={`text-xs ${
            isOwnMessage ? 'text-blue-100' : 'text-gray-500'
          }`}>
            {formatTime(message.createdAt)}
          </p>
          
          {/* Read status for own messages */}
          <div className="flex items-center space-x-1">
            {getMessageReadStatus()}
          </div>
        </div>
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;