import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Same reasoning as app/api/personal/me/route.ts — req.formData()
// followed by a re-built FormData keeps files as real Blobs instead
// of reading them into a JSON-safe shape and losing them.
export async function POST(
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
      `${process.env.BACKEND_BASE_URL}/api/rooms/${roomId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // No Content-Type — fetch sets the multipart boundary
          // itself when the body is a FormData.
        },
        body: incomingForm,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.message || 'Failed to send message.' },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({ success: true, message: data.message });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
