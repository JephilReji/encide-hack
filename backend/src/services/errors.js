class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function errorBody(code, message) {
  return { error: { code, message } };
}

module.exports = { ApiError, errorBody };
