import { useState } from 'react';

interface BrandMarkProps {
  brandName: string;
  brandLogoUrl: string | null;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
}

export function BrandMark({
  brandName,
  brandLogoUrl,
  onClick,
  size = 'md',
  theme = 'light',
}: BrandMarkProps) {
  const [imgError, setImgError] = useState(false);

  const imgDimension =
    size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const textClass =
    size === 'sm'
      ? 'text-base font-bold tracking-tight'
      : size === 'lg'
        ? 'text-xl font-bold tracking-tight'
        : 'text-lg font-bold tracking-tight';

  const initials =
    brandName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'PP';

  const wordmarkColor = theme === 'dark' ? 'text-white' : 'text-[#151515]';
  const badgeBg =
    theme === 'dark'
      ? 'bg-[#FE0A8C] text-white'
      : 'bg-[#151515] text-white';

  const content = (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      {brandLogoUrl && !imgError ? (
        <img
          src={brandLogoUrl}
          alt={`Logo ${brandName}`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${imgDimension} rounded-md object-contain bg-white border border-neutral-200 shrink-0`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`${imgDimension} rounded-md ${badgeBg} font-display font-bold text-xs inline-flex items-center justify-center shrink-0 tracking-wider`}
        >
          {initials}
        </span>
      )}
      <span
        className={`${textClass} font-display ${wordmarkColor} whitespace-nowrap truncate max-w-[220px] sm:max-w-[280px]`}
      >
        {brandName}
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE0A8C] rounded-md py-0.5 shrink-0 cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return content;
}
