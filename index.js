const { Readable } = require('streamx')

module.exports = class Autochannel extends Readable {
  constructor (local, remote, opts = {}) {
    super(opts)

    this.local = local
    this.remote = remote

    this.isInitiator = Buffer.compare(local.key, remote.key) < 0

    this.initiator = this.isInitiator ? local : remote
    this.responder = this.isInitiator ? remote : local

    this.initiatorBatch = []
    this.responderBatch = []

    this.prev = {
      initiator: 0,
      responder: 0
    }
  }

  async ready () {
    await this.local.ready()
    await this.remote.ready()
  }

  _open (cb) {
    this._openp().then(() => {
      console.log('done')
      cb()
    }, cb)
  }

  async _openp () {
    await this.ready()
    this.start()
  }

  async start () {
    let lseq = 0
    let rseq = 0

    const init = this.initiator.createReadStream({ live: true })
    const resp = this.responder.createReadStream({ live: true })

    init.on('data', onInitiator.bind(this))
    resp.on('data', onResponder.bind(this))

    function onInitiator (data) {
      // if (data.commitment) this.onCommit(data)

      this.initiatorBatch.push({ data, seq: lseq++ })
    }

    function onResponder (data) {
      // if (data.commitment) this.onCommit(data)

      this.responderBatch.push({ data, seq: rseq++ })
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

  batch () {
    const batch = []

    const resp = this.responderBatch[Symbol.iterator]()
    let r = resp.next()

    // initiator controls ordering
    for (const l of this.initiatorBatch) {
      if (r.done || r.value.seq >= l.data.remoteLength - 1) {
        batch.push(l)
      }

      // keep looping until we reach head
      while (!r.done && r.value.data.remoteLength <= l.seq + 1) {
        batch.push(r.value)
        r = resp.next()
      }
    }

    return batch
  }
}
