/** Etiqueta discreta com a versão do build (hash do commit), para saber que versão está a correr no iPad. */
export function versionLabel(version = __APP_VERSION__): string {
  return `v ${version}`;
}

export function VersionTag() {
  return <div className="version-tag" aria-hidden="true">{versionLabel()}</div>;
}
