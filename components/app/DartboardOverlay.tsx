'use client';

import React from 'react';

export interface DartHit {
  x: number;
  y: number;
  label: string;
  offboard?: boolean;
}

interface DartboardOverlayProps {
  hits?: DartHit[];
  className?: string;
}

export function DartboardOverlay({ hits = [], className = '' }: DartboardOverlayProps) {
  const normalizedToPixel = (coord: number, size: number): number => {
    return ((coord + 1.2) / 2.4) * size;
  };

  const boardUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/PNG%20DARTBOARD.png`;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: '1/1' }}>
      <div className="relative w-full h-full">
        <img
          src={boardUrl}
          alt="Dartboard"
          className="w-full h-full rounded-full"
          style={{ objectFit: 'contain' }}
        />

        <div className="absolute inset-0">
          {hits.map((hit, index) => {
            const containerSize = 100;

            if (hit.offboard) {
              const angle = Math.atan2(hit.y, hit.x);
              const edgeX = 1.15 * Math.cos(angle);
              const edgeY = 1.15 * Math.sin(angle);

              const pixelX = normalizedToPixel(edgeX, containerSize);
              const pixelY = normalizedToPixel(edgeY, containerSize);

              return (
                <div
                  key={`hit-${index}`}
                  className="absolute animate-fade-in"
                  style={{
                    left: `${pixelX}%`,
                    top: `${pixelY}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="relative w-6 h-6">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <line
                          x1="6"
                          y1="6"
                          x2="18"
                          y2="18"
                          stroke="#ff4444"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <line
                          x1="6"
                          y1="18"
                          x2="18"
                          y2="6"
                          stroke="#ff4444"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            }

            const pixelX = normalizedToPixel(hit.x, containerSize);
            const pixelY = normalizedToPixel(hit.y, containerSize);

            return (
              <div
                key={`hit-${index}`}
                className="absolute animate-fade-in"
                style={{
                  left: `${pixelX}%`,
                  top: `${pixelY}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="relative">
                  <div
                    className="rounded-full border-2 shadow-lg"
                    style={{
                      width: '14px',
                      height: '14px',
                      backgroundColor: '#FFD700',
                      borderColor: '#FFA500',
                    }}
                  >
                    <div
                      className="rounded-full absolute inset-0 m-auto"
                      style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: '#FFA500',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
