// Global in-memory broadcast bus for Server-Sent Events (active across same node runtime)
if (!global.__confluo_collab_bus) {
  global.__confluo_collab_bus = new Map(); // docId -> Set<Controller>
}

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Auto-boot local Yjs WebSocket collaboration server if running in Node.js runtime
  if (
    typeof process !== 'undefined' &&
    process.release?.name === 'node' &&
    !process.env.VERCEL &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    try {
      const { startCollabServer } = require('@/server/collab-server');
      startCollabServer();
    } catch (_) {}
  }

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId') || 'default';
  const clientId = searchParams.get('clientId') || Math.random().toString(36).slice(2);
  const authHeader = request.headers.get('authorization') || '';
  const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '') || searchParams.get('token');

  const { getDb } = require('@/lib/db');
  const db = await getDb();
  let user = null;
  if (token) {
    const session = await db.collection('sessions').findOne({ token });
    if (session) {
      user = await db.collection('users').findOne({ id: session.userId });
    }
  }

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid or missing token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const doc = await db.collection('docs').findOne({ id: docId });
  if (!doc) {
    return new Response(JSON.stringify({ error: 'Document not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const collabs = Array.isArray(doc.collaborators)
    ? doc.collaborators
    : (typeof doc.collaborators === 'string' ? JSON.parse(doc.collaborators || '[]') : []);
  const hasAccess = doc.ownerId === user.id || collabs.some((c) => c.userId === user.id);
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: 'Access denied: not a collaborator on this document' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let streamController = null;
  let keepAliveTimer = null;

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;

      if (!global.__confluo_collab_bus.has(docId)) {
        global.__confluo_collab_bus.set(docId, new Set());
      }
      global.__confluo_collab_bus.get(docId).add(controller);

      // Send initial connected event
      const initData = JSON.stringify({ type: 'connected', docId, clientId });
      controller.enqueue(new TextEncoder().encode(`data: ${initData}\n\n`));

      // Periodic ping every 25s to keep SSE connection alive
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'));
        } catch (_) {
          clearInterval(keepAliveTimer);
        }
      }, 25000);
    },
    cancel() {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
      }
      if (streamController && global.__confluo_collab_bus.has(docId)) {
        global.__confluo_collab_bus.get(docId).delete(streamController);
        if (global.__confluo_collab_bus.get(docId).size === 0) {
          global.__confluo_collab_bus.delete(docId);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
