import { api } from './apiClient';

export const reviewService = {
  list: (productId) => api.get(`/products/${encodeURIComponent(productId)}/reviews`),
  mine: (productId) => api.get(`/products/${encodeURIComponent(productId)}/reviews/mine`),
  listMine: () => api.get('/reviews/mine'),
  create: (productId, data) => api.post(`/products/${encodeURIComponent(productId)}/reviews`, data),
  update: (productId, data) => api.put(`/products/${encodeURIComponent(productId)}/reviews/mine`, data),
  getUploadUrl: (data) => api.post('/reviews/upload-url', data),
};
