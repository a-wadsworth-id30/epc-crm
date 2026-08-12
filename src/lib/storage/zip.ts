import "server-only";

const crc32Table = new Uint32Array(256);

for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  crc32Table[index] = value >>> 0;
}

export type StoredZipFile = {
  data: Buffer;
  modifiedAt: Date;
  name: string;
};

type CentralDirectoryEntry = {
  compressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  modifiedAt: Date;
  name: Buffer;
  uncompressedSize: number;
};

function crc32(data: Buffer) {
  let value = 0xffffffff;

  for (const byte of data) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function extensionIndex(name: string) {
  const index = name.lastIndexOf(".");

  return index > 0 ? index : name.length;
}

function safeZipName(name: string, fallbackIndex: number) {
  const cleaned = name
    .replace(/\0/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || `document-${fallbackIndex + 1}`;
}

export function uniqueStoredZipFiles(files: StoredZipFile[]) {
  const seen = new Map<string, number>();

  return files.map((file, index) => {
    const safeName = safeZipName(file.name, index);
    const key = safeName.toLowerCase();
    const duplicateIndex = seen.get(key) ?? 0;
    seen.set(key, duplicateIndex + 1);

    if (!duplicateIndex) {
      return { ...file, name: safeName };
    }

    const splitAt = extensionIndex(safeName);
    const base = safeName.slice(0, splitAt);
    const extension = safeName.slice(splitAt);

    return {
      ...file,
      name: `${base}-${duplicateIndex + 1}${extension}`,
    };
  });
}

function localFileHeader(entry: CentralDirectoryEntry) {
  const { date, time } = dosDateTime(entry.modifiedAt);
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);

  return header;
}

function centralDirectoryHeader(entry: CentralDirectoryEntry) {
  const { date, time } = dosDateTime(entry.modifiedAt);
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localHeaderOffset, 42);

  return header;
}

function endOfCentralDirectory({
  centralDirectoryOffset,
  centralDirectorySize,
  entryCount,
}: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
}) {
  const header = Buffer.alloc(22);

  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralDirectorySize, 12);
  header.writeUInt32LE(centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);

  return header;
}

export function createStoredZip(files: StoredZipFile[]) {
  const localParts: Buffer[] = [];
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const file of uniqueStoredZipFiles(files)) {
    const name = Buffer.from(file.name, "utf8");
    const entry = {
      compressedSize: file.data.length,
      crc32: crc32(file.data),
      localHeaderOffset: offset,
      modifiedAt: file.modifiedAt,
      name,
      uncompressedSize: file.data.length,
    };
    const header = localFileHeader(entry);

    localParts.push(header, name, file.data);
    centralEntries.push(entry);
    offset += header.length + name.length + file.data.length;
  }

  const centralDirectoryOffset = offset;
  const centralParts = centralEntries.flatMap((entry) => [
    centralDirectoryHeader(entry),
    entry.name,
  ]);
  const centralDirectorySize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );

  return Buffer.concat([
    ...localParts,
    ...centralParts,
    endOfCentralDirectory({
      centralDirectoryOffset,
      centralDirectorySize,
      entryCount: centralEntries.length,
    }),
  ]);
}
