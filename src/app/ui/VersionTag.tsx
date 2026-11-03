/** Etiqueta discreta com a versão do build, para saber que versão está a correr no iPad. */
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Lisbon' });

/** Ex.: "v d1a126f · 3 nov 19:55" (hora de Lisboa). */
export function versionLabel(version = __APP_VERSION__, built = __APP_BUILT__): string {
  const d = new Date(built);
  if (Number.isNaN(d.getTime())) return `v ${version}`;
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `v ${version} · ${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.hour}:${p.minute}`;
}

export function VersionTag() {
  return <div className="version-tag" aria-hidden="true">{versionLabel()}</div>;
}
