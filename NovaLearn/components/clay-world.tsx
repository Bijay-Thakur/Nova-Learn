export function ClayWorld() {
  return (
    <div className="clay-world" aria-hidden="true">
      <span className="clay-orb clay-orb-blue" />
      <span className="clay-orb clay-orb-lavender" />
      <span className="clay-orb clay-orb-mint" />
      <span className="clay-orb clay-orb-cream" />
      <span className="clay-ring" />
      <span className="clay-chip clay-chip-a" />
      <span className="clay-chip clay-chip-b" />
      <span className="clay-mug" />
      <span className="clay-limb clay-limb-left">
        <span className="clay-sleeve" />
        <span className="clay-finger" />
      </span>
      <span className="clay-limb clay-limb-right">
        <span className="clay-sleeve" />
        <span className="clay-finger" />
      </span>
    </div>
  );
}
