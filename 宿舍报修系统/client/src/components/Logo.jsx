/* 宿舍报修系统徽标：深蓝渐变圆角底 + 宿舍双楼剪影 + 维修齿轮 */
const TEETH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export default function Logo({ size = 64, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="宿舍报修系统徽标"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="dorm-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="52%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#0b1e4a" />
        </linearGradient>
      </defs>

      {/* 圆角徽章底与浅蓝描边 */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#dorm-logo-gradient)" />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="15.25"
        fill="none"
        stroke="rgba(191, 219, 254, 0.4)"
        strokeWidth="1.5"
      />

      {/* 左侧矮楼与窗户 */}
      <rect x="12" y="25" width="13" height="25" rx="2" fill="#ffffff" opacity="0.92" />
      <g fill="#1d4ed8">
        <rect x="14.6" y="28.6" width="3.4" height="4.2" rx="1" />
        <rect x="19.4" y="28.6" width="3.4" height="4.2" rx="1" />
        <rect x="14.6" y="34.6" width="3.4" height="4.2" rx="1" />
        <rect x="19.4" y="34.6" width="3.4" height="4.2" rx="1" />
        <rect x="14.6" y="40.6" width="3.4" height="4.2" rx="1" />
        <rect x="19.4" y="40.6" width="3.4" height="4.2" rx="1" />
      </g>

      {/* 右侧主楼、窗户与门 */}
      <rect x="29" y="13" width="16" height="37" rx="2" fill="#ffffff" />
      <g fill="#1d4ed8">
        <rect x="31.6" y="16.4" width="4" height="4.4" rx="1" />
        <rect x="38.4" y="16.4" width="4" height="4.4" rx="1" />
        <rect x="31.6" y="22.6" width="4" height="4.4" rx="1" />
        <rect x="38.4" y="22.6" width="4" height="4.4" rx="1" />
        <rect x="31.6" y="28.8" width="4" height="4.4" rx="1" />
        <rect x="38.4" y="28.8" width="4" height="4.4" rx="1" />
        <rect x="31.6" y="35" width="4" height="4.4" rx="1" />
        <rect x="38.4" y="35" width="4" height="4.4" rx="1" />
      </g>
      <rect x="31" y="44" width="5" height="6" rx="1.2" fill="#93c5fd" />

      {/* 右下角维修齿轮（深蓝底座 + 白色齿轮） */}
      <g transform="translate(48 48)">
        <circle r="12.4" fill="#0b1e4a" />
        <g fill="#ffffff">
          {TEETH_ANGLES.map((angle) => (
            <rect
              key={angle}
              x="-2.1"
              y="-11.6"
              width="4.2"
              height="6"
              rx="1.8"
              transform={`rotate(${angle})`}
            />
          ))}
          <circle r="8" />
        </g>
        <circle r="3.5" fill="#0b1e4a" />
      </g>
    </svg>
  );
}
