import { api } from './client';

export const salesApi = {
  inStockProducts: () => api.get('/api/sales/products'),
  record: (data) => api.post('/api/sales', data),
  history: (params = {}) => api.get('/api/sales', { params }),
  get: (id) => api.get(`/api/sales/${id}`),
};
