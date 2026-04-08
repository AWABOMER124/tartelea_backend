const test = require('node:test');
const assert = require('node:assert/strict');
const { success } = require('../../src/utils/response');

const mockRes = () => {
  const state = { statusCode: null, body: null };
  return {
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

test('success handles array payloads under data key', () => {
  const res = mockRes();
  const result = success(res, [{ id: 1 }], 'ok', 200);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, [{ id: 1 }]);
});

test('success keeps backward compatibility when 3rd arg is status code', () => {
  const res = mockRes();
  const result = success(res, { post: { id: 1 } }, 201);
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.success, true);
  assert.deepEqual(result.body.post, { id: 1 });
});

