# backend/exams/models.py
from django.conf import settings
from django.db import models
from accounts.models import User, MAJOR_CHOICES

# Para sa Major lang: 'CIT' | 'CTE' | 'BOTH'.
# Luma na ito (dati, per-department lang). Ang bagong Major exams/questions ay naka-tag
# sa isang `major`, at ang `department` ay hinuhulaan mula roon. Iniwan ang 'BOTH'
# para hindi masira ang mga lumang record.
MAJOR_TARGET_CHOICES = tuple(User.DEPARTMENT_CHOICES) + (('BOTH', 'Both CIT and CTE'),)

# Max na bilang ng questions sa iisang exam
MAX_QUESTIONS_PER_EXAM = 180


class Question(models.Model):
    QUESTION_TYPES = (
        ('MCQ', 'Multiple Choice'),
        ('TF', 'True / False'),
    )
    CATEGORY_CHOICES = (
        ('GenEd', 'General Education'),
        ('ProfEd', 'Professional Education'),
        ('Major', 'Major / Specialization'),
    )
    DIFFICULTY_CHOICES = (
        ('Easy', 'Easy'),
        ('Medium', 'Medium'),
        ('Hard', 'Hard'),
    )

    text = models.TextField()
    question_type = models.CharField(max_length=10, choices=QUESTION_TYPES, default='MCQ')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='GenEd')
    subject = models.CharField(max_length=255, blank=True)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='Medium')
    explanation = models.TextField(blank=True)
    points = models.IntegerField(default=1)
    # Aplikable lang sa Major. Blank/null sa GenEd at ProfEd.
    department = models.CharField(
        max_length=10, choices=MAJOR_TARGET_CHOICES, blank=True, null=True
    )
    # Aplikable lang sa Major: Mathematics, English, Automotive Technology, atbp.
    major = models.CharField(max_length=40, choices=MAJOR_CHOICES, blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_questions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.text[:50]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='choices')
    text = models.TextField()
    is_correct = models.BooleanField(default=False)
    # Bakit tama/mali ang choice na ito. Hiwalay sa Question.explanation. Optional.
    explanation = models.TextField(blank=True)

    def __str__(self):
        return self.text[:50]


class Exam(models.Model):
    CATEGORY_CHOICES = (
        ('GenEd', 'General Education'),
        ('ProfEd', 'Professional Education'),
        ('Major', 'Major / Specialization'),
    )
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='GenEd')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    duration_minutes = models.IntegerField(default=60)
    passing_score = models.IntegerField(default=75)
    is_active = models.BooleanField(default=True)
    questions = models.ManyToManyField(Question, related_name='exams', blank=True)
    # Aplikable lang sa Major exams.
    department = models.CharField(
        max_length=10, choices=MAJOR_TARGET_CHOICES, blank=True, null=True
    )
    # Aplikable lang sa Major exams: makikita lang ng mga student na kapareho ang major.
    major = models.CharField(max_length=40, choices=MAJOR_CHOICES, blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='created_exams'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class ExamAttempt(models.Model):
    CATEGORY_CHOICES = (
        ('GenEd', 'General Education'),
        ('ProfEd', 'Professional Education'),
        ('Major', 'Major / Specialization'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='exam_attempts',
    )

    exam = models.ForeignKey(
        'Exam', null=True, blank=True, on_delete=models.SET_NULL, related_name='attempts'
    )
    exam_type = models.CharField(max_length=20)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    label = models.CharField(max_length=255)

    score = models.PositiveIntegerField()
    total = models.PositiveIntegerField()
    percentage = models.PositiveSmallIntegerField()
    passed = models.BooleanField(default=False)

    time_taken_seconds = models.PositiveIntegerField(default=0)
    auto_submit = models.BooleanField(default=False)

    subject_breakdown = models.JSONField(default=dict)

    # Full snapshot ng {questions, answers} para ma-reload ang ResultsPage.
    detail = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email} — {self.label} — {self.percentage}%'


def default_exam_config():
    # Iniwan para sa mga lumang migration na maaaring tumutukoy dito.
    return {}


class ExamConfig(models.Model):
    """Singleton row — laging pk=1. Global exam settings dito nakatago."""
    genEd = models.PositiveIntegerField(default=120)
    profEd = models.PositiveIntegerField(default=180)
    major = models.PositiveIntegerField(default=180)

    autoSubmit = models.BooleanField(default=True)
    showResults = models.BooleanField(default=True)
    allowReview = models.BooleanField(default=False)
    shuffleQuestions = models.BooleanField(default=True)

    # 0 = unlimited
    maxAttempts = models.PositiveIntegerField(default=1)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Exam Configuration"
        verbose_name_plural = "Exam Configuration"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Global Exam Configuration"


def count_attempts(user, exam):
    """Ilang beses nang nag-submit ang user ng exam na ito."""
    return ExamAttempt.objects.filter(user=user, exam=exam).count()
