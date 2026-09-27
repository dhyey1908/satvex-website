const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email: z.string().trim().email('Invalid email address').max(255),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,15}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
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

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,15}$/, 'Invalid phone number')
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
  updateProfileSchema,
  changePasswordSchema,
};
