const success = (res, data = null, message = 'Success', status = 200) => {
  let resolvedMessage = message;
  let resolvedStatus = status;

  // Backward compatibility: success(res, data, 201)
  if (typeof message === 'number') {
    resolvedStatus = message;
    resolvedMessage = 'Success';
  }

  const payload = {
    success: true,
    message: resolvedMessage,
  };

  if (data === null || data === undefined) {
    payload.data = null;
  } else if (Array.isArray(data)) {
    payload.data = data;
  } else if (typeof data === 'object') {
    Object.assign(payload, data);
  } else {
    payload.data = data;
  }

  return res.status(resolvedStatus).json(payload);
};

const error = (res, message, status = 500, code = 'INTERNAL_ERROR') => {
  return res.status(status).json({
    success: false,
    message,
    error: {
      message,
      code,
    },
  });
};

module.exports = {
  success,
  error,
};
