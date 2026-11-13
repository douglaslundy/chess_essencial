'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { hasStoredSession } from '@/lib/api/client';

/** Sends a player who is already signed in straight to the app instead of the public pages. */
export function SessionRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (hasStoredSession()) router.replace('/app');
  }, [router]);
  return null;
}
