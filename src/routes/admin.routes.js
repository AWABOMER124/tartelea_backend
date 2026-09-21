const express = require('express');
const { authenticateUser } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const AdminController = require('../controllers/admin.controller');
const {
  attachNormalizedRoles,
  requireAdminAccess,
  requireAdmin,
} = require('../middlewares/rbac.middleware');
const {
  listAdminSubscriptionsSchema,
  grantSubscriptionSchema,
  revokeSubscriptionSchema,
} = require('../middlewares/validators/subscription.validator');

const {
  idParamSchema,
  userRoleSchema,
  userRolesSchema,
  userStatusSchema,
  approvalSchema,
  resolveReportSchema,
  assignSessionHostSchema,
  endSessionSchema,
  broadcastNotificationSchema,
} = require('../middlewares/validators/admin.validator');

const router = express.Router();

// Base protection for admin routes (Admin or Moderator)
router.use(authenticateUser, attachNormalizedRoles, requireAdminAccess);

// --- Stats & Dashboard ---
router.get('/stats', AdminController.getStats);
router.get('/audit', requireAdmin, AdminController.listAuditLogs);

// --- User Operations ---
router.get('/users', AdminController.listUsers);
router.get('/users/:id', validate(idParamSchema), AdminController.getUser);
router.get('/users/:id/entitlements', validate(idParamSchema), AdminController.getUserEntitlements);
router.patch('/users/:id/role', requireAdmin, validate(userRoleSchema), AdminController.updateUserRole);
router.put('/users/:id/roles', requireAdmin, validate(userRolesSchema), AdminController.updateUserRoles);
router.patch('/users/:id/status', requireAdmin, validate(userStatusSchema), AdminController.updateUserStatus);
router.post('/users/:id/approve-trainer', requireAdmin, validate(idParamSchema), AdminController.approveTrainer);

// --- Subscription Operations ---
router.get('/subscriptions', validate(listAdminSubscriptionsSchema), AdminController.listSubscriptions);
router.post('/subscriptions/grant', requireAdmin, validate(grantSubscriptionSchema), AdminController.grantSubscription);
router.post('/subscriptions/revoke', requireAdmin, validate(revokeSubscriptionSchema), AdminController.revokeSubscription);

// --- Community Moderation ---
router.get('/community/reports', AdminController.listReports);
router.post('/community/reports/:id/resolve', validate(resolveReportSchema), AdminController.resolveReport);
router.get('/posts', AdminController.listPosts);
router.delete('/posts/:id', requireAdmin, validate(idParamSchema), AdminController.deletePost);
router.post('/community/posts/:id/hide', AdminController.hidePost);
router.post('/community/posts/:id/unhide', validate(idParamSchema), AdminController.unhidePost);
router.post('/community/posts/:id/pin', AdminController.pinPost);
router.post('/community/posts/:id/unpin', AdminController.unpinPost);

// --- Library Content Management ---
router.get('/contents', AdminController.listContents);
router.post('/contents', requireAdmin, AdminController.createContent);
router.put('/contents/:id', requireAdmin, AdminController.updateContent);
router.delete('/contents/:id', requireAdmin, validate(idParamSchema), AdminController.deleteContent);

// --- Sessions & Rooms Controls ---
router.get('/sessions', AdminController.listSessions);
router.post('/sessions/:id/assign-host', validate(assignSessionHostSchema), AdminController.assignSessionHost);
router.post('/sessions/:id/end', validate(endSessionSchema), AdminController.endSession);

// --- Approvals (Workshops, Courses, Rooms) ---
router.get('/courses', AdminController.listCourses);
router.patch('/courses/:id/approval', requireAdmin, validate(approvalSchema), AdminController.updateCourseApproval);
router.get('/workshops', AdminController.listWorkshops);
router.patch('/workshops/:id/approval', requireAdmin, validate(approvalSchema), AdminController.updateWorkshopApproval);
router.get('/rooms', AdminController.listRooms);
router.patch('/rooms/:id/approval', requireAdmin, validate(approvalSchema), AdminController.updateRoomApproval);

// --- Pinned Content ---
router.get('/pinned', AdminController.listPinned);
router.post('/pinned', requireAdmin, AdminController.createPinned);
router.patch('/pinned/:id', requireAdmin, AdminController.updatePinned);
router.delete('/pinned/:id', requireAdmin, validate(idParamSchema), AdminController.deletePinned);

// --- Communications ---
router.get('/notifications', AdminController.listNotifications);
router.post('/notifications/broadcast', requireAdmin, validate(broadcastNotificationSchema), AdminController.broadcastNotification);

module.exports = router;
