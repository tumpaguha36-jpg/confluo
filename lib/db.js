import fs from 'fs';
import path from 'path';
import { supabaseAdmin, isSupabaseConfigured } from './supabase.js';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function ensureLocalDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      users: [],
      sessions: [],
      docs: [],
      comments: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    const initial = { users: [], sessions: [], docs: [], comments: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

function saveLocalDb(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist local db:', err);
  }
}

// Convert camelCase object to Supabase snake_case
function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const res = {};
  for (const [key, val] of Object.entries(obj)) {
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    res[snake] = val;
  }
  return res;
}

// Convert Supabase snake_case to camelCase
function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const res = {};
  for (const [key, val] of Object.entries(obj)) {
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    res[camel] = val;
  }
  if (res.displayName === undefined && obj.display_name !== undefined) {
    res.displayName = obj.display_name;
  }
  return res;
}

export async function getDb() {
  if (isSupabaseConfigured && supabaseAdmin) {
    const supabaseDb = {
      type: 'supabase',
      collection(name) {
        return this[name];
      },
      users: {
        async findOne(filter) {
          let query = supabaseAdmin.from('users').select('*');
          if (filter.id) query = query.eq('id', filter.id);
          if (filter.email) query = query.eq('email', filter.email.toLowerCase());
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          return data ? toCamelCase(data) : null;
        },
        async countDocuments() {
          const { count, error } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
          if (error) return 0;
          return count || 0;
        },
        async insertOne(user) {
          const row = toSnakeCase(user);
          const { error } = await supabaseAdmin.from('users').insert(row);
          if (error) throw error;
          return user;
        },
        find(filter = {}) {
          let sortField = null;
          let sortAsc = true;
          return {
            sort(order) {
              if (order) {
                const [key, dir] = Object.entries(order)[0] || [];
                if (key) {
                  sortField = key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
                  sortAsc = dir === 1 || dir === 'asc';
                }
              }
              return this;
            },
            async toArray() {
              let query = supabaseAdmin.from('users').select('*');
              if (filter.id && filter.id.$in) {
                query = query.in('id', filter.id.$in);
              }
              if (sortField) {
                query = query.order(sortField, { ascending: sortAsc });
              }
              const { data, error } = await query;
              if (error) throw error;
              return (data || []).map(toCamelCase);
            },
          };
        },
      },
      sessions: {
        async findOne(filter) {
          let query = supabaseAdmin.from('sessions').select('*');
          if (filter.token) query = query.eq('token', filter.token);
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          return data ? toCamelCase(data) : null;
        },
        async insertOne(session) {
          const row = toSnakeCase(session);
          const { error } = await supabaseAdmin.from('sessions').insert(row);
          if (error) throw error;
          return session;
        },
        async deleteOne(filter) {
          let query = supabaseAdmin.from('sessions').delete();
          if (filter.token) query = query.eq('token', filter.token);
          const { error } = await query;
          if (error) throw error;
          return { deletedCount: 1 };
        },
      },
      docs: {
        find(filter = {}) {
          let sortField = 'updated_at';
          let sortAsc = false;
          return {
            sort(order) {
              if (order) {
                const [key, dir] = Object.entries(order)[0] || [];
                if (key) {
                  sortField = key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
                  sortAsc = dir === 1 || dir === 'asc';
                }
              }
              return this;
            },
            async toArray() {
              let query = supabaseAdmin.from('docs').select('*');
              if (sortField) query = query.order(sortField, { ascending: sortAsc });
              const { data, error } = await query;
              if (error) throw error;
              let list = (data || []).map(toCamelCase);
              if (filter.$or) {
                list = list.filter((doc) => {
                  return filter.$or.some((clause) => {
                    if (clause.ownerId && doc.ownerId === clause.ownerId) return true;
                    if (clause['collaborators.userId']) {
                      return (doc.collaborators || []).some((c) => c.userId === clause['collaborators.userId']);
                    }
                    return false;
                  });
                });
              }
              return list;
            },
          };
        },
        async findOne(filter) {
          let query = supabaseAdmin.from('docs').select('*');
          if (filter.id) query = query.eq('id', filter.id);
          const { data, error } = await query;
          if (error) throw error;
          const list = (data || []).map(toCamelCase);
          if (filter.id) return list[0] || null;
          if (filter['shareLinks.token']) {
            const match = list.find((d) => (d.shareLinks || []).some((l) => l.token === filter['shareLinks.token']));
            return match || null;
          }
          return list[0] || null;
        },
        async insertOne(doc) {
          const row = toSnakeCase(doc);
          const { error } = await supabaseAdmin.from('docs').insert(row);
          if (error) throw error;
          return doc;
        },
        async updateOne(filter, updateObj) {
          const setFields = toSnakeCase(updateObj.$set || {});
          let query = supabaseAdmin.from('docs').update(setFields);
          if (filter.id) query = query.eq('id', filter.id);
          const { error } = await query;
          if (error) throw error;
          return { modifiedCount: 1 };
        },
        async deleteOne(filter) {
          let query = supabaseAdmin.from('docs').delete();
          if (filter.id) query = query.eq('id', filter.id);
          const { error } = await query;
          if (error) throw error;
          return { deletedCount: 1 };
        },
      },
      comments: {
        find(filter = {}) {
          let sortField = 'created_at';
          let sortAsc = true;
          return {
            sort(order) {
              if (order) {
                const [key, dir] = Object.entries(order)[0] || [];
                if (key) {
                  sortField = key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
                  sortAsc = dir === 1 || dir === 'asc';
                }
              }
              return this;
            },
            async toArray() {
              let query = supabaseAdmin.from('comments').select('*');
              if (filter.docId) query = query.eq('doc_id', filter.docId);
              if (sortField) query = query.order(sortField, { ascending: sortAsc });
              const { data, error } = await query;
              if (error) throw error;
              return (data || []).map(toCamelCase);
            },
          };
        },
        async findOne(filter) {
          let query = supabaseAdmin.from('comments').select('*');
          if (filter.id) query = query.eq('id', filter.id);
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          return data ? toCamelCase(data) : null;
        },
        async insertOne(comment) {
          const row = toSnakeCase(comment);
          const { error } = await supabaseAdmin.from('comments').insert(row);
          if (error) throw error;
          return comment;
        },
        async updateOne(filter, updateObj) {
          const setFields = toSnakeCase(updateObj.$set || {});
          let query = supabaseAdmin.from('comments').update(setFields);
          if (filter.id) query = query.eq('id', filter.id);
          const { error } = await query;
          if (error) throw error;
          return { modifiedCount: 1 };
        },
        async deleteMany(filter) {
          if (filter.docId) {
            const { error } = await supabaseAdmin.from('comments').delete().eq('doc_id', filter.docId);
            if (error) throw error;
          } else if (filter.$or) {
            for (const clause of filter.$or) {
              if (clause.id) await supabaseAdmin.from('comments').delete().eq('id', clause.id);
              if (clause.parentId) await supabaseAdmin.from('comments').delete().eq('parent_id', clause.parentId);
            }
          }
          return { ok: true };
        },
      },
    };
    return supabaseDb;
  }

  // Fallback: Local persisted storage (fully functional offline/standalone)
  const localData = ensureLocalDb();

  const localDb = {
    type: 'local',
    collection(name) {
      return this[name];
    },
    users: {
      async findOne(filter) {
        return (
          localData.users.find((u) => {
            if (filter.id && u.id === filter.id) return true;
            if (filter.email && u.email.toLowerCase() === filter.email.toLowerCase()) return true;
            return false;
          }) || null
        );
      },
      async countDocuments() {
        return localData.users.length;
      },
      async insertOne(user) {
        localData.users.push(user);
        saveLocalDb(localData);
        return user;
      },
      find(filter = {}) {
        let list = [...localData.users];
        if (filter.id && filter.id.$in) {
          list = list.filter((u) => filter.id.$in.includes(u.id));
        }
        return {
          sort() { return this; },
          async toArray() { return list; },
        };
      },
    },
    sessions: {
      async findOne(filter) {
        return localData.sessions.find((s) => s.token === filter.token) || null;
      },
      async insertOne(session) {
        localData.sessions.push(session);
        saveLocalDb(localData);
        return session;
      },
      async deleteOne(filter) {
        localData.sessions = localData.sessions.filter((s) => s.token !== filter.token);
        saveLocalDb(localData);
        return { deletedCount: 1 };
      },
    },
    docs: {
      find(filter = {}) {
        let list = [...localData.docs];
        if (filter.$or) {
          list = list.filter((doc) => {
            return filter.$or.some((clause) => {
              if (clause.ownerId && doc.ownerId === clause.ownerId) return true;
              if (clause['collaborators.userId']) {
                return (doc.collaborators || []).some((c) => c.userId === clause['collaborators.userId']);
              }
              return false;
            });
          });
        }
        return {
          sort(order) {
            if (order && (order.updatedAt === -1 || order.updatedAt === 'desc')) {
              list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            } else if (order && (order.updatedAt === 1 || order.updatedAt === 'asc')) {
              list.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
            }
            return this;
          },
          async toArray() { return list; },
        };
      },
      async findOne(filter) {
        if (filter.id) {
          return localData.docs.find((d) => d.id === filter.id) || null;
        }
        if (filter['shareLinks.token']) {
          return localData.docs.find((d) => (d.shareLinks || []).some((l) => l.token === filter['shareLinks.token'])) || null;
        }
        return null;
      },
      async insertOne(doc) {
        localData.docs.push(doc);
        saveLocalDb(localData);
        return doc;
      },
      async updateOne(filter, updateObj) {
        const doc = localData.docs.find((d) => d.id === filter.id);
        if (doc) {
          Object.assign(doc, updateObj.$set || {});
          saveLocalDb(localData);
        }
        return { modifiedCount: doc ? 1 : 0 };
      },
      async deleteOne(filter) {
        localData.docs = localData.docs.filter((d) => d.id !== filter.id);
        saveLocalDb(localData);
        return { deletedCount: 1 };
      },
    },
    comments: {
      find(filter = {}) {
        let list = [...localData.comments];
        if (filter.docId) {
          list = list.filter((c) => c.docId === filter.docId);
        }
        return {
          sort(order) {
            if (order && (order.createdAt === -1 || order.createdAt === 'desc')) {
              list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            } else {
              list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            }
            return this;
          },
          async toArray() { return list; },
        };
      },
      async findOne(filter) {
        return localData.comments.find((c) => c.id === filter.id) || null;
      },
      async insertOne(comment) {
        localData.comments.push(comment);
        saveLocalDb(localData);
        return comment;
      },
      async updateOne(filter, updateObj) {
        const comment = localData.comments.find((c) => c.id === filter.id);
        if (comment) {
          Object.assign(comment, updateObj.$set || {});
          saveLocalDb(localData);
        }
        return { modifiedCount: comment ? 1 : 0 };
      },
      async deleteMany(filter) {
        if (filter.docId) {
          localData.comments = localData.comments.filter((c) => c.docId !== filter.docId);
        } else if (filter.$or) {
          const ids = filter.$or.map((o) => o.id || o.parentId).filter(Boolean);
          localData.comments = localData.comments.filter((c) => !ids.includes(c.id) && !ids.includes(c.parentId));
        }
        saveLocalDb(localData);
        return { ok: true };
      },
    },
  };
  return localDb;
}
