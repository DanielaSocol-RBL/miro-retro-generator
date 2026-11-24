import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildRetrospective, imageTypes, maxImageBytes, maxImages, themes } from '../public/template.js'
import { boardIdPattern, createMiroClient, generateRetrospective, HttpError, listBoards } from './miro.js'

const sessionCookie = 'retro_session'
const sessionLifetime = 8 * 60 * 60 * 1000
const stateLifetime = 10 * 60 * 1000
const publicFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/template.js', ['template.js', 'text/javascript']],
  ['/studio.js', ['studio.js', 'text/javascript']],
].map(([route, [file, type]]) => [
  route, [readFileSync(new URL(`../public/${file}`, import.meta.url)), `${type}; charset=utf-8`],
]))
for (const { artwork } of Object.values(themes)) {
  publicFiles.set(artwork, [readFileSync(new URL(`../public${artwork}`, import.meta.url)), 'image/jpeg'])
}

const opaqueId = () => randomBytes(32).toString('base64url')

export function settingsFrom(env) {
  const port = Number(env.PORT ?? 3000)
  const url = new URL(env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) throw new Error('APP_ORIGIN must be an HTTPS origin or a loopback HTTP origin.')
  const clientId = env.MIRO_CLIENT_ID
  const clientSecret = env.MIRO_CLIENT_SECRET
  if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error('Set both Miro credentials or leave both empty for preview.')
  return {
    clientId, clientSecret, port,
    origin: url.origin, redirectUri: `${url.origin}/oauth/callback`, secure: url.protocol === 'https:',
  }
}

function cookie(id, age, secure) {
  return `${sessionCookie}=${id}; Path=/; Max-Age=${Math.floor(age / 1000)}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function sameState(expected, value) {
  if (!expected || value?.length !== expected.length) return false
  const encoded = Buffer.from(value)
  return encoded.length === expected.length && timingSafeEqual(Buffer.from(expected), encoded)
}

function redirect(response, location) {
  response.writeHead(303, { Location: location }).end()
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function readBody(request, limit) {
  if (Number(request.headers['content-length']) > limit) throw new HttpError(413, 'Request is too large.')
  const chunks = []
  let size = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) {
      request.resume()
      throw new HttpError(413, 'Request is too large.')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    throw new HttpError(400, 'Send a valid JSON request.')
  }
}

async function readGeneration(request) {
  const contentType = request.headers['content-type'] ?? ''
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (type === 'application/json') {
    return { input: parseJson((await readBody(request, 4096)).toString()), images: [] }
  }
  if (type !== 'multipart/form-data') throw new HttpError(415, 'Choose a theme and try generating again.')
  const body = await readBody(request, maxImages * maxImageBytes + 64 * 1024)
  let form
  try {
    form = await new Response(body, { headers: { 'Content-Type': contentType } }).formData()
  } catch {
    throw new HttpError(400, 'The images could not be read. Select the files again.')
  }
  const data = form.get('settings')
  if (typeof data !== 'string' || data.length > 4096) throw new HttpError(400, 'Invalid retrospective settings.')
  const input = parseJson(data)
  const files = form.getAll('images')
  if (files.length > maxImages || !Array.isArray(input?.images) || files.length !== input.images.length) {
    throw new HttpError(400, `Attach up to ${maxImages} images.`)
  }
  const images = []
  for (const [index, file] of files.entries()) {
    if (!(file instanceof File) || !imageTypes.includes(file.type) || !file.size || file.size > maxImageBytes) {
      throw new HttpError(400, 'Use PNG or JPEG images up to 5 MB each.')
    }
    const header = Buffer.from(await file.slice(0, 8).arrayBuffer())
    const signature = file.type === 'image/png' ? '89504e470d0a1a0a' : 'ffd8ff'
    if (!header.toString('hex').startsWith(signature)) throw new HttpError(400, 'An attachment is not a valid PNG or JPEG image.')
    const { width, height } = input.images[index] ?? {}
    if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 32768)) {
      throw new HttpError(400, 'An attachment has unsupported image dimensions.')
    }
    const name = file.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100) || `Image ${index + 1}`
    images.push({ file, name, width, height })
  }
  return { input, images }
}

export function createApp(settings, miro = createMiroClient()) {
  const sessions = new Map()
  const busyBoards = new Set()

  function accessToken(session) {
    if (session.tokens.expiresAt > Date.now() + 30000) return session.tokens.accessToken
    if (!session.tokens.refreshToken) throw new HttpError(401, 'Connect to Miro again.')
    session.refreshing ??= miro.token(settings, {
      grant_type: 'refresh_token', refresh_token: session.tokens.refreshToken,
    }).then(tokens => {
      session.tokens = tokens
      return tokens.accessToken
    }).finally(() => { session.refreshing = undefined })
    return session.refreshing
  }

  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    try {
      const url = new URL(request.url, settings.origin)
      const { pathname, searchParams } = url
      const id = request.headers.cookie?.match(/(?:^|;\s*)retro_session=([\w-]{43})(?:;|$)/)?.[1]
      const now = Date.now()
      const session = sessions.get(id)
      const active = session?.expires > now ? session : undefined
      const isGet = request.method === 'GET'

      if (isGet && publicFiles.has(pathname)) {
        const [bytes, contentType] = publicFiles.get(pathname)
        return response.writeHead(200, { 'Content-Type': contentType }).end(bytes)
      }
      if (isGet && pathname === '/health') return json(response, 200, { ok: true })
      if (request.method === 'POST' && request.headers.origin !== settings.origin) {
        throw new HttpError(403, 'Request origin does not match the app.')
      }
      if (isGet && pathname === '/api/session') {
        return json(response, 200, { configured: Boolean(settings.clientId), connected: Boolean(active?.tokens) })
      }
      if (request.method === 'POST' && pathname === '/oauth/start') {
        if (!settings.clientId) throw new HttpError(503, 'Configure Miro OAuth before connecting.')
        for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key)
        if (sessions.size >= 2000 && !active) throw new HttpError(503, 'Too many active sessions. Try again shortly.')
        sessions.delete(id)
        const pendingId = opaqueId()
        const state = opaqueId()
        sessions.set(pendingId, { state, expires: now + stateLifetime })
        response.setHeader('Set-Cookie', cookie(pendingId, stateLifetime, settings.secure))
        const authorization = new URL('https://miro.com/oauth/authorize')
        authorization.search = new URLSearchParams({
          response_type: 'code', client_id: settings.clientId, redirect_uri: settings.redirectUri, state,
        })
        return json(response, 200, { authorizationUrl: authorization.href })
      }
      if (isGet && pathname === '/oauth/callback') {
        if (!sameState(active?.state, searchParams.get('state'))) return redirect(response, '/?oauth=invalid')
        sessions.delete(id)
        response.setHeader('Set-Cookie', cookie('', 0, settings.secure))
        if (searchParams.has('error')) return redirect(response, '/?oauth=denied')
        const code = searchParams.get('code')
        if (!code || code.length > 2048) return redirect(response, '/?oauth=invalid')
        try {
          const tokens = await miro.token(settings, {
            grant_type: 'authorization_code', code, redirect_uri: settings.redirectUri,
          })
          const authenticatedId = opaqueId()
          sessions.set(authenticatedId, { tokens, expires: Date.now() + sessionLifetime })
          response.setHeader('Set-Cookie', cookie(authenticatedId, sessionLifetime, settings.secure))
          return redirect(response, '/')
        } catch {
          return redirect(response, '/?oauth=failed')
        }
      }
      if (request.method === 'POST' && pathname === '/api/disconnect') {
        sessions.delete(id)
        response.setHeader('Set-Cookie', cookie('', 0, settings.secure))
        return json(response, 200, { connected: false })
      }

      const listing = isGet && pathname === '/api/boards'
      const generating = request.method === 'POST' && pathname === '/api/generate'
      if (!listing && !generating) throw new HttpError(404, 'Page not found.')
      if (!active?.tokens) throw new HttpError(401, 'Connect to Miro first.')
      const call = async (path, payload) => miro.call(await accessToken(active), path, payload)

      if (listing) {
        const offset = Number(searchParams.get('offset') ?? 0)
        if (!Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, 'Invalid board offset.')
        return json(response, 200, await listBoards(call, offset))
      }

      const { input, images } = await readGeneration(request)
      const boardId = input?.boardId
      if (typeof boardId !== 'string' || !boardIdPattern.test(boardId)) throw new HttpError(400, 'Choose a valid Miro board.')
      let template
      try {
        template = buildRetrospective({ ...input, images })
      } catch (error) {
        throw new HttpError(400, error.message)
      }
      if (busyBoards.has(boardId)) throw new HttpError(409, 'A retrospective is already being generated on this board.')
      busyBoards.add(boardId)
      try {
        return json(response, 201, await generateRetrospective(call, boardId, template, images))
      } finally {
        busyBoards.delete(boardId)
      }
    } catch (error) {
      const handled = error instanceof HttpError
      if (!handled) console.error('Unexpected request failure', error.name)
      return json(response, handled ? error.status : 500, {
        error: handled ? error.message : 'Something went wrong. Please try again.',
        ...error.details,
      })
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: { host: { type: 'string', default: '0.0.0.0' }, port: { type: 'string' }, strictPort: { type: 'boolean' } },
  })
  const settings = settingsFrom({ ...process.env, PORT: values.port ?? process.env.PORT })
  createApp(settings).listen(settings.port, values.host, () => {
    console.log(`Miro Retrospective Generator listening on port ${settings.port}`)
  })
}
