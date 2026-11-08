import { useWhatsappLink } from '../lib/config';

/** Shown after a game: invites the player to the host organisation's WhatsApp group. Renders nothing when no link is set. */
export default function WhatsAppPrompt() {
  const link = useWhatsappLink();
  if (!link) return null;
  return (
    <section aria-label="Join our WhatsApp group" className="animate-rise flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-[#128c7e] to-[#25d366] p-5 text-center text-white shadow-[0_18px_40px_-24px_rgba(18,140,126,0.9)] sm:flex-row sm:text-left">
      <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.07-.1-.23-.16-.48-.28z" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl text-white">Join our WhatsApp group</h2>
        <p className="text-sm font-semibold text-white/90">Keep the fun going: news, new quizzes and the next game, straight to your phone.</p>
      </div>
      <a href={link} target="_blank" rel="noopener noreferrer" className="btn min-h-12 shrink-0 rounded-full bg-white px-6 text-lg text-[#0b6b5f] hover:bg-white/90">Join the group</a>
    </section>
  );
}
