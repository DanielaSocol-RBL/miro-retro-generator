import { buildRetrospective, defaultSprint, stickyFills } from './template.js'
import { createStudio } from './studio.js'

const byId = id => document.getElementById(id)
const form = byId('generator')
const sprint = byId('sprint')
const board = byId('board')
const connect = byId('connect')
const generate = byId('generate')
const status = byId('miro-status')
const feedback = byId('feedback')
const resultLink = byId('result-link')
const sprintError = byId('sprint-error')
const picker = byId('board-picker')
const more = byId('more')
const disconnect = byId('disconnect')
const canvas = byId('canvas')
const layout = byId('layout')
const sectionPicker = byId('preview-section')
const zoomOut = byId('zoom-out')
const zoomIn = byId('zoom-in')
const zoomReset = byId('zoom-reset')
let connected = false
let busy = false
let authorizing = false
let nextOffset = null
let zoom = 100

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem('retro-draft'))
  } catch {
    return null
  }
}

const draft = readDraft()
sprint.value = typeof draft?.sprint === 'string' ? draft.sprint : defaultSprint
const studio = createStudio(() => {
  saveDraft()
  renderPreview()
}, draft?.theme)

function saveDraft() {
  try {
    sessionStorage.setItem('retro-draft', JSON.stringify({ theme: studio.themes.id, sprint: sprint.value }))
  } catch {
    // OAuth can continue without a saved draft.
  }
}

async function api(path, data) {
  const options = data === undefined ? undefined : {
    method: 'POST',
    ...(data instanceof FormData
      ? { body: data }
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  }
  const response = await fetch(path, options)
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.error), { result, status: response.status })
  return result
}

function message(text, { error = false, url } = {}) {
  feedback.textContent = text
  feedback.hidden = !text
  feedback.classList.toggle('error', error)
  resultLink.hidden = !url
  if (url) resultLink.href = url
}

function updateButton() {
  generate.disabled = busy || studio.images.loading || !connected || !board.value || !sprint.validity.valid
  connect.disabled = authorizing || studio.images.loading
}

function box(element, x, y, width, height, parent) {
  element.style.left = `${x / parent.width * 100}%`
  element.style.top = `${y / parent.height * 100}%`
  element.style.width = `${width / parent.width * 100}%`
  if (height) element.style.height = `${height / parent.height * 100}%`
}

function renderPreview() {
  let template
  try {
    template = buildRetrospective({ ...studio.themes.settings, sprint: sprint.value, images: studio.images.list })
    sprint.setCustomValidity('')
    sprint.removeAttribute('aria-invalid')
    sprintError.hidden = true
  } catch (error) {
    sprint.setCustomValidity(error.message)
    sprint.setAttribute('aria-invalid', 'true')
    sprintError.textContent = error.message
    sprintError.hidden = false
    updateButton()
    return
  }
  layout.style.aspectRatio = `${template.width} / ${template.height}`
  byId('preview-count').textContent = `${template.frames.length} editable frames`
  const previousSection = sectionPicker.value
  sectionPicker.replaceChildren(new Option('Jump to a section', ''), ...template.frames.map(frame =>
    new Option(frame.key === 'check-in' ? 'Check-in' : frame.title, frame.key)))
  if (template.frames.some(frame => frame.key === previousSection)) sectionPicker.value = previousSection
  const frames = template.frames.map(frame => {
    const region = document.createElement('section')
    region.className = 'frame'
    region.dataset.frame = frame.key
    region.setAttribute('aria-label', frame.title)
    box(region, frame.x, frame.y, frame.width, frame.height, template)
    region.style.backgroundColor = frame.fill
    for (const item of frame.items) {
      const element = document.createElement(item.type === 'image' ? 'img' : 'div')
      element.className = `item ${item.type} ${item.kind ?? ''}`
      if (item.type === 'image') {
        element.src = item.artwork ?? studio.images.list[item.index].url
        element.alt = item.content
      } else {
        element.textContent = item.content
      }
      if (!item.content) element.setAttribute('aria-hidden', 'true')
      box(element, item.x, item.y, item.width, item.height, frame)
      element.style.fontSize = `${(item.fontSize ?? (item.type === 'shape' ? 27 : 18)) / frame.width * 100}cqw`
      if (item.color) element.style.color = item.color
      if (item.fill) element.style.backgroundColor = stickyFills[item.fill] ?? item.fill
      region.append(element)
    }
    return region
  })
  layout.replaceChildren(...frames)
  updateButton()
}

function setZoom(value) {
  zoom = value
  layout.style.setProperty('--zoom', String(zoom / 100))
  zoomReset.textContent = `${zoom}%`
  zoomOut.disabled = zoom <= 75
  zoomIn.disabled = zoom >= 200
}

function generationPayload() {
  const settings = { ...studio.themes.settings, sprint: sprint.value, boardId: board.value }
  const images = studio.images.list
  if (!images.length) return settings
  const form = new FormData()
  form.append('settings', JSON.stringify({ ...settings, images: images.map(({ width, height }) => ({ width, height })) }))
  for (const { file } of images) form.append('images', file)
  return form
}

async function loadBoards(offset = 0) {
  more.disabled = true
  try {
    const result = await api(`/api/boards?offset=${offset}`)
    if (!connected) return
    for (const { id, name } of result.boards) board.add(new Option(name || id, id))
    nextOffset = result.nextOffset
    more.hidden = nextOffset === null
    status.textContent = board.options.length === 1 && nextOffset === null
      ? 'No boards are available for this Miro connection.'
      : 'Choose a board you can edit.'
  } catch (error) {
    if (connected) handleError(error)
  } finally {
    more.disabled = false
  }
}

function showConnection(configured, isConnected) {
  connected = isConnected
  connect.hidden = !configured || connected
  picker.hidden = !connected
  if (!connected) {
    board.options.length = 1
    board.value = ''
    nextOffset = null
    more.hidden = true
  }
  status.textContent = connected ? 'Loading Miro boards…' : configured
    ? 'Connect to Miro to choose a destination.'
    : 'Miro OAuth needs to be configured before you can generate.'
  updateButton()
}

function handleError(error) {
  if (error.status === 401) showConnection(true, false)
  message(error.message || 'Something went wrong.', { error: true, url: error.result?.boardUrl })
}

connect.addEventListener('click', async () => {
  authorizing = true
  updateButton()
  saveDraft()
  try {
    await studio.images.flush()
    const { authorizationUrl } = await api('/oauth/start', {})
    window.location.assign(authorizationUrl)
  } catch (error) {
    handleError(error)
    authorizing = false
    updateButton()
  }
})

disconnect.addEventListener('click', async () => {
  disconnect.disabled = true
  try {
    await api('/api/disconnect', {})
    showConnection(true, false)
    message('')
  } catch (error) {
    handleError(error)
  } finally {
    disconnect.disabled = false
  }
})

more.addEventListener('click', () => loadBoards(nextOffset))
board.addEventListener('change', updateButton)
sprint.addEventListener('input', () => { saveDraft(); renderPreview() })
zoomOut.addEventListener('click', () => setZoom(zoom - 25))
zoomIn.addEventListener('click', () => setZoom(zoom + 25))
zoomReset.addEventListener('click', () => setZoom(100))
sectionPicker.addEventListener('change', () => {
  const frame = [...layout.children].find(item => item.dataset.frame === sectionPicker.value)
  if (frame) canvas.scrollTo({ top: frame.offsetTop, left: frame.offsetLeft })
})
form.addEventListener('submit', async event => {
  event.preventDefault()
  if (generate.disabled) return
  busy = true
  updateButton()
  for (const control of [sprint, board, disconnect, more]) control.disabled = true
  studio.themes.setBusy(true)
  studio.images.setBusy(true)
  generate.textContent = 'Generating…'
  message('Adding frames and notes to your Miro board.')
  try {
    const result = await api('/api/generate', generationPayload())
    message(`Created ${result.frameIds.length} frames and ${result.createdItems - result.frameIds.length} editable items.`,
      { url: result.boardUrl })
  } catch (error) {
    handleError(error)
  } finally {
    busy = false
    for (const control of [sprint, board, disconnect, more]) control.disabled = false
    studio.themes.setBusy(false)
    studio.images.setBusy(false)
    generate.textContent = 'Generate in Miro'
    updateButton()
  }
})

setZoom(100)
renderPreview()
const oauth = new URLSearchParams(location.search).get('oauth')
if (oauth) {
  const errors = { denied: 'Miro authorization was declined.', invalid: 'The Miro authorization link expired or was invalid.', failed: 'Miro authorization failed. Try connecting again.' }
  message(errors[oauth] ?? errors.failed, { error: true })
  history.replaceState(null, '', '/')
}
try {
  const result = await api('/api/session')
  showConnection(result.configured, result.connected)
  if (connected) await loadBoards()
} catch (error) {
  status.textContent = 'Could not check the Miro connection. Reload to try again.'
  handleError(error)
}
