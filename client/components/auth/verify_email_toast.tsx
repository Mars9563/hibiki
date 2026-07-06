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

    if (!shown.current && shouldShow) {
      shown.current = true;

      toast.info('Verify your email', {
        description:
          'Check your inbox and click the verification link before signing in.',
        duration: 10000,
      });

      router.replace('/login');
    }
  }, [searchParams, router]);

  return null;
}
