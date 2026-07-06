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

    const userId = userData.user.id;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const response = await fetch(
      `${process.env.BACKEND_BASE_URL}/api/friendships/pending`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const backendData = await response.json();

    if (!response.ok || !backendData.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending requests.' },
        { status: 500 }
      );
    }

    const pending = backendData.pending || [];

    const sentPending = pending
      .filter((r: any) => r.requester_id === userId)
      .map((r: any) => ({
        type: 'sent',
        ...r,
      }));

    const recievedPending = pending
      .filter((r: any) => r.addressee_id === userId)
      .map((r: any) => ({
        type: 'recieved',
        ...r,
      }));

    return NextResponse.json({
      success: true,
      sentPending,
      recievedPending,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
