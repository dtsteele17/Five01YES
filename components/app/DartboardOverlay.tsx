'use client';

import React from 'react';
import { R_BOARD, R_BULL_IN, R_BULL_OUT, R_TREBLE_IN, R_TREBLE_OUT, R_DOUBLE_IN, R_DOUBLE_OUT } from '@/lib/botThrowEngine';

export interface DartHit {
  x: number;
  y: number;
  label: string;
  offboard?: boolean;
}

interface DartboardOverlayProps {
  hits?: DartHit[];
  className?: string;
  showDebugRings?: boolean;
}

export function DartboardOverlay({ hits = [], className = '', showDebugRings = false }: DartboardOverlayProps) {
  // PNG dartboard with black number ring on outside
  // Board is 1.8x bigger on screen for better visibility
  // Calibration rings also scaled to 1.8x (180%) to match PNG
  // Normalized coords (-1..1) map to pixels
  // NOTE: Y-axis flip - bot engine uses Y-up (math coords), CSS uses Y-down (screen coords)
  const normalizedToPixel = (coord: number, size: number): number => {
    return (coord * 0.5 + 0.5) * size;
  };

  // Convert normalized radius to SVG percentage
  // Rings use actual dartboard geometry (1.0x relative to normalized coords)
  const radiusToPercent = (radius: number): number => {
    return radius * 50 * 1.0; // radius 1.0 = 50% of SVG, SVG scaled to 180% in CSS
  };

  const boardUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/PNG%20DARTBOARD.png`;

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: '1/1' }}>
      <div className="relative w-full h-full flex items-center justify-center overflow-visible">
        {/* Dartboard PNG scaled to 1.8x for better visibility */}
        <img
          src={boardUrl}
          alt="Dartboard"
          className="absolute"
          style={{
            objectFit: 'contain',
            width: '180%',
            height: '180%',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Debug rings overlay - Scaled to 180% to match PNG */}
        {false && showDebugRings && (
          <svg
            className="absolute pointer-events-none"
            viewBox="0 0 100 100"
            style={{
              mixBlendMode: 'normal',
              opacity: 0.8,
              width: '180%',
              height: '180%',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Board edge (playable area) - Bright Green dashed */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_BOARD)}
              fill="none"
              stroke="#00ff00"
              strokeWidth="0.4"
              strokeDasharray="3,2"
            />
            {/* Double ring outer - Bright Red */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_DOUBLE_OUT)}
              fill="none"
              stroke="#ff0000"
              strokeWidth="0.4"
            />
            {/* Double ring inner - Bright Red */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_DOUBLE_IN)}
              fill="none"
              stroke="#ff0000"
              strokeWidth="0.4"
            />
            {/* Treble ring outer - Bright Yellow */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_TREBLE_OUT)}
              fill="none"
              stroke="#ffff00"
              strokeWidth="0.4"
            />
            {/* Treble ring inner - Bright Yellow */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_TREBLE_IN)}
              fill="none"
              stroke="#ffff00"
              strokeWidth="0.4"
            />
            {/* Bull outer - Bright Cyan */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_BULL_OUT)}
              fill="none"
              stroke="#00ffff"
              strokeWidth="0.4"
            />
            {/* Bull inner - Bright Cyan */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_BULL_IN)}
              fill="none"
              stroke="#00ffff"
              strokeWidth="0.4"
            />
            {/* Legend text */}
            <text x="2" y="8" fill="#00ff00" fontSize="4" fontWeight="bold">Board Edge (outer red line)</text>
            <text x="2" y="14" fill="#ff0000" fontSize="4" fontWeight="bold">Doubles (outer ring)</text>
            <text x="2" y="20" fill="#ffff00" fontSize="4" fontWeight="bold">Trebles (inner ring)</text>
            <text x="2" y="26" fill="#00ffff" fontSize="4" fontWeight="bold">Bulls</text>
          </svg>
        )}

        {/* Hit marker overlay layer */}
        <div className="absolute inset-0 pointer-events-none">
          {hits.map((hit, index) => {
            const containerSize = 100;

            if (hit.offboard) {
              // Offboard hits: show exactly where the dart missed, just outside the board
              // FLIP Y-AXIS: bot uses Y-up (math), CSS uses Y-down (screen)
              // Calculate direction from center to the miss position
              const angle = Math.atan2(-hit.y, hit.x);

              // Position the miss just outside the board boundary (R_BOARD = 0.85)
              // Scale it slightly beyond the board edge so it's clearly visible as a miss
              const missDistance = 0.95; // Just outside the board (R_BOARD = 0.85, so 0.95 is clearly off)
              const missX = missDistance * Math.cos(angle);
              const missY = missDistance * Math.sin(angle);

              const pixelX = normalizedToPixel(missX, containerSize);
              const pixelY = normalizedToPixel(missY, containerSize);

              return (
                <div
                  key={`hit-${index}`}
                  className="absolute"
                  style={{
                    left: `${pixelX}%`,
                    top: `${pixelY}%`,
                    transform: 'translate(-50%, -50%)',
                    animation: 'dartPop 0.3s ease-out, fadeOut 2.5s ease-out 0.3s forwards',
                  }}
                >
                  <div className="relative w-8 h-8">
                    <div className="absolute inset-0 flex items-center justify-center">
                      {/* Red X marker for misses */}
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <line
                          x1="8"
                          y1="8"
                          x2="24"
                          y2="24"
                          stroke="#ff0000"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        <line
                          x1="8"
                          y1="24"
                          x2="24"
                          y2="8"
                          stroke="#ff0000"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            }

            // On-board hits: map directly to dartboard position
            // FLIP Y-AXIS: bot uses Y-up (math), CSS uses Y-down (screen)
            const pixelX = normalizedToPixel(hit.x, containerSize);
            const pixelY = normalizedToPixel(-hit.y, containerSize);

            return (
              <div
                key={`hit-${index}`}
                className="absolute"
                style={{
                  left: `${pixelX}%`,
                  top: `${pixelY}%`,
                  transform: 'translate(-50%, -50%)',
                  animation: 'dartPop 0.3s ease-out, fadeOut 2.5s ease-out 0.3s forwards',
                }}
              >
                <div className="relative">
                  {/* Enhanced dart hit marker - larger and more visible */}
                  <div
                    className="rounded-full shadow-2xl"
                    style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: '#FFD700',
                      border: '3px solid #FFFFFF',
                      boxShadow: '0 0 12px rgba(255, 215, 0, 0.9), 0 0 20px rgba(255, 215, 0, 0.6)',
                    }}
                  >
                    <div
                      className="rounded-full absolute inset-0 m-auto"
                      style={{
                        width: '10px',
                        height: '10px',
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
        @keyframes dartPop {
          0% {
            transform: translate(-50%, -50%) scale(0.3);
            opacity: 0;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.3);
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
        }

        @keyframes fadeOut {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translate(-50%, -50%) scale(1.05);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
        }
      `}</style>
    </div>
  );
}
