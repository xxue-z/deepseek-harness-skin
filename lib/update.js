/**
 * Update check against the project's GitHub releases.
 *
 * The plugin ships as source (a bundle the profile links to), so there is no
 * build artifact to download: a release is a git tag plus a Release note. This
 * module only answers "is there something newer than what is installed", which
 * the settings page shows next to the version.
 *
 * The installed version comes from the package's own `package.json`, and the
 * comparison is a plain dotted-number compare — no semver dependency, because
 * the tags this project publishes are `vMAJOR.MINOR.PATCH` (+ optional `-pre`).
 */
import { readFileSync } from 'node:fs'

const DEFAULT_REPOSITORY = 'xxue-z/deepseek-harness-skin'
const DEFAULT_BRANCH = 'master'
const TIMEOUT_MS = 6000

/** Read the plugin's version from its own manifest. */
export function readVersion(packageFile) {
  try {
    const manifest = JSON.parse(readFileSync(packageFile, 'utf8').replace(/^\uFEFF/, ''))
    return typeof manifest.version === 'string' && manifest.version.trim() !== '' ? manifest.version.trim() : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Split `1.0.2` / `v1.0.2` / `1.0.2-rc.1` into comparable parts. */
export function parseVersion(input) {
  const text = String(input ?? '')
    .trim()
    .replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(text)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? null }
}

/**
 * Compare two versions.
 * @returns {number} negative when `left` is older, positive when newer, 0 when equal.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) return 0
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  // A pre-release is older than its final release.
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : 1
}

/** Pick the release's bundle and checksum assets, when the release has them. */
function releaseAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const bundle = assets.find((asset) => typeof asset?.name === 'string' && asset.name.endsWith('.tar.gz'))
  const checksum = assets.find((asset) => typeof asset?.name === 'string' && asset.name.endsWith('.sha256'))
  return {
    asset: bundle
      ? {
          name: bundle.name,
          size: Number.isFinite(bundle.size) ? bundle.size : null,
          url: typeof bundle.browser_download_url === 'string' ? bundle.browser_download_url : null,
        }
      : null,
    checksum:
      checksum && typeof checksum.browser_download_url === 'string'
        ? { name: checksum.name, url: checksum.browser_download_url }
        : null,
  }
}

async function fetchJson(url, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'deepseek-harness-skin-update-check' },
    })
    // 404 is a real answer: the repository exists but has no releases yet.
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ask GitHub for the newest release.
 *
 * @param {{ version: string, repository?: string, branch?: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{
 *   current: string,
 *   latest: string | null,
 *   updateAvailable: boolean,
 *   mode: 'release' | 'tag' | 'branch' | 'manual',
 *   tag: string | null,
 *   url: string,
 *   notes: string,
 *   publishedAt: string | null,
 *   autoUpdate: boolean,
 *   error: string | null,
 * }>}
 */
export async function checkForUpdate(options) {
  const current = typeof options.version === 'string' ? options.version : '0.0.0'
  const repository = options.repository && /^[\w.-]+\/[\w.-]+$/.test(options.repository) ? options.repository : DEFAULT_REPOSITORY
  const branch = typeof options.branch === 'string' && options.branch !== '' ? options.branch : DEFAULT_BRANCH
  const base = {
    current,
    latest: null,
    updateAvailable: false,
    mode: 'manual',
    tag: null,
    url: `https://github.com/${repository}`,
    notes: '',
    publishedAt: null,
    // The plugin is installed from source, so "update" means "pull the tag or
    // reinstall the bundle"; nothing is replaced behind the user's back.
    autoUpdate: false,
    asset: null,
    checksum: null,
    error: null,
  }
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  try {
    const release = await fetchJson(`https://api.github.com/repos/${repository}/releases/latest`, fetchImpl)
    if (release && typeof release.tag_name === 'string') {
      const latest = release.tag_name.replace(/^v/i, '')
      return {
        ...base,
        latest,
        tag: release.tag_name,
        url: typeof release.html_url === 'string' ? release.html_url : base.url,
        notes: typeof release.body === 'string' ? release.body : '',
        publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
        updateAvailable: compareVersions(latest, current) > 0,
        mode: 'release',
        // The workflow uploads `<name>-vX.Y.Z.tar.gz` (+ .sha256); the page
        // installs that asset directly instead of shoehorning it through the
        // gateway's raw request.
        ...releaseAsset(release),
      }
    }
    // No Release object: fall back to the newest tag, then to the branch head.
    const tags = await fetchJson(`https://api.github.com/repos/${repository}/tags?per_page=1`, fetchImpl)
    if (Array.isArray(tags) && tags.length > 0 && typeof tags[0]?.name === 'string') {
      const latest = tags[0].name.replace(/^v/i, '')
      return {
        ...base,
        latest,
        tag: tags[0].name,
        updateAvailable: compareVersions(latest, current) > 0,
        mode: 'tag',
      }
    }
    const head = await fetchJson(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`, fetchImpl)
    if (head && typeof head.sha === 'string') {
      return { ...base, latest: null, mode: 'branch', url: `https://github.com/${repository}/commits/${branch}` }
    }
    return base
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) }
  }
}