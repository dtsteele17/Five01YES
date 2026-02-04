'use client';

import React from 'react';

export interface DartHit {
  x: number;
  y: number;
  label: string;
  offboard?: boolean;
}

interface DartboardSVGProps {
  hits?: DartHit[];
  className?: string;
}

const DARTBOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const COLORS = {
  black: '#000000',
  cream: '#F4E8D0',
  red: '#DC143C',
  green: '#228B22',
  wire: '#C0C0C0',
  bull: '#DC143C',
  outerBull: '#228B22',
};

export function DartboardSVG({ hits = [], className = '' }: DartboardSVGProps) {
  const viewBox = '-1.2 -1.2 2.4 2.4';

  const renderWedge = (index: number, isDouble: boolean, isTriple: boolean) => {
    const number = DARTBOARD_NUMBERS[index];
    const angleStart = (index * 18 - 9) * (Math.PI / 180);
    const angleEnd = ((index + 1) * 18 - 9) * (Math.PI / 180);

    const outerRadius = 1.0;
    const tripleOuterRadius = 0.65;
    const tripleInnerRadius = 0.55;
    const doubleOuterRadius = outerRadius;
    const doubleInnerRadius = 0.88;
    const singleOuterRadius = 0.88;
    const singleInnerRadius = 0.65;
    const singleMiddleRadius = 0.3;

    let innerRadius: number;
    let outerR: number;
    let color: string;

    if (isDouble) {
      innerRadius = doubleInnerRadius;
      outerR = doubleOuterRadius;
      color = index % 2 === 0 ? COLORS.red : COLORS.green;
    } else if (isTriple) {
      innerRadius = tripleInnerRadius;
      outerR = tripleOuterRadius;
      color = index % 2 === 0 ? COLORS.red : COLORS.green;
    } else {
      innerRadius = singleInnerRadius;
      outerR = singleOuterRadius;
      color = index % 2 === 0 ? COLORS.black : COLORS.cream;
    }

    const x1 = innerRadius * Math.cos(angleStart);
    const y1 = innerRadius * Math.sin(angleStart);
    const x2 = outerR * Math.cos(angleStart);
    const y2 = outerR * Math.sin(angleStart);
    const x3 = outerR * Math.cos(angleEnd);
    const y3 = outerR * Math.sin(angleEnd);
    const x4 = innerRadius * Math.cos(angleEnd);
    const y4 = innerRadius * Math.sin(angleEnd);

    const largeArcFlag = 0;

    const pathData = `
      M ${x1},${y1}
      L ${x2},${y2}
      A ${outerR},${outerR} 0 ${largeArcFlag} 1 ${x3},${y3}
      L ${x4},${y4}
      A ${innerRadius},${innerRadius} 0 ${largeArcFlag} 0 ${x1},${y1}
      Z
    `;

    return (
      <path
        key={`wedge-${isDouble ? 'd' : isTriple ? 't' : 's'}-${index}`}
        d={pathData}
        fill={color}
        stroke={COLORS.wire}
        strokeWidth="0.003"
      />
    );
  };

  const renderInnerSingles = (index: number) => {
    const angleStart = (index * 18 - 9) * (Math.PI / 180);
    const angleEnd = ((index + 1) * 18 - 9) * (Math.PI / 180);

    const innerRadius = 0.3;
    const outerR = 0.55;
    const color = index % 2 === 0 ? COLORS.black : COLORS.cream;

    const x1 = innerRadius * Math.cos(angleStart);
    const y1 = innerRadius * Math.sin(angleStart);
    const x2 = outerR * Math.cos(angleStart);
    const y2 = outerR * Math.sin(angleStart);
    const x3 = outerR * Math.cos(angleEnd);
    const y3 = outerR * Math.sin(angleEnd);
    const x4 = innerRadius * Math.cos(angleEnd);
    const y4 = innerRadius * Math.sin(angleEnd);

    const pathData = `
      M ${x1},${y1}
      L ${x2},${y2}
      A ${outerR},${outerR} 0 0 1 ${x3},${y3}
      L ${x4},${y4}
      A ${innerRadius},${innerRadius} 0 0 0 ${x1},${y1}
      Z
    `;

    return (
      <path
        key={`inner-single-${index}`}
        d={pathData}
        fill={color}
        stroke={COLORS.wire}
        strokeWidth="0.003"
      />
    );
  };

  const renderNumber = (index: number) => {
    const number = DARTBOARD_NUMBERS[index];
    const angle = index * 18 * (Math.PI / 180);
    const radius = 1.12;

    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    return (
      <text
        key={`number-${index}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize="0.12"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        {number}
      </text>
    );
  };

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: '1/1' }}>
      <svg
        viewBox={viewBox}
        className="w-full h-full"
        style={{ transform: 'rotate(-9deg)' }}
      >
        <circle cx="0" cy="0" r="1.0" fill={COLORS.black} />

        {DARTBOARD_NUMBERS.map((_, index) => (
          <React.Fragment key={`wedge-group-${index}`}>
            {renderWedge(index, true, false)}
            {renderWedge(index, false, true)}
            {renderWedge(index, false, false)}
            {renderInnerSingles(index)}
          </React.Fragment>
        ))}

        <circle cx="0" cy="0" r="0.065" fill={COLORS.bull} stroke={COLORS.wire} strokeWidth="0.003" />
        <circle cx="0" cy="0" r="0.03" fill={COLORS.bull} stroke={COLORS.wire} strokeWidth="0.003" />

        {DARTBOARD_NUMBERS.map((_, index) => {
          const angle = (index * 18 - 9) * (Math.PI / 180);
          return (
            <line
              key={`wire-${index}`}
              x1="0"
              y1="0"
              x2={Math.cos(angle)}
              y2={Math.sin(angle)}
              stroke={COLORS.wire}
              strokeWidth="0.004"
            />
          );
        })}

        <circle cx="0" cy="0" r="1.0" fill="none" stroke={COLORS.wire} strokeWidth="0.006" />
        <circle cx="0" cy="0" r="0.88" fill="none" stroke={COLORS.wire} strokeWidth="0.004" />
        <circle cx="0" cy="0" r="0.65" fill="none" stroke={COLORS.wire} strokeWidth="0.004" />
        <circle cx="0" cy="0" r="0.55" fill="none" stroke={COLORS.wire} strokeWidth="0.004" />
        <circle cx="0" cy="0" r="0.3" fill="none" stroke={COLORS.wire} strokeWidth="0.004" />

        {DARTBOARD_NUMBERS.map((_, index) => renderNumber(index))}

        {hits.map((hit, index) => {
          if (hit.offboard) {
            const edgeX = hit.x > 0 ? 1.15 : hit.x < 0 ? -1.15 : 0;
            const edgeY = hit.y > 0 ? 1.15 : hit.y < 0 ? -1.15 : 0;
            const size = 0.04;
            return (
              <g key={`hit-${index}`} className="animate-fade-in">
                <line
                  x1={edgeX - size}
                  y1={edgeY - size}
                  x2={edgeX + size}
                  y2={edgeY + size}
                  stroke="#ff4444"
                  strokeWidth="0.02"
                  strokeLinecap="round"
                />
                <line
                  x1={edgeX - size}
                  y1={edgeY + size}
                  x2={edgeX + size}
                  y2={edgeY - size}
                  stroke="#ff4444"
                  strokeWidth="0.02"
                  strokeLinecap="round"
                />
              </g>
            );
          }

          return (
            <g key={`hit-${index}`} className="animate-fade-in">
              <circle
                cx={hit.x}
                cy={hit.y}
                r="0.025"
                fill="#FFD700"
                stroke="#FFA500"
                strokeWidth="0.008"
              />
              <circle
                cx={hit.x}
                cy={hit.y}
                r="0.015"
                fill="#FFA500"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
