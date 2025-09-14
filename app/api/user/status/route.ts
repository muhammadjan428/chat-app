import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pusherServer, PUSHER_CHANNELS, PUSHER_EVENTS } from '@/lib/pusher';
import User from '@/lib/models/user.model';
import { connectToDB } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isOnline } = await req.json();

    if (typeof isOnline !== 'boolean') {
      return NextResponse.json({ error: 'Invalid isOnline value' }, { status: 400 });
    }

    await connectToDB();

    // Update user's last seen timestamp
    const updateData: any = {
      lastSeen: new Date()
    };

    await User.findOneAndUpdate(
      { clerkId: userId },
      updateData,
      { upsert: false }
    );

    // Broadcast status update to all users
    await pusherServer.trigger(
      'global',
      isOnline ? PUSHER_EVENTS.USER_ONLINE : PUSHER_EVENTS.USER_OFFLINE,
      {
        userId,
        isOnline,
        lastSeen: updateData.lastSeen.toISOString()
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User status API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}