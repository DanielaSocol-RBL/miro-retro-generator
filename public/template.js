const autumn = {
  name: 'Autumn',
  emoji: '🍁',
  caption: 'Harvest the wins',
  artwork: '/theme-autumn.jpg',
  choices: ['☀️', '🍃', '🌧️'],
  color: '#843c28',
  ink: '#41271e',
  background: '#fff1e6',
  checkIn: ['Pick your autumn weather', 'Which feels like your sprint today, and why?', 'Golden sunshine', 'Crisp breeze', 'Autumn rain'],
  reflections: [
    ['Harvest', 'What went well and is worth repeating?', '#f7dec7', 'light_yellow'],
    ['Falling Leaves', 'What slowed us down or should we let go of?', '#f6dccf', 'light_pink'],
    ['Seeds for Spring', 'What did we learn that we can build on?', '#e3ead6', 'light_green'],
    ['Weather Watch', 'What risk or obstacle should we prepare for?', '#e0e8ef', 'light_blue'],
  ],
  actions: 'Plant the Next Seeds',
  closing: ['One Leaf of Thanks', 'Thank a teammate for something specific they did this sprint.'],
  shape: 'rhombus',
}

const music = {
  name: 'Music',
  emoji: '🎵',
  caption: 'Find your rhythm',
  artwork: '/theme-music.jpg',
  choices: ['🎤', '🎸', '🥁'],
  color: '#544293',
  ink: '#262041',
  background: '#f1ebfc',
  checkIn: ['Name your opening track', 'Which sound matches your energy today, and why?', 'Upbeat anthem', 'Gentle acoustic', 'Heavy drums'],
  reflections: [
    ['On Repeat', 'What worked well enough to put on repeat?', '#e8dafa', 'violet'],
    ['Skip Track', 'What threw us off rhythm or needs to go?', '#f7dce6', 'light_pink'],
    ['Sound Check', 'What did we learn about how we work together?', '#dcebf6', 'light_blue'],
    ['Next Set', 'What could disrupt our next performance?', '#dceee7', 'light_green'],
  ],
  actions: 'Build the Next Setlist',
  closing: ['Give a Shout-out', 'Recognize one teammate who helped the group stay in rhythm.'],
  shape: 'circle',
}

const movie = {
  name: 'Movie',
  emoji: '🎬',
  caption: 'Roll the highlights',
  artwork: '/theme-movie.jpg',
  choices: ['🍿', '⚡', '🎭'],
  color: '#254e6e',
  ink: '#172e43',
  background: '#eaf2f8',
  checkIn: ['Cast your sprint in a genre', 'Which genre captures how the sprint felt, and why?', 'Feel-good comedy', 'Plot-twist thriller', 'Slow-burn drama'],
  reflections: [
    ['Highlight Reel', 'Which scenes worked well enough to show again?', '#fae8cc', 'light_yellow'],
    ['Cutting Room', 'What got in the way or should be edited out?', '#f9dfe1', 'light_pink'],
    ['Behind the Scenes', 'What did we learn that viewers would miss?', '#e8e1fa', 'violet'],
    ['Sequel Setup', 'Which unresolved plotlines pose a risk?', '#dceaf5', 'light_blue'],
  ],
  actions: 'Script the Sequel',
  closing: ['Roll the Credits', 'Name a teammate and credit one specific contribution.'],
  shape: 'star',
}

export const themes = { autumn, music, movie }
export const defaultSprint = '3.15'
export const maxImages = 6
export const maxImageBytes = 5 * 1024 * 1024
export const imageTypes = ['image/png', 'image/jpeg']
export const customEmojis = ['✨', '🌈', '🚀', '🌿', '🎨', '💡', '🏔️', '🎉', '🧩', '🌊', '☕', '🐾']
export const customPalettes = {
  'Golden hour': ['#80451e', '#382819', '#fff0d6', ['#f7dec7', '#f6dccf', '#e3ead6', '#e0e8ef']],
  'Lavender': ['#544293', '#262041', '#f1ebfc', ['#e8dafa', '#f7dce6', '#dcebf6', '#dceee7']],
  'Ocean': ['#254e6e', '#172e43', '#eaf2f8', ['#dceaf5', '#f9dfe1', '#e8e1fa', '#fae8cc']],
  'Forest': ['#285b47', '#1b392d', '#e1f1e7', ['#d8ebd8', '#f4dfd9', '#f3eccb', '#d9e7ef']],
}

export const customDefaults = {
  name: '', emoji: '✨', palette: 'Golden hour',
  checkIn: ['How are you arriving?', 'Pick a mood and share one reason.', 'Energized', 'Finding my focus', 'Need a reset'],
  reflections: [
    ['Celebrate', 'What went well and is worth repeating?'],
    ['Improve', 'What slowed us down or needs to change?'],
    ['Learn', 'What did we discover this sprint?'],
    ['Look ahead', 'What should we prepare for next sprint?'],
  ],
  actions: 'Decide what to try next',
  closing: ['Share a thank-you', 'Recognize one teammate and say what they did.'],
}

export function validateCustomTheme(input) {
  const field = (value, max, label) => {
    const cleaned = typeof value === 'string' ? value.trim() : ''
    if (!cleaned || cleaned.length > max || /[\x00-\x1f\x7f]/.test(cleaned)) {
      throw new Error(`Enter ${label} using 1–${max} characters.`)
    }
    return cleaned
  }
  if (!customEmojis.includes(input?.emoji) || !Object.hasOwn(customPalettes, input?.palette)) {
    throw new Error('Choose an emoji and a color palette for your theme.')
  }
  return {
    name: field(input.name, 26, 'a theme name'), emoji: input.emoji, palette: input.palette,
    checkIn: [
      field(input.checkIn?.[0], 30, 'a check-in title'),
      field(input.checkIn?.[1], 78, 'a check-in prompt'),
      ...[2, 3, 4].map(index => field(input.checkIn?.[index], 24, 'a check-in choice')),
    ],
    reflections: [0, 1, 2, 3].map(index => [
      field(input.reflections?.[index]?.[0], 32, 'a reflection title'),
      field(input.reflections?.[index]?.[1], 94, 'a reflection prompt'),
    ]),
    actions: field(input.actions, 32, 'an action items title'),
    closing: [field(input.closing?.[0], 32, 'a closing title'), field(input.closing?.[1], 94, 'a closing prompt')],
  }
}

function customDesign(input) {
  const custom = validateCustomTheme(input)
  const [color, ink, background, fills] = customPalettes[custom.palette]
  const notes = ['light_yellow', 'light_pink', 'light_green', 'light_blue']
  return {
    ...custom, color, ink, background, choices: ['⚡', '🌤️', '🌙'], shape: 'circle',
    reflections: custom.reflections.map(([title, prompt], index) => [title, prompt, fills[index], notes[index]]),
  }
}

export function validateRetrospective(input) {
  const theme = input?.theme
  const sprint = typeof input?.sprint === 'string' ? input.sprint.trim() : ''
  if (theme !== 'custom' && (typeof theme !== 'string' || !Object.hasOwn(themes, theme))) {
    throw new Error('Choose a retrospective theme.')
  }
  if (!/^\d{1,6}(?:[.-]\d{1,6}){0,3}$/.test(sprint) || sprint.length > 24) {
    throw new Error('Enter a sprint number such as 3.15.')
  }
  return { theme, sprint }
}

const text = (content, x, y, width, fontSize, color) =>
  ({ type: 'text', content, x, y, width, fontSize, color })

const shape = (content, x, y, width, height, fill, color, kind = 'round_rectangle') =>
  ({ type: 'shape', content, x, y, width, height, fill, color, kind })

export const stickyFills = {
  light_yellow: '#fff7a8',
  light_pink: '#ffd5e3',
  light_green: '#d5f692',
  light_blue: '#c6eaff',
  violet: '#ded0ff',
  orange: '#ffc67c',
}

const sticky = (content, x, y, fill = 'light_yellow') =>
  ({ type: 'sticky_note', content, x, y, width: 132, height: 132, fill })

export function buildRetrospective(input) {
  const { theme, sprint } = validateRetrospective(input)
  const { name, emoji, color, ink, background, checkIn, reflections, actions, closing, choices, artwork, shape: motif } =
    theme === 'custom' ? customDesign(input.customTheme) : themes[theme]
  const title = `${name} RETRO — Sprint ${sprint}`
  const frame = (key, title, x, y, width, height, items) =>
    ({ key, title, x, y, width, height, fill: '#ffffff', items })
  const headers = (title, prompt, fill) => [
    shape(title, 320, 61, 584, 66, fill, ink),
    text(prompt, 320, 125, 560, 22, ink),
  ]
  const frames = [
    frame('check-in', title, 0, 0, 1320, 392, [
      shape('', 660, 89, 1264, 128, color, '#ffffff'),
      shape('', 93, 88, 80, 80, background, color, motif),
      text(emoji, 93, 88, 75, 35, ink),
      text(title, 642, 73, 950, title.length > 42 ? 32 : 43, '#ffffff'),
      text('Sprint dates · [Start date] – [End date]     |     Team · [Team members]', 642, 119, 950, 22, '#ffffff'),
      text(checkIn[0], 265, 202, 450, 31, ink),
      text(checkIn[1], 265, 235, 450, 22, ink),
      sticky('[Team member] · [Check-in response]', 266, 320, 'light_yellow'),
      ...checkIn.slice(2).flatMap((choice, index) => {
        const x = 609 + index * 258
        return [shape('', x, 237, 230, 106, background, ink), text(choices[index], x, 220, 160, 28, ink),
          text(choice, x, 258, 207, 19, ink)]
      }),
    ]),
    ...reflections.map(([heading, prompt, fill, noteFill], index) => frame(
      `reflection-${index + 1}`, heading, (index % 2) * 680, 432 + Math.floor(index / 2) * 372, 640, 332,
      [...headers(`${['🌟', '🛠️', '💡', '🧭'][index]}  ${heading}`, prompt, fill),
        ...[151, 320, 489].map(x => sticky('[Retrospective note]', x, 231, noteFill))],
    )),
    frame('actions', 'Action items', 0, 1176, 640, 332, [
      ...headers(`✅  ${actions}`, 'Agree on one or two concrete changes to try next sprint.', background),
      ...[151, 320, 489].map(x => sticky('[Action]\n[Owner]\n[Due date]', x, 231, 'orange')),
    ]),
    frame('closing', 'Closing activity', 680, 1176, 640, 332, [
      ...headers(`💬  ${closing[0]}`, closing[1], background),
      sticky('[Team member] · [Specific thanks]', 236, 231, 'light_yellow'),
      sticky('[Team member] · [Specific thanks]', 404, 231, 'light_yellow'),
    ]),
  ]
  if (artwork) frames[0].items.push({
    type: 'image', artwork, content: `${name} theme illustration`, x: 1224, y: 89, width: 102, height: 102,
  })
  const images = input.images ?? []
  if (images.length) {
    const galleryHeight = images.length > 3 ? 665 : 397
    frames.push(frame('gallery', 'Sprint gallery', 0, 1548, 1320, galleryHeight, [
      shape('📷  Sprint gallery', 660, 62, 1264, 68, color, '#ffffff'),
      ...images.map(({ name: label, width, height }, index) => {
        const scale = Math.min(365 / width, 225 / height)
        return {
          type: 'image', content: label, index,
          x: 233 + index % 3 * 427, y: 233 + Math.floor(index / 3) * 268,
          width: width * scale, height: height * scale,
        }
      }),
    ]))
  }
  const last = frames.at(-1)
  return { title, width: 1320, height: last.y + last.height, frames }
}
