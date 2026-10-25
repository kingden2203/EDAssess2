# backend/modules/views.py
from urllib.parse import quote

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, parsers, serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.activity import log_activity
from accounts.models import User, SystemSettings, department_of_major
from accounts.permissions import (
    IsInstructor, CanViewReviewModules, apply_dept_scope, apply_major_scope, is_super_admin,
)
from .models import Module, Announcement
from .serializers import ModuleSerializer, AnnouncementSerializer


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Staff (admin/instructor) ang puwedeng mag-upload/delete anumang oras.
    Para sa read (GET), kailangan pa ring naka-on ang 'viewReviewModules'
    toggle para sa role ng humihiling.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return CanViewReviewModules().has_permission(request, view)
        return request.user.is_staff


class ModuleListCreateView(generics.ListCreateAPIView):
    """GenEd/ProfEd modules (department=None) = shared sa lahat.
    Major modules (department set) = makikita lang ng kaparehas na department.
    Super admin lang ang nakakakita ng lahat."""
    serializer_class = ModuleSerializer
    permission_classes = [IsAdminOrReadOnly]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get_queryset(self):
        qs = apply_dept_scope(Module.objects.all(), self.request.user)
        return apply_major_scope(qs, self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}

    def perform_create(self, serializer):
        user = self.request.user
        category = serializer.validated_data.get('category')
        major = serializer.validated_data.get('major') or None

        department = None
        if category == 'Major':
            if user.role == User.ROLE_INSTRUCTOR and user.major:
                major = user.major  # naka-lock sa major ng instructor
            if major:
                department = department_of_major(major)
                if user.department and department != user.department:
                    raise serializers.ValidationError(
                        {'major': f'{major} is not a {user.department} major.'}
                    )
            elif is_super_admin(user):
                chosen = str(self.request.data.get('department') or '').strip().upper()
                department = chosen if chosen in dict(User.DEPARTMENT_CHOICES) else None
            else:
                department = user.department
        else:
            major = None

        upload = serializer.validated_data.get('file')
        module = serializer.save(
            uploaded_by=user, department=department, major=major,
            size=getattr(upload, 'size', 0) or 0,
        )
        log_activity(
            self.request, 'module.upload',
            f'Uploaded review module "{module.title}" ({module.category}'
            f'{", " + module.major if module.major else (", " + module.department if module.department else "")})',
            category='modules', department=module.department or user.department,
        )


class ModuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ModuleSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        qs = Module.objects.all()

        if is_super_admin(user):
            return qs
        if self.request.method in permissions.SAFE_METHODS:
            return apply_major_scope(apply_dept_scope(qs, user), user)

        if user.role == User.ROLE_ADMIN:
            return qs.filter(Q(department=user.department) | Q(uploaded_by__department=user.department))
        return qs.filter(uploaded_by=user)

    def get_serializer_context(self):
        return {'request': self.request}

    def perform_update(self, serializer):
        module = serializer.save()
        log_activity(
            self.request, 'module.update', f'Updated review module "{module.title}"',
            category='modules', department=module.department,
        )

    def perform_destroy(self, instance):
        title, dept = instance.title, instance.department
        instance.delete()
        log_activity(
            self.request, 'module.delete', f'Deleted review module "{title}"',
            category='modules', department=dept,
        )


class ModuleDownloadView(APIView):
    """GET /modules/<id>/download -> { "url": "<signed link>", "file_name": "..." }"""
    permission_classes = [IsAdminOrReadOnly]

    def get(self, request, pk):
        qs = apply_major_scope(apply_dept_scope(Module.objects.all(), request.user), request.user)
        module = get_object_or_404(qs, pk=pk)

        gone = {'detail': 'This file is no longer available. Please ask your instructor to upload it again.'}
        if not module.file:
            return Response(gone, status=404)

        storage = module.file.storage
        name = module.file.name
        try:
            exists = storage.exists(name)
        except Exception:
            exists = True
        if not exists:
            return Response(gone, status=404)

        disposition = "attachment; filename*=UTF-8''" + quote(module.file_name or 'module')
        try:
            url = storage.url(name, parameters={'ResponseContentDisposition': disposition}, expire=300)
        except TypeError:
            url = storage.url(name)
        if url.startswith('/'):
            url = request.build_absolute_uri(url)

        return Response({'url': url, 'file_name': module.file_name})


class AnnouncementListCreateView(generics.ListCreateAPIView):
    """
    GET — bukas sa kahit sinong naka-login. Kapag naka-OFF ang 'Announcements' sa Settings
        (super admin), walang makikita ang students.
    POST — instructor lang; hindi puwedeng mag-post kapag naka-OFF.
    """
    serializer_class = AnnouncementSerializer

    def get_queryset(self):
        qs = Announcement.objects.all()
        if self.request.user.role == User.ROLE_STUDENT and not SystemSettings.load().emailNotifications:
            return qs.none()
        return qs

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsInstructor()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if not SystemSettings.load().emailNotifications:
            raise PermissionDenied('Announcements are turned off by the admin.')
        serializer.save(posted_by=self.request.user)


class AnnouncementDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Announcement.objects.all()
    serializer_class = AnnouncementSerializer
    permission_classes = [IsInstructor]