/**
 * `ImageData` gibt es nur im Browser. Die reine Pixelanalyse braucht es auch
 * unter Node, daher wird hier ein minimaler Ersatz bereitgestellt.
 */
class NodeImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  colorSpace = 'srgb' as const

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth
      this.height = widthOrHeight
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
    } else {
      this.data = dataOrWidth
      this.width = widthOrHeight
      this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
    }
  }
}

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = NodeImageData as unknown as typeof ImageData
}
