// Turns an error from the OTP endpoints into what the UI needs. The backend
// already words its messages for customers (see otpService.js), so this only
// adds the cases the browser itself produces and pulls out the structured
// details used for timers.
//
// kind:
//   'retry'   - wrong code, can try again (attemptsRemaining set)
//   'dead'    - this code can't be used any more (locked / expired / unknown):
//               the customer needs a new one
//   'wait'    - too soon to send another (retryAfterSeconds set)
//   'limit'   - used all codes for this window (retryAfterSeconds set)
//   'service' - our provider / network problem, nothing the customer did
//   'other'
export function describeOtpError(err) {
  const code = err?.code;
  const details = err?.details || {};

  // fetch() itself failed: offline, DNS, CORS, or the API is unreachable.
  if (!err?.status) {
    return {
      kind: 'service',
      code: 'NETWORK',
      message: "We couldn't connect. Please check your internet connection and try again.",
    };
  }

  const base = { code, message: err.message, details };
  switch (code) {
    case 'OTP_INCORRECT':
      return { ...base, kind: 'retry', attemptsRemaining: details.attemptsRemaining ?? null };
    case 'OTP_TOO_MANY_ATTEMPTS':
    case 'OTP_EXPIRED':
    case 'OTP_NOT_FOUND':
      return { ...base, kind: 'dead' };
    case 'OTP_COOLDOWN':
      return { ...base, kind: 'wait', retryAfterSeconds: details.retryAfterSeconds ?? 60, canUseLatestCode: Boolean(details.canUseLatestCode) };
    case 'OTP_SEND_LIMIT':
      return { ...base, kind: 'limit', retryAfterSeconds: details.retryAfterSeconds ?? 600, canUseLatestCode: Boolean(details.canUseLatestCode) };
    case 'OTP_PROVIDER_UNAVAILABLE':
    case 'OTP_DELIVERY_FAILED':
      return { ...base, kind: 'service' };
    case 'RATE_LIMITED':
      return { ...base, kind: 'limit', retryAfterSeconds: details.retryAfterSeconds ?? 600, canUseLatestCode: false };
    default:
      return { ...base, kind: 'other' };
  }
}
