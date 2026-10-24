// 📁 frontend/src/components/AuthModal.jsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, KeyRound, ArrowRight, X, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../auth/useAuthStore';
import authApi from '../api/authApi';
import axiosInstance from '../api/axiosInstance';
import { majorsFor } from '../utils/majors';
import '../styles/AuthModal.css';

const ROLE_REDIRECT = {
  admin:      '/admin',
  instructor: '/instructor',
  user:       '/dashboard',
};

const DEPARTMENTS = [
  { value: 'CIT', label: 'CIT', full: 'College of Industrial Technology' },
  { value: 'CTE', label: 'CTE', full: 'College of Teacher Education' },
];

const RESEND_SECONDS = 60;

function extractErrorMessage(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.message === 'string') return data.message;
  const firstKey = Object.keys(data)[0];
  if (firstKey && Array.isArray(data[firstKey]) && data[firstKey].length) {
    return data[firstKey][0];
  }
  return fallback;
}

const InputField = ({ icon: Icon, type, placeholder, value, onChange, ...rest }) => (
  <div className="enhanced-input-group">
    <Icon className="enhanced-field-icon" size={18} />
    <input
      type={type}
      placeholder={placeholder}
      className="sans-input"
      value={value}
      onChange={onChange}
      required
      {...rest}
    />
  </div>
);

const PasswordField = ({ placeholder, value, onChange, show, onToggle }) => (
  <div className="enhanced-input-group">
    <KeyRound className="enhanced-field-icon" size={18} />
    <input
      type={show ? 'text' : 'password'}
      placeholder={placeholder}
      className="sans-input"
      value={value}
      onChange={onChange}
      required
    />
    <button
      type="button"
      className="password-toggle-btn"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
);

const pickerBtnStyle = (active) => ({
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${active ? 'var(--prmsu-gold)' : 'var(--border-subtle)'}`,
  background: active ? 'var(--prmsu-gold-pale)' : '#ffffff',
  color: 'var(--text-dark)',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
});

const DepartmentField = ({ value, onChange }) => (
  <div style={{ marginBottom: 14, width: '100%' }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-light)' }}>
      Which college are you under?
    </label>
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      {DEPARTMENTS.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onChange(d.value)}
          title={d.full}
          style={{ ...pickerBtnStyle(value === d.value), flex: '1 1 0', minWidth: 0, fontSize: 13.5 }}
        >
          {d.label}
        </button>
      ))}
    </div>
    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-light)' }}>
      {value ? DEPARTMENTS.find((d) => d.value === value)?.full : 'Select your college.'}
    </p>
  </div>
);

const MajorField = ({ department, value, onChange }) => {
  const majors = majorsFor(department);
  if (!department) return null;

  return (
    <div style={{ marginBottom: 14, width: '100%' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-light)' }}>
        What is your major?
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
        {majors.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{ ...pickerBtnStyle(value === m), flex: '1 1 calc(50% - 8px)', minWidth: 0 }}
          >
            {m}
          </button>
        ))}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-light)' }}>
        {value ? `Major: ${value}` : 'Select your major.'}
      </p>
    </div>
  );
};

const SubmitButton = ({ text, disabled }) => (
  <button className="enhanced-submit-btn" type="submit" disabled={disabled}>
    {text} <ArrowRight size={16} />
  </button>
);

const AuthModal = () => {
  const navigate = useNavigate();
  const { isModalOpen, activeView, setAuthModal, login } = useAuthStore();

  const [formData, setFormData] = useState({
    fullName: '', email: '', password: '', confirmPassword: '', department: '', major: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');
  const [notice, setNotice]       = useState('');

  const [showPw, setShowPw]               = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // ── Email verification step ──
  const [verifyEmail, setVerifyEmail] = useState(null); // string = naka-verify step
  const [code, setCode]               = useState('');
  const [cooldown, setCooldown]       = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resetForm = () => {
    setFormData({ fullName: '', email: '', password: '', confirmPassword: '', department: '', major: '' });
    setError('');
    setShowPw(false);
    setShowConfirmPw(false);
  };

  const closeModal = () => {
    resetForm();
    setNotice('');
    setVerifyEmail(null);
    setCode('');
    setCooldown(0);
    setAuthModal(false);
  };

  const handleInputChange = (e, field) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (error) setError('');
  };

  const startVerify = (email, sent) => {
    setVerifyEmail(email);
    setCode('');
    setError('');
    if (sent) {
      setNotice(`We sent a 6-digit code to ${email}. It expires in 10 minutes.`);
      setCooldown(RESEND_SECONDS);
    } else {
      setNotice('We could not send the email right now. Tap "Resend code" to try again.');
      setCooldown(0);
    }
  };

  // ── Login ──
  const handleLogin = async (e) => {
    e.preventDefault();
    const { email, password } = formData;

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const userData = await authApi.login({ email, password });
      login(userData.access, userData.user);
      closeModal();
      navigate(ROLE_REDIRECT[userData.user.role] || '/', { replace: true });
    } catch (err) {
      if (err.response?.data?.code === 'email_unverified') {
        const target = email.trim().toLowerCase();
        try { await axiosInstance.post('/auth/resend-code', { email: target }); } catch { /* ignore */ }
        startVerify(target, true);
      } else {
        setError(extractErrorMessage(err, 'Invalid email or password.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Register ──
  const handleRegister = async (e) => {
    e.preventDefault();
    const { fullName, email, password, confirmPassword, department, major } = formData;

    if (!fullName || !email || !password || !confirmPassword || !department) {
      setError('Please complete all fields, including your college.');
      return;
    }
    if (!major) {
      setError('Please select your major.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const res = await axiosInstance.post('/auth/register', {
        name: fullName.trim(),
        email: email.trim(),
        password,
        department,
        major,
      });

      const target = (res.data?.email || email).trim().toLowerCase();
      resetForm();
      startVerify(target, res.data?.email_sent !== false);
    } catch (err) {
      setError(extractErrorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Verify code ──
  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    try {
      setIsLoading(true);
      setError('');
      const res = await axiosInstance.post('/auth/verify-email', { email: verifyEmail, code });
      login(res.data.access, res.data.user);
      closeModal();
      navigate(ROLE_REDIRECT[res.data.user.role] || '/', { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !verifyEmail) return;
    try {
      await axiosInstance.post('/auth/resend-code', { email: verifyEmail });
      setNotice(`A new code was sent to ${verifyEmail}.`);
      setError('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not resend the code.'));
    }
  };

  if (!isModalOpen) return null;

  const title = verifyEmail
    ? 'Verify Your Email'
    : activeView === 'login' ? 'Institutional Login' : 'Student Registration';

  return (
    <AnimatePresence>
      <motion.div
        className="auth-enhanced-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeModal}
      >
        <motion.div
          className="auth-enhanced-container"
          style={{ maxHeight: '92vh', overflowY: 'auto' }}
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="enhanced-close-btn" onClick={closeModal}>
            <X size={20} />
          </button>

          <div className="modal-header centered">
            <h3 className="serif-title">{title}</h3>
            <p className="sans-subtitle">EduAssess Secure Access</p>
          </div>

          {notice && !error && (
            <div className="auth-error-message" style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', borderColor: 'rgba(22,163,74,0.25)' }}>
              {notice}
            </div>
          )}

          {error && <div className="auth-error-message">{error}</div>}

          {verifyEmail ? (
            <form onSubmit={handleVerify}>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="form-step-wrapper">
                <InputField
                  icon={ShieldCheck}
                  type="text"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (error) setError('');
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                />
                <SubmitButton text={isLoading ? 'Verifying...' : 'Verify & Continue'} disabled={isLoading} />
                <button
                  type="button"
                  className="toggle-view-link gold"
                  onClick={handleResend}
                  disabled={cooldown > 0}
                  style={{ marginTop: 12, opacity: cooldown > 0 ? 0.6 : 1 }}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
              </motion.div>
            </form>
          ) : (
            <form onSubmit={activeView === 'login' ? handleLogin : handleRegister}>
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="form-step-wrapper"
              >
                {activeView === 'login' ? (
                  <>
                    <InputField
                      icon={Mail}
                      type="email"
                      placeholder="Email Address"
                      value={formData.email}
                      onChange={(e) => handleInputChange(e, 'email')}
                    />
                    <InputField
                      icon={KeyRound}
                      type="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={(e) => handleInputChange(e, 'password')}
                    />
                    <SubmitButton text={isLoading ? 'Verifying...' : 'Sign In'} disabled={isLoading} />
                  </>
                ) : (
                  <>
                    <InputField
                      icon={User}
                      type="text"
                      placeholder="Full Name"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange(e, 'fullName')}
                    />
                    <InputField
                      icon={Mail}
                      type="email"
                      placeholder="Email (use a real address — we'll send a code)"
                      value={formData.email}
                      onChange={(e) => handleInputChange(e, 'email')}
                    />
                    <DepartmentField
                      value={formData.department}
                      onChange={(val) => {
                        setFormData((p) => ({ ...p, department: val, major: val === p.department ? p.major : '' }));
                        if (error) setError('');
                      }}
                    />
                    <MajorField
                      department={formData.department}
                      value={formData.major}
                      onChange={(val) => {
                        setFormData((p) => ({ ...p, major: val }));
                        if (error) setError('');
                      }}
                    />
                    <PasswordField
                      placeholder="Password"
                      value={formData.password}
                      onChange={(e) => handleInputChange(e, 'password')}
                      show={showPw}
                      onToggle={() => setShowPw((v) => !v)}
                    />
                    <PasswordField
                      placeholder="Confirm Password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange(e, 'confirmPassword')}
                      show={showConfirmPw}
                      onToggle={() => setShowConfirmPw((v) => !v)}
                    />
                    <SubmitButton text={isLoading ? 'Processing...' : 'Create Account'} disabled={isLoading} />
                  </>
                )}
              </motion.div>
            </form>
          )}

          <div className="modal-footer">
            <button
              className="toggle-view-link gold"
              type="button"
              onClick={() => {
                resetForm();
                setNotice('');
                if (verifyEmail) {
                  setVerifyEmail(null);
                  setCode('');
                  setAuthModal(true, 'login');
                } else {
                  setAuthModal(true, activeView === 'login' ? 'register' : 'login');
                }
              }}
            >
              {verifyEmail
                ? 'Back to sign in'
                : activeView === 'login'
                  ? 'Need an account? Register here'
                  : 'Already registered? Sign in'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AuthModal;
