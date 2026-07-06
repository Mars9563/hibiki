import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: userData, error } = await supabase.auth.getUser();

    if (error || !userData.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const response = await fetch(`${process.env.BACKEND_BASE_URL}/api/rooms`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: 'Internal Server error.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rooms: data.rooms,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { success: false, error: 'Failed in fetching chats' },
      { status: 500 }
    );
  }
}
