import * as _ from 'underscore'
import { EventEmitter } from 'events'
import {
	DeviceWithState,
	CommandWithContext,
	DeviceStatus,
	StatusCode,
	IDevice,
	literal
} from './device'

import {
	DeviceType,
	Mapping,
	VizMSEOptions,
	ResolvedTimelineObjectInstanceExtended,
	TimelineObjVIZMSEElementInternal,
	TimelineContentTypeVizMSE,
	TimelineObjVIZMSEElementPilot,
	ExpectedPlayoutItemContent,
	ExpectedPlayoutItemContentVizMSE,
	DeviceOptionsVizMSE,
	TimelineObjVIZMSEAny
} from '../types/src'

import {
	TimelineState, ResolvedTimelineObjectInstance
} from 'superfly-timeline'

import {
	createMSE,
	MSE,
	VRundown,
	InternalElement,
	ExternalElement,
	VElement
} from 'v-connection'

import { DoOnTime, SendMode } from '../doOnTime'

import * as crypto from 'crypto'

/** The ideal time to prepare elements before going on air */
const IDEAL_PREPARE_TIME = 1000
/** Minimum time to wait after preparing elements */
const PREPARE_TIME_WAIT = 50

// How often to check / preload elements
const MONITOR_INTERVAL = 5 * 1000

// How long to wait after any action (takes, cues, etc) before trying to cue for preloading
const SAFE_PRELOAD_TIME = 2000

export function getHash (str: string): string {
	const hash = crypto.createHash('sha1')
	return hash.update(str).digest('base64').replace(/[\+\/\=]/g, '_') // remove +/= from strings, because they cause troubles
}

export interface DeviceOptionsVizMSEInternal extends DeviceOptionsVizMSE {
	options: (
		DeviceOptionsVizMSE['options'] &
		{ commandReceiver?: CommandReceiver }
	)
}
export type CommandReceiver = (time: number, cmd: VizMSECommand, context: string, timelineObjId: string) => Promise<any>
/**
 * This class is used to interface with a vizRT Media Sequence Editor, through the v-connection library
 */
export class VizMSEDevice extends DeviceWithState<VizMSEState> implements IDevice {

	private _vizMSE?: MSE
	private _vizmseManager?: VizMSEManager

	private _commandReceiver: CommandReceiver

	private _doOnTime: DoOnTime
	private _initOptions?: VizMSEOptions
	private _vizMSEConnected: boolean = false

	constructor (deviceId: string, deviceOptions: DeviceOptionsVizMSEInternal, options) {
		super(deviceId, deviceOptions, options)

		if (deviceOptions.options) {
			if (deviceOptions.options.commandReceiver) this._commandReceiver = deviceOptions.options.commandReceiver
			else this._commandReceiver = this._defaultCommandReceiver
		}

		this._doOnTime = new DoOnTime(() => {
			return this.getCurrentTime()
		}, SendMode.IN_ORDER, this._deviceOptions)
		this.handleDoOnTime(this._doOnTime, 'VizMSE')
	}

	async init (initOptions: VizMSEOptions): Promise<boolean> {
		this._initOptions = initOptions
		if (!this._initOptions.host) 	throw new Error('VizMSE bad option: host')

		this._vizMSE = createMSE(
			this._initOptions.host,
			this._initOptions.restPort,
			this._initOptions.wsPort
		)

		this._vizmseManager = new VizMSEManager(
			this,
			this._vizMSE,
			this._initOptions.preloadAllElements
		)

		this._vizmseManager.on('connectionChanged', (connected) => this.connectionChanged(connected))

		await this._vizmseManager.initializeRundown(
			initOptions.showID,
			initOptions.profile,
			initOptions.playlistID
		)

		this._vizmseManager.on('info', str => this.emit('info', 'VizMSE: ' + str))
		this._vizmseManager.on('warning', str => this.emit('warning', 'VizMSE' + str))
		this._vizmseManager.on('error', e => this.emit('error', 'VizMSE', e))
		this._vizmseManager.on('debug', (...args) => this.emit('debug', ...args))

		return true
	}

	/**
	 * Terminates the device safely such that things can be garbage collected.
	 */
	async terminate (): Promise<boolean> {
		if (this._vizmseManager) {
			await this._vizmseManager.terminate()
			delete this._vizmseManager
		}
		this._doOnTime.dispose()

		return true
	}
	/** Called by the Conductor a bit before a .handleState is called */
	prepareForHandleState (newStateTime: number) {
		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(newStateTime)
		this.cleanUpStates(0, newStateTime)
	}
	/**
	 * Generates an array of VizMSE commands by comparing the newState against the oldState, or the current device state.
	 */
	handleState (newState: TimelineState) {
		// check if initialized:
		if (!this._vizmseManager || !this._vizmseManager.initialized) {
			this.emit('warning', 'VizMSE.v-connection not initialized yet')
			return
		}

		let previousStateTime = Math.max(this.getCurrentTime(), newState.time)

		let oldVizMSEState: VizMSEState = (
			this.getStateBefore(previousStateTime) ||
			{ state: { time: 0, layer: {} } }
		).state

		let newVizMSEState = this.convertStateToVizMSE(newState)

		let commandsToAchieveState = this._diffStates(oldVizMSEState, newVizMSEState, newState.time)

		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(previousStateTime)

		// add the new commands to the queue
		this._addToQueue(commandsToAchieveState)

		// store the new state, for later use:
		this.setState(newVizMSEState, newState.time)
	}

	/**
	 * Clear any scheduled commands after this time
	 * @param clearAfterTime
	 */
	clearFuture (clearAfterTime: number) {
		this._doOnTime.clearQueueAfter(clearAfterTime)
	}
	get canConnect (): boolean {
		return true
	}
	get connected (): boolean {
		return this._vizMSEConnected
	}

	get deviceType () {
		return DeviceType.VIZMSE
	}
	get deviceName (): string {
		return `VizMSE ${this._vizMSE ? this._vizMSE.hostname : 'Uninitialized'}`
	}

	get queue () {
		return this._doOnTime.getQueue()
	}

	get supportsExpectedPlayoutItems (): boolean {
		return true
	}
	public handleExpectedPlayoutItems (expectedPlayoutItems: Array<ExpectedPlayoutItemContent>): void {
		if (this._vizmseManager) {
			this._vizmseManager.setExpectedPlayoutItems(expectedPlayoutItems)
		}
	}

	public getCurrentState (): VizMSEState | undefined {
		return (this.getState() || {}).state
	}
	public connectionChanged (connected?: boolean) {
		if (connected === true || connected === false) this._vizMSEConnected = connected
		this.emit('connectionChanged', this.getStatus())
	}
	/**
	 * Takes a timeline state and returns a VizMSE State that will work with the state lib.
	 * @param timelineState The timeline state to generate from.
	 */
	convertStateToVizMSE (timelineState: TimelineState): VizMSEState {

		const state: VizMSEState = {
			time: timelineState.time,
			layer: {}
		}

		const mappings = this.getMapping()

		_.each(timelineState.layers, (layer: ResolvedTimelineObjectInstance, layerName: string) => {

			const layerExt = layer as ResolvedTimelineObjectInstanceExtended
			let foundMapping: Mapping = mappings[layerName]

			let isLookahead = false
			if (!foundMapping && layerExt.isLookahead && layerExt.lookaheadForLayer) {
				foundMapping = mappings[layerExt.lookaheadForLayer]
				isLookahead = true
			}
			if (
				foundMapping &&
				foundMapping.device === DeviceType.VIZMSE
			) {
				if (layer.content) {

					let l = layer as any as TimelineObjVIZMSEAny

					if (l.content.type === TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS) {
						state.layer[layerName] = literal<VizMSEStateLayerLoadAllElements>({
							timelineObjId: l.id,
							contentType: TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS
						})

					} else if (l.content.type === TimelineContentTypeVizMSE.CONTINUE) {
						state.layer[layerName] = literal<VizMSEStateLayerContinue>({
							timelineObjId: l.id,
							contentType: TimelineContentTypeVizMSE.CONTINUE,
							direction: l.content.direction,
							reference: l.content.reference
						})

					} else {
						const stateLayer = content2StateLayer(
							l.id,
							l.content as any
						)
						if (stateLayer) {
							if (isLookahead) stateLayer.lookahead = true

							state.layer[layerName] = stateLayer
						}
					}

				}
			}
		})

		// Fix references:
		_.each(state.layer, (layer) => {
			if (layer.contentType === TimelineContentTypeVizMSE.CONTINUE) {
				const otherLayer = state.layer[layer.reference]
				if (otherLayer) {
					if (
						otherLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
						otherLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT
					) {
						layer.referenceContent = otherLayer
					} else {
						// it's not possible to reference that kind of object
						this.emit('warning', `object "${layer.timelineObjId}" of contentType="${layer.contentType}", cannot reference object "${otherLayer.timelineObjId}" on layer "${layer.reference}" of contentType="${otherLayer.contentType}" `)
					}
				}
			}
		})

		return state

	}

	/**
	 * Prepares the physical device for playout.
	 * @param okToDestroyStuff Whether it is OK to do things that affects playout visibly
	 */
	async makeReady (okToDestroyStuff?: boolean): Promise<void> {
		if (this._vizmseManager) {
			await this._vizmseManager.activate()
		} else throw new Error(`Unable to activate vizMSE, not initialized yet!`)

		if (okToDestroyStuff) {
			// reset our own state(s):
			this.clearStates()
		}
	}
	/**
	 * The standDown event could be triggered at a time after broadcast
	 * @param okToDestroyStuff If true, the device may do things that might affect the visible output
	 */
	async standDown (okToDestroyStuff?: boolean): Promise<void> {
		if (okToDestroyStuff) {
			if (this._vizmseManager) {
				await this._vizmseManager.deactivate()
			}
		}
	}
	getStatus (): DeviceStatus {
		let statusCode = StatusCode.GOOD
		let messages: Array<string> = []

		if (!this._vizMSEConnected) {
			statusCode = StatusCode.BAD
			messages.push('Not connected')
		}

		if (
			this._vizmseManager &&
			(
				this._vizmseManager.notLoadedCount > 0 ||
				this._vizmseManager.loadingCount > 0
			)
		) {
			statusCode = StatusCode.WARNING_MINOR
			messages.push(`Got ${this._vizmseManager.notLoadedCount} elements not yet loaded to the Viz Engine (${this._vizmseManager.loadingCount} are currently loading)`)
		}

		return {
			statusCode: statusCode,
			messages: messages
		}
	}

	private _diffStates (oldState: VizMSEState, newState: VizMSEState, time: number): Array<VizMSECommand> {
		const highPrioCommands: VizMSECommand[] = []
		const lowPrioCommands: VizMSECommand[] = []

		const addCommand = (command: VizMSECommand, lowPriority?: boolean) => {
			(lowPriority ? lowPrioCommands : highPrioCommands).push(command)
		}

		/** The time of when to run "preparation" commands */
		let prepareTime = Math.min(
			time,
			Math.max(
				time - IDEAL_PREPARE_TIME,
				oldState.time + PREPARE_TIME_WAIT // earliset possible prepareTime
			)
		)
		if (prepareTime < this.getCurrentTime()) { // Only to not emit an unnessesary slowCommand event
			prepareTime = this.getCurrentTime()
		}
		if (time < prepareTime) {
			prepareTime = time - 10
		}

		_.each(newState.layer, (newLayer: VizMSEStateLayer, layerId: string) => {
			const oldLayer: VizMSEStateLayer | undefined = oldState.layer[layerId]

			if (
				newLayer.contentType === TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS
			) {
				if (!oldLayer || !_.isEqual(newLayer, oldLayer)) {

					addCommand(literal<VizMSECommandLoadAllElements>({
						timelineObjId: newLayer.timelineObjId,
						fromLookahead: newLayer.lookahead,

						type: VizMSECommandType.LOAD_ALL_ELEMENTS,
						time: time

					}), newLayer.lookahead)
				}
			} else if (
				newLayer.contentType === TimelineContentTypeVizMSE.CONTINUE
			) {
				if (
					(
						!oldLayer ||
						!_.isEqual(newLayer, oldLayer)
					) &&
					newLayer.referenceContent
				) {
					const props = {
						timelineObjId: newLayer.timelineObjId,
						fromLookahead: newLayer.lookahead,

						templateInstance: VizMSEManager.getTemplateInstance(newLayer.referenceContent),
						templateName: VizMSEManager.getTemplateName(newLayer.referenceContent),
						templateData: VizMSEManager.getTemplateData(newLayer.referenceContent),
						channelName: newLayer.referenceContent.channelName
					}
					if ((newLayer.direction || 1) === 1) {
						addCommand(literal<VizMSECommandContinue>({
							...props,
							type: VizMSECommandType.CONTINUE_ELEMENT,
							time: time

						}), newLayer.lookahead)
					} else {
						addCommand(literal<VizMSECommandContinueReverse>({
							...props,
							type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE,
							time: time

						}), newLayer.lookahead)
					}
				}
			} else {

				const props = {
					timelineObjId: newLayer.timelineObjId,
					fromLookahead: newLayer.lookahead,

					templateInstance: VizMSEManager.getTemplateInstance(newLayer),
					templateName: VizMSEManager.getTemplateName(newLayer),
					templateData: VizMSEManager.getTemplateData(newLayer),
					channelName: newLayer.channelName
				}

				if (
					!oldLayer ||
					!_.isEqual(
						_.omit(newLayer, ['continueStep']),
						_.omit(oldLayer, ['continueStep'])
					)
				) {
					if (
						newLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
						newLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT
					) {
						// Maybe prepare the element first:
						addCommand(literal<VizMSECommandPrepare>({
							...props,
							type: VizMSECommandType.PREPARE_ELEMENT,
							time: prepareTime
						}), newLayer.lookahead)

						if (newLayer.cue) {
							// Cue the element
							addCommand(literal<VizMSECommandCue>({
								...props,
								type: VizMSECommandType.CUE_ELEMENT,
								time: time
							}), newLayer.lookahead)
						} else {
							// Start playing element
							addCommand(literal<VizMSECommandTake>({
								...props,
								type: VizMSECommandType.TAKE_ELEMENT,
								time: time
							}), newLayer.lookahead)
						}
					}
				} else if (
					(
						oldLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
						oldLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT
					) &&
					(newLayer.continueStep || 0) > (oldLayer.continueStep || 0)
				) {
					// An increase in continueStep should result in triggering a continue:
					addCommand(literal<VizMSECommandContinue>({
						...props,
						type: VizMSECommandType.CONTINUE_ELEMENT,
						time: time

					}), newLayer.lookahead)
				} else if (
					(
						oldLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
						oldLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT
					) &&
					(newLayer.continueStep || 0) < (oldLayer.continueStep || 0)
				) {
					// A decrease in continueStep should result in triggering a continue:
					addCommand(literal<VizMSECommandContinueReverse>({
						...props,
						type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE,
						time: time
					}), newLayer.lookahead)
				}
			}
		})

		_.each(oldState.layer, (oldLayer: VizMSEStateLayer, layerId: string) => {
			const newLayer = newState.layer[layerId]
			if (!newLayer) {

				if (
					oldLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
					oldLayer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT
				) {
					// Stopped playing
					addCommand(literal<VizMSECommandTakeOut>({
						type: VizMSECommandType.TAKEOUT_ELEMENT,
						time: time,
						timelineObjId: oldLayer.timelineObjId,
						fromLookahead: oldLayer.lookahead,

						templateInstance: VizMSEManager.getTemplateInstance(oldLayer),
						templateName: VizMSEManager.getTemplateName(oldLayer),
						templateData: VizMSEManager.getTemplateData(oldLayer),
						channelName: oldLayer.channelName

					}), oldLayer.lookahead)
				}
			}
		})

		return highPrioCommands.concat(lowPrioCommands)
	}
	private _doCommand (command: VizMSECommand, context: string, timlineObjId: string): Promise<void> {
		let time = this.getCurrentTime()
		return this._commandReceiver(time, command, context, timlineObjId)
	}
	/**
	 * Use either AMCP Command Scheduling or the doOnTime to execute commands at
	 * {@code time}.
	 * @param commandsToAchieveState Commands to be added to queue
	 * @param time Point in time to send commands at
	 */
	private _addToQueue (commandsToAchieveState: Array<VizMSECommand>) {
		_.each(commandsToAchieveState, (cmd: VizMSECommand) => {
			this._doOnTime.queue(cmd.time, cmd.layerId, (c: {cmd: VizMSECommand}) => {
				return this._doCommand(c.cmd, c.cmd.type + '_' + c.cmd.timelineObjId, c.cmd.timelineObjId)
			}, { cmd: cmd })
		})

	}
	/**
	 * Sends commands to the VizMSE ISA server
	 * @param time deprecated
	 * @param cmd Command to execute
	 */
	private async _defaultCommandReceiver (_time: number, cmd: VizMSECommand, context: string, timelineObjId: string): Promise<any> {
		let cwc: CommandWithContext = {
			context: context,
			timelineObjId: timelineObjId,
			command: cmd
		}
		this.emit('debug', cwc)

		try {
			if (this._vizmseManager) {

				if (cmd.type === VizMSECommandType.PREPARE_ELEMENT) {
					await this._vizmseManager.prepareElement(cmd)
				} else if (cmd.type === VizMSECommandType.CUE_ELEMENT) {
					await this._vizmseManager.cueElement(cmd)
				} else if (cmd.type === VizMSECommandType.TAKE_ELEMENT) {
					await this._vizmseManager.takeElement(cmd)
				} else if (cmd.type === VizMSECommandType.TAKEOUT_ELEMENT) {
					await this._vizmseManager.takeoutElement(cmd)
				} else if (cmd.type === VizMSECommandType.CONTINUE_ELEMENT) {
					await this._vizmseManager.continueElement(cmd)
				} else if (cmd.type === VizMSECommandType.CONTINUE_ELEMENT_REVERSE) {
					await this._vizmseManager.continueElementReverse(cmd)
				} else if (cmd.type === VizMSECommandType.LOAD_ALL_ELEMENTS) {
					await this._vizmseManager.loadAllElements(cmd)
				} else {
					// @ts-ignore never
					throw new Error(`Unsupported command type "${cmd.type}"`)
				}
			} else {
				throw new Error(`Not initialized yet`)
			}
		} catch (error) {
			let errorString = (
				error && error.message ?
				error.message :
				error.toString()
			)
			this.emit('commandError', new Error(errorString), cwc)
		}
	}
}
class VizMSEManager extends EventEmitter {
	public initialized: boolean = false
	public notLoadedCount: number = 0
	public loadingCount: number = 0

	private _rundown: VRundown | undefined
	private _elementCache: {[hash: string]: CachedVElement } = {}
	private _expectedPlayoutItems: Array<ExpectedPlayoutItemContent> = []
	private _expectedPlayoutItemsItems: { [hash: string]: ExpectedPlayoutItemContentVizMSEInternal } = {}
	private _monitorAndLoadElementsInterval?: NodeJS.Timer
	private _lastTimeCommandSent: number = 0
	private _hasActiveRundown: boolean = false
	private _elementsLoaded: {[hash: string]: { element: VElement, isLoaded: boolean, isNotLoaded: boolean}} = {}

	constructor (
		private _parentVizMSEDevice: VizMSEDevice,
		private _vizMSE: MSE,
		public preloadAllElements: boolean
	) {
		super()
	}

	public async initializeRundown (
		showID: string,
		profile: string,
		playlistID?: string
	): Promise<void> {
		this._vizMSE.on('connected', () => this.emit('connectionChanged', true))
		this._vizMSE.on('disconnected', () => this.emit('connectionChanged', false))

		await this._vizMSE.ping()
		this.emit('connectionChanged', true)

		// Setup the rundown used by this device

		// check if it already exists:
		this._rundown = _.find(await this._vizMSE.getRundowns(), (rundown) => {
			return (
				rundown.show === showID &&
				rundown.profile === profile &&
				rundown.playlist === playlistID
			)
		})
		if (!this._rundown) {
			this._rundown = await this._vizMSE.createRundown(
				showID,
				profile,
				playlistID
			)
		}

		if (!this._rundown) throw new Error(`VizMSEManager: unable to create rundown!`)

		// const profile = await this._vizMSE.getProfile('sofie') // TODO: Figure out if this is needed

		this._updateExpectedPlayoutItems().catch(e => this.emit('error', e))

		if (this._monitorAndLoadElementsInterval) {
			clearInterval(this._monitorAndLoadElementsInterval)
		}
		this._monitorAndLoadElementsInterval = setInterval(() => this._monitorLoadedElements(), MONITOR_INTERVAL)

		this.initialized = true
	}
	public async terminate () {
		if (this._monitorAndLoadElementsInterval) {
			clearInterval(this._monitorAndLoadElementsInterval)
		}
		if (this._vizMSE) {
			await this._vizMSE.close()
			delete this._vizMSE
		}
	}
	public setExpectedPlayoutItems (expectedPlayoutItems: Array<ExpectedPlayoutItemContent>) {
		if (this.preloadAllElements) {
			this._expectedPlayoutItems = expectedPlayoutItems
		}
		this._updateExpectedPlayoutItems().catch(e => this.emit('error', e))
	}
	public async activate (): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		this._triggerCommandSent()
		await this._rundown.activate()
		this._triggerCommandSent()
		await this._triggerLoadAllElements()
		this._triggerCommandSent()
		this._hasActiveRundown = true
	}
	public async deactivate (): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		this._triggerCommandSent()
		await this._rundown.deactivate()
		this._triggerCommandSent()
		this._clearCache()
		this._hasActiveRundown = false
	}
	public async prepareElement (cmd: VizMSECommandPrepare): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)

		const elementHash = this.getElementHash(cmd)
		this.emit('debug', `VizMSE: prepare "${elementHash}"`)
		this._triggerCommandSent()
		await this._checkPrepareElement(cmd, true)
		this._triggerCommandSent()
	}
	public async cueElement (cmd: VizMSECommandCue): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		const rundown = this._rundown

		const elementRef = await this._checkPrepareElement(cmd)

		await this._handleRetry(() => {
			this.emit('debug', `VizMSE: cue "${elementRef}"`)
			return rundown.cue(elementRef)
		})
	}
	public async takeElement (cmd: VizMSECommandTake): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		const rundown = this._rundown

		const elementRef = await this._checkPrepareElement(cmd)

		await this._handleRetry(() => {
			this.emit('debug', `VizMSE: take "${elementRef}"`)
			return rundown.take(elementRef)
		})
	}
	public async takeoutElement (cmd: VizMSECommandTakeOut): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		const rundown = this._rundown

		const elementRef = await this._checkPrepareElement(cmd)
		await this._handleRetry(() => {
			this.emit('debug', `VizMSE: out "${elementRef}"`)
			return rundown.out(elementRef)
		})
	}
	public async continueElement (cmd: VizMSECommandContinue): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		const rundown = this._rundown

		const elementRef = await this._checkPrepareElement(cmd)
		await this._handleRetry(() => {
			this.emit('debug', `VizMSE: continue "${elementRef}"`)
			return rundown.continue(elementRef)
		})
	}
	public async continueElementReverse (cmd: VizMSECommandContinueReverse): Promise<void> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)
		const rundown = this._rundown

		const elementRef = await this._checkPrepareElement(cmd)
		await this._handleRetry(() => {
			this.emit('debug', `VizMSE: continue reverse "${elementRef}"`)
			return rundown.continueReverse(elementRef)
		})
	}
	public async loadAllElements (_cmd: VizMSECommandLoadAllElements): Promise<void> {
		this._triggerCommandSent()
		await this._triggerLoadAllElements()
		this._triggerCommandSent()
	}

	static getTemplateName (layer: VizMSEStateLayer): string | number {
		if (layer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL) return layer.templateName
		if (layer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT) return layer.templateVcpId
		throw new Error(`Unknown layer.contentType "${layer['contentType']}"`)
	}
	static getTemplateData (layer: VizMSEStateLayer): string[] {
		if (layer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL) return layer.templateData
		return []
	}
	static getTemplateInstance (layer: VizMSEStateLayer): string {
		if (layer.contentType === TimelineContentTypeVizMSE.ELEMENT_INTERNAL) {
			return 'sofieInt_' + layer.templateName + '_' + getHash(layer.templateData.join(','))
		}
		if (layer.contentType === TimelineContentTypeVizMSE.ELEMENT_PILOT) return 'pilot_' + layer.templateVcpId

		throw new Error(`Unknown layer.contentType "${layer['contentType']}"`)
	}

	private getElementHash (cmd: ExpectedPlayoutItemContentVizMSEInternal): string {
		if (_.isNumber(cmd.templateInstance)) {
			return 'pilot_' + cmd.templateInstance
		} else {
			return (
				'int_' +
				cmd.templateInstance
			)
		}
	}
	private _getCachedElement (hash: string): CachedVElement | undefined {
		return this._elementCache[hash]
	}
	private _cacheElement (hash: string, element: VElement) {
		if (this._elementCache[hash]) {
			this.emit('error', `There is already an element with hash "${hash}" in cache`)
		}
		this._elementCache[hash] = { hash, element }
	}
	private _clearCache () {
		_.each(_.keys(this._elementCache), hash => {
			delete this._elementCache[hash]
		})
	}
	private _getElementReference (el: InternalElement): string
	private _getElementReference (el: ExternalElement): number
	private _getElementReference (el: VElement): string | number
	private _getElementReference (el: VElement): string | number {
		if (this._isInternalElement(el)) return el.name
		if (this._isExternalElement(el)) return Number(el.vcpid) // TMP!!

		throw Error('Unknown element type, neither internal nor external')
	}
	private _isInternalElement (el: any): el is InternalElement {
		return (el && el.name && !el.vcpid)
	}
	private _isExternalElement (el: any): el is ExternalElement {
		return (el && el.vcpid)
	}
	private async _checkPrepareElement (cmd: ExpectedPlayoutItemContentVizMSEInternal, fromPrepare?: boolean): Promise<string | number> {
		// check if element is prepared
		const elementHash = this.getElementHash(cmd)

		let element = (this._getCachedElement(elementHash) || {}).element
		if (!element) {
			if (!fromPrepare) {
				this.emit('warning', `Late preparation of element "${elementHash}"`)
			} else {
				this.emit('debug', `VizMSE: preparing new "${elementHash}"`)
			}
			element = await this._prepareNewElement(cmd)

			if (!fromPrepare) await this._wait(100) // wait a bit, because taking isn't possible right away anyway at this point
		}
		return this._getElementReference(element)
		// })

	}
	private async _prepareNewElement (cmd: ExpectedPlayoutItemContentVizMSEInternal): Promise<VElement> {
		if (!this._rundown) throw new Error(`Viz Rundown not initialized!`)

		const elementHash = this.getElementHash(cmd)

		try {
			console.log(`Creating an element of type ${typeof cmd.templateName}: ${cmd.templateName}, channel="${cmd.channelName}"`)
			if (_.isNumber(cmd.templateName)) {
				// Prepare a pilot element
				const pilotEl = await this._rundown.createElement(
					cmd.templateName,
					cmd.channelName
				)

				this._cacheElement(elementHash, pilotEl)
				return pilotEl
			} else {
				// Prepare an internal element
				const internalEl = await this._rundown.createElement(
					cmd.templateName,
					cmd.templateInstance,
					cmd.templateData || [],
					cmd.channelName
				)

				this._cacheElement(elementHash, internalEl)
				return internalEl
			}
		} catch (e) {
			if (e.toString().match(/already exist/i)) { // "An internal graphics element with name 'xxxxxxxxxxxxxxx' already exists."
				// If the object already exists, it's not an error, fetch and use the element instead

				const element = await this._rundown.getElement(cmd.templateInstance)

				this._cacheElement(elementHash, element)
				return element
			} else {
				throw e
			}

		}
	}
	private async _updateExpectedPlayoutItems (): Promise<void> {
		if (this.preloadAllElements) {
			this.emit('debug', `VISMSE: _updateExpectedPlayoutItems (${this._expectedPlayoutItems.length})`)

			const hashesAndItems: {[hash: string]: ExpectedPlayoutItemContentVizMSEInternal} = {}

			await Promise.all(
				_.map(this._expectedPlayoutItems, async expectedPlayoutItem => {

					const stateLayer: VizMSEStateLayer | undefined = (
						_.isNumber(expectedPlayoutItem.templateName) ?
						content2StateLayer(
							'',
							{
								deviceType: DeviceType.VIZMSE,
								type: TimelineContentTypeVizMSE.ELEMENT_PILOT,
								templateVcpId: expectedPlayoutItem.templateName
							} as TimelineObjVIZMSEElementPilot['content']
						) :
						content2StateLayer(
							'',
							{
								deviceType: DeviceType.VIZMSE,
								type: TimelineContentTypeVizMSE.ELEMENT_INTERNAL,
								templateName: expectedPlayoutItem.templateName,
								templateData: expectedPlayoutItem.templateData
							} as TimelineObjVIZMSEElementInternal['content']
						)
					)

					if (stateLayer) {
						const item: ExpectedPlayoutItemContentVizMSEInternal = {
							...expectedPlayoutItem,
							templateInstance: VizMSEManager.getTemplateInstance(stateLayer)
						}
						hashesAndItems[this.getElementHash(item)] = item
						await this._checkPrepareElement(item, true)
					}

				})
			)

			this._expectedPlayoutItemsItems = hashesAndItems
		}
	}
	private async updateElementsLoadedStatus (forceReloadAll?: boolean) {
		const elementsToLoad = _.compact(_.map(this._expectedPlayoutItemsItems, (item, hash) => {
			const el = this._getCachedElement(hash)
			if (!item.noAutoPreloading && el) {
				return {
					...el,
					item: item,
					hash: hash
				}
			}
			return undefined
		}))
		if (this._rundown) {
			const rundown = this._rundown

			if (forceReloadAll) {
				this._elementsLoaded = {}
			}
			await Promise.all(
				_.map(elementsToLoad, async (e) => {

					const cachedEl = this._elementsLoaded[e.hash]

					if (!cachedEl || !cachedEl.isLoaded) {

						const elementRef = await this._checkPrepareElement(e.item)

						// Update cached status of the element:
						const newEl = await rundown.getElement(elementRef)

						this._elementsLoaded[e.hash] = {
							element: newEl,
							isLoaded: this._isElementLoaded(newEl),
							isNotLoaded: this._isElementNotLoaded(newEl)
						}
					}
				})
			)

		} else {
			throw Error('VizMSE.v-connection not initialized yet')
		}
	}
	private async _triggerLoadAllElements (): Promise<void> {
		if (!this._rundown) throw Error('VizMSE.v-connection not initialized yet')
		const rundown = this._rundown
		// First, update the loading-status of all elements:
		await this.updateElementsLoadedStatus(true)

		// Then, load all elements that needs loading:
		await Promise.all(
			_.map(this._elementsLoaded, async (e) => {
				if (this._isInternalElement(e.element)) {
					// TODO: what?

				} else if (this._isExternalElement(e.element)) {

					if (e.isLoaded) {
						// The element is loaded fine, no need to do anything
						this.emit('debug', `Element "${this._getElementReference(e.element)}" is loaded`)
					} else if (e.isNotLoaded) {
						// The element has not started loading, load it:
						this.emit('debug', `Element "${this._getElementReference(e.element)}" is not loaded, initializing`)
						await rundown.initialize(this._getElementReference(e.element))

					} else {
						// The element is currently loading, do nothing
						this.emit('debug', `Element "${this._getElementReference(e.element)}" is loading`)
					}
				}
			})
		)
	}
	/** Monitor loading status of expected elements */
	private async _monitorLoadedElements (): Promise<void> {
		try {

			if (
				this._rundown &&
				this._hasActiveRundown &&
				this.preloadAllElements &&
				this._timeSinceLastCommandSent() > SAFE_PRELOAD_TIME
			) {

				await this.updateElementsLoadedStatus(false)

				let notLoaded: number = 0
				let loading: number = 0

				_.each(this._elementsLoaded, (e) => {
					if (!e.isLoaded && e.isNotLoaded) notLoaded++
					else loading++
				})

				this._setLoadedStatus(notLoaded, loading)

			} else this._setLoadedStatus(0, 0)
		} catch (e) {
			this.emit('error', e)
		}

	}
	private _wait (time: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, time))
	}
	/** Execute fcn an retry a couple of times until */
	private async _handleRetry<T> (fcn: () => Promise<T>): Promise<T> {
		let i: number = 0
		const maxNumberOfTries = 5

		while (true) {
			try {
				this._triggerCommandSent()
				const result = fcn()
				this._triggerCommandSent()
				return result
			} catch (e) {
				if (i++ < maxNumberOfTries) {
					if (e && e.toString && e.toString().match(/inexistent/i)) { // "PepTalk inexistent error"
						this.emit('debug', `VizMSE: _handleRetry got "inexistent" error, trying again...`)

						// Wait and try again:
						await this._wait(300)
					} else {
						// Unhandled error, give up:
						throw e
					}
				} else {
					// Give up, we've tried enough times already
					throw e
				}
			}
		}
	}
	private _triggerCommandSent (): void {
		this._lastTimeCommandSent = Date.now()
	}
	private _timeSinceLastCommandSent (): number {
		return Date.now() - this._lastTimeCommandSent
	}
	private _setLoadedStatus (notLoaded: number, loading: number) {
		if (
			notLoaded !== this.notLoadedCount ||
			loading !== this.loadingCount
		) {
			this.notLoadedCount = notLoaded
			this.loadingCount = loading
			this._parentVizMSEDevice.connectionChanged()
		}
	}
	private _isElementLoaded (el: VElement) {
		if (this._isInternalElement(el)) {
			return true // not implemented / unknown

		} else if (this._isExternalElement(el)) {
			return (
				(el.available === '1.00' || el.available === '1') &&
				(el.loaded === '1.00' || el.loaded === '1') &&
				el.is_loading !== 'yes'
			)
		} else {
			throw new Error(`vizMSE: _isLoaded: unknown element type: ${el && JSON.stringify(el)}`)
		}
	}
	private _isElementNotLoaded (el: VElement) {
		if (this._isInternalElement(el)) {
			return false // not implemented / unknown

		} else if (this._isExternalElement(el)) {
			return (
				(el.loaded === '0.00' || el.loaded === '0' || !el.loaded) &&
				el.is_loading !== 'yes'
			)
		} else {
			throw new Error(`vizMSE: _isLoaded: unknown element type: ${el && JSON.stringify(el)}`)
		}
	}
}

interface VizMSEState {
	time: number
	layer: {
		[layerId: string]: VizMSEStateLayer
	}
}
type VizMSEStateLayer = VizMSEStateLayerInternal | VizMSEStateLayerPilot | VizMSEStateLayerContinue | VizMSEStateLayerLoadAllElements
interface VizMSEStateLayerBase {
	timelineObjId: string
	lookahead?: boolean
}
interface VizMSEStateLayerElementBase extends VizMSEStateLayerBase {
	contentType: TimelineContentTypeVizMSE
	continueStep?: number
	cue?: boolean
}
interface VizMSEStateLayerInternal extends VizMSEStateLayerElementBase {
	contentType: TimelineContentTypeVizMSE.ELEMENT_INTERNAL

	templateName: string
	templateData: Array<string>
	channelName?: string
}
interface VizMSEStateLayerPilot extends VizMSEStateLayerElementBase {
	contentType: TimelineContentTypeVizMSE.ELEMENT_PILOT

	templateVcpId: number
	channelName?: string
}
interface VizMSEStateLayerContinue extends VizMSEStateLayerBase {
	contentType: TimelineContentTypeVizMSE.CONTINUE

	direction?: 1 | -1

	reference: string
	referenceContent?: VizMSEStateLayerInternal | VizMSEStateLayerPilot
}
interface VizMSEStateLayerLoadAllElements extends VizMSEStateLayerBase {
	contentType: TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS
}

interface VizMSECommandBase {
	time: number
	type: VizMSECommandType
	timelineObjId: string
	fromLookahead?: boolean
	layerId?: string
}
export enum VizMSECommandType {
	PREPARE_ELEMENT = 'prepare',
	CUE_ELEMENT = 'cue',
	TAKE_ELEMENT = 'take',
	TAKEOUT_ELEMENT = 'out',
	CONTINUE_ELEMENT = 'continue',
	CONTINUE_ELEMENT_REVERSE = 'continuereverse',
	LOAD_ALL_ELEMENTS = 'load_all_elements'
}

interface VizMSECommandElementBase extends VizMSECommandBase, ExpectedPlayoutItemContentVizMSEInternal {
}
interface VizMSECommandPrepare extends VizMSECommandElementBase {
	type: VizMSECommandType.PREPARE_ELEMENT
}
interface VizMSECommandCue extends VizMSECommandElementBase {
	type: VizMSECommandType.CUE_ELEMENT
}
interface VizMSECommandTake extends VizMSECommandElementBase {
	type: VizMSECommandType.TAKE_ELEMENT
}
interface VizMSECommandTakeOut extends VizMSECommandElementBase {
	type: VizMSECommandType.TAKEOUT_ELEMENT
}
interface VizMSECommandContinue extends VizMSECommandElementBase {
	type: VizMSECommandType.CONTINUE_ELEMENT
}
interface VizMSECommandContinueReverse extends VizMSECommandElementBase {
	type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE
}
interface VizMSECommandLoadAllElements extends VizMSECommandBase {
	type: VizMSECommandType.LOAD_ALL_ELEMENTS
}

type VizMSECommand = VizMSECommandPrepare |
	VizMSECommandCue |
	VizMSECommandTake |
	VizMSECommandTakeOut |
	VizMSECommandContinue |
	VizMSECommandContinueReverse |
	VizMSECommandLoadAllElements

interface ExpectedPlayoutItemContentVizMSEInternal extends ExpectedPlayoutItemContentVizMSE {
	/** Name of the instance of the element in MSE, generated by us */
	templateInstance: string
}

interface CachedVElement {
	readonly hash: string
	readonly element: VElement
	hasBeenCued?: boolean
}

function content2StateLayer (
	timelineObjId: string,
	content: (
		TimelineObjVIZMSEElementInternal['content'] |
		TimelineObjVIZMSEElementPilot['content']
	)
): VizMSEStateLayer | undefined {
	if (content.type === TimelineContentTypeVizMSE.ELEMENT_INTERNAL) {

		const o: VizMSEStateLayerInternal = {
			timelineObjId: timelineObjId,
			contentType: TimelineContentTypeVizMSE.ELEMENT_INTERNAL,
			continueStep: content.continueStep,
			cue: content.cue,

			templateName: content.templateName,
			templateData: content.templateData,
			channelName: content.channelName
		}
		return o
	} else if (content.type === TimelineContentTypeVizMSE.ELEMENT_PILOT) {

		const o: VizMSEStateLayerPilot = {
			timelineObjId: timelineObjId,
			contentType: TimelineContentTypeVizMSE.ELEMENT_PILOT,
			continueStep: content.continueStep,
			cue: content.cue,

			templateVcpId: content.templateVcpId,
			channelName: content.channelName

		}
		return o
	}
	return
}
