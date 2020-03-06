import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
export interface MappingCasparCG extends Mapping {
    device: DeviceType.CASPARCG;
    channel: number;
    layer: number;
    previewWhenNotOnAir?: boolean;
}
export interface CasparCGOptions {
    /** Host of CasparCG server */
    host: string;
    /** Port of CasparCG Server */
    port?: number;
    /** whether to use the CasparCG-SCHEDULE command to run future commands, or the internal (backwards-compatible) command queue */
    useScheduling?: boolean;
    retryInterval?: number | boolean;
    timeBase?: {
        [channel: string]: number;
    } | number;
    launcherHost?: string;
    launcherPort?: number;
}
export declare enum TimelineContentTypeCasparCg {
    MEDIA = "media",
    IP = "ip",
    INPUT = "input",
    TEMPLATE = "template",
    HTMLPAGE = "htmlpage",
    ROUTE = "route",
    RECORD = "record"
}
export declare type TimelineTransition = TimelineTransitionBase & (RegularTimelineTransition | TimelineStingTransition);
export interface TimelineTransitionBase {
    type: Transition;
}
export interface RegularTimelineTransition extends TimelineTransitionBase {
    type: Exclude<Transition, Transition.STING>;
    duration?: number;
    easing?: Ease;
    direction?: Direction;
}
export interface TimelineStingTransition extends TimelineTransitionBase {
    type: Transition.STING;
    maskFile: string;
    delay?: number;
    overlayFile?: string;
    audioFadeStart?: number;
    audioFadeDuration?: number;
}
export interface TimelineObjCCGProducerContentBase {
    /** The type of CasparCG content  */
    type: TimelineContentTypeCasparCg;
    transitions?: {
        inTransition?: TimelineTransition;
        outTransition?: TimelineTransition;
    };
    mixer?: Mixer;
}
export declare type TimelineObjCasparCGAny = (TimelineObjCCGMedia | TimelineObjCCGIP | TimelineObjCCGInput | TimelineObjCCGHTMLPage | TimelineObjCCGRecord | TimelineObjCCGRoute | TimelineObjCCGTemplate);
export interface TimelineObjCasparCGBase extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg;
    };
}
export interface TimelineObjCCGMedia extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.MEDIA;
        /** Path to the file to be played (example: 'AMB') */
        file: string;
        /** Whether the media file should be looping or not */
        loop?: boolean;
        /** The point where the file starts playing [milliseconds from start of file] */
        seek?: number;
        /** The point where the file returns to, when looping [milliseconds from start of file] */
        inPoint?: number;
        /** The duration of the file. The playout will either freeze or loop after this time.
         * Note that for seeking to work when looping, .length has to be provided. [milliseconds]
         */
        length?: number;
        /** Audio channel layout (example 'stereo') */
        channelLayout?: string;
        /** When pausing, the unix-time the playout was paused. */
        pauseTime?: number;
        /** If the video is playing or is paused (defaults to true) */
        playing?: boolean;
        /** If true, the startTime won't be used to SEEK to the correct place in the media */
        noStarttime?: boolean;
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGIP extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.IP;
        /** The URI to the input stream */
        uri: string;
        /** Audio channel layout (example 'stereo') */
        channelLayout?: string;
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGInput extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.INPUT;
        /** The type of input (example: 'decklink') */
        inputType: string;
        /** The inoput device index (to check in CASPARCG, run INFO SYSTEM) */
        device: number;
        /** The input format (example: '1080i5000') */
        deviceFormat: ChannelFormat;
        /** Audio channel layout (example 'stereo') */
        channelLayout?: string;
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGHTMLPage extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.HTMLPAGE;
        /** The URL to load */
        url: string;
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGTemplate extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.TEMPLATE;
        /** The type of template to load ('html' or 'flash') */
        templateType?: 'html' | 'flash';
        /** The name/path of the template */
        name: string;
        /** The data to send into the template. Fee to be whatever, as long as the template likes it */
        data?: any;
        /** Whether to use CG stop or CLEAR layer when stopping the template. Defaults to false = CLEAR  */
        useStopCommand: boolean;
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGRoute extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.ROUTE;
        /** The CasparCG-channel to route from */
        channel?: number;
        /** The CasparCG-layer to route from */
        layer?: number;
        /** Uses the mappings to determine what layer to route (overrides channel/layer parameters) */
        mappedLayer?: string;
        /** Type of routing ('BACKGROUND' | 'NEXT') */
        mode?: 'BACKGROUND' | 'NEXT';
        /** Audio channel layout (example 'stereo') */
        channelLayout?: string;
        /** The amount of milliseconds to delay the signal on this route. This value is downsampled to channel frames upon execution. */
        delay?: number;
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGRecord extends TimelineObjCasparCGBase {
    content: {
        deviceType: DeviceType.CASPARCG;
        type: TimelineContentTypeCasparCg.RECORD;
        /** The filename to output to (will be in the media folder) */
        file?: string;
        /** ffmpeg encoder options (example '-vcodec libx264 -preset ultrafast') */
        encoderOptions: string;
    };
}
export declare enum Transition {
    MIX = "MIX",
    CUT = "CUT",
    PUSH = "PUSH",
    WIPE = "WIPE",
    SLIDE = "SLIDE",
    STING = "STING"
}
export declare enum Ease {
    LINEAR = "LINEAR",
    NONE = "NONE",
    EASEINBACK = "EASEINBACK",
    EASEINBOUNCE = "EASEINBOUNCE",
    EASEINCIRC = "EASEINCIRC",
    EASEINCUBIC = "EASEINCUBIC",
    EASEINELASTIC = "EASEINELASTIC",
    EASEINEXPO = "EASEINEXPO",
    EASEINOUTBACK = "EASEINOUTBACK",
    EASEINOUTBOUNCE = "EASEINOUTBOUNCE",
    EASEINOUTCIRC = "EASEINOUTCIRC",
    EASEINOUTCUBIC = "EASEINOUTCUBIC",
    EASEINOUTELASTIC = "EASEINOUTELASTIC",
    EASEINOUTEXPO = "EASEINOUTEXPO",
    EASEINOUTQUAD = "EASEINOUTQUAD",
    EASEINOUTQUART = "EASEINOUTQUART",
    EASEINOUTQUINT = "EASEINOUTQUINT",
    EASEINOUTSINE = "EASEINOUTSINE",
    EASEINQUAD = "EASEINQUAD",
    EASEINQUART = "EASEINQUART",
    EASEINQUINT = "EASEINQUINT",
    EASEINSINE = "EASEINSINE",
    EASELINEAR = "EASELINEAR",
    EASENONE = "EASENONE",
    EASEOUTBACK = "EASEOUTBACK",
    EASEOUTBOUNCE = "EASEOUTBOUNCE",
    EASEOUTCIRC = "EASEOUTCIRC",
    EASEOUTCUBIC = "EASEOUTCUBIC",
    EASEOUTELASTIC = "EASEOUTELASTIC",
    EASEOUTEXPO = "EASEOUTEXPO",
    EASEOUTINBACK = "EASEOUTINBACK",
    EASEOUTINBOUNCE = "EASEOUTINBOUNCE",
    EASEOUTINCIRC = "EASEOUTINCIRC",
    EASEOUTINCUBIC = "EASEOUTINCUBIC",
    EASEOUTINELASTIC = "EASEOUTINELASTIC",
    EASEOUTINEXPO = "EASEOUTINEXPO",
    EASEOUTINQUAD = "EASEOUTINQUAD",
    EASEOUTINQUART = "EASEOUTINQUART",
    EASEOUTINQUINT = "EASEOUTINQUINT",
    EASEOUTINSINE = "EASEOUTINSINE",
    EASEOUTQUAD = "EASEOUTQUAD",
    EASEOUTQUART = "EASEOUTQUART",
    EASEOUTQUINT = "EASEOUTQUINT",
    EASEOUTSINE = "EASEOUTSINE",
    IN_BACK = "IN_BACK",
    IN_BOUNCE = "IN_BOUNCE",
    IN_CIRC = "IN_CIRC",
    IN_CUBIC = "IN_CUBIC",
    IN_ELASTIC = "IN_ELASTIC",
    IN_EXPO = "IN_EXPO",
    IN_OUT_BACK = "IN_OUT_BACK",
    IN_OUT_BOUNCE = "IN_OUT_BOUNCE",
    IN_OUT_CIRC = "IN_OUT_CIRC",
    IN_OUT_CUBIC = "IN_OUT_CUBIC",
    IN_OUT_ELASTIC = "IN_OUT_ELASTIC",
    IN_OUT_EXPO = "IN_OUT_EXPO",
    IN_OUT_QUAD = "IN_OUT_QUAD",
    IN_OUT_QUART = "IN_OUT_QUART",
    IN_OUT_QUINT = "IN_OUT_QUINT",
    IN_OUT_SINE = "IN_OUT_SINE",
    IN_QUAD = "IN_QUAD",
    IN_QUART = "IN_QUART",
    IN_QUINT = "IN_QUINT",
    IN_SINE = "IN_SINE",
    OUT_BACK = "OUT_BACK",
    OUT_BOUNCE = "OUT_BOUNCE",
    OUT_CIRC = "OUT_CIRC",
    OUT_CUBIC = "OUT_CUBIC",
    OUT_ELASTIC = "OUT_ELASTIC",
    OUT_EXPO = "OUT_EXPO",
    OUT_IN_BACK = "OUT_IN_BACK",
    OUT_IN_BOUNCE = "OUT_IN_BOUNCE",
    OUT_IN_CIRC = "OUT_IN_CIRC",
    OUT_IN_CUBIC = "OUT_IN_CUBIC",
    OUT_IN_ELASTIC = "OUT_IN_ELASTIC",
    OUT_IN_EXPO = "OUT_IN_EXPO",
    OUT_IN_QUAD = "OUT_IN_QUAD",
    OUT_IN_QUART = "OUT_IN_QUART",
    OUT_IN_QUINT = "OUT_IN_QUINT",
    OUT_IN_SINE = "OUT_IN_SINE",
    OUT_QUAD = "OUT_QUAD",
    OUT_QUART = "OUT_QUART",
    OUT_QUINT = "OUT_QUINT"
}
export declare enum Direction {
    LEFT = "LEFT",
    RIGHT = "RIGHT"
}
export declare enum BlendMode {
    ADD = "ADD",
    AVERAGE = "AVERAGE",
    COLOR = "COLOR",
    COLOR_BURN = "COLOR_BURN",
    COLOR_DODGE = "COLOR_DODGE",
    CONTRAST = "CONTRAST",
    DARKEN = "DARKEN",
    DIFFERENCE = "DIFFERENCE",
    EXCLUSION = "EXCLUSION",
    GLOW = "GLOW",
    HARD_LIGHT = "HARD_LIGHT",
    HARD_MIX = "HARD_MIX",
    LIGHTEN = "LIGHTEN",
    LINEAR_BURN = "LINEAR_BURN",
    LINEAR_DODGE = "LINEAR_DODGE",
    LINEAR_LIGHT = "LINEAR_LIGHT",
    LUMINOSITY = "LUMINOSITY",
    MULTIPLY = "MULTIPLY",
    NEGATION = "NEGATION",
    NORMAL = "NORMAL",
    OVERLAY = "OVERLAY",
    PHOENIX = "PHOENIX",
    PIN_LIGHT = "PIN_LIGHT",
    REFLECT = "REFLECT",
    SATURATION = "SATURATION",
    SCREEN = "SCREEN",
    SOFT_LIGHT = "SOFT_LIGHT",
    SUBTRACT = "SUBTRACT",
    VIVID_LIGHT = "VIVID_LIGHT"
}
export declare enum ChannelFormat {
    PAL = "PAL",
    NTSC = "NTSC",
    SD_576P2500 = "SD_576P2500",
    HD_720P2398 = "HD_720P2398",
    HD_720P2400 = "HD_720P2400",
    HD_720P2500 = "HD_720P2500",
    HD_720P2997 = "HD_720P2997",
    HD_720P3000 = "HD_720P3000",
    HD_720P5000 = "HD_720P5000",
    HD_720P5994 = "HD_720P5994",
    HD_720P6000 = "HD_720P6000",
    HD_1080I5000 = "HD_1080I5000",
    HD_1080I5994 = "HD_1080I5994",
    HD_1080I6000 = "HD_1080I6000",
    HD_1080P2398 = "HD_1080P2398",
    HD_1080P2400 = "HD_1080P2400",
    HD_1080P2500 = "HD_1080P2500",
    HD_1080P2997 = "HD_1080P2997",
    HD_1080P3000 = "HD_1080P3000",
    HD_1080P5000 = "HD_1080P5000",
    HD_1080P5994 = "HD_1080P5994",
    HD_1080P6000 = "HD_1080P6000",
    DCI_1080P2398 = "DCI_1080P2398",
    DCI_1080P2400 = "DCI_1080P2400",
    DCI_1080P2500 = "DCI_1080P2500",
    DCI_2160P2398 = "DCI_2160P2398",
    DCI_2160P2400 = "DCI_2160P2400",
    DCI_2160P2500 = "DCI_2160P2500",
    UCH_2160P2400 = "UCH_2160P2400",
    UHD_1556P2398 = "UHD_1556P2398",
    UHD_1556P2400 = "UHD_1556P2400",
    UHD_1556P2500 = "UHD_1556P2500",
    UHD_2160P2398 = "UHD_2160P2398",
    UHD_2160P2500 = "UHD_2160P2500",
    UHD_2160P2997 = "UHD_2160P2997",
    UHD_2160P3000 = "UHD_2160P3000",
    UHD_2160P5000 = "UHD_2160P5000",
    UHD_2160P5994 = "UHD_2160P5994",
    INVALID = "INVALID"
}
export declare enum Chroma {
    BLUE = "BLUE",
    GREEN = "GREEN",
    NONE = "NONE"
}
export interface Mixer {
    inTransition?: ITransition;
    changeTransition?: ITransition;
    outTransition?: ITransition;
    anchor?: {
        x: number;
        y: number;
    } | TransitionObject;
    blend?: BlendMode | TransitionObject;
    brightness?: number | TransitionObject;
    chroma?: {
        keyer: Chroma;
        threshold: number;
        softness: number;
        spill: number;
    } | TransitionObject;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | TransitionObject;
    contrast?: number | TransitionObject;
    crop?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    } | TransitionObject;
    fill?: {
        x: number;
        y: number;
        xScale: number;
        yScale: number;
    } | TransitionObject;
    keyer?: boolean | TransitionObject;
    levels?: {
        minInput: number;
        maxInput: number;
        gamma: number;
        minOutput: number;
        maxOutput: number;
    } | TransitionObject;
    mastervolume?: number | TransitionObject;
    opacity?: number | TransitionObject;
    perspective?: {
        topLeftX: number;
        topLeftY: number;
        topRightX: number;
        topRightY: number;
        bottomRightX: number;
        bottomRightY: number;
        bottomLeftX: number;
        bottomLeftY: number;
    } | TransitionObject;
    rotation?: number | TransitionObject;
    saturation?: number | TransitionObject;
    straightAlpha?: boolean | TransitionObject;
    volume?: number | TransitionObject;
    bundleWithCommands?: number;
}
export interface TransitionObject {
    _value: string | number | boolean;
    inTransition: Transition0;
    changeTransition: Transition0;
    outTransition: Transition0;
}
export interface ITransition {
    type?: string;
    duration: number;
    easing?: string;
    direction?: string;
}
export interface Transition0 extends ITransition {
    type: string;
    duration: number;
    easing: string;
    direction: string;
}
