import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Language } from '../packages/engine/catalog'
import { mountTitlebar } from './native-window'

export interface EditorNative {
  titlebar(language: () => Language): void
  save(name: string, bytes: ArrayBuffer): Promise<boolean>
  onDrop(open: (file: File) => Promise<void>, onError: () => void): void
}

export const native: EditorNative | undefined = isTauri() ? {
  titlebar: mountTitlebar,
  save(name, bytes) {
    const header = new TextEncoder().encode(JSON.stringify(name) + '\n')
    const payload = new Uint8Array(header.length + bytes.byteLength)
    payload.set(header)
    payload.set(new Uint8Array(bytes), header.length)
    return invoke<boolean>('save_editor_pdf', payload)
  },
  onDrop(open, onError) {
    void listen<{ id: number | null; entries: { name: string }[] }>('versa-drag-drop', async event => {
      const { id, entries } = event.payload
      const first = entries[0]
      if (id === null || !first) return
      try {
        const bytes = await invoke<ArrayBuffer>('read_file', { id, index: 0 })
        await open(new File([bytes], first.name))
      } catch { onError() }
    }, { target: { kind: 'Window', label: 'main' } }).catch(() => {})
  },
} : undefined
