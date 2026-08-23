const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export interface JpegDimensions {
  height: number;
  width: number;
}

export function inspectJpegDimensions(bytes: Uint8Array): JpegDimensions | undefined {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.byteLength - 2] !== 0xff || bytes[bytes.byteLength - 1] !== 0xd9) {
    return undefined;
  }

  let offset = 2;

  while (offset < bytes.byteLength - 1) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === undefined || marker === 0x00) {
      return undefined;
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 1 >= bytes.byteLength) {
      return undefined;
    }

    const segmentLength = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);

    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      return undefined;
    }

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) {
        return undefined;
      }

      const height = (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0);
      const width = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0);

      return width > 0 && height > 0 ? { height, width } : undefined;
    }

    offset += segmentLength;
  }

  return undefined;
}
