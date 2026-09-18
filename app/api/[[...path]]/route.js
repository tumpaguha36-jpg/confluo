import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getDb } from '@/lib/db'

function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

const json = (data, status = 200) => handleCORS(NextResponse.json(data, { status }))
const err = (message, status = 400) => json({ error: message }, status)

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

const COLLAB_PALETTE = [
  '#0F6E6E', '#B23A3A', '#B7791F', '#2E7D4F', '#3B5BDB', '#7048E8',
  '#C2255C', '#0B7285', '#5C940D', '#D9480F', '#495057', '#9C36B5',
]

const ROLE_RANK = { viewer: 1, commenter: 2, editor: 3, owner: 4 }

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}
function verifyPassword(password, stored) {
  try {
    if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const test = crypto.scryptSync(password, salt, 64).toString('hex')
    const bHash = Buffer.from(hash, 'hex')
    const bTest = Buffer.from(test, 'hex')
    if (bHash.length !== bTest.length) return false
    return crypto.timingSafeEqual(bHash, bTest)
  } catch {
    return false
  }
}

function publicUser(u) {
  if (!u) return null
  return { id: u.id, email: u.email, name: u.displayName, displayName: u.displayName, color: u.color, avatarUrl: u.avatarUrl || null }
}

async function getUser(request, db) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const session = await db.collection('sessions').findOne({ token })
  if (!session) return null
  return await db.collection('users').findOne({ id: session.userId })
}

function roleForUser(doc, userId) {
  if (!userId) return null
  if (doc.ownerId === userId) return 'owner'
  const c = (doc.collaborators || []).find((c) => c.userId === userId)
  return c ? c.role : null
}

async function enrichCollaborators(db, doc) {
  const ids = [doc.ownerId, ...(doc.collaborators || []).map((c) => c.userId)]
  const users = await db.collection('users').find({ id: { $in: ids } }).toArray()
  const map = {}
  users.forEach((u) => { map[u.id] = u })
  const list = []
  if (map[doc.ownerId]) list.push({ ...publicUser(map[doc.ownerId]), role: 'owner' })
  ;(doc.collaborators || []).forEach((c) => {
    if (map[c.userId]) list.push({ ...publicUser(map[c.userId]), role: c.role })
  })
  return list
}

async function handleRoute(request, { params }) {
  const resolvedParams = params ? await params : {}
  const path = resolvedParams?.path || []
  const route = `/${Array.isArray(path) ? path.join('/') : (path || '')}`
  const method = request.method

  try {
    const db = await getDb()

    if ((route === '/' || route === '/root') && method === 'GET') {
      return json({ message: 'Confluo API', status: 'ok' })
    }

    // ---------- AUTH ----------
    if (route === '/auth/register' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      const displayName = (body.displayName || '').trim() || email.split('@')[0]
      if (!email || !password) return err('Email and password are required', 400)
      if (password.length < 6) return err('Password must be at least 6 characters', 400)
      const existing = await db.collection('users').findOne({ email })
      if (existing) return err('An account with this email already exists', 409)
      const count = await db.collection('users').countDocuments({})
      const user = {
        id: uuidv4(),
        email,
        displayName,
        passwordHash: hashPassword(password),
        color: COLLAB_PALETTE[count % COLLAB_PALETTE.length],
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
      const token = uuidv4() + uuidv4()
      await db.collection('sessions').insertOne({ token, userId: user.id, createdAt: new Date().toISOString() })
      return json({ user: publicUser(user), token, accessToken: token }, 201)
    }

    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      if (!email || !password) {
        return err('Email and password are required', 400)
      }
      const user = await db.collection('users').findOne({ email })
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return err('Invalid email or password', 401)
      }
      const token = uuidv4() + uuidv4()
      await db.collection('sessions').insertOne({ token, userId: user.id, createdAt: new Date().toISOString() })
      return json({ user: publicUser(user), token, accessToken: token })
    }

    if (route === '/me' && method === 'GET') {
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      return json({ user: publicUser(user) })
    }

    // ---------- DOCS ----------
    if (route === '/docs' && method === 'GET') {
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const docs = await db.collection('docs').find({
        $or: [{ ownerId: user.id }, { 'collaborators.userId': user.id }],
      }).sort({ updatedAt: -1 }).toArray()
      const result = []
      for (const d of docs) {
        const collaborators = await enrichCollaborators(db, d)
        result.push({
          id: d.id,
          title: d.title,
          role: roleForUser(d, user.id),
          ownerId: d.ownerId,
          collaborators,
          updatedAt: d.updatedAt,
          createdAt: d.createdAt,
        })
      }
      return json({ docs: result })
    }

    if (route === '/docs' && method === 'POST') {
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const body = await request.json().catch(() => ({}))
      const now = new Date()
      const doc = {
        id: uuidv4(),
        title: (body.title || 'Untitled document').trim() || 'Untitled document',
        content: body.content || { type: 'doc', content: [{ type: 'paragraph' }] },
        ownerId: user.id,
        collaborators: [],
        shareLinks: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      await db.collection('docs').insertOne(doc)
      const { _id, ...cleanDoc } = doc
      return json({ doc: { ...cleanDoc, role: 'owner', collaborators: await enrichCollaborators(db, doc) } }, 201)
    }

    const docMatch = route.match(/^\/docs\/([^/]+)$/)
    if (docMatch) {
      const docId = docMatch[1]
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const doc = await db.collection('docs').findOne({ id: docId })
      if (!doc) return err('Document not found', 404)
      const role = roleForUser(doc, user.id)
      if (!role) return err('You do not have access to this document', 403)

      if (method === 'GET') {
        const collaborators = await enrichCollaborators(db, doc)
        const payload = {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          role,
          ownerId: doc.ownerId,
          collaborators,
          version: doc.version || 1,
          updatedAt: doc.updatedAt,
          createdAt: doc.createdAt,
        }
        if (role === 'owner') payload.shareLinks = doc.shareLinks || []
        return json({ doc: payload })
      }

      if (method === 'PUT' || method === 'PATCH') {
        const body = await request.json().catch(() => ({}))
        const update = { updatedAt: new Date() }
        // content: editors and owners only
        if (body.content !== undefined) {
          if (ROLE_RANK[role] < ROLE_RANK.editor) return err('You do not have permission to edit', 403)
          update.content = body.content
        }
        if (body.title !== undefined) {
          if (ROLE_RANK[role] < ROLE_RANK.editor) return err('You do not have permission to rename', 403)
          // optimistic-concurrency: If-Match version
          const ifMatch = request.headers.get('if-match')
          if (ifMatch && String(doc.version || 1) !== String(ifMatch)) {
            return json({ error: 'Renamed elsewhere', currentTitle: doc.title, version: doc.version || 1 }, 412)
          }
          update.title = (body.title || 'Untitled document').trim() || 'Untitled document'
          update.version = (doc.version || 1) + 1
        }
        await db.collection('docs').updateOne({ id: docId }, { $set: update })
        const updated = await db.collection('docs').findOne({ id: docId })
        return json({ doc: { id: updated.id, title: updated.title, version: updated.version, updatedAt: updated.updatedAt } })
      }

      if (method === 'DELETE') {
        if (role !== 'owner') return err('Only the owner can delete this document', 403)
        await db.collection('docs').deleteOne({ id: docId })
        await db.collection('comments').deleteMany({ docId })
        return json({ ok: true })
      }
    }

    // ---------- COMMENTS ----------
    const commentsMatch = route.match(/^\/docs\/([^/]+)\/comments$/)
    if (commentsMatch) {
      const docId = commentsMatch[1]
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const doc = await db.collection('docs').findOne({ id: docId })
      if (!doc) return err('Document not found', 404)
      const role = roleForUser(doc, user.id)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const comments = await db.collection('comments').find({ docId }).sort({ createdAt: 1 }).toArray()
        return json({ comments: comments.map(({ _id, ...c }) => c) })
      }
      if (method === 'POST') {
        if (ROLE_RANK[role] < ROLE_RANK.commenter) return err('You do not have permission to comment', 403)
        const body = await request.json().catch(() => ({}))
        if (!body.body || !body.body.trim()) return err('Comment cannot be empty', 400)
        const comment = {
          id: uuidv4(),
          docId,
          authorId: user.id,
          authorName: user.displayName,
          authorColor: user.color,
          body: body.body.trim(),
          anchorText: body.anchorText || '',
          blockId: body.blockId || null,
          parentId: body.parentId || null,
          resolved: false,
          createdAt: new Date(),
        }
        await db.collection('comments').insertOne(comment)
        const { _id, ...clean } = comment
        return json({ comment: clean }, 201)
      }
    }

    const commentMatch = route.match(/^\/comments\/([^/]+)(\/resolve)?$/)
    if (commentMatch) {
      const commentId = commentMatch[1]
      const isResolve = !!commentMatch[2]
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const comment = await db.collection('comments').findOne({ id: commentId })
      if (!comment) return err('Comment not found', 404)
      const doc = await db.collection('docs').findOne({ id: comment.docId })
      const role = roleForUser(doc, user.id)
      if (!role) return err('No access', 403)

      if (isResolve && method === 'POST') {
        if (ROLE_RANK[role] < ROLE_RANK.commenter) return err('No permission', 403)
        const body = await request.json().catch(() => ({}))
        await db.collection('comments').updateOne({ id: commentId }, { $set: { resolved: body.resolved !== false } })
        return json({ ok: true })
      }
      if (method === 'DELETE') {
        const canDelete = comment.authorId === user.id || role === 'owner'
        if (!canDelete) return err('You can only delete your own comments', 403)
        await db.collection('comments').deleteMany({ $or: [{ id: commentId }, { parentId: commentId }] })
        return json({ ok: true })
      }
    }

    // ---------- SHARE / COLLABORATORS ----------
    const shareMatch = route.match(/^\/docs\/([^/]+)\/share$/)
    if (shareMatch) {
      const docId = shareMatch[1]
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const doc = await db.collection('docs').findOne({ id: docId })
      if (!doc) return err('Document not found', 404)
      const role = roleForUser(doc, user.id)
      if (role !== 'owner') return err('Only the owner can manage sharing', 403)

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}))
        const email = (body.email || '').trim().toLowerCase()
        const newRole = body.role || 'editor'
        if (!['viewer', 'commenter', 'editor'].includes(newRole)) return err('Invalid role', 400)
        const target = await db.collection('users').findOne({ email })
        if (!target) return err('No Confluo user found with that email', 404)
        if (target.id === doc.ownerId) return err('That user is the owner', 400)
        const collaborators = (doc.collaborators || []).filter((c) => c.userId !== target.id)
        collaborators.push({ userId: target.id, role: newRole })
        await db.collection('docs').updateOne({ id: docId }, { $set: { collaborators, updatedAt: new Date() } })
        const updated = await db.collection('docs').findOne({ id: docId })
        return json({ collaborators: await enrichCollaborators(db, updated) }, 201)
      }
    }

    // change role / remove collaborator
    const collabMatch = route.match(/^\/docs\/([^/]+)\/collaborators\/([^/]+)$/)
    if (collabMatch) {
      const [, docId, targetId] = collabMatch
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const doc = await db.collection('docs').findOne({ id: docId })
      if (!doc) return err('Document not found', 404)
      if (roleForUser(doc, user.id) !== 'owner') return err('Only the owner can manage sharing', 403)
      if (targetId === doc.ownerId) return err('Owners cannot change their own role', 400)

      if (method === 'PUT' || method === 'PATCH') {
        const body = await request.json().catch(() => ({}))
        const newRole = body.role
        if (!['viewer', 'commenter', 'editor'].includes(newRole)) return err('Invalid role', 400)
        const collaborators = (doc.collaborators || []).map((c) => c.userId === targetId ? { ...c, role: newRole } : c)
        await db.collection('docs').updateOne({ id: docId }, { $set: { collaborators } })
        const updated = await db.collection('docs').findOne({ id: docId })
        return json({ collaborators: await enrichCollaborators(db, updated) })
      }
      if (method === 'DELETE') {
        const collaborators = (doc.collaborators || []).filter((c) => c.userId !== targetId)
        await db.collection('docs').updateOne({ id: docId }, { $set: { collaborators } })
        const updated = await db.collection('docs').findOne({ id: docId })
        return json({ collaborators: await enrichCollaborators(db, updated) })
      }
    }

    // create share link
    const linkMatch = route.match(/^\/docs\/([^/]+)\/share-link$/)
    if (linkMatch && method === 'POST') {
      const docId = linkMatch[1]
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const doc = await db.collection('docs').findOne({ id: docId })
      if (!doc) return err('Document not found', 404)
      if (roleForUser(doc, user.id) !== 'owner') return err('Only the owner can create links', 403)
      const body = await request.json().catch(() => ({}))
      const linkRole = body.role || 'editor'
      if (!['viewer', 'commenter', 'editor'].includes(linkRole)) return err('Invalid role', 400)
      const days = Number(body.expiryDays) || 7
      const link = {
        token: uuidv4().replace(/-/g, ''),
        role: linkRole,
        expiresAt: new Date(Date.now() + days * 86400000),
        createdAt: new Date(),
      }
      const shareLinks = [...(doc.shareLinks || []), link]
      await db.collection('docs').updateOne({ id: docId }, { $set: { shareLinks } })
      return json({ link }, 201)
    }

    // accept share link
    const acceptMatch = route.match(/^\/share\/([^/]+)\/accept$/)
    if (acceptMatch && method === 'POST') {
      const token = acceptMatch[1]
      const user = await getUser(request, db)
      if (!user) return err('Unauthenticated', 401)
      const doc = await db.collection('docs').findOne({ 'shareLinks.token': token })
      if (!doc) return err('This share link is invalid', 404)
      const link = (doc.shareLinks || []).find((l) => l.token === token)
      if (!link) return err('This share link is invalid', 404)
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) return err('This share link has expired', 410)
      if (doc.ownerId !== user.id) {
        const existing = (doc.collaborators || []).find((c) => c.userId === user.id)
        if (!existing) {
          const collaborators = [...(doc.collaborators || []), { userId: user.id, role: link.role }]
          await db.collection('docs').updateOne({ id: doc.id }, { $set: { collaborators } })
        }
      }
      return json({ docId: doc.id, role: doc.ownerId === user.id ? 'owner' : link.role })
    }

    // share link info (public preview)
    const linkInfoMatch = route.match(/^\/share\/([^/]+)$/)
    if (linkInfoMatch && method === 'GET') {
      const token = linkInfoMatch[1]
      const doc = await db.collection('docs').findOne({ 'shareLinks.token': token })
      if (!doc) return err('This share link is invalid', 404)
      const link = (doc.shareLinks || []).find((l) => l.token === token)
      const expired = link.expiresAt && new Date(link.expiresAt) < new Date()
      return json({ title: doc.title, role: link.role, expired })
    }

    return err(`Route ${route} not found`, 404)
  } catch (e) {
    console.error('API Error on route', route, method, e)
    return err(e?.message || 'Internal server error', 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
