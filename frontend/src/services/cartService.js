import { api } from './apiClient';

export const cartService = {
  get: () => api.get('/cart'),
  add: (data) => api.post('/cart', data),
  update: (id, data) => api.put(`/cart/${encodeURIComponent(id)}`, data),
  remove: (id) => api.delete(`/cart/${encodeURIComponent(id)}`),
  setSavedForLater: (id, savedForLater) =>
    api.put(`/cart/${encodeURIComponent(id)}/saved-for-later`, { savedForLater }),
};
