import { api } from './apiClient';

export const contactService = {
  submit: (data) => api.post('/contact', data),
  getUploadUrl: (data) => api.post('/contact/upload-url', data),
};
