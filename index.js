const { Readable } = require('streamx')

module.exports = class Autochannel extends Readable {
  constructor (cores, opts = {}) {
    super(opts)

    this.cores = cores
    this.cores.sort((a, b) => Buffer.compare(a.key, b.key))

    this.writers = this.cores.map(createWriter)
    this.local = this.cores.find(c => c.writable)
  }

  async ready () {
    await Promise.all(this.cores.map(c => c.ready()))
  }

  _open (cb) {
    this._openp().then(cb, cb)
  }

  async addCore (core) {
    await core.ready()
    this.cores.push(core)
  }

  async _openp () {
    await this.ready()

    let batch = []

    const bumpBound = bump.bind(this)
    const compareBound = compare.bind(this)

    this.writers.map(w => w.start())

    this.writers.forEach(w => {
      w.stream.on('data', function (data) {
        w.pending.push(data)
        bumpBound()
      })
    })

    function push (next) {
      const data = next.pending.shift()
      next.length++
      if (!data.op && !data.commitment) return
      batch.push({ core: next.core, op: data.op, commitment: data.commitment })
    }

    function bump () {
      const writers = [...this.writers]
      const lead = writers.shift()

      compareBound(lead, writers)
    }

    function compare (i, writers) {
      if (!writers.length) return push(i)

      const r = writers.shift()

      while (i.pending.length) {
        if (i.pending[0].remoteLength > r.length) {
          if (r.pending.length) {
            compareBound(r, writers.slice())
            continue
          }
          break
        }

        compareBound(i, writers.slice(1))
      }

      // if (batch.length) await this.onBatch(batch)
      while (batch.length) this.push(batch.shift().op)

      if (r.pending.length && r.pending[0].remoteLength > i.length) {
        // r.stream.pause()
        // i.stream.resume() // if not backpressued
        return
      }

      if (i.pending.length && i.pending[0].remoteLength > r.length) {
        // i.stream.pause()
        // r.stream.resume() // if not backpressued
        return
      }

      // i.stream.resume()
      // r.stream.resume()

      if (r.pending.length && i.core.writable && i.core.length === i.length) {
        // append ack
        i.core.append({
          op: null,
          commitment: null,
          remoteLength: r.length + r.pending.length // 71
        })
      }
    }
  }

  async append (op, commitment) {
    const remoteLength = []
    this.cores.forEach(core => {
      if (core.writable) return
      remoteLength.push(core.length)
    })

    const entry = {
      op,
      commitment,
      remoteLength: remoteLength.pop()
    }

    return this.local.append(entry)
  }
}

function createWriter (core) {
  return {
    core: core,
    pending: [],
    stream: null,
    length: 0,
    start () {
      this.stream = core.createReadStream({ live: true })
    }
  }
}