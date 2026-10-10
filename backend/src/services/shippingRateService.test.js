const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const shiprocketService = require('./shiprocketService');
const settingsService = require('./settingsService');
const shippingRateService = require('./shippingRateService');

const originalGetServiceability = shiprocketService.getServiceability;
const originalGetSettings = settingsService.getSettings;

function stubSettings(overrides) {
  settingsService.getSettings = async () => ({
    tax: { enabled: true, percent: 18 },
    shipping: {
      handlingMargin: 0,
      minCharge: 0,
      maxCharge: null,
      roundTo: 1,
      fallbackFlatCharge: 59,
      freeThreshold: 700,
      rateIncludesGst: false,
      rateIncludesCodCharge: false,
      courierSelectionRule: 'lowest_rate',
      ...overrides?.shipping,
    },
    shiprocket: { enabled: true, pickupPincode: '360001', ...overrides?.shiprocket },
  });
}

after(() => {
  shiprocketService.getServiceability = originalGetServiceability;
  settingsService.getSettings = originalGetSettings;
});

test('falls back to the flat charge when Shiprocket is disabled in settings', async () => {
  stubSettings({ shiprocket: { enabled: false } });
  shiprocketService.getServiceability = async () => {
    throw new Error('should never be called while disabled');
  };
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400001', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 59);
  assert.equal(quote.source, 'fallback');
});

test('falls back to the flat charge when no delivery pincode is given (cart preview)', async () => {
  stubSettings();
  shiprocketService.getServiceability = async () => {
    throw new Error('should never be called with no pincode');
  };
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: undefined, paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 59);
  assert.equal(quote.source, 'fallback');
});

test('falls back to the flat charge on an unserviceable pincode (empty courier list)', async () => {
  stubSettings();
  shiprocketService.getServiceability = async () => [];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '999999', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 59);
  assert.equal(quote.source, 'fallback-unserviceable');
});

test('falls back to the flat charge when the API errors', async () => {
  stubSettings({ shipping: { freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => {
    throw new Error('Shiprocket request failed.');
  };
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400099', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 59);
  assert.equal(quote.source, 'fallback-error');
});

test('falls back to the flat charge on timeout', async () => {
  stubSettings({ shipping: { freeThreshold: 0 } });
  shiprocketService.getServiceability = () => new Promise((resolve) => setTimeout(() => resolve([{ courier_name: 'Slow', freight_charge: 10 }]), 10000));
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400010', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 59);
  assert.equal(quote.source, 'fallback-timeout');
});

test('picks the lowest-rate courier, adds GST (rateIncludesGst=false), rounds to nearest 1', async () => {
  stubSettings({ shipping: { rateIncludesGst: false, roundTo: 1, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [
    { courier_name: 'Expensive', freight_charge: 100 },
    { courier_name: 'Cheap', freight_charge: 50 },
  ];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400011', paymentMethod: 'Online', weightKg: 0.3 });
  // 50 * 1.18 = 59 exactly
  assert.equal(quote.charge, 59);
  assert.equal(quote.courierName, 'Cheap');
  assert.equal(quote.source, 'shiprocket');
});

test('does not add GST again when rateIncludesGst=true', async () => {
  stubSettings({ shipping: { rateIncludesGst: true, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 59 }];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400012', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 59);
});

test('applies handling margin on top of the GST-adjusted rate', async () => {
  stubSettings({ shipping: { rateIncludesGst: true, handlingMargin: 10, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 50 }];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400013', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 60);
});

test('enforces the minimum charge floor', async () => {
  stubSettings({ shipping: { rateIncludesGst: true, minCharge: 100, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 20 }];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400014', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 100);
});

test('enforces the maximum charge cap', async () => {
  stubSettings({ shipping: { rateIncludesGst: true, maxCharge: 50, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 500 }];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400015', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 50);
});

test('rounds to the nearest 5 when roundTo=5', async () => {
  stubSettings({ shipping: { rateIncludesGst: true, roundTo: 5, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [{ courier_name: 'X', freight_charge: 57 }];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400016', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.charge, 55);
});

test('courierSelectionRule=fastest picks the courier with the soonest parseable ETD', async () => {
  stubSettings({ shipping: { courierSelectionRule: 'fastest', rateIncludesGst: true, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [
    { courier_name: 'Slow', freight_charge: 10, etd: '5 days' },
    { courier_name: 'Fast', freight_charge: 20, etd: '1 day' },
  ];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400017', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.courierName, 'Fast');
});

test('courierSelectionRule=fastest falls back to lowest rate when no ETD parses', async () => {
  stubSettings({ shipping: { courierSelectionRule: 'fastest', rateIncludesGst: true, freeThreshold: 0 } });
  shiprocketService.getServiceability = async () => [
    { courier_name: 'A', freight_charge: 30, etd: null },
    { courier_name: 'B', freight_charge: 10, etd: null },
  ];
  const quote = await shippingRateService.getShippingQuote({ deliveryPincode: '400018', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(quote.courierName, 'B');
});

test('cache isolation: different pincode/paymentMethod/weight never share a cached rate', async () => {
  stubSettings({ shipping: { rateIncludesGst: true, freeThreshold: 0 } });
  let callCount = 0;
  shiprocketService.getServiceability = async ({ deliveryPostcode, cod, weightKg }) => {
    callCount += 1;
    return [{ courier_name: `c-${deliveryPostcode}-${cod}-${weightKg}`, freight_charge: 10 }];
  };

  const a = await shippingRateService.getShippingQuote({ deliveryPincode: '500001', paymentMethod: 'COD', weightKg: 0.3 });
  const b = await shippingRateService.getShippingQuote({ deliveryPincode: '500002', paymentMethod: 'COD', weightKg: 0.3 });
  const c = await shippingRateService.getShippingQuote({ deliveryPincode: '500001', paymentMethod: 'Online', weightKg: 0.3 });
  const d = await shippingRateService.getShippingQuote({ deliveryPincode: '500001', paymentMethod: 'COD', weightKg: 0.5 });
  assert.equal(callCount, 4);
  assert.notEqual(a.courierName, b.courierName);
  assert.notEqual(a.courierName, c.courierName);
  assert.notEqual(a.courierName, d.courierName);

  // Same key again -> served from cache, no new call.
  const aAgain = await shippingRateService.getShippingQuote({ deliveryPincode: '500001', paymentMethod: 'COD', weightKg: 0.3 });
  assert.equal(callCount, 4);
  assert.equal(aAgain.courierName, a.courierName);
});
