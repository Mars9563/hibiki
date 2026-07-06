import { AppBootstrap } from '@/features/chat/AppBootStrap';
import { ChatLayout } from '@/features/chat/layout/ChatLayout';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export default async function Home() {
  let userData: Profile | null = null;
  try {
    // This is a server component, so it must use the server Supabase
    // client (cookie-based) — the browser client used here previously
    // has no session in this context, which meant `token` below was
    // always undefined, every request to /api/personal/me 401'd, and
    // initialUser silently became undefined for every user on first
    // load. That bug is the root of "currentUser shows up as undefined"
    // — see also: GET /me now always returns a single object, not an
    // array, so there's no [0] indexing footgun left on this end either.
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const response = await fetch(
      process.env.BACKEND_BASE_URL + '/api/personal/me',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();
    if (response.ok && data.success) {
      userData = data.profile;
    } else {
      console.error('Failed to load initial profile:', data);
    }
  } catch (error) {
    console.log(error);
  }

  return (
    <>
      <AppBootstrap initialUser={userData}>
        <ChatLayout />
      </AppBootstrap>
    </>
  );
}
