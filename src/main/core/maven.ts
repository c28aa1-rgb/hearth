/** `group:artifact:version[:classifier][@ext]` → repository-relative path. */
export function mavenPath(coordinate: string): string {
  let [coords, ext] = coordinate.split('@')
  ext ??= 'jar'
  const [group, artifact, version, classifier] = coords.split(':')
  if (!group || !artifact || !version) throw new Error(`Bad maven coordinate: ${coordinate}`)
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`
  return [...group.split('.'), artifact, version, file].join('/')
}

/** Key used to de-duplicate libraries: group:artifact[:classifier], ignoring version. */
export function libraryKey(coordinate: string): string {
  const [group, artifact, , classifier] = coordinate.split('@')[0].split(':')
  return [group, artifact, classifier].filter(Boolean).join(':')
}
