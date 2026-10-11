const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Behind API Gateway, the real request is HTTPS but arrives at this Lambda
// over plain HTTP with X-Forwarded-Proto set — trust it so req.protocol
// (used to build PayU's surl/furl) reports https, not http.
app.set('trust proxy', true);

const allowedOrigins = env.frontendOrigin.split(',').map((origin) => origin.trim());

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
// PayU's surl/furl callback POSTs as a standard HTML form submission
// (application/x-www-form-urlencoded), not JSON — this is what parses
// req.body for that route. PayU's hash verification runs over individual
// posted fields, not raw request bytes, so (unlike Cashfree's HMAC-over-
// raw-body) no special raw-body capture is needed here.
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
