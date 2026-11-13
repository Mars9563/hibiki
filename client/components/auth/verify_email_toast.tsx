'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

export function VerifyEmailToast() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const shown = useRef(false);

  useEffect(() => {
    const shouldShow = searchParams.get('verify_email') === 'true';
    const linkFailed = searchParams.get('verify_error') === 'true';

    if (!shown.current && shouldShow) {
      shown.current = true;

      toast.info('Verify your email', {
        description:
          'Check your inbox and click the verification link before signing in.',
        duration: 10000,
      });

      router.replace('/login');
    } else if (!shown.current && linkFailed) {
      shown.current = true;

      // The link may still have confirmed the email (e.g. opened on another
      // device), so point the user at signing in rather than signing up again.
      toast.error('We could not sign you in from that link', {
        description:
          'It may have expired or already been used. Try signing in; if your email is not confirmed yet, register again to get a new link.',
        duration: 12000,
      });

      router.replace('/login');
    }
  }, [searchParams, router]);

  return null;
}
