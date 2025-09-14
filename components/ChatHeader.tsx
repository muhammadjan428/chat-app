import { memo } from 'react';
import Image from 'next/image';
import { MoreHorizontal, Phone, Video } from 'lucide-react';
import { Chat } from '@/types/chat';
import OnlineStatus from './OnlineStatus';

interface ChatHeaderProps {
  selectedChat: Chat;
  currentUserId: string;
  isUserOnline: (userId: string) => boolean;
}

const ChatHeader = memo(({ 
  selectedChat, 
  currentUserId, 
  isUserOnline 
}: ChatHeaderProps) => {
  const getChatDisplayName = () => {
    if (selectedChat.isGroup && selectedChat.name) {
      return selectedChat.name;
    }
    
    const otherParticipant = selectedChat.participantDetails.find(
      p => p.clerkId !== currentUserId
    );
    
    if (otherParticipant) {
      return `${otherParticipant.first_name} ${otherParticipant.last_name}`;
    }
    
    return 'Unknown User';
  };

  const getChatDisplayImage = () => {
    if (selectedChat.isGroup) return null;
    
    const otherParticipant = selectedChat.participantDetails.find(
      p => p.clerkId !== currentUserId
    );
    
    return otherParticipant?.image;
  };

  const getOtherParticipantId = () => {
    if (selectedChat.isGroup) return null;
    
    const otherParticipant = selectedChat.participantDetails.find(
      p => p.clerkId !== currentUserId
    );
    
    return otherParticipant?.clerkId;
  };

  const getStatusText = () => {
    if (selectedChat.isGroup) {
      const participantCount = selectedChat.participants.length;
      return `${participantCount} participants`;
    }
    
    const otherParticipantId = getOtherParticipantId();
    if (otherParticipantId) {
      return isUserOnline(otherParticipantId) ? 'Online' : 'Offline';
    }
    
    return 'Unknown';
  };

  const otherParticipantId = getOtherParticipantId();
  const isOtherUserOnline = otherParticipantId ? isUserOnline(otherParticipantId) : false;

  return (
    <div className="p-4 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {getChatDisplayImage() ? (
              <Image
                src={getChatDisplayImage()!}
                alt={getChatDisplayName()}
                className="w-10 h-10 rounded-full object-cover"
                width={40}
                height={40}
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold">
                  {getChatDisplayName().charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            
            {/* Online status for direct messages */}
            {!selectedChat.isGroup && (
              <div className="absolute bottom-0 right-0">
                <OnlineStatus isOnline={isOtherUserOnline} size="sm" />
              </div>
            )}
          </div>
          
          {/* Name and status */}
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 truncate">
              {getChatDisplayName()}
            </h2>
            <p className={`text-sm truncate ${
              isOtherUserOnline ? 'text-green-600' : 'text-gray-500'
            }`}>
              {getStatusText()}
            </p>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button 
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Voice call"
          >
            <Phone className="w-5 h-5 text-gray-600" />
          </button>
          
          <button 
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Video call"
          >
            <Video className="w-5 h-5 text-gray-600" />
          </button>
          
          <button 
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="More options"
          >
            <MoreHorizontal className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
});

ChatHeader.displayName = 'ChatHeader';

export default ChatHeader;