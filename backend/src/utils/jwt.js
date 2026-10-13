const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.accessTokenExpiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret);
}

module.exports = { signAccessToken, verifyAccessToken };
