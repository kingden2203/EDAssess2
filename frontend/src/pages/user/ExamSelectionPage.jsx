import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, FileText, Zap, ChevronRight, BarChart2, GraduationCap, ClipboardCheck } from 'lucide-react';
import { examApi } from '../../api/examApi';
import authApi from '../../api/authApi';
import useAuthStore from '../../auth/useAuthStore';
import useExamHistory from '../../hooks/useExamHistory';
import { GWA_WEIGHTS, PASSING_GWA, computeGwa, points, fmt } from '../../utils/gwa';
import { majorsFor } from '../../utils/majors';
import apiError from '../../utils/apiError';

const EXAM_TYPES = [
  {
    id:       'gened',
    label:    'General Education',
    short:    'GenEd',
    weight:   '20%',
    items:    150,
    hours:    2,
    minutes:  120,
    color:    'green',
    desc:     'Covers Communication Arts, Mathematics, Science, Social Sciences, Filipino, and Humanities.',
    topics:   ['Communication Arts', 'Mathematics', 'Science & Technology', 'Social Sciences', 'Filipino', 'Humanities & the Arts'],
    icon:     BookOpen,
  },
  {
    id:       'profed',
    label:    'Professional Education',
    short:    'ProfEd',
    weight:   '40%',
    items:    150,
    hours:    3,
    minutes:  180,
    color:    'blue',
    desc:     'Covers Child Development, Curriculum, Assessment, Teaching Principles, and the Teacher & Society.',
    topics:   ['Child & Adolescent Dev.', 'Curriculum Development', 'Assessment in Learning', 'Principles of Teaching', 'The Teacher & The School Curriculum'],
    icon:     FileText,
  },
  {
    id:       'major',
    label:    'Specialization (Major)',
    short:    'Major',
    weight:   '40%',
    items:    180,
    hours:    3,
    minutes:  180,
    color:    'purple',
    desc:     'Covers your major field.', // napapalitan ng major ng student sa baba
    topics:   [],                          // napapalitan ng major ng student sa baba
    icon:     Zap,
  },
];

const CATEGORY_MAP = { gened: 'GenEd', profed: 'ProfEd', major: 'Major' };

export default function ExamSelectionPage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const { history } = useExamHistory();
  const [activeExams, setActiveExams] = useState([]);
  const [examConfig, setExamConfig] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [savingMajor, setSavingMajor] = useState(false);

  const gwa = computeGwa(history || []);
  const myMajors = majorsFor(user?.department);

  useEffect(() => {
    async function loadData() {
      try {
        const [exams, config] = await Promise.all([
          examApi.getPublicExams(),
          examApi.getExamConfig().catch(() => null), // kahit mag-fail ang config, tuloy pa rin
        ]);
        setActiveExams(exams);
        setExamConfig(config);
      } catch (err) {
        console.error('Failed to load active exams:', err);
      } finally {
        setFetching(false);
      }
    }
    loadData();
  }, []);

  // Pagpili/pagpapalit ng major ng student
  const handlePickMajor = async (major) => {
    if (major === user?.major || savingMajor) return;
    setSavingMajor(true);
    try {
      const res = await authApi.updateProfile({ major });
      updateUser({ major: res?.major ?? major });
    } catch (err) {
      alert(apiError(err, 'Failed to save your major.'));
    } finally {
      setSavingMajor(false);
    }
  };

  // GenEd/ProfEd: shared sa lahat. Major: ang exam na naka-tag sa major ng student.
  // (Lumang Major exam na walang major tag ay gagamitin lang kung pasok sa department niya.)
  const findMatchingExam = (category) => {
    const matches = activeExams.filter((e) => e.category === category);
    if (category !== 'Major') return matches[0];
    return (
      matches.find((e) => e.major && e.major === user?.major) ||
      matches.find((e) => !e.major && (!e.department || e.department === 'BOTH' || e.department === user?.department))
    );
  };

  const handleStart = (exam) => {
    const category = CATEGORY_MAP[exam.id];
    const matchingExam = findMatchingExam(category);

    if (category === 'Major' && !user?.major) {
      alert('Please select your major first.');
      return;
    }

    if (!matchingExam) {
      alert(`No active ${exam.label} exam has been published yet. Please check with your instructor.`);
      return;
    }

    const attemptLimit = examConfig?.maxAttempts ?? 1;
    if (attemptLimit > 0 && (matchingExam.attempts_used ?? 0) >= attemptLimit) {
      alert(`You have already used your ${attemptLimit} attempt(s) for this exam.`);
      return;
    }

    navigate('/dashboard/exam', {
      state: {
        examId:           matchingExam.id,
        examType:         exam.id,
        label:            matchingExam.title,
        short:            exam.short,
        totalItems:       matchingExam.questions.length,
        durationMin:      matchingExam.duration_minutes,
        color:            exam.color,
        shuffleQuestions: examConfig?.shuffleQuestions ?? true,
      },
    });
  };

  return (
    <>
      {/* Topbar */}
      <div className="user-topbar">
        <div className="user-topbar-left">
          <h1>Take Exam</h1>
          <p>Select your exam category — full LET simulation with countdown timer</p>
        </div>
        <div className="user-topbar-right">
          <span className="user-topbar-badge">
            <Zap size={12} /> LET Simulation Mode
          </span>
        </div>
      </div>

      <div className="user-content">

        {/* ── Info Banner ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
          borderRadius: 'var(--user-radius-lg)',
          padding: '20px 24px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={20} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 14, marginBottom: 3 }}>LET Simulation Mode — Real Exam Conditions</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5 }}>
              Timer auto-starts when you begin. Alerts at 30, 10, and 5 minutes. Exam auto-submits when time runs out.
            </div>
          </div>
        </div>

        {/* ── Your Major ── */}
        {myMajors.length > 0 && (
          <div className="user-card" style={{ marginBottom: 24 }}>
            <div className="user-card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <GraduationCap size={16} style={{ color: 'var(--user-accent)' }} />
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--user-text-muted)' }}>
                  Your Major · {user?.department}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: user?.major ? 'var(--user-text-sub)' : 'var(--user-danger, #dc2626)', marginBottom: 12 }}>
                {user?.major
                  ? 'Your Specialization exam is based on this major. You can change it anytime.'
                  : 'Select your major to unlock the Specialization exam.'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {myMajors.map((m) => {
                  const active = user?.major === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handlePickMajor(m)}
                      disabled={savingMajor}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 8,
                        cursor: savingMajor ? 'wait' : 'pointer',
                        fontSize: 13,
                        fontWeight: active ? 700 : 500,
                        border: `1px solid ${active ? 'var(--user-accent)' : 'var(--user-border, #e5e7eb)'}`,
                        background: active ? 'var(--user-accent-soft)' : 'transparent',
                        color: active ? 'var(--user-accent)' : 'var(--user-text, inherit)',
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Overall GWA ── */}
        <div className="user-card" style={{ marginBottom: 24 }}>
          <div className="user-card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--user-text-muted)' }}>Overall GWA</div>
              <div style={{ fontSize: 12.5, color: 'var(--user-text-sub)', marginTop: 2 }}>
                GenEd 20% + ProfEd 40% + Major 40% · passing {PASSING_GWA}%
              </div>
            </div>
            {gwa.complete ? (
              <div style={{ fontSize: 28, fontWeight: 800, color: gwa.passed ? 'var(--user-accent)' : 'var(--user-danger)' }}>
                {fmt(gwa.gwa)}%
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--user-text-muted)' }}>
                Pending — still missing: <strong>{gwa.missing.join(', ')}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ── Exam Cards ── */}
        <div className="exam-cards-grid">
          {EXAM_TYPES.map((baseExam) => {
            // Ang Major card ay naka-personalize sa major ng student
            const exam = baseExam.id === 'major'
              ? {
                  ...baseExam,
                  label: user?.major ? `Specialization — ${user.major}` : baseExam.label,
                  desc: user?.major
                    ? `Covers your major field: ${user.major}.`
                    : 'Select your major above to see your Specialization exam.',
                  topics: user?.major ? [user.major] : [],
                }
              : baseExam;

            const Icon = exam.icon;
            const category = CATEGORY_MAP[exam.id];
            const needsMajor = category === 'Major' && !user?.major;
            const matchingExam = needsMajor ? null : findMatchingExam(category);
            const latest = (history || []).find((h) => h.short === exam.short);
            const limit = examConfig?.maxAttempts ?? 1;
            const used = matchingExam?.attempts_used ?? 0;
            const locked = !!matchingExam && limit > 0 && used >= limit;
            return (
              <div className="exam-sel-card" key={exam.id}>
                <div className="exam-sel-card-top">
                  <div className={`exam-sel-icon ${exam.color}`}>
                    <Icon size={24} />
                  </div>
                  <span className={`exam-sel-weight ${exam.color}`}>
                    LET {exam.weight}
                  </span>
                </div>

                <h3 className="exam-sel-title">{exam.label}</h3>
                <p className="exam-sel-sub">{exam.desc}</p>

                <div className="exam-sel-meta">
                  <div className="exam-sel-meta-row">
                    <Clock size={14} />
                    <span>Duration: <strong>{matchingExam ? `${matchingExam.duration_minutes} min` : `${exam.hours} Hours`}</strong></span>
                  </div>
                  <div className="exam-sel-meta-row">
                    <FileText size={14} />
                    <span>Items: <strong>{matchingExam ? matchingExam.questions.length : 0} questions</strong></span>
                  </div>
                  <div className="exam-sel-meta-row">
                    <Zap size={14} />
                    <span>LET Weight: <strong>{exam.weight}</strong></span>
                  </div>
                  <div className="exam-sel-meta-row">
                    <BarChart2 size={14} />
                    <span>
                      Latest score:{' '}
                      <strong>
                        {latest
                          ? `${latest.percentage}% (× ${GWA_WEIGHTS[exam.short]} = ${fmt(points(latest.percentage, exam.short))} pts)`
                          : 'Not taken yet'}
                      </strong>
                    </span>
                  </div>
                  <div className="exam-sel-meta-row">
                    <ClipboardCheck size={14} />
                    <span>
                      Attempts: <strong>{matchingExam ? `${used} / ${limit === 0 ? '∞' : limit}` : '—'}</strong>
                    </span>
                  </div>
                </div>

                {/* Topics */}
                {exam.topics.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--user-text-muted)', marginBottom: 8 }}>
                      Coverage Areas
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {exam.topics.map((t) => (
                        <span key={t} className="u-badge u-badge-neutral" style={{ fontSize: 11 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  className={`exam-sel-btn ${exam.color}`}
                  onClick={() => handleStart(exam)}
                  disabled={!matchingExam || locked}
                  style={(!matchingExam || locked) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {fetching
                    ? 'Loading...'
                    : needsMajor
                      ? 'Select Your Major First'
                      : locked
                        ? 'Attempt Limit Reached'
                      : matchingExam
                        ? `Start ${exam.short} Exam`
                        : 'Not Available Yet'}{' '}
                  <ChevronRight size={15} style={{ display: 'inline' }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Note ── */}
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12.5, color: 'var(--user-text-muted)' }}>
          ⚠️ Once started, the timer cannot be paused. Make sure you're ready before beginning.
        </div>

      </div>
    </>
  );
}