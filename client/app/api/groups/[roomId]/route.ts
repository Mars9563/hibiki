import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Updates a group's name/description/avatar. Forwards the browser's
// multipart form data straight through to Express as-is (the backend
// route uses multer.single('avatar')), same passthrough approach as
// PATCH /api/personal/me — we don't parse the body so the file stays a
// real Blob. Admin authorization is enforced server-side.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const incomingForm = await req.formData();

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
      `${process.env.BACKEND_BASE_URL}/api/groups/${roomId}`,
      {
        method: 'PATCH',
        headers: {
          // No Content-Type — fetch sets the multipart boundary itself.
          Authorization: `Bearer ${token}`,
        },
        body: incomingForm,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.message || 'Failed to update group' },
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
