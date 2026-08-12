import { NextResponse } from "next/server";

export const runtime = "nodejs";

const sampleRate = 8000;
const durationSeconds = 6;
const bytesPerSample = 2;

function writeString(buffer: Buffer, offset: number, value: string) {
  buffer.write(value, offset, value.length, "ascii");
}

function isToneActive(sampleIndex: number) {
  const cycleMs = 3000;
  const positionMs = (sampleIndex / sampleRate) * 1000 % cycleMs;

  return positionMs < 400 || (positionMs >= 600 && positionMs < 1000);
}

function generateRingbackWav() {
  const sampleCount = sampleRate * durationSeconds;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  writeString(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeString(buffer, 8, "WAVE");
  writeString(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  writeString(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const offset = 44 + index * bytesPerSample;

    if (!isToneActive(index)) {
      buffer.writeInt16LE(0, offset);
      continue;
    }

    const time = index / sampleRate;
    const sample =
      Math.sin(2 * Math.PI * 440 * time) * 0.16 +
      Math.sin(2 * Math.PI * 480 * time) * 0.14;

    buffer.writeInt16LE(Math.round(sample * 32767), offset);
  }

  return buffer;
}

export async function GET() {
  return new NextResponse(generateRingbackWav(), {
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Type": "audio/wav",
    },
  });
}
