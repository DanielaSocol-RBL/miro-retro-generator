import { setTimeout as delay } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import { themes } from '../public/template.js'

const api = 'https://api.miro.com'
const resources = { shape: 'shapes', text: 'texts', sticky_note: 'sticky_notes' }
const themeArtwork = new Map(Object.values(themes).map(({ artwork }) => [
  artwork, new Blob([readFileSync(new URL(`../public${artwork}`, import.meta.url))], { type: 'image/jpeg' }),
]))
export const boardIdPattern = /^[A-Za-z0-9_+=-]{1,100}$/
const boardPath = id => `/v2/boards/${encodeURIComponent(id)}`

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function miroError(status) {
  if (status === 401) return new HttpError(401, 'Your Miro session has expired. Connect to Miro again.')
  if (status === 403) return new HttpError(403, 'Miro denied access. Check your board permissions and the app scopes.')
  if (status === 404) return new HttpError(404, 'Miro could not find this board or item.')
  if (status === 429) return new HttpError(429, 'Miro is rate limiting requests. Try again in a minute.')
  return new HttpError(502, 'Miro could not complete the request.')
}

export function createMiroClient(fetcher = fetch) {
  async function request(url, options = {}) {
    try {
      return await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) })
    } catch {
      throw new HttpError(502, 'Miro did not respond. Check the board before trying again.')
    }
  }

  async function json(response) {
    try {
      return await response.json()
    } catch {
      throw miroError(502)
    }
  }

  return {
    async token(settings, grant) {
      const params = new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        ...grant,
      })
      const response = await request(`${api}/v1/oauth/token`, { method: 'POST', body: params })
      if (!response.ok) throw new HttpError(401, 'Miro authorization failed. Please connect again.')
      const data = await json(response)
      if (typeof data.access_token !== 'string' || !data.access_token) throw miroError(502)
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in > 0 ? Date.now() + Number(data.expires_in) * 1000 : Infinity,
      }
    },

    async call(accessToken, path, body) {
      const options = { headers: { Authorization: `Bearer ${accessToken}` } }
      if (body) {
        options.method = 'POST'
        if (body instanceof FormData) {
          options.body = body
        } else {
          options.headers['Content-Type'] = 'application/json'
          options.body = JSON.stringify(body)
        }
      }
      for (let attempt = 0; ; attempt++) {
        const response = await request(api + path, options)
        if (response.ok) return json(response)
        // A rate-limited request was rejected by Miro. Ambiguous write failures are never retried.
        if (response.status !== 429 || attempt === 2) throw miroError(response.status)
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now()
        const wait = Math.max(500 * 2 ** attempt, reset)
        if (wait > 5000) throw miroError(429)
        await response.body?.cancel()
        await delay(wait)
      }
    },
  }
}

export async function listBoards(call, offset) {
  const page = await call(`/v2/boards?limit=50&offset=${offset}`)
  return {
    boards: page.data
      .filter(board => typeof board.id === 'string' && boardIdPattern.test(board.id))
      .map(board => ({ id: board.id, name: board.name })),
    nextOffset: offset + page.data.length < page.total && page.data.length
      ? offset + page.data.length : null,
  }
}

const escapeHtml = content => content.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
const richText = content => content.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')

export function itemPayload(item, frameId) {
  const itemData = {
    data: { content: richText(item.content) },
    position: { x: item.x, y: item.y },
    geometry: { width: item.width },
    parent: { id: frameId },
  }
  if (item.type === 'text') {
    itemData.style = { color: item.color, fontSize: String(item.fontSize), fontFamily: 'open_sans', textAlign: 'center' }
  } else if (item.type === 'shape') {
    itemData.data.shape = item.kind
    itemData.geometry.height = item.height
    itemData.style = { fillColor: item.fill, color: item.color, fontSize: '27', borderOpacity: '0' }
  } else {
    itemData.data.shape = 'square'
    itemData.style = { fillColor: item.fill, textAlign: 'center', textAlignVertical: 'middle' }
  }
  return itemData
}

async function placement(call, path) {
  const seen = new Set()
  const locations = new Map()
  let cursor
  do {
    const query = new URLSearchParams({ limit: '50' })
    if (cursor) query.set('cursor', cursor)
    const page = await call(`${path}/items?${query}`)
    for (const item of page.data) locations.set(item.id, item)
    cursor = page.cursor
    if (cursor && seen.has(cursor)) throw miroError(502)
    seen.add(cursor)
  } while (cursor)

  // Resolve children to canvas coordinates because Miro reports their centers relative to their frame.
  function centerX(item) {
    if (!Number.isFinite(item.position?.x)) return null
    if (!item.parent?.id || item.position.relativeTo === 'canvas_center') return item.position.x
    const parent = locations.get(item.parent.id)
    if (!parent || parent.parent?.id || !Number.isFinite(parent.position?.x)) return null
    return parent.position.x - (parent.geometry?.width ?? 0) / 2 + item.position.x
  }

  let right = -Infinity
  for (const item of locations.values()) {
    const center = centerX(item)
    if (center === null) continue
    const { width = 0, height = 0, rotation = 0 } = item.geometry ?? {}
    const radians = rotation * Math.PI / 180
    const halfWidth = (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) / 2
    right = Math.max(right, center + (Number.isFinite(halfWidth) ? halfWidth : 0))
  }
  return Number.isFinite(right) ? Math.max(0, Math.ceil(right + 420)) : 0
}

function createdId(value) {
  if (typeof value?.id !== 'string' || !value.id) throw miroError(502)
  return value.id
}

function imagePayload(item, frameId, file) {
  const payload = new FormData()
  const settings = {
    title: item.content,
    altText: item.content,
    position: { x: item.x, y: item.y },
    geometry: { width: item.width, height: item.height },
    parent: { id: frameId },
  }
  payload.append('data', new Blob([JSON.stringify(settings)], { type: 'application/json' }), '')
  payload.append('resource', file, file.type === 'image/png' ? 'attachment.png' : 'attachment.jpg')
  return payload
}

export async function generateRetrospective(call, boardId, template, images = []) {
  const path = boardPath(boardId)
  const x = await placement(call, path)
  const baseUrl = `https://miro.com/app/board/${encodeURIComponent(boardId)}/`
  const frameIds = []
  let createdItems = 0
  try {
    for (const frame of template.frames) {
      const result = await call(`${path}/frames`, {
        data: { title: frame.title, format: 'custom', type: 'freeform' },
        style: { fillColor: frame.fill },
        position: { x: x + frame.x + frame.width / 2, y: frame.y + frame.height / 2 },
        geometry: { width: frame.width, height: frame.height },
      })
      const frameId = createdId(result)
      frameIds.push(frameId)
      createdItems++
      for (const item of frame.items) {
        const result = item.type === 'image'
          ? await call(`${path}/images`, imagePayload(item, frameId, item.artwork ? themeArtwork.get(item.artwork) : images[item.index].file))
          : await call(`${path}/${resources[item.type]}`, itemPayload(item, frameId))
        createdId(result)
        createdItems++
      }
    }
  } catch (cause) {
    const error = new HttpError(cause.status ?? 502, `${cause.message} Generation was interrupted. Check the board for a partial retrospective before retrying.`)
    error.details = { boardUrl: baseUrl, frameIds, createdItems }
    throw error
  }
  return { boardUrl: `${baseUrl}?moveToWidget=${encodeURIComponent(frameIds[0])}`, frameIds, createdItems }
}
