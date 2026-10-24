import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Flag, ChevronLeft, ChevronRight, Send, X, Clock } from 'lucide-react';
import useQuestionBank from '../../hooks/useQuestionBank';
import useExamTimer from '../../hooks/useExamTimer';
import { examApi } from '../../api/examApi';

const CATEGORY_MAP = { gened: 'GenEd', profed: 'ProfEd', major: 'Major' };

const NAV_PAGE_SIZE = 25;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const WARNINGS = [
  { at: 30 * 60, label: '⚠️ 30 minutes remaining!',  shown: false },
  { at: 10 * 60, label: '⚠️ 10 minutes remaining!',  shown: false },
  { at:  5 * 60, label: '🚨 Only 5 minutes left!',   shown: false },
];

export default function ExamPage() {
  const location = useLocation();
  const navigate  = useNavigate();
  const state     = location.state;

  const { questions: bank, loading: bankLoading } = useQuestionBank();

  useEffect(() => {
    if (!state) navigate('/dashboard/selection', { replace: true });
  }, [state, navigate]);

  const {
    examId,
    examType    = 'gened',
    label       = 'General Education',
    short       = 'GenEd',
    totalItems  = 20,
    durationMin = 120,
    color       = 'green',
    shuffleQuestions = true,
  } = state || {};

  // ── State ─────────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState([]);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [config, setConfig] = useState(null);       // global exam config (autoSubmit, maxAttempts, ...)
  const [attemptsUsed, setAttemptsUsed] = useState(0);

  // Exam config: kailangan bago magsimula ang timer para tama ang autoSubmit
  useEffect(() => {
    examApi.getExamConfig().then(setConfig).catch(() => setConfig({}));
  }, []);

  useEffect(() => {
    async function loadQuestions() {
      if (examId) {
        try {
          const exam = await examApi.getExamById(examId);
          setAttemptsUsed(exam.attempts_used ?? 0);
          const mapped = exam.questions.map((q) => ({
            id: q.id,
            question: q.question,
            choices: q.choices,
            answer: q.answer,
            subject: q.subject || q.category,
            explanation: q.explanation,
            choice_explanations: q.choice_explanations,
          }));
          setQuestions(shuffleQuestions ? shuffle(mapped) : mapped);
        } catch (err) {
          console.error('Failed to load exam:', err);
        } finally {
          setQuestionsReady(true);
        }
        return;
      }

      if (bankLoading) return;
      const category = CATEGORY_MAP[examType] || 'GenEd';
      const pool = bank.filter((q) => q.category === category);
      const picked = shuffle(pool).slice(0, totalItems);
      setQuestions(picked.map((q) => ({
        id: q.id,
        question: q.question,
        choices: q.choices,
        answer: q.answer,
        subject: q.subject || q.category,
        explanation: q.explanation,
        choice_explanations: q.choice_explanations,
      })));
      setQuestionsReady(true);
    }
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, bankLoading]);

  const configReady   = config !== null;
  const autoSubmit    = config?.autoSubmit ?? true;
  const attemptLimit  = config?.maxAttempts ?? 1; // 0 = unlimited
  const locked        = !!examId && configReady && questionsReady && attemptLimit > 0 && attemptsUsed >= attemptLimit;

  // Hindi puwedeng pumasok kung naubos na ang attempts (kahit i-type pa ang URL)
  useEffect(() => {
    if (locked) {
      alert(`You have already used your ${attemptLimit} attempt(s) for this exam.`);
      navigate('/dashboard/selection', { replace: true });
    }
  }, [locked, attemptLimit, navigate]);

  const [current,  setCurrent]   = useState(0);
  const [navPage,  setNavPage]   = useState(0);
  const [answers,  setAnswers]   = useState({});
  const [flagged,  setFlagged]   = useState(new Set());
  const [toast,    setToast]     = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const warningsRef   = useRef(WARNINGS.map((w) => ({ ...w })));
  const toastTimer    = useRef(null);
  const submittingRef = useRef(false);
  const timeLeftRef   = useRef(durationMin * 60);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (isAuto = false) => {
    if (submittingRef.current) return; // iwas double submit (manual + auto)
    submittingRef.current = true;
    setSubmitting(true);
    setShowConfirm(false);

    const score = questions.reduce((acc, q, i) => {
      return answers[i] === q.answer ? acc + 1 : acc;
    }, 0);

    const pct = Math.round((score / questions.length) * 100);
    const timeTaken = Math.max(0, durationMin * 60 - timeLeftRef.current);
    const category = CATEGORY_MAP[examType] || 'GenEd';

    const subjectBreakdown = questions.reduce((acc, q, i) => {
      const subj = q.subject || 'General';
      if (!acc[subj]) acc[subj] = { correct: 0, total: 0 };
      acc[subj].total += 1;
      if (answers[i] === q.answer) acc[subj].correct += 1;
      return acc;
    }, {});

    let savedAttempt = null;
    try {
      savedAttempt = await examApi.createAttempt({
        ...(examId ? { exam: examId } : {}),
        exam_type: examType,
        category,
        label,
        score,
        total: questions.length,
        percentage: pct,
        passed: pct >= 75,
        time_taken_seconds: timeTaken,
        auto_submit: isAuto,
        subject_breakdown: subjectBreakdown,
        detail: { questions, answers },
      });
    } catch (err) {
      if (err.response?.status === 403) {
        alert(err.response?.data?.detail || 'You are not allowed to submit this exam.');
        navigate('/dashboard/selection', { replace: true });
        return;
      }
      console.error('Failed to save exam attempt:', err);
    }

    navigate(savedAttempt ? `/dashboard/results/${savedAttempt.id}` : '/dashboard/results', {
      replace: true,
      state: {
        examType,
        label,
        short,
        color,
        score,
        total:      questions.length,
        percentage: pct,
        timeTaken,
        autoSubmit: isAuto,
        answers,
        questions,
        subjectBreakdown,
      },
    });
  }, [questions, answers, navigate, examType, examId, label, short, color, durationMin]);

  // ── Timer (clock-based, walang stale closure) ─────────────────────────────
  const { timeLeft, timeUp } = useExamTimer({
    durationMin,
    autoSubmit,
    ready: questionsReady && configReady && !locked && questions.length > 0,
    onExpire: handleSubmit,
  });
  timeLeftRef.current = timeLeft;

  // 30 / 10 / 5 minute warnings (laktawan kung mas maikli ang exam kaysa sa warning)
  useEffect(() => {
    if (!questionsReady || locked || questions.length === 0) return;
    warningsRef.current.forEach((w) => {
      if (!w.shown && w.at < durationMin * 60 && timeLeft <= w.at && timeLeft > 0) {
        w.shown = true;
        showToast(w.label);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  useEffect(() => {
    setNavPage(Math.floor(current / NAV_PAGE_SIZE));
  }, [current]);

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerClass = timeLeft <= 5 * 60
    ? 'exam-timer danger'
    : timeLeft <= 10 * 60
    ? 'exam-timer warning'
    : 'exam-timer normal';

  const handleAnswer = (choiceIdx) => {
    if (timeUp) return; // naka-lock na ang sagot kapag tapos na ang oras
    setAnswers((prev) => ({ ...prev, [current]: choiceIdx }));
  };

  const toggleFlag = () => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(current) ? next.delete(current) : next.add(current);
      return next;
    });
  };

  if (!state) return null;
  if (locked) return null;

  if (bankLoading || !questionsReady || !configReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <p style={{ color: 'var(--user-text-sub)' }}>Loading exam questions...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <p style={{ color: 'var(--user-text-sub)' }}>No questions available for {label} yet. Ask your instructor to add some to the Question Bank.</p>
        <button className="exam-btn exam-btn-primary" onClick={() => navigate('/dashboard/selection')}>Back to Selection</button>
      </div>
    );
  }

  const q           = questions[current];
  const answered    = Object.keys(answers).length;
  const progress    = ((current + 1) / questions.length) * 100;
  const isFlagged   = flagged.has(current);
  const isLast      = current === questions.length - 1;

  const totalNavPages = Math.ceil(questions.length / NAV_PAGE_SIZE) || 1;
  const navStart = navPage * NAV_PAGE_SIZE;
  const navEnd = Math.min(navStart + NAV_PAGE_SIZE, questions.length);

  return (
    <div className="exam-shell">

      {toast && (
        <div className="exam-warning-toast">
          <AlertTriangle size={18} />
          <span className="exam-warning-toast-text">{toast}</span>
          <button className="exam-warning-toast-close" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Auto-submit OFF: tapos na ang oras, hindi na puwedeng magsagot, pero kailangan pang mag-submit */}
      {timeUp && !autoSubmit && !submitting && (
        <div className="exam-warning-toast">
          <AlertTriangle size={18} />
          <span className="exam-warning-toast-text">
            ⏰ Time&apos;s up — your answers are locked. Please submit your exam.
          </span>
        </div>
      )}

      <div className="exam-header">
        <div className="exam-header-left">
          <span className="exam-header-title">{label} — LET Simulation</span>
          <span className="exam-header-sub">{answered} of {questions.length} answered</span>
        </div>

        <div className={timerClass}>
          <Clock size={18} />
          {formatTime(timeLeft)}
        </div>

        <button
          className="exam-btn exam-btn-submit"
          onClick={() => setShowConfirm(true)}
          disabled={submitting}
          style={{ padding: '8px 16px', fontSize: 13 }}
        >
          <Send size={14} /> Submit Exam
        </button>
      </div>

      <div className="exam-body">

        <div className="exam-nav-panel">
          <div className="exam-nav-title">Questions</div>

          {totalNavPages > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {Array.from({ length: totalNavPages }, (_, p) => {
                const start = p * NAV_PAGE_SIZE + 1;
                const end = Math.min(start + NAV_PAGE_SIZE - 1, questions.length);
                const pageHasFlag = Array.from(flagged).some((i) => i >= p * NAV_PAGE_SIZE && i < p * NAV_PAGE_SIZE + NAV_PAGE_SIZE);
                return (
                  <button
                    key={p}
                    onClick={() => setNavPage(p)}
                    className={`exam-btn ${p === navPage ? 'exam-btn-primary' : 'exam-btn-secondary'}`}
                    style={{ fontSize: 11, padding: '4px 8px', position: 'relative' }}
                  >
                    {start}–{end}
                    {pageHasFlag && (
                      <span style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: '50%', background: 'var(--user-amber)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="exam-nav-grid">
            {questions.slice(navStart, navEnd).map((_, i) => {
              const qIndex = navStart + i;
              return (
                <button
                  key={qIndex}
                  className={[
                    'exam-nav-btn',
                    answers[qIndex] !== undefined ? 'answered' : '',
                    qIndex === current ? 'current' : '',
                    flagged.has(qIndex) ? 'flagged' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setCurrent(qIndex)}
                >
                  {qIndex + 1}
                </button>
              );
            })}
          </div>

          <div className="exam-nav-legend">
            <div className="exam-nav-legend-row">
              <div className="exam-nav-legend-dot" style={{ background: 'var(--user-accent)' }} />
              Answered ({answered})
            </div>
            <div className="exam-nav-legend-row">
              <div className="exam-nav-legend-dot" style={{ background: 'var(--user-amber)' }} />
              Flagged ({flagged.size})
            </div>
            <div className="exam-nav-legend-row">
              <div className="exam-nav-legend-dot" style={{ background: 'var(--user-border)', border: '1px solid var(--user-border-dark)' }} />
              Unanswered ({questions.length - answered})
            </div>
          </div>
        </div>

        <div className="exam-question-area">
          <div className="exam-q-card">

            <div className="exam-q-header">
              <span className="exam-q-number">Question {current + 1} of {questions.length}</span>
              <div className="exam-q-progress-bar">
                <div className="exam-q-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--user-text-muted)' }}>{Math.round(progress)}%</span>
            </div>

            <div className="exam-q-body">
              <p className="exam-q-text">{q.question}</p>

              <div className="exam-choices">
                {q.choices.map((choice, i) => (
                  <div
                    key={i}
                    className={`exam-choice ${answers[current] === i ? 'selected' : ''}`}
                    onClick={() => handleAnswer(i)}
                    style={timeUp ? { cursor: 'not-allowed', opacity: 0.8 } : undefined}
                  >
                    <div className="exam-choice-letter">
                      {String.fromCharCode(65 + i)}
                    </div>
                    <span className="exam-choice-text">{choice}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="exam-q-footer">
              <button
                className="exam-btn exam-btn-secondary"
                onClick={() => setCurrent((p) => Math.max(0, p - 1))}
                disabled={current === 0}
              >
                <ChevronLeft size={15} /> Previous
              </button>

              <button
                className={`exam-btn ${isFlagged ? 'exam-btn-flag' : 'exam-btn-secondary'}`}
                onClick={toggleFlag}
              >
                <Flag size={14} />
                {isFlagged ? 'Flagged' : 'Flag'}
              </button>

              {isLast ? (
                <button
                  className="exam-btn exam-btn-submit"
                  onClick={() => setShowConfirm(true)}
                  disabled={submitting}
                >
                  <Send size={14} /> Submit
                </button>
              ) : (
                <button
                  className="exam-btn exam-btn-primary"
                  onClick={() => setCurrent((p) => Math.min(questions.length - 1, p + 1))}
                >
                  Next <ChevronRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="inst-modal-backdrop" onClick={() => setShowConfirm(false)}>
          <div className="inst-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="inst-modal-header">
              <h3>Submit Exam?</h3>
              <button className="inst-btn-icon" onClick={() => setShowConfirm(false)}><X size={16} /></button>
            </div>
            <div className="inst-modal-body">
              <p style={{ fontSize: 14, color: 'var(--user-text-sub)', margin: '0 0 16px', lineHeight: 1.6 }}>
                You have answered <strong>{answered}</strong> of <strong>{questions.length}</strong> questions.
                {answered < questions.length && (
                  <span style={{ color: 'var(--user-danger)' }}> {questions.length - answered} question(s) unanswered.</span>
                )}
              </p>
              <p style={{ fontSize: 13, color: 'var(--user-text-muted)', margin: 0 }}>
                Once submitted, you cannot go back. Are you sure?
              </p>
            </div>
            <div className="inst-modal-footer">
              <button className="inst-btn inst-btn-secondary inst-btn-sm" onClick={() => setShowConfirm(false)}>
                Continue Exam
              </button>
              <button className="inst-btn inst-btn-primary inst-btn-sm" onClick={() => handleSubmit(false)} disabled={submitting}>
                <Send size={13} /> {submitting ? 'Submitting...' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
