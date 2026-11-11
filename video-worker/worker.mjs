import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFfmpegArgs, computeOutputDimensions, validateOutputProbe } from './encoding.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN_ONCE = process.env.RUN_ONCE === 'true'
const BATCH_SIZE = Math.max(1, Math.min(10, Number.parseInt(process.env.BATCH_SIZE || '2', 10) || 2))
const POLL_INTERVAL_MS = Math.max(1000, Number.parseInt(process.env.POLL_INTERVAL_MS || '5000', 10) || 5000)
const MAX_SOURCE_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_BYTES = 350 * 1024 * 1024
const PROCESS_TIMEOUT_MS = 12 * 60 * 1000

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing required SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function runCommand(command, args, timeoutMs = PROCESS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const append = (current, chunk) => (current + chunk.toString()).slice(-20000)
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(command + ' exceeded the processing timeout'))
    }, timeoutMs)
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('close', code => {
      clearTimeout(timeout)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(command + ' exited with code ' + code + ': ' + (stderr || stdout)))
    })
  })
}

async function probe(filePath) {
  const result = await runCommand('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath], 60000)
  return JSON.parse(result.stdout)
}

async function hasFaststart(filePath) {
  const file = await open(filePath, 'r')
  try {
    const info = await file.stat()
    let offset = 0
    let moovOffset = -1
    let mdatOffset = -1
    while (offset + 8 <= info.size) {
      const header = Buffer.alloc(16)
      const result = await file.read(header, 0, 16, offset)
      if (result.bytesRead < 8) break
      let atomSize = header.readUInt32BE(0)
      const atomType = header.toString('ascii', 4, 8)
      let headerSize = 8
      if (atomSize === 1) {
        if (result.bytesRead < 16) break
        const extended = header.readBigUInt64BE(8)
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) break
        atomSize = Number(extended)
        headerSize = 16
      } else if (atomSize === 0) {
        atomSize = info.size - offset
      }
      if (atomType === 'moov') moovOffset = offset
      if (atomType === 'mdat') mdatOffset = offset
      if (atomSize < headerSize) break
      offset += atomSize
    }
    return moovOffset >= 0 && mdatOffset >= 0 && moovOffset < mdatOffset
  } finally {
    await file.close()
  }
}

function safeSourcePath(job) {
  if (job.bucket !== 'posts' || typeof job.original_path !== 'string') return false
  const parts = job.original_path.split('/')
  return parts.length === 2 && parts[0] === job.owner_id &&
    parts.every(part => part && part !== '.' && part !== '..' && !part.includes('\\'))
}

function errorText(error) {
  return String((error && error.message) || error || 'Unknown processing error').slice(0, 1800)
}

async function failJob(job, error) {
  const exhausted = Number(job.attempts) >= Number(job.max_attempts || 5)
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, Number(job.attempts) - 1)))
  const { error: updateError } = await supabase.from('video_processing_jobs').update({
    status: exhausted ? 'failed' : 'queued',
    available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    locked_until: null,
    lease_token: null,
    last_error: errorText(error),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('lease_token', job.lease_token).eq('status', 'processing')

  if (updateError) console.error('Could not persist video job failure:', updateError.message)
  else console.error('Video job ' + job.id + (exhausted ? ' failed permanently: ' : ' scheduled for retry: ') + errorText(error))
}

async function renewLease(job) {
  const { data, error } = await supabase.from('video_processing_jobs').update({
    locked_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('lease_token', job.lease_token).eq('status', 'processing').select('id').maybeSingle()
  if (error) console.warn('Could not renew video job lease:', error.message)
  else if (!data) console.warn('Video job lease is no longer owned by this worker:', job.id)
}

async function processJob(job) {
  if (!safeSourcePath(job)) throw new Error('Queue job contains an unsafe source object path')
  const tempDir = await mkdtemp(join(tmpdir(), 'socialens-video-'))
  const inputPath = join(tempDir, 'source')
  const outputPath = join(tempDir, 'compatible.mp4')

  try {
    const downloaded = await supabase.storage.from('posts').download(job.original_path)
    if (downloaded.error || !downloaded.data) throw downloaded.error || new Error('Could not download source video')
    const sourceBuffer = Buffer.from(await downloaded.data.arrayBuffer())
    if (!sourceBuffer.length || sourceBuffer.length > MAX_SOURCE_BYTES) throw new Error('Source video is empty or exceeds the 100 MB worker limit')
    if (job.source_bytes && Math.abs(sourceBuffer.length - Number(job.source_bytes)) > 1024) {
      console.warn('Video job ' + job.id + ': registered source size differs from downloaded size')
    }
    await writeFile(inputPath, sourceBuffer)

    const sourceProbe = await probe(inputPath)
    const sourceVideo = (sourceProbe.streams || []).find(stream => stream.codec_type === 'video')
    if (!sourceVideo) throw new Error('Source file does not contain a video stream')
    let sourceWidth = Number(sourceVideo.width)
    let sourceHeight = Number(sourceVideo.height)
    const rotationItem = (sourceVideo.side_data_list || []).find(item => Number.isFinite(Number(item.rotation)))
    const rotation = Number((sourceVideo.tags && sourceVideo.tags.rotate) || (rotationItem && rotationItem.rotation) || 0)
    if (Math.abs(rotation) % 180 === 90) [sourceWidth, sourceHeight] = [sourceHeight, sourceWidth]
    const dimensions = computeOutputDimensions(sourceWidth, sourceHeight)

    await runCommand('ffmpeg', buildFfmpegArgs(inputPath, outputPath, dimensions.width, dimensions.height))
    const outputInfo = await stat(outputPath)
    if (!outputInfo.size || outputInfo.size > MAX_OUTPUT_BYTES) throw new Error('Converted video is empty or exceeds the 150 MB output limit')

    const outputProbe = await probe(outputPath)
    const validated = validateOutputProbe(outputProbe)
    if (validated.width !== dimensions.width || validated.height !== dimensions.height) {
      throw new Error('FFprobe dimensions do not match the calculated output dimensions')
    }
    if (!(await hasFaststart(outputPath))) throw new Error('MP4 faststart validation failed: moov atom is not before mdat')

    const playbackPath = 'video-renditions/' + job.owner_id + '/' + job.id + '.mp4'
    const outputBuffer = await readFile(outputPath)
    const { error: uploadError } = await supabase.storage.from('posts').upload(playbackPath, outputBuffer, {
      upsert: true,
      contentType: 'video/mp4',
      cacheControl: '31536000',
    })
    if (uploadError) throw uploadError

    const completed = await supabase.from('video_processing_jobs').update({
      status: 'ready',
      playback_path: playbackPath,
      output_bytes: outputInfo.size,
      locked_until: null,
      lease_token: null,
      last_error: null,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq('id', job.id).eq('lease_token', job.lease_token).eq('status', 'processing').select('id').maybeSingle()

    if (completed.error) throw completed.error
    if (!completed.data) throw new Error('Processing lease expired before completion; output will be safely retried')
    console.log('Video job ' + job.id + ' ready (' + validated.width + 'x' + validated.height + ', ' + outputInfo.size + ' bytes)')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function claimJobs() {
  const { data, error } = await supabase.rpc('claim_video_processing_jobs', { p_limit: BATCH_SIZE })
  if (error) throw new Error('Could not claim video processing jobs: ' + error.message)
  return data || []
}

async function run() {
  do {
    const jobs = await claimJobs()
    if (!jobs.length) {
      if (RUN_ONCE) {
        console.log('No queued video processing jobs')
        return
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      continue
    }
    // Renew every claimed lease immediately, including jobs waiting behind
    // an earlier item in this sequential batch.
    const leaseHeartbeats = new Map(jobs.map(job => {
      const timer = setInterval(() => { void renewLease(job) }, 5 * 60 * 1000)
      timer.unref?.()
      return [job.id, timer]
    }))
    try {
      for (const job of jobs) {
        try {
          await processJob(job)
        } catch (error) {
          await failJob(job, error)
        } finally {
          clearInterval(leaseHeartbeats.get(job.id))
        }
      }
    } finally {
      for (const timer of leaseHeartbeats.values()) clearInterval(timer)
    }
    if (RUN_ONCE) return
  } while (true)
}

run().catch(error => {
  console.error('Video worker stopped:', errorText(error))
  process.exitCode = 1
})
