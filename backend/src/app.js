const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

const allowedOrigins = env.frontendOrigin.split(',').map((origin) => origin.trim());

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
// The Cashfree webhook needs the exact raw bytes of the request body to
// verify its HMAC signature — re-serializing the parsed JSON can produce
// different bytes (key order/whitespace) and silently break verification.
// Scoped to that one route only (via the `verify` callback checking the
// path) rather than capturing/retaining a raw buffer for every request.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      if (req.originalUrl === '/api/payments/cashfree/webhook') {
        req.rawBody = buf.toString('utf8');
      }
    },
  })
);
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
