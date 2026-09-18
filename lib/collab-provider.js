import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { IndexeddbPersistence } from 'y-indexeddb';
import { supabase, isSupabaseConfigured } from './supabase';

// Helper to convert Uint8Array <-> base64 for cross-network transmission
function uint8ArrayToBase64(arr) {
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class ConfluoCollabProvider {
  constructor(docId, user, options = {}) {
    this.docId = docId;
    this.user = user;
    this.options = options;

    this.doc = new Y.Doc({ guid: docId });
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    // If persisted Yjs state is provided, apply it immediately
    if (options.initialYjsState) {
      try {
        const initialBytes = base64ToUint8Array(options.initialYjsState);
        Y.applyUpdate(this.doc, initialBytes, 'initial');
      } catch (e) {
        console.warn('Failed to apply initial Yjs state:', e);
      }
    }

    this.status = 'connecting'; // 'connecting' | 'connected' | 'syncing' | 'offline'
    this.synced = false;
    this.isManualOffline = false;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    // Set initial user awareness
    if (user) {
      this.awareness.setLocalStateField('user', {
        id: user.id,
        name: user.displayName || user.name || 'Anonymous',
        color: user.color || '#0F6E6E',
        role: user.role || 'editor',
      });
    }

    // Initialize IndexedDB persistence for offline-first behavior
    if (typeof window !== 'undefined') {
      try {
        this.indexeddb = new IndexeddbPersistence(`confluo-doc-${docId}`, this.doc);
        this.indexeddb.on('synced', () => {
          this.emit('indexeddb-synced');
          if (this.status !== 'offline') {
            this.setStatus('connected');
          }
        });
      } catch (err) {
        console.warn('IndexedDB persistence not available:', err);
      }
    }

    // Set up network & realtime synchronization
    if (typeof window !== 'undefined') {
      this.setupWebSocket();
      this.setupBroadcastChannel();
      this.setupSupabaseChannel();
      this.setupSSEChannel();
      this.setupWindowListeners();
      this.setupDocListeners();
      this.setupAwarenessListeners();
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(handler);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const handler of this.listeners.get(event)) {
        try {
          handler(data);
        } catch (e) {
          console.error(`Error in listener for ${event}:`, e);
        }
      }
    }
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', { status });
  }

  setupWindowListeners() {
    this._handleOnline = () => {
      if (!this.isManualOffline) {
        this.connect();
      }
    };
    this._handleOffline = () => {
      this.disconnect(true);
    };

    window.addEventListener('online', this._handleOnline);
    window.addEventListener('offline', this._handleOffline);
  }

  // Direct Yjs WebSocket Server connection
  setupWebSocket() {
    if (typeof window === 'undefined') return;

    let wsUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL;
    if (!wsUrl) {
      const hostname = window.location.hostname || 'localhost';
      const isSecure = window.location.protocol === 'https:';
      const wsProtocol = isSecure ? 'wss:' : 'ws:';
      const port = process.env.NEXT_PUBLIC_COLLAB_PORT || '1234';
      wsUrl = `${wsProtocol}//${hostname}:${port}/${this.docId}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');

        // Send Sync Step 1 with local state vector
        try {
          const vector = Y.encodeStateVector(this.doc);
          this.ws.send(
            JSON.stringify({
              type: 'sync-step-1',
              vector: uint8ArrayToBase64(vector),
            })
          );

          // Send current awareness
          const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
            this.doc.clientID,
          ]);
          this.ws.send(
            JSON.stringify({
              type: 'awareness',
              update: uint8ArrayToBase64(awarenessUpdate),
            })
          );
        } catch (e) {
          console.error('WS handshake error:', e);
        }
      };

      this.ws.onmessage = (event) => {
        if (this.status === 'offline') return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'sync-init' || msg.type === 'sync-step-2' || msg.type === 'update') {
            const update = base64ToUint8Array(msg.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'websocket');
            this.synced = true;
            this.emit('synced');
            setTimeout(() => {
              if (this.status === 'syncing') this.setStatus('connected');
            }, 200);
          } else if (msg.type === 'sync-step-1') {
            const remoteVector = base64ToUint8Array(msg.vector);
            const missingUpdate = Y.encodeStateAsUpdate(this.doc, remoteVector);
            if (missingUpdate.byteLength > 0) {
              this.ws.send(
                JSON.stringify({
                  type: 'sync-step-2',
                  update: uint8ArrayToBase64(missingUpdate),
                })
              );
            }
          } else if (msg.type === 'awareness') {
            const update = base64ToUint8Array(msg.update);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'websocket');
            this.emit('peers-changed', this.getPeers());
          }
        } catch (e) {
          console.error('WS onmessage error:', e);
        }
      };

      this.ws.onclose = () => {
        if (!this.isManualOffline) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        // Fallback silently without throwing to allow SSE / BroadcastChannel to operate
      };
    } catch (e) {
      console.warn('WebSocket init failed, fallback channels active:', e);
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isManualOffline && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.setupWebSocket();
      }
    }, delay);
  }

  // Server-Sent Events / HTTP Realtime Channel (works seamlessly on Vercel & serverless)
  setupSSEChannel() {
    if (typeof window === 'undefined') return;
    try {
      const sseUrl = `/api/collab/stream?docId=${encodeURIComponent(this.docId)}&clientId=${this.doc.clientID}`;
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onmessage = (event) => {
        if (this.status === 'offline') return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.senderId === this.doc.clientID) return;

          if (msg.type === 'update') {
            const update = base64ToUint8Array(msg.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'sse');
            setTimeout(() => {
              if (this.status === 'syncing') this.setStatus('connected');
            }, 200);
          } else if (msg.type === 'awareness') {
            const update = base64ToUint8Array(msg.update);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'sse');
            this.emit('peers-changed', this.getPeers());
          }
        } catch (e) {
          // ignore stream parse errors
        }
      };
    } catch (e) {
      console.warn('SSE stream init failed:', e);
    }
  }

  setupDocListeners() {
    this._docUpdateHandler = (update, origin) => {
      // Don't echo back updates received from remote channels
      if (origin === 'broadcast' || origin === 'supabase' || origin === 'websocket' || origin === 'sse') {
        return;
      }

      // If online, broadcast the update across active transports
      if (this.status !== 'offline') {
        this.setStatus('syncing');
        const b64 = uint8ArrayToBase64(update);

        // 1. Direct WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ type: 'update', update: b64, senderId: this.doc.clientID }));
          } catch (e) {}
        }

        // 2. BroadcastChannel (same-browser tabs)
        if (this.bc) {
          try {
            this.bc.postMessage({ type: 'update', update: b64, senderId: this.doc.clientID });
          } catch (e) {}
        }

        // 3. Supabase Realtime Channel
        if (this.supabaseChannel) {
          try {
            this.supabaseChannel.send({
              type: 'broadcast',
              event: 'yjs-update',
              payload: { update: b64, senderId: this.doc.clientID },
            });
          } catch (e) {}
        }

        // 4. HTTP Realtime Sync (for multi-browser on serverless / Vercel)
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          fetch('/api/collab/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docId: this.docId,
              type: 'update',
              update: b64,
              senderId: this.doc.clientID,
            }),
          }).catch(() => {});
        }

        setTimeout(() => {
          if (this.status === 'syncing') {
            this.setStatus('connected');
          }
        }, 250);
      }

      this.emit('update', { update, origin });
    };

    this.doc.on('update', this._docUpdateHandler);
  }

  setupAwarenessListeners() {
    this._awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
      if (origin === 'broadcast' || origin === 'supabase' || origin === 'websocket' || origin === 'sse') {
        this.emit('peers-changed', this.getPeers());
        return;
      }

      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length === 0) return;

      if (this.status !== 'offline') {
        const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
        const b64 = uint8ArrayToBase64(update);

        // 1. Direct WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ type: 'awareness', update: b64, senderId: this.doc.clientID }));
          } catch (e) {}
        }

        // 2. BroadcastChannel
        if (this.bc) {
          try {
            this.bc.postMessage({ type: 'awareness', update: b64, senderId: this.doc.clientID });
          } catch (e) {}
        }

        // 3. Supabase Realtime Channel
        if (this.supabaseChannel) {
          try {
            this.supabaseChannel.send({
              type: 'broadcast',
              event: 'awareness',
              payload: { update: b64, senderId: this.doc.clientID },
            });
          } catch (e) {}
        }

        // 4. HTTP Realtime Sync
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          fetch('/api/collab/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docId: this.docId,
              type: 'awareness',
              update: b64,
              senderId: this.doc.clientID,
            }),
          }).catch(() => {});
        }
      }

      this.emit('peers-changed', this.getPeers());
    };

    this.awareness.on('update', this._awarenessUpdateHandler);
  }

  setupBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel(`confluo-crdt-${this.docId}`);
      this.bc.onmessage = (event) => {
        if (this.status === 'offline') return;
        const msg = event.data;
        if (!msg || msg.senderId === this.doc.clientID) return;

        if (msg.type === 'sync-step-1') {
          try {
            const remoteVector = base64ToUint8Array(msg.vector);
            const missingUpdate = Y.encodeStateAsUpdate(this.doc, remoteVector);
            if (missingUpdate.byteLength > 0) {
              this.bc.postMessage({
                type: 'sync-step-2',
                update: uint8ArrayToBase64(missingUpdate),
                senderId: this.doc.clientID,
              });
            }
          } catch (e) {}
        } else if (msg.type === 'sync-step-2' || msg.type === 'update') {
          try {
            const update = base64ToUint8Array(msg.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'broadcast');
            setTimeout(() => {
              if (this.status === 'syncing') this.setStatus('connected');
            }, 200);
          } catch (e) {}
        } else if (msg.type === 'awareness') {
          try {
            const update = base64ToUint8Array(msg.update);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'broadcast');
          } catch (e) {}
        } else if (msg.type === 'query-awareness') {
          const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
          this.bc.postMessage({
            type: 'awareness',
            update: uint8ArrayToBase64(update),
            senderId: this.doc.clientID,
          });
        }
      };

      this.sendSyncStep1();
      this.queryAwareness();
    } catch (e) {
      console.warn('BroadcastChannel failed to initialize:', e);
    }
  }

  setupSupabaseChannel() {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      this.supabaseChannel = supabase.channel(`doc:${this.docId}`, {
        config: { broadcast: { self: false } },
      });

      this.supabaseChannel
        .on('broadcast', { event: 'yjs-sync-step-1' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const remoteVector = base64ToUint8Array(payload.vector);
            const missingUpdate = Y.encodeStateAsUpdate(this.doc, remoteVector);
            if (missingUpdate.byteLength > 0) {
              this.supabaseChannel.send({
                type: 'broadcast',
                event: 'yjs-sync-step-2',
                payload: {
                  update: uint8ArrayToBase64(missingUpdate),
                  senderId: this.doc.clientID,
                },
              });
            }
          } catch (e) {}
        })
        .on('broadcast', { event: 'yjs-sync-step-2' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const update = base64ToUint8Array(payload.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'supabase');
            setTimeout(() => {
              if (this.status === 'syncing') this.setStatus('connected');
            }, 200);
          } catch (e) {}
        })
        .on('broadcast', { event: 'yjs-update' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const update = base64ToUint8Array(payload.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'supabase');
            setTimeout(() => {
              if (this.status === 'syncing') this.setStatus('connected');
            }, 200);
          } catch (e) {}
        })
        .on('broadcast', { event: 'awareness' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const update = base64ToUint8Array(payload.update);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'supabase');
          } catch (e) {}
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.sendSyncStep1();
            this.queryAwareness();
          }
        });
    } catch (e) {
      console.warn('Supabase realtime channel failed:', e);
    }
  }

  sendSyncStep1() {
    try {
      const vector = Y.encodeStateVector(this.doc);
      const b64 = uint8ArrayToBase64(vector);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'sync-step-1', vector: b64 }));
      }
      if (this.bc) {
        this.bc.postMessage({ type: 'sync-step-1', vector: b64, senderId: this.doc.clientID });
      }
      if (this.supabaseChannel) {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'yjs-sync-step-1',
          payload: { vector: b64, senderId: this.doc.clientID },
        });
      }
    } catch (e) {}
  }

  queryAwareness() {
    if (this.bc) {
      try {
        this.bc.postMessage({ type: 'query-awareness', senderId: this.doc.clientID });
      } catch (e) {}
    }
  }

  getPeers() {
    const states = this.awareness.getStates();
    const peers = [];
    states.forEach((state, clientId) => {
      if (clientId !== this.doc.clientID && state.user) {
        peers.push({
          clientId,
          id: state.user.id,
          name: state.user.name,
          color: state.user.color,
          role: state.user.role,
          cursor: state.cursor,
        });
      }
    });
    return peers;
  }

  setOffline(offline) {
    this.isManualOffline = offline;
    if (offline) {
      this.disconnect(false);
      this.setStatus('offline');
    } else {
      this.connect();
    }
  }

  disconnect(isNetworkOffline = false) {
    if (!isNetworkOffline) {
      this.isManualOffline = true;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('offline');
  }

  connect() {
    this.isManualOffline = false;
    this.setStatus('syncing');

    if (this.user) {
      this.awareness.setLocalStateField('user', {
        id: this.user.id,
        name: this.user.displayName || this.user.name || 'Anonymous',
        color: this.user.color || '#0F6E6E',
        role: this.user.role || 'editor',
      });
    }

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.setupWebSocket();
    }
    if (!this.eventSource) {
      this.setupSSEChannel();
    }

    this.sendSyncStep1();
    this.queryAwareness();

    setTimeout(() => {
      if (this.status === 'syncing') {
        this.setStatus('connected');
      }
    }, 400);
  }

  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._handleOnline);
      window.removeEventListener('offline', this._handleOffline);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.bc) {
      this.bc.close();
    }
    if (this.supabaseChannel) {
      this.supabaseChannel.unsubscribe();
    }
    if (this.indexeddb) {
      this.indexeddb.destroy();
    }
    this.awareness.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}
