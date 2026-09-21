const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000/api/v1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = 'GET', token, body, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${path} expected ${expected.join('/')} but got ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return { status: response.status, payload };
}

async function signup(email, fullName) {
  const { payload } = await request('/auth/signup', {
    method: 'POST',
    body: {
      email,
      password: 'Passw0rd!',
      full_name: fullName,
      country: 'SA',
    },
    expected: [201, 200],
  });

  assert(payload.token, `Signup token missing for ${email}`);
  assert(payload.user?.id, `Signup user missing for ${email}`);
  return { token: payload.token, user: payload.user };
}

async function run() {
  console.log('[SMOKE] health/readiness');
  await request('/health');
  await request('/ready');

  console.log('[SMOKE] signup/auth/profile');
  const trainer = await signup('trainer@example.com', 'Smoke Trainer');
  const student = await signup('student@example.com', 'Smoke Student');

  const trainerMe = await request('/auth/me', { token: trainer.token });
  assert(
    trainerMe.payload.user?.roles?.includes('trainer'),
    'Configured trainer did not receive trainer role in test bootstrap'
  );

  const studentMe = await request('/auth/me', { token: student.token });
  assert(studentMe.payload.user?.id === student.user.id, 'Student /auth/me mismatch');

  const updatedProfile = await request(`/profiles/${student.user.id}`, {
    method: 'PUT',
    token: student.token,
    body: {
      full_name: 'Smoke Student Updated',
      country: 'SA',
      bio: 'Integration smoke profile',
    },
  });
  assert(updatedProfile.payload.full_name === 'Smoke Student Updated', 'Profile update failed');

  const publicStudent = await request(`/profiles/${student.user.id}`, {
    expected: [404],
  });
  assert(publicStudent.status === 404, 'Private member profile should not be public');

  const publicTrainer = await request(`/profiles/${trainer.user.id}`);
  assert(publicTrainer.payload.id === trainer.user.id, 'Trainer public profile should be readable');
  assert(!Object.prototype.hasOwnProperty.call(publicTrainer.payload, 'email'), 'Public trainer profile leaked email');

  console.log('[SMOKE] trainer service + booking lifecycle');
  const serviceInsert = await request('/compat/query', {
    method: 'POST',
    token: trainer.token,
    body: {
      operation: 'insert',
      table: 'trainer_services',
      payload: {
        trainer_id: trainer.user.id,
        title: 'Smoke Private Session',
        description: 'Integration smoke service',
        service_type: 'private_session',
        duration_minutes: 60,
        price: 25,
        is_active: true,
      },
      single: true,
    },
  });

  const serviceId = serviceInsert.payload.data?.id;
  assert(serviceId, 'Trainer service creation failed');

  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const bookingCreate = await request('/service-bookings', {
    method: 'POST',
    token: student.token,
    body: {
      service_id: serviceId,
      scheduled_at: scheduledAt,
      notes: 'Smoke booking',
    },
    expected: [201],
  });

  const bookingId = bookingCreate.payload.id;
  assert(bookingId, 'Booking id missing');

  await request('/service-bookings', {
    method: 'POST',
    token: student.token,
    body: {
      service_id: serviceId,
      scheduled_at: scheduledAt,
      notes: 'Conflicting booking',
    },
    expected: [409],
  });

  const trainerBookings = await request('/service-bookings?scope=trainer', {
    token: trainer.token,
  });
  assert(
    Array.isArray(trainerBookings.payload.data) &&
      trainerBookings.payload.data.some((item) => item.id === bookingId),
    'Trainer booking list did not include created booking'
  );

  await request(`/service-bookings/${bookingId}/status`, {
    method: 'PATCH',
    token: trainer.token,
    body: { status: 'confirmed' },
  });

  await request(`/service-bookings/${bookingId}/status`, {
    method: 'PATCH',
    token: trainer.token,
    body: { status: 'completed' },
  });

  const review = await request(`/service-bookings/${bookingId}/review`, {
    method: 'POST',
    token: student.token,
    body: {
      rating: 5,
      review: 'Excellent smoke session',
    },
    expected: [201],
  });
  assert(review.payload.rating === 5, 'Review creation failed');

  const publicReviews = await request(
    `/service-bookings/reviews/public?service_id=${encodeURIComponent(serviceId)}&limit=10`
  );
  assert(
    Array.isArray(publicReviews.payload.data) &&
      publicReviews.payload.data.some((item) => item.booking_id === bookingId),
    'Public review list did not include submitted review'
  );

  console.log('[SMOKE] core integration flow passed');
}

run().catch((error) => {
  console.error('[SMOKE] failed:', error.message);
  process.exit(1);
});
