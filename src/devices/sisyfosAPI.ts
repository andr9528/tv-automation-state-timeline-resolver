import * as osc from 'osc'
import {
	SisyfosState,
	SisyfosCommand,
	Commands,
	ValueCommand,
	StringCommand,
	SisyfosAPIState,
	SisyfosChannel
} from '../types/src/sisyfos'
import { EventEmitter } from 'events'

/** How often to check connection status */
const CONNECTIVITY_INTERVAL = 3000 // ms
const CONNECTIVITY_TIMEOUT = 1000 // ms

export class SisyfosInterface extends EventEmitter {
	host: string
	port: number

	private _oscClient: osc.UDPPort
	private _state?: SisyfosState

	private _connectivityCheckInterval: NodeJS.Timer
	private _pingCounter: number = Math.round(Math.random() * 10000)
	private _connectivityTimeout: NodeJS.Timer | null = null
	private _connected: boolean = false
	private _mixerOnline: boolean = true

	/**
	 * Connnects to the OSC server.
	 * @param host ip to connect to
	 * @param port port the osc server is hosted on
	 */
	connect (host: string, port: number): Promise<void> {
		this.host = host
		this.port = port

		this._oscClient = new osc.UDPPort({
			localAddress: '0.0.0.0',
			localPort: 5256, // To avoid not using the same port both ways on local installs, this port is one higher
			remoteAddress: this.host,
			remotePort: this.port,
			metadata: true
		})
		this._oscClient.on('error', (error: any) => this.emit('error', error))
		this._oscClient.on('message', (received: osc.OscMessage) => this.receiver(received))

		return new Promise((resolve) => {
			this._oscClient.once('ready', () => {
				// Monitor connectivity:
				this._monitorConnectivity()

				// Request initial, full state:
				this._oscClient.send({ address: '/state/full', args: [] })
			})
			this._oscClient.open()

			if (this.isInitialized()) {
				resolve()
			} else {
				// Wait for the state to be received from sisyfos
				this.once('initialized', () => {
					resolve()
				})
			}
		})
	}
	dispose () {
		this.updateIsConnected(false)
		if (this._connectivityCheckInterval) {
			clearInterval(this._connectivityCheckInterval)
		}
		this._oscClient.close()
	}

	send (command: SisyfosCommand) {
		if (command.type === Commands.TAKE) {
			this._oscClient.send({ address: '/take', args: [] })
		} else if (command.type === Commands.CLEAR_PST_ROW) {
			this._oscClient.send({ address: '/clearpst', args: [] })
		} else if (command.type === Commands.LABEL) {
			this._oscClient.send({ address: `/ch/${(command as StringCommand).channel + 1}/label`, args: [{
				type: 's',
				value: (command as StringCommand).value
			}] })
		} else if (command.type === Commands.TOGGLE_PGM) {
			this._oscClient.send({ address: `/ch/${(command as ValueCommand).channel + 1}/pgm`, args: [{
				type: 'i',
				value: (command as ValueCommand).value
			}] })
		} else if (command.type === Commands.TOGGLE_PST) {
			this._oscClient.send({ address: `/ch/${(command as ValueCommand).channel + 1}/pst`, args: [{
				type: 'i',
				value: (command as ValueCommand).value
			}] })
		} else if (command.type === Commands.SET_FADER) {
			this._oscClient.send({ address: `/ch/${(command as ValueCommand).channel + 1}/faderlevel`, args: [{
				type: 'f',
				value: (command as ValueCommand).value
			}] })
		} else if (command.type === Commands.VISIBLE) {
			this._oscClient.send({ address: `/ch/${(command as ValueCommand).channel + 1}/visible`, args: [{
				type: 'i',
				value: (command as ValueCommand).value
			}] })
		}
	}

	disconnect () {
		this._oscClient.close()
	}
	isInitialized (): boolean {
		return !!this._state
	}
	reInitialize () {
		this._state = undefined
		this._oscClient.send({ address: '/state/full', args: [] })
	}

	get connected (): boolean {
		return this._connected
	}
	get state (): SisyfosAPIState | undefined {
		return this._state
	}

	get mixerOnline (): boolean {
		return this._mixerOnline
	}

	setMixerOnline (state: boolean) {
		this._mixerOnline = state
	}

	private _monitorConnectivity () {
		const pingSisyfos = () => {
			this._oscClient.send({ address: `/ping/${this._pingCounter}`, args: [] })

			const waitingForPingCounter = this._pingCounter
			// Expect a reply within a certain time:
			this._clearPingTimer()

			this._connectivityTimeout = setTimeout(() => {
				if (waitingForPingCounter === this._pingCounter) {
					// this._pingCounter hasn't changed, ie no response has been received
					this.updateIsConnected(false)
				}
			}, CONNECTIVITY_TIMEOUT)
		}
		// Ping Sisyfos and expect a reply back:
		pingSisyfos()
		this._connectivityCheckInterval = setInterval(() => {
			pingSisyfos()
		}, CONNECTIVITY_INTERVAL)
	}

	private _clearPingTimer () {
		if (this._connectivityTimeout) {
			clearTimeout(this._connectivityTimeout)
			this._connectivityTimeout = null
		}
	}

	private receiver (message: osc.OscMessage) {
		const address = message.address.substr(1).split('/')
		if (address[0] === 'state') {
			if (address[1] === 'full') {
				this._state = this.parseSisyfosState(message)
				this.emit('initialized')
			} else if (address[1] === 'ch' && this._state) {
				const ch = address[2]
				this._state.channels[ch] = {
					...this._state.channels[ch],
					...this.parseChannelCommand(message, address.slice(3))
				}
			}
		} else if (address[0] === 'pong') { // a reply to "/ping"
			let pingValue = parseInt(message.args[0].value, 10)
			if (pingValue && this._pingCounter === pingValue) {
				this._clearPingTimer()
				this.updateIsConnected(true)
				this._pingCounter++
				this.emit('mixerOnline', true)
			} else if (message.args[0].value === 'offline') {
				this._clearPingTimer()
				this.updateIsConnected(true)
				this._pingCounter++
				this.emit('mixerOnline', false)
			}
		}
	}

	private updateIsConnected (connected: boolean) {
		if (this._connected !== connected) {
			this._connected = connected

			if (connected) {
				this.emit('connected')
			} else {
				this.emit('disconnected')
			}
		}
	}

	private parseChannelCommand (message: osc.OscMessage, address: Array<string>) {
		if (address[0] === 'pgm') {
			return { pgmOn: message.args[0].value }
		} else if (address[0] === 'pst') {
			return { pstOn: message.args[0].value }
		} else if (address[0] === 'faderlevel') {
			return { faderLevel: message.args[0].value }
		}
		return {}
	}

	private parseSisyfosState (message: osc.OscMessage): SisyfosState {
		const extState = JSON.parse(message.args[0].value)
		const deviceState: SisyfosState = { channels: {}, resync: false }

		Object.keys(extState.channel).forEach((index: string) => {
			const ch = extState.channel[index]

			let pgmOn: number = 0
			if (ch.pgmOn === true) {
				pgmOn = 1
			} else if (ch.voOn === true) {
				pgmOn = 2
			}
			const channel: SisyfosChannel = {
				faderLevel: ch.faderLevel || 0.75,
				pgmOn: pgmOn,
				pstOn: ch.pstOn === true ? 1 : 0,
				label: ch.label || '',
				visible: ch.showChannel ? true : false,
				tlObjIds: []
			}

			deviceState.channels[index] = channel
		})

		return deviceState
	}
}
