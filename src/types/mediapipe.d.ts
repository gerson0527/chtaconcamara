declare module '@mediapipe/selfie_segmentation' {
  export interface SelfieSegmentationOptions {
    modelSelection: number;
    selfieMode: boolean;
  }

  export interface SegmentationResults {
    segmentationMask: ImageBitmap;
    image: HTMLVideoElement;
  }

  export class SelfieSegmentation {
    constructor(options?: { locateFile?: (file: string) => string });
    setOptions(options: SelfieSegmentationOptions): void;
    onResults(callback: (results: SegmentationResults) => void): void;
    send(options: { image: HTMLVideoElement }): Promise<void>;
    close(): void;
  }
} 