// components/ChatHeader.tsx - Updated with working leave group functionality
import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Settings, MoreVertical, Users, UserPlus, Info, Phone, Video, LogOut } from 'lucide-react';
import { Chat } from '@/types/chat';
import OnlineStatus from './OnlineStatus';
import { leaveGroupChat } from '@/lib/actions/group.actions';

interface ChatHeaderProps {
  selectedChat: Chat;
  currentUserId: string;
  isUserOnline: (userId: string) => boolean;
  onGroupSettingsClick?: () => void;
  onManageMembersClick?: () => void;
  onChatLeft?: (chatId: string) => void; // New callback for when user leaves a group
}

const ChatHeader = ({ 
  selectedChat, 
  currentUserId, 
  isUserOnline,
  onGroupSettingsClick,
  onManageMembersClick,
  onChatLeft
}: ChatHeaderProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const getChatDisplayName = () => {
    if (selectedChat.isGroup && selectedChat.name) {
      return selectedChat.name;
    }
    
    const otherParticipant = selectedChat.participantDetails.find(
      p => p.clerkId !== currentUserId
    );
    
    if (otherParticipant) {
      return `${otherParticipant.first_name || ''} ${otherParticipant.last_name || ''}`.trim();
    }
    
    return 'Unknown User';
  };

  const getChatDisplayImage = () => {
    if (selectedChat.isGroup) return selectedChat.image || null;
    
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

  const getOnlineStatus = () => {
    if (selectedChat.isGroup) {
      const onlineCount = selectedChat.participantDetails.filter(
        p => p.clerkId !== currentUserId && isUserOnline(p.clerkId)
      ).length;
      
      if (onlineCount === 0) return 'No one online';
      if (onlineCount === 1) return '1 person online';
      return `${onlineCount} people online`;
    } else {
      const otherParticipantId = getOtherParticipantId();
      if (otherParticipantId && isUserOnline(otherParticipantId)) {
        return 'Online';
      }
      return 'Offline';
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedChat.isGroup || isLeaving) return;
    
    const groupName = selectedChat.name || 'this group';
    
    // Show confirmation dialog
    const confirmed = confirm(
      `Are you sure you want to leave "${groupName}"? You won't be able to see new messages unless someone adds you back.`
    );
    
    if (!confirmed) return;
    
    try {
      setIsLeaving(true);
      setShowMenu(false);
      
      const result = await leaveGroupChat(selectedChat._id);
      
      if (result.success) {
        // Call the callback to handle the UI update (like clearing selected chat)
        onChatLeft?.(selectedChat._id);
        
        // Show success message
        alert('Successfully left the group');
      }
    } catch (error) {
      console.error('Failed to leave group:', error);
      alert(error instanceof Error ? error.message : 'Failed to leave group');
    } finally {
      setIsLeaving(false);
    }
  };

  const isAdmin = selectedChat.isGroup && selectedChat.admins?.includes(currentUserId);
  const isCreator = selectedChat.isGroup && selectedChat.createdBy === currentUserId;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Chat Info */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-shrink-0">
            {getChatDisplayImage() ? (
              <Image
                src={getChatDisplayImage()!}
                alt={getChatDisplayName()}
                className="w-12 h-12 rounded-full object-cover"
                width={48}
                height={48}
              />
            ) : (
              <div className={`w-12 h-12 ${
                selectedChat.isGroup 
                  ? 'bg-gradient-to-br from-green-400 to-blue-500' 
                  : 'bg-gradient-to-br from-blue-400 to-purple-500'
              } rounded-full flex items-center justify-center`}>
                {selectedChat.isGroup ? (
                  <Users className="w-6 h-6 text-white" />
                ) : (
                  <span className="text-white font-semibold text-lg">
                    {getChatDisplayName().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            )}
            
            {/* Online status indicator - only for direct chats */}
            {!selectedChat.isGroup && (
              <div className="absolute bottom-0 right-0 translate-x-1 translate-y-1">
                <OnlineStatus isOnline={isUserOnline(getOtherParticipantId() || '')} size="sm" />
              </div>
            )}
          </div>
          
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {getChatDisplayName()}
            </h2>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-500">
                {selectedChat.isGroup ? (
                  `${selectedChat.participantDetails.length} members • ${getOnlineStatus()}`
                ) : (
                  getOnlineStatus()
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {/* Call buttons for direct messages */}
          {!selectedChat.isGroup && (
            <>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <Phone className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <Video className="w-5 h-5 text-gray-600" />
              </button>
            </>
          )}

          {/* More options menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              disabled={isLeaving}
            >
              <MoreVertical className="w-5 h-5 text-gray-600" />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-48 z-10">
                {selectedChat.isGroup ? (
                  /* Group Chat Options */
                  <>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        // Handle view group info - could open a group info modal
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <Info className="w-4 h-4" />
                      <span>Group Info</span>
                    </button>
                    
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            onManageMembersClick?.();
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>Manage Members</span>
                        </button>
                        
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            onGroupSettingsClick?.();
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                        >
                          <Settings className="w-4 h-4" />
                          <span>Group Settings</span>
                        </button>
                      </>
                    )}

                    <div className="border-t border-gray-200 my-1"></div>
                    
                    {/* Leave Group - disabled for creators */}
                    {isCreator ? (
                      <div className="px-4 py-2">
                        <p className="text-xs text-gray-400">
                          Creators cannot leave groups. Delete the group or transfer ownership first.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handleLeaveGroup}
                        disabled={isLeaving}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{isLeaving ? 'Leaving...' : 'Leave Group'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  /* Direct Message Options */
                  <>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        // Handle view profile - could open user profile modal
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <Info className="w-4 h-4" />
                      <span>View Profile</span>
                    </button>
                    
                    <div className="border-t border-gray-200 my-1"></div>
                    
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        // Handle block user - could implement user blocking
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                    >
                      <Users className="w-4 h-4" />
                      <span>Block User</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;