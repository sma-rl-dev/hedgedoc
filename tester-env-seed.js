#!/usr/bin/env node
'use strict'

// Deterministic seed, verification and digest for the HedgeDoc tester-env baseline.
// Runs inside the app container (the tester-env CLI copies this file and the
// notes directory into /tmp/tester-env-seed and executes it there):
//
//   node /tmp/tester-env-seed/tester-env-seed.js seed     # users, notes, revisions, history
//   node /tmp/tester-env-seed/tester-env-seed.js verify   # HTTP assertions over the running app
//   node /tmp/tester-env-seed/tester-env-seed.js digest   # canonical read-only state fingerprint
//
// Notes are created through POST /new/<alias> (the anonymous/authenticated note
// creation endpoint) and history entries through POST /history. HedgeDoc exposes
// no HTTP path for permissions, revisions or timestamps, so those are written
// through the app's own Sequelize models; one raw UPDATE pins Notes.createdAt
// because Sequelize ignores createdAt on instance updates.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const models = require('/hedgedoc/lib/models')

const SEED_DIR = path.join(__dirname, 'notes')
const BASE = process.env.SEED_BASE_URL || `http://127.0.0.1:${process.env.CMD_PORT || '13371'}`

const USERS = {
  admin: { email: 'admin@tester-env.local', password: 'HedgeDocAdmin2026!' },
  dana: { email: 'dana@tester-env.local', password: 'HedgeDocDana2026!' },
  priya: { email: 'priya@tester-env.local', password: 'HedgeDocPriya2026!' }
}

const NOTES = [
  {
    alias: 'engineering-onboarding',
    permission: 'editable',
    owner: 'admin',
    created: '2026-09-15T08:30:00Z',
    changed: '2026-11-19T16:44:00Z',
    revisions: [
      { file: 'engineering-onboarding.prev.md', at: '2026-09-15T08:30:00Z' },
      { file: 'engineering-onboarding.md', at: '2026-11-19T16:44:00Z' }
    ]
  },
  {
    alias: 'release-runbook',
    permission: 'limited',
    owner: 'dana',
    created: '2026-10-28T09:05:00Z',
    changed: '2026-11-20T11:20:00Z',
    revisions: [
      { file: 'release-runbook.prev.md', at: '2026-10-28T09:05:00Z' },
      { file: 'release-runbook.md', at: '2026-11-20T11:20:00Z' }
    ]
  },
  {
    alias: 'api-style-guide',
    permission: 'locked',
    owner: 'admin',
    created: '2026-10-02T13:15:00Z',
    changed: '2026-10-02T13:15:00Z'
  },
  {
    alias: 'q4-hiring-plan',
    permission: 'private',
    owner: 'admin',
    created: '2026-11-04T09:40:00Z',
    changed: '2026-11-16T09:30:00Z'
  },
  {
    alias: 'postmortem-dispatch-latency',
    permission: 'protected',
    owner: 'dana',
    created: '2026-11-09T08:15:00Z',
    changed: '2026-11-09T18:05:00Z'
  },
  {
    alias: 'weekly-sync-2026-11-17',
    permission: 'editable',
    owner: 'dana',
    created: '2026-11-17T15:30:00Z',
    changed: '2026-11-17T17:10:00Z'
  },
  {
    alias: 'platform-glossary',
    permission: 'freely',
    owner: null,
    created: '2026-08-11T10:00:00Z',
    changed: '2026-10-30T10:15:00Z'
  },
  {
    alias: 'one-to-one-dana',
    permission: 'private',
    owner: 'dana',
    created: '2026-11-13T10:15:00Z',
    changed: '2026-11-15T09:00:00Z'
  }
]

const TAGS = {
  'engineering-onboarding': ['onboarding'],
  'release-runbook': ['release', 'runbook'],
  'api-style-guide': ['api'],
  'q4-hiring-plan': ['hiring'],
  'postmortem-dispatch-latency': ['incident', 'postmortem'],
  'weekly-sync-2026-11-17': ['meeting'],
  'platform-glossary': ['reference'],
  'one-to-one-dana': ['one-to-one']
}

// Per-user history, in stored order (the /history view sorts pinned first, then
// time desc). [alias, time, pinned]
const HISTORY = {
  admin: [
    ['engineering-onboarding', '2026-11-21T09:12:00Z', true],
    ['release-runbook', '2026-11-20T11:20:00Z', false],
    ['api-style-guide', '2026-11-18T14:05:00Z', false],
    ['weekly-sync-2026-11-17', '2026-11-17T16:30:00Z', false],
    ['q4-hiring-plan', '2026-11-16T09:30:00Z', false],
    ['postmortem-dispatch-latency', '2026-11-09T08:40:00Z', false],
    ['platform-glossary', '2026-10-30T10:15:00Z', false]
  ],
  dana: [
    ['release-runbook', '2026-11-20T11:25:00Z', true],
    ['postmortem-dispatch-latency', '2026-11-19T10:00:00Z', false],
    ['weekly-sync-2026-11-17', '2026-11-17T17:10:00Z', false],
    ['one-to-one-dana', '2026-11-15T09:00:00Z', false],
    ['platform-glossary', '2026-11-01T08:00:00Z', false]
  ],
  priya: [
    ['api-style-guide', '2026-11-18T15:00:00Z', false],
    ['one-to-one-dana', '2026-11-15T09:05:00Z', false],
    ['platform-glossary', '2026-11-02T12:00:00Z', false]
  ]
}

// Anonymous visitors to a restricted note are redirected to the index with a
// flash message (302); signed-in users without permission get 403.
const VIEW_STATUS = {
  'engineering-onboarding': { anonymous: 200, admin: 200, dana: 200, priya: 200 },
  'release-runbook': { anonymous: 302, admin: 200, dana: 200, priya: 200 },
  'api-style-guide': { anonymous: 200, admin: 200, dana: 200, priya: 200 },
  'q4-hiring-plan': { anonymous: 302, admin: 200, dana: 403, priya: 403 },
  'postmortem-dispatch-latency': { anonymous: 302, admin: 200, dana: 200, priya: 200 },
  'weekly-sync-2026-11-17': { anonymous: 200, admin: 200, dana: 200, priya: 200 },
  'platform-glossary': { anonymous: 200, admin: 200, dana: 200, priya: 200 },
  'one-to-one-dana': { anonymous: 302, admin: 403, dana: 200, priya: 403 }
}

// Rendered-markdown assertions on the published view (/s/<alias>).
const CONTENT = {
  'engineering-onboarding': ['First week', 'good-first-issue', 'Dana Whitfield'],
  'release-runbook': ['Pre-flight', 'kubectl rollout undo', 'Rollback'],
  'api-style-guide': ['Idempotency-Key', 'carrier_not_available', 'Pagination'],
  'q4-hiring-plan': ['Staff Backend Engineer', '168,000 - 196,000', 'Offer out'],
  'postmortem-dispatch-latency': ['tender_offers', '4.1 million rows', '19:40'],
  'weekly-sync-2026-11-17': ['Freeze the Dispatch API', 'crash-free sessions', 'Marco'],
  'platform-glossary': ['Deadhead', 'Load board', 'shp_'],
  'one-to-one-dana': ['release captain', '2026-11-15', 'on-call rotation']
}

function noteTitle (alias) {
  return models.Note.parseNoteTitle(fs.readFileSync(path.join(SEED_DIR, `${alias}.md`), 'utf8'))
}

function revisionsOf (spec) {
  if (spec.revisions) return spec.revisions
  return [{ file: `${spec.alias}.md`, at: spec.changed }]
}

function sha256 (text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

async function request (pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, { redirect: 'manual', ...options })
  return { status: res.status, headers: res.headers, text: await res.text() }
}

async function login (email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password })
  })
  const cookie = (res.headers.getSetCookie() || [])
    .map((value) => value.split(';')[0])
    .find((value) => value.startsWith('connect.sid='))
  if (res.status !== 302 || !cookie) {
    throw new Error(`login failed for ${email} (POST /login returned ${res.status}${res.status === 429 ? ': rate limited, restart the stack with reset+deploy' : ''})`)
  }
  // A 429 still issues a cookie, so confirm the session is really signed in.
  const home = await fetch(`${BASE}/`, { redirect: 'manual', headers: { cookie } })
  if (!(await home.text()).includes('/logout')) {
    throw new Error(`login for ${email} did not establish a session (POST /login ${res.status}, GET / ${home.status})`)
  }
  return cookie
}

async function ensureUser (spec) {
  let user = await models.User.findOne({ where: { email: spec.email } })
  if (!user) user = await models.User.create({ email: spec.email, password: spec.password })
  return user
}

function fetchNote (alias) {
  return models.Note.findOne({ where: { alias } })
}

async function seed () {
  const users = {}
  for (const [key, spec] of Object.entries(USERS)) users[key] = await ensureUser(spec)

  // Remove only the notes this seed owns, with their revisions, so re-seeding
  // replaces exactly its own data and leaves other notes untouched.
  const previous = await models.Note.findAll({ where: { alias: NOTES.map((note) => note.alias) } })
  if (previous.length > 0) {
    const ids = previous.map((note) => note.id)
    await models.Revision.destroy({ where: { noteId: ids } })
    await models.Note.destroy({ where: { id: ids } })
  }

  const sessions = { anonymous: null }
  for (const key of Object.keys(USERS)) sessions[key] = await login(USERS[key].email, USERS[key].password)

  for (const spec of NOTES) {
    const revisions = revisionsOf(spec)
    const content = fs.readFileSync(path.join(SEED_DIR, revisions[revisions.length - 1].file), 'utf8')
    const headers = { 'content-type': 'text/markdown' }
    if (spec.owner) headers.cookie = sessions[spec.owner]

    const created = await request(`/new/${spec.alias}`, { method: 'POST', headers, body: content })
    if (created.status !== 302) throw new Error(`POST /new/${spec.alias} returned ${created.status}, expected 302`)

    const note = await fetchNote(spec.alias)
    if (!note) throw new Error(`note ${spec.alias} missing after creation`)

    const ownerId = spec.owner ? users[spec.owner].id : null
    // Sequelize ignores createdAt on instance updates, so pin it with one UPDATE.
    await models.sequelize.query('UPDATE Notes SET createdAt = ? WHERE id = ?', {
      replacements: [new Date(spec.created), note.id]
    })
    await note.reload()
    await note.update({
      permission: spec.permission,
      lastchangeuserId: ownerId,
      lastchangeAt: new Date(spec.changed),
      savedAt: new Date(spec.changed)
    })
    await models.Revision.destroy({ where: { noteId: note.id } })
    for (const revision of revisions) {
      const text = fs.readFileSync(path.join(SEED_DIR, revision.file), 'utf8')
      await models.Revision.create({
        noteId: note.id,
        content: text,
        length: text.length,
        authorship: null,
        createdAt: new Date(revision.at)
      })
    }
  }

  for (const [key, entries] of Object.entries(HISTORY)) {
    const history = []
    for (const [alias, at, pinned] of entries) {
      const note = await fetchNote(alias)
      if (!note) throw new Error(`history refers to missing note ${alias}`)
      history.push({
        id: models.Note.encodeNoteId(note.id),
        text: note.title,
        time: Date.parse(at),
        pinned,
        tags: TAGS[alias] || []
      })
    }
    const posted = await request('/history', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sessions[key] },
      body: new URLSearchParams({ history: JSON.stringify(history) })
    })
    if (posted.status !== 200) throw new Error(`POST /history for ${key} returned ${posted.status}`)
  }

  const seededNotes = await models.Note.findAll({ where: { alias: NOTES.map((note) => note.alias) } })
  const revisionCount = await models.Revision.count({ where: { noteId: seededNotes.map((note) => note.id) } })
  console.log(`==> Seeded ${seededNotes.length} notes, ${revisionCount} revisions, history for ${Object.keys(HISTORY).length} users`)
  console.log(`    users:   ${Object.values(USERS).map((user) => user.email).join(', ')}`)
  console.log(`    notes:   ${NOTES.map((note) => `${note.alias} (${note.permission})`).join(', ')}`)
}

async function verify () {
  const failed = []
  let passed = 0
  const check = (label, ok, detail) => {
    if (ok) {
      passed++
    } else {
      failed.push(`${label}: ${detail}`)
    }
  }

  const sessions = { anonymous: null }
  for (const [key, spec] of Object.entries(USERS)) {
    try {
      sessions[key] = await login(spec.email, spec.password)
      check(`login ${key}`, true)
    } catch (err) {
      failed.push(`login ${key}: ${err.message}`)
    }
  }

  const notes = {}
  for (const spec of NOTES) {
    const note = await fetchNote(spec.alias)
    check(`note exists ${spec.alias}`, Boolean(note), 'not found in the database')
    if (note) notes[spec.alias] = note
  }

  for (const spec of NOTES) {
    const expected = VIEW_STATUS[spec.alias]
    for (const [actor, status] of Object.entries(expected)) {
      const res = await request(`/${spec.alias}`, {
        headers: sessions[actor] ? { cookie: sessions[actor] } : {}
      })
      check(`view ${spec.alias} as ${actor}`, res.status === status, `GET /${spec.alias} returned ${res.status}, expected ${status}`)
    }
    if (!notes[spec.alias]) continue

    const title = noteTitle(spec.alias)
    // The editor page embeds the title in <title>, HTML-escaped.
    const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const actor = spec.alias === 'one-to-one-dana' ? 'dana' : 'admin'
    const page = await request(`/${spec.alias}`, { headers: { cookie: sessions[actor] } })
    check(
      `page title ${spec.alias}`,
      page.text.includes(escapedTitle) || page.text.includes(title),
      `GET /${spec.alias} does not contain "${title}"`
    )
    check(`permission label ${spec.alias}`, page.text.includes('ui-permission'), 'editor page missing the permission control')

    const published = await request(`/s/${spec.alias}`, { headers: { cookie: sessions[actor] } })
    check(`published ${spec.alias}`, published.status === 200, `GET /s/${spec.alias} returned ${published.status}`)
    for (const snippet of CONTENT[spec.alias]) {
      check(`render ${spec.alias} "${snippet}"`, published.text.includes(snippet), `published view does not contain "${snippet}"`)
    }

    const revision = await request(`/${spec.alias}/revision`, { headers: { cookie: sessions[actor] } })
    check(`revision endpoint ${spec.alias}`, revision.status === 200, `GET /${spec.alias}/revision returned ${revision.status}`)
    if (revision.status === 200) {
      const expectedRevisions = revisionsOf(spec)
        .map((entry) => ({
          time: Date.parse(entry.at),
          length: fs.readFileSync(path.join(SEED_DIR, entry.file), 'utf8').length
        }))
        .reverse()
      const actual = JSON.parse(revision.text).revision
      check(
        `revisions ${spec.alias}`,
        JSON.stringify(actual) === JSON.stringify(expectedRevisions),
        `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expectedRevisions)}`
      )
    }
  }

  for (const [key, entries] of Object.entries(HISTORY)) {
    const res = await request('/history', { headers: { cookie: sessions[key] } })
    check(`history ${key}`, res.status === 200, `GET /history returned ${res.status}`)
    if (res.status !== 200) continue
    const actual = JSON.parse(res.text).history.map((item) => ({
      text: item.text,
      time: item.time,
      pinned: Boolean(item.pinned),
      tags: item.tags || []
    }))
    const expected = entries.map(([alias, at, pinned]) => ({
      text: noteTitle(alias),
      time: Date.parse(at),
      pinned,
      tags: TAGS[alias] || []
    }))
    check(`history ${key} entries`, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }

  if (failed.length > 0) {
    for (const failure of failed) console.error(`FAIL ${failure}`)
    throw new Error(`${failed.length} seed verification failed, ${passed} passed`)
  }
  console.log(`==> Seed verification passed (${passed} checks)`)
}

async function digest () {
  const aliases = NOTES.map((note) => note.alias)
  const users = await models.User.findAll({ order: [['email', 'ASC']] })
  const emailById = new Map(users.map((user) => [user.id, user.email]))
  const notes = await models.Note.findAll({ where: { alias: aliases }, order: [['alias', 'ASC']] })
  const aliasById = new Map(notes.map((note) => [note.id, note.alias]))
  const revisions = await models.Revision.findAll({ order: [['createdAt', 'ASC']] })

  const out = {
    users: users.map((user) => user.email),
    notes: notes.map((note) => ({
      alias: note.alias,
      title: note.title,
      permission: note.permission,
      owner: note.ownerId ? emailById.get(note.ownerId) || 'unknown' : null,
      createdAt: note.createdAt.toISOString(),
      lastchangeAt: note.lastchangeAt ? note.lastchangeAt.toISOString() : null,
      length: note.content.length,
      sha256: sha256(note.content)
    })),
    revisions: revisions
      .filter((revision) => aliasById.has(revision.noteId))
      .map((revision) => ({
        alias: aliasById.get(revision.noteId),
        at: revision.createdAt.toISOString(),
        length: revision.length,
        sha256: sha256(revision.content || revision.lastContent || '')
      }))
      .sort((a, b) => a.alias.localeCompare(b.alias) || a.at.localeCompare(b.at)),
    history: {}
  }
  for (const [key, spec] of Object.entries(USERS)) {
    const user = users.find((entry) => entry.email === spec.email)
    const history = user && user.history ? JSON.parse(user.history) : []
    out.history[key] = history.map((item) => ({
      text: item.text,
      time: item.time,
      pinned: Boolean(item.pinned),
      tags: item.tags || []
    }))
  }
  console.log(JSON.stringify(out, null, 2))
}

async function main () {
  const command = process.argv[2] || 'seed'
  switch (command) {
    case 'seed':
      await seed()
      break
    case 'verify':
      await verify()
      break
    case 'digest':
      await digest()
      break
    default:
      throw new Error(`unknown command ${command} (expected seed|verify|digest)`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  })
