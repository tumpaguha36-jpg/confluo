// Global in-memory broadcast bus for Server-Sent Events (active across same node runtime)
if (!global.__confluo_collab_bus) {
  global.__confluo_collab_bus = new Map(); // docId -> Set<Controller>
}

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId') || 'default';
  const clientId = searchParams.get('clientId') || Math.random().toString(36).slice(2);

  let streamController = null;

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
    },
    cancel() {
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
