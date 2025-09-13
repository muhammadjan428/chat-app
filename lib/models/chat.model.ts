import { Schema, model, models, Document } from 'mongoose';
// import { IUser } from './user.model';

// Chat Room Schema
export interface IChat extends Document {
  _id: string;
  name?: string; // Optional for group chats
  participants: string[]; // Array of user clerkIds
  isGroup: boolean;
  lastMessage?: string;
  lastMessageTime?: Date;
  createdBy: string; // clerkId of creator
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema = new Schema<IChat>({
  name: { 
    type: String, 
    required: function() { 
      return this.isGroup; // Name required only for group chats
    } 
  },
  participants: [{ 
    type: String, 
    required: true 
  }],
  isGroup: { 
    type: Boolean, 
    default: false 
  },
  lastMessage: String,
  lastMessageTime: Date,
  createdBy: { 
    type: String, 
    required: true 
  }
}, {
  timestamps: true
});

// Message Schema
export interface IMessage extends Document {
  _id: string;
  chatId: string; // Reference to chat room
  senderId: string; // clerkId of sender
  content: string;
  messageType: 'text' | 'image' | 'file';
  isEdited: boolean;
  editedAt?: Date;
  replyTo?: string; // Reference to another message ID
  readBy: {
    userId: string;
    readAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  chatId: { 
    type: String, 
    required: true,
    index: true // Index for faster queries
  },
  senderId: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  messageType: { 
    type: String, 
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  isEdited: { 
    type: Boolean, 
    default: false 
  },
  editedAt: Date,
  replyTo: String,
  readBy: [{
    userId: { type: String, required: true },
    readAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Add compound index for efficient message queries
MessageSchema.index({ chatId: 1, createdAt: -1 });

// Export models
const Chat = models.Chat || model<IChat>('Chat', ChatSchema);
const Message = models.Message || model<IMessage>('Message', MessageSchema);

export { Chat, Message };