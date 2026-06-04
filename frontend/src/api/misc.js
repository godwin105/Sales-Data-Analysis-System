import { API_BASE_URL, api } from './client';

export const dashboardApi = {
  load: () => api.get('/api/dashboard'),
};

export const insightsApi = {
  load: () => api.get('/api/insights'),
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
