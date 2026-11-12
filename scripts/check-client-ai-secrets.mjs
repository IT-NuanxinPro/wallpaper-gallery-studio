import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const output = path.join(root, 'dist')
if (!fs.existsSync(output)) throw new Error('先构建前端，再执行密钥检查')
const secretName = /^VITE_(?:.*(?:API_KEY|API_TOKEN)|.*SECRET.*|.*ACCESS_KEY.*)$/
const secretValues = new Set()
for (const [key, value] of Object.entries(process.env))
  if (secretName.test(key) && value?.length > 8) secretValues.add(value)
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  const file = path.join(root, name)
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match || !secretName.test(match[1])) continue
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
    if (value.length > 8) secretValues.add(value)
  }
}
let inspected = 0
function scan(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name)
    if (item.isDirectory()) {
      scan(file)
      continue
    }
    if (!/\.(?:js|css|html|json|map)$/.test(item.name)) continue
    inspected++
    const content = fs.readFileSync(file, 'utf8')
    for (const value of secretValues) {
      if (content.includes(value))
        throw new Error(`前端产物含旧AI凭据，请检查：${path.relative(root, file)}（值未输出）`)
    }
  }
}
scan(output)
console.log(`已检查${inspected}个前端产物，没有发现已配置的AI密钥值。`)
