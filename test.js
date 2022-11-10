const RAM = require('random-access-memory')
const Hypercore = require('hypercore')
const Autochannel = require('./')

// range()
multimain().then(() => console.log('finished')).catch(console.log)

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

  const a = new Autochannel([al, ar])
  const b = new Autochannel([bl, br])

  replicate(al, br)
  replicate(bl, ar)

  let ai = 0
  let bi = 0

  a.on('data', data => console.log('a', data))

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

async function multimain () {
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

  a.on('data', data => console.log('a', data))

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

  await c.append(`c${ci++}`, false)

  await new Promise(r => setTimeout(r, 1000))

  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)
  await a.append(`a${ai++}`, true)

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

async function replicate (a, b) {
  const as = a.replicate(true)
  const bs = b.replicate(false)

  as.pipe(bs).pipe(as)
}
