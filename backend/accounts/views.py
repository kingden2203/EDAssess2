# backend/accounts/views.py
import logging

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken
from .activity import log_activity
from .emailing import check_code, send_verification_code, seconds_until_resend
from .models import (
    ActivityLog, DEPT_CONTROLLABLE, DepartmentPermission, RolePermission,
    SystemSettings, default_role_permissions, majors_for,
)
from .permissions import (
    IsAdmin, IsSuperAdmin, CanManageUsers, CanManageAccess, CanManageSettings,
    admin_department, effective_permissions, manageable_users,
)
from .serializers import RolePermissionSerializer, SystemSettingsSerializer

User = get_user_model()
logger = logging.getLogger(__name__)


def serialize_user(user):
    """Consistent user shape for all responses."""
    return {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'department': user.department,
        'major': user.major,
        'is_super_admin': user.is_super_admin,
        'status': 'active' if user.is_active else 'inactive',
        'joined': user.date_joined.strftime('%Y-%m-%d'),
    }


def describe_account(u):
    """Readable label para sa activity log: 'Ana <ana@x.com> (CIT Instructor, Mathematics)'."""
    if u.is_super_admin:
        kind = 'Super Admin'
    elif u.role == User.ROLE_ADMIN:
        kind = f'{u.department} Admin'
    elif u.role == User.ROLE_INSTRUCTOR:
        kind = f'{u.department or "no dept"} Instructor' + (f', {u.major}' if u.major else '')
    else:
        kind = f'{u.department or "no dept"} Student' + (f', {u.major}' if u.major else '')
    return f'{u.name} <{u.email}> ({kind})'


def other_super_admin_exists(exclude_pk):
    return (
        User.objects.filter(role=User.ROLE_ADMIN)
        .filter(Q(department__isnull=True) | Q(department=''))
        .exclude(pk=exclude_pk)
        .exists()
    )


def token_response(user, status_code=status.HTTP_200_OK):
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': serialize_user(user),
        },
        status=status_code,
    )


# ── Auth ────────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        sys_settings = SystemSettings.load()
        if sys_settings.maintenanceMode:
            return Response(
                {'message': 'The platform is under maintenance. Please try again later.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not sys_settings.registrationOpen:
            return Response(
                {'message': 'Registration is currently closed.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        name = request.data.get('name', '').strip()
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')
        department = request.data.get('department', '').strip().upper()
        major = str(request.data.get('major', '') or '').strip()

        if not name or not email or not password:
            return Response(
                {'message': 'Name, email, and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if department not in dict(User.DEPARTMENT_CHOICES):
            return Response(
                {'message': 'Please select your college (CIT or CTE).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if major not in majors_for(department):
            return Response(
                {'message': f'Please select your {department} major.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email=email).exists():
            return Response(
                {'message': 'Email is already registered.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            email=email, name=name, password=password, role=User.ROLE_STUDENT,
            department=department, major=major,
        )
        user.email_verified = False
        user.save(update_fields=['email_verified'])

        log_activity(
            request, 'auth.register', f'New student registered (unverified): {describe_account(user)}',
            category='auth', department=user.department, actor=user,
        )

        email_sent = True
        try:
            send_verification_code(user)
        except Exception:
            logger.exception('Failed to send verification email to %s', email)
            email_sent = False

        return Response(
            {'verification_required': True, 'email': email, 'email_sent': email_sent},
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = str(request.data.get('email') or '').strip().lower()
        code = str(request.data.get('code') or '').strip()

        user = User.objects.filter(email=email).first()
        if not user or user.email_verified or not check_code(user, code):
            return Response(
                {'message': 'Invalid or expired code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.email_verified = True
        user.save(update_fields=['email_verified'])

        log_activity(
            request, 'auth.verify_email', f'Email verified: {describe_account(user)}',
            category='auth', department=user.department, actor=user,
        )
        return token_response(user)


class ResendCodeView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = str(request.data.get('email') or '').strip().lower()
        user = User.objects.filter(email=email).first()

        if user and not user.email_verified and seconds_until_resend(user) == 0:
            try:
                send_verification_code(user)
            except Exception:
                logger.exception('Failed to resend verification email to %s', email)

        # Pareho laging sagot para hindi mahulaan kung registered ang email
        return Response(
            {'message': 'If the account exists and is unverified, a new code was sent.'},
            status=status.HTTP_200_OK,
        )


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            raw_email = request.data.get('email') or ''
            raw_password = request.data.get('password') or ''

            email = str(raw_email).strip().lower()
            password = str(raw_password)

            if not email or not password:
                return Response(
                    {'message': 'Email and password are required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.filter(email=email).first()

            if user and user.check_password(password):
                if not user.is_active:
                    log_activity(
                        request, 'auth.login_blocked',
                        f'Login blocked (inactive account): {describe_account(user)}',
                        category='auth', department=user.department, actor=user,
                    )
                    return Response(
                        {'message': 'Account is inactive.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if not user.email_verified:
                    return Response(
                        {
                            'message': 'Please verify your email first.',
                            'code': 'email_unverified',
                            'email': email,
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                # Maintenance mode: admin lang ang puwedeng pumasok
                if SystemSettings.load().maintenanceMode and user.role != User.ROLE_ADMIN:
                    log_activity(
                        request, 'auth.login_blocked',
                        f'Login blocked (maintenance mode): {describe_account(user)}',
                        category='auth', department=user.department, actor=user,
                    )
                    return Response(
                        {'message': 'The platform is under maintenance. Please try again later.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                log_activity(
                    request, 'auth.login', f'Signed in: {describe_account(user)}',
                    category='auth', department=user.department, actor=user,
                )
                return token_response(user)

            log_activity(
                request, 'auth.login_failed', f'Failed login attempt for {email}',
                category='auth', department=user.department if user else None,
            )
            return Response(
                {'message': 'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception as e:
            return Response(
                {'message': f'Server Error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class LogoutView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            log_activity(
                request, 'auth.logout', f'Signed out: {describe_account(request.user)}',
                category='auth',
            )
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response({'message': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'message': 'Logged out.'}, status=status.HTTP_200_OK)


class MeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(serialize_user(request.user), status=status.HTTP_200_OK)

    def patch(self, request):
        """Profile edit: pangalan, email, password. Role at department hindi puwedeng baguhin dito."""
        user = request.user
        name = str(request.data.get('name', user.name)).strip()
        email = str(request.data.get('email', user.email)).strip().lower()
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')

        if not name or not email:
            return Response({'message': 'Name and email are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exclude(pk=user.pk).exists():
            return Response(
                {'message': 'Email is already registered to another account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        changed = []
        if new_password:
            if not user.check_password(current_password):
                return Response({'message': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
            if len(new_password) < 8:
                return Response(
                    {'message': 'New password must be at least 8 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(new_password)
            changed.append('password')

        # Student lang ang puwedeng magpalit ng major dito; dapat tugma sa department niya
        new_major = request.data.get('major')
        if new_major is not None and user.role == User.ROLE_STUDENT:
            new_major = str(new_major).strip()
            if new_major not in majors_for(user.department):
                return Response(
                    {'message': f'Please select a valid {user.department or ""} major.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_major != user.major:
                user.major = new_major
                changed.append('major')

        if name != user.name:
            changed.append('name')
        if email != user.email:
            changed.append('email')

        user.name = name
        user.email = email
        user.save()

        # Staff lang ang nilolog para hindi mapuno ng student profile edits
        if changed and user.role != User.ROLE_STUDENT:
            log_activity(
                request, 'profile.update',
                f'{describe_account(user)} updated own profile ({", ".join(changed)})',
                category='auth',
            )
        return Response(serialize_user(user), status=status.HTTP_200_OK)


class MyPermissionsView(APIView):
    """Sariling permission set ng naka-login (para sa sidebar)."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(effective_permissions(request.user), status=status.HTTP_200_OK)


class SessionConfigView(APIView):
    """Para sa idle auto-logout at announcements flag. Kahit anong naka-login ay puwedeng bumasa."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        s = SystemSettings.load()
        return Response(
            {'sessionTimeout': s.sessionTimeout, 'announcementsEnabled': s.emailNotifications},
            status=status.HTTP_200_OK,
        )


# ── User management ─────────────────────────────────────────────────────────

class AdminUserListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdmin, CanManageUsers]

    def get(self, request):
        users = manageable_users(request.user).order_by('-date_joined')
        return Response({'users': [serialize_user(u) for u in users]}, status=status.HTTP_200_OK)


class AdminCreateUserView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdmin, CanManageUsers]

    def post(self, request):
        scope = admin_department(request.user)  # None = super admin

        name = request.data.get('name', '').strip()
        email = request.data.get('email', '').strip().lower()
        role = request.data.get('role', User.ROLE_INSTRUCTOR)
        password = request.data.get('password', '')
        department = request.data.get('department') or None
        major = str(request.data.get('major') or '').strip()

        if scope:
            # Department admin: instructor lang, at sa sariling department lang
            if role != User.ROLE_INSTRUCTOR:
                return Response(
                    {'message': 'Department admins can only create instructor accounts.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            department = scope

        if not name or not email or not password:
            return Response({'message': 'All fields are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if role not in dict(User.ROLE_CHOICES):
            return Response(
                {'message': f'Invalid role. Must be one of: {[r[0] for r in User.ROLE_CHOICES]}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if department and department not in dict(User.DEPARTMENT_CHOICES):
            return Response({'message': 'Invalid department.'}, status=status.HTTP_400_BAD_REQUEST)

        if role == User.ROLE_INSTRUCTOR and not department:
            return Response(
                {'message': 'Department (CIT or CTE) is required for instructors.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Instructor: kailangan ng major na tugma sa department. Iba: walang major.
        if role == User.ROLE_INSTRUCTOR:
            if major not in majors_for(department):
                return Response(
                    {'message': f"Select the instructor's {department} major."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            major = None

        if User.objects.filter(email=email).exists():
            return Response({'message': 'Email is already registered.'}, status=status.HTTP_400_BAD_REQUEST)

        # Admin na walang department = super admin
        user = User.objects.create_user(
            email=email, name=name, password=password, role=role,
            department=department, major=major,
        )
        user.is_staff = role in (User.ROLE_ADMIN, User.ROLE_INSTRUCTOR)
        user.is_superuser = role == User.ROLE_ADMIN and not department
        user.save()

        log_activity(
            request, 'user.create', f'Created account: {describe_account(user)}',
            category='users', department=user.department,
        )

        return Response({'user': serialize_user(user)}, status=status.HTTP_201_CREATED)


class RolePermissionView(APIView):
    """Super admin lang."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsSuperAdmin, CanManageAccess]

    def get(self, request):
        obj = RolePermission.load()
        return Response(RolePermissionSerializer(obj).data, status=status.HTTP_200_OK)

    def put(self, request):
        incoming = request.data.get('permissions')
        if not isinstance(incoming, dict):
            return Response(
                {'message': "'permissions' must be an object keyed by role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj = RolePermission.load()
        current = obj.permissions or {}
        defaults = default_role_permissions()

        # I-merge lang ang kilalang role/permission keys; booleans lang ang tinatanggap.
        merged = {}
        for role, role_defaults in defaults.items():
            sent = incoming.get(role) if isinstance(incoming.get(role), dict) else {}
            old = current.get(role, {})
            merged[role] = {}
            for key, default_val in role_defaults.items():
                merged[role][key] = bool(sent.get(key, old.get(key, default_val)))

        # Dept admins laging may dashboard
        merged['admin']['viewDashboard'] = True

        changes = []
        for role, keys in merged.items():
            for key, val in keys.items():
                old_val = bool(current.get(role, {}).get(key, defaults[role][key]))
                if old_val != val:
                    changes.append(f'{role}.{key} {"ON" if val else "OFF"}')

        obj.permissions = merged
        obj.save()

        if changes:
            log_activity(
                request, 'access.update',
                f'Updated role permissions ({len(changes)} change(s)): ' + '; '.join(changes),
                category='access',
            )
        return Response(RolePermissionSerializer(obj).data, status=status.HTTP_200_OK)


class DepartmentPermissionView(APIView):
    """
    Per-department access control.
      - Department admin: sariling department lang (automatic).
      - Super admin: kahit alin, via ?department=CIT|CTE.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdmin, CanManageAccess]

    def _department(self, request):
        scope = admin_department(request.user)
        if scope:
            return scope
        raw = request.query_params.get('department') or request.data.get('department') or ''
        dept = str(raw).strip().upper()
        return dept if dept in dict(User.DEPARTMENT_CHOICES) else None

    @staticmethod
    def _payload(obj):
        global_perms = RolePermission.load().permissions
        stored = obj.permissions or {}
        perms, ceiling = {}, {}
        for role, keys in DEPT_CONTROLLABLE.items():
            perms[role] = {k: bool(stored.get(role, {}).get(k, True)) for k in keys}
            ceiling[role] = {k: bool(global_perms.get(role, {}).get(k, False)) for k in keys}
        return {
            'department': obj.department,
            'permissions': perms,
            'ceiling': ceiling,
            'controllable': DEPT_CONTROLLABLE,
            'updated_at': obj.updated_at,
        }

    def get(self, request):
        dept = self._department(request)
        if not dept:
            return Response({'message': 'Specify a department (CIT or CTE).'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self._payload(DepartmentPermission.load(dept)), status=status.HTTP_200_OK)

    def put(self, request):
        dept = self._department(request)
        if not dept:
            return Response({'message': 'Specify a department (CIT or CTE).'}, status=status.HTTP_400_BAD_REQUEST)

        incoming = request.data.get('permissions')
        if not isinstance(incoming, dict):
            return Response(
                {'message': "'permissions' must be an object keyed by role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj = DepartmentPermission.load(dept)
        old = self._payload(obj)['permissions']

        merged, changes = {}, []
        for role, keys in DEPT_CONTROLLABLE.items():
            sent = incoming.get(role) if isinstance(incoming.get(role), dict) else {}
            merged[role] = {}
            for key in keys:
                val = bool(sent.get(key, old[role][key]))
                merged[role][key] = val
                if val != old[role][key]:
                    changes.append(f'{role}.{key} {"ON" if val else "OFF"}')

        obj.permissions = merged
        obj.save()

        if changes:
            log_activity(
                request, 'access.department_update',
                f'Updated {dept} access control ({len(changes)} change(s)): ' + '; '.join(changes),
                category='access', department=dept,
            )
        return Response(self._payload(obj), status=status.HTTP_200_OK)


class SystemSettingsView(APIView):
    """Super admin lang."""
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsSuperAdmin, CanManageSettings]

    def get(self, request):
        obj = SystemSettings.load()
        return Response(SystemSettingsSerializer(obj).data, status=status.HTTP_200_OK)

    def put(self, request):
        obj = SystemSettings.load()
        fields = [f for f in SystemSettingsSerializer.Meta.fields if f != 'updated_at']
        before = {f: getattr(obj, f) for f in fields}

        serializer = SystemSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        obj.refresh_from_db()

        changes = [
            f'{f}: {before[f]} → {getattr(obj, f)}'
            for f in fields if before[f] != getattr(obj, f)
        ]
        if changes:
            # force=True: i-record kahit ang mismong pag-off ng audit logging
            log_activity(
                request, 'settings.update', 'Updated system settings — ' + '; '.join(changes),
                category='settings', force=True,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminUserDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdmin, CanManageUsers]

    def get_target(self, request, pk):
        return manageable_users(request.user).filter(pk=pk).first()

    def get(self, request, pk):
        user = self.get_target(request, pk)
        if not user:
            return Response({'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_user(user), status=status.HTTP_200_OK)

    def put(self, request, pk):
        user = self.get_target(request, pk)
        if not user:
            return Response({'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        scope = admin_department(request.user)

        name = str(request.data.get('name', user.name)).strip()
        email = str(request.data.get('email', user.email)).strip().lower()
        password = request.data.get('password', '')

        if scope:
            # Department admin: hindi puwedeng baguhin ang role/department
            role = user.role
            department = scope
        else:
            role = request.data.get('role', user.role)
            department = request.data.get('department', user.department) or None

        if role not in dict(User.ROLE_CHOICES):
            return Response(
                {'message': f'Invalid role. Must be one of: {[r[0] for r in User.ROLE_CHOICES]}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if department and department not in dict(User.DEPARTMENT_CHOICES):
            return Response({'message': 'Invalid department.'}, status=status.HTTP_400_BAD_REQUEST)

        if role == User.ROLE_INSTRUCTOR and not department:
            return Response(
                {'message': 'Department (CIT or CTE) is required for instructors.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Major: instructor = required; student = hindi ginagalaw dito; admin = wala
        if role == User.ROLE_INSTRUCTOR:
            major = str(request.data.get('major', user.major) or '').strip()
            if major not in majors_for(department):
                return Response(
                    {'message': "Select the instructor's major."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif role == User.ROLE_STUDENT:
            major = user.major
        else:
            major = None

        if User.objects.filter(email=email).exclude(pk=user.pk).exists():
            return Response(
                {'message': 'Email is already registered to another account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Huwag payagang mawala ang huling super admin
        if user.is_super_admin and (role != User.ROLE_ADMIN or department) and not other_super_admin_exists(user.pk):
            return Response(
                {'message': 'You cannot change the last super admin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        before_label = describe_account(user)
        changes = []
        if name != user.name:
            changes.append('name')
        if email != user.email:
            changes.append('email')
        if role != user.role:
            changes.append(f'role {user.role} → {role}')
        if (department or None) != (user.department or None):
            changes.append(f'department {user.department or "none"} → {department or "none"}')
        if (major or None) != (user.major or None):
            changes.append(f'major {user.major or "none"} → {major or "none"}')
        if password:
            changes.append('password reset')

        user.name = name
        user.email = email
        user.role = role
        user.department = department
        user.major = major or None
        user.is_staff = role in (User.ROLE_ADMIN, User.ROLE_INSTRUCTOR)
        user.is_superuser = role == User.ROLE_ADMIN and not department

        if password:
            user.set_password(password)

        user.save()

        if changes:
            log_activity(
                request, 'user.update',
                f'Updated account {before_label} — ' + ', '.join(changes),
                category='users', department=user.department,
            )
        return Response({'user': serialize_user(user)}, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        user = self.get_target(request, pk)
        if not user:
            return Response({'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.pk == request.user.pk:
            return Response({'message': 'You cannot delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.is_super_admin and not other_super_admin_exists(user.pk):
            return Response({'message': 'You cannot delete the last super admin.'}, status=status.HTTP_400_BAD_REQUEST)

        label = describe_account(user)
        dept = user.department
        user.delete()

        log_activity(
            request, 'user.delete', f'Deleted account: {label}',
            category='users', department=dept,
        )
        return Response({'message': 'User deleted.'}, status=status.HTTP_200_OK)


class AdminUserStatusView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdmin, CanManageUsers]

    def patch(self, request, pk):
        user = manageable_users(request.user).filter(pk=pk).first()
        if not user:
            return Response({'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status not in ('active', 'inactive'):
            return Response(
                {'message': "Status must be 'active' or 'inactive'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.pk == request.user.pk and new_status == 'inactive':
            return Response(
                {'message': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = (new_status == 'active')
        user.save()

        log_activity(
            request, 'user.status',
            f'{"Activated" if user.is_active else "Deactivated"} account: {describe_account(user)}',
            category='users', department=user.department,
        )
        return Response(serialize_user(user), status=status.HTTP_200_OK)


# ── Activity log (super admin lang) ─────────────────────────────────────────

def serialize_log(entry):
    return {
        'id': entry.id,
        'actor_name': entry.actor_name or 'System',
        'actor_email': entry.actor_email,
        'actor_role': entry.actor_role,
        'actor_department': entry.actor_department,
        'actor_is_super': entry.actor_role == User.ROLE_ADMIN and not entry.actor_department,
        'department': entry.department,
        'category': entry.category,
        'action': entry.action,
        'description': entry.description,
        'ip_address': entry.ip_address,
        'created_at': entry.created_at.isoformat(),
    }


class ActivityLogView(APIView):
    """
    GET /admin/activity-log/
    Query params: department (CIT|CTE|GLOBAL), category, actor_role, q,
                  date_from, date_to (YYYY-MM-DD), page, page_size
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        params = request.query_params
        qs = ActivityLog.objects.all()

        dept = params.get('department', '').strip().upper()
        if dept in dict(User.DEPARTMENT_CHOICES):
            qs = qs.filter(department=dept)
        elif dept == 'GLOBAL':
            qs = qs.filter(Q(department__isnull=True) | Q(department=''))

        category = params.get('category', '').strip()
        if category:
            qs = qs.filter(category=category)

        actor_role = params.get('actor_role', '').strip()
        if actor_role in dict(User.ROLE_CHOICES):
            qs = qs.filter(actor_role=actor_role)

        search = params.get('q', '').strip()
        if search:
            qs = qs.filter(
                Q(actor_name__icontains=search)
                | Q(actor_email__icontains=search)
                | Q(description__icontains=search)
                | Q(action__icontains=search)
            )

        date_from = parse_date(params.get('date_from', '') or '')
        date_to = parse_date(params.get('date_to', '') or '')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        try:
            page = max(int(params.get('page', 1)), 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(max(int(params.get('page_size', 20)), 1), 100)
        except (TypeError, ValueError):
            page_size = 20

        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]

        categories = sorted(
            ActivityLog.objects.order_by().values_list('category', flat=True).distinct()
        )

        return Response({
            'results': [serialize_log(r) for r in rows],
            'count': total,
            'page': page,
            'page_size': page_size,
            'total_pages': max((total + page_size - 1) // page_size, 1),
            'categories': categories,
        }, status=status.HTTP_200_OK)
