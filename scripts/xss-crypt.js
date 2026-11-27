// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
// AES-256-GCM helper for scripts/xss. The CLI passes this file to `node -e`
// inside the backend container, so it does not require a rebuilt image.
//
//   encrypt <source> <target>   write <target> in XSS1 format
//   decrypt <source>            write decrypted gzip data to stdout
//
// Format: "XSS1" | version(1) | IV(12) | ciphertext | tag(16)

const fs = require("fs");
const crypto = require("crypto");
const { Writable } = require("stream");
const { pipeline } = require("stream/promises");

const MAGIC = Buffer.from("XSS1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + IV_LENGTH;

function readExactly(fd, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = fs.readSync(fd, buffer, offset, length - offset, position + offset);
    if (read === 0) throw new Error("зашифрованный снимок обрезан");
    offset += read;
  }
  return buffer;
}

(async () => {
  const mode = process.argv[1];
  const source = process.argv[2];
  const target = process.argv[3];
  const key = Buffer.from((process.env.BACKUP_ENCRYPTION_KEY || "").trim(), "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY отсутствует или неверной длины");

  if (mode === "encrypt") {
    if (!target) throw new Error("не указан файл назначения");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    fs.writeFileSync(target, Buffer.concat([MAGIC, Buffer.from([1]), iv]), { mode: 0o600 });
    await pipeline(fs.createReadStream(source), cipher, fs.createWriteStream(target, { flags: "a", mode: 0o600 }));
    const fd = fs.openSync(target, "r+");
    try {
      fs.writeSync(fd, cipher.getAuthTag(), 0, TAG_LENGTH, HEADER_LENGTH + fs.statSync(source).size);
    } finally {
      fs.closeSync(fd);
    }
    return;
  }

  if (mode !== "decrypt") throw new Error("неизвестный режим");
  const total = fs.statSync(source).size;
  if (total <= HEADER_LENGTH + TAG_LENGTH) throw new Error("зашифрованный снимок обрезан");
  const fd = fs.openSync(source, "r");
  let header;
  let tag;
  try {
    header = readExactly(fd, HEADER_LENGTH, 0);
    tag = readExactly(fd, TAG_LENGTH, total - TAG_LENGTH);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC) || header[MAGIC.length] !== 1) {
    throw new Error("неподдерживаемый формат зашифрованного снимка");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length + 1));
  decipher.setAuthTag(tag);
  const output = new Writable({
    write(chunk, _encoding, callback) { process.stdout.write(chunk, callback); },
  });
  await pipeline(fs.createReadStream(source, { start: HEADER_LENGTH, end: total - TAG_LENGTH - 1 }), decipher, output);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
