import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

const ITERATIONS = 210000
const KEY_LENGTH = 32

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function hex(buffer) {
  return buffer.toString('hex')
}

const passwordArg = process.argv[2]
let password = passwordArg

if (!password) {
  const rl = createInterface({ input: stdin, output: stdout })
  password = await rl.question('Admin password to hash: ')
  rl.close()
}

if (!password || password.length < 12) {
  console.error('Use an admin password with at least 12 characters.')
  process.exit(1)
}

const salt = randomBytes(16)
const useLegacyPbkdf2 = process.argv.includes('--pbkdf2')

if (useLegacyPbkdf2) {
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256')
  console.log(`pbkdf2_sha256$${ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`)
} else {
  const hash = createHash('sha256').update(salt).update(password).digest()
  console.log(`sha256hex$${hex(salt)}$${hex(hash)}`)
}
