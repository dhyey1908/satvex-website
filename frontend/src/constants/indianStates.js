// Mirrors backend/src/constants/indianStates.js exactly — these must stay
// the same list, since the admin picks states here and the backend matches
// them (case-insensitively) against api.postalpincode.in's own `State`
// field at checkout time. See that file's comment for why some names here
// don't match the current official state/UT names (e.g. "Pondicherry", not
// "Puducherry" — this free lookup API's data predates some renames).
export const INDIAN_STATES = [
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
