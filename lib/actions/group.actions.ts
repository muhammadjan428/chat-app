"use server";
import { auth } from "@clerk/nextjs/server";
import { connectToDB } from "../database";
import { Chat, Message } from "../models/chat.model";
import User, { IUser } from "../models/user.model";
import { PUSHER_CHANNELS, PUSHER_EVENTS, pusherServer } from "../pusher";
import { GroupChatUpdate } from "@/types/chat";

// Define a type for the lean user document
type LeanUser = Pick<IUser, 'clerkId' | 'first_name' | 'last_name' | 'image' | 'email' | 'lastSeen'>;

// Update group chat details (name, description, image)
export const updateGroupChat = async (
  chatId: string, 
  updates: { 
    name?: string; 
    description?: string; 
    image?: string; 
  }
) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    // Check if user is admin of the group
    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Can only update group chats');
    if (!chat.admins.includes(userId)) throw new Error('Only admins can update group details');

    // Prepare update object
    const updateData: GroupChatUpdate = {};
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.description !== undefined) updateData.description = updates.description.trim();
    if (updates.image !== undefined) updateData.image = updates.image;

    // Update the group
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      updateData,
      { new: true }
    );

    // Get participant details for the response
    const participants = await User.find({
      clerkId: { $in: updatedChat.participants }
    }).select('clerkId first_name last_name image email lastSeen').lean<LeanUser[]>();

    const participantsWithStatus = participants.map(participant => {
      const lastSeen = participant.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000;
      
      return {
        ...participant,
        isOnline
      };
    });

    const groupData = {
      ...updatedChat.toObject(),
      participantDetails: participantsWithStatus
    };

    // Notify all participants about the update
    try {
      await Promise.all(
        updatedChat.participants.map(async (participantId: string) => {
          await pusherServer.trigger(
            PUSHER_CHANNELS.USER(participantId),
            PUSHER_EVENTS.CHAT_UPDATED,
            groupData
          );
        })
      );

      // Also send a system message about the update
      const updateMessage = `Group details updated by ${participants.find(p => p.clerkId === userId)?.first_name || 'Admin'}`;
      await pusherServer.trigger(
        PUSHER_CHANNELS.CHAT(chatId),
        PUSHER_EVENTS.NEW_MESSAGE,
        {
          chatId,
          message: {
            _id: new Date().toISOString(), // Temporary ID
            content: updateMessage,
            senderId: 'system',
            senderName: 'System',
            createdAt: new Date().toISOString(),
            isSystem: true
          }
        }
      );
    } catch (pusherError) {
      console.error('Pusher error in updateGroupChat:', pusherError);
    }

    return JSON.parse(JSON.stringify(groupData));
  } catch (error) {
    console.error('[UPDATE_GROUP_CHAT_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update group chat');
  }
};

// Add members to group chat
export const addGroupMembers = async (chatId: string, newMemberIds: string[]) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Can only add members to group chats');
    if (!chat.admins.includes(userId)) throw new Error('Only admins can add members');

    // Filter out existing participants
    const existingParticipants = new Set(chat.participants);
    const membersToAdd = newMemberIds.filter(id => !existingParticipants.has(id));
    
    if (membersToAdd.length === 0) {
      throw new Error('All selected users are already in the group');
    }

    // Add new members
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { $addToSet: { participants: { $each: membersToAdd } } },
      { new: true }
    );

    // Get participant details
    const participants = await User.find({
      clerkId: { $in: updatedChat.participants }
    }).select('clerkId first_name last_name image email lastSeen').lean<LeanUser[]>();

    const participantsWithStatus = participants.map(participant => {
      const lastSeen = participant.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000;
      
      return {
        ...participant,
        isOnline
      };
    });

    const groupData = {
      ...updatedChat.toObject(),
      participantDetails: participantsWithStatus
    };

    // Get names of added members for system message
    const addedMembers = participants.filter(p => membersToAdd.includes(p.clerkId));
    const addedMemberNames = addedMembers.map(m => `${m.first_name} ${m.last_name}`).join(', ');
    const adderName = participants.find(p => p.clerkId === userId)?.first_name || 'Admin';

    // Notify all participants (including new ones)
    try {
      await Promise.all(
        updatedChat.participants.map(async (participantId: string) => {
          await pusherServer.trigger(
            PUSHER_CHANNELS.USER(participantId),
            PUSHER_EVENTS.CHAT_UPDATED,
            groupData
          );
        })
      );

      // Send system message about new members
      await pusherServer.trigger(
        PUSHER_CHANNELS.CHAT(chatId),
        PUSHER_EVENTS.NEW_MESSAGE,
        {
          chatId,
          message: {
            _id: new Date().toISOString(),
            content: `${adderName} added ${addedMemberNames} to the group`,
            senderId: 'system',
            senderName: 'System',
            createdAt: new Date().toISOString(),
            isSystem: true
          }
        }
      );
    } catch (pusherError) {
      console.error('Pusher error in addGroupMembers:', pusherError);
    }

    return JSON.parse(JSON.stringify(groupData));
  } catch (error) {
    console.error('[ADD_GROUP_MEMBERS_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to add group members');
  }
};

// Remove member from group chat
export const removeGroupMember = async (chatId: string, memberIdToRemove: string) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Can only remove members from group chats');
    
    // Check permissions: admins can remove anyone (except other admins), users can remove themselves
    const isAdmin = chat.admins.includes(userId);
    const isRemovingSelf = userId === memberIdToRemove;
    const isTargetAdmin = chat.admins.includes(memberIdToRemove);
    
    if (!isAdmin && !isRemovingSelf) {
      throw new Error('Only admins can remove other members');
    }
    
    if (isTargetAdmin && !isRemovingSelf && userId !== chat.createdBy) {
      throw new Error('Only group creator can remove admins');
    }

    if (memberIdToRemove === chat.createdBy) {
      throw new Error('Group creator cannot be removed');
    }

    // Remove member
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { 
        $pull: { 
          participants: memberIdToRemove,
          admins: memberIdToRemove // Also remove from admins if they were admin
        } 
      },
      { new: true }
    );

    // Get participant details
    const participants = await User.find({
      clerkId: { $in: updatedChat.participants }
    }).select('clerkId first_name last_name image email lastSeen').lean<LeanUser[]>();

    // Get removed member details for system message
    const removedMember = await User.findOne({ clerkId: memberIdToRemove })
      .select('first_name last_name').lean<Pick<LeanUser, 'first_name' | 'last_name'>>();

    const participantsWithStatus = participants.map(participant => {
      const lastSeen = participant.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000;
      
      return {
        ...participant,
        isOnline
      };
    });

    const groupData = {
      ...updatedChat.toObject(),
      participantDetails: participantsWithStatus
    };

    // Notify remaining participants and the removed member
    try {
      const allToNotify = [...updatedChat.participants, memberIdToRemove];
      await Promise.all(
        allToNotify.map(async (participantId: string) => {
          await pusherServer.trigger(
            PUSHER_CHANNELS.USER(participantId),
            PUSHER_EVENTS.CHAT_UPDATED,
            groupData
          );
        })
      );

      // Send system message
      const removerName = participants.find(p => p.clerkId === userId)?.first_name || 'Admin';
      const removedMemberName = `${removedMember?.first_name || ''} ${removedMember?.last_name || ''}`.trim();
      const systemMessage = isRemovingSelf 
        ? `${removedMemberName} left the group`
        : `${removerName} removed ${removedMemberName} from the group`;

      await pusherServer.trigger(
        PUSHER_CHANNELS.CHAT(chatId),
        PUSHER_EVENTS.NEW_MESSAGE,
        {
          chatId,
          message: {
            _id: new Date().toISOString(),
            content: systemMessage,
            senderId: 'system',
            senderName: 'System',
            createdAt: new Date().toISOString(),
            isSystem: true
          }
        }
      );
    } catch (pusherError) {
      console.error('Pusher error in removeGroupMember:', pusherError);
    }

    return JSON.parse(JSON.stringify(groupData));
  } catch (error) {
    console.error('[REMOVE_GROUP_MEMBER_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to remove group member');
  }
};

// Promote/demote group admin
export const updateGroupAdmin = async (chatId: string, memberId: string, makeAdmin: boolean) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Can only manage admins in group chats');
    if (chat.createdBy !== userId) throw new Error('Only group creator can manage admins');
    if (!chat.participants.includes(memberId)) throw new Error('User is not a member of this group');

    const updateOperation = makeAdmin 
      ? { $addToSet: { admins: memberId } }
      : { $pull: { admins: memberId } };

    const updatedChat = await Chat.findByIdAndUpdate(chatId, updateOperation, { new: true });

    // Get participant details
    const participants = await User.find({
      clerkId: { $in: updatedChat.participants }
    }).select('clerkId first_name last_name image email lastSeen').lean<LeanUser[]>();

    const participantsWithStatus = participants.map(participant => {
      const lastSeen = participant.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000;
      
      return {
        ...participant,
        isOnline
      };
    });

    const groupData = {
      ...updatedChat.toObject(),
      participantDetails: participantsWithStatus
    };

    // Notify all participants
    try {
      await Promise.all(
        updatedChat.participants.map(async (participantId: string) => {
          await pusherServer.trigger(
            PUSHER_CHANNELS.USER(participantId),
            PUSHER_EVENTS.CHAT_UPDATED,
            groupData
          );
        })
      );

      // Send system message
      const memberName = participants.find(p => p.clerkId === memberId);
      const systemMessage = makeAdmin
        ? `${memberName?.first_name} ${memberName?.last_name} is now an admin`
        : `${memberName?.first_name} ${memberName?.last_name} is no longer an admin`;

      await pusherServer.trigger(
        PUSHER_CHANNELS.CHAT(chatId),
        PUSHER_EVENTS.NEW_MESSAGE,
        {
          chatId,
          message: {
            _id: new Date().toISOString(),
            content: systemMessage,
            senderId: 'system',
            senderName: 'System',
            createdAt: new Date().toISOString(),
            isSystem: true
          }
        }
      );
    } catch (pusherError) {
      console.error('Pusher error in updateGroupAdmin:', pusherError);
    }

    return JSON.parse(JSON.stringify(groupData));
  } catch (error) {
    console.error('[UPDATE_GROUP_ADMIN_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to update admin status');
  }
};

// Delete group chat (only creator can delete)
export const deleteGroupChat = async (chatId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Can only delete group chats');
    if (chat.createdBy !== userId) throw new Error('Only group creator can delete the group');

    // Get all participants before deletion for notifications
    const participantIds = [...chat.participants];

    // Delete all messages in the chat
    await Message.deleteMany({ chatId: chatId });

    // Delete the chat
    await Chat.findByIdAndDelete(chatId);

    // Notify all participants that the group was deleted
    try {
      await Promise.all(
        participantIds.map(async (participantId: string) => {
          await pusherServer.trigger(
            PUSHER_CHANNELS.USER(participantId),
            PUSHER_EVENTS.CHAT_DELETED,
            { chatId }
          );
        })
      );
    } catch (pusherError) {
      console.error('Pusher error in deleteGroupChat:', pusherError);
    }

    return { success: true, message: 'Group chat deleted successfully' };
  } catch (error) {
    console.error('[DELETE_GROUP_CHAT_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete group chat');
  }
};

// Get group chat details with member info and permissions
export const getGroupChatDetails = async (chatId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Not a group chat');
    if (!chat.participants.includes(userId)) throw new Error('You are not a member of this group');

    // Get participant details
    const participants = await User.find({
      clerkId: { $in: chat.participants }
    }).select('clerkId first_name last_name image email lastSeen').lean<LeanUser[]>();

    const participantsWithStatus = participants.map(participant => {
      const lastSeen = participant.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000;
      const isAdmin = chat.admins.includes(participant.clerkId);
      const isCreator = chat.createdBy === participant.clerkId;
      
      return {
        ...participant,
        isOnline,
        isAdmin,
        isCreator
      };
    });

    const groupData = {
      ...chat.toObject(),
      participantDetails: participantsWithStatus,
      currentUserPermissions: {
        isAdmin: chat.admins.includes(userId),
        isCreator: chat.createdBy === userId,
        canAddMembers: chat.admins.includes(userId),
        canRemoveMembers: chat.admins.includes(userId),
        canUpdateGroup: chat.admins.includes(userId),
        canDeleteGroup: chat.createdBy === userId,
        canManageAdmins: chat.createdBy === userId
      }
    };

    return JSON.parse(JSON.stringify(groupData));
  } catch (error) {
    console.error('[GET_GROUP_CHAT_DETAILS_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to get group chat details');
  }
};

// Leave group chat (user removes themselves)
export const leaveGroupChat = async (chatId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const chat = await Chat.findById(chatId);
    if (!chat) throw new Error('Group chat not found');
    if (!chat.isGroup) throw new Error('Can only leave group chats');
    if (!chat.participants.includes(userId)) throw new Error('You are not a member of this group');

    // Creator cannot leave the group - they must delete it or transfer ownership
    if (chat.createdBy === userId) {
      throw new Error('Group creator cannot leave. Please delete the group or transfer ownership first.');
    }

    // Remove user from participants and admins (if they were admin)
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      { 
        $pull: { 
          participants: userId,
          admins: userId // Also remove from admins if they were admin
        } 
      },
      { new: true }
    );

    // Get leaving user's details for system message
    const leavingUser = await User.findOne({ clerkId: userId })
      .select('first_name last_name').lean<Pick<LeanUser, 'first_name' | 'last_name'>>();

    // Get remaining participant details
    const participants = await User.find({
      clerkId: { $in: updatedChat.participants }
    }).select('clerkId first_name last_name image email lastSeen').lean<LeanUser[]>();

    const participantsWithStatus = participants.map(participant => {
      const lastSeen = participant.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000;
      
      return {
        ...participant,
        isOnline
      };
    });

    const groupData = {
      ...updatedChat.toObject(),
      participantDetails: participantsWithStatus
    };

    // Notify remaining participants and the user who left
    try {
      const allToNotify = [...updatedChat.participants, userId];
      await Promise.all(
        allToNotify.map(async (participantId: string) => {
          await pusherServer.trigger(
            PUSHER_CHANNELS.USER(participantId),
            PUSHER_EVENTS.CHAT_UPDATED,
            groupData
          );
        })
      );

      // Send system message to remaining participants
      const leavingUserName = `${leavingUser?.first_name || ''} ${leavingUser?.last_name || ''}`.trim();
      await pusherServer.trigger(
        PUSHER_CHANNELS.CHAT(chatId),
        PUSHER_EVENTS.NEW_MESSAGE,
        {
          chatId,
          message: {
            _id: new Date().toISOString(),
            content: `${leavingUserName} left the group`,
            senderId: 'system',
            senderName: 'System',
            createdAt: new Date().toISOString(),
            isSystem: true
          }
        }
      );
    } catch (pusherError) {
      console.error('Pusher error in leaveGroupChat:', pusherError);
    }

    return { 
      success: true, 
      message: 'Successfully left the group',
      chatId: chatId
    };
  } catch (error) {
    console.error('[LEAVE_GROUP_CHAT_ERROR]', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to leave group chat');
  }
};