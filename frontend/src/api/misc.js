import { API_BASE_URL, api } from './client';

export const dashboardApi = {
  load: () => api.get('/api/dashboard'),
  topProductsByMonth: (year, month) => api.get('/api/dashboard/top-products', { params: { year, month } }),
  salesTrendByMonth: (year, month) => api.get('/api/dashboard/sales-trend', { params: { year, month } }),
  expensesByMonth: (year, month) => api.get('/api/dashboard/expenses', { params: { year, month } }),
};

export const insightsApi = {
  load: () => api.get('/api/insights'),
};

export const reportsApi = {
  preview: (params) => api.get('/api/reports/preview', { params }),
  // download returns a binary blob - we use fetch separately to handle the file download
  downloadUrl: (params) => {
    const qs = new URLSearchParams(params).toString();
    return `${API_BASE_URL}/api/reports/download?${qs}`;
  },
  
  // For programmatic download with auth header
  download: (params) =>
    api.get('/api/reports/download', { params, responseType: 'blob' }),
};
