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
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
