import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRetrospective, defaultSprint, themes } from '../public/template.js'
import { generateRetrospective, HttpError, itemPayload } from '../src/miro.js'

test('Autumn Sprint 3.15 includes the seven activities and reusable placeholders', () => {
  const layout = buildRetrospective({ theme: 'autumn', sprint: defaultSprint })
  assert.equal(layout.title, 'Autumn RETRO — Sprint 3.15')
  assert.deepEqual(layout.frames.map(frame => frame.title), [
    layout.title, 'Harvest', 'Falling Leaves', 'Seeds for Spring', 'Weather Watch', 'Action items', 'Closing activity',
  ])
  const content = layout.frames.flatMap(frame => frame.items.map(item => item.content)).join('\n')
  for (const placeholder of ['[Team members]', '[Start date]', '[End date]', '[Retrospective note]', '[Action]', '[Owner]', '[Due date]']) {
    assert.ok(content.includes(placeholder), placeholder)
  }
})

test('all themes generate distinct prompts and keep editable items within their frames', () => {
  const prompts = new Set()
  for (const theme of Object.keys(themes)) {
    const layout = buildRetrospective({ theme, sprint: '4.02' })
    assert.match(layout.title, /Sprint 4\.02$/)
    prompts.add(layout.frames[1].items[1].content)
    assert.equal(layout.frames.length, 7)
    for (const frame of layout.frames) {
      assert.ok(frame.x + frame.width <= layout.width)
      assert.ok(frame.y + frame.height <= layout.height)
      for (const item of frame.items) {
        const height = item.height ?? item.fontSize * 1.25
        assert.ok(item.x - item.width / 2 >= 0)
        assert.ok(item.y - height / 2 >= 0)
        assert.ok(item.x + item.width / 2 <= frame.width)
        assert.ok(item.y + height / 2 <= frame.height)
      }
    }
  }
  assert.equal(prompts.size, 3)
  assert.throws(() => buildRetrospective({ theme: '__proto__', sprint: '3.15' }), /Choose Autumn/)
  assert.throws(() => buildRetrospective({ theme: 'autumn', sprint: '<img>' }), /sprint number/)
})

test('writes only new frames and native items and places them beyond paginated content', async () => {
  const template = buildRetrospective({ theme: 'autumn', sprint: '3.15' })
  const writes = []
  const result = await generateRetrospective(async (path, body) => {
    if (body) {
      writes.push({ path, body })
      return { id: String(writes.length) }
    }
    if (path.endsWith('limit=50')) {
      return { data: [{ id: 'existing', position: { x: 200 }, geometry: { width: 300 } }], cursor: 'second=' }
    }
    assert.match(path, /cursor=second%3D/)
    return { data: [{ id: 'rotated', position: { x: 1000 }, geometry: { width: 50, height: 360, rotation: 90 } }] }
  }, 'board=', template)
  assert.equal(writes[0].path, '/v2/boards/board%3D/frames')
  assert.equal(writes[0].body.position.x, 1000 + 180 + 420 + 660)
  assert.equal(result.createdItems, writes.length)
  assert.equal(result.frameIds.length, 7)
  assert.match(result.boardUrl, /moveToWidget=1$/)
  let writeIndex = 0
  for (const [frameIndex, frame] of template.frames.entries()) {
    writeIndex++
    for (const { x, y } of frame.items) {
      const { parent, position } = writes[writeIndex++].body
      assert.equal(parent.id, result.frameIds[frameIndex])
      assert.deepEqual(position, { x, y })
    }
  }
  for (const endpoint of ['shapes', 'texts', 'sticky_notes']) {
    assert.ok(writes.some(write => write.path.endsWith('/' + endpoint)))
  }
})

test('an interrupted write reports created items without modifying or retrying anything', async () => {
  const template = buildRetrospective({ theme: 'autumn', sprint: '3.15' })
  const paths = []
  await assert.rejects(generateRetrospective(async (path, body) => {
    if (!body) return { data: [] }
    paths.push(path)
    if (paths.length === 2) throw new HttpError(502, 'Miro did not respond.')
    return { id: 'new-frame' }
  }, 'board', template), error => {
    assert.equal(error.status, 502)
    assert.deepEqual(error.details.frameIds, ['new-frame'])
    assert.equal(error.details.createdItems, 1)
    assert.match(error.message, /partial retrospective/)
    return true
  })
  assert.deepEqual(paths, ['/v2/boards/board/frames', '/v2/boards/board/shapes'])
})

test('text content is escaped and sticky payloads use the native square aspect ratio', () => {
  const payload = itemPayload({
    type: 'sticky_note', content: '<one> & two\nNext', x: 100, y: 120, width: 132, fill: 'orange',
  }, 'frame')
  assert.deepEqual(payload.data, { content: '<p>&lt;one&gt; &amp; two</p><p>Next</p>', shape: 'square' })
  assert.deepEqual(payload.geometry, { width: 132 })
})
