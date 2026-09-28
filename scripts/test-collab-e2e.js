#!/usr/bin/env node
/**
 * End-to-end test for CRDT collaboration and share invite flow.
 *
 * Tests:
 * 1. Register two accounts (Alice & Bob)
 * 2. Alice creates a document
 * 3. Alice shares it with Bob as editor
 * 4. Bob can see the document in their list
 * 5. Bob can load the document
 * 6. Inviting a non-existent email returns the correct error
 * 7. Duplicate invite doesn't error out
 * 8. Owner cannot be added as collaborator
 *
 * Usage:
 *   node scripts/test-collab-e2e.js [baseUrl]
 *   Default baseUrl: http://localhost:3000
 */

const BASE = process.argv[2] || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function apiFetch(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  const ts = Date.now();
  const aliceEmail = `alice_collab_${ts}@example.com`;
  const bobEmail = `bob_collab_${ts}@example.com`;
  const password = 'TestPass123!';

  console.log('\n🧪 CRDT Collaboration E2E Test');
  console.log(`   Base URL: ${BASE}`);
  console.log(`   Alice: ${aliceEmail}`);
  console.log(`   Bob:   ${bobEmail}\n`);

  // ── 1. Register Alice ──────────────────────────────
  console.log('1. Register accounts');
  const aliceReg = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: aliceEmail, password, displayName: 'Alice Test' }),
  });
  assert(aliceReg.ok, `Alice registered (status ${aliceReg.status})`);
  const aliceToken = aliceReg.data?.token;
  const aliceId = aliceReg.data?.user?.id;
  assert(!!aliceToken, 'Alice has a session token');

  // ── 2. Register Bob ────────────────────────────────
  const bobReg = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: bobEmail, password, displayName: 'Bob Test' }),
  });
  assert(bobReg.ok, `Bob registered (status ${bobReg.status})`);
  const bobToken = bobReg.data?.token;
  const bobId = bobReg.data?.user?.id;
  assert(!!bobToken, 'Bob has a session token');

  // ── 3. Alice creates a document ────────────────────
  console.log('\n2. Alice creates a document');
  const createRes = await apiFetch('/docs', {
    method: 'POST',
    body: JSON.stringify({ title: `Collab Test ${ts}` }),
  }, aliceToken);
  assert(createRes.ok, `Document created (status ${createRes.status})`);
  const docId = createRes.data?.doc?.id;
  assert(!!docId, `Document ID: ${docId}`);
  assert(createRes.data?.doc?.role === 'owner', 'Alice is the owner');

  // ── 4. Alice shares with Bob as editor ─────────────
  console.log('\n3. Alice shares with Bob');
  const shareRes = await apiFetch(`/docs/${docId}/share`, {
    method: 'POST',
    body: JSON.stringify({ email: bobEmail, role: 'editor' }),
  }, aliceToken);
  assert(shareRes.ok, `Share succeeded (status ${shareRes.status})`);
  const collabs = shareRes.data?.collaborators || [];
  const bobCollab = collabs.find((c) => c.email === bobEmail);
  assert(!!bobCollab, 'Bob is in collaborators list');
  assert(bobCollab?.role === 'editor', 'Bob has editor role');

  // ── 5. Non-existent email invite ───────────────────
  console.log('\n4. Non-existent email invite');
  const noUserRes = await apiFetch(`/docs/${docId}/share`, {
    method: 'POST',
    body: JSON.stringify({ email: `nonexistent_${ts}@example.com`, role: 'viewer' }),
  }, aliceToken);
  assert(noUserRes.status === 404, `Returns 404 (status ${noUserRes.status})`);
  assert(
    (noUserRes.data?.error || '').includes('must create an account'),
    `Error message: "${noUserRes.data?.error}"`
  );

  // ── 6. Owner cannot be added ───────────────────────
  console.log('\n5. Owner cannot be added as collaborator');
  const ownerRes = await apiFetch(`/docs/${docId}/share`, {
    method: 'POST',
    body: JSON.stringify({ email: aliceEmail, role: 'editor' }),
  }, aliceToken);
  assert(!ownerRes.ok, `Rejected (status ${ownerRes.status})`);
  assert((ownerRes.data?.error || '').includes('owner'), `Error: "${ownerRes.data?.error}"`);

  // ── 7. Duplicate invite (should succeed/update) ────
  console.log('\n6. Duplicate invite updates role');
  const dupRes = await apiFetch(`/docs/${docId}/share`, {
    method: 'POST',
    body: JSON.stringify({ email: bobEmail, role: 'viewer' }),
  }, aliceToken);
  assert(dupRes.ok, `Re-invite succeeded (status ${dupRes.status})`);
  const updatedBob = (dupRes.data?.collaborators || []).find((c) => c.email === bobEmail);
  assert(updatedBob?.role === 'viewer', `Bob role updated to viewer`);

  // ── 8. Bob sees the document in their list ─────────
  console.log('\n7. Bob sees the shared document');
  const bobDocs = await apiFetch('/docs', {}, bobToken);
  assert(bobDocs.ok, `Bob doc list loaded (status ${bobDocs.status})`);
  const bobDoc = (bobDocs.data?.docs || []).find((d) => d.id === docId);
  assert(!!bobDoc, 'Shared doc appears in Bob\'s list');
  assert(bobDoc?.role === 'viewer', `Bob's role is viewer (was updated)`);

  // ── 9. Bob can load the document ───────────────────
  console.log('\n8. Bob can load the document');
  const bobLoad = await apiFetch(`/docs/${docId}`, {}, bobToken);
  assert(bobLoad.ok, `Bob loaded doc (status ${bobLoad.status})`);
  assert(bobLoad.data?.doc?.id === docId, 'Document ID matches');

  // ── 10. Update Bob back to editor for CRDT test ────
  console.log('\n9. Alice restores Bob to editor');
  const restoreRes = await apiFetch(`/docs/${docId}/collaborators/${bobId}`, {
    method: 'PUT',
    body: JSON.stringify({ role: 'editor' }),
  }, aliceToken);
  assert(restoreRes.ok, `Role restored (status ${restoreRes.status})`);

  // ── 11. Both can save CRDT state ───────────────────
  console.log('\n10. Both users can save CRDT state');
  const aliceSave = await apiFetch(`/docs/${docId}`, {
    method: 'PUT',
    body: JSON.stringify({
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice was here' }] }] },
    }),
  }, aliceToken);
  assert(aliceSave.ok, `Alice saved content (status ${aliceSave.status})`);

  const bobSave = await apiFetch(`/docs/${docId}`, {
    method: 'PUT',
    body: JSON.stringify({
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bob was here too' }] }] },
    }),
  }, bobToken);
  assert(bobSave.ok, `Bob saved content (status ${bobSave.status})`);

  // ── 12. Verify final state ─────────────────────────
  console.log('\n11. Verify final document state');
  const finalDoc = await apiFetch(`/docs/${docId}`, {}, aliceToken);
  assert(finalDoc.ok, `Final doc loaded (status ${finalDoc.status})`);
  assert(!!finalDoc.data?.doc?.content, 'Document has content');
  assert(!!finalDoc.data?.doc?.updatedAt, 'Document has updatedAt');

  // ── Summary ────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!\n');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
