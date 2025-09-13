import { auth } from '@clerk/nextjs/server';
import { pusherServer } from '@/lib/pusher';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.text();
    const params = new URLSearchParams(body);
    const socketId = params.get('socket_id');
    const channel = params.get('channel_name');

    if (!socketId || !channel) {
      return new Response('Missing socket_id or channel_name', { status: 400 });
    }

    // Authorize user for their own user channel and chat channels they're part of
    const userData = {
      user_id: userId,
      user_info: {
        id: userId,
      },
    };

    const authResponse = pusherServer.authorizeChannel(socketId, channel, userData);
    
    return new Response(JSON.stringify(authResponse), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Pusher auth error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}