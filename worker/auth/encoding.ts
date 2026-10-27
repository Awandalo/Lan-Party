export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(value: string, byteLength: number): Uint8Array | null {
  if (value.length !== byteLength * 2 || !/^[0-9a-f]+$/.test(value)) return null;
  return Uint8Array.from(value.match(/../g)!, (pair) => Number.parseInt(pair, 16));
}
