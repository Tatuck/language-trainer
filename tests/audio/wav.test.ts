import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  arrayBufferToBase64,
  downmixToMono,
  encodeWavPcm16,
  resampleLinear,
} from "@/lib/audio/wav";

describe("downmixToMono", () => {
  it("returns the single channel unchanged", () => {
    const result = downmixToMono([new Float32Array([0.1, 0.2, -0.3])]);
    expect(result).toEqual(new Float32Array([0.1, 0.2, -0.3]));
  });

  it("averages two channels sample by sample", () => {
    const result = downmixToMono([
      new Float32Array([1, 1, 1]),
      new Float32Array([-1, -1, -1]),
    ]);
    expect(result).toEqual(new Float32Array([0, 0, 0]));
  });

  it("averages three channels", () => {
    const result = downmixToMono([
      new Float32Array([1, 0]),
      new Float32Array([0, 1]),
      new Float32Array([2, 2]),
    ]);
    expect(result).toEqual(new Float32Array([1, 1]));
  });

  it("returns an empty array when given no channels", () => {
    expect(downmixToMono([])).toEqual(new Float32Array(0));
  });
});

describe("resampleLinear", () => {
  it("returns the samples unchanged when rates match", () => {
    const samples = new Float32Array([0.1, -0.2, 0.3, 0.4]);
    const result = resampleLinear(samples, 16000, 16000);
    expect(result).toEqual(samples);
  });

  it("linearly interpolates when upsampling", () => {
    const samples = new Float32Array([0, 2]);
    const result = resampleLinear(samples, 1, 2);
    expect(result).toEqual(new Float32Array([0, 1, 2, 2]));
  });

  it("linearly interpolates when downsampling", () => {
    const samples = new Float32Array([0, 1, 2, 3]);
    const result = resampleLinear(samples, 4, 2);
    expect(result).toEqual(new Float32Array([0, 2]));
  });

  it("returns an empty array when given no samples", () => {
    expect(resampleLinear(new Float32Array(0), 16000, 8000)).toEqual(new Float32Array(0));
  });
});

describe("encodeWavPcm16", () => {
  it("writes a 44-byte RIFF/WAVE header followed by the PCM data", () => {
    const buf = encodeWavPcm16(new Float32Array([0, 0, 0]), 16000);
    expect(buf.byteLength).toBe(44 + 2 * 3);

    const bytes = new Uint8Array(buf);
    const chunkId = String.fromCharCode(...bytes.slice(0, 4));
    const format = String.fromCharCode(...bytes.slice(8, 12));
    const subchunk1Id = String.fromCharCode(...bytes.slice(12, 16));
    const subchunk2Id = String.fromCharCode(...bytes.slice(36, 40));
    expect(chunkId).toBe("RIFF");
    expect(format).toBe("WAVE");
    expect(subchunk1Id).toBe("fmt ");
    expect(subchunk2Id).toBe("data");
  });

  it("encodes the sample rate, mono channel count and 16-bit depth", () => {
    const buf = encodeWavPcm16(new Float32Array([0]), 44100);
    const view = new DataView(buf);
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint16(22, true)).toBe(1); // num channels
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(28, true)).toBe(44100 * 1 * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
  });

  it("sets the data-size and chunk-size fields from the sample count", () => {
    const samples = new Float32Array(10);
    const buf = encodeWavPcm16(samples, 16000);
    const view = new DataView(buf);
    expect(view.getUint32(40, true)).toBe(2 * samples.length);
    expect(view.getUint32(4, true)).toBe(36 + 2 * samples.length);
  });

  it("round-trips a known sample value scaled to 16-bit PCM", () => {
    const buf = encodeWavPcm16(new Float32Array([0.5]), 16000);
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 32767));
  });

  it("clamps out-of-range samples to [-1, 1] before encoding", () => {
    const buf = encodeWavPcm16(new Float32Array([2, -2]), 16000);
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
  });
});

describe("arrayBufferToBase64", () => {
  it("matches Buffer's base64 encoding for a small buffer", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 127, 128]);
    const result = arrayBufferToBase64(bytes.buffer);
    expect(result).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("returns an empty string for an empty buffer", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });

  it("matches Buffer's base64 encoding for a 2 MB buffer without blowing the call stack", () => {
    const size = 2 * 1024 * 1024;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const result = arrayBufferToBase64(bytes.buffer);
    expect(result).toBe(Buffer.from(bytes).toString("base64"));
  });
});
