const { Readable } = require('streamx')

module.exports = class Autochannel extends Readable {
  constructor (local, remote, opts = {}) {
    super(opts)

    this.local = local
    this.remote = remote

    this.isInitiator = Buffer.compare(local.key, remote.key) < 0

    this.initiator = this.isInitiator ? local : remote
    this.responder = this.isInitiator ? remote : local

    this.batch = []
    this.pending = []

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

    let pendingCommitment = null

    let i = null
    for await (const data of resp) {
      this.pending.push(({ data, seq: rseq++ }))

      if (!i) {
        i = init.read()
        if (i === null) continue
        lseq++
      }

      while (this.pending.length) {
        if (i.remoteLength <= this.pending[0].seq) break
        this.batch.push(this.pending.shift().data) // use FIFO
      }

      while (i.remoteLength <= rseq) {
        if (i.commitment) pendingCommitment = i

        this.batch.push(i)
        i = init.read()
        if (i === null) break

        lseq++
      }

      if (pendingCommitment) {
        pendingCommitment = null
        if (data.remoteLength - 1 !== lseq && data.commitment) {
          while (this.batch.length) {
            this.push(this.batch.shift()) //use FIFO
          }
        }
      }

      if (i !== null) this.batch.push(data)
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
