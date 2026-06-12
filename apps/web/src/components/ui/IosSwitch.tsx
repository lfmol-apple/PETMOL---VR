'use client';

type IosSwitchSize = 'sm' | 'md';

const SIZE_CLASSES: Record<IosSwitchSize, { track: string; thumb: string; translate: string }> = {
  sm: {
    track: 'h-6 w-11 min-h-6 min-w-11 max-h-6 max-w-11',
    thumb: 'h-5 w-5 min-h-5 min-w-5 max-h-5 max-w-5',
    translate: 'translate-x-5',
  },
  md: {
    track: 'h-7 w-12 min-h-7 min-w-12 max-h-7 max-w-12',
    thumb: 'h-6 w-6 min-h-6 min-w-6 max-h-6 max-w-6',
    translate: 'translate-x-5',
  },
};

export function IosSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: IosSwitchSize;
  className?: string;
}) {
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={onChange}
      disabled={disabled}
      className={[
        'relative inline-flex flex-none items-center rounded-full border align-middle touch-manipulation transition-all duration-200 ease-out',
        sizeClasses.track,
        checked
          ? 'border-[#0a63ff] bg-gradient-to-b from-[#3b93ff] via-[#1478ff] to-[#0057d6] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_18px_rgba(0,102,255,0.28)]'
          : 'border-slate-300/80 bg-gradient-to-b from-slate-300 via-slate-200 to-slate-300 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)]',
        disabled ? 'cursor-not-allowed opacity-45' : 'active:scale-[0.97]',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none absolute left-0.5 top-0.5 rounded-full bg-white',
          sizeClasses.thumb,
          checked ? sizeClasses.translate : 'translate-x-0',
          'shadow-[0_1px_2px_rgba(15,23,42,0.18),0_6px_12px_rgba(15,23,42,0.12)] transition-transform duration-200 ease-out',
        ].join(' ')}
      >
        <span className="absolute inset-[1px] rounded-full bg-gradient-to-b from-white to-slate-100" />
      </span>
    </button>
  );
}