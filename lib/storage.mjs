import { mkdir, open, readFile, rename, rm, chmod, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'

export async function privateDirectory(home) {
  const directory = join(home, 'figma')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Figma state directory cannot be a symlink')
  await chmod(directory, 0o700)
  return directory
}
export async function readJson(path, fallback = {}) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return fallback; throw e }
}
export async function privateJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(value)); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
export async function bridgeToken(home) {
  const path = join(await privateDirectory(home), 'bridge-token')
  try {
    const file = await open(path, 'wx', 0o600)
    try { await file.writeFile(randomBytes(32).toString('hex')) } finally { await file.close() }
  } catch (e) { if (e.code !== 'EEXIST') throw e }
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid bridge token file')
  await chmod(path, 0o600)
  const token = (await readFile(path, 'utf8')).trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid bridge token')
  return token
}
