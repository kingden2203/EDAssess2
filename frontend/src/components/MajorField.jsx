// src/components/MajorField.jsx
import { useEffect } from 'react';
import useAuthStore from '../auth/useAuthStore';
import MajorPicker from './MajorPicker';

// Instructor na may major: naka-lock sa major niya. Iba: normal na MajorPicker.
export default function MajorField(props) {
  const { user } = useAuthStore();
  const locked = user?.role === 'instructor' ? user?.major : null;
  const { value, onChange, label } = props;

  useEffect(() => {
    if (locked && value !== locked) onChange(locked);
  }, [locked, value, onChange]);

  if (!locked) return <MajorPicker {...props} />;

  return (
    <div className="inst-form-group">
      <label className="inst-form-label">
        {label || 'Major'} <span className="inst-form-label-sub">· fixed to your major</span>
      </label>
      <span className="inst-badge inst-badge-amber">{locked}</span>
    </div>
  );
}
