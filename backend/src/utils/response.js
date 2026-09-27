function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function created(res, data) {
  return ok(res, data, 201);
}

module.exports = { ok, created };
