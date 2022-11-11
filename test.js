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

  const end = read('a', a)

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

  await b.append(bi++, true)

  await new Promise(r => setTimeout(r, 1000))
  await a.append(ai++, true)

  b.on('data', data => console.log('b', data))
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
    if (data !== order[i++]) throw new Error('Bad order B')
    if (i === order.length) break
  }

  i = 0
  for await (const data of c) {
    if (data !== order[i++]) throw new Error('Bad order C' + i)
    if (i === order.length) break
  }

  console.log('passed')
}

async function multichaos () {
  const cores = [
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
    new Hypercore(() => new RAM(), { valueEncoding: 'json' }),
    new Hypercore(() => new RAM(), { valueEncoding: 'json' })
  ]

  await Promise.all(cores.map(c => c.ready()))

  cores.sort((a, b) => Buffer.compare(a.key, b.key))
  // const [al, bl] = cores
  const [al, bl, cl] = cores

  const ar = new Hypercore(() => new RAM(), al.key, { valueEncoding: 'json' })
  const br = new Hypercore(() => new RAM(), bl.key, { valueEncoding: 'json' })
  const cr = new Hypercore(() => new RAM(), cl.key, { valueEncoding: 'json' })

  await ar.ready()
  await br.ready()
  await cr.ready()

  // const a = new Autochannel([al, br])
  // const b = new Autochannel([bl, ar])

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

  while (a.local.length < 100) {
    if (Math.random() < 0.7) await new Promise(r => setTimeout(r, 500))
    for (let i = 0; i < Math.random() * 10; i++) await a.append(`a${ai++}`)
    for (let i = 0; i < Math.random() * 10; i++) await b.append(`b${bi++}`)
    for (let i = 0; i < Math.random() * 10; i++) await c.append(`c${ci++}`)
  }

  await new Promise(r => setTimeout(r, 2000))

  let i = 0
  for await (const data of b) {
    console.log(data, order[i])

    if (data !== order[i++]) b.destroy(new Error('Bad order B' + i))
    if (i === order.length) break
  }

  // i = 0
  // for await (const data of c) {
  //   if (data !== order[i++]) throw new Error('Bad order C' + i)
  //   if (i === order.length) break
  // }

  console.log('passed')
}

async function replicate (a, b) {
  const as = a.replicate(true)
  const bs = b.replicate(false)

  as.pipe(bs).pipe(as)
}

async function read (label, channel) {
  for await (const block of channel) {
  }
}
