import { customDefaults, customEmojis, customPalettes, imageTypes, maxImageBytes, maxImages, themes, validateCustomTheme } from './template.js'

const byId = id => document.getElementById(id)

function notice(id, text, error = false) {
  const target = byId(id)
  target.textContent = text
  target.hidden = !text
  target.classList.toggle('field-error', error)
}

function localThemes() {
  try {
    const entries = JSON.parse(localStorage.getItem('retro-themes')) ?? []
    return new Map(entries.map(([id, theme]) => [id, validateCustomTheme(theme)]))
  } catch {
    return new Map()
  }
}

function option(name, value, text, colors) {
  const label = document.createElement('label')
  const radio = document.createElement('input')
  radio.type = 'radio'
  radio.name = name
  radio.value = value
  const item = document.createElement('span')
  if (colors) {
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.style.background = `linear-gradient(110deg, ${colors[0]} 35%, ${colors[2]} 35%)`
    item.append(swatch)
  }
  item.append(text)
  label.append(radio, item)
  return label
}

function createThemes(onChange, draft) {
  const saved = localThemes()
  const dialog = byId('theme-dialog')
  const form = byId('theme-form')
  const activityFields = byId('activity-fields')
  const builtIns = byId('theme-cards')
  const customs = byId('saved-themes')
  let selected = Object.hasOwn(themes, draft) || saved.has(draft) ? draft : 'autumn'
  let editing

  function select(id) {
    selected = id
    for (const button of document.querySelectorAll('[data-theme]')) {
      button.setAttribute('aria-pressed', String(button.dataset.theme === id))
    }
    onChange()
  }

  function themeButton(id, theme, builtIn) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = builtIn ? 'theme-card' : 'custom-choice'
    button.dataset.theme = id
    button.setAttribute('aria-pressed', String(selected === id))
    const icon = document.createElement('span')
    icon.className = 'theme-icon'
    icon.textContent = theme.emoji
    icon.setAttribute('aria-hidden', 'true')
    const title = document.createElement('span')
    title.className = 'theme-name'
    title.textContent = theme.name
    button.append(icon, title)
    if (builtIn) {
      const caption = document.createElement('span')
      caption.className = 'theme-caption'
      caption.textContent = theme.caption
      const artwork = document.createElement('img')
      artwork.className = 'theme-artwork'
      artwork.src = theme.artwork
      artwork.alt = ''
      button.append(caption, artwork)
    } else {
      button.style.setProperty('--custom-color', customPalettes[theme.palette][2])
    }
    button.addEventListener('click', () => select(id))
    return button
  }

  function renderSaved() {
    customs.replaceChildren(...[...saved].map(([id, theme]) => {
      const row = document.createElement('div')
      row.className = 'saved-theme'
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'text-button'
      edit.textContent = 'Edit'
      edit.setAttribute('aria-label', `Edit ${theme.name}`)
      edit.addEventListener('click', () => showEditor(id))
      row.append(themeButton(id, theme, false), edit)
      return row
    }))
    customs.hidden = saved.size === 0
  }

  function activityField(name, label, limit) {
    const wrapper = document.createElement('label')
    wrapper.textContent = label
    const input = document.createElement('input')
    input.name = name
    input.maxLength = limit
    wrapper.append(input)
    activityFields.append(wrapper)
  }

  activityField('check0', 'Check-in title', 30)
  activityField('check1', 'Check-in prompt', 78)
  for (let index = 2; index < 5; index++) activityField(`check${index}`, `Check-in choice ${index - 1}`, 24)
  for (const [index, title] of ['Celebrate', 'Improve', 'Learn', 'Look ahead'].entries()) {
    activityField(`reflect${index}title`, `${title} section title`, 32)
    activityField(`reflect${index}prompt`, `${title} section prompt`, 94)
  }
  activityField('actions', 'Action items title', 32)
  activityField('close0', 'Closing activity title', 32)
  activityField('close1', 'Closing activity prompt', 94)

  byId('emoji-options').append(...customEmojis.map(emoji => option('emoji', emoji, emoji)))
  byId('palette-options').append(...Object.entries(customPalettes).map(([name, colors]) => option('palette', name, name, colors)))

  function showEditor(id) {
    editing = id
    const theme = saved.get(id) ?? customDefaults
    const fields = form.elements
    fields.name.value = theme.name
    fields.emoji.value = theme.emoji
    fields.palette.value = theme.palette
    theme.checkIn.forEach((value, index) => { fields[`check${index}`].value = value })
    theme.reflections.forEach(([title, prompt], index) => {
      fields[`reflect${index}title`].value = title
      fields[`reflect${index}prompt`].value = prompt
    })
    fields.actions.value = theme.actions
    theme.closing.forEach((value, index) => { fields[`close${index}`].value = value })
    byId('custom-title').textContent = id ? 'Edit your theme' : 'Create a theme'
    byId('remove-theme').hidden = !id
    form.querySelector('details').open = false
    notice('custom-error', '')
    dialog.showModal()
  }

  function persistThemes(message) {
    try {
      localStorage.setItem('retro-themes', JSON.stringify([...saved]))
      notice('theme-status', message)
    } catch {
      notice('theme-status', 'Your browser could not save the changes for next time.', true)
    }
  }

  byId('new-theme').addEventListener('click', () => showEditor())
  byId('close-theme').addEventListener('click', () => dialog.close())
  byId('remove-theme').addEventListener('click', () => {
    const next = selected === editing ? 'autumn' : selected
    saved.delete(editing)
    dialog.close()
    renderSaved()
    select(next)
    byId('new-theme').focus()
    persistThemes('Theme deleted.')
  })

  form.addEventListener('submit', event => {
    event.preventDefault()
    const data = new FormData(form)
    const field = name => data.get(name)
    try {
      const theme = validateCustomTheme({
        name: field('name'), emoji: field('emoji'), palette: field('palette'),
        checkIn: [0, 1, 2, 3, 4].map(index => field(`check${index}`)),
        reflections: [0, 1, 2, 3].map(index => [field(`reflect${index}title`), field(`reflect${index}prompt`)]),
        actions: field('actions'), closing: [field('close0'), field('close1')],
      })
      const id = editing ?? crypto.randomUUID()
      saved.set(id, theme)
      dialog.close()
      renderSaved()
      select(id)
      customs.querySelector('[aria-pressed="true"]').focus()
      persistThemes(`${theme.name} saved in this browser.`)
    } catch (error) {
      form.querySelector('details').open = true
      notice('custom-error', error.message, true)
    }
  })

  builtIns.append(...Object.entries(themes).map(([id, theme]) => themeButton(id, theme, true)))
  renderSaved()
  return {
    get id() { return selected },
    get settings() {
      return saved.has(selected) ? { theme: 'custom', customTheme: saved.get(selected) } : { theme: selected }
    },
    setBusy(busy) {
      for (const control of [byId('new-theme'), ...builtIns.querySelectorAll('button'), ...customs.querySelectorAll('button')]) {
        control.disabled = busy
      }
    },
  }
}

let database
function withImageStore(mode, operation) {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('retro-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('draft')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Image storage is unavailable.'))
  })
  return database.then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction('draft', mode)
    const request = operation(transaction.objectStore('draft'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error)
  }))
}

function createImages(onChange) {
  const list = byId('image-list')
  const zone = byId('drop-zone')
  const input = byId('image-files')
  const pick = byId('pick-images')
  let images = []
  let busy = false
  let loading = true
  let pendingSave = Promise.resolve()

  function render() {
    pick.disabled = busy || loading || images.length >= maxImages
    list.replaceChildren(...images.map(image => {
      const row = document.createElement('div')
      row.className = 'image-row'
      const thumb = document.createElement('img')
      thumb.src = image.url
      thumb.alt = ''
      const name = document.createElement('span')
      name.textContent = image.name
      name.title = image.name
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'icon-button'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `Remove ${image.name}`)
      remove.disabled = busy || loading
      remove.addEventListener('click', () => {
        images = images.filter(item => item !== image)
        URL.revokeObjectURL(image.url)
        notice('image-status', `${image.name} removed.`)
        render()
        pick.focus()
        persist()
      })
      row.append(thumb, name, remove)
      return row
    }))
    onChange()
  }

  function persist() {
    const draft = images.map(({ url, ...image }) => image)
    pendingSave = withImageStore('readwrite', store => store.put(draft, 'images')).catch(() => {
      notice('image-status', 'This browser could not keep the images after a reload. You can still use them on this page.', true)
    })
    return pendingSave
  }

  async function attach(files) {
    if (loading || busy) return
    loading = true
    render()
    const errors = []
    let added = 0
    for (const file of files) {
      if (images.length >= maxImages) {
        errors.push('The gallery can hold up to six images.')
        break
      }
      if (!imageTypes.includes(file.type) || !file.size || file.size > maxImageBytes) {
        errors.push(`${file.name} needs to be a PNG or JPEG under 5 MB.`)
        continue
      }
      const url = URL.createObjectURL(file)
      try {
        const img = new Image()
        img.src = url
        await img.decode()
        const { naturalWidth: width, naturalHeight: height } = img
        if (!width || !height || width > 32768 || height > 32768) throw new Error('Unsupported dimensions')
        images.push({ file, name: file.name, width, height, url })
        added++
      } catch {
        URL.revokeObjectURL(url)
        errors.push(`${file.name} could not be opened.`)
      }
    }
    loading = false
    render()
    notice('image-status', [added ? `${added} ${added === 1 ? 'image added' : 'images added'} to the sprint gallery.` : '', ...errors].filter(Boolean).join(' '), errors.length > 0)
    if (added) await persist()
  }

  pick.disabled = true
  pick.addEventListener('click', () => input.click())
  input.addEventListener('change', () => {
    const files = [...input.files]
    input.value = ''
    void attach(files)
  })
  zone.addEventListener('dragover', event => {
    event.preventDefault()
    if (!loading && !busy && images.length < maxImages) zone.classList.add('dragging')
  })
  zone.addEventListener('dragleave', event => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove('dragging')
  })
  zone.addEventListener('drop', event => {
    event.preventDefault()
    zone.classList.remove('dragging')
    void attach([...event.dataTransfer.files])
  })

  async function restore() {
    try {
      const values = await withImageStore('readonly', store => store.get('images'))
      images = (values ?? []).map(image => ({ ...image, url: URL.createObjectURL(image.file) }))
    } catch {
      // The file picker still works if browser storage is unavailable.
    } finally {
      loading = false
      render()
    }
  }
  void restore()
  return {
    get list() { return images },
    get loading() { return loading },
    flush() { return pendingSave },
    setBusy(value) { busy = value; render() },
  }
}

export function createStudio(onChange, draft) {
  return { themes: createThemes(onChange, draft), images: createImages(onChange) }
}
