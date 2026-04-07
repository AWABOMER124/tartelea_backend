const livekitService = require('../services/livekit.service');

/**
 * Handle LiveKit token generation request
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getToken = async (req, res) => {
    const { roomName, participantName } = req.body;
    
    if (!roomName || !participantName) {
        return res.status(400).json({ error: 'roomName and participantName are required' });
    }

    try {
        const token = await livekitService.generateToken(roomName, participantName);
        res.json({ token });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
};

module.exports = {
    getToken,
};
