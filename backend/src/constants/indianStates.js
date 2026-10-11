// Canonical state/UT names for the delivery-eligibility allowlist (Admin >
// Delivery, see deliveryEligibilityService.js). These are the exact strings
// api.postalpincode.in returns in its `State` field — confirmed by live
// sampling, not assumed from the official state-name list, because this
// free API's data noticeably predates some real administrative changes:
// it still reports "Jammu & Kashmir" for Leh/Ladakh pincodes (no separate
// Ladakh), keeps "Daman & Diu" and "Dadra & Nagar Haveli" apart even though
// they administratively merged in 2020, and uses the pre-2006 name
// "Pondicherry" rather than "Puducherry". Matching against this list must
// use these exact strings (case-insensitively), not the current official
// names, or every pincode in that region would incorrectly resolve as
// non-serviceable.
const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Jammu & Kashmir',
  'Andaman & Nicobar',
  'Chandigarh',
  'Dadra & Nagar Haveli',
  'Daman & Diu',
  'Delhi',
  'Lakshadweep',
  'Pondicherry',
];

module.exports = { INDIAN_STATES };
