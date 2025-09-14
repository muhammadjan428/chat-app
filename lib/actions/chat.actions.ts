'use server';

import { auth } from '@clerk/nextjs/server';
import { Chat, Message } from '../models/chat.model';
import User from '../models/user.model';
import { connectToDB } from '../database';
import { pusherServer, PUSHER_CHANNELS, PUSHER_EVENTS } from '../pusher';

// Get all chats for current user with unseen message counts
export const getUserChats = async () => {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    await connectToDB();
    
    const chats = await Chat.find({
      participants: userId
    })
    .sort({ updatedAt: -1 })
    .lean();

    // Get participant details and unseen message counts for each chat
    const chatsWithParticipants = await Promise.all(
      chats.map(async (chat) => {
        const participants = await User.find({
          clerkId: { $in: chat.participants }
        }).select('clerkId first_name last_name image lastSeen').lean();

        // Count unseen messages for current user
        const unseenCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: userId }, // Not sent by current user
          'readBy.userId': { $ne: userId } // Not read by current user
        });

        // Determine online status for participants
        const participantsWithStatus = participants.map(participant => {
          const lastSeen = participant.lastSeen || new Date(0);
          const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000; // 5 minutes
          
          return {
            ...participant,
            isOnline
          };
        });

        return {
          ...chat,
          participantDetails: participantsWithStatus,
          unseenCount
        };
      })
    );

    return JSON.parse(JSON.stringify(chatsWithParticipants));
  } catch (error) {
    console.error('[GET_USER_CHATS_ERROR]', error);
    return [];
  }
};

// Create or get existing chat between users
export const createOrGetChat = async (participantIds: string[]) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    // Add current user to participants if not already included
    const allParticipants = [...new Set([userId, ...participantIds])];

    // For direct messages (2 participants), check if chat already exists
    if (allParticipants.length === 2) {
      const existingChat = await Chat.findOne({
        participants: { $all: allParticipants, $size: 2 },
        isGroup: false
      });

      if (existingChat) {
        return JSON.parse(JSON.stringify(existingChat));
      }
    }

    // Create new chat
    const newChat = await Chat.create({
      participants: allParticipants,
      isGroup: allParticipants.length > 2,
      createdBy: userId
    });

    return JSON.parse(JSON.stringify(newChat));
  } catch (error) {
    console.error('[CREATE_OR_GET_CHAT_ERROR]', error);
    throw new Error('Failed to create chat');
  }
};

// Send message with enhanced Pusher integration
export const sendMessage = async (chatId: string, content: string, messageType: 'text' | 'image' | 'file' = 'text') => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    // Verify user is participant in the chat
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      throw new Error('Unauthorized to send message to this chat');
    }

    // Create message with sender marked as read
    const message = await Message.create({
      chatId,
      senderId: userId,
      content,
      messageType,
      readBy: [{
        userId,
        readAt: new Date()
      }]
    });

    // Update chat's last message info
    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: content,
      lastMessageTime: message.createdAt,
      updatedAt: new Date()
    });

    // Get sender details for the message
    const sender = await User.findOne({ clerkId: userId })
      .select('clerkId first_name last_name image')
      .lean();

    const messageWithSender = {
      ...message.toObject(),
      sender,
      readCount: 1,
      isRead: true
    };

    return JSON.parse(JSON.stringify(messageWithSender));
  } catch (error) {
    console.error('[SEND_MESSAGE_ERROR]', error);
    throw new Error('Failed to send message');
  }
};

// Get messages for a chat
export const getChatMessages = async (chatId: string, page: number = 1, limit: number = 50) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    // Verify user is participant in the chat
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      throw new Error('Unauthorized to view messages in this chat');
    }

    const skip = (page - 1) * limit;

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get sender details for each message
    const senderIds = [...new Set(messages.map(msg => msg.senderId))];
    const senders = await User.find({
      clerkId: { $in: senderIds }
    }).select('clerkId first_name last_name image').lean();

    const senderMap = senders.reduce((acc, sender) => {
      acc[sender.clerkId] = sender;
      return acc;
    }, {} as any);

    const messagesWithSenders = messages.map(message => ({
      ...message,
      sender: senderMap[message.senderId],
      isRead: message.readBy?.some(read => read.userId === userId),
      readCount: message.readBy?.length || 0
    }));

    return JSON.parse(JSON.stringify(messagesWithSenders.reverse()));
  } catch (error) {
    console.error('[GET_CHAT_MESSAGES_ERROR]', error);
    return [];
  }
};

// Mark messages as read with enhanced Pusher integration
export const markMessagesAsRead = async (chatId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false };

    await connectToDB();

    // Get unread messages in the chat by current user
    const unreadMessages = await Message.find({
      chatId,
      senderId: { $ne: userId }, // Not sent by current user
      'readBy.userId': { $ne: userId } // Not read by current user
    }).select('_id senderId').lean();

    if (unreadMessages.length === 0) {
      return { success: true, markedCount: 0 };
    }

    const messageIds = unreadMessages.map(msg => msg._id);

    // Mark all unread messages in the chat as read by current user
    const result = await Message.updateMany(
      {
        _id: { $in: messageIds }
      },
      {
        $push: {
          readBy: {
            userId,
            readAt: new Date()
          }
        }
      }
    );

    // Send Pusher event for read receipts
    if (result.modifiedCount > 0) {
      try {
        await pusherServer.trigger(
          PUSHER_CHANNELS.CHAT(chatId),
          PUSHER_EVENTS.MESSAGE_READ,
          {
            messageIds: messageIds.map(id => id.toString()),
            userId,
            chatId
          }
        );
      } catch (pusherError) {
        console.error('Pusher error in markMessagesAsRead:', pusherError);
        // Don't fail the operation if Pusher fails
      }
    }

    return { 
      success: true, 
      markedCount: result.modifiedCount,
      messageIds: messageIds.map(id => id.toString())
    };
  } catch (error) {
    console.error('[MARK_MESSAGES_READ_ERROR]', error);
    return { success: false, markedCount: 0 };
  }
};

// Get users to start new chat with
export const getAvailableUsers = async (searchTerm?: string) => {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    await connectToDB();

    const query: any = {
      clerkId: { $ne: userId } // Exclude current user
    };

    if (searchTerm && searchTerm.length > 0) {
      query.$or = [
        { first_name: { $regex: searchTerm, $options: 'i' } },
        { last_name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('clerkId first_name last_name image email lastSeen')
      .limit(20)
      .lean();

    // Add online status
    const usersWithStatus = users.map(user => {
      const lastSeen = user.lastSeen || new Date(0);
      const isOnline = (Date.now() - new Date(lastSeen).getTime()) < 300000; // 5 minutes
      
      return {
        ...user,
        isOnline
      };
    });

    return JSON.parse(JSON.stringify(usersWithStatus));
  } catch (error) {
    console.error('[GET_AVAILABLE_USERS_ERROR]', error);
    return [];
  }
};

// Delete message
export const deleteMessage = async (messageId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const message = await Message.findById(messageId);
    if (!message || message.senderId !== userId) {
      throw new Error('Unauthorized to delete this message');
    }

    await Message.findByIdAndDelete(messageId);
    return { success: true };
  } catch (error) {
    console.error('[DELETE_MESSAGE_ERROR]', error);
    return { success: false };
  }
};

// Edit message
export const editMessage = async (messageId: string, newContent: string) => {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Unauthorized');

    await connectToDB();

    const message = await Message.findById(messageId);
    if (!message || message.senderId !== userId) {
      throw new Error('Unauthorized to edit this message');
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        content: newContent,
        isEdited: true,
        editedAt: new Date()
      },
      { new: true }
    ).lean();

    return JSON.parse(JSON.stringify(updatedMessage));
  } catch (error) {
    console.error('[EDIT_MESSAGE_ERROR]', error);
    throw new Error('Failed to edit message');
  }
};