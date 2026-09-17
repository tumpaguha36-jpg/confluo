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

    this.status = 'connecting'; // 'connecting' | 'connected' | 'syncing' | 'offline'
    this.synced = false;
    this.isManualOffline = false;
    this.listeners = new Map();

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
      this.setupBroadcastChannel();
      this.setupSupabaseChannel();
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

  setupDocListeners() {
    this._docUpdateHandler = (update, origin) => {
      // Don't echo back updates received from external channels
      if (origin === 'broadcast' || origin === 'supabase') {
        return;
      }

      // If online, broadcast the update
      if (this.status !== 'offline') {
        this.setStatus('syncing');
        const b64 = uint8ArrayToBase64(update);

        if (this.bc) {
          try {
            this.bc.postMessage({ type: 'update', update: b64, senderId: this.doc.clientID });
          } catch (e) {
            console.error('BC send error:', e);
          }
        }

        if (this.supabaseChannel) {
          try {
            this.supabaseChannel.send({
              type: 'broadcast',
              event: 'yjs-update',
              payload: { update: b64, senderId: this.doc.clientID },
            });
          } catch (e) {
            console.error('Supabase send error:', e);
          }
        }

        // Return to connected state after brief sync indicator
        setTimeout(() => {
          if (this.status === 'syncing') {
            this.setStatus('connected');
          }
        }, 300);
      }

      this.emit('update', { update, origin });
    };

    this.doc.on('update', this._docUpdateHandler);
  }

  setupAwarenessListeners() {
    this._awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
      if (origin === 'broadcast' || origin === 'supabase') {
        this.emit('peers-changed', this.getPeers());
        return;
      }

      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length === 0) return;

      if (this.status !== 'offline') {
        const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
        const b64 = uint8ArrayToBase64(update);

        if (this.bc) {
          try {
            this.bc.postMessage({ type: 'awareness', update: b64, senderId: this.doc.clientID });
          } catch (e) {}
        }

        if (this.supabaseChannel) {
          try {
            this.supabaseChannel.send({
              type: 'broadcast',
              event: 'awareness',
              payload: { update: b64, senderId: this.doc.clientID },
            });
          } catch (e) {}
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
          // Peer requested state vector, send back missing updates
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
          } catch (e) {
            console.error('Error handling sync-step-1:', e);
          }
        } else if (msg.type === 'sync-step-2') {
          // Received updates from peer
          try {
            const update = base64ToUint8Array(msg.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'broadcast');
            setTimeout(() => this.setStatus('connected'), 200);
          } catch (e) {
            console.error('Error handling sync-step-2:', e);
          }
        } else if (msg.type === 'update') {
          // Incremental update from peer
          try {
            const update = base64ToUint8Array(msg.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'broadcast');
            setTimeout(() => this.setStatus('connected'), 200);
          } catch (e) {
            console.error('Error handling incremental update:', e);
          }
        } else if (msg.type === 'awareness') {
          // Awareness update from peer
          try {
            const update = base64ToUint8Array(msg.update);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'broadcast');
          } catch (e) {
            console.error('Error handling awareness:', e);
          }
        } else if (msg.type === 'query-awareness') {
          // Reply with all local awareness states
          const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
          this.bc.postMessage({
            type: 'awareness',
            update: uint8ArrayToBase64(update),
            senderId: this.doc.clientID,
          });
        }
      };

      // Initiate sync with any existing peers on the BroadcastChannel
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
          } catch (e) {
            console.error('Supabase sync-1 error:', e);
          }
        })
        .on('broadcast', { event: 'yjs-sync-step-2' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const update = base64ToUint8Array(payload.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'supabase');
            setTimeout(() => this.setStatus('connected'), 200);
          } catch (e) {
            console.error('Supabase sync-2 error:', e);
          }
        })
        .on('broadcast', { event: 'yjs-update' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const update = base64ToUint8Array(payload.update);
            this.setStatus('syncing');
            Y.applyUpdate(this.doc, update, 'supabase');
            setTimeout(() => this.setStatus('connected'), 200);
          } catch (e) {
            console.error('Supabase update error:', e);
          }
        })
        .on('broadcast', { event: 'awareness' }, ({ payload }) => {
          if (this.status === 'offline' || payload.senderId === this.doc.clientID) return;
          try {
            const update = base64ToUint8Array(payload.update);
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, 'supabase');
          } catch (e) {
            console.error('Supabase awareness error:', e);
          }
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
    } catch (e) {
      console.error('sendSyncStep1 error:', e);
    }
  }

  queryAwareness() {
    try {
      if (this.bc) {
        this.bc.postMessage({ type: 'query-awareness', senderId: this.doc.clientID });
      }
    } catch (e) {}
  }

  getPeers() {
    const states = this.awareness.getStates();
    const list = [];
    states.forEach((state, clientID) => {
      if (clientID !== this.doc.clientID && state.user) {
        list.push({
          clientId: clientID,
          id: state.user.id || String(clientID),
          name: state.user.name || 'Collaborator',
          color: state.user.color || '#0F6E6E',
          role: state.user.role || 'editor',
          cursor: state.cursor || null,
        });
      }
    });
    return list;
  }

  // Toggle or set manual offline mode (for simulation / network testing)
  setOffline(isOffline) {
    this.isManualOffline = isOffline;
    if (isOffline) {
      this.disconnect(false);
    } else {
      this.connect();
    }
  }

  disconnect(isNetworkOffline = false) {
    this.setStatus('offline');
    // Remove local presence indicator from remote peers
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
  }

  connect() {
    this.isManualOffline = false;
    this.setStatus('syncing');

    // Re-announce local user presence
    if (this.user) {
      this.awareness.setLocalStateField('user', {
        id: this.user.id,
        name: this.user.displayName || this.user.name || 'Anonymous',
        color: this.user.color || '#0F6E6E',
        role: this.user.role || 'editor',
      });
    }

    // Exchange missing updates in both directions
    this.sendSyncStep1();
    this.queryAwareness();

    setTimeout(() => {
      this.setStatus('connected');
    }, 400);
  }

  destroy() {
    if (this._docUpdateHandler) {
      this.doc.off('update', this._docUpdateHandler);
    }
    if (this._awarenessUpdateHandler) {
      this.awareness.off('update', this._awarenessUpdateHandler);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._handleOnline);
      window.removeEventListener('offline', this._handleOffline);
    }
    if (this.bc) {
      try { this.bc.close(); } catch (e) {}
    }
    if (this.supabaseChannel) {
      try { this.supabaseChannel.unsubscribe(); } catch (e) {}
    }
    if (this.indexeddb) {
      try { this.indexeddb.destroy(); } catch (e) {}
    }
    this.awareness.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}
