import crypto from 'node:crypto'

export type AopsEncryptedPayload = {
  v: 1
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  data: string
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 32, (error, key) => {
      if (error) reject(error)
      else resolve(key as Buffer)
    })
  })
}

export async function encryptWithPassword(
  value: string,
  password: string,
  salt = crypto.randomBytes(16),
): Promise<{ payload: AopsEncryptedPayload; key: Buffer }> {
  const key = await deriveKey(password, salt)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    key,
    payload: {
      v: 1,
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    },
  }
}

export async function decryptWithPassword(payload: AopsEncryptedPayload, password: string): Promise<string> {
  if (payload.v !== 1 || payload.kdf !== 'scrypt') throw new Error('aops_encrypted_payload_invalid')
  const key = await deriveKey(password, Buffer.from(payload.salt, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
