const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../src/db');
const AdminController = require('../../src/controllers/admin.controller');

const originalQuery = db.query;
const originalConnect = db.connect;

const createRes = () => {
  const state = { statusCode: 200, body: null };
  return {
    state,
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(payload) {
      state.body = payload;
      return state;
    },
  };
};

test.afterEach(() => {
  db.query = originalQuery;
  db.connect = originalConnect;
});

test('listUsers resolves primary role with moderator priority', async () => {
  db.query = async () => ({
    rows: [
      {
        id: 'user-1',
        email: 'moderator@example.com',
        is_verified: true,
        created_at: '2026-04-12T00:00:00.000Z',
        full_name: 'Moderator User',
        avatar_url: null,
        country: 'SA',
        roles: ['trainer', 'moderator'],
      },
    ],
  });

  const req = { query: {} };
  const res = createRes();

  await AdminController.listUsers(req, res, (err) => {
    throw err;
  });

  assert.equal(res.state.statusCode, 200);
  assert.equal(res.state.body.users.length, 1);
  assert.equal(res.state.body.users[0].role, 'moderator');
  assert.deepEqual(res.state.body.users[0].roles, ['trainer', 'moderator']);
});

test('broadcastNotification maps member audience to member recipients and records audit log', async () => {
  let callCount = 0;

  db.query = async (_sql, params) => {
    callCount += 1;

    if (callCount === 1) {
      return {
        rows: [
          { id: 'student-1', roles: [] },
          { id: 'trainer-1', roles: ['trainer'] },
          { id: 'student-2', roles: ['student'] },
        ],
      };
    }

    if (callCount === 2) {
      assert.deepEqual(params[0], ['student-1', 'student-2']);
      assert.match(params[1], /^[0-9a-f-]{36}$/);
      assert.equal(params[2], 'system');
      assert.equal(params[3], 'إشعار');
      assert.equal(params[4], 'رسالة عامة');
      assert.equal(params[5], 'admin-1');
      return { rowCount: 2 };
    }

    assert.equal(params[0], 'admin-1');
    assert.equal(params[1], 'admin');
    assert.equal(params[2], 'notification.broadcast');
    assert.equal(params[3], 'notification');
    assert.equal(params[4], null);
    return { rowCount: 1 };
  };

  const req = {
    body: {
      title: 'إشعار',
      message: 'رسالة عامة',
      target_role: 'member',
    },
    user: {
      id: 'admin-1',
      role: 'admin',
      roles: ['admin'],
    },
    ip: '127.0.0.1',
    headers: {},
  };
  const res = createRes();

  await AdminController.broadcastNotification(req, res, (err) => {
    throw err;
  });

  assert.equal(res.state.statusCode, 201);
  assert.equal(res.state.body.delivered, 2);
  assert.equal(res.state.body.audience, 'member');
  assert.match(res.state.body.batch_id, /^[0-9a-f-]{36}$/);
});

test('updatePinned updates pinned fields and records audit log', async () => {
  let callCount = 0;

  db.query = async (sql, params) => {
    callCount += 1;

    if (callCount === 1) {
      assert.match(sql, /SELECT \* FROM pinned_content/i);
      assert.deepEqual(params, ['pin-1']);
      return {
        rowCount: 1,
        rows: [
          {
            id: 'pin-1',
            entity_type: 'content',
            entity_id: 'content-1',
            title: 'عنوان قديم',
            subtitle: 'وصف قديم',
            thumbnail_url: null,
            sort_order: 1,
          },
        ],
      };
    }

    if (callCount === 2) {
      assert.match(sql, /UPDATE pinned_content SET/i);
      assert.equal(params[0], 'workshop');
      assert.equal(params[1], 'workshop-3');
      assert.equal(params[2], 'عنوان جديد');
      assert.equal(params[3], 'وصف جديد');
      assert.equal(params[4], 'https://example.com/thumb.png');
      assert.equal(params[5], 4);
      assert.equal(params[6], 'pin-1');
      return {
        rowCount: 1,
        rows: [
          {
            id: 'pin-1',
            entity_type: 'workshop',
            entity_id: 'workshop-3',
            title: 'عنوان جديد',
            subtitle: 'وصف جديد',
            thumbnail_url: 'https://example.com/thumb.png',
            sort_order: 4,
          },
        ],
      };
    }

    assert.equal(params[0], 'admin-1');
    assert.equal(params[1], 'moderator');
    assert.equal(params[2], 'pinned.updated');
    assert.equal(params[3], 'pinned');
    assert.equal(params[4], 'pin-1');
    return { rowCount: 1 };
  };

  const req = {
    params: { id: 'pin-1' },
    body: {
      entity_type: 'workshop',
      entity_id: 'workshop-3',
      title: 'عنوان جديد',
      subtitle: 'وصف جديد',
      thumbnail_url: 'https://example.com/thumb.png',
      sort_order: 4,
    },
    user: {
      id: 'admin-1',
      role: 'moderator',
      roles: ['moderator'],
    },
    ip: '127.0.0.1',
    headers: {},
  };
  const res = createRes();

  await AdminController.updatePinned(req, res, (err) => {
    throw err;
  });

  assert.equal(res.state.statusCode, 200);
  assert.equal(res.state.body.pinned.id, 'pin-1');
  assert.equal(res.state.body.pinned.entity_type, 'workshop');
  assert.equal(res.state.body.pinned.sort_order, 4);
});
