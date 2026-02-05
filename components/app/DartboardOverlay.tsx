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
  // Trimmed PNG: board circle diameter = container size, center = container center
  // Normalized coords (-1..1) map directly to pixels
  const normalizedToPixel = (coord: number, size: number): number => {
    return (coord * 0.5 + 0.5) * size;
  };

  // Convert normalized radius to SVG percentage
  const radiusToPercent = (radius: number): number => {
    return radius * 50; // radius 1.0 = 50% of container
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

        {/* Debug rings overlay - Enhanced visibility */}
        {showDebugRings && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            style={{ mixBlendMode: 'normal', opacity: 0.8 }}
          >
            {/* Board edge (playable area) - Bright Green dashed */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_BOARD)}
              fill="none"
              stroke="#00ff00"
              strokeWidth="0.8"
              strokeDasharray="3,2"
            />
            {/* Double ring outer - Bright Red */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_DOUBLE_OUT)}
              fill="none"
              stroke="#ff0000"
              strokeWidth="0.6"
            />
            {/* Double ring inner - Bright Red */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_DOUBLE_IN)}
              fill="none"
              stroke="#ff0000"
              strokeWidth="0.6"
            />
            {/* Treble ring outer - Bright Yellow */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_TREBLE_OUT)}
              fill="none"
              stroke="#ffff00"
              strokeWidth="0.6"
            />
            {/* Treble ring inner - Bright Yellow */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_TREBLE_IN)}
              fill="none"
              stroke="#ffff00"
              strokeWidth="0.6"
            />
            {/* Bull outer - Bright Cyan */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_BULL_OUT)}
              fill="none"
              stroke="#00ffff"
              strokeWidth="0.6"
            />
            {/* Bull inner - Bright Cyan */}
            <circle
              cx="50"
              cy="50"
              r={radiusToPercent(R_BULL_IN)}
              fill="none"
              stroke="#00ffff"
              strokeWidth="0.6"
            />
            {/* Legend text */}
            <text x="2" y="8" fill="#00ff00" fontSize="4" fontWeight="bold">Board Edge</text>
            <text x="2" y="14" fill="#ff0000" fontSize="4" fontWeight="bold">Doubles</text>
            <text x="2" y="20" fill="#ffff00" fontSize="4" fontWeight="bold">Trebles</text>
            <text x="2" y="26" fill="#00ffff" fontSize="4" fontWeight="bold">Bulls</text>
          </svg>
        )}

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
