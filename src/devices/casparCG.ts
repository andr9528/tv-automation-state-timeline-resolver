import * as _ from "underscore"
import {Device, DeviceCommand, DeviceCommandContainer} from "./device"

import { CasparCG, Command as CommandNS, AMCPUtil } from "casparcg-connection"
import { Mapping } from '../conductor';
import { TimelineState } from 'superfly-timeline';
import { CasparCG as StateNS, CasparCGState } from "casparcg-state";


/*
	This is a wrapper for a CasparCG device. All commands will be sent through this
*/
export class CasparCGDevice extends Device {

	private _ccg:CasparCG;
	private _state:TimelineState;
	private _ccgState:CasparCGState;
	private _queue:Array<any>;

	constructor(deviceId:string, mapping:Mapping, options) {
		super(deviceId, mapping);

		this._ccgState = new CasparCGState({externalLog: console.log});
		this._ccgState.initStateFromChannelInfo([{ // @todo: these should be implemented from osc info
			channelNo: 1,
			videMode: 'PAL',
			fps: 50
		}, {
			channelNo: 2,
			videoMode: 'PAL',
			fps: 50
		}])

		setInterval(() => {this.checkCommandBus()}, 20);
	}

	/**
	 * Initiates the connection with CasparCG through the ccg-connection lib.
	 */
	init():Promise<boolean> {

		return new Promise((resolve/*, reject*/) => {

			

			this._ccg = new CasparCG({
				// TODO: add options
			})

			
			this._ccg.onConnected = () => {
				resolve(true);

				//this._ccg.do('test')
			};


			// TODO:


		});
	}

	/**
	 * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
	 * @param newState The state to target.
	 * @param oldState The "current" state of the device. If omitted, will use the actual current state.
	 */
	generateCommandsAgainstState(newState:TimelineState, oldState?:TimelineState):Array<DeviceCommand> {
		let newCasparState = this.casparStateFromTimelineState(newState);
		let oldCasparState;

		if (oldState) 
			oldCasparState = this.casparStateFromTimelineState(oldState);
		else
			oldCasparState = this._ccgState.getState();

		let commandsToAchieveState:Array<{
			cmds: Array<CommandNS.IAMCPCommandVO>;
			additionalLayerState?: StateNS.Layer;
		}> = this._ccgState.diffStates(oldCasparState || new StateNS.CasparCG(), newCasparState);

		let returnCommands = {
			time: newState.time, 
			deviceId: this.deviceId, 
			commands: []
		};
		_.each(commandsToAchieveState, (command) => {
			// returnCommands.push({ 
			// 	time: newState.time, 
			// 	deviceId: this.deviceId, 
			// 	commands: commandsToAchieveState
			// });
			_.each(command.cmds, (cmd) => {
				returnCommands.commands.push(cmd);
			})
		})

		return returnCommands;
	}

	/**
	 * A receiver for generated commands.
	 * @param commandContainer A container that carries the commands.
	 */
	handleCommands(commandContainer:DeviceCommandContainer) {
		if (commandContainer.deviceId == this.deviceId) {
			this._queue = commandContainer.commands;
			this.checkCommandBus();
		}
	}

	/**
	 * Takes a timeline state and returns a CasparCG State that will work with the state lib.
	 * @param timelineState The timeline state to generate from.
	 */
	private casparStateFromTimelineState(timelineState: TimelineState):StateNS.CasparCG {

		const caspar = new StateNS.CasparCG();
		
		_.each(timelineState.LLayers, (layer, layerName) => {
			const mapping:Mapping = this._mapping[layerName];

			if (!mapping)
				return; // we got passed a LLayer that doesn't belong to this device.
			
			const channel = new StateNS.Channel();
			channel.channelNo = Number(mapping.channel) || 1;
			// @todo: check if we need fps as well.
			caspar.channels[channel.channelNo] = channel;

			let stateLayer:StateNS.IBaseLayer;

			switch (layer.content.type) {
				case 'video' :
					stateLayer = {
						content: StateNS.LayerContentType.MEDIA,
						media: layer.content.attributes.file,
						playTime: layer.resolved.startTime,
						playing: true,
				
						looping: layer.content.attributes.loop,
						seek: layer.content.attributes.seek
					}
					break;
				case 'ip' :
					stateLayer = {
						content: StateNS.LayerContentType.MEDIA,
						media: layer.content.attributes.uri,
						playTime: layer.resolved.startTime,
						playing: true
					}
					break;
				case 'input' :
					stateLayer = {
						content: StateNS.LayerContentType.INPUT,
						media: 'decklink',
						input: {
							device: layer.content.attributes.device
						},
						playing: true

					}
					break;
			}
			

			// const stateLayer = new StateNS.Layer();
			// stateLayer.layerNo = Number(mapping.layer) || 0;

			// switch (layer.content.type) {
			// 	case 'video' :
			// 		stateLayer.content = 'media';
			// 		stateLayer.media = layer.content.attributes.file;
			// 		stateLayer.looping = layer.content.attributes.loop === true;
			// 		stateLayer.seek = layer.content.attributes.seek;

			// 		stateLayer.playing = true;
			// 		stateLayer.playTime = layer.resolved.startTime;
			// 		// @todo: implement pauses (when are things paused?)
			// 		// @todo: implement vf / af. depends on ccg-connection.
			// 		break;
			// 	case 'ip' :
			// 		stateLayer.content = 'media';
			// 		stateLayer.media = layer.content.attributes.uri;

			// 		stateLayer.playing = true;
			// 		stateLayer.playTime = layer.resolved.startTime;
			// 		break;
			// 	case 'input' :
			// 		stateLayer.content = 'input';

			// 		stateLayer.input = {
			// 			device: layer.content.attributes.device,
			// 			format: layer.content.attributes.format
			// 			// @todo: vf/af in state and in ccg-con
			// 		};

			// 		stateLayer.playing = true;
			// 		stateLayer.playTime = layer.resolved.startTime;
			// 		// @todo: implement pauses (when are things paused?)
			// 		break;
			// }

			channel.layers[mapping.layer] = stateLayer;
		})

		return caspar;

	}

	/**
	 * This checks the _queue to see if any commands should be sent to CasparCG.
	 * @todo: replace with timecode scheduled commands.
	 */
	private checkCommandBus() {
		if (this._queue) {
			while (this._queue.length > 0 && this._queue[0].time < Date.now()/1000+.02) {
				let commandContainer = this._queue[0];
				this._queue.splice(0, 1);
				
				_.each(commandContainer.commands, (commandObj) => {
					let command = AMCPUtil.deSerialize(commandObj, 'id');
					this._ccg.do(command);
		
					this._ccgState.applyCommands([ { cmd: commandObj } ]);
				})
			}
		}
	}
}