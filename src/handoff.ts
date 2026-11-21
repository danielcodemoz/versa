// Passes one file from the home page to the editor through IndexedDB.
// The bytes stay in this browser profile and are deleted as soon as the editor reads them.
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('versa-handoff', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('files')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(database.transaction('files', mode).objectStore('files'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export const handOff = (file: File) => transact('readwrite', store => store.put(file, 'next')).then(() => undefined)

export async function takeHandOff() {
  try {
    const file = await transact<unknown>('readonly', store => store.get('next'))
    await transact('readwrite', store => store.delete('next'))
    return file instanceof Blob ? new File([file], (file as File).name || 'documento.pdf', { type: file.type }) : undefined
  } catch {
    return undefined
  }
}
