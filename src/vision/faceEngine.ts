import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'
import {
  blendScore,
  estimateCrownFromLandmarks,
  eulerFromTransformMatrix,
  faceOvalRect,
  LM,
  rollFromLandmarks,
  toPixelLandmarks,
} from './landmarks'

export type CrownSource = 'segmentation' | 'schaetzung' | 'manuell'

/** Eingabeformate, die MediaPipe im IMAGE-Modus annimmt. */
export type DetectSource = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap

/**
 * `WasmFileset` wird von MediaPipe nicht exportiert, obwohl `forVisionTasks`
 * genau diese Struktur liefert. Lokal nachgebildet, damit die Übergabe typisiert
 * ist, ohne die Bibliothek zu patchen.
 */
interface MediaPipeWasmFileset {
  wasmLoaderPath: string
  wasmBinaryPath: string
  assetLoaderPath?: string
  assetBinaryPath?: string
}

export interface FaceObservation {
  detected: boolean
  facesDetected: number
  width: number
  height: number
  crownY: number
  crownSource: CrownSource
  hairlineY: number
  chinY: number
  eyeLineY: number
  faceCenterX: number
  faceWidthPx: number
  faceOval: { minX: number; maxX: number; minY: number; maxY: number }
  rollDeg: number
  yawDeg: number
  pitchDeg: number
  eyeOpenLeft: number
  eyeOpenRight: number
  mouthOpen: number
  smile: number
}

const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`
const LANDMARKER_MODEL = `${import.meta.env.BASE_URL}models/face_landmarker.task`
const SEGMENTER_MODEL = `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`

/** Index der Haarklasse im Multiclass-Segmentierungsmodell. */
const HAIR_CLASS = 1

function emptyObservation(width: number, height: number, facesDetected = 0): FaceObservation {
  return {
    detected: false,
    facesDetected,
    width,
    height,
    crownY: 0,
    crownSource: 'schaetzung',
    hairlineY: 0,
    chinY: 0,
    eyeLineY: 0,
    faceCenterX: width / 2,
    faceWidthPx: 0,
    faceOval: { minX: 0, maxX: width, minY: 0, maxY: height },
    rollDeg: 0,
    yawDeg: 0,
    pitchDeg: 0,
    eyeOpenLeft: 0,
    eyeOpenRight: 0,
    mouthOpen: 0,
    smile: 0,
  }
}

export class FaceEngine {
  // `forVisionTasks` liefert zur Laufzeit ein WasmFileset, auch wenn der
  // Rückgabetyp als Resolver deklariert ist.
  private fileset: MediaPipeWasmFileset | null = null
  private videoLandmarker: FaceLandmarker | null = null
  private imageLandmarker: FaceLandmarker | null = null
  private segmenter: ImageSegmenter | null = null
  private segmenterFailed = false
  private loading: Promise<FaceLandmarker> | null = null

  /** Haarsegmentierung abschaltbar – spart 16 MB Download. */
  useSegmentation = true

  async load(): Promise<FaceLandmarker> {
    if (this.videoLandmarker) return this.videoLandmarker
    if (this.loading) return this.loading

    this.loading = (async () => {
      this.fileset = (await FilesetResolver.forVisionTasks(WASM_PATH)) as MediaPipeWasmFileset
      const options = {
        baseOptions: { modelAssetPath: LANDMARKER_MODEL },
        runningMode: 'VIDEO' as const,
        numFaces: 3,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.4,
        minFacePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      }
      try {
        this.videoLandmarker = await FaceLandmarker.createFromOptions(this.fileset, {
          ...options,
          baseOptions: { ...options.baseOptions, delegate: 'GPU' },
        })
      } catch {
        this.videoLandmarker = await FaceLandmarker.createFromOptions(this.fileset, options)
      }
      return this.videoLandmarker
    })()

    return this.loading
  }

  private async getImageLandmarker(): Promise<FaceLandmarker> {
    if (this.imageLandmarker) return this.imageLandmarker
    await this.load()
    if (!this.fileset) throw new Error('MediaPipe-WASM nicht geladen')
    this.imageLandmarker = await FaceLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetPath: LANDMARKER_MODEL },
      runningMode: 'IMAGE',
      numFaces: 3,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.3,
      minFacePresenceConfidence: 0.3,
    })
    return this.imageLandmarker
  }

  private async getSegmenter(): Promise<ImageSegmenter | null> {
    if (!this.useSegmentation || this.segmenterFailed) return null
    if (this.segmenter) return this.segmenter
    try {
      if (!this.fileset) await this.load()
      if (!this.fileset) return null
      this.segmenter = await ImageSegmenter.createFromOptions(this.fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
      return this.segmenter
    } catch {
      this.segmenterFailed = true
      return null
    }
  }

  detectVideo(video: HTMLVideoElement, timestampMs: number): FaceObservation {
    if (!this.videoLandmarker) return emptyObservation(video.videoWidth, video.videoHeight)
    let result: FaceLandmarkerResult | null = null
    try {
      result = this.videoLandmarker.detectForVideo(video, timestampMs)
    } catch {
      return emptyObservation(video.videoWidth, video.videoHeight)
    }
    return this.toObservation(result, video.videoWidth, video.videoHeight)
  }

  async detectImage(source: DetectSource): Promise<FaceObservation> {
    const landmarker = await this.getImageLandmarker()
    const result = landmarker.detect(source)
    const width =
      'videoWidth' in source && source.videoWidth > 0
        ? source.videoWidth
        : 'width' in source
          ? source.width
          : 0
    const height =
      'videoHeight' in source && source.videoHeight > 0
        ? source.videoHeight
        : 'height' in source
          ? source.height
          : 0
    const observation = this.toObservation(result, width, height)
    if (observation.detected && this.useSegmentation) {
      const crownY = await this.findCrown(source)
      if (crownY !== null && crownY < observation.hairlineY - 1) {
        observation.crownY = crownY
        observation.crownSource = 'segmentation'
      }
    }
    return observation
  }

  /** Oberster Haarpunkt über dem Gesicht – der Scheitel. */
  private async findCrown(source: DetectSource): Promise<number | null> {
    const segmenter = await this.getSegmenter()
    if (!segmenter) return null
    const width = 'videoWidth' in source ? source.videoWidth : 'width' in source ? source.width : 0
    const height = 'videoHeight' in source ? source.videoHeight : 'height' in source ? source.height : 0
    if (width === 0 || height === 0) return null

    let mask: { width: number; height: number; getAsUint8Array(): Uint8Array } | undefined
    segmenter.segment(source, (result) => {
      mask = result.categoryMask as unknown as {
        width: number
        height: number
        getAsUint8Array(): Uint8Array
      }
    })
    if (!mask) return null

    const data = mask.getAsUint8Array()
    const maskW = mask.width
    const maskH = mask.height
    const bandStart = Math.floor(maskW * 0.3)
    const bandEnd = Math.ceil(maskW * 0.7)
    const minHits = Math.max(2, Math.round((bandEnd - bandStart) * 0.04))

    for (let y = 0; y < maskH; y += 1) {
      let hits = 0
      for (let x = bandStart; x < bandEnd; x += 1) {
        if (data[y * maskW + x] === HAIR_CLASS) hits += 1
      }
      if (hits >= minHits) return (y / maskH) * height
    }
    return null
  }

  private toObservation(result: FaceLandmarkerResult, width: number, height: number): FaceObservation {
    const faces = result.faceLandmarks ?? []
    if (faces.length === 0) return emptyObservation(width, height, 0)

    const landmarks = toPixelLandmarks(faces[0], width, height)
    const blendshapes = result.faceBlendshapes?.[0]?.categories ?? []
    const matrix = result.facialTransformationMatrixes?.[0]?.data

    const forehead = landmarks[LM.foreheadTop]
    const chin = landmarks[LM.chin]
    const eyeA = landmarks[LM.rightEyeOuter]
    const eyeB = landmarks[LM.leftEyeOuter]
    const eyeLineY = (eyeA.y + eyeB.y) / 2
    const oval = faceOvalRect(landmarks)
    const faceCenterX = (oval.minX + oval.maxX) / 2

    let rollDeg = rollFromLandmarks(landmarks)
    let yawDeg = 0
    let pitchDeg = 0
    if (matrix) {
      const euler = eulerFromTransformMatrix(matrix)
      rollDeg = euler.rollDeg
      yawDeg = euler.yawDeg
      pitchDeg = euler.pitchDeg
    }

    return {
      detected: true,
      facesDetected: faces.length,
      width,
      height,
      crownY: estimateCrownFromLandmarks(landmarks),
      crownSource: 'schaetzung',
      hairlineY: forehead.y,
      chinY: chin.y,
      eyeLineY,
      faceCenterX,
      faceWidthPx: oval.maxX - oval.minX,
      faceOval: oval,
      rollDeg,
      yawDeg,
      pitchDeg,
      eyeOpenLeft: 1 - blendScore(blendshapes, 'eyeBlinkLeft'),
      eyeOpenRight: 1 - blendScore(blendshapes, 'eyeBlinkRight'),
      mouthOpen: blendScore(blendshapes, 'jawOpen'),
      smile: (blendScore(blendshapes, 'mouthSmileLeft') + blendScore(blendshapes, 'mouthSmileRight')) / 2,
    }
  }

  close(): void {
    this.videoLandmarker?.close()
    this.imageLandmarker?.close()
    this.segmenter?.close()
    this.videoLandmarker = null
    this.imageLandmarker = null
    this.segmenter = null
    this.loading = null
  }
}

export const faceEngine = new FaceEngine()