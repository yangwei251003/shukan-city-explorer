import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(projectRoot, 'public', 'assets', 'licenses', 'THIRD_PARTY_NOTICES.md')
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script with npm run licenses:generate");
const rawInventory = execFileSync(process.execPath, [npmCli, "ls", "--omit=dev", "--all", "--parseable"], {
  cwd: projectRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
});
const packagePaths = new Set(rawInventory.trim().split(/\r?\n/)
  .map((item) => realpathSync(item)).filter((item) => item !== projectRoot));

const licenseFilePattern = /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i
const textSourcePattern = /\.(?:c?js|mjs|ts|md)$/i
const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const exactCopyright = new Map([
  ['@react-three/fiber@9.7.0', 'Copyright (c) 2019-2025 Poimandres'],
])

function collectTextFiles(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && textSourcePattern.test(entry.name) && !entry.name.endsWith('.map') && statSync(absolute).size <= 3 * 1024 * 1024) files.push(absolute)
      if (files.length >= 600) return
    }
  }
  visit(root)
  return files
}

function extractEmbeddedNotices(packagePath) {
  const found = new Map()
  for (const absolute of collectTextFiles(packagePath)) {
    const source = relative(packagePath, absolute).replaceAll('\\', '/')
    const text = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n')
    const blocks = [
      ...text.matchAll(/\/\*[\s\S]*?\*\//g),
      ...text.matchAll(/(?:^[ \t]*\/\/[^\n]*(?:\n|$)){1,40}/gm),
    ]
    for (const match of blocks) {
      const notice = match[0].trim()
      if (!/(?:@license|copyright|licensed under|subject to the terms)/i.test(notice)) continue
      const digest = createHash('sha256').update(notice).digest('hex')
      if (!found.has(digest)) found.set(digest, { name: `EMBEDDED:${source}`, text: notice })
      if (found.size >= 16) break
    }

    if (/readme/i.test(source)) {
      const section = text.match(/^#{1,6}\s+[^\n]*license[^\n]*\n([\s\S]*?)(?=^#{1,6}\s|\z)/im)
      if (section) {
        const notice = section[0].trim()
        const digest = createHash('sha256').update(notice).digest('hex')
        if (!found.has(digest)) found.set(digest, { name: `EMBEDDED:${source}#license`, text: notice })
      }
    }
  }
  return [...found.values()]
}

const packages = [...packagePaths].map((packagePath) => {
  const manifest = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'))
  const noticeFiles = readdirSync(packagePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenseFilePattern.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      text: readFileSync(join(packagePath, entry.name), 'utf8').replace(/\r\n/g, '\n').trim(),
    }))
    .filter((entry) => entry.text.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    name: manifest.name,
    version: manifest.version,
    license: typeof manifest.license === 'string' ? manifest.license : JSON.stringify(manifest.license ?? 'UNDECLARED'),
    author: typeof manifest.author === 'string' ? manifest.author : manifest.author?.name ?? '',
    homepage: manifest.homepage ?? (typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url) ?? '',
    packagePath,
    bundledNoticeCount: noticeFiles.length,
    noticeFiles,
  }
}).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))

const apacheFallback = packages
  .filter((dependency) => dependency.license === 'Apache-2.0')
  .flatMap((dependency) => dependency.noticeFiles)
  .filter((notice) => notice.text.startsWith('Apache License'))
  .sort((a, b) => a.text.length - b.text.length)[0]?.text

for (const dependency of packages) {
  if (dependency.noticeFiles.length > 0) continue
  const identity = `${dependency.name}@${dependency.version}`
  if (identity === 'pmtiles@4.5.0') {
    dependency.noticeFiles.push({name:'UPSTREAM:protomaps/PMTiles/LICENSE',text:readFileSync(join(projectRoot,'public/assets/licenses/upstream/pmtiles-LICENSE.txt'),'utf8').trim()});
  }
  dependency.noticeFiles.push(...extractEmbeddedNotices(dependency.packagePath))

  if (dependency.license === 'MIT') {
    const attribution = exactCopyright.get(identity)
      ?? `Package attribution from installed manifest: ${dependency.author || 'no author field supplied'}`
    dependency.noticeFiles.push({
      name: 'DECLARED-LICENSE-FALLBACK:MIT',
      text: `MIT License\n\n${attribution}\n\n${MIT_BODY}`,
    })
  } else if (dependency.license === 'Apache-2.0' && apacheFallback) {
    dependency.noticeFiles.push({ name: 'DECLARED-LICENSE-FALLBACK:Apache-2.0', text: apacheFallback })
  } else if (dependency.noticeFiles.length === 0 && /gsap\.com\/standard-license/i.test(dependency.license)) {
    dependency.noticeFiles.push({
      name: 'EXTERNAL-LICENSE-DECLARATION',
      text: `Package: ${identity}\nDeclared license: ${dependency.license}\nCopyright owner: GreenSock\nCurrent controlling terms: https://gsap.com/standard-license`,
    })
  }
}

const noticeGroups = new Map()
const missingTopLevel = []
const unresolved = []
for (const dependency of packages) {
  if (dependency.bundledNoticeCount === 0) missingTopLevel.push(`${dependency.name}@${dependency.version}`)
  if (dependency.noticeFiles.length === 0) unresolved.push(`${dependency.name}@${dependency.version}`)
  for (const notice of dependency.noticeFiles) {
    const digest = createHash('sha256').update(notice.text).digest('hex')
    const group = noticeGroups.get(digest) ?? { text: notice.text, files: new Set(), packages: new Set() }
    group.files.add(notice.name)
    group.packages.add(`${dependency.name}@${dependency.version}`)
    noticeGroups.set(digest, group)
  }
}

const lines = [
  '# Third-party production dependency notices',
  '',
  'This file is generated from the installed production dependency graph reported by `npm ls --omit=dev --all --parseable`.',
  'Every top-level LICENSE, COPYING, and NOTICE file shipped in those package directories is reproduced below. Identical texts are deduplicated byte-for-byte after newline normalization, while their package associations are retained.',
  '',
  `- Production packages archived: ${packages.length}`,
  `- Distinct license/notice texts: ${noticeGroups.size}`,
  `- Packages without a bundled top-level license/notice file: ${missingTopLevel.length}`,
  `- Unresolved package notice records: ${unresolved.length}`,
  '',
  'For packages whose npm tarball omits a top-level notice, the archive records embedded source notices plus the complete terms named by the manifest when they are a standard SPDX license. GSAP embeds its copyright and points to live external terms; release owners must still review those current terms for the intended use. Re-run `npm run licenses:generate` after dependency changes.',
  '',
  '## Production package inventory',
  '',
  '| Package | Declared license | Source | Archived notice sources |',
  '| --- | --- | --- | --- |',
]

for (const dependency of packages) {
  const identity = `${dependency.name}@${dependency.version}`.replaceAll('|', '\\|')
  const declared = dependency.license.replaceAll('|', '\\|')
  const source = dependency.homepage
    ? `[link](${String(dependency.homepage).replace(/^git\+/, '').replace(/\.git$/, '')})`
    : '—'
  const files = dependency.noticeFiles.map((entry) => `\`${entry.name}\``).join(', ') || '**MISSING**'
  lines.push(`| ${identity} | ${declared} | ${source} | ${files} |`)
}

if (missingTopLevel.length > 0) {
  lines.push('', '## Packages resolved without a top-level notice file', '')
  lines.push('These installed npm package directories omit a top-level LICENSE, COPYING, or NOTICE file. Their inventory rows identify the archived embedded or declared-license fallback used here:')
  lines.push('', ...missingTopLevel.map((identity) => `- ${identity}`))
}

if (unresolved.length > 0) {
  lines.push('', '## Unresolved package notices', '', ...unresolved.map((identity) => `- ${identity}`))
}

const sortedGroups = [...noticeGroups.entries()].sort(([, a], [, b]) => {
  const firstA = [...a.packages].sort()[0]
  const firstB = [...b.packages].sort()[0]
  return firstA.localeCompare(firstB)
})

for (const [index, [digest, group]] of sortedGroups.entries()) {
  lines.push(
    '',
    `## Notice ${String(index + 1).padStart(2, '0')} — ${[...group.files].sort().join(', ')}`,
    '',
    `Packages: ${[...group.packages].sort().join(', ')}`,
    '',
    `SHA-256: \`${digest}\``,
    '',
    '````text',
    group.text,
    '````',
  )
}

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(`Archived ${packages.length} production packages and ${noticeGroups.size} distinct notice texts.`)
if (unresolved.length > 0) {
  console.error(`Unresolved package notices: ${unresolved.join(', ')}`)
  process.exitCode = 1
}
