# backend/accounts/models.py
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


# ── Majors per department ──────────────────────────────────────────────────
# Student: isa lang ang major (pinipili sa registration). Major exams/questions
# ay naka-tag sa isa sa mga ito, at ang department ay hinuhulaan mula sa major.
MAJORS_BY_DEPARTMENT = {
    'CTE': [
        'Mathematics',
        'English',
        'Filipino',
        'Science',
        'Social Studies',
        'Physical Education',
    ],
    'CIT': [
        'Automotive Technology',
        'Computer Programming',
        'Construction/Civil Technology',
        'Electrical Technology',
        'Electronics Technology',
        'Food Services Management',
        'Mechanical Technology',
        'Industrial Arts',
    ],
}

MAJOR_CHOICES = tuple(
    (m, m) for majors in MAJORS_BY_DEPARTMENT.values() for m in majors
)


def majors_for(department):
    return MAJORS_BY_DEPARTMENT.get(department, [])


def department_of_major(major):
    for dept, majors in MAJORS_BY_DEPARTMENT.items():
        if major in majors:
            return dept
    return None


class UserManager(BaseUserManager):
    def create_user(self, email, name, password=None, role='user', department=None, major=None):
        if not email:
            raise ValueError('Users must have an email address.')
        if not name:
            raise ValueError('Users must have a name.')

        user = self.model(
            email=self.normalize_email(email), name=name, role=role,
            department=department, major=major or None,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name, password=None):
        user = self.create_user(email=email, name=name, password=password, role='admin')
        user.is_staff = True
        user.is_superuser = True
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_ADMIN = 'admin'
    ROLE_INSTRUCTOR = 'instructor'
    ROLE_STUDENT = 'user'

    ROLE_CHOICES = (
        (ROLE_ADMIN, 'Admin'),
        (ROLE_INSTRUCTOR, 'Instructor'),
        (ROLE_STUDENT, 'Student'),
    )

    DEPT_CIT = 'CIT'
    DEPT_CTE = 'CTE'
    DEPARTMENT_CHOICES = (
        (DEPT_CIT, 'College of Industrial Technology'),
        (DEPT_CTE, 'College of Teacher Education'),
    )

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STUDENT)

    # Student/Instructor: CIT o CTE.
    # Admin: CIT/CTE = department admin; walang laman = super admin.
    department = models.CharField(max_length=10, choices=DEPARTMENT_CHOICES, blank=True, null=True)

    # Student lang: ang major niya (tugma sa department). Instructor/admin: walang laman.
    major = models.CharField(max_length=40, choices=MAJOR_CHOICES, blank=True, null=True)

    # Existing accounts stay True. Bagong self-registered students ay False hanggang ma-verify.
    email_verified = models.BooleanField(default=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    def __str__(self):
        return f'{self.name} <{self.email}> ({self.role})'

    @property
    def is_super_admin(self):
        # Admin na walang department = super admin
        return self.role == self.ROLE_ADMIN and not self.department


def default_role_permissions():
    return {
        'admin': {
            'viewDashboard': True,
            'manageUsers': True,
            'configureExams': True,
            'viewReports': True,
            'manageAccess': True,
            'manageSettings': True,
            'takeExams': False,
            'viewReviewModules': True,
        },
        'instructor': {
            'viewDashboard': True,
            'manageUsers': False,
            'configureExams': True,
            'viewReports': True,
            'manageAccess': False,
            'manageSettings': False,
            'takeExams': False,
            'viewReviewModules': True,
        },
        'user': {
            'viewDashboard': True,
            'manageUsers': False,
            'configureExams': False,
            'viewReports': False,
            'manageAccess': False,
            'manageSettings': False,
            'takeExams': True,
            'viewReviewModules': True,
        },
    }


class RolePermission(models.Model):
    """Singleton row — laging pk=1. Role permission matrix dito nakatago."""
    permissions = models.JSONField(default=default_role_permissions)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Role Permissions"
        verbose_name_plural = "Role Permissions"

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
        return "Role Permission Matrix"


class SystemSettings(models.Model):
    """Singleton row — laging pk=1. Global platform settings dito nakatago."""
    systemName = models.CharField(max_length=255, default='EduAssess')
    institution = models.CharField(max_length=255, default='PRMSU — Iba Campus')
    department = models.CharField(max_length=255, default='College of Teacher Education')
    supportEmail = models.EmailField(default='support@prmsu.edu.ph')

    maintenanceMode = models.BooleanField(default=False)
    registrationOpen = models.BooleanField(default=True)
    emailNotifications = models.BooleanField(default=True)
    auditLogging = models.BooleanField(default=True)

    sessionTimeout = models.PositiveIntegerField(default=60)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

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
        return "System Settings"


# Mga permission na puwedeng galawin ng department admin para sa sarili niyang department.
# Ang super admin ang nagtatakda ng "ceiling" (RolePermission); ang department admin
# ay puwede lang mag-off ng mga ito para sa instructors/students ng department niya.
DEPT_CONTROLLABLE = {
    'instructor': ['viewDashboard', 'configureExams', 'viewReports', 'viewReviewModules'],
    'user': ['viewDashboard', 'takeExams', 'viewReviewModules'],
}


def default_department_permissions():
    return {role: {key: True for key in keys} for role, keys in DEPT_CONTROLLABLE.items()}


class DepartmentPermission(models.Model):
    """Isang row per department (CIT / CTE). Default: lahat naka-on (sakop pa rin ng ceiling ng super admin)."""
    department = models.CharField(max_length=10, choices=User.DEPARTMENT_CHOICES, unique=True)
    permissions = models.JSONField(default=default_department_permissions)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Department Permissions"
        verbose_name_plural = "Department Permissions"

    @classmethod
    def load(cls, department):
        obj, _created = cls.objects.get_or_create(department=department)
        return obj

    def __str__(self):
        return f"{self.department} Permissions"


class ActivityLog(models.Model):
    """
    Audit trail. Super admin lang ang may access.
    Naka-snapshot ang pangalan/email/role ng actor para mababasa pa rin
    ang log kahit ma-delete na ang account.
    `department` = department na apektado ng action (None = global).
    """
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs',
    )
    actor_name = models.CharField(max_length=255, blank=True)
    actor_email = models.CharField(max_length=255, blank=True)
    actor_role = models.CharField(max_length=20, blank=True)
    actor_department = models.CharField(max_length=10, blank=True, null=True)

    department = models.CharField(max_length=10, blank=True, null=True, db_index=True)
    category = models.CharField(max_length=30, db_index=True)
    action = models.CharField(max_length=60)
    description = models.TextField()
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'[{self.created_at:%Y-%m-%d %H:%M}] {self.actor_email or "system"} — {self.action}'


class EmailVerification(models.Model):
    """Isang active 6-digit code per user. Naka-hash ang code."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='email_verification')
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    last_sent_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f'Verification for {self.user.email}'
