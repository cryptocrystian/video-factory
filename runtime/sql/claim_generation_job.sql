-- VF Generation Worker: claim the next PENDING generation job.
select to_jsonb(j) as job
from video_factory.claim_next_generation_job(($1::jsonb)->>'worker_id') as j
