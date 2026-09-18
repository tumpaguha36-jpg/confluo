'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import {
  ArrowRight, GitMerge, Users, WifiOff, Check, Type, MessageSquare,
  Link2, ShieldCheck, ImageIcon, Save, Menu, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';

// Confluo ribbon/infinity symbol
function ConfluoMark({ className = 'w-6 h-6', strokeWidth = 2.4, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 21C3.8 18 4.2 12 8.5 9C13 6 17 11 15 15C13 19 8.5 19 9.5 14C10.5 9 18 8 22 11C26 14 26 20 21.5 22.5C17 25 13 20 16 16C19 12 24 12 23 17"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Generates smooth closed organic topographic contour paths
function generateContourPath(cx, cy, rx, ry, seed, points = 72) {
  let d = '';
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    const deform =
      1 +
      0.13 * Math.sin(2 * theta + seed * 0.9) +
      0.08 * Math.cos(3 * theta + seed * 1.4) +
      0.04 * Math.sin(5 * theta + seed * 0.4);
    const x = cx + rx * deform * Math.cos(theta);
    const y = cy + ry * deform * Math.sin(theta);
    d += (i === 0 ? 'M' : 'L') + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return d + 'Z';
}

function TopographicContours() {
  // Pre-calculate concentric rings for both elevation centers
  const pathsCluster1 = useMemo(() => {
    const rings = [];
    const totalRings = 17;
    for (let i = 1; i <= totalRings; i++) {
      const rx = 35 + i * 22;
      const ry = 28 + i * 19;
      const opacity = Math.max(0.12, 0.7 - i * 0.032);
      rings.push({
        d: generateContourPath(680, 390, rx, ry, i * 0.4),
        opacity,
      });
    }
    return rings;
  }, []);

  const pathsCluster2 = useMemo(() => {
    const rings = [];
    const totalRings = 14;
    for (let i = 1; i <= totalRings; i++) {
      const rx = 30 + i * 24;
      const ry = 28 + i * 22;
      const opacity = Math.max(0.1, 0.65 - i * 0.035);
      rings.push({
        d: generateContourPath(920, 720, rx, ry, i * 0.5 + 2),
        opacity,
      });
    }
    return rings;
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="contourGrad1" x1="20%" y1="10%" x2="90%" y2="80%">
            <stop offset="0%" stopColor="#9333EA" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#6366F1" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="contourGrad2" x1="10%" y1="30%" x2="95%" y2="90%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#3B82F6" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Cluster 2 (Bottom right elevation) */}
        <g stroke="url(#contourGrad2)" strokeWidth="1.2">
          {pathsCluster2.map((p, idx) => (
            <path key={`c2-${idx}`} d={p.d} strokeOpacity={p.opacity} />
          ))}
        </g>

        {/* Cluster 1 (Main center-right elevation) */}
        <g stroke="url(#contourGrad1)" strokeWidth="1.25">
          {pathsCluster1.map((p, idx) => (
            <path key={`c1-${idx}`} d={p.d} strokeOpacity={p.opacity} />
          ))}
        </g>
      </svg>
    </div>
  );
}

function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-20 bg-black/50 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-12">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <ConfluoMark className="h-5 w-5 text-white" strokeWidth={2.4} color="#FFFFFF" />
          <span className="font-sans text-[13px] font-bold tracking-[0.25em] text-white">
            CONFLUO
          </span>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden items-center gap-10 md:flex">
          <a
            href="#features"
            className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 transition-colors hover:text-white"
          >
            PRODUCT
          </a>
          <a
            href="#how"
            className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 transition-colors hover:text-white"
          >
            HOW IT WORKS
          </a>
          <a
            href="#security"
            className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 transition-colors hover:text-white"
          >
            SECURITY
          </a>
        </nav>

        {/* Right CTA + Hamburger */}
        <div className="flex items-center gap-4">
          <Button
            asChild
            className="rounded-full bg-[#4F46E5] px-6 py-2.5 text-[11px] font-bold tracking-wider text-white uppercase shadow-[0_0_20px_rgba(79,70,229,0.35)] transition-all hover:bg-[#4338CA] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]"
          >
            <Link href="/docs">OPEN DOCUMENTS</Link>
          </Button>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex flex-col gap-1.5 p-1 text-white focus:outline-none md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <>
                <span className="block h-0.5 w-5 bg-white" />
                <span className="block h-0.5 w-5 bg-white" />
                <span className="block h-0.5 w-5 bg-white" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-b border-zinc-800 bg-black/95 px-6 py-6 md:hidden">
          <div className="flex flex-col space-y-4 text-xs font-semibold tracking-wider text-zinc-300">
            <a href="#features" onClick={() => setMobileOpen(false)} className="hover:text-white">
              PRODUCT
            </a>
            <a href="#how" onClick={() => setMobileOpen(false)} className="hover:text-white">
              HOW IT WORKS
            </a>
            <a href="#security" onClick={() => setMobileOpen(false)} className="hover:text-white">
              SECURITY
            </a>
            <Link href="/login" onClick={() => setMobileOpen(false)} className="hover:text-white">
              LOG IN
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const router = useRouter();
  const [shareInput, setShareInput] = useState('');

  const handleOpenShare = (e) => {
    e.preventDefault();
    const val = shareInput.trim();
    if (!val) {
      router.push('/docs');
      return;
    }
    // Extract token if full URL provided
    const match = val.match(/\/share\/([a-zA-Z0-9_-]+)/);
    if (match) {
      router.push(`/share/${match[1]}`);
    } else if (val.startsWith('/')) {
      router.push(val);
    } else {
      router.push(`/share/${val}`);
    }
  };

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-black pt-20 pb-16">
      {/* Background Topographic Contours */}
      <TopographicContours />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 lg:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Left Column: Headline, Subtitle, Input, Buttons */}
          <div className="lg:col-span-7">
            <h1 className="font-sans text-[62px] font-extrabold leading-[0.98] tracking-[-0.035em] text-white sm:text-[76px] lg:text-[96px]">
              Write
              <br />
              together.
            </h1>
            <p className="mt-4 text-2xl font-light tracking-tight text-zinc-400 sm:text-3xl">
              Never lose a word.
            </p>

            {/* Paste Share Link Pill Input */}
            <form onSubmit={handleOpenShare} className="mt-10 max-w-[440px]">
              <div className="relative flex items-center rounded-full border border-indigo-500/40 bg-[#08080C]/80 p-1.5 pr-2.5 pl-5 shadow-[0_0_24px_rgba(99,102,241,0.18)] backdrop-blur-md transition-all focus-within:border-indigo-400 focus-within:shadow-[0_0_32px_rgba(99,102,241,0.32)]">
                <input
                  type="text"
                  value={shareInput}
                  onChange={(e) => setShareInput(e.target.value)}
                  placeholder="Paste a share link to open a document"
                  className="w-full border-none bg-transparent pr-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Open document"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            {/* CTA Buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="rounded-full bg-[#0088FF] px-7 py-3.5 text-xs font-bold tracking-wider text-white uppercase shadow-[0_0_20px_rgba(0,136,255,0.4)] transition-all hover:bg-[#0077EE] hover:shadow-[0_0_28px_rgba(0,136,255,0.6)]"
              >
                <Link href="/register">START WRITING</Link>
              </Button>
              <Button
                variant="outline"
                asChild
                className="rounded-full border-zinc-700 bg-transparent px-6 py-3.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-900/40 hover:text-white"
              >
                <a href="#how">see more</a>
              </Button>
            </div>
          </div>

          {/* Right Column: Floating Real-time Editor Card */}
          <div className="relative flex justify-center lg:col-span-5 lg:justify-end">
            <div className="relative z-10 max-w-[310px] pr-4">
              <div className="mb-3.5 inline-block text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]">
                <ConfluoMark className="h-8 w-8" strokeWidth={2.4} color="#C084FC" />
              </div>
              <h3 className="font-sans text-[22px] font-normal tracking-tight text-white">
                Real-time editor.
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Edits merge conflict-free, everyone sees each other&apos;s cursor, and your work is
                saved on your device even when the network is not.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Floating Elements (Next.js badge on left, Mouse scroll indicator on center) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex items-center justify-between px-8 lg:px-12">
        {/* Bottom Left Badge */}
        <div className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 font-sans text-[11px] font-bold text-zinc-400 shadow-sm">
          N
        </div>

        {/* Bottom Center Scroll Pill */}
        <a
          href="#how"
          aria-label="Scroll down"
          className="pointer-events-auto flex items-center justify-center opacity-75 transition-opacity hover:opacity-100"
        >
          <div className="flex h-7 w-4.5 items-start justify-center rounded-full border border-zinc-700 p-1">
            <div className="h-1.5 w-1 animate-bounce rounded-full bg-zinc-400" />
          </div>
        </a>

        <div className="w-7" />
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: GitMerge,
      title: 'Your edits merge, not overwrite',
      body: 'A CRDT keeps everyone’s changes. Two people editing the same line converge to one clean result — no “last write wins”.',
    },
    {
      icon: Users,
      title: 'See everyone, block by block',
      body: 'Live cursors and soft locks show who is where. A gentle chip marks the paragraph someone is actively editing.',
    },
    {
      icon: WifiOff,
      title: 'Offline is just a slower network',
      body: 'Edits persist locally in IndexedDB. Drop off, keep typing, and resync the moment the socket reopens.',
    },
  ];
  return (
    <section id="how" className="border-t border-zinc-800/80 bg-black py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <h2 className="max-w-2xl font-sans text-[28px] font-bold tracking-tight text-white md:text-[40px]">
          How Confluo keeps your work whole
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {steps.map((s, idx) => (
            <div
              key={s.title}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-6 transition-all hover:border-zinc-700"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-950/40 text-indigo-400">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-mono text-xs text-zinc-500">0{idx + 1}</span>
                <h3 className="text-[17px] font-semibold text-white">{s.title}</h3>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: Type,
      title: 'Rich text that reads well',
      body: 'Headings, lists, and images set in a clean measure. Writing feels calm and uncluttered.',
    },
    {
      icon: MessageSquare,
      title: 'Comments & roles',
      body: 'Threaded comments anchored to text. Viewer, commenter, editor, and owner — each with the right reach.',
    },
    {
      icon: Link2,
      title: 'Sharing links',
      body: 'Invite by email or generate a role-scoped link with an expiry. Copy, send, done.',
    },
    {
      icon: Save,
      title: 'Version-safe saves',
      body: 'Snapshot writes with optimistic concurrency. Renamed elsewhere? Confluo tells you instead of clobbering.',
    },
    {
      icon: ImageIcon,
      title: 'Inline images',
      body: 'Paste, drop, or upload. Seamless media insertion that never interrupts typing flow.',
    },
    {
      icon: ShieldCheck,
      title: 'Permissions you can see',
      body: 'A clear matrix, enforced on the server — not a checkbox that hopes for the best.',
    },
  ];
  return (
    <section id="features" className="border-t border-zinc-800/80 bg-zinc-950/40 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <h2 className="max-w-2xl font-sans text-[28px] font-bold tracking-tight text-white md:text-[40px]">
          Everything a long writing session needs
        </h2>
        <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.title} className="group">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-indigo-400 group-hover:border-indigo-500/40">
                <i.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-[17px] font-semibold text-white">{i.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{i.body}</p>
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
  const Cell = ({ on }) =>
    on ? (
      <Check className="mx-auto h-4 w-4 text-emerald-400" aria-label="allowed" />
    ) : (
      <span className="mx-auto block h-1 w-3 rounded-full bg-zinc-800" aria-label="not allowed" />
    );
  return (
    <section id="security" className="border-t border-zinc-800/80 bg-black py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <h2 className="max-w-2xl font-sans text-[28px] font-bold tracking-tight text-white md:text-[40px]">
          Permissions you can read at a glance
        </h2>
        <p className="mt-3 max-w-xl text-[15px] text-zinc-400">
          Every capability is enforced on the server. Roles are explicit, never implied.
        </p>
        <div className="mt-10 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="px-5 py-3.5 font-medium text-zinc-400">Capability</th>
                {roles.map((r) => (
                  <th key={r} className="px-5 py-3.5 text-center font-medium text-zinc-300">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-5 py-3.5 text-zinc-300">{row[0]}</td>
                  {row.slice(1).map((v, j) => (
                    <td key={j} className="px-5 py-3.5 text-center">
                      <Cell on={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    [
      'What happens if two people edit the same sentence?',
      'Both edits are preserved and merged by the CRDT. There is no “last write wins”; the result converges to the same text on every client.',
    ],
    [
      'Does it work offline?',
      'Yes. Your edits are stored locally in IndexedDB and resync automatically when the connection returns.',
    ],
    [
      'Can I control who can do what?',
      'Yes. Assign viewer, commenter, editor, or owner. Permissions are enforced on the server, not just hidden in the UI.',
    ],
    [
      'How do share links work?',
      'Owners can generate a link scoped to a role with an expiry. Anyone who opens it gets that role on the document.',
    ],
  ];
  return (
    <section className="border-t border-zinc-800/80 bg-zinc-950/40 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="font-sans text-[28px] font-bold tracking-tight text-white md:text-[40px]">
          Questions, answered
        </h2>
        <div className="mt-8 divide-y divide-zinc-800">
          {qs.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] font-medium text-white">
                {q}
                <span className="ml-4 text-zinc-500 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="border-t border-zinc-800/80 bg-black py-24 text-center md:py-32">
      <div className="mx-auto max-w-2xl px-6">
        <h2 className="font-sans text-[32px] font-bold tracking-tight text-white md:text-[46px]">
          A place to write for hours.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[16px] text-zinc-400">
          Start a document and invite your team. Your words are safe from the first keystroke.
        </p>
        <div className="mt-8">
          <Button
            size="lg"
            asChild
            className="rounded-full bg-[#0088FF] px-8 py-3.5 text-xs font-bold tracking-wider text-white uppercase shadow-[0_0_25px_rgba(0,136,255,0.45)] hover:bg-[#0077EE]"
          >
            <Link href="/register">
              START WRITING <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-black py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row lg:px-12">
        <div className="flex items-center gap-2">
          <ConfluoMark className="h-4 w-4 text-white" />
          <span className="text-xs font-bold tracking-widest text-white uppercase">CONFLUO</span>
        </div>
        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} Confluo. Conflict-free collaboration.
        </p>
        <div className="flex gap-6 text-xs text-zinc-400">
          <a href="#features" className="hover:text-white">
            Product
          </a>
          <a href="#security" className="hover:text-white">
            Security
          </a>
          <Link href="/login" className="hover:text-white">
            Log in
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-600 selection:text-white">
      <Nav />
      <main id="main">
        <Hero />
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
