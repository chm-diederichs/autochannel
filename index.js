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

    for await (const data of resp) {
      this.responderBatch.push({ data, seq: rseq++ })
      this.process()
    }

    function onInitiator (data) {
      this.initiatorBatch.push({ data, seq: lseq++ })
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

  process () {
    const resp = this.responderBatch[Symbol.iterator]()
    const init = this.initiatorBatch[Symbol.iterator]()

    let icount = 0
    let rcount = 0

    let r = resp.next()

    // implies no cosignatures
    if (r.done) return

    let pendingCommitment = null
    const batch = []

    for (const l of init) {
      icount++

      if (r.value.seq >= l.data.remoteLength - 1) {
        batch.push(l)

        if (l.data.commitment) {
          pendingCommitment = l
        } else {
          continue
        }
      }

      // protocol dictates that commitment immediately follows
      if (pendingCommitment) {
        pendingCommitment = null

        if (r.value.data.remoteLength - 1 === l.seq && r.value.data.commitment) {
          while (batch.length) {
            this.push(batch.shift())
          }

          this.initiatorBatch = this.initiatorBatch.slice(icount)
          this.responderBatch = this.responderBatch.slice(rcount)

          return this.process()
        }
      }

      // keep looping until we reach head
      while (!r.done && r.value.data.remoteLength <= l.seq + 1) {
        rcount++

        r = resp.next()
        batch.push(r.value)
      }
    }
  }
}
