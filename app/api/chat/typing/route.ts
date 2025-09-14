import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pusherServer, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';
import { Chat } from '@/lib/models/chat.model';
import User from '@/lib/models/user.model';
import { connectToDB } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId, isTyping } = await req.json();

    if (!chatId || typeof isTyping !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await connectToDB();

    // Verify user is participant in the chat
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get user details for the typing indicator
    const user = await User.findOne({ clerkId: userId }).select('first_name last_name').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userName = `${user.first_name} ${user.last_name}`;

    // Send typing indicator to chat channel
    const eventType = isTyping ? PUSHER_EVENTS.USER_TYPING : PUSHER_EVENTS.USER_STOP_TYPING;
    
    await pusherServer.trigger(
      PUSHER_CHANNELS.TYPING(chatId),
      eventType,
      {
        userId,
        userName,
        chatId
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Typing indicator API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}