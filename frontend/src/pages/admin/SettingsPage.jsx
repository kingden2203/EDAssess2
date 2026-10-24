import { useState, useEffect } from 'react';
import { Settings, Save } from 'lucide-react';
import { settingsApi } from '../../api/settingsApi';

const DEFAULT_SETTINGS = {
  systemName:       'EduAssess',
  institution:      'PRMSU — Iba Campus',
  department:       'College of Teacher Education',
  supportEmail:     'support@prmsu.edu.ph',
  maintenanceMode:  false,
  registrationOpen: true,
  emailNotifications: true,
  auditLogging:     true,
  sessionTimeout:   60,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await settingsApi.getSettings();
        if (data) setSettings(data);
      } catch (err) {
        console.error('Failed to load settings, using defaults:', err);
      } finally {
        setFetching(false);
      }
    }
    loadSettings();
  }, []);

  const handleChange = (key, value) => {
    setSaved(false);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsApi.saveSettings(settings);
      setSaved(true);
    } catch (err) {
      alert(err.message || 'Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading settings...</div>;
  }

  return (
    <>
      {/* Topbar */}
      <div className="admin-topbar">
        <div className="topbar-left">
          <h1>Settings</h1>
          <p>Global system configuration for EduAssess</p>
        </div>
        <div className="topbar-right">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={loading}
          >
            <Save size={13} />
            {loading ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="admin-content">
        <div className="two-col" style={{ alignItems: 'start' }}>

          {/* Left — General Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="admin-card">
              <div className="admin-card-header">
                <div><h3>General Information</h3><p>Platform identity and contact</p></div>
                <div className="stat-card-icon purple"><Settings size={15} /></div>
              </div>
              <div className="admin-card-body">

                {[
                  { key: 'systemName',    label: 'System Name' },
                  { key: 'institution',   label: 'Institution' },
                  { key: 'department',    label: 'Department' },
                  { key: 'supportEmail',  label: 'Support Email', type: 'email' },
                ].map(({ key, label, type = 'text' }) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <input
                      type={type}
                      className="form-input"
                      value={settings[key]}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  </div>
                ))}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Session Timeout
                    <span className="form-label-sub">· Auto-logout after inactivity</span>
                  </label>
                  <div className="form-input-with-unit">
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={settings.sessionTimeout}
                      onChange={(e) => handleChange('sessionTimeout', Number(e.target.value))}
                    />
                    <span className="form-input-unit">minutes</span>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Right — System Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="admin-card">
              <div className="admin-card-header">
                <div><h3>System Controls</h3><p>Enable or disable platform features</p></div>
              </div>
              <div className="admin-card-body" style={{ padding: '8px 22px' }}>

                {[
                  {
                    key: 'maintenanceMode',
                    label: 'Maintenance Mode',
                    desc: 'Disables the platform for all non-admin users',
                  },
                  {
                    key: 'registrationOpen',
                    label: 'Open Registration',
                    desc: 'Allow new student accounts to be created',
                  },
                  {
                    key: 'emailNotifications',
                    label: 'Announcements',
                    desc: 'Show announcements to students and let instructors post them',
                  },
                  {
                    key: 'auditLogging',
                    label: 'Audit Logging',
                    desc: 'Log all user actions for compliance and review',
                  },
                ].map(({ key, label, desc }) => (
                  <div className="toggle-row" key={key}>
                    <div className="toggle-info">
                      <h4>{label}</h4>
                      <p>{desc}</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(e) => handleChange(key, e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}

              </div>
              <div className="save-bar">
                <p>Changes take effect immediately after saving.</p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={loading}
                >
                  <Save size={13} />
                  {loading ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}