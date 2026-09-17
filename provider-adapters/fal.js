// fal adapter (queue API).
//
// Submit: POST https://queue.fal.run/<queue path>   -> { request_id, status_url, response_url, cancel_url }
// Poll  : GET  status_url                            -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
// Result: GET  response_url                          -> model output ({ video } | { images } | { audio })
//
// Request fields were taken from fal's model metadata API
// (GET https://api.fal.ai/v1/models?endpoint_id=...&expand=openapi-3.0) on 2026-09-17.

const VF_FAL_QUEUE_BASE = 'https://queue.fal.run';

// Several verified offers store fal's public endpoint alias. The queue API is
// served from the OpenAPI path below; unmapped keys are used verbatim.
const VF_FAL_QUEUE_PATHS = {
  'minimax/h3-max-turbo/image-to-video': 'fal-ai/minimax-h3-turbo/max-turbo/image-to-video',
  'minimax/h3-max-turbo/text-to-video': 'fal-ai/minimax-h3-turbo/max-turbo/text-to-video',
  'minimax/h3-max/image-to-video': 'fal-ai/minimax-h3-turbo/image-to-video',
  'openai/gpt-image-2.5/sunburst/text-to-image': 'fal-ai/gpt-image-2.5-sunburst',
  'openai/gpt-image-2.5/sunburst/edit': 'fal-ai/gpt-image-2.5-sunburst/edit',
  'bytedance/seedance-2.5/image-to-video': 'fal-ai/seedance-2.5/image-to-video',
  'bytedance/seedance-2.5/reference-to-video': 'fal-ai/seedance-2.5/reference-to-video',
};

function vfFalQueuePath(offer) {
  const key = offer.endpoint_key || offer.provider_model_key;
  return VF_FAL_QUEUE_PATHS[key] || key;
}

function vfIntInRange(value, min, max) {
  const n = vfNum(value);
  return n != null && Number.isInteger(n) && n >= min && n <= max;
}

function vfResolutionToSize(resolution) {
  const m = /^(\d+)x(\d+)$/.exec(String(resolution || ''));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

function vfCompact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// Each mapper: modes it serves, validate(job, params, inputs, offer) -> reason | null,
// body(job, params, inputs, offer) -> provider JSON body.
const VF_FAL_MAPPERS = {
  'minimax/h3-max-turbo/image-to-video': {
    modes: ['image_to_video'],
    validate: vfFalMinimaxValidate(true),
    body: vfFalMinimaxBody(true),
  },
  'minimax/h3-max/image-to-video': {
    modes: ['image_to_video'],
    validate: vfFalMinimaxValidate(true),
    body: vfFalMinimaxBody(true),
  },
  'minimax/h3-max-turbo/text-to-video': {
    modes: ['text_to_video'],
    validate: vfFalMinimaxValidate(false),
    body: vfFalMinimaxBody(false),
  },
  'fal-ai/kling-video/v3/pro/image-to-video': {
    modes: ['image_to_video'],
    validate(job, params, inputs) {
      if (!vfInputsByRole(inputs, 'start_frame').length) return 'START_FRAME_REQUIRED';
      if (!vfIntInRange(vfRequestedDuration(params), 3, 15)) return 'DURATION_UNSUPPORTED_3_TO_15_INTEGER_SECONDS';
      return null;
    },
    body(job, params, inputs, offer) {
      return vfCompact({
        prompt: job.prompt || undefined,
        negative_prompt: job.negative_prompt || undefined,
        start_image_url: vfInputsByRole(inputs, 'start_frame')[0],
        end_image_url: vfInputsByRole(inputs, 'end_frame')[0],
        duration: String(vfRequestedDuration(params)),
        // Explicit: fal defaults generate_audio to true, which is a different (higher) offer.
        generate_audio: offer.audio_included === true,
        cfg_scale: vfNum(params.cfg_scale) == null ? undefined : vfNum(params.cfg_scale),
      });
    },
  },
  'bytedance/seedance-2.5/image-to-video': {
    modes: ['image_to_video'],
    validate(job, params, inputs) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      if (!vfInputsByRole(inputs, 'start_frame').length) return 'START_FRAME_REQUIRED';
      if (!vfIntInRange(vfRequestedDuration(params), 4, 30)) return 'DURATION_UNSUPPORTED_4_TO_30_INTEGER_SECONDS';
      return null;
    },
    body(job, params, inputs, offer) {
      return vfCompact({
        prompt: job.prompt,
        image_url: vfInputsByRole(inputs, 'start_frame')[0],
        end_image_url: vfInputsByRole(inputs, 'end_frame')[0],
        duration: String(vfRequestedDuration(params)),
        resolution: String(offer.resolution || params.resolution || '720p').toLowerCase(),
        aspect_ratio: params.aspect_ratio || 'auto',
        generate_audio: offer.audio_included === true,
      });
    },
  },
  'bytedance/seedance-2.5/reference-to-video': {
    modes: ['reference_to_video'],
    validate(job, params, inputs) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      const refs = inputs.filter((i) => i.role.startsWith('reference') && i.uri);
      if (!refs.length) return 'REFERENCE_INPUT_REQUIRED';
      if (!vfIntInRange(vfRequestedDuration(params), 4, 30)) return 'DURATION_UNSUPPORTED_4_TO_30_INTEGER_SECONDS';
      return null;
    },
    body(job, params, inputs, offer) {
      return vfCompact({
        prompt: job.prompt,
        image_urls: vfInputsByRole(inputs, 'reference').concat(vfInputsByRole(inputs, 'reference_image')),
        video_urls: vfInputsByRole(inputs, 'reference_video'),
        audio_urls: vfInputsByRole(inputs, 'reference_audio'),
        duration: String(vfRequestedDuration(params)),
        resolution: String(offer.resolution || params.resolution || '720p').toLowerCase(),
        aspect_ratio: params.aspect_ratio || 'auto',
        generate_audio: offer.audio_included === true,
      });
    },
  },
  'openai/gpt-image-2.5/sunburst/text-to-image': {
    modes: ['text_to_image'],
    validate: (job) => (job.prompt ? null : 'PROMPT_REQUIRED'),
    body(job, params, inputs, offer) {
      return vfCompact({
        prompt: job.prompt,
        image_size: vfResolutionToSize(offer.resolution) || params.image_size || undefined,
        num_images: Math.max(1, Math.floor(vfNum(params.num_images) || 1)),
        quality: params.quality || 'high',
        output_format: params.output_format || 'png',
      });
    },
  },
  'openai/gpt-image-2.5/sunburst/edit': {
    modes: ['image_edit'],
    validate(job, params, inputs) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      if (!vfInputsByRole(inputs, 'edit_source').concat(vfInputsByRole(inputs, 'reference')).length) return 'EDIT_SOURCE_REQUIRED';
      return null;
    },
    body(job, params, inputs, offer) {
      return vfCompact({
        prompt: job.prompt,
        image_urls: vfInputsByRole(inputs, 'edit_source').concat(vfInputsByRole(inputs, 'reference')),
        image_size: vfResolutionToSize(offer.resolution) || params.image_size || undefined,
        num_images: Math.max(1, Math.floor(vfNum(params.num_images) || 1)),
        quality: params.quality || 'high',
        output_format: params.output_format || 'png',
      });
    },
  },
  'fal-ai/flux-2-max': {
    modes: ['text_to_image'],
    validate: (job) => (job.prompt ? null : 'PROMPT_REQUIRED'),
    body(job, params) {
      return vfCompact({
        prompt: job.prompt,
        image_size: params.image_size || 'landscape_16_9',
        output_format: params.output_format || 'png',
        seed: vfNum(params.seed) == null ? undefined : vfNum(params.seed),
      });
    },
  },
  'fal-ai/flux-2-max/edit': {
    modes: ['image_edit'],
    validate(job, params, inputs) {
      if (!job.prompt) return 'PROMPT_REQUIRED';
      if (!vfInputsByRole(inputs, 'edit_source').concat(vfInputsByRole(inputs, 'reference')).length) return 'EDIT_SOURCE_REQUIRED';
      return null;
    },
    body(job, params, inputs) {
      return vfCompact({
        prompt: job.prompt,
        image_urls: vfInputsByRole(inputs, 'edit_source').concat(vfInputsByRole(inputs, 'reference')),
        image_size: params.image_size || 'auto',
        output_format: params.output_format || 'png',
        seed: vfNum(params.seed) == null ? undefined : vfNum(params.seed),
      });
    },
  },
  'fal-ai/veo3.1': { modes: ['text_to_video'], validate: vfFalVeoValidate, body: vfFalVeoBody },
  'fal-ai/veo3.1/fast': { modes: ['text_to_video'], validate: vfFalVeoValidate, body: vfFalVeoBody },
  'fal-ai/elevenlabs/tts/multilingual-v2': {
    modes: ['tts'],
    validate(job, params) {
      if (!job.prompt) return 'TEXT_REQUIRED';
      // Brand narration must pin a voice; never fall back to the provider default voice.
      if (!params.voice) return 'VOICE_REQUIRED';
      return null;
    },
    body(job, params) {
      return vfCompact({
        text: job.prompt,
        voice: params.voice,
        stability: vfNum(params.stability) == null ? undefined : vfNum(params.stability),
        similarity_boost: vfNum(params.similarity_boost) == null ? undefined : vfNum(params.similarity_boost),
        style: vfNum(params.style) == null ? undefined : vfNum(params.style),
        speed: vfNum(params.speed) == null ? undefined : vfNum(params.speed),
        language_code: params.language_code || undefined,
      });
    },
  },
};

function vfFalMinimaxValidate(needsImage) {
  return function (job, params, inputs) {
    if (!job.prompt) return 'PROMPT_REQUIRED';
    if (needsImage && !vfInputsByRole(inputs, 'start_frame').length) return 'START_FRAME_REQUIRED';
    if (!vfIntInRange(vfRequestedDuration(params), 1, 15)) return 'DURATION_UNSUPPORTED_1_TO_15_INTEGER_SECONDS';
    return null;
  };
}

function vfFalMinimaxBody(withImage) {
  return function (job, params, inputs, offer) {
    const body = {
      prompt: job.prompt,
      prompt_expansion_mode: params.prompt_expansion_mode || 'balanced',
      duration: vfRequestedDuration(params),
      // fal's MiniMax enum is upper-case (480P | 768P | 1080P).
      resolution: String(offer.resolution || params.resolution || '768p').toUpperCase(),
      seed: vfNum(params.seed) == null ? undefined : vfNum(params.seed),
    };
    if (withImage) {
      body.image_url = vfInputsByRole(inputs, 'start_frame')[0];
      body.end_image_url = vfInputsByRole(inputs, 'end_frame')[0];
    } else {
      body.aspect_ratio = params.aspect_ratio || '16:9';
    }
    return vfCompact(body);
  };
}

function vfFalVeoValidate(job, params) {
  if (!job.prompt) return 'PROMPT_REQUIRED';
  if (![4, 6, 8].includes(vfRequestedDuration(params))) return 'DURATION_UNSUPPORTED_4_6_8_SECONDS';
  return null;
}

function vfFalVeoBody(job, params, inputs, offer) {
  return vfCompact({
    prompt: job.prompt,
    negative_prompt: job.negative_prompt || undefined,
    duration: vfRequestedDuration(params) + 's',
    resolution: String(offer.resolution || '720p').toLowerCase(),
    aspect_ratio: params.aspect_ratio === '9:16' ? '9:16' : '16:9',
    generate_audio: offer.audio_included === true,
  });
}

function vfFalSupports(offer, job, mode, params, inputs) {
  const mapper = VF_FAL_MAPPERS[offer.provider_model_key];
  if (!mapper) return 'ADAPTER_MAPPING_NOT_IMPLEMENTED';
  if (!mapper.modes.includes(mode)) return 'MODE_MISMATCH';
  return mapper.validate(job, params, inputs, offer);
}

function vfFalBuildRequest(offer, job, params, inputs) {
  const mapper = VF_FAL_MAPPERS[offer.provider_model_key];
  const path = vfFalQueuePath(offer);
  return {
    method: 'POST',
    url: VF_FAL_QUEUE_BASE + '/' + path,
    body: mapper.body(job, params, inputs, offer),
    queue_path: path,
  };
}

const VF_FAL_STATUS_MAP = { IN_QUEUE: 'PENDING', IN_PROGRESS: 'RUNNING', COMPLETED: 'COMPLETED' };

function vfFalDetail(body) {
  if (!body) return '';
  if (typeof body === 'string') return vfTruncate(body, 400);
  const d = body.detail || body.error || body.message;
  return vfTruncate(typeof d === 'string' ? d : JSON.stringify(d || body), 400);
}

function vfFalNormalizeSubmit(http) {
  if (!http.transport_ok) {
    return { accepted: false, provider_job_id: null, status: 'FAILED', error: 'fal submit transport error: ' + http.transport_error, raw_response: null, retryable: true };
  }
  const b = http.body || {};
  if (http.status_code >= 200 && http.status_code < 300 && b.request_id) {
    return {
      accepted: true,
      provider_job_id: String(b.request_id),
      status: VF_FAL_STATUS_MAP[b.status] === 'RUNNING' ? 'RUNNING' : 'PENDING',
      error: null,
      raw_response: vfSafeRaw(b),
      poll: { status_url: b.status_url || null, response_url: b.response_url || null, cancel_url: b.cancel_url || null },
    };
  }
  return {
    accepted: false,
    provider_job_id: null,
    status: 'FAILED',
    error: 'fal submit HTTP ' + http.status_code + ': ' + vfFalDetail(b),
    raw_response: vfSafeRaw(b),
  };
}

function vfFalStatusRequest(attempt, offer) {
  const submit = (attempt.response_payload && attempt.response_payload.submit) || {};
  const poll = submit.poll || {};
  const base = VF_FAL_QUEUE_BASE + '/' + ((attempt.request_payload && attempt.request_payload.provider_request && attempt.request_payload.provider_request.queue_path) || vfFalQueuePath(offer));
  return {
    method: 'GET',
    url: poll.status_url || base + '/requests/' + attempt.external_job_id + '/status',
    response_url: poll.response_url || base + '/requests/' + attempt.external_job_id,
  };
}

// Poll step 1: queue status.
function vfFalNormalizeStatus(http) {
  if (!http.transport_ok) return { status: 'RUNNING', transient: true, error: 'fal status transport error: ' + http.transport_error, raw_response: null };
  const b = http.body || {};
  if (http.status_code === 401 || http.status_code === 403) {
    return { status: 'RUNNING', transient: true, error: 'fal status HTTP ' + http.status_code + ' (credential problem; job left waiting)', raw_response: vfSafeRaw(b) };
  }
  if (http.status_code >= 500 || http.status_code === 429) {
    return { status: 'RUNNING', transient: true, error: 'fal status HTTP ' + http.status_code, raw_response: vfSafeRaw(b) };
  }
  if (http.status_code >= 400) {
    return { status: 'FAILED', error: 'fal status HTTP ' + http.status_code + ': ' + vfFalDetail(b), raw_response: vfSafeRaw(b) };
  }
  const mapped = VF_FAL_STATUS_MAP[b.status];
  if (!mapped) return { status: 'RUNNING', transient: true, error: 'fal status unrecognized: ' + vfTruncate(b.status, 40), raw_response: vfSafeRaw(b) };
  if (mapped === 'COMPLETED') {
    if (b.error) return { status: 'FAILED', error: 'fal reported error: ' + vfTruncate(b.error, 400), raw_response: vfSafeRaw(b) };
    return { status: 'COMPLETED', needs_result_fetch: true, error: null, raw_response: vfSafeRaw(b) };
  }
  return { status: mapped, error: null, raw_response: vfSafeRaw(b) };
}

function vfFalCollectFiles(body) {
  const files = [];
  const push = (f) => {
    if (f && typeof f === 'object' && typeof f.url === 'string') {
      files.push({
        url: f.url,
        mime_type: f.content_type || null,
        size_bytes: vfNum(f.file_size),
        width: vfNum(f.width),
        height: vfNum(f.height),
        duration_seconds: vfNum(f.duration),
        file_name: f.file_name || null,
      });
    }
  };
  if (!body || typeof body !== 'object') return files;
  push(body.video);
  push(body.audio);
  push(body.image);
  for (const img of Array.isArray(body.images) ? body.images : []) push(img);
  return files;
}

// Poll step 2: result payload once the queue reports COMPLETED.
function vfFalNormalizeResult(http) {
  if (!http.transport_ok) return { status: 'RUNNING', transient: true, error: 'fal result transport error: ' + http.transport_error, raw_response: null, result_urls: [], files: [] };
  const b = http.body || {};
  if (http.status_code >= 500 || http.status_code === 429 || http.status_code === 401 || http.status_code === 403) {
    return { status: 'RUNNING', transient: true, error: 'fal result HTTP ' + http.status_code, raw_response: vfSafeRaw(b), result_urls: [], files: [] };
  }
  if (http.status_code >= 400) {
    return { status: 'FAILED', error: 'fal result HTTP ' + http.status_code + ': ' + vfFalDetail(b), raw_response: vfSafeRaw(b), result_urls: [], files: [] };
  }
  const files = vfFalCollectFiles(b);
  if (!files.length) {
    return { status: 'FAILED', error: 'fal result contained no output files', raw_response: vfSafeRaw(b), result_urls: [], files: [] };
  }
  return { status: 'SUCCEEDED', error: null, raw_response: vfSafeRaw(b), result_urls: files.map((f) => f.url), files, credits_consumed: null };
}
