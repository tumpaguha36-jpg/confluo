'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Logo from '@/components/site/Logo';
import { useAuth, apiFetch, getToken } from '@/lib/auth';

export default function AcceptSharePage() {
  const router = useRouter();
  const { token } = useParams();
  const { user, loading } = useAuth();
  const [message, setMessage] = useState('Checking your invitation…');

  useEffect(() => {
    if (loading) return;
    if (!getToken()) {
      router.replace(`/login?next=/share/${token}`);
      return;
    }
    (async () => {
      try {
        const { docId } = await apiFetch(`/share/${token}/accept`, { method: 'POST', body: '{}' });
        setMessage('Opening the document…');
        router.replace(`/docs/${docId}`);
      } catch (err) {
        setMessage(err.message || 'This share link is invalid or has expired.');
      }
    })();
  }, [loading, token, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo href={null} />
      <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
