import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp, settingsFrom } from '../src/server.js'
import { createMiroClient } from '../src/miro.js'
import { customDefaults } from '../public/template.js'

const origin = 'https://retro.example'
const settings = settingsFrom({
  APP_ORIGIN: origin,
  MIRO_CLIENT_ID: 'client-id',
  MIRO_CLIENT_SECRET: 'server-secret',
})

async function startApp(t, miro, config = settings) {
  const server = createApp(config, miro)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return (path, options) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, redirect: 'manual' })
}

const post = (data, headers = {}) => ({
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(data),
})
const getCookie = response => response.headers.get('set-cookie').split(';')[0]

test('OAuth validates state, rotates the secure session, and refreshes before generating', async t => {
  let tokenCalls = 0
  let writes = 0
  const miro = createMiroClient(async (url, options) => {
    const request = new URL(url)
    if (request.pathname === '/v1/oauth/token') {
      assert.equal(options.method, 'POST')
      tokenCalls++
      assert.equal(request.search, '')
      const params = options.body
      assert.equal(params.get('client_secret'), 'server-secret')
      if (params.get('grant_type') === 'authorization_code') {
        assert.equal(params.get('code'), 'callback-code')
        assert.equal(params.get('redirect_uri'), origin + '/oauth/callback')
        return Response.json({ access_token: 'initial-token', refresh_token: 'refresh', expires_in: 1 })
      }
      assert.equal(params.get('refresh_token'), 'refresh')
      return Response.json({ access_token: 'renewed-token', expires_in: 3600 })
    }
    assert.equal(options.headers.Authorization, 'Bearer renewed-token')
    if (request.pathname === '/v2/boards') {
      const offset = Number(request.searchParams.get('offset'))
      const data = offset === 0 ? [{ id: 'MiroBoard=', name: 'Team board' }] : [{ id: 'Another=', name: 'More boards' }]
      return Response.json({ data, total: 2 })
    }
    if (request.pathname.endsWith('/items')) return Response.json({ data: [] })
    assert.equal(options.method, 'POST')
    return Response.json({ id: String(++writes) })
  })
  const app = await startApp(t, miro)

  const before = await app('/api/generate', post({}))
  assert.equal(before.status, 401)
  assert.equal((await app('/oauth/start', post({}, { Origin: 'https://different.example' }))).status, 403)
  const start = await app('/oauth/start', post({}))
  const pendingCookie = getCookie(start)
  const { authorizationUrl } = await start.json()
  const authorization = new URL(authorizationUrl)
  assert.equal(authorization.origin, 'https://miro.com')
  assert.equal(authorization.searchParams.get('client_id'), 'client-id')
  assert.ok(!authorizationUrl.includes('server-secret'))
  const state = authorization.searchParams.get('state')
  assert.ok(state)

  const callback = `/oauth/callback?code=callback-code&state=${state}`
  assert.equal((await app(callback)).headers.get('location'), '/?oauth=invalid')
  const invalid = await app('/oauth/callback?code=callback-code&state=wrong', { headers: { Cookie: pendingCookie } })
  assert.equal(invalid.headers.get('location'), '/?oauth=invalid')
  assert.equal(tokenCalls, 0)
  const authorized = await app(callback, { headers: { Cookie: pendingCookie } })
  assert.equal(authorized.headers.get('location'), '/')
  assert.match(authorized.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Secure/)
  const cookie = getCookie(authorized)
  assert.notEqual(cookie, pendingCookie)
  assert.ok(!cookie.includes('initial-token'))
  const replay = await app(callback, { headers: { Cookie: pendingCookie } })
  assert.equal(replay.headers.get('location'), '/?oauth=invalid')
  const headers = { Cookie: cookie }
  const [boards, next] = await Promise.all([
    app('/api/boards', { headers }).then(response => response.json()),
    app('/api/boards?offset=1', { headers }).then(response => response.json()),
  ])
  assert.deepEqual(boards, { boards: [{ id: 'MiroBoard=', name: 'Team board' }], nextOffset: 1 })
  assert.deepEqual(next, { boards: [{ id: 'Another=', name: 'More boards' }], nextOffset: null })
  assert.equal(tokenCalls, 2)

  const invalidBoard = await app('/api/generate', post({ theme: 'autumn', sprint: '3.15', boardId: '../board' }, headers))
  assert.equal(invalidBoard.status, 400)
  assert.equal(writes, 0)
  const generated = await app('/api/generate', post({ theme: 'autumn', sprint: '3.15', boardId: 'MiroBoard=' }, headers))
  assert.equal(generated.status, 201)
  const result = await generated.json()
  assert.equal(result.frameIds.length, 7)
  assert.equal(result.createdItems, writes)
  assert.equal((await app('/api/disconnect', post({}, headers))).status, 200)
  assert.equal((await app('/api/boards', { headers })).status, 401)
})

test('preview can run without Miro credentials and refuses externally hosted plain HTTP', async t => {
  const app = await startApp(t, { call() { assert.fail('Preview should never call Miro') } }, settingsFrom({}))
  const response = await app('/')
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Board preview/)
  for (const path of ['/app.js', '/template.js', '/style.css', '/health']) {
    assert.equal((await app(path)).status, 200)
  }
  assert.deepEqual(await app('/api/session').then(result => result.json()), { configured: false, connected: false })
  assert.equal(settingsFrom({}).redirectUri, 'http://localhost:3000/oauth/callback')
  assert.throws(() => settingsFrom({ APP_ORIGIN: 'http://retro.example' }), /HTTPS origin/)
})

test('uses the public Render URL for OAuth and honors a custom origin', () => {
  const env = { PORT: '10000', RENDER_EXTERNAL_URL: 'https://retro.onrender.com/' }
  assert.deepEqual(settingsFrom(env), {
    clientId: undefined,
    clientSecret: undefined,
    port: 10000,
    origin: 'https://retro.onrender.com',
    redirectUri: 'https://retro.onrender.com/oauth/callback',
    secure: true,
  })
  assert.equal(settingsFrom({ ...env, APP_ORIGIN: origin }).redirectUri, origin + '/oauth/callback')
})

test('copies validated uploaded bytes to a native Miro image in the generated gallery', async t => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XsAAAAASUVORK5CYII=', 'base64')
  const images = []
  let writes = 0
  const app = await startApp(t, createMiroClient(async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/v1/oauth/token') return Response.json({ access_token: 'token' })
    if (path.endsWith('/items')) return Response.json({ data: [] })
    if (path.endsWith('/images')) {
      assert.equal(options.headers.Authorization, 'Bearer token')
      assert.equal(options.headers['Content-Type'], undefined)
      const outgoing = new Request(url, options)
      assert.match(outgoing.headers.get('content-type'), /^multipart\/form-data; boundary=/)
      const form = await outgoing.formData()
      const data = form.get('data')
      images.push({
        settings: JSON.parse(typeof data === 'string' ? data : await data.text()),
        file: form.get('resource'),
      })
    }
    return Response.json({ id: String(++writes) })
  }))
  const start = await app('/oauth/start', post({}))
  const pending = getCookie(start)
  const { authorizationUrl } = await start.json()
  const state = new URL(authorizationUrl).searchParams.get('state')
  const callback = await app(`/oauth/callback?code=test&state=${state}`, { headers: { Cookie: pending } })
  const Cookie = getCookie(callback)

  const upload = (bytes, type = 'image/png') => {
    const body = new FormData()
    body.append('settings', JSON.stringify({
      boardId: 'MiroBoard=', sprint: '4.12', theme: 'custom', customTheme: { ...customDefaults, name: 'Space crew' },
      images: [{ width: 1, height: 1 }],
    }))
    body.append('images', new Blob([bytes], { type }), 'sample.png')
    return app('/api/generate', { method: 'POST', headers: { Origin: origin, Cookie }, body })
  }
  assert.equal((await upload('fake bytes')).status, 400)
  assert.equal((await upload(png, 'image/gif')).status, 400)
  assert.equal(writes, 0)

  const response = await upload(png)
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.frameIds.length, 8)
  assert.equal(images.length, 1)
  const [{ settings, file }] = images
  assert.deepEqual(settings, {
    title: 'sample.png', altText: 'sample.png', position: { x: 233, y: 233 },
    geometry: { width: 225, height: 225 }, parent: { id: result.frameIds.at(-1) },
  })
  assert.equal(file.type, 'image/png')
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
})
