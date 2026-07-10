import { api } from './client';

export const stockApi = {
  list: (q = '') => api.get('/api/stock', { params: q ? { q } : {} }),
  get: (id) => api.get(`/api/stock/${id}`),
  add: (data) => api.post('/api/stock', data),
  update: (id, data) => api.put(`/api/stock/${id}`, data),
  restock: (id, data) => api.post(`/api/stock/${id}/restock`, data),
  remove: (id) => api.delete(`/api/stock/${id}`),
  addCategory: (name) => api.post('/api/stock/categories', { name }),
  getByBarcode: (barcode) => api.get(`/api/stock/barcode/${encodeURIComponent(barcode)}`),
};
