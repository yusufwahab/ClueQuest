/** Where an exam is in its life, from its schedule and whether the host closed it. */
export type ExamPhase = { label: 'Scheduled' | 'Open' | 'Closed'; tone: string };

export function examPhase(a: { status: string; opensAt?: string | null; closesAt?: string | null }): ExamPhase {
  const now = Date.now();
  if (a.status !== 'open' || (a.closesAt && now > new Date(a.closesAt).getTime())) return { label: 'Closed', tone: 'bg-warn-soft! text-warn!' };
  if (a.opensAt && now < new Date(a.opensAt).getTime()) return { label: 'Scheduled', tone: 'bg-primary-soft text-primary' };
  return { label: 'Open', tone: 'bg-accent-soft! text-[#0b7a5a]!' };
}
