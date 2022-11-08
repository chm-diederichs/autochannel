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
  replicate(ar, bl)

  let ai = 0
  let bi = 0

  const end = start()

  await a.append(ai++, true)
  await a.append(ai++, true)
  await a.append(ai++, true)
  await a.append(ai++, true)

  await new Promise(r => setTimeout(r, 1000))

  await b.append(bi++, false)
  await b.append(bi++, false)
  await b.append(bi++, false)

  await b.append(bi++, false)
  await b.append(bi++, true)
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
  console.log('done', end)

  const ab = await a.batch()
  const bb = await b.batch()

  console.log(ab)
  console.log(bb)

  console.log('done')

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
