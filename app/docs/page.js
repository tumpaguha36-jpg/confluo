'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus, MoreHorizontal, Loader2, FileText, Pencil, Trash2, LogOut, FileEdit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Logo from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import { useAuth, apiFetch } from '@/lib/auth';
import { toast } from 'sonner';

const roleColor = {
  owner: 'bg-primary/10 text-primary border-primary/20',
  editor: 'bg-accent text-accent-foreground border-border',
  commenter: 'bg-warning/10 text-warning border-warning/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

function CollabAvatars({ people }) {
  const shown = people.slice(0, 4);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <span key={p.id} title={`${p.name} · ${p.role}`} className="grid h-7 w-7 place-items-center rounded-full border-2 border-background text-[11px] font-semibold text-white" style={{ background: p.color }}>
          {(p.name || '?')[0].toUpperCase()}
        </span>
      ))}
      {extra > 0 && <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-muted text-[11px] font-medium text-muted-foreground">+{extra}</span>}
    </div>
  );
}

function RenameInline({ doc, onDone }) {
  const [value, setValue] = useState(doc.title);
  const save = async () => {
    const title = value.trim() || doc.title;
    if (title !== doc.title) {
      try {
        await apiFetch(`/docs/${doc.id}`, { method: 'PUT', body: JSON.stringify({ title }) });
        toast.success('Renamed');
      } catch (e) { toast.error(e.message); }
    }
    onDone(title);
  };
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone(doc.title); }}
      className="h-8 max-w-[280px]"
    />
  );
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [docs, setDocs] = useState(null);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=/docs');
  }, [loading, user, router]);

  const load = useCallback(async () => {
    try {
      const { docs } = await apiFetch('/docs');
      setDocs(docs);
    } catch (e) { toast.error(e.message); setDocs([]); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  const createDoc = async () => {
    setCreating(true);
    try {
      const { doc } = await apiFetch('/docs', { method: 'POST', body: JSON.stringify({ title: 'Untitled document' }) });
      router.push(`/docs/${doc.id}`);
    } catch (e) { toast.error(e.message); setCreating(false); }
  };

  const deleteDoc = async (id) => {
    setDocs((d) => d.filter((x) => x.id !== id));
    try {
      await apiFetch(`/docs/${id}`, { method: 'DELETE' });
      toast.success('Document deleted');
    } catch (e) { toast.error(e.message); load(); }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: user.color }} aria-label="Account menu">
                  {(user.name || user.email)[0].toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { logout(); router.push('/'); }}>
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="font-display text-[32px] font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-muted-foreground">Everything you own and everything shared with you.</p>
          </div>
          <Button onClick={createDoc} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} New document
          </Button>
        </div>

        {docs === null ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card text-primary">
              <FileEdit className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-display text-[20px] font-semibold">Nothing here yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your words are safe from the first keystroke.</p>
            <Button className="mt-6" onClick={createDoc} disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Create your first document
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Role</TableHead>
                  <TableHead className="w-40">People</TableHead>
                  <TableHead className="w-44">Updated</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => (
                  <TableRow key={doc.id} className="group cursor-pointer" onClick={() => renamingId !== doc.id && router.push(`/docs/${doc.id}`)}>
                    <TableCell onClick={(e) => renamingId === doc.id && e.stopPropagation()}>
                      {renamingId === doc.id ? (
                        <RenameInline doc={doc} onDone={(title) => { setDocs((d) => d.map((x) => x.id === doc.id ? { ...x, title } : x)); setRenamingId(null); }} />
                      ) : (
                        <span className="flex items-center gap-2.5 font-medium">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {doc.title}
                        </span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`capitalize ${roleColor[doc.role] || ''}`}>{doc.role}</Badge></TableCell>
                    <TableCell><CollabAvatars people={doc.collaborators || []} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <time dateTime={new Date(doc.updatedAt).toISOString()}>{formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</time>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/docs/${doc.id}`)}><FileText className="mr-2 h-4 w-4" /> Open</DropdownMenuItem>
                          {['owner', 'editor'].includes(doc.role) && (
                            <DropdownMenuItem onClick={() => setRenamingId(doc.id)}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem>
                          )}
                          {doc.role === 'owner' && (
                            <>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete “{doc.title}”?</AlertDialogTitle>
                                    <AlertDialogDescription>This permanently removes the document and its comments for everyone. This cannot be undone.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteDoc(doc.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
