class HttpError extends Error {
  constructor(status, message, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const httpError = (status, message, code) => new HttpError(status, message, code);

module.exports = {
  HttpError,
  httpError,
};
