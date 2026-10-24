import { useState, useEffect, useCallback } from 'react';
import modulesApi from '../api/modulesApi';

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// Tanggap ang camelCase at snake_case galing sa backend serializer
function normalize(m) {
  const fromUrl = decodeURIComponent((m.file || '').split('?')[0].split('/').pop() || '');
  return {
    ...m,
    fileName: m.fileName ?? m.file_name ?? fromUrl,
    fileSize: m.fileSize ?? m.file_size ?? m.size ?? 0,
    uploadedAt: m.uploadedAt ?? m.uploaded_at ?? m.created_at ?? new Date().toISOString(),
  };
}

const errMessage = (err, fallback) =>
  err?.response?.data?.detail || err?.response?.data?.message || err?.message || fallback;

export default function useReviewModules() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await modulesApi.getModules();
      const list = Array.isArray(data) ? data : (data.results || []);
      setModules(list.map(normalize));
    } catch (err) {
      console.error('Failed to load review modules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const addModule = useCallback(async (payload) => {
    const created = await modulesApi.createModule(payload);
    setModules((prev) => [normalize(created), ...prev]);
    return created;
  }, []);

  const removeModule = useCallback(async (id) => {
    try {
      await modulesApi.deleteModule(id);
      setModules((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert(errMessage(err, 'Failed to delete this module.'));
    }
  }, []);

  // Humihingi muna ng signed link sa backend (may permission check), tapos binubuksan ito.
  // Ang link mismo ang may Content-Disposition kaya nagda-download ng tamang file name.
  const downloadModule = useCallback(async (m) => {
    try {
      const { url } = await modulesApi.getDownloadUrl(m.id);
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(errMessage(err, 'Could not download this file. Please try again.'));
    }
  }, []);

  return { modules, loading, reload, addModule, removeModule, downloadModule };
}
