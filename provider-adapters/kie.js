// Kie adapter (Market jobs API).
//
// Submit: POST https://api.kie.ai/api/v1/jobs/createTask  { model, input } -> { code, msg, data: { taskId } }
// Poll  : GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...        -> { code, data: { state, resultJson, failCode, failMsg, creditsConsumed } }
//
// Input fields were taken from docs.kie.ai market pages on 2026-09-17. Kie
// returns credits, not USD; credits are recorded but never converted to a
// price without a verified rate.

const VF_KIE_BASE = 'https://api.kie.ai';

const VF_KIE_MAPPERS = {
  'kling-3.0/video': {
    modes: ['text_to_video', 'image_to_video'],
    validate(job, params) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      if (!vfIntInRange(vfRequestedDuration(params), 3, 15)) return 'DURATION_UNSUPPORTED_3_TO_15_INTEGER_SECONDS';
      if (params.aspect_ratio && !['16:9', '9:16', '1:1'].includes(params.aspect_ratio)) return 'ASPECT_RATIO_UNSUPPORTED';
      return null;
    },
    body(job, params, inputs, offer) {
      const frames = vfInputsByRole(inputs, 'start_frame').slice(0, 1).concat(vfInputsByRole(inputs, 'end_frame').slice(0, 1));
      return {
        model: offer.provider_model_key,
        input: vfCompact({
          prompt: job.prompt,
          image_urls: frames.length ? frames : undefined,
          sound: offer.audio_included === true,
          duration: String(vfRequestedDuration(params)),
          aspect_ratio: params.aspect_ratio || '16:9',
          mode: params.kling_mode || 'pro',
          multi_shots: false,
        }),
      };
    },
  },
  'bytedance/seedance-2-5': {
    modes: ['text_to_video', 'image_to_video', 'reference_to_video'],
    validate(job, params) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      if (!vfIntInRange(vfRequestedDuration(params), 4, 30)) return 'DURATION_UNSUPPORTED_4_TO_30_INTEGER_SECONDS';
      return null;
    },
    body(job, params, inputs, offer) {
      return {
        model: offer.provider_model_key,
        input: vfCompact({
          prompt: job.prompt,
          first_frame_url: vfInputsByRole(inputs, 'start_frame')[0],
          last_frame_url: vfInputsByRole(inputs, 'end_frame')[0],
          reference_image_urls: vfInputsByRole(inputs, 'reference').concat(vfInputsByRole(inputs, 'reference_image')),
          reference_video_urls: vfInputsByRole(inputs, 'reference_video'),
          reference_audio_urls: vfInputsByRole(inputs, 'reference_audio'),
          generate_audio: offer.audio_included === true,
          resolution: String(offer.resolution || params.resolution || '720p').toLowerCase(),
          aspect_ratio: params.aspect_ratio || 'adaptive',
          duration: vfRequestedDuration(params),
        }),
      };
    },
  },
  'gpt-image-2-5-sunburst-text-to-image': {
    modes: ['text_to_image'],
    validate: (job) => (job.prompt ? null : 'PROMPT_REQUIRED'),
    body(job, params, inputs, offer) {
      return {
        model: offer.provider_model_key,
        input: vfCompact({ prompt: job.prompt, aspect_ratio: params.aspect_ratio || '16:9', resolution: offer.resolution || '2K' }),
      };
    },
  },
  'gpt-image-2-5-sunburst-image-to-image': {
    modes: ['image_edit'],
    validate(job, params, inputs) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      if (!vfInputsByRole(inputs, 'edit_source').concat(vfInputsByRole(inputs, 'reference')).length) return 'EDIT_SOURCE_REQUIRED';
      return null;
    },
    body(job, params, inputs, offer) {
      return {
        model: offer.provider_model_key,
        input: vfCompact({
          prompt: job.prompt,
          input_urls: vfInputsByRole(inputs, 'edit_source').concat(vfInputsByRole(inputs, 'reference')),
          aspect_ratio: params.aspect_ratio || 'auto',
          resolution: offer.resolution || '2K',
        }),
      };
    },
  },
  // Not mapped in v1 (routing records ADAPTER_MAPPING_NOT_IMPLEMENTED):
  //  - veo-3-1: Kie serves Veo from a dedicated API, not jobs/createTask.
  //  - elevenlabs/text-to-speech-multilingual-v2: Kie uses its own voice-id catalogue.
  //  - minimax-h3/text-to-video: unrouted alternative model.
};

function vfKieSupports(offer, job, mode, params, inputs) {
  const mapper = VF_KIE_MAPPERS[offer.provider_model_key];
  if (!mapper) return 'ADAPTER_MAPPING_NOT_IMPLEMENTED';
  if (!mapper.modes.includes(mode)) return 'MODE_MISMATCH';
  return mapper.validate(job, params, inputs, offer);
}

function vfKieBuildRequest(offer, job, params, inputs) {
  return {
    method: 'POST',
    url: VF_KIE_BASE + '/api/v1/jobs/createTask',
    body: VF_KIE_MAPPERS[offer.provider_model_key].body(job, params, inputs, offer),
  };
}

function vfKieNormalizeSubmit(http) {
  if (!http.transport_ok) {
    return { accepted: false, provider_job_id: null, status: 'FAILED', error: 'Kie submit transport error: ' + http.transport_error, raw_response: null };
  }
  const b = http.body || {};
  const taskId = b.data && b.data.taskId;
  if (http.status_code >= 200 && http.status_code < 300 && Number(b.code) === 200 && taskId) {
    return { accepted: true, provider_job_id: String(taskId), status: 'PENDING', error: null, raw_response: vfSafeRaw(b), poll: {} };
  }
  const code = b.code != null ? b.code : http.status_code;
  const label = { 401: 'unauthorized', 402: 'insufficient credits', 422: 'validation error', 429: 'rate limited', 455: 'maintenance', 501: 'generation failed', 505: 'feature disabled' }[Number(code)] || 'error';
  return {
    accepted: false,
    provider_job_id: null,
    status: 'FAILED',
    error: 'Kie submit code ' + code + ' (' + label + '): ' + vfTruncate(b.msg || '', 300),
    raw_response: vfSafeRaw(b),
  };
}

function vfKieStatusRequest(attempt) {
  return { method: 'GET', url: VF_KIE_BASE + '/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(attempt.external_job_id) };
}

function vfKieNormalizePoll(http) {
  if (!http.transport_ok) return { status: 'RUNNING', transient: true, error: 'Kie poll transport error: ' + http.transport_error, raw_response: null, result_urls: [], files: [] };
  const b = http.body || {};
  const code = Number(b.code != null ? b.code : http.status_code);
  if (http.status_code >= 500 || http.status_code === 429 || code === 429 || code === 455 || code === 500 || http.status_code === 401 || code === 401) {
    return { status: 'RUNNING', transient: true, error: 'Kie poll code ' + code, raw_response: vfSafeRaw(b), result_urls: [], files: [] };
  }
  const d = b.data;
  if (code !== 200 || !d) {
    return { status: 'FAILED', error: 'Kie poll code ' + code + ': ' + vfTruncate(b.msg || '', 300), raw_response: vfSafeRaw(b), result_urls: [], files: [] };
  }
  const credits = vfNum(d.creditsConsumed);
  switch (d.state) {
    case 'waiting':
    case 'queuing':
      return { status: 'PENDING', error: null, raw_response: vfSafeRaw(b), result_urls: [], files: [], credits_consumed: credits };
    case 'generating':
      return { status: 'RUNNING', error: null, raw_response: vfSafeRaw(b), result_urls: [], files: [], credits_consumed: credits };
    case 'success': {
      let parsed = d.resultJson;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
      }
      const urls = parsed && Array.isArray(parsed.resultUrls) ? parsed.resultUrls.filter((u) => typeof u === 'string') : [];
      if (!urls.length) return { status: 'FAILED', error: 'Kie task succeeded without resultUrls', raw_response: vfSafeRaw(b), result_urls: [], files: [], credits_consumed: credits };
      return {
        status: 'SUCCEEDED',
        error: null,
        raw_response: vfSafeRaw(b),
        result_urls: urls,
        files: urls.map((u) => ({ url: u, mime_type: null, size_bytes: null, width: null, height: null, duration_seconds: null, file_name: null })),
        credits_consumed: credits,
      };
    }
    case 'fail':
      return { status: 'FAILED', error: 'Kie task failed: ' + vfTruncate((d.failCode || '') + ' ' + (d.failMsg || ''), 400).trim(), raw_response: vfSafeRaw(b), result_urls: [], files: [], credits_consumed: credits };
    default:
      return { status: 'RUNNING', transient: true, error: 'Kie state unrecognized: ' + vfTruncate(d.state, 40), raw_response: vfSafeRaw(b), result_urls: [], files: [] };
  }
}
