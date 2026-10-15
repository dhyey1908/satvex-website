const { z } = require('zod');

// Field rules shared by checkout, saved addresses and phone verification.
// The point of being strict here: whatever passes is forwarded verbatim to
// Shiprocket for the shipping label and courier SMS, and a value they reject
// (an impossible mobile number, a name of digits, a made-up country) leaves a
// PAID order stuck in "Shipment Sync Issues" with nobody to deliver it.

// Indian mobile numbers start with 6, 7, 8 or 9.
const MOBILE_MESSAGE = 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9).';
const indianMobile = z.string().trim().regex(/^[6-9]\d{9}$/, MOBILE_MESSAGE);

// A number made of one repeated digit (9999999999, 8888888888…) is never a
// real subscriber and is rejected by Shiprocket ("Phone number is in invalid
// format"). Applied to delivery contacts, not to the login OTP number.
const deliveryMobile = indianMobile.refine((v) => !/^(\d)\1{9}$/.test(v), 'Please enter a real mobile number.');

const lettersIn = (s) => (s.match(/\p{L}/gu) || []).length;

const personName = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(100)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, "Name can only contain letters, spaces and . ' -")
  .refine((v) => lettersIn(v) >= 2, 'Please enter your full name.');

// City / state: letters, spaces and a little punctuation, never digits.
const placeName = (label) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters.`)
    .max(100)
    .regex(/^[\p{L}\p{M}][\p{L}\p{M} .,'&()-]*$/u, `${label} can only contain letters.`);

// A street line must carry at least three letters/digits ("..." is not an address).
const streetLine = z
  .string()
  .trim()
  .min(3, 'Address must be at least 3 characters.')
  .max(200)
  .refine((v) => (v.match(/[\p{L}\p{N}]/gu) || []).length >= 3, 'Please enter a complete address.');

// The store only delivers within India (see the Shipping & Delivery page).
const indiaOnly = z
  .string()
  .trim()
  .refine((v) => /^india$/i.test(v), 'We currently deliver only within India.');

module.exports = { indianMobile, deliveryMobile, personName, placeName, streetLine, indiaOnly, MOBILE_MESSAGE };
