const success = (res, data, message = 'Success', status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    ...data,
  });
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
