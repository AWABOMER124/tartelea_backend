const express = require('express');
const Profile = require('../models/Profile');
const { success, error } = require('../utils/response');
const { authenticateUser } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { updateProfileSchema } = require('../middlewares/validators/profile.validator');

const router = express.Router();

router.get('/:id', async (req, res) => {
  const profile = await Profile.findById(req.params.id);
  if (!profile) return error(res, 'Profile not found', 404);
  return success(res, profile);
});

router.put('/:id', authenticateUser, validate(updateProfileSchema), async (req, res) => {
  // Check if user is updating their own profile
  if (req.user.id !== req.params.id && !req.user.roles.includes('admin')) {
    return error(res, 'Access denied', 403);
  }
  
  const profile = await Profile.update(req.params.id, req.body);
  return success(res, profile);
});

module.exports = router;
