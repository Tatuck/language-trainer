/**
 * Pure, browser-agnostic helpers for turning raw PCM float samples into a
 * 16 kHz mono 16-bit WAV file and base64-encoding the result.
 */

/** Average an arbitrary number of equal-length channels into one mono channel. */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  const length = channels[0].length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/** Linear-interpolation resampler. Returns the input unchanged when rates match. */
export function resampleLinear(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (samples.length === 0) return new Float32Array(0);
  if (fromRate === toRate) return samples.slice();

  const outputLength = Math.round((samples.length * toRate) / fromRate);
  const out = new Float32Array(outputLength);
  const lastIndex = samples.length - 1;
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = (i * fromRate) / toRate;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, lastIndex);
    const frac = srcIndex - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

/** Encode mono float samples ([-1, 1]) as a 16-bit PCM WAV file (RIFF/WAVE). */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(HEADER_BYTES + dataSize);
  const view = new DataView(buf);
  const byteRate = sampleRate * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

  writeAsciiString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAsciiString(view, 8, "WAVE");
  writeAsciiString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAsciiString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(HEADER_BYTES + i * 2, Math.round(clamped * 32767), true);
  }

  return buf;
}

function writeAsciiString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

const BASE64_CHUNK_SIZE = 0x8000; // 32768 bytes: safe for String.fromCharCode(...chunk)

/** Base64-encode an ArrayBuffer in chunks so large (multi-MB) buffers don't blow the call stack. */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Browser-only: decode an audio Blob, downmix, resample to `targetRate` and
 * encode as base64 WAV. Thin composition of the tested pure functions above.
 */
export async function blobToWavBase64(blob: Blob, targetRate = 16000): Promise<string> {
  const AudioContextCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) {
      channels.push(decoded.getChannelData(i));
    }
    const mono = downmixToMono(channels);
    const resampled = resampleLinear(mono, decoded.sampleRate, targetRate);
    const wav = encodeWavPcm16(resampled, targetRate);
    return arrayBufferToBase64(wav);
  } finally {
    await audioContext.close();
  }
}
