# backend/exams/views.py
from django.db.models import Avg
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.activity import log_activity
from accounts.permissions import (
    IsSuperAdmin, IsInstructor, CanConfigureExams, CanTakeExams,
    apply_dept_scope, apply_major_scope,
)
from .models import Exam, ExamAttempt, ExamConfig, Question, count_attempts
from .serializers import (
    ExamAttemptSerializer, ExamConfigSerializer, ExamSerializer, QuestionSerializer,
)


# ── Student side ────────────────────────────────────────────────────────────

class ExamListCreateView(generics.ListAPIView):
    """Listahan ng 'active' exams para sa students. Paggawa ng exam ay sa /instructor/exams lang.
    Major exams: makikita lang ng kaparehas na department (o 'BOTH')."""
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated, CanTakeExams]

    def get_queryset(self):
        qs = (
            Exam.objects.filter(is_active=True, status='active')
            .prefetch_related('questions__choices')
            .order_by('-created_at')
        )
        qs = apply_dept_scope(qs, self.request.user)
        return apply_major_scope(qs, self.request.user)


class ExamDetailView(generics.RetrieveAPIView):
    """Read-only. Edit/delete ng exam ay sa /instructor/exams/<id> lang."""
    serializer_class = ExamSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Exam.objects.prefetch_related('questions__choices')
        qs = apply_dept_scope(qs, self.request.user)
        return apply_major_scope(qs, self.request.user)


class ExamAttemptListCreateView(generics.ListCreateAPIView):
    serializer_class = ExamAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ExamAttempt.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        exam = serializer.validated_data.get('exam')
        limit = ExamConfig.load().maxAttempts  # 0 = unlimited
        if exam is not None and limit > 0:
            if count_attempts(self.request.user, exam) >= limit:
                raise PermissionDenied(
                    f'You have reached the maximum of {limit} attempt(s) for this exam.'
                )
        serializer.save(user=self.request.user)


class ExamAttemptDetailView(generics.RetrieveAPIView):
    """Single attempt with full detail (questions/answers) — para sa ResultsPage reload."""
    serializer_class = ExamAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ExamAttempt.objects.filter(user=self.request.user)


class ExamConfigView(generics.RetrieveUpdateAPIView):
    serializer_class = ExamConfigSerializer

    def get_permissions(self):
        # Kahit sinong naka-login puwedeng bumasa (kailangan ng ExamPage/ExamSelectionPage
        # para sa shuffleQuestions). Super admin lang ang puwedeng mag-update.
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [IsSuperAdmin(), CanConfigureExams()]

    def get_object(self):
        return ExamConfig.load()

    def perform_update(self, serializer):
        before = ExamConfigSerializer(serializer.instance).data
        instance = serializer.save()
        after = ExamConfigSerializer(instance).data
        changes = [f'{k}: {before[k]} → {after[k]}' for k in after if k in before and before[k] != after[k]]
        if changes:
            log_activity(
                self.request, 'exam_config.update',
                'Updated global exam configuration — ' + '; '.join(changes),
                category='exams',
            )


# ── Instructor side ─────────────────────────────────────────────────────────

class InstructorDashboardView(generics.GenericAPIView):
    permission_classes = [IsInstructor]

    def get(self, request):
        exams = Exam.objects.filter(created_by=request.user)

        questions_count = sum(e.questions.count() for e in exams)
        active_exams_count = exams.filter(status='active').count()

        categories = list(exams.values_list('category', flat=True).distinct())
        attempts = ExamAttempt.objects.filter(category__in=categories)
        # Sariling department lang ang mga student na minomonitor
        if request.user.department:
            attempts = attempts.filter(user__department=request.user.department)
        students_monitored = attempts.values('user').distinct().count()
        avg_score = attempts.aggregate(avg=Avg('percentage'))['avg'] or 0

        stats = [
            {'label': 'Questions in Bank', 'value': str(questions_count),
             'sub': f'{exams.count()} exam(s) total', 'icon': 'BookOpen', 'color': 'blue'},
            {'label': 'Active Exams', 'value': str(active_exams_count),
             'sub': f'{exams.count()} created total', 'icon': 'ClipboardList', 'color': 'purple'},
            {'label': 'Students Monitored', 'value': str(students_monitored),
             'sub': 'Across all your exams', 'icon': 'Users', 'color': 'green'},
            {'label': 'Avg. Class Score', 'value': f'{round(avg_score)}%',
             'sub': 'All submissions', 'icon': 'TrendingUp', 'color': 'amber'},
        ]

        recent_exams = [
            {
                'name': e.title, 'category': e.category,
                'questions': e.questions.count(), 'duration': f'{e.duration_minutes} min',
                'status': e.status,
            }
            for e in exams.order_by('-created_at')[:4]
        ]

        return Response({'stats': stats, 'recent_exams': recent_exams}, status=status.HTTP_200_OK)


class InstructorExamListCreateView(generics.ListCreateAPIView):
    serializer_class = ExamSerializer
    permission_classes = [IsInstructor, CanConfigureExams]

    def get_queryset(self):
        return (
            Exam.objects.filter(created_by=self.request.user)
            .prefetch_related('questions__choices')
            .order_by('-created_at')
        )

    def perform_create(self, serializer):
        # Ang department (para sa Major) ay hinahawakan ng ExamSerializer.validate
        exam = serializer.save(created_by=self.request.user)
        log_activity(
            self.request, 'exam.create',
            f'Created exam "{exam.title}" ({exam.category}'
            f'{", " + exam.major if exam.major else ""}, {exam.status}, {exam.questions.count()} items)',
            category='exams',
        )


class InstructorExamDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ExamSerializer
    permission_classes = [IsInstructor, CanConfigureExams]

    def get_queryset(self):
        return Exam.objects.filter(created_by=self.request.user)

    def perform_update(self, serializer):
        exam = serializer.save()
        log_activity(
            self.request, 'exam.update',
            f'Updated exam "{exam.title}" ({exam.category}'
            f'{", " + exam.major if exam.major else ""}, {exam.status}, {exam.questions.count()} items)',
            category='exams',
        )

    def perform_destroy(self, instance):
        title, category = instance.title, instance.category
        instance.delete()
        log_activity(
            self.request, 'exam.delete', f'Deleted exam "{title}" ({category})',
            category='exams',
        )


class InstructorQuestionListCreateView(generics.ListCreateAPIView):
    serializer_class = QuestionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Question.objects.prefetch_related('choices')
        # Instructor: sariling uploads lang. Student (fallback pool ng ExamPage):
        # shared + sariling department lang para sa Major.
        if user.role == 'instructor':
            qs = qs.filter(created_by=user)
        else:
            qs = apply_dept_scope(qs, user)
            qs = apply_major_scope(qs, user)
        return qs.order_by('id')  # upload order, para tumugma ang numbering sa Question Bank

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsInstructor(), CanConfigureExams()]
        return [permissions.IsAuthenticated()]

    def get_serializer_context(self):
        return {'request': self.request}

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class InstructorQuestionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = QuestionSerializer
    permission_classes = [IsInstructor, CanConfigureExams]

    def get_queryset(self):
        # Hindi puwedeng mag-edit/mag-delete ng question ng ibang instructor
        return Question.objects.filter(created_by=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}

    def perform_destroy(self, instance):
        label = instance.text[:60]
        instance.delete()
        log_activity(
            self.request, 'question.delete', f'Deleted question "{label}"',
            category='exams',
        )


class InstructorQuestionBulkCreateView(APIView):
    """Import mula PDF — tumatanggap ng listahan ng questions."""
    permission_classes = [IsInstructor, CanConfigureExams]

    def post(self, request):
        items = request.data.get('questions', [])
        created = []
        for item in items:
            serializer = QuestionSerializer(data=item, context={'request': request})
            serializer.is_valid(raise_exception=True)
            question = serializer.save(created_by=request.user)
            created.append(QuestionSerializer(question).data)
        if created:
            log_activity(
                request, 'question.import', f'Imported {len(created)} question(s) to the question bank',
                category='exams',
            )
        return Response({'created': created}, status=status.HTTP_201_CREATED)


class InstructorQuestionBulkDeleteView(APIView):
    """Delete ng maraming question nang sabay. Sariling questions lang ng instructor."""
    permission_classes = [IsInstructor, CanConfigureExams]

    def _ids(self, request):
        data = request.data
        if isinstance(data, list):
            raw = data
        else:
            raw = data.get('ids') or data.get('question_ids') or data.get('questionIds') or []
        return [int(i) for i in raw if str(i).isdigit()]

    def post(self, request):
        ids = self._ids(request)
        qs = Question.objects.filter(created_by=request.user, id__in=ids)
        deleted = qs.count()
        qs.delete()
        if deleted:
            log_activity(
                request, 'question.bulk_delete', f'Deleted {deleted} question(s) from the question bank',
                category='exams',
            )
        return Response({'deleted': deleted, 'ids': ids}, status=status.HTTP_200_OK)

    delete = post  