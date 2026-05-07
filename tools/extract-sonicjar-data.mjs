import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainCanvasClassPath = path.join(rootDir, "public/assets/source-j2me/classes/MainCanvas.class");
const outputPath = path.join(rootDir, "public/assets/source-j2me/levels/maincanvas-static-data.json");
const distantBgOutputPath = path.join(rootDir, "public/assets/source-j2me/levels/distant-bg-tables.json");

const wantedFields = new Set([
  "worldMapData",
  "PlayerH",
  "PlayerParam",
  "plmaxspd",
  "pladdspd",
  "plretspd",
  "plstaspd",
  "gravity",
  "pljump",
  "pljump_w",
  "sinData",
  "blockLinkTable",
  "blockColTable",
  "objectSizeTbl",
  "RectTblKamere",
  "RectTblHachi",
  "RectTblMusi",
  "RectTblKani",
  "RectTblFish",
  "TRANS_NONE",
  "TRANS_ROT90",
  "TRANS_ROT180",
  "TRANS_ROT270",
  "TRANS_MIRROR",
  "TRANS_MIRROR_ROT90",
  "TRANS_MIRROR_ROT180",
  "TRANS_MIRROR_ROT270",
]);

const byteArrayFields = new Set(["worldMapData", "blockLinkTable", "blockColTable"]);

class ClassReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  u1() {
    return this.buffer[this.offset++];
  }

  i1() {
    const value = this.u1();
    return value > 127 ? value - 256 : value;
  }

  u2() {
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  i2() {
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  u4() {
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  bytes(length) {
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

function parseClassFile(buffer) {
  const reader = new ClassReader(buffer);
  const magic = reader.u4();
  if (magic !== 0xcafebabe) {
    throw new Error("MainCanvas.class is not a Java class file");
  }

  reader.u2();
  reader.u2();

  const constantPoolCount = reader.u2();
  const constantPool = [null];
  for (let index = 1; index < constantPoolCount; index += 1) {
    const tag = reader.u1();
    const entry = { tag };

    switch (tag) {
      case 1: {
        const length = reader.u2();
        entry.value = reader.bytes(length).toString("utf8");
        break;
      }
      case 3:
        entry.value = buffer.readInt32BE(reader.offset);
        reader.offset += 4;
        break;
      case 4:
        entry.value = buffer.readFloatBE(reader.offset);
        reader.offset += 4;
        break;
      case 5:
        entry.value = Number(buffer.readBigInt64BE(reader.offset));
        reader.offset += 8;
        constantPool.push(null);
        index += 1;
        break;
      case 6:
        entry.value = buffer.readDoubleBE(reader.offset);
        reader.offset += 8;
        constantPool.push(null);
        index += 1;
        break;
      case 7:
      case 8:
        entry.index = reader.u2();
        break;
      case 9:
      case 10:
      case 11:
      case 12:
        entry.a = reader.u2();
        entry.b = reader.u2();
        break;
      default:
        throw new Error(`Unsupported constant-pool tag ${tag} at index ${index}`);
    }

    constantPool.push(entry);
  }

  const utf = (index) => constantPool[index]?.value;
  const className = (index) => utf(constantPool[index]?.index);
  const nameAndType = (index) => {
    const entry = constantPool[index];
    return {
      name: utf(entry.a),
      descriptor: utf(entry.b),
    };
  };
  const ref = (index) => {
    const entry = constantPool[index];
    return {
      className: className(entry.a),
      ...nameAndType(entry.b),
    };
  };

  reader.u2();
  reader.u2();
  reader.u2();

  const interfacesCount = reader.u2();
  reader.offset += interfacesCount * 2;

  const fields = [];
  const fieldsCount = reader.u2();
  for (let index = 0; index < fieldsCount; index += 1) {
    const access = reader.u2();
    const name = utf(reader.u2());
    const descriptor = utf(reader.u2());
    const attributesCount = reader.u2();
    for (let attr = 0; attr < attributesCount; attr += 1) {
      reader.u2();
      const length = reader.u4();
      reader.offset += length;
    }

    fields.push({ access, name, descriptor });
  }

  const methods = [];
  const methodsCount = reader.u2();
  for (let index = 0; index < methodsCount; index += 1) {
    const access = reader.u2();
    const name = utf(reader.u2());
    const descriptor = utf(reader.u2());
    const attributesCount = reader.u2();
    const attributes = [];
    for (let attr = 0; attr < attributesCount; attr += 1) {
      const attrName = utf(reader.u2());
      const length = reader.u4();
      const offset = reader.offset;
      attributes.push({ name: attrName, offset, length });
      reader.offset += length;
    }

    methods.push({ access, name, descriptor, attributes });
  }

  return { buffer, constantPool, fields, methods, utf, className, ref };
}

function readCodeAttribute(parsedClass, methodName) {
  const method = parsedClass.methods.find((candidate) => candidate.name === methodName);
  if (!method) {
    throw new Error(`Method ${methodName} not found in MainCanvas.class`);
  }

  const attr = method.attributes.find((candidate) => candidate.name === "Code");
  if (!attr) {
    throw new Error(`Method ${methodName} has no Code attribute`);
  }

  const buffer = parsedClass.buffer;
  let offset = attr.offset;
  const maxStack = buffer.readUInt16BE(offset);
  offset += 2;
  const maxLocals = buffer.readUInt16BE(offset);
  offset += 2;
  const codeLength = buffer.readUInt32BE(offset);
  offset += 4;

  return {
    maxStack,
    maxLocals,
    code: buffer.subarray(offset, offset + codeLength),
  };
}

function readSignedShort(code, pc) {
  return code.readInt16BE(pc);
}

function readConstant(parsedClass, index) {
  const entry = parsedClass.constantPool[index];
  if (!entry) {
    return null;
  }

  if (entry.tag === 3 || entry.tag === 4 || entry.tag === 5 || entry.tag === 6) {
    return entry.value;
  }

  if (entry.tag === 8) {
    return parsedClass.utf(entry.index);
  }

  throw new Error(`Unsupported ldc constant tag ${entry.tag}`);
}

function makeArray(dimensions) {
  const length = dimensions[0] ?? 0;
  const values = new Array(length).fill(null);
  if (dimensions.length > 1) {
    for (let index = 0; index < length; index += 1) {
      values[index] = makeArray(dimensions.slice(1));
    }
  }

  return values;
}

function toSignedByte(value) {
  const byte = value & 0xff;
  return byte > 127 ? byte - 256 : byte;
}

function executeStaticInitializer(parsedClass) {
  const { code } = readCodeAttribute(parsedClass, "<clinit>");
  const stack = [];
  const statics = new Map();
  let pc = 0;

  const pop = () => {
    if (stack.length === 0) {
      throw new Error(`Stack underflow at bytecode offset ${pc}`);
    }

    return stack.pop();
  };

  const push = (value) => {
    stack.push(value);
  };

  while (pc < code.length) {
    const opcode = code[pc++];

    switch (opcode) {
      case 0x01:
        push(null);
        break;
      case 0x02:
        push(-1);
        break;
      case 0x03:
      case 0x04:
      case 0x05:
      case 0x06:
      case 0x07:
      case 0x08:
        push(opcode - 0x03);
        break;
      case 0x10:
        push(code.readInt8(pc));
        pc += 1;
        break;
      case 0x11:
        push(readSignedShort(code, pc));
        pc += 2;
        break;
      case 0x12:
        push(readConstant(parsedClass, code[pc]));
        pc += 1;
        break;
      case 0x13:
      case 0x14:
        push(readConstant(parsedClass, code.readUInt16BE(pc)));
        pc += 2;
        break;
      case 0x4f: {
        const value = pop();
        const index = pop();
        const array = pop();
        array[index] = value | 0;
        break;
      }
      case 0x53: {
        const value = pop();
        const index = pop();
        const array = pop();
        array[index] = value;
        break;
      }
      case 0x54: {
        const value = pop();
        const index = pop();
        const array = pop();
        array[index] = toSignedByte(value);
        break;
      }
      case 0x56: {
        const value = pop();
        const index = pop();
        const array = pop();
        array[index] = readSignedShort(Buffer.from([(value >> 8) & 0xff, value & 0xff]), 0);
        break;
      }
      case 0x59: {
        const value = pop();
        push(value);
        push(value);
        break;
      }
      case 0x6e: {
        const divisor = pop();
        const dividend = pop();
        push(dividend % divisor);
        break;
      }
      case 0xb1:
        return statics;
      case 0xb2: {
        const field = parsedClass.ref(code.readUInt16BE(pc));
        pc += 2;
        push(statics.get(field.name) ?? null);
        break;
      }
      case 0xb3: {
        const field = parsedClass.ref(code.readUInt16BE(pc));
        pc += 2;
        statics.set(field.name, pop());
        break;
      }
      case 0xb8: {
        const method = parsedClass.ref(code.readUInt16BE(pc));
        pc += 2;
        if (method.name === "getDefaultFont") {
          push({ j2meStub: "Font.getDefaultFont" });
          break;
        }

        if (method.name === "getFont") {
          pop();
          pop();
          pop();
          push({ j2meStub: "Font.getFont" });
          break;
        }

        throw new Error(`Unsupported invokestatic ${method.className}.${method.name}${method.descriptor}`);
      }
      case 0xbc: {
        const atype = code[pc++];
        const length = pop();
        const defaultValue = atype === 4 ? false : 0;
        push(new Array(length).fill(defaultValue));
        break;
      }
      case 0xbd: {
        pc += 2;
        const length = pop();
        push(new Array(length).fill(null));
        break;
      }
      case 0xc5: {
        pc += 2;
        const dimensions = code[pc++];
        const lengths = [];
        for (let index = 0; index < dimensions; index += 1) {
          lengths.unshift(pop());
        }
        push(makeArray(lengths));
        break;
      }
      default:
        throw new Error(`Unsupported opcode 0x${opcode.toString(16)} at bytecode offset ${pc - 1}`);
    }
  }

  return statics;
}

function unsignedByteTree(value) {
  if (Array.isArray(value)) {
    return value.map(unsignedByteTree);
  }

  if (typeof value === "number") {
    return value & 0xff;
  }

  return value;
}

function compactValue(fieldName, value) {
  if (byteArrayFields.has(fieldName)) {
    return unsignedByteTree(value);
  }

  return value;
}

function main() {
  const parsedClass = parseClassFile(fs.readFileSync(mainCanvasClassPath));
  const statics = executeStaticInitializer(parsedClass);
  const fields = {};
  const scalarFields = {};

  for (const fieldName of wantedFields) {
    if (statics.has(fieldName)) {
      fields[fieldName] = compactValue(fieldName, statics.get(fieldName));
    }
  }

  for (const [fieldName, value] of statics.entries()) {
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      scalarFields[fieldName] = value;
    }
  }

  const payload = {
    generatedFrom: "public/assets/source-j2me/classes/MainCanvas.class",
    generatedAt: new Date().toISOString(),
    fieldCount: statics.size,
    scalarFields,
    fields,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`);
  console.log(`Extracted ${Object.keys(fields).length} MainCanvas static fields to ${path.relative(rootDir, outputPath)}`);

  const distantBgFields = {};
  for (const className of ["DistantBgTbl1", "DistantBgTbl2"]) {
    const tableClassPath = path.join(rootDir, `public/assets/source-j2me/classes/${className}.class`);
    const tableClass = parseClassFile(fs.readFileSync(tableClassPath));
    const tableStatics = executeStaticInitializer(tableClass);
    for (const [fieldName, value] of tableStatics.entries()) {
      if (/^data\d+$/.test(fieldName)) {
        distantBgFields[fieldName] = value;
      }
    }
  }

  const distantBgPayload = {
    generatedFrom: [
      "public/assets/source-j2me/classes/DistantBgTbl1.class",
      "public/assets/source-j2me/classes/DistantBgTbl2.class",
    ],
    generatedAt: new Date().toISOString(),
    fields: distantBgFields,
  };
  fs.writeFileSync(distantBgOutputPath, `${JSON.stringify(distantBgPayload)}\n`);
  console.log(`Extracted ${Object.keys(distantBgFields).length} DistantBg tables to ${path.relative(rootDir, distantBgOutputPath)}`);
}

main();
