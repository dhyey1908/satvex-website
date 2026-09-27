import { api } from './apiClient';

export const settingsService = {
  get: () => api.get('/settings'),
};
