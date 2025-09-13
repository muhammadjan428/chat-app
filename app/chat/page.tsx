'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useState, useEffect, useRef } from 'react';
import { pusherClient, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';
import { getUserChats, getChatMessages, createOrGetChat, getAvailableUsers, markMessagesAsRead } from '@/lib/actions/chat.actions';
import { Send, Plus, Search, MoreHorizontal, Smile, Paperclip, Check, CheckCheck } from 'lucide-react';
import Image from 'next/image';

interface Message {
  _id: string;
  content: string;
  senderId: string;
  createdAt: string;
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
}

interface Chat {
  _id: string;
  participants: string[];
  participantDetails: {
    clerkId: string;
    first_name: string;
    last_name: string;
    image?: string;
  }[];
  lastMessage?: string;
  lastMessageTime?: string;
  isGroup: boolean;
  name?: string;
  unseenCount?: number;
}

interface User {
  clerkId: string;
  first_name: string;
  last_name: string;
  image?: string;
  email: string;
}

export default function ChatPage() {
  const { userId } = useAuth();
  const { user } = useUser();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);

  // Load user chats
  useEffect(() => {
    const loadChats = async () => {
      try {
        const userChats = await getUserChats();
        setChats(userChats);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load chats:', error);
        setLoading(false);
      }
    };

    if (userId) {
      loadChats();
    }
  }, [userId]);

  // Load messages when chat is selected and mark as read
  useEffect(() => {
    const loadMessages = async () => {
      if (selectedChat) {
        try {
          const chatMessages = await getChatMessages(selectedChat._id);
          setMessages(chatMessages);
          
          // Mark messages as read when chat is opened
          if (selectedChat.unseenCount && selectedChat.unseenCount > 0) {
            const result = await markMessagesAsRead(selectedChat._id);
            if (result.success) {
              // Update the chat's unseen count in the sidebar
              setChats(prev => prev.map(chat => 
                chat._id === selectedChat._id 
                  ? { ...chat, unseenCount: 0 }
                  : chat
              ));
            }
          }
        } catch (error) {
          console.error('Failed to load messages:', error);
        }
      }
    };

    loadMessages();
  }, [selectedChat]);

  // Subscribe to Pusher events
  useEffect(() => {
    if (selectedChat && userId) {
      const channel = pusherClient.subscribe(PUSHER_CHANNELS.CHAT(selectedChat._id));
      
      channel.bind(PUSHER_EVENTS.NEW_MESSAGE, (data: { message: Message }) => {
        setMessages(prev => [...prev, data.message]);
        
        // If message is from another user, mark it as read immediately since chat is open
        if (data.message.senderId !== userId) {
          markMessagesAsRead(selectedChat._id);
        }
      });

      channel.bind(PUSHER_EVENTS.MESSAGE_READ, (data: { messageIds: string[], userId: string }) => {
        // Update read status for messages
        setMessages(prev => prev.map(msg => {
          if (data.messageIds.includes(msg._id)) {
            const newReadBy = msg.readBy ? [...msg.readBy] : [];
            if (!newReadBy.some(read => read.userId === data.userId)) {
              newReadBy.push({
                userId: data.userId,
                readAt: new Date().toISOString()
              });
            }
            return {
              ...msg,
              readBy: newReadBy,
              readCount: newReadBy.length
            };
          }
          return msg;
        }));
      });

      return () => {
        pusherClient.unsubscribe(PUSHER_CHANNELS.CHAT(selectedChat._id));
      };
    }
  }, [selectedChat, userId]);

  // Subscribe to general chat updates for unseen counts
  useEffect(() => {
    if (userId) {
      const userChannel = pusherClient.subscribe(PUSHER_CHANNELS.USER(userId));
      
      userChannel.bind(PUSHER_EVENTS.NEW_MESSAGE, (data: { chatId: string, message: Message }) => {
        // Update unseen count for chats not currently selected
        if (!selectedChat || selectedChat._id !== data.chatId) {
          setChats(prev => prev.map(chat => 
            chat._id === data.chatId 
              ? { 
                  ...chat, 
                  unseenCount: (chat.unseenCount || 0) + 1,
                  lastMessage: data.message.content,
                  lastMessageTime: data.message.createdAt
                }
              : chat
          ));
        }
      });

      return () => {
        pusherClient.unsubscribe(PUSHER_CHANNELS.USER(userId));
      };
    }
  }, [userId, selectedChat]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load available users for new chat
  useEffect(() => {
    const loadUsers = async () => {
      if (showNewChatModal) {
        const users = await getAvailableUsers(searchTerm);
        setAvailableUsers(users);
      }
    };

    loadUsers();
  }, [showNewChatModal, searchTerm]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChat._id,
          content: newMessage.trim(),
          messageType: 'text'
        })
      });

      if (response.ok) {
        setNewMessage('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const startNewChat = async (targetUser: User) => {
    try {
      const chat = await createOrGetChat([targetUser.clerkId]);
      const chatWithDetails = {
        ...chat,
        participantDetails: [
          {
            clerkId: targetUser.clerkId,
            first_name: targetUser.first_name,
            last_name: targetUser.last_name,
            image: targetUser.image
          }
        ],
        unseenCount: 0
      };
      
      setChats(prev => {
        const exists = prev.find(c => c._id === chat._id);
        if (exists) return prev;
        return [chatWithDetails, ...prev];
      });
      
      setSelectedChat(chatWithDetails);
      setShowNewChatModal(false);
      setSearchTerm('');
    } catch (error) {
      console.error('Failed to start new chat:', error);
    }
  };

  const getChatDisplayName = (chat: Chat) => {
    if (chat.isGroup && chat.name) return chat.name;
    
    const otherParticipant = chat.participantDetails.find(p => p.clerkId !== userId);
    if (otherParticipant) {
      return `${otherParticipant.first_name} ${otherParticipant.last_name}`;
    }
    
    return 'Unknown User';
  };

  const getChatDisplayImage = (chat: Chat) => {
    if (chat.isGroup) return null;
    
    const otherParticipant = chat.participantDetails.find(p => p.clerkId !== userId);
    return otherParticipant?.image;
  };

  const getMessageReadStatus = (message: Message) => {
    if (message.senderId !== userId) return null;

    const readCount = message.readCount || 0;
    const otherParticipantsCount = selectedChat?.participants.length ? selectedChat.participants.length - 1 : 0;

    if (readCount === 0 || !message.readBy || message.readBy.length <= 1) {
      return <Check className="w-4 h-4 text-gray-400" />;
    }

    if (readCount > 1 || (readCount === 1 && otherParticipantsCount === 1)) {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    }

    return <Check className="w-4 h-4 text-gray-400" />;
  };

  // Calculate total unseen messages across all chats
  const totalUnseenCount = chats.reduce((total, chat) => total + (chat.unseenCount || 0), 0);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {user?.imageUrl && (
                <div className="relative">
                  <Image
                    src={user.imageUrl}
                    alt="Profile"
                    className="w-10 h-10 rounded-full"
                    width={40}
                    height={40}
                  />
                  {totalUnseenCount > 0 && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                      {totalUnseenCount > 99 ? '99+' : totalUnseenCount}
                    </div>
                  )}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-gray-900">
                  {user?.firstName} {user?.lastName}
                </h1>
                <p className="text-sm text-gray-500">Online</p>
              </div>
            </div>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto" ref={chatListRef}>
          {chats.map((chat) => (
            <div
              key={chat._id}
              onClick={() => setSelectedChat(chat)}
              className={`p-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                selectedChat?._id === chat._id ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  {getChatDisplayImage(chat) ? (
                    <Image
                      src={getChatDisplayImage(chat)!}
                      alt={getChatDisplayName(chat)}
                      className="w-12 h-12 rounded-full"
                      width={48}
                      height={48}
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-medium">
                        {getChatDisplayName(chat).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white"></div>
                  {chat.unseenCount && chat.unseenCount > 0 && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                      {chat.unseenCount > 99 ? '99+' : chat.unseenCount}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-medium truncate ${
                      chat.unseenCount && chat.unseenCount > 0 
                        ? 'text-gray-900 font-semibold' 
                        : 'text-gray-900'
                    }`}>
                      {getChatDisplayName(chat)}
                    </h3>
                    {chat.lastMessageTime && (
                      <span className="text-xs text-gray-500">
                        {new Date(chat.lastMessageTime).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    )}
                  </div>
                  {chat.lastMessage && (
                    <p className={`text-sm truncate mt-1 ${
                      chat.unseenCount && chat.unseenCount > 0 
                        ? 'text-gray-900 font-medium' 
                        : 'text-gray-500'
                    }`}>
                      {chat.lastMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getChatDisplayImage(selectedChat) ? (
                    <Image
                      src={getChatDisplayImage(selectedChat)!}
                      alt={getChatDisplayName(selectedChat)}
                      className="w-10 h-10 rounded-full"
                      width={40}
                      height={40}
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 font-medium">
                        {getChatDisplayName(selectedChat).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      {getChatDisplayName(selectedChat)}
                    </h2>
                    <p className="text-sm text-gray-500">Online</p>
                  </div>
                </div>
                
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <MoreHorizontal className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={`flex ${
                    message.senderId === userId ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div className={`flex items-end space-x-2 max-w-xs lg:max-w-md ${
                    message.senderId === userId ? 'flex-row-reverse space-x-reverse' : ''
                  }`}>
                    {message.senderId !== userId && (
                      <div className="w-8 h-8 rounded-full overflow-hidden">
                        {message.sender?.image ? (
                          <Image
                            src={message.sender.image}
                            alt={`${message.sender.first_name} ${message.sender.last_name}`}
                            className="w-full h-full object-cover"
                            width={32}
                            height={32}
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                            <span className="text-xs text-gray-600 font-medium">
                              {message.sender?.first_name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        message.senderId === userId
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className={`text-xs ${
                          message.senderId === userId
                            ? 'text-blue-100'
                            : 'text-gray-500'
                        }`}>
                          {new Date(message.createdAt).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </p>
                        {message.senderId === userId && (
                          <div className="ml-2">
                            {getMessageReadStatus(message)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center space-x-3">
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </button>
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type a message..."
                    className="w-full px-4 py-3 pr-12 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  <button className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full">
                    <Smile className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
                
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full transition-colors"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="w-10 h-10 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Start a conversation
              </h2>
              <p className="text-gray-500 mb-4">
                Select a chat from the sidebar or start a new conversation
              </p>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                New Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Start New Chat</h2>
                <button
                  onClick={() => {
                    setShowNewChatModal(false);
                    setSearchTerm('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="max-h-60 overflow-y-auto">
                {availableUsers.map((user) => (
                  <div
                    key={user.clerkId}
                    onClick={() => startNewChat(user)}
                    className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                  >
                    {user.image ? (
                      <Image
                        src={user.image}
                        alt={`${user.first_name} ${user.last_name}`}
                        className="w-10 h-10 rounded-full"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-gray-600 font-medium">
                          {user.first_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                      </h3>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                  </div>
                ))}
                
                {availableUsers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm ? 'No users found' : 'Loading users...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}