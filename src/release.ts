import release from '../downloads/windows-release.json' with { type: 'json' }
import type { Language } from '../packages/engine/catalog'

export const releases = 'https://github.com/danielcodemoz/versa/releases'
export const version = release.version
export const exeName = `Versa-Setup-${version}.exe`
export const installerPath = `/downloads/${exeName}/`
export const releaseFiles = `${releases}/download/v${version}`
export const sizeInMB = (format: 'exe' | 'msi', language: Language) =>
  new Intl.NumberFormat(language === 'pt' ? 'pt-MZ' : 'en', { maximumFractionDigits: 1 }).format(release[format === 'exe' ? 'exeBytes' : 'msiBytes'] / 1_000_000) + ' MB'
