# EDAssess2 — changes package (v2)

## Contents
- `new_and_replaced/`  Complete files, same folder layout as your project. Copy over the project root.
- `apply_edits.py`      Applies the small edits to your existing files (find/replace, `.bak` backups, safe to run twice).

## 1. Copy the files
Copy everything inside `new_and_replaced/` into your project root (`backend/` and `frontend/` merge).
These OVERWRITE your versions, so back up anything you changed after sending it to me:

Backend: accounts/views.py, accounts/urls.py, accounts/emailing.py (new),
         modules/models.py, modules/views.py, modules/urls.py
Frontend: components/AuthModal.jsx, components/MajorField.jsx (new), pages/admin/UserPage.jsx,
          pages/admin/ModulesPage.jsx, pages/instructor/ModulesPage.jsx, pages/user/ExamPage.jsx,
          hooks/useQuestionBank.js, hooks/useReviewModules.js, hooks/useIdleLogout.js (new),
          hooks/useExamTimer.js (new), api/questionApi.js, api/modulesApi.js,
          auth/ProtectedRoute.jsx, utils/majors.js

!! modules/urls.py: I wrote it from the endpoints your frontend calls (/modules, /modules/<id>,
   /announcements, /announcements/<id>). Compare with your current file BEFORE overwriting. If yours has
   extra routes, keep them and just add the two `modules/<int:pk>/download` lines.
!! hooks/useReviewModules.js: I rebuilt it without seeing the original. It returns
   { modules, loading, reload, addModule, removeModule, downloadModule } + named export formatFileSize.
   If another file imports something else from it, tell me.

## 2. Apply the small edits
From the project root:  `python apply_edits.py .`
It prints OK / SKIP / FAIL per edit. FAIL = nothing changed for that edit; do it by hand (the old/new text is in the script).

## 3. Install + migrate (locally, then COMMIT the migration files)
```
cd backend
pip install -r requirements.txt        # now includes django-storages[s3]
python manage.py makemigrations accounts exams modules
python manage.py migrate
```
Commit `backend/*/migrations/*.py`. Only ONE person (you or your partner) should generate migrations.

## 4. Storage for Review Modules (Supabase Storage, S3 protocol)
Render's disk is wiped on every deploy, so uploaded files must live outside it.
1. Supabase > Storage > create a PRIVATE bucket (e.g. `review-modules`).
2. Storage > S3 Configuration: enable S3 connection, create an access key pair, copy the endpoint and region.
3. Render > Environment:
   ```
   S3_BUCKET_NAME=review-modules
   S3_ENDPOINT_URL=https://<project-ref>.storage.supabase.co/storage/v1/s3
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   S3_REGION=<region shown in Supabase>
   ```
   Use the endpoint exactly as Supabase shows it (keep /storage/v1/s3, do not add the bucket name).
4. Old modules whose files were on Render's disk are already gone. Their rows will show
   "This file is no longer available" on download. Delete and re-upload them.

## 5. Email (Render free tier blocks SMTP)
1. Create a Brevo account, verify a sender email, create an API key (SMTP & API > API keys).
2. Render > Environment:
   ```
   BREVO_API_KEY=...
   BREVO_SENDER_EMAIL=<the verified sender>
   ```
   With no Brevo values the app falls back to Django SMTP, and with nothing set it prints codes to the console (local testing).

## 6. Render settings
- Build Command:  `pip install -r requirements.txt && python manage.py migrate`
  (if the build step cannot reach the database, put `python manage.py migrate &&` before gunicorn in the Start Command)
- Set every variable above in the Render dashboard. `backend/.env` is local only.
- Deploy the backend first, then the frontend (Vercel).
- Instructors must log out and in again so their major appears in the session.

## What changed (summary)
Instructor major · email verification · Student Monitor rename · auto-submit · max attempts (0 = unlimited) ·
session timeout · multi-select delete · Show Answer Explanations · Announcements label ·
NEW: Electronics Technology (CIT) · review module download via signed link + external storage ·
Major tag when uploading modules.

## Notes
- "Show Answer Explanations" defaults to OFF; admin must turn it on in Exam Config.
- Existing accounts stay verified; only new self-registrations need the code.
- Attempts are counted per exam; old attempts (no exam link) don't count.
