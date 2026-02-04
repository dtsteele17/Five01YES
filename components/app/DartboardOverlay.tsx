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
  // Trimmed PNG: board circle diameter = container size, center = container center
  // Normalized coords (-1..1) map directly to pixels
  const normalizedToPixel = (coord: number, size: number): number => {
    return (coord * 0.5 + 0.5) * size;
  };

  const boardUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/PNG%20DARTBOARD.png`;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: '1/1' }}>
      <div className="relative w-full h-full">
        {/* Trimmed dartboard PNG fills the square container */}
        <img
          src={boardUrl}
          alt="Dartboard"
          className="w-full h-full"
          style={{
            objectFit: 'contain',
            width: '100%',
            height: '100%',
          }}
        />

        {/* Hit marker overlay layer */}
        <div className="absolute inset-0 pointer-events-none">
          {hits.map((hit, index) => {
            const containerSize = 100;

            if (hit.offboard) {
              // Offboard hits: project to edge with X marker
              const angle = Math.atan2(hit.y, hit.x);
              const edgeX = 1.15 * Math.cos(angle);
              const edgeY = 1.15 * Math.sin(angle);

              const pixelX = normalizedToPixel(edgeX, containerSize);
              const pixelY = normalizedToPixel(edgeY, containerSize);

              return (
                <div
                  key={`hit-${index}`}
                  className="absolute animate-pulse"
                  style={{
                    left: `${pixelX}%`,
                    top: `${pixelY}%`,
                    transform: 'translate(-50%, -50%)',
                    animation: 'fadeOut 2s ease-out forwards',
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

            // On-board hits: map directly to dartboard position
            const pixelX = normalizedToPixel(hit.x, containerSize);
            const pixelY = normalizedToPixel(hit.y, containerSize);

            return (
              <div
                key={`hit-${index}`}
                className="absolute"
                style={{
                  left: `${pixelX}%`,
                  top: `${pixelY}%`,
                  transform: 'translate(-50%, -50%)',
                  animation: 'fadeOut 2s ease-out forwards',
                }}
              >
                <div className="relative">
                  {/* Golden dart hit marker */}
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

      <style jsx>{`
        @keyframes fadeOut {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translate(-50%, -50%) scale(1.1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
        }
      `}</style>
    </div>
  );
}
