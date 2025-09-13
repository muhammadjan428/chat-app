'use server';

import { auth } from '@clerk/nextjs/server';
import { Chat, Message } from '../models/chat.model';
import User from '../models/user.model';
import { connectToDB } from '../database';

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
        }).select('clerkId first_name last_name image').lean();

        // Count unseen messages for current user
        const unseenCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: userId }, // Not sent by current user
          'readBy.userId': { $ne: userId } // Not read by current user
        });

        return {
          ...chat,
          participantDetails: participants,
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

// Send message
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
      sender
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

// Mark messages as read - Updated with Pusher integration
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
    }).select('_id').lean();

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

// Mark single message as read
export const markMessageAsRead = async (messageId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false };

    await connectToDB();

    const message = await Message.findById(messageId);
    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    // Check if already read by this user
    const alreadyRead = message.readBy?.some(read => read.userId === userId);
    if (alreadyRead) {
      return { success: true, alreadyRead: true };
    }

    // Mark as read
    await Message.findByIdAndUpdate(messageId, {
      $push: {
        readBy: {
          userId,
          readAt: new Date()
        }
      }
    });

    return { success: true, alreadyRead: false };
  } catch (error) {
    console.error('[MARK_MESSAGE_READ_ERROR]', error);
    return { success: false };
  }
};

// Get unseen message count for a specific chat
export const getUnseenMessageCount = async (chatId: string) => {
  try {
    const { userId } = await auth();
    if (!userId) return 0;

    await connectToDB();

    const count = await Message.countDocuments({
      chatId,
      senderId: { $ne: userId }, // Not sent by current user
      'readBy.userId': { $ne: userId } // Not read by current user
    });

    return count;
  } catch (error) {
    console.error('[GET_UNSEEN_MESSAGE_COUNT_ERROR]', error);
    return 0;
  }
};

// Get total unseen message count across all chats
export const getTotalUnseenCount = async () => {
  try {
    const { userId } = await auth();
    if (!userId) return 0;

    await connectToDB();

    // Get all chats user is part of
    const userChats = await Chat.find({
      participants: userId
    }).select('_id').lean();

    const chatIds = userChats.map(chat => chat._id);

    // Count all unseen messages across user's chats
    const count = await Message.countDocuments({
      chatId: { $in: chatIds },
      senderId: { $ne: userId }, // Not sent by current user
      'readBy.userId': { $ne: userId } // Not read by current user
    });

    return count;
  } catch (error) {
    console.error('[GET_TOTAL_UNSEEN_COUNT_ERROR]', error);
    return 0;
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

    if (searchTerm) {
      query.$or = [
        { first_name: { $regex: searchTerm, $options: 'i' } },
        { last_name: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('clerkId first_name last_name image email')
      .limit(20)
      .lean();

    return JSON.parse(JSON.stringify(users));
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