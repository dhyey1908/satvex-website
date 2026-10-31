import { api } from './apiClient';

export const deliveryService = {
  checkPincode: (pincode) => api.post('/delivery/check', { pincode }),
  // Can a courier reach this pincode, by when, and is Cash on Delivery possible? (Shiprocket, cached by the server.)
  check: (pincode) => api.get('/delivery/check', { pincode }),
};
