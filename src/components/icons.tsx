import type { ReactNode } from "react";

// Small stroke icons sized by CSS; all are decorative.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

export function MenuIcon() {
  return (
    <Icon>
      <path d="M3 5h14M3 10h14M3 15h14" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M5 5l10 10M15 5L5 15" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon>
      <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" />
    </Icon>
  );
}

export function SunIcon() {
  return (
    <Icon>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M4 16l1.4-1.4M14.6 5.4L16 4" />
    </Icon>
  );
}

export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="M12.5 4.5L7 10l5.5 5.5" />
    </Icon>
  );
}

export function ChevronRightIcon() {
  return (
    <Icon>
      <path d="M7.5 4.5L13 10l-5.5 5.5" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="M5 8l5 5 5-5" />
    </Icon>
  );
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.5 12.5L17 17" />
    </Icon>
  );
}

export function ArrowUpIcon() {
  return (
    <Icon>
      <path d="M10 16V4M5 9l5-5 5 5" />
    </Icon>
  );
}

export function ArrowDownIcon() {
  return (
    <Icon>
      <path d="M10 4v12M5 11l5 5 5-5" />
    </Icon>
  );
}

export function HistoryIcon() {
  return (
    <Icon>
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.5 3.5v3h3M10 6.5V10l2.5 1.5" />
    </Icon>
  );
}

export function PenIcon() {
  return (
    <Icon>
      <path d="M12.5 4.5l3 3L7 16H4v-3l8.5-8.5zM11 6l3 3" />
    </Icon>
  );
}

export function ArchiveIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="14" height="4" rx="1" />
      <path d="M4.5 8v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8M8.5 11h3" />
    </Icon>
  );
}

export function TypeIcon() {
  return (
    <Icon>
      <path d="M3 15l3.5-9 3.5 9M4.3 12h4.4M13 10.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM15 9v6" />
    </Icon>
  );
}

export function LayersIcon() {
  return (
    <Icon>
      <path d="M10 3l7 3.5-7 3.5-7-3.5L10 3zM3 10l7 3.5 7-3.5M3 13.5L10 17l7-3.5" />
    </Icon>
  );
}

export function PulseIcon() {
  return (
    <Icon>
      <path d="M2.5 10h3l2-5 3 10 2-5h5" />
    </Icon>
  );
}

export function ExportIcon() {
  return (
    <Icon>
      <path d="M10 12V3M6.5 6.5L10 3l3.5 3.5M4 11v4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
    </Icon>
  );
}

export function UploadDocumentIcon() {
  return (
    <Icon>
      <path d="M11.5 3H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5L11.5 3zM11.5 3v3.5H15M10 14.5v-5M8 11.5l2-2 2 2" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M10 4v12M4 10h12" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </Icon>
  );
}

export function ChevronUpDownIcon() {
  return (
    <Icon>
      <path d="M6.5 8L10 4.5 13.5 8M6.5 12l3.5 3.5 3.5-3.5" />
    </Icon>
  );
}

export function NoteIcon() {
  return (
    <Icon>
      <path d="M4 4h12v9l-3 3H4V4zM13 16v-3h3M7 8h6M7 11h3.5" />
    </Icon>
  );
}

export function LogoutIcon() {
  return (
    <Icon>
      <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12.5 13.5L16 10l-3.5-3.5M16 10H8" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.5a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6" />
    </Icon>
  );
}

export function EyeIcon() {
  return (
    <Icon>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </Icon>
  );
}

export function EyeOffIcon() {
  return (
    <Icon>
      <path d="M3 3l14 14M8.2 5a8 8 0 0 1 1.8-.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.4 3M12 15.2a7.5 7.5 0 0 1-2 .3c-5 0-8-5.5-8-5.5a14 14 0 0 1 3.1-3.6M8.3 8.3a2.5 2.5 0 0 0 3.4 3.4" />
    </Icon>
  );
}

export function LockIcon() {
  return (
    <Icon>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </Icon>
  );
}

export function HelpIcon() {
  return (
    <Icon>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.3M10 14.4v.1" />
    </Icon>
  );
}

export function BookIcon() {
  return (
    <Icon>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5v-12zM4 16.5A1.5 1.5 0 0 0 5.5 18H16v-3M7 6.5h6" />
    </Icon>
  );
}

export function CompassIcon() {
  return (
    <Icon>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M12.8 7.2l-1.6 4-4 1.6 1.6-4 4-1.6z" />
    </Icon>
  );
}

export function GoogleDocIcon() {
  return (
    <Icon>
      <path d="M11.5 3H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5L11.5 3zM11.5 3v3.5H15M7.5 10h5M7.5 12.5h5M7.5 15h3" />
    </Icon>
  );
}
