import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { DiningTable, Restaurant } from '@/src/types/domain';
import { buildQrUrl } from '@/src/services/qr/qrService';

/** On-screen QR preview (SVG, crisp at any size). */
export function QrPreview({ restaurant, table, size = 200 }: { restaurant: Restaurant; table: DiningTable; size?: number }) {
  if (!table.qrToken) return null;
  return (
    <QRCodeSVG
      value={buildQrUrl(restaurant, table)}
      size={size}
      level="M"
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#111111"
      title={`QR code for ${table.label}`}
    />
  );
}
