export const MAX_FRAME_PIXELS = 921600
export const MAX_OUTPUT_DIMENSION = 1280

function evenFloor(value) {
  return Math.max(2, Math.floor(value / 2) * 2)
}

export function computeOutputDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    throw new Error('Source video dimensions are invalid')
  }
  let bounds
  if (width === height) bounds = { width: 960, height: 960 }
  else if (width > height) bounds = { width: 1280, height: 720 }
  else bounds = { width: 720, height: 1280 }

  const scale = Math.min(1, bounds.width / width, bounds.height / height, Math.sqrt(MAX_FRAME_PIXELS / (width * height)))
  const outputWidth = evenFloor(width * scale)
  const outputHeight = evenFloor(height * scale)
  if (outputWidth * outputHeight > MAX_FRAME_PIXELS ||
      outputWidth > MAX_OUTPUT_DIMENSION || outputHeight > MAX_OUTPUT_DIMENSION) {
    throw new Error('Calculated output dimensions exceed the compatibility profile')
  }
  return { width: outputWidth, height: outputHeight }
}

export function buildFfmpegArgs(inputPath, outputPath, width, height) {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    '-vf', 'scale=' + width + ':' + height + ':flags=lanczos,fps=30',
    '-fps_mode', 'cfr',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level:v', '3.1',
    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
    '-maxrate', '2M', '-bufsize', '4M', '-g', '60', '-keyint_min', '60',
    '-sc_threshold', '0', '-x264-params', 'cabac=0:bframes=0:ref=1:weightp=0',
    '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-ac', '2', '-ar', '48000',
    '-movflags', '+faststart', '-f', 'mp4', outputPath,
  ]
}

function parseFrameRate(value) {
  if (typeof value !== 'string') return 0
  const parts = value.split('/').map(Number)
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1]) || parts[1] === 0) return 0
  return parts[0] / parts[1]
}

export function validateOutputProbe(probe) {
  const streams = Array.isArray(probe && probe.streams) ? probe.streams : []
  const video = streams.find(stream => stream.codec_type === 'video')
  if (!video) throw new Error('Output has no video stream')
  const formatName = String((probe.format && probe.format.format_name) || '')
  if (!formatName.split(',').some(name => name === 'mp4' || name === 'mov')) throw new Error('Output container is not MP4')
  if (video.codec_name !== 'h264') throw new Error('Output video codec is not H.264')
  if (!String(video.profile || '').toLowerCase().includes('baseline')) throw new Error('Output H.264 profile is not Baseline')
  if (Number(video.level) !== 31) throw new Error('Output H.264 level is not 3.1')
  if (video.pix_fmt !== 'yuv420p') throw new Error('Output pixel format is not yuv420p')

  const width = Number(video.width)
  const height = Number(video.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
      width > MAX_OUTPUT_DIMENSION || height > MAX_OUTPUT_DIMENSION || width * height > MAX_FRAME_PIXELS) {
    throw new Error('Output dimensions exceed the H.264 Level 3.1 frame-size budget')
  }
  const frameRate = parseFrameRate(video.avg_frame_rate || video.r_frame_rate)
  if (Math.abs(frameRate - 30) > 0.05) throw new Error('Output frame rate is not 30 FPS')

  const audio = streams.find(stream => stream.codec_type === 'audio')
  if (audio) {
    if (audio.codec_name !== 'aac') throw new Error('Output audio codec is not AAC')
    if (!String(audio.profile || '').toUpperCase().includes('LC')) throw new Error('Output audio profile is not AAC-LC')
    if (Number(audio.sample_rate) !== 48000) throw new Error('Output audio sample rate is not 48 kHz')
    if (Number(audio.channels) !== 2) throw new Error('Output audio is not stereo')
  }
  return { width, height, hasAudio: Boolean(audio), frameRate }
}
