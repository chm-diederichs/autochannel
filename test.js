const RAM = require('random-access-memory')
const Hypercore = require('hypercore')
const Autochannel = require('./')

// range()
main().then(() => console.log('finished')).catch(console.log)

async function main () {
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

  const a = new Autochannel(al, ar)
  const b = new Autochannel(bl, br)

  replicate(al, br)
  replicate(bl, ar)

  let ai = 0
  let bi = 0

  a.on('data', data => console.log('a', data))

  await a.append(ai++, true)
  await a.append(ai++, true)
  await a.append(ai++, true)
  await a.append(ai++, true)

  await new Promise(r => setTimeout(r, 1000))

  await b.append(bi++, true)
  await b.append(bi++, false)
  await b.append(bi++, false)
  await b.append(bi++, false)

  await b.append(bi++, false)
  await b.append(bi++, false)

  await new Promise(r => setTimeout(r, 1000))

  await a.append(ai++, true)
  await a.append(ai++, true)
  await a.append(ai++, true)
  await a.append(ai++, true)

  await new Promise(r => setTimeout(r, 1000))

  console.log('append')
  await b.append(bi++, true)
  console.log('append')

  await new Promise(r => setTimeout(r, 1000))
  await a.append(ai++, true)

  b.on('data', data => console.log('b', data))

  await new Promise(r => setTimeout(r, 20000))
  async function start () {
    // console.log('starting')
    // startb()
    for await (const block of a) {
      console.log('----', block)
    }
  }

  async function startb () {
    // console.log('starting')
    for await (const block of b.accepted()) {
      // console.log('----', block)
    }
  }
}


async function multichaos () {
  const cores = [
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
  ]

  await Promise.all(cores.map(c => c.ready()))

  cores.sort((a, b) => Buffer.compare(a.key, b.key))
  const [al, bl] = cores

  const ar = new Hypercore(() => new RAM(), al.key, { valueEncoding: 'json' })
  const br = new Hypercore(() => new RAM(), bl.key, { valueEncoding: 'json' })

  await ar.ready()
  await br.ready()

  const a = new Autochannel(al, br)
  const b = new Autochannel(bl, ar)

  replicate(al, ar)
  replicate(bl, br)

  let ai = 0
  let bi = 0

  const order = []

  a.on('data', data => { order.push(data) })

  while (a.local.length < 100) {
    if (Math.random() < 0.7) await new Promise(r => setTimeout(r, 500))
    for (let i = 0; i < Math.random() * 10; i++) await a.append(`a${ai++}`)
    for (let i = 0; i < Math.random() * 10; i++) await b.append(`b${bi++}`)
  }

  let i = 0
  for await (const data of b) {
    if (data !== order[i++]) throw new Error('Bad order B' + i)
    if (i === order.length) break
  }

  console.log('passed')
}

async function replicate (a, b) {
  const as = a.replicate(true)
  const bs = b.replicate(false)

  as.pipe(bs).pipe(as)
}
