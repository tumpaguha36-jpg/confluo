import Link from 'next/link';

export default function Logo({ className = '', href = '/' }) {
  const inner = (
    <span className={`inline-flex items-center gap-2 font-display text-[19px] font-600 tracking-tight ${className}`}>
      <span className="grid h-6 w-6 place-items-center rounded-[5px] bg-primary text-primary-foreground text-[13px] font-bold">C</span>
      <span className="font-semibold">Confluo</span>
    </span>
  );
  if (href) return <Link href={href} aria-label="Confluo home">{inner}</Link>;
  return inner;
}
