const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser } = require('../middlewares/auth');
const { success } = require('../utils/response');
const BookingService = require('../services/booking.service');
const {
  listBookingsSchema,
  createBookingSchema,
  updateBookingStatusSchema,
  createReviewSchema,
  listReviewsSchema,
} = require('../middlewares/validators/booking.validator');

const router = express.Router();

router.get('/', authenticateUser, validate(listBookingsSchema), async (req, res, next) => {
  try {
    const data = await BookingService.listBookings({
      reqUser: req.user,
      scope: req.query.scope,
    });
    return success(res, data);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateUser, validate(createBookingSchema), async (req, res, next) => {
  try {
    const data = await BookingService.createBooking({
      reqUser: req.user,
      payload: req.body,
    });
    return success(res, data, 'Booking created successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', authenticateUser, validate(updateBookingStatusSchema), async (req, res, next) => {
  try {
    const data = await BookingService.updateStatus({
      reqUser: req.user,
      bookingId: req.params.id,
      status: req.body.status,
    });
    return success(res, data, 'Booking status updated');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/review', authenticateUser, validate(createReviewSchema), async (req, res, next) => {
  try {
    const data = await BookingService.createReview({
      reqUser: req.user,
      bookingId: req.params.id,
      payload: req.body,
    });
    return success(res, data, 'Review created successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.get('/reviews/public', validate(listReviewsSchema), async (req, res, next) => {
  try {
    const data = await BookingService.listReviews({
      trainerId: req.query.trainer_id,
      serviceId: req.query.service_id,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    return success(res, data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
