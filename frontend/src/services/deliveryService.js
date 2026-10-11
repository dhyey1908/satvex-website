import { api } from './apiClient';

export const deliveryService = {
  checkPincode: (pincode) => api.post('/delivery/check', { pincode }),
};
