'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import { useAuth, apiFetch } from '@/lib/auth';
import { track } from '@/lib/analytics';

function strengthOf(pw) {
  if (!pw) return { label: '', pct: 0, color: 'bg-border' };
  if (pw.length < 6) return { label: 'Too short', pct: 25, color: 'bg-destructive' };
  if (pw.length < 10) return { label: 'Okay', pct: 60, color: 'bg-warning' };
  return { label: 'Strong', pct: 100, color: 'bg-success' };
}

function RegisterInner() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const demo = params.get('demo');
  const next = params.get('next') || '/docs';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const strength = useMemo(() => strengthOf(password), [password]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setPending(true);
    track('signup_start', {});
    try {
      await register(email, password, name);
      if (demo) {
        try {
          const { doc } = await apiFetch('/docs', { method: 'POST', body: JSON.stringify({ title: 'Demo document' }) });
          router.push(`/docs/${doc.id}`);
          return;
        } catch (_) { /* fall through */ }
      }
      router.push(next);
    } catch (err) {
      setError(err.message || 'Could not create account');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="animate-fade-up space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {password && (
          <div className="flex items-center gap-2 pt-1">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <div className={`h-full ${strength.color} transition-all`} style={{ width: `${strength.pct}%` }} />
            </div>
            <span className="text-2xs text-muted-foreground">{strength.label}</span>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-card p-10 lg:flex">
        <Logo />
        <div>
          <blockquote className="font-editor text-[22px] leading-relaxed text-foreground">
            “Write together. Never lose a word.”
          </blockquote>
          <p className="mt-3 text-sm text-muted-foreground">Conflict-free merging, live cursors, offline-safe.</p>
        </div>
        <span className="text-2xs text-muted-foreground">© {new Date().getFullYear()} Confluo</span>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <Logo className="lg:hidden" />
          <span className="hidden lg:block" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-[28px] font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 mb-8 text-sm text-muted-foreground">Start writing in under a minute.</p>
            <Suspense fallback={null}><RegisterInner /></Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
