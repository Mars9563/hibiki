import { NextResponse, type NextRequest } from 'next/server';

import { appUrl } from '@/lib/app_url';
import { createClient } from '@/lib/supabase/server';

// Supabase sends users here after they click the link in the confirmation email.
// The link carries a one-time code; exchanging it signs the user in. The exchange
// needs a secret stored in this browser at sign-up, so it fails on another device
// even though the email is already confirmed there.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL('/', appUrl()));
    }
  }

  return NextResponse.redirect(new URL('/login?verify_error=true', appUrl()));
}
