export interface Message {
  _id: string;
  content: string;
  senderId: string;
  chatId: string;
  createdAt: string;
  updatedAt?: string;
  messageType: 'text' | 'image' | 'file';
  isEdited?: boolean;
  editedAt?: string;
  sender: {
    clerkId: string;
    first_name: string;
    last_name: string;
    image?: string;
  };
  readBy?: {
    userId: string;
    readAt: string;
  }[];
  isRead?: boolean;
  readCount?: number;
  // Optimistic update fields
  isOptimistic?: boolean;
  isSending?: boolean;
  sendError?: boolean;
  tempId?: string;
}

export interface Chat {
  _id: string;
  participants: string[];
  participantDetails: {
    clerkId: string;
    first_name: string;
    last_name: string;
    image?: string;
    isOnline?: boolean;
    lastSeen?: string;
  }[];
  lastMessage?: string;
  lastMessageTime?: string;
  isGroup: boolean;
  name?: string;
  unseenCount?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  clerkId: string;
  first_name: string;
  last_name: string;
  image?: string;
  email: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface TypingUser {
  userId: string;
  userName: string;
  chatId: string;
}

export interface OnlineUser {
  userId: string;
  lastSeen?: string;
}

export interface PusherMessage {
  message: Message;
  chatId: string;
}

export interface PusherMessageRead {
  messageIds: string[];
  userId: string;
  chatId: string;
}

export interface PusherUserStatus {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface ChatState {
  chats: Chat[];
  selectedChat: Chat | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  error: string | null;
}

export interface MessageInputState {
  content: string;
  isTyping: boolean;
  typingUsers: TypingUser[];
}