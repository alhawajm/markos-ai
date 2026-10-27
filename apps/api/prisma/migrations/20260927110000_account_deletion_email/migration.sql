ALTER TABLE auth_email_jobs DROP CONSTRAINT auth_email_jobs_kind_check;
ALTER TABLE auth_email_jobs ADD CONSTRAINT auth_email_jobs_kind_check CHECK(kind IN ('RESET_CODE','PASSWORD_CHANGED','VERIFY','DELETE_CODE'));
