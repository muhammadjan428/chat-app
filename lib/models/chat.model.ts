// lib/models/chat.model.ts
import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  // Existing fields
  participants: [{
    type: String,
    required: true
  }],
  isGroup: {
    type: Boolean,
    default: false
  },
  lastMessage: {
    type: String,
    default: ''
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
    required: true
  },
  
  // New group-specific fields
  name: {
    type: String,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  image: {
    type: String,
    trim: true
  },
  admins: [{
    type: String
  }]
}, {
  timestamps: true
});

// Add indexes
ChatSchema.index({ participants: 1 });
ChatSchema.index({ updatedAt: -1 });
ChatSchema.index({ isGroup: 1 });

// Validation for group chats
ChatSchema.pre('save', function(next) {
  if (this.isGroup && !this.name) {
    next(new Error('Group chats must have a name'));
  } else if (!this.isGroup && this.participants.length !== 2) {
    next(new Error('Direct chats must have exactly 2 participants'));
  } else if (this.isGroup && this.participants.length < 2) {
    next(new Error('Group chats must have at least 2 participants'));
  } else {
    next();
  }
});

export const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

// Message Schema (keeping your existing structure)
const MessageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  senderId: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  readBy: [{
    userId: String,
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  deliveredTo: [{
    userId: String,
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date
}, {
  timestamps: true
});

// Add indexes for messages
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ 'readBy.userId': 1 });

export const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);