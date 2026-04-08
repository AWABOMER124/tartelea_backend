const test = require('node:test');
const assert = require('node:assert/strict');

const livekitServicePath = require.resolve('../../src/services/livekit.service');
const livekitServiceMock = {
  generateToken: async () => 'mock-token',
};

require.cache[livekitServicePath] = {
  id: livekitServicePath,
  filename: livekitServicePath,
  loaded: true,
  exports: livekitServiceMock,
};

const AudioRoomController = require('../../src/controllers/audioRoom.controller');
const AudioRoom = require('../../src/models/AudioRoom');

const originalAudioRoom = {
  findById: AudioRoom.findById,
  getParticipantRole: AudioRoom.getParticipantRole,
  isHost: AudioRoom.isHost,
};

const originalGenerateToken = livekitServiceMock.generateToken;

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

const restoreMocks = () => {
  AudioRoom.findById = originalAudioRoom.findById;
  AudioRoom.getParticipantRole = originalAudioRoom.getParticipantRole;
  AudioRoom.isHost = originalAudioRoom.isHost;
  livekitServiceMock.generateToken = originalGenerateToken;
};

test.afterEach(() => {
  restoreMocks();
});

test('roomToken grants host permissions when requester is room creator', async () => {
  AudioRoom.findById = async () => ({ id: 'room-1', created_by: 'user-1' });
  AudioRoom.getParticipantRole = async () => null;
  AudioRoom.isHost = async () => true;
  livekitServiceMock.generateToken = async ({ canPublish, metadata }) => {
    assert.equal(canPublish, true);
    assert.equal(metadata.role, 'host');
    return 'host-token';
  };

  const req = {
    params: { id: 'room-1' },
    user: { id: 'user-1' },
  };
  const res = createRes();

  await AudioRoomController.roomToken(req, res, (err) => {
    throw err;
  });

  assert.equal(res.state.body.role, 'host');
  assert.equal(res.state.body.token, 'host-token');
});

test('roomToken falls back to listener when user has no elevated role', async () => {
  AudioRoom.findById = async () => ({ id: 'room-2', created_by: 'host-1' });
  AudioRoom.getParticipantRole = async () => null;
  AudioRoom.isHost = async () => false;
  livekitServiceMock.generateToken = async ({ canPublish, metadata }) => {
    assert.equal(canPublish, false);
    assert.equal(metadata.role, 'listener');
    return 'listener-token';
  };

  const req = {
    params: { id: 'room-2' },
    user: { id: 'user-9' },
  };
  const res = createRes();

  await AudioRoomController.roomToken(req, res, (err) => {
    throw err;
  });

  assert.equal(res.state.body.role, 'listener');
  assert.equal(res.state.body.token, 'listener-token');
});
