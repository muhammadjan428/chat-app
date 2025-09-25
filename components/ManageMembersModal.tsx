// components/ManageMembersModal.tsx
import { useState, useEffect } from 'react';
import { X, Search, UserPlus, UserMinus, Crown, Shield, MoreVertical } from 'lucide-react';
import Image from 'next/image';
import { Chat, User } from '@/types/chat';
import { 
  addGroupMembers, 
  removeGroupMember, 
  updateGroupAdmin, 
} from '@/lib/actions/group.actions';
import { getAllUsers } from '@/lib/actions/user.actions';

interface ManageMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  currentUserId: string;
  onGroupUpdated: (updatedChat: Chat) => void;
}

interface MemberMenuState {
  isOpen: boolean;
  memberId: string | null;
}

const ManageMembersModal = ({ 
  isOpen, 
  onClose, 
  chat, 
  currentUserId,
  onGroupUpdated
}: ManageMembersModalProps) => {
  const [activeTab, setActiveTab] = useState<'members' | 'add'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuState, setMenuState] = useState<MemberMenuState>({ isOpen: false, memberId: null });

  const isAdmin = chat?.admins?.includes(currentUserId);
  const isCreator = chat?.createdBy === currentUserId;

  // Load available users for adding to group
  useEffect(() => {
    const loadAvailableUsers = async () => {
      if (!isOpen || !chat || activeTab !== 'add') return;
      
      try {
        const allUsers = await getAllUsers();
        // Filter out users who are already in the group
        const existingMemberIds = new Set(chat.participants);
        const available = allUsers.filter(user => !existingMemberIds.has(user.clerkId));
        setAvailableUsers(available);
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };

    loadAvailableUsers();
  }, [isOpen, chat, activeTab]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('members');
      setSearchTerm('');
      setSelectedUsers([]);
      setMenuState({ isOpen: false, memberId: null });
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setMenuState({ isOpen: false, memberId: null });
    };

    if (menuState.isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [menuState.isOpen]);

  const handleAddMembers = async () => {
    if (!chat || !selectedUsers.length || !isAdmin) return;

    try {
      setLoading(true);
      const newMemberIds = selectedUsers.map(user => user.clerkId);
      const updatedChat = await addGroupMembers(chat._id, newMemberIds);
      onGroupUpdated(updatedChat);
      setSelectedUsers([]);
      setActiveTab('members');
    } catch (error) {
      console.error('Failed to add members:', error);
      alert(error instanceof Error ? error.message : 'Failed to add members');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!chat || !isAdmin) return;

    const member = chat.participantDetails?.find(p => p.clerkId === memberId);
    const memberName = `${member?.first_name || ''} ${member?.last_name || ''}`.trim();
    
    if (!confirm(`Remove ${memberName} from the group?`)) return;

    try {
      setLoading(true);
      const updatedChat = await removeGroupMember(chat._id, memberId);
      onGroupUpdated(updatedChat);
      setMenuState({ isOpen: false, memberId: null });
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert(error instanceof Error ? error.message : 'Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (memberId: string, isCurrentlyAdmin: boolean) => {
    if (!chat || !isCreator) return;

    const member = chat.participantDetails?.find(p => p.clerkId === memberId);
    const memberName = `${member?.first_name || ''} ${member?.last_name || ''}`.trim();
    const action = isCurrentlyAdmin ? 'remove admin rights from' : 'make admin';
    
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${memberName}?`)) return;

    try {
      setLoading(true);
      const updatedChat = await updateGroupAdmin(chat._id, memberId, !isCurrentlyAdmin);
      onGroupUpdated(updatedChat);
      setMenuState({ isOpen: false, memberId: null });
    } catch (error) {
      console.error('Failed to update admin status:', error);
      alert(error instanceof Error ? error.message : 'Failed to update admin status');
    } finally {
      setLoading(false);
    }
  };

  const handleUserToggle = (user: User) => {
    setSelectedUsers(prev => {
      const isSelected = prev.find(u => u.clerkId === user.clerkId);
      if (isSelected) {
        return prev.filter(u => u.clerkId !== user.clerkId);
      } else {
        return [...prev, user];
      }
    });
  };

  const filteredMembers = chat?.participantDetails?.filter(member =>
    `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredAvailableUsers = availableUsers.filter(user =>
    `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen || !chat || !chat.isGroup) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Manage Members</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Members ({chat.participantDetails?.length || 0})
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('add')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'add'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Add Members
            </button>
          )}
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={activeTab === 'members' ? 'Search members...' : 'Search users...'}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'members' ? (
            /* Members List */
            <div>
              {filteredMembers.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-gray-500">
                    {searchTerm ? 'No members found' : 'No members'}
                  </p>
                </div>
              ) : (
                filteredMembers.map(member => {
                  const isMemberAdmin = chat.admins?.includes(member.clerkId);
                  const isMemberCreator = chat.createdBy === member.clerkId;
                  const isCurrentUser = member.clerkId === currentUserId;
                  const canRemove = isAdmin && !isMemberCreator && !isCurrentUser;
                  const canToggleAdmin = isCreator && !isMemberCreator && !isCurrentUser;
                  
                  return (
                    <div
                      key={member.clerkId}
                      className="flex items-center space-x-3 p-4 hover:bg-gray-50 border-b border-gray-100"
                    >
                      <div className="relative flex-shrink-0">
                        {member.image ? (
                          <Image
                            src={member.image}
                            alt={`${member.first_name} ${member.last_name}`}
                            className="w-10 h-10 rounded-full object-cover"
                            width={40}
                            height={40}
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {member.first_name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-gray-900 truncate">
                            {member.first_name} {member.last_name}
                            {isCurrentUser && <span className="text-sm text-gray-500 ml-1">(You)</span>}
                          </h3>
                          
                          {/* Role badges */}
                          {isMemberCreator && (
                            <Crown className="w-4 h-4 text-yellow-500" title="Creator" />
                          )}
                          {isMemberAdmin && !isMemberCreator && (
                            <Shield className="w-4 h-4 text-blue-500" title="Admin" />
                          )}
                        </div>
                        
                        {member.email && (
                          <p className="text-sm text-gray-500 truncate">
                            {member.email}
                          </p>
                        )}
                        
                        <p className="text-xs text-gray-400">
                          {isMemberCreator ? 'Creator' : isMemberAdmin ? 'Admin' : 'Member'}
                        </p>
                      </div>

                      {/* Actions Menu */}
                      {(canRemove || canToggleAdmin) && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuState({
                                isOpen: menuState.memberId === member.clerkId ? !menuState.isOpen : true,
                                memberId: member.clerkId
                              });
                            }}
                            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </button>

                          {/* Dropdown Menu */}
                          {menuState.isOpen && menuState.memberId === member.clerkId && (
                            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-32 z-10">
                              {canToggleAdmin && (
                                <button
                                  onClick={() => handleToggleAdmin(member.clerkId, isMemberAdmin)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                                >
                                  <Shield className="w-4 h-4" />
                                  <span>{isMemberAdmin ? 'Remove Admin' : 'Make Admin'}</span>
                                </button>
                              )}
                              {canRemove && (
                                <button
                                  onClick={() => handleRemoveMember(member.clerkId)}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                >
                                  <UserMinus className="w-4 h-4" />
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Add Members */
            <div>
              {/* Selected Users */}
              {selectedUsers.length > 0 && (
                <div className="p-4 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Selected ({selectedUsers.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedUsers.map(user => (
                      <div
                        key={user.clerkId}
                        className="flex items-center space-x-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
                      >
                        <span>{user.first_name} {user.last_name}</span>
                        <button
                          type="button"
                          onClick={() => handleUserToggle(user)}
                          className="hover:bg-blue-200 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Users */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredAvailableUsers.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-gray-500">
                    {searchTerm ? 'No users found' : 'No users available to add'}
                  </p>
                </div>
              ) : (
                filteredAvailableUsers.map(user => {
                  const isSelected = selectedUsers.find(u => u.clerkId === user.clerkId);
                  return (
                    <div
                      key={user.clerkId}
                      onClick={() => handleUserToggle(user)}
                      className={`flex items-center space-x-3 p-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                        isSelected ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        {user.image ? (
                          <Image
                            src={user.image}
                            alt={`${user.first_name} ${user.last_name}`}
                            className="w-10 h-10 rounded-full object-cover"
                            width={40}
                            height={40}
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {user.first_name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                        
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                            <UserPlus className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {user.first_name} {user.last_name}
                        </h3>
                        {user.email && (
                          <p className="text-sm text-gray-500 truncate">
                            {user.email}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'add' && isAdmin && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleAddMembers}
              disabled={selectedUsers.length === 0 || loading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                selectedUsers.length > 0 && !loading
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Adding...' : `Add ${selectedUsers.length} Member${selectedUsers.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageMembersModal;