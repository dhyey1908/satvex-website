const AppError = require('../utils/AppError');

// Deterministic, network-free stand-in for shiprocketService.js — same
// function signatures/return shapes, selected by shiprocketProvider.js when
// env.shiprocket.mode === 'mock'. Never calls fetch. Used for local/automated
// testing without real Shiprocket credentials, and so no real shipment is
// ever created from a test run.
//
// Test markers (embed in the relevant id/pincode, case-sensitive):
//   deliveryPostcode === '000000'        -> getServiceability: not serviceable (empty list)
//   orderId includes 'MOCKFAIL_CREATE'    -> createOrder throws
//   shiprocketOrderId === 'MOCKFAIL_AWB'  -> assignAwb throws
//   shiprocketOrderId === 'MOCKFAIL_PICKUP' -> schedulePickup throws
//   shipmentId === 'MOCKFAIL_LABEL'       -> generateLabel throws
//   anything else -> deterministic success

async function getServiceability({ deliveryPostcode, weightKg, cod }) {
  if (String(deliveryPostcode) === '000000') return [];
  const base = 40 + Number(weightKg || 0.5) * 20;
  return [
    {
      courier_name: 'Mock Surface Courier',
      cutoff_time: '14:00',
      etd: '3-5 days',
      freight_charge: cod ? base + 25 : base,
      is_surface: true,
      rto_charges: base,
    },
    {
      courier_name: 'Mock Air Courier',
      cutoff_time: '18:00',
      etd: '1-2 days',
      freight_charge: (cod ? base + 25 : base) + 60,
      is_surface: false,
      rto_charges: base + 60,
    },
  ];
}

async function listPickupAddresses() {
  return [
    {
      id: 1,
      pickup_location: 'Mock Warehouse',
      address: '1 Mock Street',
      city: 'Mock City',
      state: 'Mock State',
      country: 'India',
      pin_code: '400001',
    },
  ];
}

async function createOrder({ orderId }) {
  if (orderId.includes('MOCKFAIL_CREATE')) {
    throw new AppError('Mock Shiprocket: simulated order/create failure.', 502, 'SHIPROCKET_ORDER_CREATE_FAILED');
  }
  return { order_id: `MOCK-SR-${orderId}`, status: 'NEW', status_code: 1 };
}

async function assignAwb({ shiprocketOrderId }) {
  if (shiprocketOrderId === 'MOCKFAIL_AWB') {
    throw new AppError('Mock Shiprocket: simulated AWB assignment failure.', 502, 'SHIPROCKET_AWB_FAILED');
  }
  return {
    awbCode: `MOCKAWB-${shiprocketOrderId}`,
    courierName: 'Mock Surface Courier',
    shipmentId: `MOCK-SHIP-${shiprocketOrderId}`,
  };
}

async function schedulePickup({ shiprocketOrderId, pickupDate }) {
  if (shiprocketOrderId === 'MOCKFAIL_PICKUP') {
    throw new AppError('Mock Shiprocket: simulated pickup scheduling failure.', 502, 'SHIPROCKET_PICKUP_FAILED');
  }
  return { pickup_status: 1, pickup_scheduled_date: pickupDate };
}

async function generateLabel({ shipmentId }) {
  if (shipmentId === 'MOCKFAIL_LABEL') {
    throw new AppError('Mock Shiprocket: simulated label generation failure.', 502, 'SHIPROCKET_LABEL_FAILED');
  }
  return `https://mock.local/labels/${shipmentId}.pdf`;
}

async function cancelOrder({ shiprocketOrderId }) {
  return { message: `Mock cancel accepted for ${shiprocketOrderId}` };
}

async function trackByAwb(awb) {
  return {
    shipment_track: [{ current_status: 'IN TRANSIT' }],
    shipment_track_activities: [{ activity: 'Mock scan', location: 'Mock Hub', date: new Date().toISOString() }],
    track_url: `https://mock.local/track/${awb}`,
  };
}

module.exports = {
  getServiceability,
  listPickupAddresses,
  createOrder,
  assignAwb,
  schedulePickup,
  generateLabel,
  cancelOrder,
  trackByAwb,
};
