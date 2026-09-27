const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'resetToken', 'authorization']);

function redact(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = Array.isArray(payload) ? [] : {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) {
      clone[key] = '[redacted]';
    } else if (value && typeof value === 'object') {
      clone[key] = redact(value);
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

function log(level, message, meta) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
