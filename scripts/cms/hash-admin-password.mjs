import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { stdin, stdout } from 'node:process'

const ITERATIONS = 210000
const KEY_LENGTH = 32
const MIN_PASSWORD_LENGTH = 12
const CTRL_C = '\x03'
const BACKSPACE = '\x08'
const DELETE = '\x7f'

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function promptHiddenInput(promptText) {
  return new Promise((resolve, reject) => {
    stdout.write(promptText)

    if (!stdin.isTTY) {
      reject(new Error('This script must be run in an interactive terminal.'))
      return
    }

    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const onData = (char) => {
      if (char === CTRL_C) {
        cleanup()
        stdout.write('\n')
        reject(new Error('Aborted.'))
        return
      }

      if (char === '\r' || char === '\n') {
        cleanup()
        stdout.write('\n')
        resolve(value)
        return
      }

      if (char === BACKSPACE || char === DELETE) {
        if (value.length > 0) {
          value = value.slice(0, -1)
          stdout.write('\b \b')
        }
        return
      }

      value += char
      stdout.write('*')
    }

    function cleanup() {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
    }

    stdin.on('data', onData)
  })
}

try {
  const password = await promptHiddenInput('Admin password to hash: ')

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Use an admin password with at least ${MIN_PASSWORD_LENGTH} characters.`)
    process.exit(1)
  }

  const confirmation = await promptHiddenInput('Confirm password: ')

  if (confirmation !== password) {
    console.error('Passwords did not match. Nothing was generated.')
    process.exit(1)
  }

  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256')

  console.log(`pbkdf2_sha256$${ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
