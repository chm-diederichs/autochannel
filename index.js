const { Readable } = require('streamx')

module.exports = class Autochannel extends Readable {
  constructor (local, remote, opts = {}) {
    super(opts)

    this.local = local
    this.remote = remote

    this.isInitiator = Buffer.compare(local.key, remote.key) < 0

    this.init = this.isInitiator ? local : remote
    this.resp = this.isInitiator ? remote : local

    this.onBatch = opts.onBatch || noop
  }

  async ready () {
    await this.local.ready()
    await this.remote.ready()
  }

  _open (cb) {
    this._openp().then(cb, cb)
  }

  async _openp () {
    await this.ready()

    let batch = []

    const i = {
      core: this.init,
      pending: [],
      stream: this.init.createReadStream({ live: true }),
      length: 0
    }

    const r = {
      core: this.resp,
      pending: [],
      stream: this.resp.createReadStream({ live: true }),
      length: 0
    }

    const bumpBound = bump.bind(this)

    i.stream.on('data', function (data) {
      i.pending.push(data)
      bumpBound()
    })

    r.stream.on('data', function (data) {
      r.pending.push(data)
      bumpBound()
    })

    function push (next) {
      const data = next.pending.shift()
      next.length++
      if (!data.op && !data.commitment) return
      batch.push({ core: next.core, op: data.op, commitment: data.commitment })
    }

    function bump () {
      while (i.pending.length) {
        if (i.pending[0].remoteLength > r.length) {
          if (r.pending.length) {
            push(r)
            continue
          }
          break
        }

        push(i)
      }

      if (batch.length) this.onBatch(batch)
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
          remoteLength: r.length + r.pending.length
        })
      }
    }
  }

  async append (op, commitment) {
    const remoteLength = this.remote.length

    const entry = {
      op,
      commitment,
      remoteLength
    }

    return this.local.append(entry)
  }
}

function noop () {}
