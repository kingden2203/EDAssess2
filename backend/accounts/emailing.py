# backend/accounts/emailing.py
import json
import secrets
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailVerification

CODE_TTL_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5


def seconds_until_resend(user):
    ev = EmailVerification.objects.filter(user=user).first()
    if not ev:
        return 0
    elapsed = (timezone.now() - ev.last_sent_at).total_seconds()
    return max(0, int(RESEND_COOLDOWN_SECONDS - elapsed))


def _deliver(to_email, to_name, subject, text):
    """
    Production (Render free tier blocks SMTP): Brevo HTTPS API -> BREVO_API_KEY + BREVO_SENDER_EMAIL
    Local / paid hosting: Django SMTP (EMAIL_* settings). Walang config = naka-print sa console.
    """
    api_key = getattr(settings, 'BREVO_API_KEY', '')
    sender = getattr(settings, 'BREVO_SENDER_EMAIL', '')
    if api_key and sender:
        payload = {
            'sender': {'name': 'EduAssess', 'email': sender},
            'to': [{'email': to_email, 'name': to_name}],
            'subject': subject,
            'textContent': text,
        }
        req = urllib.request.Request(
            'https://api.brevo.com/v3/smtp/email',
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'api-key': api_key,
                'Content-Type': 'application/json',
                'accept': 'application/json',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            # Lalabas ito sa Render logs: 401 = mali ang key, 400 = hindi verified ang sender, 403 = IP restriction
            raise RuntimeError(f'Brevo API {e.code}: {body}') from e
        return

    if not settings.DEBUG and settings.EMAIL_BACKEND.endswith('console.EmailBackend'):
        raise RuntimeError('Email is not configured: set BREVO_API_KEY and BREVO_SENDER_EMAIL on Render.')

    send_mail(
        subject=subject,
        message=text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=False,
    )


def send_verification_code(user):
    code = f'{secrets.randbelow(10 ** 6):06d}'
    EmailVerification.objects.update_or_create(
        user=user,
        defaults={
            'code_hash': make_password(code),
            'expires_at': timezone.now() + timedelta(minutes=CODE_TTL_MINUTES),
            'attempts': 0,
            'last_sent_at': timezone.now(),
        },
    )
    _deliver(
        user.email,
        user.name,
        'Your EduAssess verification code',
        (
            f'Hi {user.name},\n\n'
            f'Your EduAssess verification code is {code}.\n'
            f'It expires in {CODE_TTL_MINUTES} minutes.\n\n'
            'If you did not create this account, you can ignore this email.'
        ),
    )


def check_code(user, code):
    ev = EmailVerification.objects.filter(user=user).first()
    if not ev or ev.expires_at < timezone.now() or ev.attempts >= MAX_ATTEMPTS:
        return False
    ev.attempts += 1
    ev.save(update_fields=['attempts'])
    if check_password(str(code), ev.code_hash):
        ev.delete()
        return True
    return False