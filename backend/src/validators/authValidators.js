const { z } = require('zod');

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(100),
    email: z.string().trim().email('Invalid email address').max(255).optional().or(z.literal('')),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
  })
  // Email is no longer mandatory, but the account needs at least one way to
  // be identified/logged into.
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: 'Provide an email address or a mobile number.',
    path: ['email'],
  });

// identifier is either an email address or a 10-digit phone number —
// authController.login tells them apart and looks up accordingly. Phone
// login only ever resolves against a VERIFIED phone (see userService.
// findByVerifiedPhone) — an unverified phone can never be used to log in.
const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or mobile number'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  uid: z.string().min(1, 'Invalid reset link'),
  token: z.string().min(10, 'Invalid reset token'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const forgotPasswordPhoneSchema = z.object({
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
});

const resetPasswordPhoneSchema = z.object({
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.'),
  code: z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code.'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit mobile number.')
    .optional()
    .or(z.literal('')),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  forgotPasswordPhoneSchema,
  resetPasswordPhoneSchema,
  updateProfileSchema,
  changePasswordSchema,
};
