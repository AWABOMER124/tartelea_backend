const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const requestContext = require('../../src/middlewares/requestContext');

function createResponse() {
  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  return res;
}

test('requestContext preserves a safe incoming request id', () => {
  const req = {
    method: 'GET',
    originalUrl: '/api/v1/health',
    get(name) {
      return name.toLowerCase() === 'x-request-id' ? 'client-req-123' : undefined;
    },
  };
  const res = createResponse();
  let nextCalled = false;

  requestContext(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.id, 'client-req-123');
  assert.equal(res.headers['x-request-id'], 'client-req-123');

  res.emit('finish');
});

test('requestContext replaces unsafe request ids', () => {
  const req = {
    method: 'GET',
    originalUrl: '/api/v1/health',
    get() {
      return 'unsafe request id with spaces';
    },
  };
  const res = createResponse();

  requestContext(req, res, () => {});

  assert.match(req.id, /^[0-9a-f-]{36}$/);
  assert.equal(res.headers['x-request-id'], req.id);

  res.emit('finish');
});
