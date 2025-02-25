import { Mapping } from './mapping'
import { TSRTimelineObjBase, DeviceType } from '.'

export interface MappingAtem extends Mapping {
	device: DeviceType.ATEM
	mappingType: MappingAtemType
	index?: number
}
export enum MappingAtemType {
	MixEffect,
	DownStreamKeyer,
	SuperSourceBox,
	Auxilliary,
	MediaPlayer,
	SuperSourceProperties,
	AudioChannel,
	MacroPlayer,
}

export enum AtemMediaPoolType {
	Still = 'still',
	Clip = 'clip',
	Audio = 'audio',
}

export interface AtemMediaPoolAsset {
	type: AtemMediaPoolType
	position: number
	path: string
}

export interface AtemOptions {
	host: string
	port?: number
	mediaPoolAssets?: AtemMediaPoolAsset[]
}

export enum TimelineContentTypeAtem { //  Atem-state
	ME = 'me',
	DSK = 'dsk',
	AUX = 'aux',
	SSRC = 'ssrc',
	SSRCPROPS = 'ssrcProps',
	MEDIAPLAYER = 'mp',
	AUDIOCHANNEL = 'audioChan',
	MACROPLAYER = 'macroPlayer',
}

export enum AtemTransitionStyle { // Note: copied from atem-state
	MIX,
	DIP,
	WIPE,
	DVE,
	STING,
	CUT,
	DUMMY,
}
export enum MediaSourceType { // Note: copied from atem-state
	Still = 1,
	Clip = 2,
}

export type SuperSourceBox = {
	enabled?: boolean
	source?: number
	/** -4800 - 4800 */
	x?: number
	/** -2700 - 2700 */
	y?: number
	/** 70 - 1000 */
	size?: number
	cropped?: boolean
	/** 0 - 18000 */
	cropTop?: number
	/** 0 - 18000 */
	cropBottom?: number
	/** 0 - 32000 */
	cropLeft?: number
	/** 0 - 32000 */
	cropRight?: number
}

export interface AtemTransitionSettings {
	// DVE
	mix?: {
		rate: number
	}
	dip?: {
		rate: number
		input: number
	}
	// stinger
	wipe?: {
		/** 1 - 250 frames */
		rate?: number
		/** 0 - 17 */
		pattern?: number
		/** 0 - 10000 */
		borderWidth?: number
		borderInput?: number
		/** 0 - 10000 */
		symmetry?: number
		/** 0 - 10000 */
		borderSoftness?: number
		/** 0 - 10000 */
		xPosition?: number
		/** 0 - 10000 */
		yPosition?: number
		reverseDirection?: boolean
		flipFlop?: boolean
	}
}
export type TimelineObjAtemAny =
	| TimelineObjAtemME
	| TimelineObjAtemDSK
	| TimelineObjAtemAUX
	| TimelineObjAtemSsrc
	| TimelineObjAtemSsrcProps
	| TimelineObjAtemMacroPlayer
	| TimelineObjAtemAudioChannel
	| TimelineObjAtemMediaPlayer
export interface TimelineObjAtemBase extends TSRTimelineObjBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem
	}
}

// as described in this issue: https://github.com/Microsoft/TypeScript/issues/14094
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
// eslint-disable-next-line @typescript-eslint/ban-types
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U

export interface TimelineObjAtemME extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.ME
		me: XOR<
			{
				input: number
				transition: AtemTransitionStyle
			},
			{
				/** Cut directly to program */
				programInput?: number
				/**
				 * Set preview input.
				 * Cannot be used in conjunction with `input`;
				 * `programInput` must be used instead if control of program and preview are both needed.
				 */
				previewInput?: number
			}
		> & {
			/** Is ME in transition state */
			inTransition?: boolean
			/** Should preview transition */
			transitionPreview?: boolean
			/** Position of T-bar */
			transitionPosition?: number
			// transitionFramesLeft?: number;
			// fadeToBlack?: boolean;
			// numberOfKeyers?: number;
			// transitionProperties?: AtemTransitionProperties;

			/** Settings for mix rate, wipe style */
			transitionSettings?: AtemTransitionSettings

			upstreamKeyers?: {
				readonly upstreamKeyerId: number
				onAir?: boolean
				/** 0: Luma, 1: Chroma, 2: Pattern, 3: DVE */
				mixEffectKeyType?: number
				/** Use flying key */
				flyEnabled?: boolean
				/** Fill */
				fillSource?: number
				/** Key */
				cutSource?: number
				/** Mask keyer */
				maskEnabled?: boolean
				/** -9000 -> 9000 */
				maskTop?: number
				/** -9000 -> 9000 */
				maskBottom?: number
				/** -16000 -> 16000 */
				maskLeft?: number
				/** -16000 -> 16000 */
				maskRight?: number

				// dveSettings: UpstreamKeyerDVESettings;
				// chromaSettings: UpstreamKeyerChromaSettings;
				// patternSettings: UpstreamKeyerPatternSettings;
				// flyKeyframes: Array<UpstreamKeyerFlyKeyframe>;
				// flyProperties: UpstreamKeyerFlySettings;
				lumaSettings?: {
					/** Premultiply key */
					preMultiplied?: boolean
					/** 0-1000 */
					clip?: number
					/** 0-1000 */
					gain?: number
					/** Invert key */
					invert?: boolean
				}
			}[]
		}
	}
}
export interface TimelineObjAtemDSK extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.DSK
		dsk: {
			onAir: boolean
			sources?: {
				/** Fill */
				fillSource: number
				/** Key */
				cutSource: number
			}
			properties?: {
				/** On at next transition */
				tie?: boolean
				/** 1 - 250 frames */
				rate?: number
				/** Premultiply key */
				preMultiply?: boolean
				/** 0 - 1000 */
				clip?: number
				/** 0 - 1000 */
				gain?: number
				/** Invert key */
				invert?: boolean
				mask?: {
					enabled: boolean
					/** -9000 -> 9000 */
					top?: number
					/** -9000 -> 9000 */
					bottom?: number
					/** -16000 -> 16000 */
					left?: number
					/** -16000 -> 16000 */
					right?: number
				}
			}
		}
	}
}
export interface TimelineObjAtemAUX extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.AUX
		aux: {
			input: number
		}
	}
}
export interface TimelineObjAtemSsrc extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.SSRC
		ssrc: {
			boxes: Array<SuperSourceBox>
		}
	}
}

interface AtemSSrcPropsBase {
	/** Fill source */
	artFillSource: number
	/** Key source */
	artCutSource: number
	/** 0: Art Source in background, 1: Art Source in foreground */
	artOption: number
}

interface AtemSSrcPropsPreMultiplied extends AtemSSrcPropsBase {
	/** Premultiply key for Art Source */
	artPreMultiplied: true
}

interface AtemSSrcPropsStraight extends AtemSSrcPropsBase {
	/** Premultiply key for Art Source */
	artPreMultiplied: false
	/** Linear keyer Clip value for Art Source, 0-1000 */
	artClip: number
	/** Linear keyer Gain value for Art Source, 0-1000  */
	artGain: number
	/** Invert keyer Key input */
	artInvertKey: boolean
}

interface AtemSSrcPropsNoBorder {
	/** Enable borders on boxes */
	borderEnabled?: false
}

interface AtemSSrcPropsBorder {
	/** Enable borders on boxes */
	borderEnabled?: true
	/** Border Bevel mode:
	 *  0: no bevel, 1: in/out, 2: in, 3: out
	 */
	borderBevel: number
	/** Width of the outer side of the bevel, 0-1600 */
	borderOuterWidth: number
	/** Width of the inner side of the bevel, 0-1600 */
	borderInnerWidth: number
	/** Softness of the outer side of the bevel, 0-100 */
	borderOuterSoftness: number
	/** Softness of the inner side of the bevel, 0-100 */
	borderInnerSoftness: number
	/** Softness of the bevel, 0-100 */
	borderBevelSoftness: number
	/** Position of the bevel, 0-100 */
	borderBevelPosition: number
	/** Hue of the border color, 0-3599 */
	borderHue: number
	/** Saturation of the border color, 0-1000 */
	borderSaturation: number
	/** Luminance of the border color, 0-1000 */
	borderLuma: number
	/** Light source direction for rendering the bevel, 0-3590 */
	borderLightSourceDirection: number
	/** Light source altitude for rendering the bevel, 10-100 */
	borderLightSourceAltitude: number
}

export interface TimelineObjAtemSsrcProps extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.SSRCPROPS
		ssrcProps: (AtemSSrcPropsPreMultiplied | AtemSSrcPropsStraight) & (AtemSSrcPropsNoBorder | AtemSSrcPropsBorder)
	}
}

export interface TimelineObjAtemMediaPlayer extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.MEDIAPLAYER

		mediaPlayer: {
			sourceType: MediaSourceType
			clipIndex: number
			stillIndex: number

			// TODO - these need wrapping up to something that makes more sense for a timeline
			playing: boolean
			loop: boolean
			atBeginning: boolean
			clipFrame: number
		}
	}
}
export interface TimelineObjAtemAudioChannel extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.AUDIOCHANNEL
		audioChannel: {
			/** 0 - 65381 */
			gain?: number
			/** -10000 - 10000 */
			balance?: number
			/** 0: Off, 1: On, 2: AFV */
			mixOption?: number
		}
	}
}
export interface TimelineObjAtemMacroPlayer extends TimelineObjAtemBase {
	content: {
		deviceType: DeviceType.ATEM
		type: TimelineContentTypeAtem.MACROPLAYER
		macroPlayer: {
			macroIndex: number
			isRunning: boolean
			loop?: boolean
		}
	}
}
