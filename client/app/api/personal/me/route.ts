import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Forwards the browser's multipart form data straight through to
// Express as-is (name/username fields + an optional avatar file, all
// in one request). We don't parse the body here — req.formData()
// followed by a re-built FormData keeps the file as a real Blob
// rather than reading it into a JSON-safe shape and losing it.
export async function PATCH(req: Request) {
  try {
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
      `${process.env.BACKEND_BASE_URL}/api/personal/me`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          // Deliberately no Content-Type — fetch sets the correct
          // multipart boundary itself when the body is a FormData.
        },
        body: incomingForm,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.message || 'Failed to update profile.' },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: data.profile,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
