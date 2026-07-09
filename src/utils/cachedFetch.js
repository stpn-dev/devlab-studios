const jsonCache = new Map()

export async function fetchJsonOnce(url) {
  if (!jsonCache.has(url)) {
    jsonCache.set(
      url,
      fetch(url).then(async (response) => {
        if (!response.ok) return null
        return response.json()
      }).catch(() => null),
    )
  }

  return jsonCache.get(url)
}
