import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

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
      `${process.env.BACKEND_BASE_URL}/api/messages?${queryString}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const { success, messages } = await response.json();

    if (!response.ok || !messages) {
      return NextResponse.json(
        { success: false, error: 'Internal Server error.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success,
      messages,
    });
  } catch (error) {
    console.log(error);
    return NextResponse.json(
      { success: false, error: 'Failed in fetching chats' },
      { status: 500 }
    );
  }
}
