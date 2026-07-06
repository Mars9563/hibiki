import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { targetId } = body;

    if (!targetId) {
      return NextResponse.json(
        { success: false, error: 'Missing targetId' },
        { status: 400 }
      );
    }

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

    const response = await fetch(
      `${process.env.BACKEND_BASE_URL}/api/friendships/accept`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetId }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.error || 'Internal server error.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: targetId,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to accept request.' },
      { status: 500 }
    );
  }
}
