const test = require('brittle')
const RAM = require('random-access-memory')
const Hypercore = require('hypercore')
const Autochannel = require('./')

test('2 writers', async t => {
  const cores = [
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
    new Hypercore(() => new RAM(), { valueEncoding: 'json' })
  ]

  await Promise.all(cores.map(c => c.ready()))

  const A_INITIATOR = true

  cores.sort((a, b) => Buffer.compare(a.key, b.key))
  const [al, bl] = A_INITIATOR ? cores : cores.reverse()

  const ar = new Hypercore(() => new RAM(), bl.key, { valueEncoding: 'json' })
  const br = new Hypercore(() => new RAM(), al.key, { valueEncoding: 'json' })

  await ar.ready()
  await br.ready()

  const a = new Autochannel([al, ar])
  const b = new Autochannel([bl, br])

  replicate(al, br)
  replicate(bl, ar)

  let ai = 0
  let bi = 0

  const order = []

  a.on('data', data => order.push(data))

  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)

  await new Promise(r => setTimeout(r, 1000))

  await b.append(`b${bi++}`, true)
  await b.append(`b${bi++}`, false)
  await b.append(`b${bi++}`, false)
  await b.append(`b${bi++}`, false)

  await b.append(`b${bi++}`, false)
  await b.append(`b${bi++}`, false)

  await new Promise(r => setTimeout(r, 1000))

  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)

  await new Promise(r => setTimeout(r, 1000))

  await b.append(`a${ai++}`, true)

  await new Promise(r => setTimeout(r, 1000))
  await a.append(`a${ai++}`, true)

  let i = 0
  for await (const data of b) {
    if (data !== order[i]) {
      b.destroy(new Error(`Bad order ${i}`))
      t.fail(`failed at block ${i}`)
    }

    if (++i === order.length) break
  }

  t.pass()
})

test('3 writers', async t => {
  const cores = [
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
    new Hypercore(() => new RAM(), { valueEncoding: 'json' })
  ]

  await Promise.all(cores.map(c => c.ready()))

  cores.sort((a, b) => Buffer.compare(a.key, b.key))
  const [al, bl, cl] = cores

  const ar = new Hypercore(() => new RAM(), al.key, { valueEncoding: 'json' })
  const br = new Hypercore(() => new RAM(), bl.key, { valueEncoding: 'json' })
  const cr = new Hypercore(() => new RAM(), cl.key, { valueEncoding: 'json' })

  await ar.ready()
  await br.ready()
  await cr.ready()

  const a = new Autochannel([al, br, cr])
  const b = new Autochannel([bl, ar, cr])
  const c = new Autochannel([cl, ar, br])

  replicate(al, ar)
  replicate(bl, br)
  replicate(cl, cr)

  let ai = 0
  let bi = 0
  let ci = 0

  const order = []

  a.on('data', data => { order.push(data) })

  const end = read('a', a)

  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await c.append(`c${ci++}`, true)

  await new Promise(r => setTimeout(r, 1000))

  await c.append(`c${ci++}`, false)
  await c.append(`c${ci++}`, false)

  await new Promise(r => setTimeout(r, 1000))

  await b.append(`b${bi++}`, true)
  await b.append(`b${bi++}`, false)
  await b.append(`b${bi++}`, false)
  await b.append(`b${bi++}`, false)

  await b.append(`b${bi++}`, false)
  await b.append(`b${bi++}`, false)

  await new Promise(r => setTimeout(r, 1000))

  await c.append(`c${ci++}`, false)

  await new Promise(r => setTimeout(r, 1000))

  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)

  await new Promise(r => setTimeout(r, 1000))

  await b.append(`b${bi++}`, true)

  await new Promise(r => setTimeout(r, 1000))
  await a.append(`a${ai++}`, true)

  let i = 0
  for await (const data of b) {
    if (data !== order[i]) {
      b.destroy(new Error(`Bad order ${i}`))
      t.fail(`writer b failed at block ${i}`)
    }

    if (++i === order.length) break
  }

  i = 0
  for await (const data of c) {
    if (data !== order[i]) {
      c.destroy(new Error(`Bad order ${i}`))
      t.fail(`writer c failed at block ${i}`)
    }

    if (++i === order.length) break
  }

  t.pass()
})

test('chaos', async t => {
  const WRITERS = 100

  const cores = new Array(WRITERS).fill(0).map(getCore)

  await Promise.all(cores.map(c => c.ready()))

  cores.sort((a, b) => Buffer.compare(a.key, b.key))

  const replicas = cores.map(getCore)
  await Promise.all(replicas.map(c => c.ready()))

  replicas.forEach((r, i) => replicate(cores[i], r))

  const channels = cores.map((c, i) => {
    const input = [...replicas]
    input[i] = c
    return new Autochannel(input)
  })

  const order = []
  const counts = cores.map(c => 0)

  channels[0].on('data', data => { order.push(data) })

  while (counts[0] < 100) {
    if (random() < 0.7) await new Promise(r => setTimeout(r, 500))

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i]
      for (let j = 0; j < random(10); j++) {
        await append(channel, i, counts[i]++)
      }
    }
  }

  await Promise.all(channels.slice(1).map(async (c, i) => {
    let block = 0
    for await (const data of b) {
      if (data !== order[block]) {
        b.destroy(new Error(`Writer ${i + 1}: Bad order ${block}`))
        t.fail(`writer ${i} failed at block ${block}`)
      }

      if (++block === order.length) break
    }
    t.ok('passed ' + i + 1)
  }))

  t.end()
})

async function replicate (a, b) {
  const as = a.replicate(true)
  const bs = b.replicate(false)

  as.pipe(bs).pipe(as)
}

async function read (label, channel) {
  for await (const block of channel) {
  }
}

function getCore (core) {
  return new Hypercore(() => new RAM(), core?.key, { valueEncoding: 'json' })
}

function append (channel, label, value) {
  return channel.append(`writer ${label}: ${value}`)
}

function random (n = 1) {
  return Math.random() * n
}
