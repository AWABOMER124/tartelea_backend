const { AccessToken } = require('livekit-server-sdk');
const env = require('../config/env');

/**
 * Generate an access token for a LiveKit room
 * @param {string} roomName - The name of the room to join
 * @param {string} participantName - The name of the participant
 * @returns {string} The generated access token
 */
const generateToken = async ({ roomName, identity, canPublish = false, canSubscribe = true, metadata = {} }) => {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: String(identity),
        metadata: JSON.stringify(metadata),
    });
    
    at.addGrant({ 
        roomJoin: true, 
        room: roomName,
        canPublish,
        canSubscribe,
    });

    return await at.toJwt();
};

module.exports = {
    generateToken,
};
