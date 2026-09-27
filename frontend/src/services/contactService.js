import { api } from './apiClient';

export const contactService = {
  submit: (data) => api.post('/contact', data),
};
