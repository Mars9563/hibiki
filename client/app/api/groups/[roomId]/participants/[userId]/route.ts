import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Changes a participant's role (used to promote a member to admin).
// Admin authorization is enforced server-side.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roomId: string; userId: string }> }
) {
  try {
    const { roomId, userId } = await params;
    const body = await req.json();
    const { role } = body as { role?: string };

    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json(
        { success: false, error: 'role must be "admin" or "member"' },
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
      `${process.env.BACKEND_BASE_URL}/api/groups/${roomId}/participants/${userId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.message || 'Failed to update role' },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({ success: true, room: data.room });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
