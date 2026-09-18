const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const Y = require('yjs');
const awarenessProtocol = require('y-protocols/awareness');

const PORT = parseInt(process.env.COLLAB_PORT || '1234', 10);

// In-memory rooms cache: docId -> room
const rooms = new Map();

async function getOrCreateRoom(docId) {
  if (rooms.has(docId)) {
    return rooms.get(docId);
  }

  const doc = new Y.Doc({ guid: docId });
  const awareness = new awarenessProtocol.Awareness(doc);

  const room = {
    docId,
    doc,
    awareness,
    clients: new Set(),
    clientAwarenessIds: new Map(),
    saveTimeout: null,
    loaded: false,
    loadingPromise: null,
  };

  rooms.set(docId, room);

  // Load persisted CRDT state from database
  room.loadingPromise = (async () => {
    try {
      const { getDb } = require('../lib/db');
      const db = await getDb();
      if (db) {
        const persistedDoc = await db.collection('docs').findOne({ id: docId });
        if (persistedDoc && persistedDoc.yjsState) {
          const update = Buffer.from(persistedDoc.yjsState, 'base64');
          Y.applyUpdate(doc, update, 'persistence');
        }
      }
    } catch (e) {
      console.warn(`[Collab] Failed to load persisted state for ${docId}:`, e.message);
    } finally {
      room.loaded = true;
    }
  })();

  // Broadcast doc updates to all other clients in the room
  doc.on('update', (update, origin) => {
    const message = JSON.stringify({
      type: 'update',
      update: Buffer.from(update).toString('base64'),
    });

    for (const client of room.clients) {
      if (client !== origin && client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (e) {
          console.error(`[Collab] Failed to send update to client in room ${docId}:`, e.message);
        }
      }
    }

    // Schedule debounced database persistence
    scheduleSave(room);
  });

  // Broadcast awareness updates to all other clients in the room
  awareness.on('update', ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated).concat(removed);
    if (changedClients.length === 0) return;

    const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
    const message = JSON.stringify({
      type: 'awareness',
      update: Buffer.from(update).toString('base64'),
    });

    for (const client of room.clients) {
      if (client !== origin && client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (e) {
          console.error(`[Collab] Failed to send awareness to client in room ${docId}:`, e.message);
        }
      }
    }
  });

  return room;
}

// Debounced save to database
function scheduleSave(room, delay = 1500) {
  if (room.saveTimeout) {
    if (delay === 0) {
      clearTimeout(room.saveTimeout);
    } else {
      return;
    }
  }

  const saveAction = async () => {
    room.saveTimeout = null;
    try {
      const { getDb } = require('../lib/db');
      const db = await getDb();
      if (db) {
        const updateVector = Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64');
        await db.collection('docs').updateOne(
          { id: room.docId },
          {
            $set: {
              yjsState: updateVector,
              updatedAt: new Date().toISOString(),
            },
          }
        );
      }
    } catch (e) {
      console.warn(`[Collab] Database save error for room ${room.docId}:`, e.message);
    }
  };

  if (delay === 0) {
    saveAction();
  } else {
    room.saveTimeout = setTimeout(saveAction, delay);
  }
}

let wss = null;
let server = null;

function startCollabServer(port = PORT) {
  if (server) return { server, wss };

  server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', activeRooms: rooms.size, port }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  wss = new WebSocketServer({ server });

  wss.on('connection', async (ws, req) => {
    // Extract docId from URL path or query (e.g., /doc-123 or ?docId=doc-123)
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let docId = url.searchParams.get('docId') || url.pathname.replace(/^\/+/, '').split('/')[0];
    if (!docId || docId === 'health') {
      docId = 'default';
    }

    const room = await getOrCreateRoom(docId);
    if (room.loadingPromise) {
      await room.loadingPromise;
    }
    room.clients.add(ws);
    room.clientAwarenessIds.set(ws, new Set());

    // Initial Synchronizations:
    // 1. Send sync-step-1 with server's state vector so client can supply missing updates
    // 2. Send sync-init with server's current state
    try {
      const serverVector = Y.encodeStateVector(room.doc);
      const serverState = Y.encodeStateAsUpdate(room.doc);

      ws.send(
        JSON.stringify({
          type: 'sync-step-1',
          vector: Buffer.from(serverVector).toString('base64'),
          senderId: room.doc.clientID,
        })
      );

      ws.send(
        JSON.stringify({
          type: 'sync-init',
          update: Buffer.from(serverState).toString('base64'),
          senderId: room.doc.clientID,
        })
      );

      // Send existing awareness states
      const awarenessStates = awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(room.awareness.getStates().keys())
      );
      if (awarenessStates.byteLength > 0) {
        ws.send(
          JSON.stringify({
            type: 'awareness',
            update: Buffer.from(awarenessStates).toString('base64'),
          })
        );
      }
    } catch (e) {
      console.error('[Collab] Error during initial sync:', e);
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'sync-step-1') {
          // Client sent its state vector; compute and reply with missing server updates
          const clientVector = Buffer.from(msg.vector, 'base64');
          const missingUpdate = Y.encodeStateAsUpdate(room.doc, clientVector);
          if (missingUpdate.byteLength > 0) {
            ws.send(
              JSON.stringify({
                type: 'sync-step-2',
                update: Buffer.from(missingUpdate).toString('base64'),
              })
            );
          }
        } else if (msg.type === 'sync-step-2' || msg.type === 'update') {
          // Apply client update to room doc with origin ws (doc 'update' event broadcasts to others)
          const update = Buffer.from(msg.update, 'base64');
          Y.applyUpdate(room.doc, update, ws);
        } else if (msg.type === 'awareness') {
          // Apply client awareness
          const update = Buffer.from(msg.update, 'base64');
          awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);
          if (msg.senderId) {
            const idSet = room.clientAwarenessIds.get(ws);
            if (idSet) idSet.add(msg.senderId);
          }
        }
      } catch (e) {
        console.error('[Collab] Message parse error:', e.message);
      }
    });

    ws.on('close', () => {
      room.clients.delete(ws);
      const idSet = room.clientAwarenessIds.get(ws);
      if (idSet && idSet.size > 0) {
        awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(idSet), ws);
      }
      room.clientAwarenessIds.delete(ws);

      if (room.clients.size === 0) {
        scheduleSave(room, 500);
        setTimeout(() => {
          if (room.clients.size === 0) {
            rooms.delete(docId);
          }
        }, 60000);
      }
    });

    ws.on('error', (err) => {
      console.error('[Collab] WebSocket client error:', err.message);
      room.clients.delete(ws);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Collab] Port ${port} is in use, server already running.`);
    } else {
      console.error('[Collab] Server error:', err);
    }
  });

  server.listen(port, () => {
    console.log(`[Collab] Real-time Yjs WebSocket collaboration server listening on port ${port}`);
  });

  return { server, wss };
}

if (require.main === module) {
  startCollabServer();
}

module.exports = {
  startCollabServer,
  getOrCreateRoom,
  rooms,
};
