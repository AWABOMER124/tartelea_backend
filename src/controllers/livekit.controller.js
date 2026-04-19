const SessionService = require('../services/session.service');
const { success } = require('../utils/response');

/**
 * Transitional compatibility endpoint.
 * Official clients must use `/sessions/:id/join`; this endpoint now delegates to
 * the backend-owned session join flow instead of trusting client-supplied roles.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getToken = async (req, res, next) => {
    const { roomName } = req.body;
    const userId = req.user?.id;

    if (!roomName || !userId) {
        return res.status(400).json({ error: 'roomName and authenticated user are required' });
    }

    try {
        const payload = await SessionService.joinSession({
            reqUser: req.user,
            sessionId: roomName,
        });
        return success(res, payload, 'LiveKit join token resolved through session contract');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getToken,
};
