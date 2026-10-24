const { ApiError, errorBody } = require('../services/errors');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json(errorBody(err.code, err.message));
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res
      .status(400)
      .json(errorBody('INVALID_JSON', 'Request body must be valid JSON'));
  }

  console.error('[api]', err);
  return res
    .status(500)
    .json(errorBody('INTERNAL_ERROR', 'An unexpected server error occurred'));
}

module.exports = { errorHandler };
