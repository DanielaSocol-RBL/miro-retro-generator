const autumn = {
  name: 'Autumn',
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

export function validateRetrospective(input) {
  const theme = input?.theme
  const sprint = typeof input?.sprint === 'string' ? input.sprint.trim() : ''
  if (typeof theme !== 'string' || !Object.hasOwn(themes, theme)) {
    throw new Error('Choose Autumn, Music, or Movie.')
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
  const { name, color, ink, background, checkIn, reflections, actions, closing, shape: motif } = themes[theme]
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
      shape('', 93, 88, 54, 54, '#ffffff', color, motif),
      text(title, 680, 73, 1085, 43, '#ffffff'),
      text('Sprint dates · [Start date] – [End date]     |     Team · [Team members]', 680, 119, 1085, 22, '#ffffff'),
      text(checkIn[0], 265, 202, 450, 31, ink),
      text(checkIn[1], 265, 235, 450, 22, ink),
      sticky('[Team member] · [Check-in response]', 266, 320, 'light_yellow'),
      ...checkIn.slice(2).map((choice, index) => shape(choice, 609 + index * 258, 237, 230, 91, background, ink)),
    ]),
    ...reflections.map(([heading, prompt, fill, noteFill], index) => frame(
      `reflection-${index + 1}`, heading, (index % 2) * 680, 432 + Math.floor(index / 2) * 372, 640, 332,
      [...headers(heading, prompt, fill),
        ...[151, 320, 489].map(x => sticky('[Retrospective note]', x, 231, noteFill))],
    )),
    frame('actions', 'Action items', 0, 1176, 640, 332, [
      ...headers(actions, 'Agree on one or two concrete changes to try next sprint.', background),
      ...[151, 320, 489].map(x => sticky('[Action]\n[Owner]\n[Due date]', x, 231, 'orange')),
    ]),
    frame('closing', 'Closing activity', 680, 1176, 640, 332, [
      ...headers(closing[0], closing[1], background),
      sticky('[Team member] · [Specific thanks]', 236, 231, 'light_yellow'),
      sticky('[Team member] · [Specific thanks]', 404, 231, 'light_yellow'),
    ]),
  ]
  // The opening frame's sticky extends to y=386, inside its 392px frame.
  return { title, width: 1320, height: 1508, frames }
}
