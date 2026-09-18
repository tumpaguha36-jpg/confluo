'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { useParams, useRouter } from 'next/navigation';
import Link2Next from 'next/link';
import { useEffect, useState, useRef, useCallback, memo } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3,
  List, ListOrdered, ImageIcon, Undo2, Redo2, ArrowLeft, Loader2, MessageSquare,
  Share2, Users, Check, CheckCheck, Trash2, X, Wifi, WifiOff, RefreshCw, Ban, Copy, Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import ThemeToggle from '@/components/site/ThemeToggle';
import Logo from '@/components/site/Logo';
import { useAuth, apiFetch } from '@/lib/auth';
import { ConfluoCollabProvider } from '@/lib/collab-provider';
import { toast } from 'sonner';

const canEdit = (role) => role === 'owner' || role === 'editor';
const canComment = (role) => role === 'owner' || role === 'editor' || role === 'commenter';

/* ---------------- Connection badge ---------------- */
function ConnectionBadge({ state, unsynced, onToggleOffline, isOffline }) {
  const map = {
    connecting: { icon: RefreshCw, cls: 'text-muted-foreground', label: 'Connecting…', spin: true },
    syncing: { icon: RefreshCw, cls: 'text-primary', label: 'Syncing…', spin: true },
    connected: { icon: Wifi, cls: 'text-emerald-600 dark:text-emerald-400', label: 'Synced' },
    reconnecting: { icon: RefreshCw, cls: 'text-amber-500', label: 'Reconnecting…', spin: true },
    offline: { icon: WifiOff, cls: 'text-amber-600 dark:text-amber-400', label: 'Offline · Saved locally' },
    denied: { icon: Ban, cls: 'text-destructive', label: 'Access denied' },
  };
  const c = map[state] || map.connected;
  const Icon = c.icon;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleOffline}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-2xs font-medium hover:bg-muted transition-colors cursor-pointer"
            aria-live="polite"
          >
            <Icon className={`h-3.5 w-3.5 ${c.cls} ${c.spin ? 'animate-spin' : ''}`} />
            <span className={c.cls}>{c.label}</span>
            {unsynced && state === 'connected' && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsynced changes" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {isOffline ? 'Currently Offline (edits persist locally). Click to reconnect & sync.' : 'Online & Synced via CRDT. Click to simulate offline mode.'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ---------------- Presence stack ---------------- */
function PresenceStack({ me, peers }) {
  const all = [me, ...peers].filter(Boolean);
  const shown = all.slice(0, 5);
  const extra = all.length - shown.length;
  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex -space-x-2">
        {shown.map((p, i) => (
          <Tooltip key={(p.clientId || p.id || '') + i}>
            <TooltipTrigger asChild>
              <span
                className="grid h-8 w-8 place-items-center rounded-full border-2 border-background text-[12px] font-semibold text-white transition-transform hover:scale-110"
                style={{ background: p.color || '#0F6E6E' }}
              >
                {(p.name || '?')[0].toUpperCase()}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {p.name}{p.self ? ' (you)' : ''} · <span className="capitalize">{p.role || 'editor'}</span>
            </TooltipContent>
          </Tooltip>
        ))}
        {extra > 0 && <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-muted text-[12px] font-medium text-muted-foreground">+{extra}</span>}
      </div>
    </TooltipProvider>
  );
}

/* ---------------- Toolbar ---------------- */
function ToolButton({ onClick, active, disabled, label, children }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-40 ${active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
            aria-label={label}
            aria-pressed={!!active}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Toolbar({ editor, onImage, uploading }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => force((x) => x + 1);
    editor.on('selectionUpdate', rerender);
    editor.on('transaction', rerender);
    return () => { editor.off('selectionUpdate', rerender); editor.off('transaction', rerender); };
  }, [editor]);
  if (!editor) return null;
  const is = (name, attrs) => editor.isActive(name, attrs);
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card p-1">
      <ToolButton onClick={() => editor.chain().focus().toggleBold().run()} active={is('bold')} label="Bold (⌘B)"><Bold className="h-4 w-4" /></ToolButton>
      <ToolButton onClick={() => editor.chain().focus().toggleItalic().run()} active={is('italic')} label="Italic (⌘I)"><Italic className="h-4 w-4" /></ToolButton>
      <ToolButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={is('underline')} label="Underline (⌘U)"><UnderlineIcon className="h-4 w-4" /></ToolButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={is('heading', { level: 1 })} label="Heading 1 (⌘⌥1)"><Heading1 className="h-4 w-4" /></ToolButton>
      <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={is('heading', { level: 2 })} label="Heading 2 (⌘⌥2)"><Heading2 className="h-4 w-4" /></ToolButton>
      <ToolButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={is('heading', { level: 3 })} label="Heading 3 (⌘⌥3)"><Heading3 className="h-4 w-4" /></ToolButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={is('bulletList')} label="Bullet list"><List className="h-4 w-4" /></ToolButton>
      <ToolButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={is('orderedList')} label="Ordered list"><ListOrdered className="h-4 w-4" /></ToolButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton onClick={onImage} disabled={uploading} label="Insert image">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}</ToolButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} label="Undo (⌘Z)"><Undo2 className="h-4 w-4" /></ToolButton>
      <ToolButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} label="Redo (⌘⇧Z)"><Redo2 className="h-4 w-4" /></ToolButton>
    </div>
  );
}

/* ---------------- Share dialog ---------------- */
function ShareDialog({ doc, role, me, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [addRole, setAddRole] = useState('editor');
  const [collabs, setCollabs] = useState(doc.collaborators || []);
  const [links, setLinks] = useState(doc.shareLinks || []);
  const [pending, setPending] = useState(false);
  const isOwner = role === 'owner';

  const addCollaborator = async () => {
    if (!email.trim()) return;
    setPending(true);
    try {
      const { collaborators } = await apiFetch(`/docs/${doc.id}/share`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role: addRole }) });
      setCollabs(collaborators);
      setEmail('');
      toast.success('Collaborator added');
      onUpdated && onUpdated(collaborators);
    } catch (e) { toast.error(e.message); } finally { setPending(false); }
  };

  const changeRole = async (userId, newRole) => {
    try {
      const { collaborators } = await apiFetch(`/docs/${doc.id}/collaborators/${userId}`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
      setCollabs(collaborators); onUpdated && onUpdated(collaborators);
    } catch (e) { toast.error(e.message); }
  };
  const removeCollab = async (userId) => {
    try {
      const { collaborators } = await apiFetch(`/docs/${doc.id}/collaborators/${userId}`, { method: 'DELETE' });
      setCollabs(collaborators); onUpdated && onUpdated(collaborators);
    } catch (e) { toast.error(e.message); }
  };
  const createLink = async () => {
    try {
      const { link } = await apiFetch(`/docs/${doc.id}/share-link`, { method: 'POST', body: JSON.stringify({ role: addRole, expiryDays: 7 }) });
      setLinks((l) => [...l, link]);
      const url = `${window.location.origin}/share/${link.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Share link created & copied');
    } catch (e) { toast.error(e.message); }
  };
  const copyLink = async (token) => {
    await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    toast.success('Link copied');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isOwner ? 'default' : 'outline'} size="sm">
          {isOwner ? <><Share2 className="mr-1.5 h-4 w-4" /> Share</> : <><Users className="mr-1.5 h-4 w-4" /> Collaborators</>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isOwner ? 'Share this document' : 'Collaborators'}</DialogTitle>
          <DialogDescription>{isOwner ? 'Invite people by email or create a role-scoped link.' : 'People with access to this document.'}</DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-2xs font-medium text-muted-foreground">Invite by email</label>
              <Input placeholder="person@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCollaborator()} />
            </div>
            <Select value={addRole} onValueChange={setAddRole}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="commenter">Commenter</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addCollaborator} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
          </div>
        )}

        <div className="max-h-56 space-y-1 overflow-y-auto">
          {collabs.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md px-1 py-1.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: c.color }}>{(c.name || '?')[0].toUpperCase()}</span>
                <div>
                  <p className="text-sm font-medium">{c.name}{c.id === me.id ? ' (you)' : ''}</p>
                  <p className="text-2xs text-muted-foreground">{c.email}</p>
                </div>
              </div>
              {c.role === 'owner' ? (
                <span className="text-2xs font-medium capitalize text-muted-foreground">Owner</span>
              ) : isOwner ? (
                <div className="flex items-center gap-1">
                  <Select value={c.role} onValueChange={(v) => changeRole(c.id, v)}>
                    <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="commenter">Commenter</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeCollab(c.id)}><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <span className="text-2xs font-medium capitalize text-muted-foreground">{c.role}</span>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Share links</p>
              <Button variant="outline" size="sm" onClick={createLink}><LinkIcon className="mr-1.5 h-3.5 w-3.5" /> Create link</Button>
            </div>
            {links.length === 0 && <p className="text-2xs text-muted-foreground">No links yet. Links inherit the role shown above.</p>}
            {links.map((l) => (
              <div key={l.token} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
                <span className="truncate text-2xs text-muted-foreground">/share/{l.token.slice(0, 10)}… · <span className="capitalize">{l.role}</span></span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(l.token)}><Copy className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Comments sidebar ---------------- */
function CommentsSidebar({ docId, role, me, open, selection, onClearSelection }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try { const { comments } = await apiFetch(`/docs/${docId}/comments`); setComments(comments); } catch (_) {}
  }, [docId]);
  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      const payload = { body: body.trim() };
      if (replyTo) payload.parentId = replyTo;
      else if (selection?.text) payload.anchorText = selection.text;
      const { comment } = await apiFetch(`/docs/${docId}/comments`, { method: 'POST', body: JSON.stringify(payload) });
      setComments((c) => [...c, comment]);
      setBody(''); setReplyTo(null); onClearSelection && onClearSelection();
    } catch (e) { toast.error(e.message); } finally { setPosting(false); }
  };
  const resolve = async (id, resolved) => {
    setComments((c) => c.map((x) => x.id === id ? { ...x, resolved } : x));
    try { await apiFetch(`/comments/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolved }) }); } catch (e) { toast.error(e.message); load(); }
  };
  const del = async (id) => {
    setComments((c) => c.filter((x) => x.id !== id && x.parentId !== id));
    try { await apiFetch(`/comments/${id}`, { method: 'DELETE' }); } catch (e) { toast.error(e.message); load(); }
  };

  if (!open) return null;
  const threads = comments.filter((c) => !c.parentId);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  return (
    <aside className="flex w-full flex-col border-l border-border bg-card md:w-80">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="flex items-center gap-2 text-sm font-medium"><MessageSquare className="h-4 w-4" /> Comments</span>
        <span className="text-2xs text-muted-foreground">{threads.length}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {threads.length === 0 && <p className="mt-6 text-center text-sm text-muted-foreground">No comments yet.{canComment(role) ? ' Select text to start a thread.' : ''}</p>}
        {threads.map((t) => (
          <div key={t.id} className={`rounded-lg border border-border bg-background p-3 ${t.resolved ? 'opacity-60' : ''}`}>
            {t.anchorText ? (
              <p className="mb-2 border-l-2 border-primary/40 pl-2 text-2xs italic text-muted-foreground line-clamp-2">“{t.anchorText}”</p>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-semibold" style={{ color: t.authorColor }}>
                <span className="h-2 w-2 rounded-full" style={{ background: t.authorColor }} />{t.authorName}
              </span>
              <div className="flex items-center gap-0.5">
                {canComment(role) && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" title={t.resolved ? 'Reopen' : 'Resolve'} onClick={() => resolve(t.id, !t.resolved)}>
                    {t.resolved ? <Check className="h-3.5 w-3.5 text-success" /> : <CheckCheck className="h-3.5 w-3.5" />}
                  </Button>
                )}
                {(t.authorId === me.id || role === 'owner') && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Delete" onClick={() => del(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm">{t.body}</p>
            {repliesOf(t.id).map((r) => (
              <div key={r.id} className="mt-2 border-l border-border pl-2.5">
                <span className="text-2xs font-semibold" style={{ color: r.authorColor }}>{r.authorName}</span>
                <p className="text-sm">{r.body}</p>
              </div>
            ))}
            {canComment(role) && !t.resolved && (
              <button className="mt-2 text-2xs text-primary hover:underline" onClick={() => { setReplyTo(replyTo === t.id ? null : t.id); }}>
                {replyTo === t.id ? 'Cancel reply' : 'Reply'}
              </button>
            )}
          </div>
        ))}
      </div>
      {canComment(role) && (
        <div className="border-t border-border p-3">
          {selection?.text && !replyTo && (
            <p className="mb-1.5 truncate rounded bg-accent px-2 py-1 text-2xs text-accent-foreground">Commenting on: “{selection.text}”</p>
          )}
          {replyTo && <p className="mb-1.5 text-2xs text-muted-foreground">Replying to thread</p>}
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" className="resize-none text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }} />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={post} disabled={posting || !body.trim()}>{posting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Comment'}</Button>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ---------------- Collaborative TipTap Editor Wrapper ---------------- */
function CollaborativeEditorCanvas({ provider, doc, role, user, onSaveTrigger, setSelection }) {
  const editable = canEdit(role);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        history: false, // Managed collaboratively by Yjs
      }),
      Collaboration.configure({
        document: provider.doc,
        field: 'default',
      }),
      CollaborationCursor.configure({
        provider: { awareness: provider.awareness },
        user: {
          name: user.displayName || user.name || user.email.split('@')[0],
          color: user.color || '#0F6E6E',
        },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Start writing collaboratively…' }),
    ],
    editorProps: { attributes: { class: 'font-editor focus:outline-none' } },
    onUpdate: () => {
      if (!canEdit(role)) return;
      onSaveTrigger && onSaveTrigger();
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (empty) { setSelection(null); return; }
      const text = editor.state.doc.textBetween(from, to, ' ').trim();
      setSelection(text ? { from, to, text: text.length > 80 ? text.slice(0, 80) + '…' : text } : null);
    },
  }, [provider, editable]);

  const seededRef = useRef(false);

  // Safe initial seeding: seed only once if Y.Doc is truly empty and new
  useEffect(() => {
    if (!editor || !doc || seededRef.current) return;

    const trySeed = () => {
      if (seededRef.current) return;
      const fragment = provider.doc.getXmlFragment('default');
      // Only seed if fragment is genuinely empty, doc has never had Yjs state, and doc has initial content
      if (fragment.length === 0 && !doc.yjsState && doc.content && editor.isEmpty) {
        seededRef.current = true;
        editor.commands.setContent(doc.content);
      } else {
        seededRef.current = true;
      }
    };

    if (provider.synced) {
      trySeed();
    } else {
      const unsub = provider.on('synced', () => {
        trySeed();
      });
      const timer = setTimeout(trySeed, 600);
      return () => {
        unsub && unsub();
        clearTimeout(timer);
      };
    }
  }, [editor, doc, provider]);

  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const uploadsPending = useRef(0);

  const insertImageFile = async (file) => {
    if (!file || !editor) return;
    uploadsPending.current += 1;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result, alt: file.name }).run();
      uploadsPending.current -= 1;
      setUploading(false);
      toast.success('Image inserted');
    };
    reader.onerror = () => { uploadsPending.current -= 1; setUploading(false); toast.error('Upload failed'); };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item && canEdit(role)) { e.preventDefault(); insertImageFile(item.getAsFile()); }
    };
    const onDrop = (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/') && canEdit(role)) { e.preventDefault(); insertImageFile(file); }
    };
    dom.addEventListener('paste', onPaste);
    dom.addEventListener('drop', onDrop);
    return () => { dom.removeEventListener('paste', onPaste); dom.removeEventListener('drop', onDrop); };
  }, [editor, role]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {canEdit(role) && (
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="mx-auto max-w-[68ch]">
            <Toolbar editor={editor} onImage={() => fileRef.current?.click()} uploading={uploading} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { insertImageFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
      )}
      <div className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[68ch] px-6 py-10">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Editor page ---------------- */
export default function EditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const [doc, setDoc] = useState(null);
  const [role, setRole] = useState('viewer');
  const [notFound, setNotFound] = useState(false);
  const [denied, setDenied] = useState(null);

  const [title, setTitle] = useState('');
  const [titleState, setTitleState] = useState('saved'); // saving | saved | error
  const [saveState, setSaveState] = useState('saved');
  const [unsynced, setUnsynced] = useState(false);
  const [conn, setConn] = useState('connecting');
  const [isOffline, setIsOffline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selection, setSelection] = useState(null);
  const [peers, setPeers] = useState([]);

  const providerRef = useRef(null);
  const [providerReady, setProviderReady] = useState(false);

  const versionRef = useRef(1);
  const contentTimer = useRef(null);
  const titleTimer = useRef(null);
  const titleTypingRef = useRef(false);

  useEffect(() => { if (!loading && !user) router.replace(`/login?next=/docs/${id}`); }, [loading, user, id, router]);

  // Load document from API
  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const { doc } = await apiFetch(`/docs/${id}`);
        setDoc(doc);
        setRole(doc.role);
        setTitle(doc.title);
        versionRef.current = doc.version || 1;
      } catch (e) {
        if (e.status === 404) setNotFound(true);
        else if (e.status === 403) setDenied('revoked');
        else toast.error(e.message);
      }
    })();
  }, [user, id]);

  // Initialize real CRDT collaboration provider
  useEffect(() => {
    if (!user || !id || !doc) return;

    const provider = new ConfluoCollabProvider(id, user, { initialYjsState: doc.yjsState });
    providerRef.current = provider;

    provider.on('status', ({ status }) => {
      setConn(status);
      setIsOffline(status === 'offline');
    });

    provider.on('peers-changed', (peerList) => {
      setPeers(peerList);
    });

    setProviderReady(true);

    return () => {
      provider.destroy();
      providerRef.current = null;
      setProviderReady(false);
    };
  }, [id, user, doc?.id]);

  // Debounced backup persistence of Yjs CRDT state (no last-write-wins)
  const onSaveTrigger = useCallback(() => {
    if (!id || !canEdit(role) || !providerRef.current) return;
    setUnsynced(true);
    setSaveState('saving');
    if (contentTimer.current) clearTimeout(contentTimer.current);
    contentTimer.current = setTimeout(async () => {
      try {
        const updateVector = Buffer.from(Y.encodeStateAsUpdate(providerRef.current.doc)).toString('base64');
        await apiFetch(`/docs/${id}`, { method: 'PUT', body: JSON.stringify({ yjsState: updateVector }) });
        setSaveState('saved');
        setUnsynced(false);
      } catch (e) {
        setSaveState('offline');
        setUnsynced(true);
      }
    }, 1500);
  }, [id, role]);

  // Toggle simulated offline mode
  const handleToggleOffline = useCallback(() => {
    if (!providerRef.current) return;
    const nextState = !isOffline;
    providerRef.current.setOffline(nextState);
    setIsOffline(nextState);
    setConn(nextState ? 'offline' : 'syncing');
    if (nextState) {
      toast.info('Offline mode active: Edits will persist locally in IndexedDB');
    } else {
      toast.success('Reconnected: Synchronizing changes via CRDT…');
    }
  }, [isOffline]);

  // Title autosave
  const onTitleChange = (v) => {
    setTitle(v);
    if (!canEdit(role)) return;
    titleTypingRef.current = true;
    setTitleState('saving');
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/docs/${id}`, { method: 'PUT', headers: { 'If-Match': String(versionRef.current) }, body: JSON.stringify({ title: v }) });
        versionRef.current = res.doc.version;
        setTitleState('saved'); titleTypingRef.current = false;
      } catch (e) {
        if (e.status === 412) { toast.warning('Renamed elsewhere — adopting server title'); setTitleState('error'); }
        else setTitleState('error');
      }
    }, 800);
  };

  // Keyboard shortcut for comments sidebar
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); setSidebarOpen((s) => !s); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading || (!user && !denied)) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-[24px] font-semibold">Document not found</h1>
        <p className="text-sm text-muted-foreground">It may have been deleted.</p>
        <Button asChild><Link2Next href="/docs">Back to documents</Link2Next></Button>
      </div>
    );
  }
  if (denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <Ban className="h-8 w-8 text-destructive" />
        <h1 className="font-display text-[24px] font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">Your access to this document was {denied}.</p>
        <Button asChild><Link2Next href="/docs">Back to documents</Link2Next></Button>
      </div>
    );
  }
  if (!doc || !providerReady || !providerRef.current) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const me = { id: user.id, name: user.displayName || user.name, color: user.color || '#0F6E6E', role, self: true };
  const readOnly = !canEdit(role);
  const titleLabel = { saving: 'Saving…', saved: 'Saved', error: 'Couldn’t save — retry' }[titleState];

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/docs')} aria-label="Back to documents"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            {readOnly ? (
              <p className="truncate font-display text-[17px] font-semibold">{title}</p>
            ) : (
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                className="w-full max-w-[42ch] truncate rounded bg-transparent font-display text-[17px] font-semibold outline-none focus:ring-1 focus:ring-ring"
                aria-label="Document title"
              />
            )}
            {!readOnly && <span className={`text-2xs ${titleState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{titleLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <PresenceStack me={me} peers={peers} />
          <ConnectionBadge state={conn} unsynced={unsynced} onToggleOffline={handleToggleOffline} isOffline={isOffline} />
          <ShareDialog doc={doc} role={role} me={user} onUpdated={(c) => {}} />
          <Button variant="ghost" size="icon" aria-label="Toggle comments (⌘⇧M)" onClick={() => setSidebarOpen((s) => !s)}><MessageSquare className="h-4 w-4" /></Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Read-only banner */}
      {readOnly && (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-accent/50 py-2 text-2xs text-accent-foreground">
          {role === 'commenter' ? 'You can view and comment on this document. Select text to leave a comment.' : 'You can view this document.'}
        </div>
      )}

      {/* Main body */}
      <div className="flex min-h-0 flex-1">
        <CollaborativeEditorCanvas
          provider={providerRef.current}
          doc={doc}
          role={role}
          user={user}
          onSaveTrigger={onSaveTrigger}
          setSelection={setSelection}
        />
        {sidebarOpen && (
          <CommentsSidebar docId={id} role={role} me={user} open={sidebarOpen} selection={selection} onClearSelection={() => setSelection(null)} />
        )}
      </div>
    </div>
  );
}
