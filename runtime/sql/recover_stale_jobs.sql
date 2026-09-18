-- VF Generation Worker: deterministic recovery of stale PROCESSING jobs.
-- Never resubmits: jobs with a provider id go to Provider Poll, uncertain
-- submissions are quarantined, and only never-submitted claims return to PENDING.
select job_id, action, external_job_id
from video_factory.recover_stale_generation_jobs(($1::jsonb)->>'worker_id', 25)
