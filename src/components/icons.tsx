import React from 'react'

const I = ({ children, size = 18 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const IconSearch = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </I>
)
export const IconPlay = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" />
  </svg>
)
export const IconPause = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1.2" />
    <rect x="14" y="4" width="4" height="16" rx="1.2" />
  </svg>
)
export const IconBack = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="m15 18-6-6 6-6" />
  </I>
)
export const IconPrev = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="m11 17-5-5 5-5" />
    <path d="m18 17-5-5 5-5" />
  </I>
)
export const IconNext = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="m6 17 5-5-5-5" />
    <path d="m13 17 5-5-5-5" />
  </I>
)
export const IconPlus = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M12 5v14M5 12h14" />
  </I>
)
export const IconLink = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </I>
)
export const IconFile = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </I>
)
export const IconText = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M4 7V5h16v2M9 20h6M12 5v15" />
  </I>
)
export const IconChart = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M3 3v18h18" />
    <path d="M7 15v-4M12 15V7M17 15v-7" />
  </I>
)
export const IconGear = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
  </I>
)
export const IconDots = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
)
export const IconX = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </I>
)
export const IconCheck = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M20 6 9 17l-5-5" />
  </I>
)
export const IconBook = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22H20v-2.5" />
  </I>
)
export const IconTrash = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </I>
)
export const IconArchive = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
  </I>
)
export const IconEye = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </I>
)
export const IconSpeaker = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8" />
  </I>
)
export const IconLogout = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </I>
)
export const IconFlame = ({ size = 18 }: { size?: number }) => (
  <I size={size}>
    <path d="M12 22c4.4 0 8-3.6 8-8 0-5-4-8-5.5-11C13 6 10 6.5 10 10c-1.5-1-2-2.5-2-4.5C5.5 8 4 10.5 4 14c0 4.4 3.6 8 8 8Z" />
  </I>
)
export const IconZap = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
  </I>
)
export const IconLayers = ({ size = 16 }: { size?: number }) => (
  <I size={size}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
  </I>
)
