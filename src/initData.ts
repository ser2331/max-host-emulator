const encoder = new TextEncoder();

async function hmacSha256(key: BufferSource, data: BufferSource): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, data);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key: BufferSource, data: BufferSource): Promise<string> {
  return toHex(await hmacSha256(key, data));
}

export async function signInitData(
  fields: Record<string, string>,
  botToken: string,
): Promise<string> {
  const pairs = Object.entries(fields)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = await hmacSha256(encoder.encode('WebAppData'), encoder.encode(botToken));
  const hash = await hmacSha256Hex(secretKey, encoder.encode(dataCheckString));
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

export async function signContact(params: {
  phone: string;
  userId: number;
  botToken: string;
}): Promise<{ phone: string; authDate: string; hash: string }> {
  const phone = params.phone.startsWith('+') ? params.phone : `+${params.phone}`;
  const authDate = String(Math.floor(Date.now() / 1000));
  const dataCheckString = [
    `authDate=${authDate}`,
    `phone=${phone.replace(/^\+/, '')}`,
    `userId=${params.userId}`,
  ].join('\n');
  const hash = await hmacSha256Hex(encoder.encode(params.botToken), encoder.encode(dataCheckString));
  return { phone, authDate, hash };
}
