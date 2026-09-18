import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { docId, type, update, senderId, vector } = body;

    if (!docId || !type) {
      return NextResponse.json({ error: 'Missing docId or type' }, { status: 400 });
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
