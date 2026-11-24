'use client';
import type { ComponentType, SVGProps } from 'react';
import {
  IconActivity, IconAdjustmentsHorizontal, IconArrowUpRight, IconBox, IconCheck,
  IconChevronDown, IconChevronLeft, IconChevronRight, IconCode, IconCommand, IconCopy,
  IconCpu, IconDeviceSdCard, IconExternalLink, IconFingerprint, IconHeartbeat, IconHistory,
  IconLink, IconLogout, IconMenu2, IconMoon, IconNetwork, IconPencil, IconPlug, IconPlus,
  IconPower, IconRefresh, IconRoute, IconSearch, IconServer, IconSun, IconTerminal2,
  IconTrash, IconUpload, IconUsers, IconX,
  IconAlertTriangleFilled, IconBellFilled, IconBoltFilled, IconCircleCheckFilled,
  IconCircleXFilled, IconClockFilled, IconDatabaseFilled, IconDownloadFilled, IconEyeFilled,
  IconFileFilled, IconFilterFilled, IconGaugeFilled, IconInfoCircleFilled, IconKeyFilled,
  IconLayoutGridFilled, IconListFilled, IconLockFilled, IconPlayerPlayFilled,
  IconSettingsFilled, IconShieldCheckFilled, IconSparklesFilled, IconWorldFilled,
} from '@tabler/icons-react';
import type { IconName } from './icons-default';

const map: Record<IconName, ComponentType<any>> = {
  grid: IconLayoutGridFilled,
  users: IconUsers,
  server: IconServer,
  plug: IconPlug,
  globe: IconWorldFilled,
  route: IconRoute,
  bell: IconBellFilled,
  settings: IconSettingsFilled,
  search: IconSearch,
  sun: IconSun,
  moon: IconMoon,
  logout: IconLogout,
  menu: IconMenu2,
  close: IconX,
  plus: IconPlus,
  edit: IconPencil,
  trash: IconTrash,
  refresh: IconRefresh,
  history: IconHistory,
  play: IconPlayerPlayFilled,
  check: IconCheck,
  chevronLeft: IconChevronLeft,
  chevronRight: IconChevronRight,
  chevronDown: IconChevronDown,
  copy: IconCopy,
  external: IconExternalLink,
  key: IconKeyFilled,
  activity: IconActivity,
  cpu: IconCpu,
  memory: IconDeviceSdCard,
  network: IconNetwork,
  arrowUpRight: IconArrowUpRight,
  zap: IconBoltFilled,
  shield: IconShieldCheckFilled,
  database: IconDatabaseFilled,
  terminal: IconTerminal2,
  code: IconCode,
  filter: IconFilterFilled,
  info: IconInfoCircleFilled,
  alert: IconAlertTriangleFilled,
  clock: IconClockFilled,
  link: IconLink,
  download: IconDownloadFilled,
  upload: IconUpload,
  power: IconPower,
  lock: IconLockFilled,
  eye: IconEyeFilled,
  sparkles: IconSparklesFilled,
  gauge: IconGaugeFilled,
  list: IconListFilled,
  box: IconBox,
  pulse: IconHeartbeat,
  checkCircle: IconCircleCheckFilled,
  xCircle: IconCircleXFilled,
  file: IconFileFilled,
  sliders: IconAdjustmentsHorizontal,
  command: IconCommand,
  fingerprint: IconFingerprint,
};

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 18, className, ...props }: IconProps) {
  const Component = map[name] || IconBox;
  return (
    <Component
      size={size}
      strokeWidth={2}
      className={['icon-bright', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      {...props}
    />
  );
}
