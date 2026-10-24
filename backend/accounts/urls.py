# backend/accounts/urls.py
from django.urls import path
from .views import (
    LoginView,
    RegisterView,
    VerifyEmailView,
    ResendCodeView,
    LogoutView,
    MeView,
    MyPermissionsView,
    SessionConfigView,
    AdminUserListView,
    AdminCreateUserView,
    AdminUserDetailView,
    AdminUserStatusView,
    RolePermissionView,
    SystemSettingsView,
    ActivityLogView,
    DepartmentPermissionView,
)

urlpatterns = [
    path('auth/login', LoginView.as_view(), name='login'),
    path('auth/login/', LoginView.as_view()),
    path('auth/register', RegisterView.as_view(), name='register'),
    path('auth/register/', RegisterView.as_view()),
    path('auth/verify-email', VerifyEmailView.as_view(), name='verify-email'),
    path('auth/verify-email/', VerifyEmailView.as_view()),
    path('auth/resend-code', ResendCodeView.as_view(), name='resend-code'),
    path('auth/resend-code/', ResendCodeView.as_view()),
    path('auth/logout', LogoutView.as_view(), name='logout'),
    path('auth/logout/', LogoutView.as_view()),
    path('auth/me', MeView.as_view(), name='me'),
    path('auth/me/', MeView.as_view()),
    path('auth/my-permissions', MyPermissionsView.as_view(), name='my-permissions'),
    path('auth/my-permissions/', MyPermissionsView.as_view()),
    path('auth/session-config', SessionConfigView.as_view(), name='session-config'),
    path('auth/session-config/', SessionConfigView.as_view()),

    path('admin/users', AdminUserListView.as_view(), name='admin-user-list'),
    path('admin/users/', AdminUserListView.as_view()),
    path('admin/users/create', AdminCreateUserView.as_view(), name='admin-user-create'),
    path('admin/users/create/', AdminCreateUserView.as_view()),

    path('admin/users/<int:pk>/update', AdminUserDetailView.as_view(), name='admin-user-update'),
    path('admin/users/<int:pk>/update/', AdminUserDetailView.as_view()),
    path('admin/users/<int:pk>/delete', AdminUserDetailView.as_view(), name='admin-user-delete'),
    path('admin/users/<int:pk>/delete/', AdminUserDetailView.as_view()),
    path('admin/users/<int:pk>/status', AdminUserStatusView.as_view(), name='admin-user-status'),
    path('admin/users/<int:pk>/status/', AdminUserStatusView.as_view()),
    path('admin/users/<int:pk>', AdminUserDetailView.as_view(), name='admin-user-detail'),
    path('admin/users/<int:pk>/', AdminUserDetailView.as_view()),

    path('admin/role-permissions', RolePermissionView.as_view(), name='role-permissions'),
    path('admin/role-permissions/', RolePermissionView.as_view()),

    path('admin/department-permissions', DepartmentPermissionView.as_view(), name='department-permissions'),
    path('admin/department-permissions/', DepartmentPermissionView.as_view()),

    path('admin/settings', SystemSettingsView.as_view(), name='system-settings'),
    path('admin/settings/', SystemSettingsView.as_view()),

    path('admin/activity-log', ActivityLogView.as_view(), name='activity-log'),
    path('admin/activity-log/', ActivityLogView.as_view()),
]
