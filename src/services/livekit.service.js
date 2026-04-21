const { AccessToken } = require('livekit-server-sdk');
const env = require('../config/env');
const { httpError } = require('../utils/httpError');

/**
 * Generate an access token for a LiveKit room
 * @param {string} roomName - The name of the room to join
 * @param {string} participantName - The name of the participant
 * @returns {string} The generated access token
 */
const generateToken = async ({
    roomName,
    identity,
    canPublish = false,
    canSubscribe = true,
    canPublishData = false,
    metadata = {},
}) => {
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
        throw httpError(
            503,
            'LiveKit token service is not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
            'LIVEKIT_NOT_CONFIGURED'
        );
    }

    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: String(identity),
        metadata: JSON.stringify(metadata),
    });
    
    at.addGrant({ 
        roomJoin: true, 
        room: roomName,
        canPublish,
        canSubscribe,
        canPublishData,
    });

    return await at.toJwt();
};

module.exports = {
    generateToken,
};
