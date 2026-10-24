import { useState, useEffect } from 'react';
import { FileText, Save, RotateCcw, Info } from 'lucide-react';
import { adminApi } from "../../api/adminApi";

const DEFAULT_CONFIG = {
  genEd: 120,
  profEd: 180,
  major: 180,
  autoSubmit: true,
  showResults: true,
  allowReview: false,
  shuffleQuestions: true,
  maxAttempts: 1,
};

export default function ExamConfigPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function loadConfig() {
      try {
        const data = await adminApi.getExamConfig();
        if (data) setConfig(data);
      } catch (err) {
        console.error('Failed to load exam config, using defaults:', err);
      } finally {
        setFetching(false);
      }
    }
    loadConfig();
  }, []);

  const handleChange = (key, value) => {
    setSaved(false);
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await adminApi.saveExamConfig(config);
      setSaved(true);
    } catch (err) {
      alert(err.message || 'Failed to save configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setSaved(false);
  };

  if (fetching) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading configuration settings...</div>;
  }

  return (
    <>
      <div className="admin-topbar">
        <div className="topbar-left">
          <h1>Exam Configuration</h1>
          <p>Set global exam rules, time limits, and behavior settings</p>
        </div>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={handleReset}>
            <RotateCcw size={13} /> Reset
          </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3>Time Limits</h3>
                  <p>Global duration per exam category (in minutes)</p>
                </div>
                <div className="stat-card-icon blue">
                  <FileText size={15} />
                </div>
              </div>
              <div className="admin-card-body">
                <div className="form-group">
                  <label className="form-label">
                    General Education (GenEd)
                    <span className="form-label-sub">· LET Coverage Area 1</span>
                  </label>
                  <div className="form-input-with-unit">
                    <input
                      type="number"
                      min={30}
                      max={300}
                      value={config.genEd}
                      onChange={(e) => handleChange('genEd', Number(e.target.value))}
                    />
                    <span className="form-input-unit">minutes</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Professional Education (ProfEd)
                    <span className="form-label-sub">· LET Coverage Area 2</span>
                  </label>
                  <div className="form-input-with-unit">
                    <input
                      type="number"
                      min={30}
                      max={300}
                      value={config.profEd}
                      onChange={(e) => handleChange('profEd', Number(e.target.value))}
                    />
                    <span className="form-input-unit">minutes</span>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Specialization (Major)
                    <span className="form-label-sub">· LET Coverage Area 3</span>
                  </label>
                  <div className="form-input-with-unit">
                    <input
                      type="number"
                      min={30}
                      max={300}
                      value={config.major}
                      onChange={(e) => handleChange('major', Number(e.target.value))}
                    />
                    <span className="form-input-unit">minutes</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3>Scoring Rules</h3>
                  <p>Attempt limits — passing itself follows the fixed PRC rule</p>
                </div>
              </div>
              <div className="admin-card-body">
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18,
                  padding: '10px 14px', borderRadius: 'var(--admin-radius, 8px)',
                  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
                }}>
                  <Info size={15} style={{ color: 'var(--admin-text-muted)', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--admin-text-sub)', lineHeight: 1.6 }}>
                    Passing score is not configurable here. It follows the official PRC/LET rule: a 75% combined average across GenEd, ProfEd, and Major, with no single area below 50%.
                  </p>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Max Attempts per Student
                    <span className="form-label-sub">· 0 = unlimited</span>
                  </label>
                  <div className="form-input-with-unit">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={config.maxAttempts}
                      onChange={(e) => handleChange('maxAttempts', Number(e.target.value))}
                    />
                    <span className="form-input-unit">attempt(s)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3>Exam Behavior</h3>
                  <p>Enable or disable global exam features</p>
                </div>
              </div>
              <div className="admin-card-body" style={{ padding: '8px 22px' }}>
                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>Auto-Submit</h4>
                    <p>Automatically submit when the timer reaches zero</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.autoSubmit}
                      onChange={(e) => handleChange('autoSubmit', e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>Show Results Immediately</h4>
                    <p>Display score and answers right after submission</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.showResults}
                      onChange={(e) => handleChange('showResults', e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>Show Answer Explanations</h4>
                    <p>Students can view the answer explanations</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.allowReview}
                      onChange={(e) => handleChange('allowReview', e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="toggle-row">
                  <div className="toggle-info">
                    <h4>Shuffle Questions</h4>
                    <p>Randomize question order for each student</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.shuffleQuestions}
                      onChange={(e) => handleChange('shuffleQuestions', e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

              </div>
            </div>

            <div className="admin-card">
              <div className="admin-card-header">
                <div><h3>Current Summary</h3></div>
              </div>
              <div className="admin-card-body">
                {[
                  { label: 'GenEd Duration', value: `${config.genEd} min` },
                  { label: 'ProfEd Duration', value: `${config.profEd} min` },
                  { label: 'Major Duration', value: `${config.major} min` },
                  { label: 'Auto-Submit', value: config.autoSubmit ? 'Enabled' : 'Disabled' },
                  { label: 'Passing Rule', value: '75% avg · 50% per area (PRC)' },
                  { label: 'Max Attempts', value: config.maxAttempts === 0 ? 'Unlimited' : config.maxAttempts },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid var(--admin-border)',
                    fontSize: 13
                  }}>
                    <span style={{ color: 'var(--admin-text-sub)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--admin-text)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}