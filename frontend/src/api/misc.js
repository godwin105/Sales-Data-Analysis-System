import { API_BASE_URL, api } from './client';

export const dashboardApi = {
  load:               ()             => api.get('/api/dashboard'),
  cashier:            ()             => api.get('/api/dashboard/cashier'),
  topProductsByMonth: (year, month)  => api.get('/api/dashboard/top-products', { params: { year, month } }),
  salesTrendByMonth:  (year, month)  => api.get('/api/dashboard/sales-trend',  { params: { year, month } }),
  expensesByMonth:    (year, month)  => api.get('/api/dashboard/expenses',      { params: { year, month } }),
};

export const insightsApi = {
  load:     (year, month)        => api.get('/api/insights',         { params: { year, month } }),
  compare:  (months, year, month) => api.get('/api/insights/compare', { params: { months, year, month } }),
  velocity: (months, year, month) => api.get('/api/insights/velocity',{ params: { months, year, month } }),
};

export const reportsApi = {
  preview: (params) => api.get('/api/reports/preview', { params }),
 
  downloadUrl: (params) => {
    const qs = new URLSearchParams(params).toString();
    return `${API_BASE_URL}/api/reports/download?${qs}`;
  },
  
  // For programmatic download with auth header to save it in the app
  download: (params) =>
    api.get('/api/reports/download', { params, responseType: 'blob' }),
};
