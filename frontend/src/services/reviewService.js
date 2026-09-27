import { api } from './apiClient';

export const reviewService = {
  list: (productId) => api.get(`/products/${encodeURIComponent(productId)}/reviews`),
  create: (productId, data) => api.post(`/products/${encodeURIComponent(productId)}/reviews`, data),
};
