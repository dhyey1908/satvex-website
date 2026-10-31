const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  addressTextProblem,
  isJunkText,
  isEnglishAddressText,
  isEnglishName,
  cityMatchesPlaces,
  combinedAddress,
  MAX_ADDRESS,
  ENGLISH_MESSAGE,
  JUNK_MESSAGE,
  TOO_LONG_MESSAGE,
} = require('./addressRules');
const { checkoutSchema, adminAddressSchema } = require('../validators/orderValidators');

const good = { line1: '12 Test Heights, Kalawad Road', landmark: 'Near City Mall' };

test('a normal address with a landmark passes', () => {
  assert.equal(addressTextProblem(good), null);
  assert.equal(addressTextProblem({ line1: 'Flat 4B/12, Shanti-Nagar (East) #3 & Sons', landmark: "Opp. St. Mary's School" }), null);
});

test('house/street + landmark together over 190 characters is refused, with the agreed message', () => {
  const line1 = 'Plot 5 Road, '.repeat(20); // long, English, not junk
  const problem = addressTextProblem({ line1, landmark: 'Near the big temple' });
  assert.equal(combinedAddress(line1, 'Near the big temple').length > MAX_ADDRESS, true);
  assert.equal(problem.code, 'ADDRESS_TOO_LONG');
  assert.equal(problem.message, 'Address is too long. Please keep it under 190 characters.');
  assert.equal(problem.message, TOO_LONG_MESSAGE);
});

test('exactly 190 characters together is still fine', () => {
  const landmark = 'Near City Mall';
  const line1 = `${'Road No 12 '.repeat(20)}`.slice(0, MAX_ADDRESS - landmark.length - 2).trim();
  const text = combinedAddress(line1, landmark);
  assert.ok(text.length <= MAX_ADDRESS && text.length > MAX_ADDRESS - 12);
  assert.equal(addressTextProblem({ line1, landmark }), null);
});

test('Hindi (or any non-English) text is refused in the address, the landmark, and the name', () => {
  assert.equal(addressTextProblem({ line1: 'मकान नंबर 12 गांधी रोड', landmark: 'Near City Mall' }).message, ENGLISH_MESSAGE);
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: 'सिटी मॉल के पास' }).message, ENGLISH_MESSAGE);
  assert.equal(addressTextProblem({ line1: '12 Test Heights 😀', landmark: 'Near City Mall' }).code, 'NOT_ENGLISH');
  assert.equal(isEnglishName('राहुल शर्मा'), false);
  assert.equal(isEnglishName("Rahul O'Neil-Sharma Jr."), true);
  assert.equal(isEnglishName('Rahul2'), false); // a name takes letters, space . ' - only
  assert.equal(isEnglishAddressText('12/A, Main St. (East) #4 & Co'), true);
  assert.equal(isEnglishAddressText('12 Main St; DROP TABLE'), false); // ; is not an allowed character
});

test('"test", "aaaa" and the other junk texts are refused', () => {
  for (const junk of ['test', 'Testing', 'asdf', 'qwerty', 'xyz', 'abc', 'na', 'N/A', 'none', 'null', 'dummy', 'sample', 'hello', 'hii', 'test test', '12345', '#### ---', 'aaaa', 'Flat 1000000 Road', 'hellooooo road']) {
    assert.equal(isJunkText(junk), true, `${junk} should be junk`);
  }
  assert.deepEqual(addressTextProblem({ line1: 'test', landmark: 'Near City Mall' }), { field: 'line1', code: 'JUNK_ADDRESS', message: JUNK_MESSAGE });
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: 'aaaa' }).message, JUNK_MESSAGE);
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: 'NA' }).code, 'LANDMARK_REQUIRED'); // "NA" is too short to be a landmark
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: 'N/A' }).code, 'JUNK_ADDRESS'); // and "N/A" is junk
});

test('real addresses that merely contain a junk-looking word are fine', () => {
  assert.equal(isJunkText('Test Heights, Kalawad Road'), false);
  assert.equal(isJunkText('12 Hello Residency'), false);
  assert.equal(isJunkText('Plot 7, Sample Colony'), false);
  assert.equal(isJunkText('Flat 100, Abc Towers'), false);
});

test('an empty (or 1-2 letter) landmark is refused', () => {
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: '' }).code, 'LANDMARK_REQUIRED');
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: '   ' }).code, 'LANDMARK_REQUIRED');
  assert.equal(addressTextProblem({ line1: '12 Test Heights' }).code, 'LANDMARK_REQUIRED');
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: 'ab' }).code, 'LANDMARK_REQUIRED');
  assert.equal(addressTextProblem({ line1: '12 Test Heights', landmark: 'SBI' }), null);
});

test('the address is at least 10 characters together', () => {
  assert.equal(addressTextProblem({ line1: '1 R', landmark: 'SBI' }).code, 'ADDRESS_TOO_SHORT'); // "1 R, SBI" is 8 characters
  assert.equal(addressTextProblem({ line1: '12 Rd', landmark: 'SBI' }), null); // "12 Rd, SBI" is exactly 10
});

test('city: matches any place of the pincode, ignoring case, spaces, punctuation and small typos', () => {
  const places = ['Rajkot', 'Rajkot City', 'Kalawad Road', 'Rajkot HO'];
  assert.equal(cityMatchesPlaces('RAJKOT', places), true);
  assert.equal(cityMatchesPlaces(' raj-kot ', places), true);
  assert.equal(cityMatchesPlaces('Rajkott', places), true); // typo
  assert.equal(cityMatchesPlaces('Rjakot', places), true); // swapped letters
  assert.equal(cityMatchesPlaces('Kalawad road', places), true); // a post office name
  assert.equal(cityMatchesPlaces('Surat', places), false);
  assert.equal(cityMatchesPlaces('Ahmedabad', ['Ahmedabad']), true);
  assert.equal(cityMatchesPlaces('Mumbai', ['Mumbai Suburban']), true);
  assert.equal(cityMatchesPlaces('', places), false);
  assert.equal(cityMatchesPlaces('Pune', ['NA']), false);
});

// ---- the same rules, as the checkout / admin request validators apply them ----
const body = (address = {}, customer = {}) => ({
  customer: { name: 'Jane Doe', phone: '9876543210', ...customer },
  address: { line1: '12 Test Heights', landmark: 'Near City Mall', city: 'Rajkot', state: 'Gujarat', pincode: '360004', country: 'India', ...address },
  paymentMethod: 'COD',
});
const failure = (input) => {
  const r = checkoutSchema.safeParse(input);
  return r.success ? null : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};

test('checkout: the request validator enforces every rule (so a request sent straight to the API cannot skip them)', () => {
  assert.equal(failure(body()), null);
  assert.deepEqual(failure(body({ line1: 'Plot 5 Road, '.repeat(20) })), [{ path: 'address.line1', message: TOO_LONG_MESSAGE }]);
  assert.deepEqual(failure(body({ line1: 'मकान 12' })), [{ path: 'address.line1', message: ENGLISH_MESSAGE }]);
  assert.deepEqual(failure(body({ landmark: 'सिटी' })), [{ path: 'address.landmark', message: ENGLISH_MESSAGE }]);
  assert.deepEqual(failure(body({ line1: 'test' })), [{ path: 'address.line1', message: JUNK_MESSAGE }]);
  assert.deepEqual(failure(body({ line1: 'aaaa bbbb cccc' })), [{ path: 'address.line1', message: JUNK_MESSAGE }]);
  assert.equal(failure(body({ landmark: '' }))[0].path, 'address.landmark');
  assert.equal(failure(body({ landmark: undefined }))[0].path, 'address.landmark');
  assert.deepEqual(failure(body({ city: 'राजकोट' })), [{ path: 'address.city', message: ENGLISH_MESSAGE }]);
  assert.deepEqual(failure(body({}, { name: 'राहुल शर्मा' })), [{ path: 'customer.name', message: ENGLISH_MESSAGE }]);
});

test('admin address editor: uses the very same address rules', () => {
  assert.equal(adminAddressSchema.safeParse({ address: body().address }).success, true);
  for (const bad of [{ line1: 'test' }, { landmark: '' }, { line1: 'मकान 12' }, { city: 'राजकोट' }, { line1: 'Plot 5 Road, '.repeat(20) }]) {
    assert.equal(adminAddressSchema.safeParse({ address: body(bad).address }).success, false, JSON.stringify(bad).slice(0, 40));
  }
});
