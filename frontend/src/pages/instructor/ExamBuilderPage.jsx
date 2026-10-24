// src/pages/instructor/ExamBuilderPage.jsx
import { useState, useEffect } from 'react';
import { ClipboardList, Plus, Trash2, X, Clock, BookOpen, Save } from 'lucide-react';
import { examApi } from '../../api/examApi';
import useAuthStore from '../../auth/useAuthStore';
import MajorField from '../../components/MajorField';
import apiError from '../../utils/apiError';

// LET-based default durations
const CATEGORY_DEFAULTS = {
  GenEd:  120,
  ProfEd: 180,
  Major:  180,
};

const CATEGORIES = ['GenEd', 'ProfEd', 'Major'];
const MAX_QUESTIONS_PER_EXAM = 180;

const STATUS_BADGE = {
  active:    'inst-badge inst-badge-success',
  draft:     'inst-badge inst-badge-neutral',
  completed: 'inst-badge inst-badge-blue',
};

const CATEGORY_BADGE = {
  GenEd:  'inst-badge inst-badge-blue',
  ProfEd: 'inst-badge inst-badge-purple',
  Major:  'inst-badge inst-badge-amber',
};

const DIFFICULTY_BADGE = {
  Easy:   'inst-badge inst-badge-success',
  Medium: 'inst-badge inst-badge-amber',
  Hard:   'inst-badge inst-badge-danger',
};

const EMPTY_FORM = {
  name: '', category: 'GenEd', duration: 120, selectedQuestions: [], status: 'draft', major: '',
};

function mapExamFromApi(e) {
  return {
    id: e.id,
    name: e.title,
    category: e.category,
    major: e.major,
    department: e.department,
    duration: e.duration_minutes,
    questions: e.questions.map((q) => q.id),
    status: e.status,
    created: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}

function mapQuestionFromApi(q) {
  return {
    id: q.id,
    question: q.question,
    category: q.category,
    difficulty: q.difficulty,
    major: q.major, // Major lang: 'Mathematics', 'Automotive Technology', ... | null
  };
}

const categoryLabel = (category, major) =>
  category === 'Major' && major ? `Major (${major})` : category;

export default function ExamBuilderPage() {
  const { user } = useAuthStore();
  const [exams, setExams]               = useState([]);
  const [questionPool, setQuestionPool] = useState([]);
  const [fetching, setFetching]         = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [examsData, questionsData] = await Promise.all([
          examApi.getExams(),
          examApi.getQuestions(),
        ]);
        setExams(examsData.map(mapExamFromApi));
        setQuestionPool(questionsData.map(mapQuestionFromApi));
      } catch (err) {
        console.error('Failed to load exam builder data:', err);
      } finally {
        setFetching(false);
      }
    }
    loadData();
  }, []);

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (exam) => {
    setEditItem(exam.id);
    setForm({
      name: exam.name,
      category: exam.category,
      duration: exam.duration,
      selectedQuestions: [...exam.questions],
      status: exam.status,
      major: exam.major || '',
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setForm(EMPTY_FORM); setEditItem(null); };

  // Ang category tabs sa question picker ang nagtatakda ng category ng exam.
  const handleCategoryChange = (cat) => {
    if (cat === form.category) return;
    if (form.selectedQuestions.length > 0 &&
        !confirm(`Switching to ${cat} will clear your ${form.selectedQuestions.length} selected question(s). Continue?`)) return;
    setForm((p) => ({ ...p, category: cat, duration: CATEGORY_DEFAULTS[cat], selectedQuestions: [] }));
  };

  const handleMajorChange = (major) => {
    if (major === form.major) return;
    if (form.selectedQuestions.length > 0 &&
        !confirm('Changing the major will clear your selected questions. Continue?')) return;
    setForm((p) => ({ ...p, major, selectedQuestions: [] }));
  };

  const toggleQuestion = (id) => {
    setForm((p) => {
      const isSelected = p.selectedQuestions.includes(id);
      if (!isSelected && p.selectedQuestions.length >= MAX_QUESTIONS_PER_EXAM) {
        alert(`You can only select up to ${MAX_QUESTIONS_PER_EXAM} questions per exam.`);
        return p;
      }
      return {
        ...p,
        selectedQuestions: isSelected
          ? p.selectedQuestions.filter((q) => q !== id)
          : [...p.selectedQuestions, id],
      };
    });
  };

  // Tanging questions ng napiling category. Major: tugma sa napiling major
  // (kasama ang lumang Major questions na wala pang major tag).
  const filteredPool = questionPool.filter((q) => {
    if (q.category !== form.category) return false;
    if (q.category !== 'Major') return true;
    if (!form.major) return false;
    return !q.major || q.major === form.major;
  });

  const selectAllShown = () => {
    setForm((p) => {
      const merged = [...p.selectedQuestions];
      let capped = false;
      for (const q of filteredPool) {
        if (merged.includes(q.id)) continue;
        if (merged.length >= MAX_QUESTIONS_PER_EXAM) { capped = true; break; }
        merged.push(q.id);
      }
      if (capped) alert(`Only the first ${MAX_QUESTIONS_PER_EXAM} questions were selected (the maximum per exam).`);
      return { ...p, selectedQuestions: merged };
    });
  };

  const clearSelection = () => setForm((p) => ({ ...p, selectedQuestions: [] }));

  // id → pagkakasunod-sunod ng pagpili (1, 2, 3...)
  const selectedOrder = new Map(form.selectedQuestions.map((id, i) => [id, i + 1]));
  const selectedCount = form.selectedQuestions.length;

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Exam name is required.');
    if (form.category === 'Major' && !form.major) return alert('Select a major for this exam.');
    if (selectedCount === 0) return alert('Select at least one question.');
    if (selectedCount > MAX_QUESTIONS_PER_EXAM) {
      return alert(`This exam has ${selectedCount} questions — the maximum is ${MAX_QUESTIONS_PER_EXAM}.`);
    }

    setSaving(true);
    try {
      const payload = {
        title: form.name,
        category: form.category,
        duration_minutes: form.duration,
        status: form.status,
        question_ids: form.selectedQuestions,
        major: form.category === 'Major' ? form.major : null,
      };

      if (editItem) {
        const updated = await examApi.updateExam(editItem, payload);
        setExams((prev) => prev.map((e) => (e.id === editItem ? mapExamFromApi(updated) : e)));
      } else {
        const created = await examApi.createExam(payload);
        setExams((prev) => [mapExamFromApi(created), ...prev]);
      }
      closeModal();
    } catch (err) {
      alert(apiError(err, 'Failed to save exam.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this exam?')) return;
    try {
      await examApi.deleteExam(id);
      setExams((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert(apiError(err, 'Failed to delete exam.'));
    }
  };

  if (fetching) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading exam builder...</div>;
  }

  return (
    <>
      {/* Topbar */}
      <div className="inst-topbar">
        <div className="inst-topbar-left">
          <h1>Exam Builder</h1>
          <p>Create quizzes with LET-based time limits and question pools</p>
        </div>
        <div className="inst-topbar-right">
          <button className="inst-btn inst-btn-primary inst-btn-sm" onClick={openAdd}>
            <Plus size={13} /> Create Exam
          </button>
        </div>
      </div>

      <div className="inst-content">
        <div className="inst-card">
          <div className="inst-card-header">
            <div>
              <h3>All Exams</h3>
              <p>Manage your created assessments</p>
            </div>
          </div>

          {exams.length === 0 ? (
            <div className="inst-empty">
              <ClipboardList size={40} />
              <p>No exams yet. Create your first exam!</p>
            </div>
          ) : (
            <table className="inst-table">
              <thead>
                <tr>
                  <th>Exam Name</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Questions</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{exam.name}</td>
                    <td>
                      <span className={CATEGORY_BADGE[exam.category]}>
                        {categoryLabel(exam.category, exam.major)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--inst-text-sub)' }}>
                        <Clock size={13} /> {exam.duration} min
                      </div>
                    </td>
                    <td>{exam.questions.length} / {MAX_QUESTIONS_PER_EXAM} items</td>
                    <td><span className={STATUS_BADGE[exam.status]}>{exam.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--inst-text-muted)' }}>{exam.created}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="inst-btn-icon" onClick={() => openEdit(exam)} title="Edit">
                          <BookOpen size={13} />
                        </button>
                        <button className="inst-btn-icon" onClick={() => handleDelete(exam.id)} title="Delete" style={{ color: 'var(--inst-danger)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="inst-save-bar">
            <p>{exams.length} exam(s) total</p>
          </div>
        </div>
      </div>

      {/* ── Create/Edit Modal ── */}
      {showModal && (
        <div className="inst-modal-backdrop" onClick={closeModal}>
          <div className="inst-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>

            {/* Sticky header: nandito na ang Create/Update para hindi na mag-scroll pababa */}
            <div
              className="inst-modal-header"
              style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: 'var(--inst-surface)', gap: 12,
              }}
            >
              <h3 style={{ flex: 1 }}>{editItem ? 'Edit Exam' : 'Create New Exam'}</h3>

              <span
                className={`inst-badge ${selectedCount > 0 ? 'inst-badge-blue' : 'inst-badge-neutral'}`}
                title="Questions selected for this exam"
              >
                {selectedCount} / {MAX_QUESTIONS_PER_EXAM} selected
              </span>

              <button className="inst-btn inst-btn-primary inst-btn-sm" onClick={handleSave} disabled={saving}>
                <Save size={13} />
                {saving ? 'Saving...' : editItem ? 'Update Exam' : 'Create Exam'}
              </button>
              <button className="inst-btn-icon" onClick={closeModal} title="Cancel"><X size={16} /></button>
            </div>

            <div className="inst-modal-body">

              {/* Name */}
              <div className="inst-form-group">
                <label className="inst-form-label">Exam Name</label>
                <input
                  className="inst-form-input"
                  placeholder="e.g. GenEd Midterm Review"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              {/* Duration + Status (ang category ay nasa question picker sa ibaba) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="inst-form-group">
                  <label className="inst-form-label">
                    Duration
                    <span className="inst-form-label-sub">· default for {form.category}</span>
                  </label>
                  <div className="inst-form-input-unit">
                    <input
                      type="number"
                      min={30}
                      max={300}
                      value={form.duration}
                      onChange={(e) => setForm((p) => ({ ...p, duration: Number(e.target.value) }))}
                    />
                    <span className="inst-form-unit-label">min</span>
                  </div>
                </div>

                <div className="inst-form-group">
                  <label className="inst-form-label">Status</label>
                  <select
                    className="inst-form-select"
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>

              {/* Category tabs — ito ang nagtatakda ng category ng exam */}
              <div className="inst-form-group">
                <label className="inst-form-label">Category</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`inst-btn inst-btn-sm ${form.category === c ? 'inst-btn-primary' : 'inst-btn-secondary'}`}
                      onClick={() => handleCategoryChange(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Major: buttons para sa major ng department */}
              {form.category === 'Major' && (
                <MajorField
                  department={user?.department}
                  label="Exam is for"
                  value={form.major}
                  onChange={handleMajorChange}
                />
              )}

              {/* Question Picker */}
              <div className="inst-form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <label className="inst-form-label" style={{ margin: 0 }}>
                    Select Questions
                    <span className="inst-form-label-sub">
                      · {filteredPool.length} available · {selectedCount} checked
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="inst-btn inst-btn-secondary inst-btn-sm"
                      onClick={selectAllShown}
                      disabled={filteredPool.length === 0}
                    >
                      Select all shown
                    </button>
                    <button
                      type="button"
                      className="inst-btn inst-btn-secondary inst-btn-sm"
                      onClick={clearSelection}
                      disabled={selectedCount === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Question list: scrollable, may row number at pick number */}
                <div
                  style={{
                    border: '1px solid var(--inst-border)',
                    borderRadius: 'var(--inst-radius)',
                    overflow: 'hidden auto',
                    maxHeight: 360,
                  }}
                >
                  {form.category === 'Major' && !form.major ? (
                    <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--inst-text-sub)' }}>
                      Pick a major above to see its questions.
                    </div>
                  ) : filteredPool.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--inst-text-sub)' }}>
                      {form.category === 'Major'
                        ? `No Major questions for ${form.major} yet. Add some in the Question Bank first.`
                        : `No ${form.category} questions yet. Add some in the Question Bank first.`}
                    </div>
                  ) : (
                    filteredPool.map((q, idx) => {
                      const order = selectedOrder.get(q.id);
                      const isSelected = order !== undefined;
                      const limitReached = !isSelected && selectedCount >= MAX_QUESTIONS_PER_EXAM;
                      return (
                        <div
                          key={q.id}
                          onClick={() => !limitReached && toggleQuestion(q.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px',
                            cursor: limitReached ? 'not-allowed' : 'pointer',
                            borderBottom: '1px solid var(--inst-border)',
                            background: isSelected ? 'var(--inst-accent-soft)' : 'transparent',
                            opacity: limitReached ? 0.45 : 1,
                            transition: 'background 0.15s, opacity 0.15s',
                          }}
                        >
                          {/* Row number sa listahan */}
                          <span
                            style={{
                              width: 30, flexShrink: 0, textAlign: 'right',
                              fontSize: 11.5, fontWeight: 600, color: 'var(--inst-text-muted)',
                            }}
                            title="Position in this list"
                          >
                            {idx + 1}.
                          </span>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={limitReached}
                            onChange={() => toggleQuestion(q.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ flexShrink: 0, accentColor: 'var(--inst-accent)' }}
                          />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--inst-text)' }}>{q.question}</span>

                          {/* Pick number: nagbibilang ng naka-check */}
                          {isSelected && (
                            <span
                              title={`Item ${order} of ${selectedCount} in this exam`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                minWidth: 26, height: 20, padding: '0 7px', borderRadius: 10,
                                background: 'var(--inst-accent)', color: '#fff',
                                fontSize: 11, fontWeight: 700, flexShrink: 0,
                              }}
                            >
                              {order}
                            </span>
                          )}

                          <span className={DIFFICULTY_BADGE[q.difficulty]}>{q.difficulty}</span>
                          <span className={CATEGORY_BADGE[q.category]}>
                            {q.category === 'Major' ? (q.major || 'Untagged') : q.category}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedCount >= MAX_QUESTIONS_PER_EXAM && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--inst-warning)' }}>
                    Maximum of {MAX_QUESTIONS_PER_EXAM} questions reached. Uncheck one to pick another.
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}