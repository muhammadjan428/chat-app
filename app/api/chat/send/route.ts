import { NextRequest, NextResponse } from 'next/server';
import { sendMessage } from '@/lib/actions/chat.actions';
import { pusherServer, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';
import { Chat } from '@/lib/models/chat.model';
import { connectToDB } from '@/lib/database';

// Define the type for the chat with participants
interface ChatWithParticipants {
  _id: string;
  participants: string[];
}

export async function POST(req: NextRequest) {
  try {
    const { chatId, content, messageType } = await req.json();

    if (!chatId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Send message to database
    const message = await sendMessage(chatId, content, messageType);

    await connectToDB();
    
    // Get chat participants for Pusher notifications
    const chat = await Chat.findById(chatId).select('participants').lean() as ChatWithParticipants | null;
    
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Trigger Pusher event to all participants in the chat
    await pusherServer.trigger(
      PUSHER_CHANNELS.CHAT(chatId),
      PUSHER_EVENTS.NEW_MESSAGE,
      {
        message,
        chatId
      }
    );

    // Send notification to each participant's personal channel for unseen count updates
    const otherParticipants = chat.participants.filter(participantId => participantId !== message.senderId);
    
    await Promise.all(
      otherParticipants.map(participantId =>
        pusherServer.trigger(
          PUSHER_CHANNELS.USER(participantId),
          PUSHER_EVENTS.NEW_MESSAGE,
          {
            chatId,
            message,
            senderId: message.senderId
          }
        )
      )
    );

    return NextResponse.json(message, { status: 200 });
  } catch (error) {
    console.error('Send message API error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}