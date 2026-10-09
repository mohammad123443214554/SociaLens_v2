import crypto from 'crypto'
import WebSocket from 'ws'

// ------------------------------------------------------------------
// Talks to Microsoft's own "Read Aloud" text-to-speech service - the
// Same free, keyless, neural-voice engine built into Edge's Immersive
// Reader. There's no official API for this; every implementation
// (Python's edge-tts, several Node/Rust ports) works the same way: mimic
// an Edge browser's WebSocket handshake to Microsoft's speech service.
//
// Microsoft periodically rotates SEC_MS_GEC_VERSION below - when EVERY
// request starts failing with a 403/handshake error, that constant
// being stale is almost always why; the fix is pinning it (and the
// matching Chrome/Edge version in the User-Agent) to a current release.
// ------------------------------------------------------------------

// Unchanged for years across every known implementation - this is a
// fixed, public value, not something that goes stale.
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'

// This DOES go stale - it's "1-<edge browser version>". If speech
// synthesis starts failing entirely, check the latest stable Edge/Chrome
// version and update both this and the User-Agent below to match.
const SEC_MS_GEC_VERSION = '1-143.0.3650.75'
const CHROME_VERSION = '143.0.3650.75'

const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36 Edg/${CHROME_VERSION}`
// A fixed value every edge-tts implementation uses - identifies the
// connection the way Edge's own Read Aloud extension would.
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'

const WIN_EPOCH_OFFSET_SECONDS = 11644473600 // seconds between 1601-01-01 and the Unix epoch
const HUNDRED_NS_PER_SECOND = 10_000_000

/**
 * Microsoft's server requires a DRM-style token derived from the current
 * time (rounded down to a 5-minute window) plus the trusted client
 * token, SHA-256 hashed. Recomputed fresh for every request.
 */
function generateSecMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH_OFFSET_SECONDS
  ticks -= ticks % 300
  const ticksIn100ns = BigInt(ticks) * BigInt(HUNDRED_NS_PER_SECOND)
  const strToHash = `${ticksIn100ns.toString()}${TRUSTED_CLIENT_TOKEN}`
  return crypto.createHash('sha256').update(strToHash, 'utf-8').digest('hex').toUpperCase()
}

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex')
}

// Microsoft's service expects the timestamp in the exact format a
// browser's `new Date().toString()` produces (not ISO, not toUTCString) -
// every known working implementation reproduces this precise shape.
function edgeTimestamp(): string {
  const d = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()} ${time} GMT+0000 (Coordinated Universal Time)`
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export interface EdgeTtsOptions {
  voice: string
  rate?: string
  pitch?: string
  volume?: string
  /** Milliseconds before giving up on the whole synthesis. */
  timeoutMs?: number
}

/**
 * Synthesizes speech via Microsoft's Edge Read Aloud service and returns
 * the finished MP3 as a single Buffer. Throws on any failure - callers
 * should catch this and fall back to the browser's own built-in voice,
 * since Microsoft's server-side acceptance of this workaround is known
 * to be intermittent (they've been actively discouraging it since
 * December 2025) - no implementation of this protocol can guarantee
 * 100% uptime, only degrade gracefully when it's down.
 */
export function synthesizeEdgeTts(text: string, options: EdgeTtsOptions): Promise<Buffer> {
  const { voice, rate = '+0%', pitch = '+0Hz', volume = '+0%', timeoutMs = 20000 } = options

  return new Promise((resolve, reject) => {
    const connectionId = randomHex(16)
    const requestId = randomHex(16)
    const secMsGec = generateSecMsGec()

    const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Origin: ORIGIN,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    })

    const chunks: Buffer[] = []
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      ws.terminate()
      reject(new Error('Edge TTS timed out'))
    }, timeoutMs)

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try { ws.close() } catch { /* already closing */ }
      if (err) reject(err)
      else resolve(Buffer.concat(chunks))
    }

    ws.on('open', () => {
      const timestamp = edgeTimestamp()

      const configMessage =
        `X-Timestamp:${timestamp}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
      ws.send(configMessage)

      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${escapeSsml(text)}</prosody>` +
        `</voice></speak>`

      const ssmlMessage =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}\r\n` +
        `Path:ssml\r\n\r\n${ssml}`
      ws.send(ssmlMessage)
    })

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) {
        const text = data.toString('utf-8')
        if (text.includes('Path:turn.end')) {
          finish()
        } else if (text.includes('Path:audio.metadata')) {
          // Word-boundary timing data - not needed for a plain read-aloud.
        }
        return
      }

      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      if (buf.length < 2) return
      // First 2 bytes: big-endian length of the header text block that
      // precedes the raw audio bytes in this chunk.
      const headerLength = buf.readUInt16BE(0)
      const header = buf.subarray(2, 2 + headerLength).toString('utf-8')
      if (header.includes('Path:audio')) {
        chunks.push(buf.subarray(2 + headerLength))
      }
    })

    ws.on('error', (err) => finish(err instanceof Error ? err : new Error(String(err))))
    ws.on('close', () => {
      if (!settled) {
        finish(chunks.length > 0 ? undefined : new Error('Edge TTS connection closed with no audio'))
      }
    })
  })
}
