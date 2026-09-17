'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import { useAuth } from '@/lib/auth';
import { track } from '@/lib/analytics';
import { toast } from 'sonner';

function LoginInner() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/docs';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(email, password);
      router.push(next);
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="animate-fade-up space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Confluo? <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-card p-10 lg:flex">
        <Logo />
        <div>
          <blockquote className="font-editor text-[22px] leading-relaxed text-foreground">
            “It feels like writing in a well-set book — and I never think about saving.”
          </blockquote>
          <p className="mt-3 text-sm text-muted-foreground">A place to write for hours.</p>
        </div>
        <span className="text-2xs text-muted-foreground">Conflict-free · Live cursors · Offline-safe</span>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <Logo className="lg:hidden" />
          <span className="hidden lg:block" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-[28px] font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 mb-8 text-sm text-muted-foreground">Sign in to your documents.</p>
            <Suspense fallback={null}><LoginInner /></Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
