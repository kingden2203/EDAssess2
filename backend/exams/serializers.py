# backend/exams/serializers.py
from rest_framework import serializers
from accounts.models import MAJOR_CHOICES, department_of_major
from .models import (
    Choice, Exam, ExamAttempt, ExamConfig, Question,
    MAJOR_TARGET_CHOICES, MAX_QUESTIONS_PER_EXAM, count_attempts,
)


def _check_major_for_user(major, user):
    """Ang major ay dapat nasa department ng gumagawa (super admin = kahit alin)."""
    if not major:
        raise serializers.ValidationError({'major': 'Select a major for Major questions and exams.'})
    dept = department_of_major(major)
    if user is not None and getattr(user, 'department', None) and dept != user.department:
        raise serializers.ValidationError(
            {'major': f'{major} is not a {user.department} major.'}
        )
    # Instructor na may major: sariling major lang ang puwede niyang gawan ng question/exam
    if (user is not None and getattr(user, 'role', None) == 'instructor'
            and getattr(user, 'major', None) and major != user.major):
        raise serializers.ValidationError(
            {'major': f'You can only manage {user.major} questions and exams.'}
        )
    return dept


class QuestionSerializer(serializers.Serializer):
    """
    Custom serializer: ang shape ng frontend (choices[] + answer index) ay hindi direktang
    tumutugma sa Question/Choice tables, kaya dito nangyayari ang translation.
    """
    id = serializers.IntegerField(read_only=True)
    question = serializers.CharField()
    category = serializers.ChoiceField(choices=['GenEd', 'ProfEd', 'Major'])
    subject = serializers.CharField(required=False, allow_blank=True)
    difficulty = serializers.ChoiceField(choices=['Easy', 'Medium', 'Hard'], required=False, default='Medium')
    choices = serializers.ListField(child=serializers.CharField(allow_blank=True), min_length=4, max_length=4)
    answer = serializers.IntegerField(min_value=0, max_value=3)
    explanation = serializers.CharField(required=False, allow_blank=True)
    # Major lang: isa sa mga major ng department (hal. 'Mathematics', 'Automotive Technology').
    major = serializers.ChoiceField(
        choices=MAJOR_CHOICES, required=False, allow_null=True, allow_blank=True
    )
    # Luma: hindi na ginagamit ng frontend. Hinuhulaan na ito mula sa `major`.
    department = serializers.ChoiceField(
        choices=MAJOR_TARGET_CHOICES, required=False, allow_null=True, allow_blank=True
    )
    # Per-choice explanation, index-aligned sa `choices`.
    choice_explanations = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False, min_length=4, max_length=4
    )

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        category = attrs.get('category') or (self.instance.category if self.instance else None)

        if category == 'Major':
            major = attrs.get('major') or (self.instance.major if self.instance else None)
            attrs['major'] = major
            attrs['department'] = _check_major_for_user(major, user)
        else:
            attrs['major'] = None
            attrs['department'] = None
        return attrs

    def to_representation(self, instance):
        choice_objs = list(instance.choices.all())
        return {
            'id': instance.id,
            'question': instance.text,
            'category': instance.category,
            'subject': instance.subject,
            'difficulty': instance.difficulty,
            'choices': [c.text for c in choice_objs],
            'answer': next((i for i, c in enumerate(choice_objs) if c.is_correct), 0),
            'explanation': instance.explanation,
            'department': instance.department,
            'major': instance.major,
            'choice_explanations': [c.explanation for c in choice_objs],
        }

    def create(self, validated_data):
        user = self.context['request'].user
        choices = validated_data.pop('choices')
        answer = validated_data.pop('answer')
        choice_explanations = validated_data.pop('choice_explanations', ['', '', '', ''])

        question = Question.objects.create(
            text=validated_data['question'],
            category=validated_data['category'],
            subject=validated_data.get('subject', ''),
            difficulty=validated_data.get('difficulty', 'Medium'),
            explanation=validated_data.get('explanation', ''),
            created_by=user,
            major=validated_data.get('major'),
            department=validated_data.get('department'),
        )
        for i, choice_text in enumerate(choices):
            Choice.objects.create(
                question=question,
                text=choice_text,
                is_correct=(i == answer),
                explanation=choice_explanations[i] if i < len(choice_explanations) else '',
            )
        return question

    def update(self, instance, validated_data):
        instance.text = validated_data.get('question', instance.text)
        instance.category = validated_data.get('category', instance.category)
        instance.subject = validated_data.get('subject', instance.subject)
        instance.difficulty = validated_data.get('difficulty', instance.difficulty)
        instance.explanation = validated_data.get('explanation', instance.explanation)

        # validate() ang nag-aayos ng major/department ayon sa category
        instance.major = validated_data.get('major')
        instance.department = validated_data.get('department')
        instance.save()

        if 'choices' in validated_data:
            instance.choices.all().delete()
            answer = validated_data.get('answer', 0)
            choice_explanations = validated_data.get('choice_explanations', ['', '', '', ''])
            for i, choice_text in enumerate(validated_data['choices']):
                Choice.objects.create(
                    question=instance,
                    text=choice_text,
                    is_correct=(i == answer),
                    explanation=choice_explanations[i] if i < len(choice_explanations) else '',
                )
        return instance


class ExamSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    question_ids = serializers.PrimaryKeyRelatedField(
        source='questions', many=True, queryset=Question.objects.all(),
        write_only=True, required=False,
    )
    major = serializers.ChoiceField(
        choices=MAJOR_CHOICES, required=False, allow_null=True, allow_blank=True
    )
    attempts_used = serializers.SerializerMethodField()

    def get_attempts_used(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or getattr(user, 'role', None) != 'user':
            return None
        return count_attempts(user, obj)

    # Hinuhulaan mula sa major; read lang para sa frontend.
    department = serializers.ChoiceField(
        choices=MAJOR_TARGET_CHOICES, required=False, allow_null=True, allow_blank=True
    )

    class Meta:
        model = Exam
        fields = [
            'id', 'title', 'description', 'category', 'status',
            'duration_minutes', 'passing_score', 'is_active',
            'questions', 'question_ids', 'major', 'department', 'created_at', 'attempts_used',
        ]

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        category = attrs.get('category') or (self.instance.category if self.instance else 'GenEd')

        if category == 'Major':
            major = attrs.get('major') or (self.instance.major if self.instance else None)
            attrs['major'] = major
            attrs['department'] = _check_major_for_user(major, user)
        else:
            attrs['major'] = None
            attrs['department'] = None

        selected = attrs.get('questions')
        if selected is not None and len(selected) > MAX_QUESTIONS_PER_EXAM:
            raise serializers.ValidationError({
                'question_ids': f'An exam can have at most {MAX_QUESTIONS_PER_EXAM} questions '
                                f'(you selected {len(selected)}).'
            })
        return attrs


class ExamAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamAttempt
        fields = [
            'id', 'user', 'exam', 'exam_type', 'category', 'label',
            'score', 'total', 'percentage', 'passed',
            'time_taken_seconds', 'auto_submit', 'subject_breakdown', 'detail', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']


class ExamConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamConfig
        fields = [
            'genEd', 'profEd', 'major',
            'autoSubmit', 'showResults', 'allowReview',
            'shuffleQuestions', 'maxAttempts',
            'updated_at',
        ]
        read_only_fields = ['updated_at']