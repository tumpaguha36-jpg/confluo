import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { docId, type, update, senderId, vector, token: bodyToken } = body;

    if (!docId || !type) {
      return NextResponse.json({ error: 'Missing docId or type' }, { status: 400 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '') || bodyToken;

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
      return NextResponse.json({ error: 'Unauthorized: invalid or missing session token' }, { status: 401 });
    }

    const doc = await db.collection('docs').findOne({ id: docId });
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const collabs = Array.isArray(doc.collaborators)
      ? doc.collaborators
      : (typeof doc.collaborators === 'string' ? JSON.parse(doc.collaborators || '[]') : []);
    const isOwner = doc.ownerId === user.id;
    const member = collabs.find((c) => c.userId === user.id);
    const role = isOwner ? 'owner' : (member ? member.role : null);

    if (!role) {
      return NextResponse.json({ error: 'Access denied: not a collaborator on this document' }, { status: 403 });
    }

    // Viewers cannot push updates
    if (role === 'viewer' && (type === 'update' || type === 'sync-step-2')) {
      return NextResponse.json({ error: 'Viewers cannot edit' }, { status: 403 });
    }

    // Bridge update into in-memory room if collab server is running in-process
    try {
      const { rooms } = require('@/server/collab-server');
      if (rooms && rooms.has(docId) && type === 'update' && update) {
        const room = rooms.get(docId);
        const bytes = Buffer.from(update, 'base64');
        const Y = require('yjs');
        Y.applyUpdate(room.doc, bytes, 'http-sync');
      }
    } catch (_) {}

    // Broadcast to all active SSE stream subscribers for this docId
    const bus = global.__confluo_collab_bus;
    if (bus && bus.has(docId)) {
      const subscribers = bus.get(docId);
      const message = `data: ${JSON.stringify({ type, update, vector, senderId })}\n\n`;
      const encoded = new TextEncoder().encode(message);

      const toRemove = [];
      for (const controller of subscribers) {
        try {
          controller.enqueue(encoded);
        } catch (e) {
          toRemove.push(controller);
        }
      }

      for (const dead of toRemove) {
        subscribers.delete(dead);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Collab sync error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
