const { Readable } = require('streamx')

module.exports = class Autochannel extends Readable {
  constructor (cores, opts = {}) {
    super(opts)

    this.cores = cores
    this.cores.sort((a, b) => Buffer.compare(a.key, b.key))

    this.writers = this.cores.map(createWriter)
    this.local = this.cores.find(c => c.writable)

    this.onBatch = opts.onBatch
      ? opts.onBatch
      : batch => {
        while (batch.length) this.push(batch.shift().op)
      }
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

    const batch = []

    const writers = this.writers
    const onBatch = this.onBatch.bind(this)

    this.writers.map(w => w.start())

    this.writers.forEach(w => {
      w.stream.on('data', function (data) {
        w.pending.push(data)
        bump()
      })
    })

    function push (next) {
      const data = next.pending.shift()
      if (!data) return
      next.length++
      // console.log(data)
      if (!data.op && !data.commitment) return
      batch.push({ core: next.core, op: data.op, commitment: data.commitment })
    }

    function bump (i = 0, stop) {
      const init = writers[i]
      while (init.pending.length) {
        if (stop && init.length === stop) break

        for (let r = i + 1; r < writers.length; r++) {
          const resp = writers[r]

          const remoteLength = init.pending[0].remoteLength[r - 1]
          if (remoteLength > resp.length) {
            if (resp.pending.length) {
              bump(r, remoteLength)
              continue
            }
            break
          }
        }

        push(init)

        // if (r.pending.length && r.pending[0].remoteLength[pos + 1] > i.length) {
        //   // r.stream.pause()
        //   // i.stream.resume() // if not backpressued
        //   continue
        // }

        // if (i.pending.length && i.pending[0].remoteLength[pos + 1] > r.length) {
        //   // i.stream.pause()
        //   // r.stream.resume() // if not backpressued
        //   continue
        // }
      }

      if (batch.length) onBatch(batch)
      // i.stream.resume()
      // r.stream.resume()

      const pending = writers.reduce((acc, w, idx) => {
        if (idx <= i) return acc
        return acc || w.pending.length > 0
      }, false)

      if (pending && init.core.writable && init.core.length === init.length) {
        // append ack
        init.core.append({
          op: null,
          commitment: null,
          remoteLength: getClock(writers)
        })
      }
    }
  }

  async append (op, commitment) {
    const entry = {
      op,
      commitment,
      remoteLength: getClock(this.writers)
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

function getClock (writers) {
  const clock = []
  writers.forEach(({ core }) => {
    if (core.writable) return
    clock.push(core.length)
  })
  return clock
}
