import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFfmpegArgs, computeOutputDimensions, validateOutputProbe } from './encoding.mjs'

test('portrait, landscape, square, high-resolution and small sources stay in frame budget', () => {
  for (const [width, height] of [[1080, 1920], [1920, 1080], [1080, 1080], [3840, 2160], [320, 240]]) {
    const output = computeOutputDimensions(width, height)
    assert.equal(output.width % 2, 0)
    assert.equal(output.height % 2, 0)
    assert.ok(output.width * output.height <= 921600)
    assert.ok(output.width <= 1280 && output.height <= 1280)
    assert.ok(output.width <= width && output.height <= height)
  }
})

test('encoder args request Baseline, Level 3.1, yuv420p, optional audio and faststart', () => {
  const args = buildFfmpegArgs('/tmp/in.mov', '/tmp/out.mp4', 720, 1280)
  const joined = args.join(' ')
  for (const expected of ['-profile:v baseline', '-level:v 3.1', '-pix_fmt yuv420p', '-profile:a aac_low', '-ac 2', '-ar 48000', '-movflags +faststart']) {
    assert.ok(joined.includes(expected), 'missing encoder option ' + expected)
  }
  assert.ok(args.includes('0:a:0?'), 'audio mapping must be optional')
})

test('FFprobe accepts valid H.264 Baseline video with AAC-LC stereo', () => {
  const result = validateOutputProbe({
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', profile: 'Constrained Baseline', level: 31, pix_fmt: 'yuv420p', width: 720, height: 1280, avg_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac', profile: 'LC', sample_rate: '48000', channels: 2 },
    ],
  })
  assert.deepEqual(result, { width: 720, height: 1280, hasAudio: true, frameRate: 30 })
})

test('FFprobe accepts supported video without an audio stream', () => {
  const result = validateOutputProbe({
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{ codec_type: 'video', codec_name: 'h264', profile: 'Baseline', level: 31, pix_fmt: 'yuv420p', width: 960, height: 960, avg_frame_rate: '30/1' }],
  })
  assert.equal(result.hasAudio, false)
})

test('FFprobe rejects invalid pixel format, dimensions and H.264 level', () => {
  const stream = { codec_type: 'video', codec_name: 'h264', profile: 'Baseline', level: 31, pix_fmt: 'yuv420p', width: 720, height: 1280, avg_frame_rate: '30/1' }
  const base = { format: { format_name: 'mp4' }, streams: [stream] }
  assert.throws(() => validateOutputProbe({ ...base, streams: [{ ...stream, pix_fmt: 'yuv444p' }] }), /pixel format/)
  assert.throws(() => validateOutputProbe({ ...base, streams: [{ ...stream, width: 1920, height: 1080 }] }), /dimensions/)
  assert.throws(() => validateOutputProbe({ ...base, streams: [{ ...stream, level: 40 }] }), /level/)
})
