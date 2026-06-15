import { api } from './client';

export const paymentsApi = {
  initiate: (data)       => api.post('/api/payments/initiate', data),
  status:   (externalId) => api.get(`/api/payments/status/${externalId}`),
};
