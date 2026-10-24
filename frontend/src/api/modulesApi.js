import axiosInstance from './axiosInstance';

const modulesApi = {
  getModules: async () => {
    const response = await axiosInstance.get('/modules');
    return response.data;
  },

  createModule: async ({ title, description, category, file, major, department }) => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description || '');
    formData.append('category', category);
    if (major) formData.append('major', major);
    if (department) formData.append('department', department);
    formData.append('file', file);

    const response = await axiosInstance.post('/modules', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteModule: async (id) => {
    const response = await axiosInstance.delete(`/modules/${id}`);
    return response.data;
  },

  // Maikling-buhay na signed link para sa download -> { url, file_name }
  getDownloadUrl: async (id) => {
    const response = await axiosInstance.get(`/modules/${id}/download`);
    return response.data;
  },
};

export const announcementApi = {
  getAnnouncements: async () => {
    const response = await axiosInstance.get('/announcements');
    return response.data;
  },
  createAnnouncement: async (data) => {
    const response = await axiosInstance.post('/announcements', data);
    return response.data;
  },
  updateAnnouncement: async (id, data) => {
    const response = await axiosInstance.put(`/announcements/${id}`, data);
    return response.data;
  },
  deleteAnnouncement: async (id) => {
    const response = await axiosInstance.delete(`/announcements/${id}`);
    return response.data;
  },
};

export default modulesApi;
