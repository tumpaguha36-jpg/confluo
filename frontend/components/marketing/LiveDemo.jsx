'use client';

import { useEffect, useRef, useState } from 'react';

// A lightweight, self-contained "live editor" hero island. It scripts two
// named collaborators typing into different paragraphs with colored carets and
// soft-lock chips, plus a connection pill that loops Offline -> Reconnecting -> Synced.
const PEOPLE = [
  { name: 'Ada', color: '#0F6E6E' },
  { name: 'Mira', color: '#7048E8' },
];

const LINE_A = 'The estuary map finally converged—no lost edits, even on the ferry.';
const LINE_B = 'Adding the field notes here; merge, don’t overwrite.';

const CONN = [
  { label: 'Synced', dot: 'bg-[var(--ok)]', hold: 3200 },
  { label: 'Offline', dot: 'bg-muted-foreground', hold: 1600 },
  { label: 'Reconnecting', dot: 'bg-[var(--warn)]', hold: 1500 },
];

export default function LiveDemo({ onInteract }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [conn, setConn] = useState(0);
  const raf = useRef();

  useEffect(() => {
    let ia = 0, ib = 0, dir = 1;
    let mounted = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setA(LINE_A); setB(LINE_B); return; }
    const tick = () => {
      if (!mounted) return;
      if (dir === 1) {
        ia = Math.min(ia + 1, LINE_A.length);
        setA(LINE_A.slice(0, ia));
        if (ia >= LINE_A.length) dir = 2;
      } else if (dir === 2) {
        ib = Math.min(ib + 1, LINE_B.length);
        setB(LINE_B.slice(0, ib));
        if (ib >= LINE_B.length) dir = 3;
      } else if (dir === 3) {
        setTimeout(() => { if (mounted) { ia = 0; ib = 0; dir = 1; setA(''); setB(''); } }, 2600);
        return;
      }
      raf.current = setTimeout(tick, dir === 1 ? 42 : 55);
    };
    raf.current = setTimeout(tick, 600);
    return () => { mounted = false; clearTimeout(raf.current); };
  }, []);

  useEffect(() => {
    let i = 0;
    let t;
    const loop = () => {
      i = (i + 1) % CONN.length;
      setConn(i);
      t = setTimeout(loop, CONN[i].hold);
    };
    t = setTimeout(loop, CONN[0].hold);
    return () => clearTimeout(t);
  }, []);

  const c = CONN[conn];

  return (
    <div
      className="animate-fade-up rounded-xl border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.02)]"
      style={{ '--ok': '#2E7D4F', '--warn': '#B7791F' }}
      onMouseEnter={onInteract}
      onFocus={onInteract}
    >
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          {PEOPLE.map((p) => (
            <span key={p.name} className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: p.color }} title={p.name}>
              {p.name[0]}
            </span>
          ))}
          <span className="text-2xs text-muted-foreground">2 editing</span>
        </div>
        <div aria-live="polite" className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-2xs font-medium">
          <span className={`h-1.5 w-1.5 rounded-full ${c.dot} ${c.label !== 'Synced' ? 'animate-pulse-dot' : ''}`} />
          {c.label}
        </div>
      </div>
      {/* canvas */}
      <div className="font-editor space-y-3 px-5 py-5 text-[15px] leading-relaxed">
        <h4 className="font-display text-[20px] font-semibold text-foreground">Estuary survey — shared notes</h4>
        <p className="relative rounded-md border-l-2 pl-3" style={{ borderColor: PEOPLE[0].color }}>
          <span className="mb-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: PEOPLE[0].color }}>{PEOPLE[0].name} · locked</span>
          <br />
          {a}
          <span className="ml-0.5 inline-block h-4 w-0.5 -translate-y-0.5 animate-pulse-dot align-middle" style={{ background: PEOPLE[0].color }} />
        </p>
        <p className="relative rounded-md border-l-2 pl-3" style={{ borderColor: PEOPLE[1].color }}>
          <span className="mb-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: PEOPLE[1].color }}>{PEOPLE[1].name} · locked</span>
          <br />
          {b}
          <span className="ml-0.5 inline-block h-4 w-0.5 -translate-y-0.5 animate-pulse-dot align-middle" style={{ background: PEOPLE[1].color }} />
        </p>
      </div>
    </div>
  );
}
