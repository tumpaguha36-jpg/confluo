import fs from 'fs';
import path from 'path';
import os from 'os';
import { supabaseAdmin, isSupabaseConfigured } from './supabase.js';

let inMemoryData = {
  users: [],
  sessions: [],
  docs: [],
  comments: [],
  documentMembers: [],
};

let resolvedDataDir = null;
let resolvedDataFile = null;

function getStoragePaths() {
  if (resolvedDataDir && resolvedDataFile) {
    return { dir: resolvedDataDir, file: resolvedDataFile };
  }

  // If in Vercel / serverless environment, always use os.tmpdir()
  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  );

  if (isServerless) {
    const tmpDir = path.join(os.tmpdir(), 'confluo-data');
    resolvedDataDir = tmpDir;
    resolvedDataFile = path.join(tmpDir, 'db.json');
    return { dir: resolvedDataDir, file: resolvedDataFile };
  }

  // For local development, check if process.cwd() is writable
  try {
    const localDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    resolvedDataDir = localDir;
    resolvedDataFile = path.join(localDir, 'db.json');
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'confluo-data');
    resolvedDataDir = tmpDir;
    resolvedDataFile = path.join(tmpDir, 'db.json');
  }

  return { dir: resolvedDataDir, file: resolvedDataFile };
}

function ensureLocalDb() {
  try {
    const { dir, file } = getStoragePaths();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(inMemoryData, null, 2), 'utf8');
      return inMemoryData;
    }
    const content = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(content);
    inMemoryData = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      docs: Array.isArray(parsed.docs) ? parsed.docs : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      documentMembers: Array.isArray(parsed.documentMembers) ? parsed.documentMembers : [],
    };
    return inMemoryData;
  } catch (err) {
    // If running in read-only environment or file system access fails,
    // fallback gracefully to in-memory store
    console.warn('Local file storage fallback to memory:', err.message);
    return inMemoryData;
  }
}

function saveLocalDb(data) {
  inMemoryData = data;
  try {
    const { dir, file } = getStoragePaths();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to persist local db to disk, kept in memory:', err.message);
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
  if (typeof res.collaborators === 'string') {
    try { res.collaborators = JSON.parse(res.collaborators); } catch (_) { res.collaborators = []; }
  }
  if (typeof res.shareLinks === 'string') {
    try { res.shareLinks = JSON.parse(res.shareLinks); } catch (_) { res.shareLinks = []; }
  }
  return res;
}

// Standalone local DB instance
const localDb = {
  type: 'local',
  collection(name) {
    if (name === 'document_members' || name === 'documentMembers') return this.documentMembers;
    return this[name];
  },
  users: {
    async findOne(filter) {
      const data = ensureLocalDb();
      const targetEmail = filter.email ? filter.email.trim().toLowerCase() : null;
      return (
        data.users.find((u) => {
          if (filter.id && u.id === filter.id) return true;
          if (targetEmail && u.email && u.email.trim().toLowerCase() === targetEmail) return true;
          return false;
        }) || null
      );
    },
    async countDocuments() {
      const data = ensureLocalDb();
      return data.users.length;
    },
    async insertOne(user) {
      const data = ensureLocalDb();
      data.users.push(user);
      saveLocalDb(data);
      return user;
    },
    find(filter = {}) {
      const data = ensureLocalDb();
      let list = [...data.users];
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
      const data = ensureLocalDb();
      return data.sessions.find((s) => s.token === filter.token) || null;
    },
    async insertOne(session) {
      const data = ensureLocalDb();
      data.sessions.push(session);
      saveLocalDb(data);
      return session;
    },
    async deleteOne(filter) {
      const data = ensureLocalDb();
      data.sessions = data.sessions.filter((s) => s.token !== filter.token);
      saveLocalDb(data);
      return { deletedCount: 1 };
    },
  },
  docs: {
    find(filter = {}) {
      const data = ensureLocalDb();
      let list = [...data.docs];
      if (filter.$or) {
        list = list.filter((doc) => {
          return filter.$or.some((clause) => {
            if (clause.ownerId && doc.ownerId === clause.ownerId) return true;
            if (clause['collaborators.userId']) {
              const collabs = Array.isArray(doc.collaborators)
                ? doc.collaborators
                : (typeof doc.collaborators === 'string' ? JSON.parse(doc.collaborators || '[]') : []);
              return collabs.some((c) => c.userId === clause['collaborators.userId']);
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
      const data = ensureLocalDb();
      if (filter.id) {
        return data.docs.find((d) => d.id === filter.id) || null;
      }
      if (filter['shareLinks.token']) {
        return data.docs.find((d) => (d.shareLinks || []).some((l) => l.token === filter['shareLinks.token'])) || null;
      }
      return null;
    },
    async insertOne(doc) {
      const data = ensureLocalDb();
      data.docs.push(doc);
      saveLocalDb(data);
      return doc;
    },
    async updateOne(filter, updateObj) {
      const data = ensureLocalDb();
      const doc = data.docs.find((d) => d.id === filter.id);
      if (doc) {
        Object.assign(doc, updateObj.$set || {});
        saveLocalDb(data);
      }
      return { modifiedCount: doc ? 1 : 0 };
    },
    async deleteOne(filter) {
      const data = ensureLocalDb();
      data.docs = data.docs.filter((d) => d.id !== filter.id);
      saveLocalDb(data);
      return { deletedCount: 1 };
    },
  },
  comments: {
    find(filter = {}) {
      const data = ensureLocalDb();
      let list = [...data.comments];
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
      const data = ensureLocalDb();
      return data.comments.find((c) => c.id === filter.id) || null;
    },
    async insertOne(comment) {
      const data = ensureLocalDb();
      data.comments.push(comment);
      saveLocalDb(data);
      return comment;
    },
    async updateOne(filter, updateObj) {
      const data = ensureLocalDb();
      const comment = data.comments.find((c) => c.id === filter.id);
      if (comment) {
        Object.assign(comment, updateObj.$set || {});
        saveLocalDb(data);
      }
      return { modifiedCount: comment ? 1 : 0 };
    },
    async deleteMany(filter) {
      const data = ensureLocalDb();
      if (filter.docId) {
        data.comments = data.comments.filter((c) => c.docId !== filter.docId);
      } else if (filter.$or) {
        const ids = filter.$or.map((o) => o.id || o.parentId).filter(Boolean);
        data.comments = data.comments.filter((c) => !ids.includes(c.id) && !ids.includes(c.parentId));
      }
      saveLocalDb(data);
      return { ok: true };
    },
  },
  documentMembers: {
    find(filter = {}) {
      const data = ensureLocalDb();
      let list = [...(data.documentMembers || [])];
      if (filter.documentId) list = list.filter((m) => m.documentId === filter.documentId);
      if (filter.userId) list = list.filter((m) => m.userId === filter.userId);
      return {
        async toArray() { return list; },
      };
    },
    async findOne(filter) {
      const data = ensureLocalDb();
      return (data.documentMembers || []).find((m) => {
        if (filter.id && m.id === filter.id) return true;
        if (filter.documentId && filter.userId) {
          return m.documentId === filter.documentId && m.userId === filter.userId;
        }
        return false;
      }) || null;
    },
    async insertOne(member) {
      const data = ensureLocalDb();
      if (!data.documentMembers) data.documentMembers = [];
      const idx = data.documentMembers.findIndex(
        (m) => m.documentId === member.documentId && m.userId === member.userId
      );
      if (idx >= 0) {
        data.documentMembers[idx] = { ...data.documentMembers[idx], ...member };
      } else {
        data.documentMembers.push(member);
      }
      saveLocalDb(data);
      return member;
    },
    async updateOne(filter, updateObj) {
      const data = ensureLocalDb();
      if (!data.documentMembers) data.documentMembers = [];
      const member = data.documentMembers.find((m) => {
        if (filter.id && m.id === filter.id) return true;
        if (filter.documentId && filter.userId) {
          return m.documentId === filter.documentId && m.userId === filter.userId;
        }
        return false;
      });
      if (member) {
        Object.assign(member, updateObj.$set || {});
        saveLocalDb(data);
      }
      return { modifiedCount: member ? 1 : 0 };
    },
    async deleteOne(filter) {
      const data = ensureLocalDb();
      if (!data.documentMembers) data.documentMembers = [];
      const before = data.documentMembers.length;
      data.documentMembers = data.documentMembers.filter((m) => {
        if (filter.id && m.id === filter.id) return false;
        if (filter.documentId && filter.userId) {
          return !(m.documentId === filter.documentId && m.userId === filter.userId);
        }
        return true;
      });
      saveLocalDb(data);
      return { deletedCount: before - data.documentMembers.length };
    },
    async deleteMany(filter) {
      const data = ensureLocalDb();
      if (!data.documentMembers) data.documentMembers = [];
      const before = data.documentMembers.length;
      if (filter.documentId) {
        data.documentMembers = data.documentMembers.filter((m) => m.documentId !== filter.documentId);
      } else if (filter.userId) {
        data.documentMembers = data.documentMembers.filter((m) => m.userId !== filter.userId);
      }
      saveLocalDb(data);
      return { deletedCount: before - data.documentMembers.length };
    },
  },
};

// Supabase DB instance with automatic fallback to localDb on error
const supabaseDb = {
  type: 'supabase',
  collection(name) {
    if (name === 'document_members' || name === 'documentMembers') return this.documentMembers;
    return this[name];
  },
  users: {
    async findOne(filter) {
      try {
        let query = supabaseAdmin.from('users').select('*');
        if (filter.id) query = query.eq('id', filter.id);
        if (filter.email) {
          const cleanEmail = filter.email.trim().toLowerCase();
          query = query.ilike('email', cleanEmail);
        }
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (data) return toCamelCase(data);

        // Fallback: check Supabase Auth admin if user exists in auth.users
        if (filter.email && supabaseAdmin?.auth?.admin) {
          try {
            const cleanEmail = filter.email.trim().toLowerCase();
            const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
            const authUser = (authData?.users || []).find(
              (u) => (u.email || '').trim().toLowerCase() === cleanEmail
            );
            if (authUser) {
              const count = await this.countDocuments();
              const palette = [
                '#0F6E6E', '#B23A3A', '#B7791F', '#2E7D4F', '#3B5BDB', '#7048E8',
                '#C2255C', '#0B7285', '#5C940D', '#D9480F', '#495057', '#9C36B5',
              ];
              const newUser = {
                id: authUser.id,
                email: cleanEmail,
                displayName: authUser.user_metadata?.display_name || authUser.user_metadata?.name || cleanEmail.split('@')[0],
                passwordHash: 'auth_managed',
                color: palette[count % palette.length],
                avatarUrl: authUser.user_metadata?.avatar_url || null,
                createdAt: authUser.created_at || new Date().toISOString(),
              };
              await this.insertOne(newUser);
              return newUser;
            }
          } catch (_) {}
        }
        return null;
      } catch (e) {
        console.warn('Supabase users.findOne failed, using local fallback:', e.message);
        return localDb.users.findOne(filter);
      }
    },
    async countDocuments() {
      try {
        const { count, error } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
        if (error) throw error;
        return count || 0;
      } catch (e) {
        return localDb.users.countDocuments();
      }
    },
    async insertOne(user) {
      try {
        const row = toSnakeCase(user);
        const { error } = await supabaseAdmin.from('users').insert(row);
        if (error) throw error;
        return user;
      } catch (e) {
        console.warn('Supabase users.insertOne failed, using local fallback:', e.message);
        return localDb.users.insertOne(user);
      }
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
          try {
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
          } catch (e) {
            console.warn('Supabase users.find failed, using local fallback:', e.message);
            return localDb.users.find(filter).toArray();
          }
        },
      };
    },
  },
  sessions: {
    async findOne(filter) {
      try {
        let query = supabaseAdmin.from('sessions').select('*');
        if (filter.token) query = query.eq('token', filter.token);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data ? toCamelCase(data) : null;
      } catch (e) {
        console.warn('Supabase sessions.findOne failed, using local fallback:', e.message);
        return localDb.sessions.findOne(filter);
      }
    },
    async insertOne(session) {
      try {
        const row = toSnakeCase(session);
        const { error } = await supabaseAdmin.from('sessions').insert(row);
        if (error) throw error;
        return session;
      } catch (e) {
        console.warn('Supabase sessions.insertOne failed, using local fallback:', e.message);
        return localDb.sessions.insertOne(session);
      }
    },
    async deleteOne(filter) {
      try {
        let query = supabaseAdmin.from('sessions').delete();
        if (filter.token) query = query.eq('token', filter.token);
        const { error } = await query;
        if (error) throw error;
        return { deletedCount: 1 };
      } catch (e) {
        console.warn('Supabase sessions.deleteOne failed, using local fallback:', e.message);
        return localDb.sessions.deleteOne(filter);
      }
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
          try {
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
          } catch (e) {
            console.warn('Supabase docs.find failed, using local fallback:', e.message);
            return localDb.docs.find(filter).sort().toArray();
          }
        },
      };
    },
    async findOne(filter) {
      try {
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
      } catch (e) {
        console.warn('Supabase docs.findOne failed, using local fallback:', e.message);
        return localDb.docs.findOne(filter);
      }
    },
    async insertOne(doc) {
      try {
        const row = toSnakeCase(doc);
        const { error } = await supabaseAdmin.from('docs').insert(row);
        if (error) throw error;
        return doc;
      } catch (e) {
        console.warn('Supabase docs.insertOne failed, using local fallback:', e.message);
        return localDb.docs.insertOne(doc);
      }
    },
    async updateOne(filter, updateObj) {
      try {
        const setFields = toSnakeCase(updateObj.$set || {});
        let query = supabaseAdmin.from('docs').update(setFields);
        if (filter.id) query = query.eq('id', filter.id);
        const { error } = await query;
        if (error) throw error;
        return { modifiedCount: 1 };
      } catch (e) {
        console.warn('Supabase docs.updateOne failed, using local fallback:', e.message);
        return localDb.docs.updateOne(filter, updateObj);
      }
    },
    async deleteOne(filter) {
      try {
        let query = supabaseAdmin.from('docs').delete();
        if (filter.id) query = query.eq('id', filter.id);
        const { error } = await query;
        if (error) throw error;
        return { deletedCount: 1 };
      } catch (e) {
        console.warn('Supabase docs.deleteOne failed, using local fallback:', e.message);
        return localDb.docs.deleteOne(filter);
      }
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
          try {
            let query = supabaseAdmin.from('comments').select('*');
            if (filter.docId) query = query.eq('doc_id', filter.docId);
            if (sortField) query = query.order(sortField, { ascending: sortAsc });
            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map(toCamelCase);
          } catch (e) {
            console.warn('Supabase comments.find failed, using local fallback:', e.message);
            return localDb.comments.find(filter).toArray();
          }
        },
      };
    },
    async findOne(filter) {
      try {
        let query = supabaseAdmin.from('comments').select('*');
        if (filter.id) query = query.eq('id', filter.id);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data ? toCamelCase(data) : null;
      } catch (e) {
        console.warn('Supabase comments.findOne failed, using local fallback:', e.message);
        return localDb.comments.findOne(filter);
      }
    },
    async insertOne(comment) {
      try {
        const row = toSnakeCase(comment);
        const { error } = await supabaseAdmin.from('comments').insert(row);
        if (error) throw error;
        return comment;
      } catch (e) {
        console.warn('Supabase comments.insertOne failed, using local fallback:', e.message);
        return localDb.comments.insertOne(comment);
      }
    },
    async updateOne(filter, updateObj) {
      try {
        const setFields = toSnakeCase(updateObj.$set || {});
        let query = supabaseAdmin.from('comments').update(setFields);
        if (filter.id) query = query.eq('id', filter.id);
        const { error } = await query;
        if (error) throw error;
        return { modifiedCount: 1 };
      } catch (e) {
        console.warn('Supabase comments.updateOne failed, using local fallback:', e.message);
        return localDb.comments.updateOne(filter, updateObj);
      }
    },
    async deleteMany(filter) {
      try {
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
      } catch (e) {
        console.warn('Supabase comments.deleteMany failed, using local fallback:', e.message);
        return localDb.comments.deleteMany(filter);
      }
    },
  },
  documentMembers: {
    find(filter = {}) {
      return {
        async toArray() {
          try {
            let query = supabaseAdmin.from('document_members').select('*');
            if (filter.documentId) query = query.eq('document_id', filter.documentId);
            if (filter.userId) query = query.eq('user_id', filter.userId);
            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map(toCamelCase);
          } catch (e) {
            return localDb.documentMembers.find(filter).toArray();
          }
        },
      };
    },
    async findOne(filter) {
      try {
        let query = supabaseAdmin.from('document_members').select('*');
        if (filter.id) query = query.eq('id', filter.id);
        if (filter.documentId) query = query.eq('document_id', filter.documentId);
        if (filter.userId) query = query.eq('user_id', filter.userId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data ? toCamelCase(data) : null;
      } catch (e) {
        return localDb.documentMembers.findOne(filter);
      }
    },
    async insertOne(member) {
      try {
        const row = toSnakeCase(member);
        const { error } = await supabaseAdmin.from('document_members').upsert(row, { onConflict: 'document_id,user_id' });
        if (error) throw error;
        return member;
      } catch (e) {
        return localDb.documentMembers.insertOne(member);
      }
    },
    async updateOne(filter, updateObj) {
      try {
        const row = toSnakeCase(updateObj.$set || {});
        let query = supabaseAdmin.from('document_members').update(row);
        if (filter.id) query = query.eq('id', filter.id);
        if (filter.documentId) query = query.eq('document_id', filter.documentId);
        if (filter.userId) query = query.eq('user_id', filter.userId);
        const { error } = await query;
        if (error) throw error;
        return { modifiedCount: 1 };
      } catch (e) {
        return localDb.documentMembers.updateOne(filter, updateObj);
      }
    },
    async deleteOne(filter) {
      try {
        let query = supabaseAdmin.from('document_members').delete();
        if (filter.id) query = query.eq('id', filter.id);
        if (filter.documentId) query = query.eq('document_id', filter.documentId);
        if (filter.userId) query = query.eq('user_id', filter.userId);
        const { error } = await query;
        if (error) throw error;
        return { deletedCount: 1 };
      } catch (e) {
        return localDb.documentMembers.deleteOne(filter);
      }
    },
    async deleteMany(filter) {
      try {
        let query = supabaseAdmin.from('document_members').delete();
        if (filter.documentId) query = query.eq('document_id', filter.documentId);
        if (filter.userId) query = query.eq('user_id', filter.userId);
        const { error } = await query;
        if (error) throw error;
        return { deletedCount: 1 };
      } catch (e) {
        return localDb.documentMembers.deleteMany(filter);
      }
    },
  },
};

export async function getDb() {
  if (isSupabaseConfigured && supabaseAdmin) {
    try {
      // Fast check if Supabase is reachable and tables exist
      const { error } = await supabaseAdmin.from('users').select('id', { head: true, count: 'exact' });
      if (!error) {
        return supabaseDb;
      }
      console.warn('Supabase configured but users table unreachable, falling back to local storage:', error.message);
    } catch (err) {
      console.warn('Supabase connection error, falling back to local storage:', err.message);
    }
  }

  // Fallback: Local persisted storage (works seamlessly in local, Vercel, serverless, and offline)
  ensureLocalDb();
  return localDb;
}
