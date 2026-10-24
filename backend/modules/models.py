# backend/modules/models.py
from django.conf import settings
from django.db import models
from accounts.models import User, MAJOR_CHOICES


class Module(models.Model):
    CATEGORY_CHOICES = (
        ('GenEd', 'General Education'),
        ('ProfEd', 'Professional Education'),
        ('Major', 'Major / Specialization'),
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    department = models.CharField(
        max_length=10, choices=User.DEPARTMENT_CHOICES, blank=True, null=True
    )
    # Optional. Major modules na may major tag = para lang sa students ng major na iyon.
    # Walang tag = bukas sa buong department (gaya ng dati).
    major = models.CharField(max_length=40, choices=MAJOR_CHOICES, blank=True, null=True)
    file = models.FileField(upload_to='review_modules/', max_length=255)
    # Naka-save ang laki para hindi na tatawag sa storage (S3) sa bawat listing.
    size = models.PositiveBigIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_modules',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title

    @property
    def file_name(self):
        return self.file.name.split('/')[-1] if self.file else ''

    @property
    def file_size(self):
        if self.size:
            return self.size
        try:
            return self.file.size
        except Exception:  # nawawalang file (hal. lumang uploads sa Render disk) = 0, hindi 500
            return 0


class Announcement(models.Model):
    AUDIENCE_CHOICES = (
        ('All Students', 'All Students'),
        ('GenEd Students', 'GenEd Students'),
        ('ProfEd Students', 'ProfEd Students'),
        ('Major Students', 'Major Students'),
    )

    title = models.CharField(max_length=255)
    body = models.TextField()
    audience = models.CharField(max_length=30, choices=AUDIENCE_CHOICES, default='All Students')
    pinned = models.BooleanField(default=False)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='announcements',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-pinned', '-created_at']

    def __str__(self):
        return self.title
