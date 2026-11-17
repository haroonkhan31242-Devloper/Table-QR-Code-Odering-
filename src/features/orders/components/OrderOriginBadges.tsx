import React from 'react';
import { QrCode, ShoppingBag, Store } from 'lucide-react';
import type { Order } from '@/src/types/domain';
import { Badge } from '@/src/components/ui/Display';

/** Shows where an order came from (QR or POS) and whether it is takeaway. */
export function OrderOriginBadges({ order, showQr = false }: { order: Pick<Order, 'source' | 'type'>; showQr?: boolean }) {
  return (
    <>
      {order.type === 'takeaway' && (
        <Badge tone="violet" icon={ShoppingBag}>
          Takeaway
        </Badge>
      )}
      {order.source === 'pos' ? (
        <Badge tone="info" icon={Store}>
          POS
        </Badge>
      ) : (
        showQr && (
          <Badge icon={QrCode}>
            QR
          </Badge>
        )
      )}
    </>
  );
}
