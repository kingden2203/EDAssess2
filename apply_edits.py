#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Applies the small edits to YOUR existing EDAssess2 files.

Usage:   python apply_edits.py <path to EDAssess2 project root>
         (the folder that contains `backend/` and `frontend/`)

- Makes a .bak backup of every file before the first change.
- Safe to run twice: edits that are already applied are skipped.
- Handles Windows (CRLF) and Linux (LF) line endings.
- Anything that cannot be matched is listed as FAIL so you can do it by hand
  (see README.md). Nothing is guessed.
"""
import re
import shutil
import sys
from pathlib import Path

E = []  # list of edits


def rep(file, old, new, done_if=None, expect=1, replace_all=False):
    E.append(dict(file=file, op='replace_all' if replace_all else 'replace',
                  old=old, new=new, done_if=done_if, expect=expect))


def rx(file, pattern, new, done_if, expect=1):
    E.append(dict(file=file, op='regex', pattern=pattern, new=new,
                  done_if=done_if, expect=expect))


def app(file, new, marker):
    E.append(dict(file=file, op='append', new=new, marker=marker))


# ───────────────────────── BACKEND ─────────────────────────

# accounts/models.py
F = 'backend/accounts/models.py'
rep(F, r'''from django.db import models''',
    r'''from django.db import models
from django.utils import timezone''',
    done_if='from django.utils import timezone')
rep(F, r'''    major = models.CharField(max_length=40, choices=MAJOR_CHOICES, blank=True, null=True)''',
    r'''    major = models.CharField(max_length=40, choices=MAJOR_CHOICES, blank=True, null=True)

    # Existing accounts stay True. Bagong self-registered students ay False hanggang ma-verify.
    email_verified = models.BooleanField(default=True)''',
    done_if='email_verified = models.BooleanField')
app(F, r'''

class EmailVerification(models.Model):
    """Isang active 6-digit code per user. Naka-hash ang code."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='email_verification')
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    last_sent_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f'Verification for {self.user.email}'
''', marker='class EmailVerification')

# exams/models.py
F = 'backend/exams/models.py'
rep(F, '    shuffleChoices = models.BooleanField(default=False)\n', '',
    done_if=None)
rep(F, r'''    maxAttempts = models.PositiveIntegerField(default=1)''',
    r'''    # 0 = unlimited
    maxAttempts = models.PositiveIntegerField(default=1)''',
    done_if='# 0 = unlimited')
rep(F, r'''    exam_type = models.CharField(max_length=20)''',
    r'''    exam = models.ForeignKey(
        'Exam', null=True, blank=True, on_delete=models.SET_NULL, related_name='attempts'
    )
    exam_type = models.CharField(max_length=20)''',
    done_if="related_name='attempts'")
app(F, r'''

def count_attempts(user, exam):
    """Ilang beses nang nag-submit ang user ng exam na ito."""
    return ExamAttempt.objects.filter(user=user, exam=exam).count()
''', marker='def count_attempts')

# exams/serializers.py
F = 'backend/exams/serializers.py'
rep(F, r'''    MAJOR_TARGET_CHOICES, MAX_QUESTIONS_PER_EXAM,''',
    r'''    MAJOR_TARGET_CHOICES, MAX_QUESTIONS_PER_EXAM, count_attempts,''',
    done_if='MAX_QUESTIONS_PER_EXAM, count_attempts')
rep(F, r'''    return dept''',
    r'''    # Instructor na may major: sariling major lang ang puwede niyang gawan ng question/exam
    if (user is not None and getattr(user, 'role', None) == 'instructor'
            and getattr(user, 'major', None) and major != user.major):
        raise serializers.ValidationError(
            {'major': f'You can only manage {user.major} questions and exams.'}
        )
    return dept''',
    done_if='You can only manage {user.major}')
rep(F, r'''    # Hinuhulaan mula sa major; read lang para sa frontend.''',
    r'''    attempts_used = serializers.SerializerMethodField()

    def get_attempts_used(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or getattr(user, 'role', None) != 'user':
            return None
        return count_attempts(user, obj)

    # Hinuhulaan mula sa major; read lang para sa frontend.''',
    done_if='attempts_used = serializers.SerializerMethodField()')
rep(F, r"""'questions', 'question_ids', 'major', 'department', 'created_at',""",
    r"""'questions', 'question_ids', 'major', 'department', 'created_at', 'attempts_used',""",
    done_if="'created_at', 'attempts_used',")
rep(F, r"""'id', 'user', 'exam_type', 'category', 'label',""",
    r"""'id', 'user', 'exam', 'exam_type', 'category', 'label',""",
    done_if="'id', 'user', 'exam', 'exam_type'")
rep(F, r"""'shuffleQuestions', 'shuffleChoices', 'maxAttempts',""",
    r"""'shuffleQuestions', 'maxAttempts',""",
    done_if="'shuffleQuestions', 'maxAttempts',")

# exams/views.py
F = 'backend/exams/views.py'
rep(F, r'''from rest_framework import generics, permissions, status''',
    r'''from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied''',
    done_if='from rest_framework.exceptions import PermissionDenied')
rep(F, r'''from .models import Exam, ExamAttempt, ExamConfig, Question''',
    r'''from .models import Exam, ExamAttempt, ExamConfig, Question, count_attempts''',
    done_if='Question, count_attempts')
rep(F, r'''        serializer.save(user=self.request.user)''',
    r'''        exam = serializer.validated_data.get('exam')
        limit = ExamConfig.load().maxAttempts  # 0 = unlimited
        if exam is not None and limit > 0:
            if count_attempts(self.request.user, exam) >= limit:
                raise PermissionDenied(
                    f'You have reached the maximum of {limit} attempt(s) for this exam.'
                )
        serializer.save(user=self.request.user)''',
    done_if='count_attempts(self.request.user, exam)')

# accounts/models.py: new CIT major
rep('backend/accounts/models.py', r"""        'Electrical Technology',""",
    r"""        'Electrical Technology',
        'Electronics Technology',""",
    done_if="'Electronics Technology'")

# config/settings.py: external storage for uploads (Supabase S3) + email settings
rep('backend/config/settings.py', r"""DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'""",
    r"""# ── External storage para sa Review Modules (Supabase Storage via S3 protocol) ──
# Kapag walang S3_BUCKET_NAME (local), FileSystemStorage ang gamit.
S3_BUCKET_NAME = config('S3_BUCKET_NAME', default='')
if S3_BUCKET_NAME:
    STORAGES['default'] = {
        'BACKEND': 'storages.backends.s3.S3Storage',
        'OPTIONS': {
            'bucket_name': S3_BUCKET_NAME,
            'endpoint_url': config('S3_ENDPOINT_URL'),       # .../storage/v1/s3 (buo, walang bucket name)
            'access_key': config('S3_ACCESS_KEY_ID'),
            'secret_key': config('S3_SECRET_ACCESS_KEY'),
            'region_name': config('S3_REGION', default='us-east-1'),
            'signature_version': 's3v4',
            'addressing_style': 'path',
            'default_acl': None,
            'file_overwrite': False,
            'querystring_auth': True,       # private bucket, signed links
            'querystring_expire': 300,
        },
    }

# ── Email (verification codes) ──────────────────────────────────────────────
# Render free tier blocks SMTP, kaya Brevo HTTPS API ang gamit sa production.
BREVO_API_KEY = config('BREVO_API_KEY', default='')
BREVO_SENDER_EMAIL = config('BREVO_SENDER_EMAIL', default='')
# SMTP (local / paid hosting). Walang config = naka-print sa console.
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='EduAssess <no-reply@eduassess.local>')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'""",
    done_if='S3_BUCKET_NAME = config(')

# requirements.txt
app('backend/requirements.txt', "\ndjango-storages[s3]>=1.14\n", marker='django-storages')

# ───────────────────────── FRONTEND ─────────────────────────
S = 'frontend/src/'

# QuestionBankPage.jsx
F = S + 'pages/instructor/QuestionBankPage.jsx'
rep(F, r'''import MajorPicker from '../../components/MajorPicker';''',
    r'''import MajorField from '../../components/MajorField';''',
    done_if="import MajorField from")
rep(F, '<MajorPicker', '<MajorField', expect=2, replace_all=True, done_if='<MajorField')
rep(F, r'''const { questions, loading, addQuestion, addQuestions, updateQuestion, removeQuestion } = useQuestionBank();''',
    r'''const { questions, loading, addQuestion, addQuestions, updateQuestion, removeQuestion, removeQuestions } = useQuestionBank();''',
    done_if='removeQuestion, removeQuestions }')
rep(F, r'''const [deletingAll, setDeletingAll] = useState(false);''',
    r'''const [deletingAll, setDeletingAll] = useState(false);
  const [selected, setSelected] = useState(() => new Set());''',
    done_if='const [selected, setSelected]')
rx(F,
   r'// Deletes every question in the currently selected category\..*?(?=\r?\n  // ---------- PDF import flow ----------)',
   r'''// ---------- Multi-select + bulk delete ----------
  const selectedIds = questions.filter((q) => selected.has(q.id)).map((q) => q.id);
  const shownIds = filtered.map((q) => q.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAllShown = () => setSelected((prev) => {
    const next = new Set(prev);
    shownIds.forEach((id) => (allShown ? next.delete(id) : next.add(id)));
    return next;
  });

  const runBulkDelete = async (ids, message) => {
    if (!ids.length || !confirm(message)) return;
    setDeletingAll(true);
    try {
      await removeQuestions(ids);
      setSelected(new Set());
    } catch (err) {
      alert(apiError(err, 'Failed to delete questions.'));
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDeleteSelected = () => runBulkDelete(
    selectedIds,
    `Delete ${selectedIds.length} selected question(s)?\n\n` +
    `They will also be removed from any exam that includes them. This cannot be undone.`
  );

  const handleDeleteAllInCategory = () => {
    if (filter === 'All' || categoryQuestions.length === 0) return;
    const count = categoryQuestions.length;
    return runBulkDelete(
      categoryQuestions.map((q) => q.id),
      `Delete ALL ${count} ${filter} question${count === 1 ? '' : 's'}?\n\n` +
      `They will also be removed from any exam that includes them. This cannot be undone.`
    );
  };
''',
   done_if='const runBulkDelete = async')
rep(F, r'''{filter !== 'All' && categoryQuestions.length > 0 && (''',
    r'''{selectedIds.length > 0 && (
                <>
                  <button
                    className="inst-btn inst-btn-secondary inst-btn-sm"
                    onClick={handleDeleteSelected}
                    disabled={deletingAll}
                    style={{ color: 'var(--inst-danger)', borderColor: 'var(--inst-danger)' }}
                  >
                    <Trash2 size={13} /> {deletingAll ? 'Deleting...' : `Delete selected (${selectedIds.length})`}
                  </button>
                  <button className="inst-btn inst-btn-secondary inst-btn-sm" onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </>
              )}
              {filter !== 'All' && categoryQuestions.length > 0 && (''',
    done_if='Delete selected (${selectedIds.length})')
rep(F, r'''<th style={{ width: 44 }}>#</th>''',
    r'''<th style={{ width: 36 }}>
                    <input type="checkbox" checked={allShown} onChange={toggleAllShown} title="Select all shown" />
                  </th>
                  <th style={{ width: 44 }}>#</th>''',
    done_if='onChange={toggleAllShown}')
rep(F, r'''<td style={{ fontSize: 12.5, color: 'var(--inst-text-muted)', fontWeight: 600 }}>{idx + 1}</td>''',
    r'''<td>
                      <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleOne(q.id)} />
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--inst-text-muted)', fontWeight: 600 }}>{idx + 1}</td>''',
    done_if='onChange={() => toggleOne(q.id)}')

# ExamBuilderPage.jsx
F = S + 'pages/instructor/ExamBuilderPage.jsx'
rep(F, r'''import MajorPicker from '../../components/MajorPicker';''',
    r'''import MajorField from '../../components/MajorField';''',
    done_if='import MajorField from')
rep(F, '<MajorPicker', '<MajorField', done_if='<MajorField')

# SettingsPage.jsx
F = S + 'pages/admin/SettingsPage.jsx'
rep(F, 'min={5}', 'min={1}', done_if='min={1}')
rep(F, r'''label: 'Email Notifications',''', r'''label: 'Announcements',''', done_if="label: 'Announcements',")
rep(F, r'''desc: 'Send system emails for registrations and results',''',
    r'''desc: 'Show announcements to students and let instructors post them',''',
    done_if='Show announcements to students')

# AccessControlPage.jsx
F = S + 'pages/admin/AccessControlPage.jsx'
rep(F, r'''label: 'View Reports',''', r'''label: 'Student Monitor',''', done_if="label: 'Student Monitor',")
rep(F, "desc: 'Performance analytics and student monitoring'",
    "desc: 'Monitor student performance and exam attempts'",
    done_if='Monitor student performance and exam attempts')

# AdminLayout.jsx
F = S + 'pages/admin/AdminLayout.jsx'
rep(F, r'''label: 'Reports',''', r'''label: 'Student Monitor',''', done_if="label: 'Student Monitor',")

# ExamConfigPage.jsx
F = S + 'pages/admin/ExamConfigPage.jsx'
rep(F, '  shuffleChoices: false,\n', '', done_if=None)
rx(F,
   r'\r?\n[ \t]*<div className="toggle-row">\s*<div className="toggle-info">\s*<h4>Shuffle Answer Choices</h4>.*?</label>\s*</div>',
   '', done_if='__never__')
rep(F, r'''<h4>Allow Answer Review</h4>''', r'''<h4>Show Answer Explanations</h4>''',
    done_if='<h4>Show Answer Explanations</h4>')
rep(F, r'''<p>Students can review their answers before submitting</p>''',
    r'''<p>Students can view the answer explanations</p>''',
    done_if='Students can view the answer explanations')
rep(F, 'min={1}', 'min={0}', done_if='min={0}')
rx(F, r'(Max Attempts per Student)(\s*)</label>',
   lambda m: m.group(1) + '\n                    <span className="form-label-sub">· 0 = unlimited</span>' + m.group(2) + '</label>',
   done_if='0 = unlimited</span>')
rep(F, r'''{ label: 'Max Attempts', value: config.maxAttempts },''',
    r'''{ label: 'Max Attempts', value: config.maxAttempts === 0 ? 'Unlimited' : config.maxAttempts },''',
    done_if="config.maxAttempts === 0 ? 'Unlimited'")

# ExamSelectionPage.jsx
F = S + 'pages/user/ExamSelectionPage.jsx'
rep(F, r'''import { BookOpen, Clock, FileText, Zap, ChevronRight, BarChart2, GraduationCap } from 'lucide-react';''',
    r'''import { BookOpen, Clock, FileText, Zap, ChevronRight, BarChart2, GraduationCap, ClipboardCheck } from 'lucide-react';''',
    done_if='GraduationCap, ClipboardCheck }')
rep(F, r'''navigate('/dashboard/exam', {''',
    r'''const attemptLimit = examConfig?.maxAttempts ?? 1;
    if (attemptLimit > 0 && (matchingExam.attempts_used ?? 0) >= attemptLimit) {
      alert(`You have already used your ${attemptLimit} attempt(s) for this exam.`);
      return;
    }

    navigate('/dashboard/exam', {''',
    done_if='const attemptLimit = examConfig')
rep(F, r'''const latest = (history || []).find((h) => h.short === exam.short);''',
    r'''const latest = (history || []).find((h) => h.short === exam.short);
            const limit = examConfig?.maxAttempts ?? 1;
            const used = matchingExam?.attempts_used ?? 0;
            const locked = !!matchingExam && limit > 0 && used >= limit;''',
    done_if='const locked = !!matchingExam')
rx(F, r'</div>(\s*)\{/\* Topics \*/\}',
   lambda m: ('''  <div className="exam-sel-meta-row">
                    <ClipboardCheck size={14} />
                    <span>
                      Attempts: <strong>{matchingExam ? `${used} / ${limit === 0 ? '∞' : limit}` : '—'}</strong>
                    </span>
                  </div>
                </div>''' + m.group(1) + '{/* Topics */}'),
   done_if='<ClipboardCheck size={14} />')
rep(F, r'''disabled={!matchingExam}''', r'''disabled={!matchingExam || locked}''', done_if='disabled={!matchingExam || locked}')
rep(F, r'''style={!matchingExam ? {''', r'''style={(!matchingExam || locked) ? {''', done_if='style={(!matchingExam || locked)')
rep(F, "? 'Select Your Major First'",
    "? 'Select Your Major First'\n                      : locked\n                        ? 'Attempt Limit Reached'",
    done_if="'Attempt Limit Reached'")

# ResultsPage.jsx  ("Show Answer Explanations" toggle)
F = S + 'pages/user/ResultsPage.jsx'
rep(F, r'''const [fetchedState, setFetchedState] = useState(null);''',
    r'''// "Show Answer Explanations" setting (admin > Exam Config). Naka-off = walang explanation text.
  const [allowExplanations, setAllowExplanations] = useState(false);
  useEffect(() => {
    examApi.getExamConfig()
      .then((c) => setAllowExplanations(!!c?.allowReview))
      .catch(() => {});
  }, []);

  const [fetchedState, setFetchedState] = useState(null);''',
    done_if='const [allowExplanations, setAllowExplanations]')
rep(F, r'''const exp = (choiceExps[ci] || '').trim();''',
    r'''const exp = allowExplanations ? (choiceExps[ci] || '').trim() : '';''',
    done_if='const exp = allowExplanations ?')
rep(F, r''') : isTheCorrect && q.explanation ? (''',
    r''') : isTheCorrect && allowExplanations && q.explanation ? (''',
    done_if='isTheCorrect && allowExplanations && q.explanation')


# ───────────────────────── ENGINE ─────────────────────────

def conv(s, crlf):
    # convert only bare \n (text captured from the file may already contain \r\n)
    return re.sub(r'(?<!\r)\n', '\r\n', s) if crlf else s


def process(root, path, edits):
    p = root / path
    if not p.exists():
        return [('FAIL', path, 'file not found')]
    try:
        text = p.read_bytes().decode('utf-8')
    except UnicodeDecodeError:
        return [('FAIL', path, 'not UTF-8 (maybe UTF-16). Make this change by hand.')]
    crlf = '\r\n' in text
    out, changed = [], False

    for e in edits:
        op = e['op']
        label = (e.get('old') or e.get('pattern') or e.get('marker') or '')[:55].replace('\n', ' ').replace('\r', '')
        try:
            if op == 'append':
                if e['marker'] in text:
                    out.append(('SKIP', path, 'already applied: ' + label)); continue
                if not text.endswith('\n'):
                    text += '\r\n' if crlf else '\n'
                text += conv(e['new'].lstrip('\n') if text.endswith('\n\n') else e['new'], crlf)
                changed = True
                out.append(('OK', path, 'appended: ' + label)); continue

            done = e.get('done_if')
            if done and conv(done, crlf) in text:
                out.append(('SKIP', path, 'already applied: ' + label)); continue

            if op in ('replace', 'replace_all'):
                old, new = conv(e['old'], crlf), conv(e['new'], crlf)
                n = text.count(old)
                if n == 0 and new == '':
                    out.append(('SKIP', path, 'already removed: ' + label)); continue
                if n != e['expect']:
                    out.append(('FAIL', path, f'expected {e["expect"]} match, found {n}: {label}')); continue
                text = text.replace(old, new)
            else:  # regex
                pat = re.compile(e['pattern'], re.S)
                new = e['new']
                def repl(m, new=new):
                    s = new(m) if callable(new) else new
                    return conv(s, crlf)
                text, n = pat.subn(repl, text)
                if n == 0 and e['new'] == '':
                    out.append(('SKIP', path, 'already removed: ' + label)); continue
                if n != e['expect']:
                    out.append(('FAIL', path, f'expected {e["expect"]} match, found {n}: {label}')); continue
            changed = True
            out.append(('OK', path, label))
        except Exception as ex:  # noqa
            out.append(('FAIL', path, f'{type(ex).__name__}: {ex} ({label})'))

    if changed:
        bak = p.with_suffix(p.suffix + '.bak')
        if not bak.exists():
            shutil.copyfile(p, bak)
        p.write_bytes(text.encode('utf-8'))
    return out


def main():
    if len(sys.argv) != 2:
        print(__doc__); sys.exit(1)
    root = Path(sys.argv[1]).resolve()
    if not (root / 'backend').is_dir() or not (root / 'frontend').is_dir():
        print(f'"{root}" does not contain backend/ and frontend/. Pass the EDAssess2 root folder.')
        sys.exit(1)

    by_file = {}
    for e in E:
        by_file.setdefault(e['file'], []).append(e)

    counts = {'OK': 0, 'SKIP': 0, 'FAIL': 0}
    for path, edits in by_file.items():
        for status, f, msg in process(root, path, edits):
            counts[status] += 1
            print(f'[{status:4}] {f}  —  {msg}')
    print(f"\nDone: {counts['OK']} applied, {counts['SKIP']} already applied, {counts['FAIL']} FAILED")
    if counts['FAIL']:
        print('Failed edits were NOT applied. See README.md "If an edit fails" for the manual steps.')
        sys.exit(2)


if __name__ == '__main__':
    main()
