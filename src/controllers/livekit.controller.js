const livekitService = require('../services/livekit.service');

/**
 * Handle LiveKit token generation request
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getToken = async (req, res) => {
    const { roomName, role = 'listener' } = req.body;
    const userId = req.user?.id;

    if (!roomName || !userId) {
        return res.status(400).json({ error: 'roomName and authenticated user are required' });
    }

    try {
        const canPublish = ['speaker', 'moderator', 'host'].includes(role);
        const token = await livekitService.generateToken({
            roomName,
            identity: userId,
            canPublish,
            canSubscribe: true,
            metadata: { role },
        });
        res.json({ token });
    } catch (error) {
        console.error('Error generating LiveKit token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
};

module.exports = {
    getToken,
};
