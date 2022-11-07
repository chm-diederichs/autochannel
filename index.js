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

    const init = this.initiator.createReadStream({ live: true }) // left
    const resp = this.responder.createReadStream({ live: true }) // right

    let left = null
    let pendingCommitment = null

    for await (const data of resp) {
      this.pending.push(({ data, seq: rseq++ }))

      if (!left) {
        left = init.read()

        // no initiator messages
        if (left === null) continue

        lseq++
      }

      // check if initiator has seen pending blocks
      while (this.pending.length) {
        if (left.remoteLength <= this.pending[0].seq) break
        this.batch.push(this.pending.shift().data) // use FIFO
      }

      // catch up on initiators feed
      while (left.remoteLength <= rseq) {
        if (left.commitment) pendingCommitment = left

        this.batch.push(left)
        left = init.read()
        if (left === null) break

        lseq++
      }

      // check for cosignature
      if (pendingCommitment) {
        pendingCommitment = null

        // currently only valid if the cosign is immediate
        if (data.remoteLength - 1 !== lseq && data.commitment) {
          // push all confirmed blocks
          while (this.batch.length) {
            this.push(this.batch.shift()) //use FIFO
          }
        }
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
