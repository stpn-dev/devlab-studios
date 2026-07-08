import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectRecords } from '../../src/data/projectRecords.js'

const bucket = process.env.R2_BUCKET || 'devlab-studios'
const projectRoot = resolve(import.meta.dirname, '../..')
const assetsDir = resolve(projectRoot, 'src/assets/projects')

for (const record of projectRecords) {
  if (!record.imageFilename) continue

  const filePath = resolve(assetsDir, record.imageFilename)
  if (!existsSync(filePath)) {
    console.warn(`Skipping missing image: ${record.imageFilename}`)
    continue
  }

  const key = `projects/${record.imageFilename}`
  const result = spawnSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', filePath],
    { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' },
  )

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}
