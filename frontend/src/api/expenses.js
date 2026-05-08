import { api } from './client';

export const expensesApi = {
  list: () => api.get('/api/expenses'),
  add: (data) => api.post('/api/expenses', data),
  remove: (id) => api.delete(`/api/expenses/${id}`),
};
