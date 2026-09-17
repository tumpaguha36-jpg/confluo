'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import {
  ArrowRight, GitMerge, Users, WifiOff, Check, Type, MessageSquare,
  Link2, ShieldCheck, ImageIcon, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import { track } from '@/lib/analytics';
import LiveDemo from '@/components/marketing/LiveDemo';

const PRIMARY_LABEL = 'Start writing — free';

function Nav({ scrolled }) {
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 h-14 transition-colors duration-200 ${
        scrolled ? 'border-b border-border bg-background/80 backdrop-blur-md' : 'bg-transparent'
      }`}
      style={{ top: 'env(safe-area-inset-top)' }}
    >
      <div className="container flex h-14 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#features" className="transition-colors hover:text-foreground">Product</a>
          <a href="#security" className="transition-colors hover:text-foreground">Security</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild onClick={() => track('cta_click', { location: 'nav' })}>
            <Link href="/register">{PRIMARY_LABEL}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="container relative pt-32 pb-16 md:pt-40 md:pb-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-2xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Conflict-free by design
          </span>
          <h1 className="mt-5 font-display text-[40px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[56px]">
            Write together.<br />Never lose a word.
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-muted-foreground">
            Confluo is a calm, collaborative editor built on three guarantees:
            <span className="text-foreground"> conflict-free merging</span>,
            <span className="text-foreground"> live cursors</span>, and
            <span className="text-foreground"> offline-safe</span> writing.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild onClick={() => track('cta_click', { location: 'hero' })}>
              <Link href="/register">{PRIMARY_LABEL} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="ghost" asChild onClick={() => track('demo_interact', { location: 'hero' })}>
              <Link href="/register?demo=1">Open a demo doc</Link>
            </Button>
          </div>
          <p className="mt-4 text-2xs text-muted-foreground">No credit card. Your edits merge, never overwrite.</p>
        </div>
        <div className="lg:pl-4">
          <LiveDemo onInteract={() => track('demo_interact', { location: 'hero_island' })} />
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  const items = [
    { value: '100%', label: 'convergence across simulated runs', tag: 'target' },
    { value: '≤ 150 ms', label: 'p95 live-cursor latency (LAN)', tag: 'target' },
    { value: '≤ 3 s', label: 'offline resync after reconnect', tag: 'target' },
  ];
  return (
    <section className="border-y border-border bg-card/40">
      <div className="container grid gap-8 py-10 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="text-center sm:text-left">
            <div className="flex items-baseline justify-center gap-2 sm:justify-start">
              <span className="font-display text-[28px] font-semibold text-foreground">{i.value}</span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{i.tag}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{i.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: GitMerge, title: 'Your edits merge, not overwrite', body: 'A CRDT keeps everyone’s changes. Two people editing the same line converge to one clean result — no “last write wins”.' },
    { icon: Users, title: 'See everyone, block by block', body: 'Live cursors and soft locks show who is where. A gentle chip marks the paragraph someone is actively editing.' },
    { icon: WifiOff, title: 'Offline is just a slower network', body: 'Edits persist locally in IndexedDB. Drop off, keep typing, and resync the moment the socket reopens.' },
  ];
  return (
    <section id="how" className="container py-20 md:py-28">
      <h2 className="max-w-2xl font-display text-[28px] font-semibold tracking-tight md:text-[40px]">How Confluo keeps your work whole</h2>
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        {steps.map((s, idx) => (
          <div key={s.title}>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-sm text-muted-foreground">0{idx + 1}</span>
              <h3 className="text-[18px] font-semibold">{s.title}</h3>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: Type, title: 'Rich text that reads well', body: 'Headings, lists, and images set in a proper serif measure. Writing feels like a book, not a form.' },
    { icon: MessageSquare, title: 'Comments & roles', body: 'Threaded comments anchored to text. Viewer, commenter, editor, and owner — each with the right reach.' },
    { icon: Link2, title: 'Sharing links', body: 'Invite by email or generate a role-scoped link with an expiry. Copy, send, done.' },
    { icon: Save, title: 'Version-safe saves', body: 'Snapshot writes with optimistic concurrency. Renamed elsewhere? Confluo tells you instead of clobbering.' },
    { icon: ImageIcon, title: 'Inline images', body: 'Paste, drop, or upload. A progress ring sits over the placeholder and never blocks your typing.' },
    { icon: ShieldCheck, title: 'Permissions you can see', body: 'A clear matrix, enforced on the server — not a checkbox that hopes for the best.' },
  ];
  return (
    <section id="features" className="border-t border-border bg-card/40">
      <div className="container py-20 md:py-28">
        <h2 className="max-w-2xl font-display text-[28px] font-semibold tracking-tight md:text-[40px]">Everything a long writing session needs</h2>
        <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.title}>
              <i.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-[17px] font-semibold">{i.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{i.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecurityMatrix() {
  const rows = [
    ['View document', true, true, true, true],
    ['Post comments', false, true, true, true],
    ['Edit content', false, false, true, true],
    ['Upload images', false, false, true, true],
    ['Manage sharing', false, false, false, true],
    ['Delete document', false, false, false, true],
  ];
  const roles = ['Viewer', 'Commenter', 'Editor', 'Owner'];
  const Cell = ({ on }) => on
    ? <Check className="mx-auto h-4 w-4 text-primary" aria-label="allowed" />
    : <span className="mx-auto block h-1 w-3 rounded-full bg-border" aria-label="not allowed" />;
  return (
    <section id="security" className="container py-20 md:py-28">
      <h2 className="max-w-2xl font-display text-[28px] font-semibold tracking-tight md:text-[40px]">Permissions you can read at a glance</h2>
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">Every capability is enforced on the server. Roles are explicit, never implied.</p>
      <div className="mt-10 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 font-medium text-muted-foreground">Capability</th>
              {roles.map((r) => <th key={r} className="px-4 py-3 text-center font-medium">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{row[0]}</td>
                {row.slice(1).map((v, j) => <td key={j} className="px-4 py-3 text-center"><Cell on={v} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    ['What happens if two people edit the same sentence?', 'Both edits are preserved and merged by the CRDT. There is no “last write wins”; the result converges to the same text on every client.'],
    ['Does it work offline?', 'Yes. Your edits are stored locally and resync automatically when the connection returns — usually within a few seconds.'],
    ['Can I control who can do what?', 'Yes. Assign viewer, commenter, editor, or owner. Permissions are enforced on the server, not just hidden in the UI.'],
    ['How do share links work?', 'Owners can generate a link scoped to a role with an expiry. Anyone who opens it (after signing in) gets that role on the document.'],
    ['Will I lose work if my tab crashes?', 'No. Content is persisted locally and to the server continuously, so a crash or reload restores exactly where you left off.'],
    ['Is my data locked in?', 'Documents are standard rich text. You keep full control of your content and can export it at any time.'],
  ];
  return (
    <section className="border-t border-border bg-card/40">
      <div className="container max-w-3xl py-20 md:py-28">
        <h2 className="font-display text-[28px] font-semibold tracking-tight md:text-[40px]">Questions, answered</h2>
        <div className="mt-8 divide-y divide-border">
          {qs.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] font-medium">
                {q}
                <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="container py-24 text-center md:py-32">
      <h2 className="mx-auto max-w-2xl font-display text-[32px] font-semibold tracking-tight md:text-[44px]">A place to write for hours.</h2>
      <p className="mx-auto mt-4 max-w-lg text-[17px] text-muted-foreground">Start a document and invite your team. Your words are safe from the first keystroke.</p>
      <div className="mt-8">
        <Button size="lg" asChild onClick={() => track('cta_click', { location: 'footer_cta' })}>
          <Link href="/register">{PRIMARY_LABEL} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 sm:flex-row">
        <Logo href={null} />
        <p className="text-2xs text-muted-foreground">© {new Date().getFullYear()} Confluo. Quiet precision for people who write.</p>
        <div className="flex gap-5 text-2xs text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Product</a>
          <a href="#security" className="hover:text-foreground">Security</a>
          <Link href="/login" className="hover:text-foreground">Log in</Link>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const idleRef = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <Nav scrolled={scrolled} />
      <main id="main">
        <Hero />
        <ProofStrip />
        <HowItWorks />
        <Features />
        <SecurityMatrix />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
