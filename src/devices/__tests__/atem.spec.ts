import { Enums, MixEffect } from 'atem-state'
import { ResolvedTimelineObjectInstance } from 'superfly-timeline'
import { Conductor } from '../../conductor'
import { AtemDevice, DeviceOptionsAtemInternal } from '../atem'
import { MockTime } from '../../__tests__/mockTime'
import {
	Mappings,
	DeviceType ,
	MappingAtem,
	MappingAtemType,
	TimelineContentTypeAtem,
	AtemOptions,
	AtemTransitionStyle
} from '../../types/src'
import { ThreadedClass } from 'threadedclass'
import { TimelineState } from '../../types/src/superfly-timeline'
import { literal } from '../device'

describe('Atem', () => {
	let mockTime = new MockTime()
	beforeAll(() => {
		mockTime.mockDateNow()
	})
	beforeEach(() => {
		mockTime.init()
	})

	test('Atem: Ensure clean initial state', async () => {
		const commandReceiver0: any = jest.fn(() => {
			return Promise.resolve()
		})
		const mockState: TimelineState = {
			time: mockTime.now + 50,
			layers: {},
			nextEvents: []
		}

		let device = new AtemDevice('mock', literal<DeviceOptionsAtemInternal>({
			type: DeviceType.ATEM,
			options: {
				commandReceiver: commandReceiver0,
				host: '127.0.0.1'
			}
		}), {
			getCurrentTime: mockTime.getCurrentTime
		})

		await device.init(literal<AtemOptions>({
			host: '127.0.0.1'
		}))

		device.handleState(mockState)
		expect(device.queue).toHaveLength(0)
	})

	test('Atem: switch input', async () => {

		const commandReceiver0: any = jest.fn(() => {
			return Promise.resolve()
		})
		let myLayerMapping0: MappingAtem = {
			device: DeviceType.ATEM,
			deviceId: 'myAtem',
			mappingType: MappingAtemType.MixEffect,
			index: 0
		}
		let myLayerMapping: Mappings = {
			'myLayer0': myLayerMapping0
		}

		let myConductor = new Conductor({
			initializeAsClear: true,
			getCurrentTime: mockTime.getCurrentTime
		})
		await myConductor.init()
		await myConductor.addDevice('myAtem', literal<DeviceOptionsAtemInternal>({
			type: DeviceType.ATEM,
			options: {
				commandReceiver: commandReceiver0,
				host: '127.0.0.1',
				port: 9910
			}
		}))
		await myConductor.setMapping(myLayerMapping)
		await mockTime.advanceTimeToTicks(10100)

		let deviceContainer = myConductor.getDevice('myAtem')
		let device = deviceContainer.device as ThreadedClass<AtemDevice>

		// Check that no commands has been scheduled:
		expect(await device.queue).toHaveLength(0)

		myConductor.timeline = [
			{
				id: 'obj0',
				enable: {
					start: mockTime.now - 1000, // 1 seconds ago
					duration: 2000
				},
				layer: 'myLayer0',
				content: {
					deviceType: DeviceType.ATEM,
					type: TimelineContentTypeAtem.ME,
					me: {
						input: 2,
						transition: AtemTransitionStyle.CUT
					}
				}
			},
			{
				id: 'obj1',
				enable: {
					start: '#obj0.end',
					duration: 2000
				},
				layer: 'myLayer0',
				content: {
					deviceType: DeviceType.ATEM,
					type: TimelineContentTypeAtem.ME,
					me: {
						input: 3,
						transition: AtemTransitionStyle.CUT
					}
				}
			}
		]

		commandReceiver0.mockClear()
		await mockTime.advanceTimeToTicks(10200)
		expect(commandReceiver0).toHaveBeenCalledTimes(2)
		expect(commandReceiver0).toBeCalledWith(expect.anything(), expect.objectContaining(
			{
				flag: 0,
				rawName: 'CPvI',
				mixEffect: 0,
				properties: {
					source: 2
				}
			}
		), null, expect.stringContaining(''))
		expect(commandReceiver0).toBeCalledWith(expect.anything(), expect.objectContaining(
			{
				flag: 0,
				rawName: 'DCut',
				mixEffect: 0
			}
		), null, expect.stringContaining(''))

		commandReceiver0.mockClear()
		await mockTime.advanceTimeToTicks(12200)

		expect(commandReceiver0).toHaveBeenCalledTimes(2)
		expect(commandReceiver0).toBeCalledWith(expect.anything(), expect.objectContaining(
			{
				flag: 0,
				rawName: 'CPvI',
				mixEffect: 0,
				properties: {
					source: 3
				}
			}
		), null, expect.stringContaining(''))
		expect(commandReceiver0).toBeCalledWith(expect.anything(), expect.objectContaining(
			{
				flag: 0,
				rawName: 'DCut',
				mixEffect: 0
			}
		), null, expect.stringContaining(''))
	})

	test('Atem: upstream keyer', async () => {

		const commandReceiver0: any = jest.fn(() => {
			// nothing
		})
		let myLayerMapping0: MappingAtem = {
			device: DeviceType.ATEM,
			deviceId: 'myAtem',
			mappingType: MappingAtemType.MixEffect,
			index: 0
		}
		let myLayerMapping: Mappings = {
			'myLayer0': myLayerMapping0
		}

		let myConductor = new Conductor({
			initializeAsClear: true,
			getCurrentTime: mockTime.getCurrentTime
		})
		await myConductor.init()
		await myConductor.addDevice('myAtem', literal<DeviceOptionsAtemInternal>({
			type: DeviceType.ATEM,
			options: {
				commandReceiver: commandReceiver0,
				host: '127.0.0.1',
				port: 9910
			}
		}))

		await myConductor.setMapping(myLayerMapping)
		await mockTime.advanceTimeToTicks(10100)

		let deviceContainer = myConductor.getDevice('myAtem')
		let device = deviceContainer.device as ThreadedClass<AtemDevice>
		// Check that no commands has been scheduled:
		expect(await device.queue).toHaveLength(0)
		myConductor.timeline = [
			{
				id: 'obj0',
				enable: {
					start: mockTime.now - 1000, // 1 seconds ago
					duration: 2000
				},
				layer: 'myLayer0',
				content: {
					deviceType: DeviceType.ATEM,
					type: TimelineContentTypeAtem.ME,
					me: {
						upstreamKeyers: [
							{
								upstreamKeyerId: 0,

								lumaSettings: {
									preMultiplied: false,
									clip: 300,
									gain: 2,
									invert: true
								}
							}
						]
					}
				}
			}
		]

		await mockTime.advanceTimeToTicks(10200)

		expect(commandReceiver0).toHaveBeenCalledTimes(1)
		expect(commandReceiver0).toBeCalledWith(expect.anything(), expect.objectContaining(
			{
				flag: 14,
				rawName: 'CKLm',
				mixEffect: 0,
				upstreamKeyerId: 0,
				properties: {
					clip: 300,
					gain: 2,
					invert: true
				}
			}
		), null, expect.stringContaining('')) // obj0
	})

	test('Atem: handle same state', async () => {

		const commandReceiver0 = jest.fn(() => {
			return Promise.resolve()
		})
		const myLayerMapping: Mappings = {
			'myLayer0': literal<MappingAtem>({
				device: DeviceType.ATEM,
				deviceId: 'myAtem',
				mappingType: MappingAtemType.MixEffect,
				index: 0
			})
		}

		const resolvedObj: ResolvedTimelineObjectInstance = {
			id: 'obj0',
			enable: {
				start: mockTime.now - 1000, // 1 seconds ago
				duration: 0
			},
			layer: 'myLayer0',
			content: {
				type: TimelineContentTypeAtem.ME,
				me: {
					input: 4,
					transition: Enums.TransitionStyle.CUT
				}
			},
			resolved: {
				resolved: true,
				resolving: false,
				instances: [{ start: mockTime.now - 1000, end: Infinity, id: 'a0', references: [] }]
			},
			instance: { start: mockTime.now - 1000, end: Infinity, id: 'a0', references: [] }
		}
		const mockState: TimelineState = {
			time: mockTime.now + 50,
			layers: {
				'myLayer0': resolvedObj
			},
			nextEvents: []
		}

		let device = new AtemDevice('mock', {
			type: DeviceType.ATEM,
			options: {
				commandReceiver: commandReceiver0,
				host: '127.0.0.1'
			}
		}, {
			getCurrentTime: mockTime.getCurrentTime
		})
		device.setMapping(myLayerMapping)

		await device.init(literal<AtemOptions>({
			host: '127.0.0.1'
		}))

		// Check that no commands has been scheduled
		expect(device.queue).toHaveLength(0)
		expect(commandReceiver0).toHaveBeenCalledTimes(0)

		// Expect that a command has been scheduled
		device.handleState(mockState)
		expect(device.queue).toHaveLength(2)

		// Handle the same state, before the commands have been sent
		mockTime.advanceTimeTo(mockTime.now + 30)
		device.handleState(mockState)
		expect(commandReceiver0).toHaveBeenCalledTimes(0)
		expect(device.queue).toHaveLength(2)

		// Send the commands
		mockTime.advanceTimeTo(mockTime.now + 30)
		expect(commandReceiver0).toHaveBeenCalledTimes(2)

		// Handle the same state, after the commands have been sent
		device.handleState(mockState)
		expect(device.queue).toHaveLength(0)
	})
})
