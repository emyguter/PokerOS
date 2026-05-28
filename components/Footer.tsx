
export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3 text-gold/40 text-lg tracking-widest">
        <span>♠</span>
        <span>♥</span>
        <span>♦</span>
        <span>♣</span>
      </div>
      <p className="text-xs text-white/20 italic tracking-wide">
        From game data to financial settlements — automatically.
      </p>
    </footer>
  )
}
