// components/GroupSettingsModal.tsx
import { useState, useEffect } from 'react';
import { X, Users, Edit3, Camera, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { Chat } from '@/types/chat';
import { updateGroupChat, deleteGroupChat } from '@/lib/actions/group.actions';

interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  currentUserId: string;
  onGroupUpdated: (updatedChat: Chat) => void;
  onGroupDeleted: (chatId: string) => void;
  onManageMembersClick: () => void;
}

const GroupSettingsModal = ({ 
  isOpen, 
  onClose, 
  chat, 
  currentUserId,
  onGroupUpdated,
  onGroupDeleted,
  onManageMembersClick
}: GroupSettingsModalProps) => {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupImage, setGroupImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    if (isOpen && chat) {
      setGroupName(chat.name || '');
      setGroupDescription(chat.description || '');
      setGroupImage(chat.image || '');
    } else if (!isOpen) {
      // Reset form when modal closes
      setGroupName('');
      setGroupDescription('');
      setGroupImage('');
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  }, [isOpen, chat]);

  const isAdmin = chat?.admins?.includes(currentUserId);
  const isCreator = chat?.createdBy === currentUserId;

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat || !isAdmin) return;

    try {
      setLoading(true);
      const updatedChat = await updateGroupChat(chat._id, {
        name: groupName.trim(),
        description: groupDescription.trim(),
        image: groupImage.trim()
      });
      
      onGroupUpdated(updatedChat);
      onClose();
    } catch (error) {
      console.error('Failed to update group:', error);
      alert(error instanceof Error ? error.message : 'Failed to update group');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!chat || !isCreator || deleteConfirmText !== chat.name) return;

    try {
      setLoading(true);
      await deleteGroupChat(chat._id);
      onGroupDeleted(chat._id);
      onClose();
    } catch (error) {
      console.error('Failed to delete group:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete group');
    } finally {
      setLoading(false);
    }
  };

  const canUpdate = groupName.trim().length > 0 && isAdmin;

  if (!isOpen || !chat || !chat.isGroup) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Group Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!showDeleteConfirm ? (
            <>
              {/* Group Image */}
              <div className="p-6 border-b border-gray-200 text-center">
                <div className="relative mx-auto w-24 h-24 mb-4">
                  {groupImage ? (
                    <Image
                      src={groupImage}
                      alt={groupName}
                      className="w-24 h-24 rounded-full object-cover"
                      width={96}
                      height={96}
                    />
                  ) : (
                    <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                      <Users className="w-12 h-12 text-white" />
                    </div>
                  )}
                  {isAdmin && (
                    <button className="absolute bottom-0 right-0 bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full shadow-lg transition-colors">
                      <Camera className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {/* Group Stats */}
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">
                    {chat.participantDetails?.length || 0} members
                  </p>
                  <p className="text-xs text-gray-400">
                    Created by {chat.participantDetails?.find(p => p.clerkId === chat.createdBy)?.first_name || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Form */}
              {isAdmin ? (
                <form onSubmit={handleUpdateGroup} className="p-6 space-y-4">
                  {/* Group Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Group Name
                    </label>
                    <div className="relative">
                      <Edit3 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Enter group name..."
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        maxLength={50}
                        required
                      />
                    </div>
                  </div>

                  {/* Group Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      placeholder="Enter group description..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      maxLength={200}
                    />
                  </div>

                  {/* Group Image URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Group Image URL (Optional)
                    </label>
                    <input
                      type="url"
                      value={groupImage}
                      onChange={(e) => setGroupImage(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Update Button */}
                  <button
                    type="submit"
                    disabled={!canUpdate || loading}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                      canUpdate && !loading
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {loading ? 'Updating...' : 'Update Group'}
                  </button>
                </form>
              ) : (
                <div className="p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Group Name
                      </label>
                      <p className="text-gray-900 bg-gray-50 px-4 py-3 rounded-lg">
                        {chat.name || 'Unnamed Group'}
                      </p>
                    </div>
                    
                    {chat.description && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description
                        </label>
                        <p className="text-gray-900 bg-gray-50 px-4 py-3 rounded-lg">
                          {chat.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="p-6 border-t border-gray-200 space-y-3">
                <button
                  onClick={onManageMembersClick}
                  className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                >
                  <Users className="w-4 h-4" />
                  <span>Manage Members</span>
                </button>

                {isCreator && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Group</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Delete Confirmation */
            <div className="p-6 space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Group</h3>
                <p className="text-gray-600 mb-4">
                  This action cannot be undone. All messages and group data will be permanently deleted.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {`Type the group name "${chat.name}" to confirm:`}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={chat.name}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteGroup}
                  disabled={deleteConfirmText !== chat.name || loading}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    deleteConfirmText === chat.name && !loading
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Deleting...' : 'Delete Group'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupSettingsModal;