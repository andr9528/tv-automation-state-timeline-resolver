import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
export interface ShotokuOptions {
    host: string;
    port: number;
}
export interface MappingShotoku extends Mapping {
    device: DeviceType.SHOTOKU;
}
export declare enum TimelineContentTypeShotoku {
    SHOT = "shot",
    SEQUENCE = "sequence"
}
export declare enum ShotokuTransitionType {
    Cut = "cut",
    Fade = "fade"
}
export interface ShotokuCommandContent {
    shot: number;
    show?: number; /** Defaults to 1 */
    transitionType?: ShotokuTransitionType;
    changeOperatorScreen?: boolean;
}
export interface TimelineObjShotokuShot extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.SHOTOKU;
        type: TimelineContentTypeShotoku.SHOT;
    } & ShotokuCommandContent;
}
export interface TimelineObjShotokuSequence extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.SHOTOKU;
        type: TimelineContentTypeShotoku.SEQUENCE;
        sequenceId: string;
        shots: Array<{
            offset: number;
        } & ShotokuCommandContent>;
    };
}
export declare type TimelineObjShotoku = TimelineObjShotokuShot | TimelineObjShotokuSequence;
