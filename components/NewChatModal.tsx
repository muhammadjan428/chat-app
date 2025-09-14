import { useState, useEffect, memo } from 'react';
import Image from 'next/image';
import { Search, X } from 'lucide-react';
import { User } from '@/types/chat';
import { getAvailableUsers } from '@/lib/actions/chat.actions';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (user: User) => void;
}

const NewChatModal = memo(({ 
  isOpen, 
  onClose, 
  onStartChat 
}: NewChatModalProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Load available users when modal opens or search term changes
  useEffect(() => {
    const loadUsers = async () => {
      if (!isOpen) return;
      
      setLoading(true);
      try {
        const users = await getAvailableUsers(searchTerm);
        setAvailableUsers(users);
      } catch (error) {
        console.error('Failed to load users:', error);
        setAvailableUsers([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(loadUsers, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [isOpen, searchTerm]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setAvailableUsers([]);
    }
  }, [isOpen]);

  const handleStartChat = (user: User) => {
    onStartChat(user);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Start New Chat</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>
        
        {/* User list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : availableUsers.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500">
                {searchTerm ? 'No users found' : 'Loading users...'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {availableUsers.map((user) => (
                <button
                  key={user.clerkId}
                  onClick={() => handleStartChat(user)}
                  className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors text-left"
                >
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={`${user.first_name} ${user.last_name}`}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      width={40}
                      height={40}
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-medium">
                        {user.first_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {user.first_name} {user.last_name}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

NewChatModal.displayName = 'NewChatModal';

export default NewChatModal;